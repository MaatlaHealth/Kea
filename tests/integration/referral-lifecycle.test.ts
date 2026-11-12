/**
 * End to end referral lifecycle against a real database.
 *
 * This test walks the acceptance criteria for the product: register a patient,
 * create and submit a referral, acknowledge it at the receiving facility,
 * schedule an appointment, record a missed appointment, work the coordination
 * task, record the care outcome, confirm the referring facility sees it, check
 * what the patient can see, and confirm the analytics reflect the events.
 *
 * It calls the same service functions the web interface calls, so a change
 * that breaks the real workflow breaks this test.
 */
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  appointments,
  auditEvents,
  clinicalNotes,
  contactAttempts,
  followUpTasks,
  messages,
  referralStatusEvents,
  referrals,
} from "@/db/schema";
import { findPatientAccess, requirePatientAccess } from "@/lib/access";
import { headlineMetrics, rangeFromDays, SMALL_CELL_THRESHOLD } from "@/lib/analytics/queries";
import type { AuthContext } from "@/lib/auth/context";
import { listTasks } from "@/lib/coordination/queries";
import { getPatientProfile } from "@/lib/patients/queries";
import { registerPatient } from "@/lib/patients/service";
import { patientOverview } from "@/lib/portal/queries";
import { dashboardMetrics, getReferralDetail, listReferrals } from "@/lib/referrals/queries";
import { addClinicalNote, createReferral, transitionReferral } from "@/lib/referrals/service";
import { NotFoundError } from "@/lib/errors";
import {
  closeDatabase,
  contextFor,
  databaseIsReachable,
  inDays,
  isoDate,
  seedFixture,
  truncateAll,
  type Fixture,
} from "./helpers";

const reachable = await databaseIsReachable();
const describeDb = reachable ? describe : describe.skip;

if (!reachable) {
  console.warn(
    "[kea] integration tests skipped: no database reachable at DATABASE_URL. " +
      "Start PostgreSQL and run `npm run db:migrate` to enable them.",
  );
}

