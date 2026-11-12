/**
 * Builds the demonstration environment.
 *
 * Run with: npm run seed:demo
 *
 * What this does and does not do
 * ------------------------------
 * - Every facility, member of staff and patient it creates is fictional. The
 *   organisation is marked `demonstration` and every patient row is marked
 *   synthetic, which is what makes the interface label them as fictional.
 * - It does not write referral rows directly. It calls `registerPatient`,
 *   `createReferral` and `transitionReferral`, the same functions the web
 *   interface calls, so the demonstration exercises the real state machine,
 *   the real authorisation checks and the real audit trail. A transition the
 *   product would refuse will fail here too.
 * - It creates no account with a fixed password. Passwords come from
 *   KEA_DEMO_PASSWORD or are generated and printed once.
 * - It refuses to run against an organisation that is not marked as a
 *   demonstration environment.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db, sql } from "../src/db";
import {
  contactAttempts,
  departments,
  escalationPolicies,
  facilities,
  followUpTasks,
  memberships,
  organisations,
  referralPathways,
  users,
  type UserRole,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { registerPatient } from "../src/lib/patients/service";
import { createReferral, transitionReferral } from "../src/lib/referrals/service";
import { contextForUser, log, requireDatabaseUrl } from "./lib/bootstrap";

const ORG_SLUG = "kea-demonstration";
const ORG_NAME = "Kea Demonstration Health Service";

type FacilitySeed = {
  code: string;
  name: string;
  type:
    | "primary_health_clinic"
    | "community_health_centre"
    | "district_hospital"
    | "regional_hospital";
  district: string;
  province: string;
  phone: string;
  latitude: string;
  longitude: string;
  departments: { name: string; serviceType: string }[];
};

/** Fictional facilities. These names do not refer to any real institution. */
const FACILITY_SEEDS: FacilitySeed[] = [
  {
    code: "RVC",
    name: "Riverside Clinic",
    type: "primary_health_clinic",
    district: "Thabelo District",
    province: "Demonstration Province",
    phone: "+27110000101",
    latitude: "-26.204100",
    longitude: "28.047300",
    departments: [{ name: "Antenatal clinic", serviceType: "Antenatal care" }],
  },
  {
    code: "MKC",
    name: "Makole Community Health Centre",
    type: "community_health_centre",
    district: "Thabelo District",
    province: "Demonstration Province",
    phone: "+27110000102",
    latitude: "-26.318200",
    longitude: "27.971500",
    departments: [{ name: "Maternal and child health", serviceType: "Antenatal care" }],
  },
  {
    code: "TDH",
    name: "Thabelo District Hospital",
    type: "district_hospital",
    district: "Thabelo District",
    province: "Demonstration Province",
    phone: "+27110000201",
    latitude: "-26.137800",
    longitude: "28.228400",
    departments: [
      { name: "Obstetrics outpatients", serviceType: "Obstetrics" },
      { name: "Maternal ultrasound", serviceType: "Diagnostic imaging" },
    ],
  },
  {
    code: "NRH",
    name: "Nkosi Regional Hospital",
    type: "regional_hospital",
    district: "Nkosi Metro",
    province: "Demonstration Province",
    phone: "+27110000301",
    latitude: "-25.746700",
    longitude: "28.187800",
    departments: [
      { name: "High risk obstetrics", serviceType: "Specialist obstetrics" },
      { name: "Fetal medicine", serviceType: "Specialist obstetrics" },
    ],
  },
];

type StaffSeed = {
  key: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  facilityCode: string | null;
};