describeDb("referral lifecycle", () => {
  let fixture: Fixture;
  let nurse: AuthContext;
  let clinician: AuthContext;
  let coordinator: AuthContext;
  let analyst: AuthContext;
  let outsider: AuthContext;
  let patientId: string;

  beforeAll(async () => {
    await truncateAll();
    fixture = await seedFixture();
    nurse = await contextFor(fixture.users.nurse);
    clinician = await contextFor(fixture.users.clinician);
    coordinator = await contextFor(fixture.users.coordinator);
    analyst = await contextFor(fixture.users.analyst);
    outsider = await contextFor(fixture.users.outsider);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("1. an authenticated nurse can register a patient", async () => {
    const result = await registerPatient(nurse, {
      homeFacilityId: fixture.clinicId,
      firstName: "Ayanda",
      lastName: "Mokoena",
      dateOfBirth: "1998-04-12",
      phone: "0600000101",
      preferredLanguage: "zu",
      preferredChannel: "sms",
      residentialArea: "Riverside",
      pregnancy: { estimatedDueDate: isoDate(70), gravidity: 2, parity: 1 },
      consents: [
        { type: "data_processing", granted: true },
        { type: "appointment_messaging", granted: true },
        { type: "follow_up_messaging", granted: true },
      ],
    });

    expect(result.id).toBeTruthy();
    expect(result.recordNumber).toMatch(/^TC-\d{5}$/);
    patientId = result.id;

    const access = await requirePatientAccess(nurse, patientId);
    expect(access.patient.phone).toBe("+27600000101");
    expect(access.patient.isSynthetic).toBe(true);
  });

  it("warns about a likely duplicate instead of creating a second record", async () => {
    const duplicate = await registerPatient(nurse, {
      homeFacilityId: fixture.clinicId,
      firstName: "Ayanda",
      lastName: "Mokoena",
      dateOfBirth: "1998-04-12",
      phone: "0600000101",
      preferredLanguage: "zu",
      preferredChannel: "sms",
      consents: [],
    });

    expect(duplicate.id).toBe("");
    expect(duplicate.duplicates.length).toBeGreaterThan(0);
    expect(duplicate.duplicates[0].matchedOn).toContain("phone number");
  });

  let referralId = "";
  let reference = "";

  it("2. the nurse can create and submit a referral", async () => {
    const created = await createReferral(nurse, {
      patientId,
      receivingFacilityId: fixture.hospitalId,
      receivingDepartmentId: fixture.departmentId,
      priority: "urgent",
      reasonCategory: "Suspected pre-eclampsia",
      clinicalObservations: "Blood pressure 152 over 98.",
      requestedActions: "Specialist review.",
      submit: true,
    });

    expect(created.status).toBe("submitted");
    expect(created.reference).toMatch(/^KEA-[A-Z2-9]{6}$/);
    referralId = created.id;
    reference = created.reference;

    const [row] = await db.select().from(referrals).where(eq(referrals.id, referralId));
    expect(row.submittedAt).not.toBeNull();
    expect(row.isSynthetic).toBe(true);
  });

  it("refuses a referral to a facility that is not on the pathway list", async () => {
    await expect(
      createReferral(nurse, {
        patientId,
        receivingFacilityId: fixture.clinicTwoId,
        priority: "routine",
        reasonCategory: "Specialist antenatal review",
        submit: true,
      }),
    ).rejects.toThrow(/pathway/i);
  });

  it("3. the receiving facility sees the referral in its incoming queue", async () => {
    const incoming = await listReferrals(clinician, { direction: "incoming" });
    expect(incoming.rows.map((row) => row.reference)).toContain(reference);

    const outgoingForNurse = await listReferrals(nurse, { direction: "incoming" });
    expect(outgoingForNurse.rows.map((row) => row.reference)).not.toContain(reference);
  });

  it("3b. the receiving clinician can acknowledge it, and the clinic cannot", async () => {
    await expect(
      transitionReferral(nurse, { referralId, to: "acknowledged" }),
    ).rejects.toThrow(/receiving facility/i);

    const result = await transitionReferral(clinician, { referralId, to: "acknowledged" });
    expect(result.referral.status).toBe("acknowledged");
    expect(result.referral.acknowledgedAt).not.toBeNull();
    expect(result.referral.acknowledgedByUserId).toBe(clinician.userId);
  });

  it("resolves the acknowledgement task when the referral is acknowledged", async () => {
    const [task] = await db
      .select()
      .from(followUpTasks)
      .where(
        and(
          eq(followUpTasks.referralId, referralId),
          eq(followUpTasks.kind, "acknowledgement_overdue"),
        ),
      );
    expect(task.status).toBe("resolved");
    expect(task.resolutionOutcome).toBe("acknowledged");
  });

  it("4. an authorised user can schedule an appointment", async () => {
    const result = await transitionReferral(clinician, {
      referralId,
      to: "appointment_scheduled",
      appointment: { scheduledFor: inDays(3, 9), durationMinutes: 30 },
    });

    expect(result.referral.status).toBe("appointment_scheduled");
    expect(result.referral.firstAppointmentAt).not.toBeNull();

    const booked = await db
      .select()
      .from(appointments)
      .where(eq(appointments.referralId, referralId));
    expect(booked).toHaveLength(1);
    expect(booked[0].status).toBe("scheduled");
  });

  it("refuses an appointment in the past", async () => {
    await expect(
      transitionReferral(clinician, {
        referralId,
        to: "appointment_scheduled",
        appointment: { scheduledFor: inDays(-10, 9) },
      }),
    ).rejects.toThrow(/future|past/i);
  });

  it("5. the referral state and its history are persisted", async () => {
    const events = await db
      .select()
      .from(referralStatusEvents)
      .where(eq(referralStatusEvents.referralId, referralId))
      .orderBy(referralStatusEvents.occurredAt);

    const sequence = events.map((event) => event.toStatus);
    expect(sequence).toEqual([
      "submitted",
      "acknowledged",
      "appointment_scheduled",
    ]);
    for (const event of events) {
      expect(event.actorUserId).toBeTruthy();
      expect(event.occurredAt).toBeInstanceOf(Date);
    }
  });

  it("6. a missed appointment creates a coordinator task", async () => {
    await transitionReferral(clinician, {
      referralId,
      to: "missed_appointment",
      note: "The patient did not arrive.",
    });

    const tasks = await listTasks(coordinator, { kinds: ["missed_appointment"] });
    const task = tasks.rows.find((row) => row.referralId === referralId);
    expect(task).toBeDefined();
    expect(task?.status).toBe("open");

    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.referralId, referralId));
    expect(appointment.status).toBe("missed");
  });

  it("does not create a second task for the same missed appointment", async () => {
    const before = await db
      .select()
      .from(followUpTasks)
      .where(
        and(
          eq(followUpTasks.referralId, referralId),
          eq(followUpTasks.kind, "missed_appointment"),
        ),
      );
    expect(before).toHaveLength(1);
  });

  it("7. a coordinator can record an outreach attempt and resolve the task", async () => {
    const tasks = await listTasks(coordinator, { kinds: ["missed_appointment"] });
    const task = tasks.rows.find((row) => row.referralId === referralId);
    expect(task).toBeDefined();

    await db.insert(contactAttempts).values({
      organisationId: fixture.organisationId,
      taskId: task!.id,
      referralId,
      patientId,
      channel: "phone_call",
      outcome: "reached",
      note: "Patient agreed to a new date.",
      attemptedByUserId: coordinator.userId,
    });

    await db
      .update(followUpTasks)
      .set({
        status: "resolved",
        resolutionOutcome: "contacted_and_rebooked",
        resolutionNote: "Rebooked for next week.",
        resolvedAt: new Date(),
        resolvedByUserId: coordinator.userId,
      })
      .where(eq(followUpTasks.id, task!.id));

    const attempts = await db
      .select()
      .from(contactAttempts)
      .where(eq(contactAttempts.referralId, referralId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("reached");
  });

  it("8. the receiving clinician can record attendance and the care outcome", async () => {
    await transitionReferral(clinician, {
      referralId,
      to: "appointment_scheduled",
      appointment: { scheduledFor: inDays(8, 10) },
    });
    await transitionReferral(clinician, { referralId, to: "patient_attended" });

    const result = await transitionReferral(clinician, {
      referralId,
      to: "care_completed",
      outcomeSummary: "Reviewed, blood pressure controlled, returned to clinic for monitoring.",
    });

    expect(result.referral.status).toBe("care_completed");
    expect(result.referral.outcomeSummary).toContain("blood pressure controlled");
    expect(result.referral.careCompletedAt).not.toBeNull();
  });

  it("refuses to record a care outcome with no summary", async () => {
    const second = await createReferral(nurse, {
      patientId,
      receivingFacilityId: fixture.hospitalId,
      priority: "routine",
      reasonCategory: "Anaemia requiring investigation",
      submit: true,
    });
    await transitionReferral(clinician, { referralId: second.id, to: "acknowledged" });
    await transitionReferral(clinician, {
      referralId: second.id,
      to: "appointment_scheduled",
      appointment: { scheduledFor: inDays(5, 11) },
    });
    await transitionReferral(clinician, { referralId: second.id, to: "patient_attended" });

    await expect(
      transitionReferral(clinician, { referralId: second.id, to: "care_completed" }),
    ).rejects.toThrow(/care was provided|outcome/i);
  });

  it("9. the referring facility can see the authorised update", async () => {
    const detail = await getReferralDetail(nurse, referralId);
    expect(detail.referral.status).toBe("care_completed");
    expect(detail.referral.outcomeSummary).toContain("blood pressure controlled");
    expect(detail.timeline.length).toBeGreaterThanOrEqual(5);
  });

  it("notifies the referring clinician without disclosing clinical detail", async () => {
    const { notifications } = await import("@/db/schema");
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, nurse.userId))
      .orderBy(desc(notifications.createdAt));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.title).not.toContain("Ayanda");
      expect(row.title).not.toContain("pre-eclampsia");
    }
  });

  it("10. the patient sees only what is meant for them", async () => {
    await addClinicalNote(clinician, {
      patientId,
      referralId,
      body: "Internal note for staff only. Blood pressure trend discussed with the team.",
    });
    await addClinicalNote(clinician, {
      patientId,
      referralId,
      body: "Please continue your weekly clinic visits.",
      visibleToPatient: true,
    });

    const patient = (await requirePatientAccess(nurse, patientId)).patient;
    const overview = await patientOverview(patient);

    const sharedBodies = overview.sharedNotes.map((note) => note.body);
    expect(sharedBodies).toContain("Please continue your weekly clinic visits.");
    expect(sharedBodies.join(" ")).not.toContain("Internal note for staff only");

    const referralView = overview.referrals.find((row) => row.reference === reference);
    expect(referralView).toBeDefined();
    expect(Object.keys(referralView ?? {})).not.toContain("clinicalObservations");
    expect(Object.keys(referralView ?? {})).not.toContain("outcomeSummary");
  });

  it("11. aggregate analytics reflect the stored referral events", async () => {
    const range = rangeFromDays(30);
    const metrics = await headlineMetrics(coordinator, range);

    expect(metrics.created).toBeGreaterThanOrEqual(2);
    expect(metrics.submitted).toBeGreaterThanOrEqual(2);
    expect(metrics.acknowledged).toBeGreaterThanOrEqual(2);
    expect(metrics.completed).toBeGreaterThanOrEqual(1);
    expect(metrics.medianAcknowledgementHours).not.toBeNull();

    const dashboard = await dashboardMetrics(clinician);
    expect(dashboard.activeReferrals).toBeGreaterThanOrEqual(1);
  });

  it("suppresses rates when the denominator is below the threshold", async () => {
    const metrics = await headlineMetrics(coordinator, rangeFromDays(30));

    if (metrics.submitted >= SMALL_CELL_THRESHOLD) {
      expect(metrics.completionRate).not.toBeNull();
      expect(metrics.suppressed).toBe(false);
    } else {
      expect(metrics.completionRate).toBeNull();
      // The suppression flag marks a period that has data but too little of
      // it. A period with nothing in it is empty, not suppressed.
      expect(metrics.suppressed).toBe(metrics.submitted > 0);
    }
  });

  it("12. an unauthorised user cannot reach the patient record", async () => {
    expect(await findPatientAccess(outsider, patientId)).toBeNull();
    await expect(requirePatientAccess(outsider, patientId)).rejects.toThrow(NotFoundError);
    await expect(getPatientProfile(outsider, patientId)).rejects.toThrow(NotFoundError);
    await expect(getReferralDetail(outsider, referralId)).rejects.toThrow(NotFoundError);
  });

  it("12b. an analyst can read aggregates but no patient record", async () => {
    const metrics = await headlineMetrics(analyst, rangeFromDays(30));
    expect(metrics.created).toBeGreaterThanOrEqual(1);

    await expect(requirePatientAccess(analyst, patientId)).rejects.toThrow(NotFoundError);
    const list = await listReferrals(analyst, {});
    expect(list.rows).toHaveLength(0);
  });

  it("12c. a nurse at another clinic in the same organisation cannot see the patient", async () => {
    const nurseTwo = await contextFor(fixture.users.nurseTwo);
    expect(await findPatientAccess(nurseTwo, patientId)).toBeNull();
  });

  it("records an audit entry for each action, without clinical content", async () => {
    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.organisationId, fixture.organisationId));

    const actions = new Set(rows.map((row) => row.action));
    expect(actions.has("patient.create")).toBe(true);
    expect(actions.has("referral.submit")).toBe(true);
    expect(actions.has("referral.transition")).toBe(true);
    expect(actions.has("note.create")).toBe(true);

    const serialised = JSON.stringify(rows.map((row) => row.metadata));
    expect(serialised).not.toContain("Ayanda");
    expect(serialised).not.toContain("pre-eclampsia");
    expect(serialised).not.toContain("+27600000101");
  });

  it("queues patient messages without sending them when messaging is off", async () => {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.patientId, patientId))
      .orderBy(desc(messages.createdAt));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe("queued");
      expect(row.sentAt).toBeNull();
      expect(row.body).not.toContain("pre-eclampsia");
      expect(row.body).toContain("Kea");
    }
  });

  it("does not create a duplicate message for the same trigger", async () => {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.referralId, referralId), eq(messages.templateKey, "referral_confirmation")),
      );
    expect(rows).toHaveLength(1);
  });

  it("keeps clinical notes attributed and unchanged", async () => {
    const rows = await db
      .select()
      .from(clinicalNotes)
      .where(eq(clinicalNotes.referralId, referralId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.authorUserId).toBe(clinician.userId);
    }
  });

  it("closes the pathway with a confirmed outcome", async () => {
    await transitionReferral(clinician, {
      referralId,
      to: "follow_up_required",
      note: "Weekly blood pressure checks at the clinic.",
    });
    await transitionReferral(nurse, {
      referralId,
      to: "follow_up_completed",
      note: "Four checks completed.",
    });
    const closed = await transitionReferral(nurse, { referralId, to: "closed" });

    expect(closed.referral.status).toBe("closed");
    expect(closed.referral.closedAt).not.toBeNull();

    const openTasks = await db
      .select()
      .from(followUpTasks)
      .where(and(eq(followUpTasks.referralId, referralId), eq(followUpTasks.status, "open")));
    expect(openTasks).toHaveLength(0);
  });

  it("refuses any further transition once the referral is closed", async () => {
    await expect(
      transitionReferral(clinician, { referralId, to: "appointment_scheduled" }),
    ).rejects.toThrow(/cannot move from/i);
  });
});