const STAFF_SEEDS: StaffSeed[] = [
  {
    key: "orgAdmin",
    email: "demo.admin@kea.invalid",
    fullName: "Lerato Dube",
    jobTitle: "Programme manager",
    role: "organisation_admin",
    facilityCode: null,
  },
  {
    key: "nurse",
    email: "demo.nurse@kea.invalid",
    fullName: "Nomsa Molefe",
    jobTitle: "Midwife",
    role: "nurse_midwife",
    facilityCode: "RVC",
  },
  {
    key: "nurse2",
    email: "demo.nurse2@kea.invalid",
    fullName: "Thandi Khumalo",
    jobTitle: "Professional nurse",
    role: "nurse_midwife",
    facilityCode: "MKC",
  },
  {
    key: "clinician",
    email: "demo.clinician@kea.invalid",
    fullName: "Dr Sipho Nkosi",
    jobTitle: "Medical officer",
    role: "receiving_clinician",
    facilityCode: "TDH",
  },
  {
    key: "clinician2",
    email: "demo.specialist@kea.invalid",
    fullName: "Dr Amina Patel",
    jobTitle: "Obstetrician",
    role: "receiving_clinician",
    facilityCode: "NRH",
  },
  {
    key: "coordinator",
    email: "demo.coordinator@kea.invalid",
    fullName: "Grace Mahlangu",
    jobTitle: "Referral coordinator",
    role: "referral_coordinator",
    facilityCode: null,
  },
  {
    key: "analyst",
    email: "demo.analyst@kea.invalid",
    fullName: "Kagiso Sithole",
    jobTitle: "District information officer",
    role: "programme_analyst",
    facilityCode: null,
  },
];

type PatientSeed = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  language: string;
  area: string;
  facilityCode: string;
  dueInWeeks: number;
  gravidity: number;
  parity: number;
};

/** Fictional patients. Numbers use the reserved test range. */
const PATIENT_SEEDS: PatientSeed[] = [
  {
    firstName: "Ayanda",
    lastName: "Mokoena",
    dateOfBirth: "1998-04-12",
    phone: "+27600000101",
    language: "zu",
    area: "Riverside Extension 4",
    facilityCode: "RVC",
    dueInWeeks: 9,
    gravidity: 2,
    parity: 1,
  },
  {
    firstName: "Beauty",
    lastName: "Ncube",
    dateOfBirth: "2005-11-02",
    phone: "+27600000102",
    language: "en",
    area: "Makole Village",
    facilityCode: "MKC",
    dueInWeeks: 14,
    gravidity: 1,
    parity: 0,
  },
  {
    firstName: "Chantal",
    lastName: "Adams",
    dateOfBirth: "1992-07-23",
    phone: "+27600000103",
    language: "af",
    area: "Riverside Central",
    facilityCode: "RVC",
    dueInWeeks: 5,
    gravidity: 3,
    parity: 2,
  },
  {
    firstName: "Dimakatso",
    lastName: "Seleka",
    dateOfBirth: "2001-01-30",
    phone: "+27600000104",
    language: "st",
    area: "Makole Extension 2",
    facilityCode: "MKC",
    dueInWeeks: 22,
    gravidity: 1,
    parity: 0,
  },
  {
    firstName: "Esther",
    lastName: "Van Wyk",
    dateOfBirth: "1989-09-14",
    phone: "+27600000105",
    language: "en",
    area: "Riverside North",
    facilityCode: "RVC",
    dueInWeeks: 3,
    gravidity: 4,
    parity: 3,
  },
  {
    firstName: "Fikile",
    lastName: "Zwane",
    dateOfBirth: "2003-06-08",
    phone: "+27600000106",
    language: "zu",
    area: "Thabelo Township",
    facilityCode: "RVC",
    dueInWeeks: 17,
    gravidity: 2,
    parity: 0,
  },
  {
    firstName: "Gugu",
    lastName: "Maseko",
    dateOfBirth: "1996-12-19",
    phone: "+27600000107",
    language: "xh",
    area: "Makole South",
    facilityCode: "MKC",
    dueInWeeks: 11,
    gravidity: 2,
    parity: 1,
  },
  {
    firstName: "Hope",
    lastName: "Chauke",
    dateOfBirth: "2006-03-27",
    phone: "+27600000108",
    language: "ts",
    area: "Riverside Extension 7",
    facilityCode: "RVC",
    dueInWeeks: 26,
    gravidity: 1,
    parity: 0,
  },
];

function isoDateInWeeks(weeks: number): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function futureDateTime(daysAhead: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function generatePassword(): string {
  return `${randomBytes(9).toString("base64url")}-${randomBytes(6).toString("base64url")}`;
}

async function main() {
  requireDatabaseUrl();

  const suppliedPassword = process.env.KEA_DEMO_PASSWORD;
  const password = suppliedPassword ?? generatePassword();
  const passwordHash = await hashPassword(password);

  /* ---------------------------- Organisation ---------------------------- */

  const [existingOrg] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, ORG_SLUG))
    .limit(1);

  if (existingOrg && existingOrg.environment !== "demonstration") {
    throw new Error(
      `The organisation "${ORG_SLUG}" exists but is not marked as a demonstration environment. Refusing to seed synthetic data into it.`,
    );
  }

  const organisationId =
    existingOrg?.id ??
    (
      await db
        .insert(organisations)
        .values({
          name: ORG_NAME,
          slug: ORG_SLUG,
          environment: "demonstration",
          isSynthetic: true,
        })
        .returning({ id: organisations.id })
    )[0].id;

  log(`Demonstration organisation ready: ${ORG_NAME}`);

  /* ------------------------------ Facilities ----------------------------- */

  const facilityIdByCode = new Map<string, string>();

  for (const seed of FACILITY_SEEDS) {
    const [existing] = await db
      .select({ id: facilities.id })
      .from(facilities)
      .where(and(eq(facilities.organisationId, organisationId), eq(facilities.code, seed.code)))
      .limit(1);

    const facilityId =
      existing?.id ??
      (
        await db
          .insert(facilities)
          .values({
            organisationId,
            name: seed.name,
            code: seed.code,
            type: seed.type,
            district: seed.district,
            province: seed.province,
            phone: seed.phone,
            latitude: seed.latitude,
            longitude: seed.longitude,
          })
          .returning({ id: facilities.id })
      )[0].id;

    facilityIdByCode.set(seed.code, facilityId);

    for (const department of seed.departments) {
      await db
        .insert(departments)
        .values({
          facilityId,
          name: department.name,
          serviceType: department.serviceType,
        })
        .onConflictDoNothing();
    }
  }

  log(`Facilities ready: ${FACILITY_SEEDS.length}`);

  /* ------------------------------ Pathways ------------------------------- */

  const PATHWAYS: [string, string][] = [
    ["RVC", "TDH"],
    ["RVC", "NRH"],
    ["MKC", "TDH"],
    ["MKC", "NRH"],
    ["TDH", "NRH"],
  ];

  for (const [from, to] of PATHWAYS) {
    await db
      .insert(referralPathways)
      .values({
        organisationId,
        referringFacilityId: facilityIdByCode.get(from) as string,
        receivingFacilityId: facilityIdByCode.get(to) as string,
      })
      .onConflictDoNothing();
  }

  log(`Referral pathways ready: ${PATHWAYS.length}`);

  /* -------------------------- Escalation policy -------------------------- */

  const [existingPolicy] = await db
    .select({ id: escalationPolicies.id })
    .from(escalationPolicies)
    .where(eq(escalationPolicies.organisationId, organisationId))
    .limit(1);

  if (!existingPolicy) {
    await db.insert(escalationPolicies).values({
      organisationId,
      facilityId: null,
      acknowledgementDueHours: 48,
      urgentAcknowledgementDueHours: 6,
      missedAppointmentGraceHours: 24,
      followUpDueDays: 14,
      contactAttemptsBeforeEscalation: 3,
      appointmentReminderLeadHours: 48,
    });
  }

  /* -------------------------------- Staff -------------------------------- */

  const userIdByKey = new Map<string, string>();

  for (const seed of STAFF_SEEDS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seed.email))
      .limit(1);

    const userId =
      existing?.id ??
      (
        await db
          .insert(users)
          .values({
            email: seed.email,
            fullName: seed.fullName,
            jobTitle: seed.jobTitle,
            passwordHash,
            status: "active",
            emailVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
          })
          .returning({ id: users.id })
      )[0].id;

    if (existing) {
      await db
        .update(users)
        .set({ passwordHash, status: "active", passwordChangedAt: new Date() })
        .where(eq(users.id, userId));
    }

    await db
      .insert(memberships)
      .values({
        userId,
        organisationId,
        facilityId: seed.facilityCode ? (facilityIdByCode.get(seed.facilityCode) as string) : null,
        role: seed.role,
      })
      .onConflictDoNothing();

    userIdByKey.set(seed.key, userId);
  }

  log(`Staff accounts ready: ${STAFF_SEEDS.length}`);

  /* ------------------------------ Contexts ------------------------------- */

  const nurse = await contextForUser(userIdByKey.get("nurse") as string);
  const nurse2 = await contextForUser(userIdByKey.get("nurse2") as string);
  const clinician = await contextForUser(userIdByKey.get("clinician") as string);
  const specialist = await contextForUser(userIdByKey.get("clinician2") as string);
  const coordinator = await contextForUser(userIdByKey.get("coordinator") as string);

  /* ------------------------------- Patients ------------------------------ */

  const patientIds: string[] = [];

  for (const seed of PATIENT_SEEDS) {
    const actor = seed.facilityCode === "RVC" ? nurse : nurse2;
    const facilityId = facilityIdByCode.get(seed.facilityCode) as string;

    const result = await registerPatient(actor, {
      homeFacilityId: facilityId,
      firstName: seed.firstName,
      lastName: seed.lastName,
      dateOfBirth: seed.dateOfBirth,
      phone: seed.phone,
      preferredLanguage: seed.language,
      preferredChannel: "sms",
      residentialArea: seed.area,
      notes: null,
      pregnancy: {
        estimatedDueDate: isoDateInWeeks(seed.dueInWeeks),
        gravidity: seed.gravidity,
        parity: seed.parity,
        bookingDate: isoDateInWeeks(-6),
      },
      consents: [
        { type: "data_processing", granted: true, method: "Verbal consent at booking visit" },
        {
          type: "appointment_messaging",
          granted: true,
          method: "Verbal consent at booking visit",
        },
        { type: "follow_up_messaging", granted: true, method: "Verbal consent at booking visit" },
      ],
      acknowledgedDuplicates: true,
    });

    if (result.id) patientIds.push(result.id);
  }

  log(`Synthetic patients registered: ${patientIds.length}`);

  if (patientIds.length < 8) {
    log("Patients already existed from a previous run. Skipping referral creation.");
    log("Drop and recreate the demonstration organisation to rebuild the full scenario.");
    await sql.end();
    return;
  }

  /* ------------------------------ Referrals ------------------------------ */

  const district = facilityIdByCode.get("TDH") as string;
  const regional = facilityIdByCode.get("NRH") as string;

  // 1. A complete pathway, closed with a confirmed outcome.
  const complete = await createReferral(nurse, {
    patientId: patientIds[0],
    receivingFacilityId: district,
    priority: "urgent",
    reasonCategory: "Suspected pre-eclampsia",
    reasonDetail: "Blood pressure 152 over 98 at routine visit, trace proteinuria.",
    clinicalObservations: "Gestation 31 weeks. No headache or visual disturbance reported.",
    requestedActions: "Specialist review and repeat investigations.",
    submit: true,
  });
  await transitionReferral(clinician, { referralId: complete.id, to: "acknowledged" });
  // The service refuses an appointment in the past, which is correct, so the
  // demonstration books a near future slot and then records attendance on it.
  await transitionReferral(clinician, {
    referralId: complete.id,
    to: "appointment_scheduled",
    appointment: { scheduledFor: futureDateTime(1, 9), durationMinutes: 30 },
  });
  await transitionReferral(clinician, { referralId: complete.id, to: "patient_attended" });
  await transitionReferral(clinician, {
    referralId: complete.id,
    to: "care_completed",
    outcomeSummary:
      "Reviewed by the obstetric team. Blood pressure controlled, investigations within range. Returned to clinic for weekly monitoring.",
  });
  await transitionReferral(clinician, {
    referralId: complete.id,
    to: "follow_up_required",
    note: "Weekly blood pressure check at the clinic for four weeks.",
  });
  await transitionReferral(nurse, {
    referralId: complete.id,
    to: "follow_up_completed",
    note: "Four weekly checks completed, all within range.",
  });
  await transitionReferral(nurse, { referralId: complete.id, to: "closed" });

  // 2. A referral awaiting acknowledgement, so the inbox is not empty.
  await createReferral(nurse2, {
    patientId: patientIds[1],
    receivingFacilityId: district,
    priority: "routine",
    reasonCategory: "Anaemia requiring investigation",
    reasonDetail: "Haemoglobin 8.9 at booking.",
    clinicalObservations: "Gestation 26 weeks. Started on oral iron.",
    requestedActions: "Investigate cause and advise on management.",
    submit: true,
  });

  // 3. Acknowledged, appointment booked, awaiting the visit.
  const booked = await createReferral(nurse, {
    patientId: patientIds[2],
    receivingFacilityId: regional,
    priority: "urgent",
    reasonCategory: "Abnormal ultrasound finding",
    clinicalObservations: "Gestation 35 weeks. Growth below the expected centile.",
    requestedActions: "Fetal medicine assessment.",
    submit: true,
  });
  await transitionReferral(specialist, { referralId: booked.id, to: "acknowledged" });
  await transitionReferral(specialist, {
    referralId: booked.id,
    to: "appointment_scheduled",
    appointment: { scheduledFor: futureDateTime(4, 10), durationMinutes: 45 },
  });

  // 4. A missed appointment that produced a coordination task.
  const missed = await createReferral(nurse2, {
    patientId: patientIds[3],
    receivingFacilityId: district,
    priority: "routine",
    reasonCategory: "Specialist antenatal review",
    clinicalObservations: "Gestation 18 weeks. Previous caesarean section.",
    submit: true,
  });
  await transitionReferral(clinician, { referralId: missed.id, to: "acknowledged" });
  await transitionReferral(clinician, {
    referralId: missed.id,
    to: "appointment_scheduled",
    appointment: { scheduledFor: futureDateTime(2, 11), durationMinutes: 30 },
  });
  await transitionReferral(clinician, {
    referralId: missed.id,
    to: "missed_appointment",
    note: "The patient did not arrive for the booked slot.",
  });

  const [missedTask] = await db
    .select({ id: followUpTasks.id, patientId: followUpTasks.patientId })
    .from(followUpTasks)
    .where(and(eq(followUpTasks.referralId, missed.id), eq(followUpTasks.kind, "missed_appointment")))
    .limit(1);

  if (missedTask) {
    await db
      .update(followUpTasks)
      .set({ assignedToUserId: coordinator.userId, status: "in_progress" })
      .where(eq(followUpTasks.id, missedTask.id));

    await db.insert(contactAttempts).values([
      {
        organisationId,
        taskId: missedTask.id,
        referralId: missed.id,
        patientId: missedTask.patientId,
        channel: "phone_call",
        outcome: "no_answer",
        note: "Called twice in the morning, no answer.",
        attemptedByUserId: coordinator.userId,
      },
      {
        organisationId,
        taskId: missedTask.id,
        referralId: missed.id,
        patientId: missedTask.patientId,
        channel: "phone_call",
        outcome: "reached",
        note: "Patient was away for work. Agreed to a new date next week.",
        attemptedByUserId: coordinator.userId,
      },
    ]);
  }

  await transitionReferral(clinician, {
    referralId: missed.id,
    to: "appointment_scheduled",
    appointment: { scheduledFor: futureDateTime(9, 9), durationMinutes: 30 },
  });

  // 5. A rejected referral, so the exception path is visible.
  const rejected = await createReferral(nurse, {
    patientId: patientIds[4],
    receivingFacilityId: regional,
    priority: "routine",
    reasonCategory: "Gestational diabetes",
    clinicalObservations: "Gestation 37 weeks. Diet controlled.",
    submit: true,
  });
  await transitionReferral(specialist, {
    referralId: rejected.id,
    to: "rejected",
    reason:
      "Diet controlled gestational diabetes at this gestation is managed at district level. Please refer to Thabelo District Hospital.",
  });

  // 6. An escalated referral for the coordinator queue.
  const escalated = await createReferral(nurse, {
    patientId: patientIds[5],
    receivingFacilityId: district,
    priority: "urgent",
    reasonCategory: "Reduced fetal movement",
    clinicalObservations: "Gestation 30 weeks. Reported reduced movement over two days.",
    submit: true,
  });
  await transitionReferral(clinician, { referralId: escalated.id, to: "acknowledged" });
  await transitionReferral(coordinator, {
    referralId: escalated.id,
    to: "escalated",
    note: "No appointment offered within the agreed window. Raised with the hospital coordinator.",
  });

  // 7. A draft, so the draft state is represented.
  await createReferral(nurse2, {
    patientId: patientIds[6],
    receivingFacilityId: district,
    priority: "routine",
    reasonCategory: "Multiple pregnancy",
    clinicalObservations: "Twin pregnancy confirmed on ultrasound at 20 weeks.",
    submit: false,
  });

  // 8. A referral that reached care completed and is awaiting closure.
  const awaitingClosure = await createReferral(nurse, {
    patientId: patientIds[7],
    receivingFacilityId: district,
    priority: "routine",
    reasonCategory: "Previous caesarean section assessment",
    clinicalObservations: "Gestation 14 weeks. One previous lower segment caesarean section.",
    submit: true,
  });
  await transitionReferral(clinician, { referralId: awaitingClosure.id, to: "acknowledged" });
  await transitionReferral(clinician, {
    referralId: awaitingClosure.id,
    to: "appointment_scheduled",
    appointment: { scheduledFor: futureDateTime(3, 14), durationMinutes: 30 },
  });
  await transitionReferral(clinician, { referralId: awaitingClosure.id, to: "patient_attended" });
  await transitionReferral(clinician, {
    referralId: awaitingClosure.id,
    to: "care_completed",
    outcomeSummary:
      "Mode of delivery discussed and planned. Routine antenatal care to continue at the clinic.",
  });

  log("Referral scenarios created through the real workflow service.");
  log("");
  log("Demonstration accounts");
  log("----------------------");
  for (const seed of STAFF_SEEDS) {
    log(`  ${seed.email.padEnd(32)} ${seed.fullName} (${seed.role})`);
  }
  log("");
  if (suppliedPassword) {
    log("Password: as supplied in KEA_DEMO_PASSWORD");
  } else {
    log(`Password for every demonstration account: ${password}`);
    log("This is printed once and is not stored anywhere else.");
  }
  log("");
  log("Patient portal: sign in at /portal/sign-in with one of the fictional numbers,");
  log("for example +27600000101. The one time code is sent by SMS, so this needs");
  log("messaging credentials. Without them the code is recorded in the messages table");
  log("with status queued and can be read from there in a demonstration environment.");
  log("");
  log("Every patient record created here is synthetic and is labelled as fictional in");
  log("the interface. Do not enter real patient information in this organisation.");

  await sql.end();
}

main().catch(async (error) => {
  console.error("Demonstration seed failed:", error);
  await sql.end().catch(() => {});
  process.exit(1);
});
