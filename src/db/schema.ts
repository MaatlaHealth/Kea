/**
 * Kea database schema.
 *
 * Design notes
 * ------------
 * - Every clinical row carries both `organisationId` and a facility reference so
 *   authorisation can be enforced with indexed predicates rather than joins.
 * - Status changes are never destructive: the current status lives on the parent
 *   row for query speed and the full history lives in an append only event table.
 * - Tables that accept external input (messages, webhooks) carry idempotency keys.
 * - Patient identifying data is kept out of audit payloads and analytics tables.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*                                   Enums                                    */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", [
  "platform_admin",
  "organisation_admin",
  "facility_admin",
  "nurse_midwife",
  "receiving_clinician",
  "referral_coordinator",
  "programme_analyst",
]);

export const userStatusEnum = pgEnum("user_status", [
  "invited",
  "active",
  "suspended",
  "deactivated",
]);

export const facilityTypeEnum = pgEnum("facility_type", [
  "primary_health_clinic",
  "community_health_centre",
  "district_hospital",
  "regional_hospital",
  "tertiary_hospital",
  "specialist_unit",
]);

export const environmentEnum = pgEnum("environment_kind", ["live", "demonstration"]);

export const communicationChannelEnum = pgEnum("communication_channel", [
  "sms",
  "whatsapp",
  "voice_callback",
  "none",
]);

export const referralStatusEnum = pgEnum("referral_status", [
  "draft",
  "submitted",
  "received",
  "acknowledged",
  "appointment_scheduled",
  "patient_attended",
  "care_completed",
  "follow_up_required",
  "follow_up_completed",
  "closed",
  "rejected",
  "cancelled",
  "missed_appointment",
  "unable_to_contact",
  "escalated",
]);

export const referralPriorityEnum = pgEnum("referral_priority", [
  "routine",
  "urgent",
  "emergency",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "rescheduled",
  "attended",
  "missed",
  "cancelled",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["outbound", "inbound"]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "undeliverable",
  "suppressed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "resolved",
  "cancelled",
]);

export const taskKindEnum = pgEnum("task_kind", [
  "acknowledgement_overdue",
  "missed_appointment",
  "follow_up_due",
  "communication_failure",
  "manual_review",
  "clinical_follow_up",
]);

export const contactOutcomeEnum = pgEnum("contact_outcome", [
  "reached",
  "no_answer",
  "wrong_number",
  "voicemail",
  "message_sent",
  "refused",
  "other",
]);

export const consentTypeEnum = pgEnum("consent_type", [
  "data_processing",
  "appointment_messaging",
  "follow_up_messaging",
  "third_party_sharing",
]);

export const consentStatusEnum = pgEnum("consent_status", ["granted", "withdrawn", "not_asked"]);

export const encounterKindEnum = pgEnum("encounter_kind", [
  "antenatal_screening",
  "antenatal_visit",
  "clinical_review",
  "admission",
  "discharge",
  "postnatal_visit",
  "other",
]);

export const pilotEnquiryStatusEnum = pgEnum("pilot_enquiry_status", [
  "new",
  "in_review",
  "contacted",
  "declined",
  "archived",
]);

export const modelStatusEnum = pgEnum("model_status", [
  "experimental",
  "shadow",
  "active",
  "retired",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "referral_submitted",
  "referral_acknowledged",
  "referral_rejected",
  "appointment_scheduled",
  "appointment_missed",
  "care_completed",
  "task_assigned",
  "escalation_raised",
]);

/** Raw binary column used for stored document contents. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* -------------------------------------------------------------------------- */
/*                         Organisations and facilities                       */
/* -------------------------------------------------------------------------- */

export const organisations = pgTable(
  "organisations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("ZA"),
    environment: environmentEnum("environment").notNull().default("live"),
    /** When true, every patient record under this organisation is synthetic. */
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organisations_slug_key").on(t.slug)],
);

export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    type: facilityTypeEnum("type").notNull(),
    district: varchar("district", { length: 120 }),
    province: varchar("province", { length: 120 }),
    addressLine: varchar("address_line", { length: 240 }),
    /** Facility coordinates. Used only to estimate referral travel distance. */
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    phone: varchar("phone", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("facilities_org_code_key").on(t.organisationId, t.code),
    index("facilities_org_idx").on(t.organisationId),
  ],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    serviceType: varchar("service_type", { length: 80 }).notNull(),
    acceptsReferrals: boolean("accepts_referrals").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("departments_facility_name_key").on(t.facilityId, t.name),
    index("departments_facility_idx").on(t.facilityId),
  ],
);

/** Which facilities a given facility is permitted to refer to. */
export const referralPathways = pgTable(
  "referral_pathways",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    referringFacilityId: uuid("referring_facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    receivingFacilityId: uuid("receiving_facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_pathways_pair_key").on(t.referringFacilityId, t.receivingFacilityId),
    index("referral_pathways_receiving_idx").on(t.receivingFacilityId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                           Users and access control                         */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    jobTitle: varchar("job_title", { length: 120 }),
    phone: varchar("phone", { length: 32 }),
    status: userStatusEnum("status").notNull().default("invited"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    mfaSecret: text("mfa_secret"),
    mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

/**
 * Role assignment. A membership with a null facility grants the role across the
 * whole organisation; otherwise it is scoped to one facility.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memberships_user_idx").on(t.userId),
    index("memberships_org_idx").on(t.organisationId),
    index("memberships_facility_idx").on(t.facilityId),
    uniqueIndex("memberships_unique_scope")
      .on(t.userId, t.organisationId, t.facilityId, t.role)
      .where(sql`facility_id is not null`),
    uniqueIndex("memberships_unique_org_scope")
      .on(t.userId, t.organisationId, t.role)
      .where(sql`facility_id is null`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque session token. The raw token is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    mfaSatisfiedAt: timestamp("mfa_satisfied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_key").on(t.tokenHash),
    index("invitations_email_idx").on(t.email),
    index("invitations_org_idx").on(t.organisationId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                  Patients                                  */
/* -------------------------------------------------------------------------- */

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    /** Facility that holds the primary record for this patient. */
    homeFacilityId: uuid("home_facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    /** Human readable record number, unique within the organisation. */
    recordNumber: varchar("record_number", { length: 40 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dateOfBirth: date("date_of_birth"),
    phone: varchar("phone", { length: 32 }),
    alternatePhone: varchar("alternate_phone", { length: 32 }),
    preferredLanguage: varchar("preferred_language", { length: 12 }).notNull().default("en"),
    preferredChannel: communicationChannelEnum("preferred_channel").notNull().default("sms"),
    /** Free text locality used for travel context. No precise home coordinates are stored. */
    residentialArea: varchar("residential_area", { length: 160 }),
    emergencyContactName: varchar("emergency_contact_name", { length: 160 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 32 }),
    notes: text("notes"),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    mergedIntoPatientId: uuid("merged_into_patient_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("patients_org_record_number_key").on(t.organisationId, t.recordNumber),
    index("patients_org_idx").on(t.organisationId),
    index("patients_home_facility_idx").on(t.homeFacilityId),
    index("patients_name_idx").on(t.lastName, t.firstName),
    index("patients_phone_idx").on(t.phone),
  ],
);

/**
 * Additional identifiers (for example a facility file number). National
 * identity numbers are intentionally not part of the default schema: a
 * deployment that needs one must add it under its own legal basis.
 */
export const patientIdentifiers = pgTable(
  "patient_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    system: varchar("system", { length: 60 }).notNull(),
    value: varchar("value", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patient_identifiers_unique").on(t.organisationId, t.system, t.value),
    index("patient_identifiers_patient_idx").on(t.patientId),
  ],
);

export const patientRecordChanges = pgTable(
  "patient_record_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Field names only, never values, so this history is safe to read widely. */
    changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
    reason: varchar("reason", { length: 240 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("patient_record_changes_patient_idx").on(t.patientId, t.createdAt)],
);

export const pregnancyEpisodes = pgTable(
  "pregnancy_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    estimatedDueDate: date("estimated_due_date"),
    lastMenstrualPeriod: date("last_menstrual_period"),
    gravidity: smallint("gravidity"),
    parity: smallint("parity"),
    bookingDate: date("booking_date"),
    isActive: boolean("is_active").notNull().default(true),
    outcomeRecordedAt: timestamp("outcome_recorded_at", { withTimezone: true }),
    outcomeSummary: varchar("outcome_summary", { length: 240 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pregnancy_episodes_patient_idx").on(t.patientId),
    uniqueIndex("pregnancy_episodes_one_active")
      .on(t.patientId)
      .where(sql`is_active = true`),
  ],
);

export const encounters = pgTable(
  "encounters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    pregnancyEpisodeId: uuid("pregnancy_episode_id").references(() => pregnancyEpisodes.id, {
      onDelete: "set null",
    }),
    kind: encounterKindEnum("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    summary: varchar("summary", { length: 300 }).notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("encounters_patient_idx").on(t.patientId, t.occurredAt),
    index("encounters_facility_idx").on(t.facilityId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                  Consent                                   */
/* -------------------------------------------------------------------------- */

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    type: consentTypeEnum("type").notNull(),
    status: consentStatusEnum("status").notNull(),
    capturedByUserId: uuid("captured_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    /** How consent was obtained, for example "verbal at booking visit". */
    method: varchar("method", { length: 120 }),
    notes: varchar("notes", { length: 300 }),
  },
  (t) => [index("consent_records_patient_type_idx").on(t.patientId, t.type, t.capturedAt)],
);

/* -------------------------------------------------------------------------- */
/*                                 Referrals                                  */
/* -------------------------------------------------------------------------- */

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human readable reference, for example KEA-7F3K2Q. */
    reference: varchar("reference", { length: 24 }).notNull(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    pregnancyEpisodeId: uuid("pregnancy_episode_id").references(() => pregnancyEpisodes.id, {
      onDelete: "set null",
    }),
    referringFacilityId: uuid("referring_facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    receivingFacilityId: uuid("receiving_facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    receivingDepartmentId: uuid("receiving_department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    status: referralStatusEnum("status").notNull().default("draft"),
    priority: referralPriorityEnum("priority").notNull().default("routine"),
    reasonCategory: varchar("reason_category", { length: 80 }).notNull(),
    reasonDetail: text("reason_detail"),
    clinicalObservations: text("clinical_observations"),
    requestedActions: text("requested_actions"),
    requestedDate: date("requested_date"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedCoordinatorId: uuid("assigned_coordinator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    firstAppointmentAt: timestamp("first_appointment_at", { withTimezone: true }),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    careCompletedAt: timestamp("care_completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    outcomeSummary: text("outcome_summary"),
    rejectionReason: varchar("rejection_reason", { length: 300 }),
    cancellationReason: varchar("cancellation_reason", { length: 300 }),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referrals_reference_key").on(t.reference),
    index("referrals_org_status_idx").on(t.organisationId, t.status),
    index("referrals_receiving_status_idx").on(t.receivingFacilityId, t.status),
    index("referrals_referring_status_idx").on(t.referringFacilityId, t.status),
    index("referrals_patient_idx").on(t.patientId, t.createdAt),
    index("referrals_coordinator_idx").on(t.assignedCoordinatorId),
    index("referrals_created_at_idx").on(t.createdAt),
  ],
);

export const referralStatusEvents = pgTable(
  "referral_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    fromStatus: referralStatusEnum("from_status"),
    toStatus: referralStatusEnum("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Set when the transition was produced by a scheduled job rather than a person. */
    actorSystem: varchar("actor_system", { length: 60 }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "set null" }),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("referral_status_events_referral_idx").on(t.referralId, t.occurredAt),
    index("referral_status_events_org_idx").on(t.organisationId, t.occurredAt),
    index("referral_status_events_to_status_idx").on(t.toStatus, t.occurredAt),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    locationNote: varchar("location_note", { length: 200 }),
    scheduledByUserId: uuid("scheduled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    attendanceRecordedAt: timestamp("attendance_recorded_at", { withTimezone: true }),
    attendanceRecordedByUserId: uuid("attendance_recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    supersededByAppointmentId: uuid("superseded_by_appointment_id"),
    patientConfirmedAt: timestamp("patient_confirmed_at", { withTimezone: true }),
    patientAssistanceRequestedAt: timestamp("patient_assistance_requested_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_referral_idx").on(t.referralId),
    index("appointments_facility_date_idx").on(t.facilityId, t.scheduledFor),
    index("appointments_status_date_idx").on(t.status, t.scheduledFor),
    index("appointments_patient_idx").on(t.patientId, t.scheduledFor),
  ],
);

export const clinicalNotes = pgTable(
  "clinical_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    /** True when the text originated from an AI draft that a clinician then approved. */
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    /** Staff only notes are never shown in the patient portal. */
    visibleToPatient: boolean("visible_to_patient").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("clinical_notes_patient_idx").on(t.patientId, t.createdAt),
    index("clinical_notes_referral_idx").on(t.referralId, t.createdAt),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 240 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    /** Opaque storage key. Access is always brokered by the server. */
    storageKey: varchar("storage_key", { length: 400 }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_referral_idx").on(t.referralId),
    index("documents_patient_idx").on(t.patientId),
    uniqueIndex("documents_storage_key_key").on(t.storageKey),
  ],
);

/**
 * Document contents.
 *
 * Attachments are stored in the database rather than on a local disk so that a
 * serverless deployment keeps them, they are covered by the same backup and
 * retention policy as the clinical record, and every read goes through the
 * same authorisation path. A deployment that needs object storage can add an
 * adapter behind `lib/storage` without changing the referral code.
 */
export const documentBlobs = pgTable("document_blobs", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});

/* -------------------------------------------------------------------------- */
/*                        Coordination tasks and escalation                   */
/* -------------------------------------------------------------------------- */

export const escalationPolicies = pgTable(
  "escalation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "cascade" }),
    acknowledgementDueHours: integer("acknowledgement_due_hours").notNull().default(48),
    urgentAcknowledgementDueHours: integer("urgent_acknowledgement_due_hours")
      .notNull()
      .default(6),
    missedAppointmentGraceHours: integer("missed_appointment_grace_hours").notNull().default(24),
    followUpDueDays: integer("follow_up_due_days").notNull().default(14),
    contactAttemptsBeforeEscalation: integer("contact_attempts_before_escalation")
      .notNull()
      .default(3),
    appointmentReminderLeadHours: integer("appointment_reminder_lead_hours").notNull().default(48),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("escalation_policies_org_facility_key").on(t.organisationId, t.facilityId),
    uniqueIndex("escalation_policies_org_default_key")
      .on(t.organisationId)
      .where(sql`facility_id is null`),
  ],
);

export const followUpTasks = pgTable(
  "follow_up_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    /** Facility responsible for working the task. */
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    kind: taskKindEnum("kind").notNull(),
    status: taskStatusEnum("status").notNull().default("open"),
    title: varchar("title", { length: 200 }).notNull(),
    detail: text("detail"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBySystem: varchar("created_by_system", { length: 60 }),
    /** Prevents duplicate automatic tasks for the same trigger. */
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    resolutionOutcome: varchar("resolution_outcome", { length: 80 }),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("follow_up_tasks_dedupe_key").on(t.dedupeKey).where(sql`dedupe_key is not null`),
    index("follow_up_tasks_facility_status_idx").on(t.facilityId, t.status, t.dueAt),
    index("follow_up_tasks_assignee_idx").on(t.assignedToUserId, t.status),
    index("follow_up_tasks_referral_idx").on(t.referralId),
  ],
);

export const contactAttempts = pgTable(
  "contact_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => followUpTasks.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 40 }).notNull(),
    outcome: contactOutcomeEnum("outcome").notNull(),
    note: text("note"),
    attemptedByUserId: uuid("attempted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_attempts_task_idx").on(t.taskId, t.attemptedAt),
    index("contact_attempts_patient_idx").on(t.patientId, t.attemptedAt),
  ],
);

export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => followUpTasks.id, { onDelete: "set null" }),
    reason: varchar("reason", { length: 200 }).notNull(),
    raisedByUserId: uuid("raised_by_user_id").references(() => users.id, { onDelete: "set null" }),
    raisedBySystem: varchar("raised_by_system", { length: 60 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("escalations_referral_idx").on(t.referralId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*                               Communication                                */
/* -------------------------------------------------------------------------- */

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "cascade",
    }),
    key: varchar("key", { length: 80 }).notNull(),
    channel: communicationChannelEnum("channel").notNull(),
    language: varchar("language", { length: 12 }).notNull().default("en"),
    body: text("body").notNull(),
    /** Identifier of the provider side approved template, where the channel requires one. */
    providerTemplateId: varchar("provider_template_id", { length: 160 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_templates_scope_key").on(t.organisationId, t.key, t.channel, t.language),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    direction: messageDirectionEnum("direction").notNull(),
    channel: communicationChannelEnum("channel").notNull(),
    templateKey: varchar("template_key", { length: 80 }),
    /** Rendered body. Templates are written so this never carries clinical detail. */
    body: text("body").notNull(),
    toAddress: varchar("to_address", { length: 64 }).notNull(),
    fromAddress: varchar("from_address", { length: 64 }),
    status: messageStatusEnum("status").notNull().default("queued"),
    provider: varchar("provider", { length: 40 }).notNull().default("twilio"),
    providerMessageId: varchar("provider_message_id", { length: 120 }),
    errorCode: varchar("error_code", { length: 40 }),
    errorDetail: varchar("error_detail", { length: 300 }),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** Guarantees one message per logical trigger even if a job runs twice. */
    idempotencyKey: varchar("idempotency_key", { length: 160 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_idempotency_key")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key is not null`),
    uniqueIndex("messages_provider_message_id_key")
      .on(t.provider, t.providerMessageId)
      .where(sql`provider_message_id is not null`),
    index("messages_patient_idx").on(t.patientId, t.createdAt),
    index("messages_status_idx").on(t.status, t.nextAttemptAt),
    index("messages_org_idx").on(t.organisationId, t.createdAt),
  ],
);

export const messageEvents = pgTable(
  "message_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    status: messageStatusEnum("status").notNull(),
    providerEventId: varchar("provider_event_id", { length: 160 }),
    detail: varchar("detail", { length: 300 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("message_events_message_idx").on(t.messageId, t.occurredAt),
    uniqueIndex("message_events_provider_event_key")
      .on(t.messageId, t.providerEventId)
      .where(sql`provider_event_id is not null`),
  ],
);

/** Records every webhook payload identifier so replays are ignored. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 200 }).notNull(),
    kind: varchar("kind", { length: 60 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_deliveries_provider_external_key").on(t.provider, t.externalId)],
);

export const optOuts = pgTable(
  "opt_outs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /** Stored as the normalised E.164 address that opted out. */
    address: varchar("address", { length: 64 }).notNull(),
    channel: communicationChannelEnum("channel").notNull(),
    source: varchar("source", { length: 60 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("opt_outs_unique").on(t.organisationId, t.address, t.channel)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: varchar("body", { length: 400 }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => followUpTasks.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*                               Patient portal                               */
/* -------------------------------------------------------------------------- */

export const patientAccessCodes = pgTable(
  "patient_access_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("patient_access_codes_patient_idx").on(t.patientId, t.createdAt)],
);

export const patientSessions = pgTable(
  "patient_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patient_sessions_token_hash_key").on(t.tokenHash),
    index("patient_sessions_patient_idx").on(t.patientId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                        Prediction and model governance                     */
/* -------------------------------------------------------------------------- */

export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 80 }).notNull(),
    version: varchar("version", { length: 40 }).notNull(),
    algorithm: varchar("algorithm", { length: 80 }).notNull(),
    featureSetVersion: varchar("feature_set_version", { length: 40 }).notNull(),
    status: modelStatusEnum("status").notNull().default("experimental"),
    /** True only when the model was evaluated on real, representative data. */
    trainedOnRealData: boolean("trained_on_real_data").notNull().default(false),
    clinicallyValidated: boolean("clinically_validated").notNull().default(false),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    notes: text("notes"),
    trainedAt: timestamp("trained_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("model_versions_name_version_key").on(t.name, t.version)],
);

export const predictions = pgTable(
  "predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id, { onDelete: "restrict" }),
    /** Probability that the referral results in non attendance. */
    score: numeric("score", { precision: 5, scale: 4 }).notNull(),
    band: varchar("band", { length: 20 }).notNull(),
    contributingFactors: jsonb("contributing_factors")
      .$type<{ feature: string; direction: "increases" | "decreases"; weight: number }[]>()
      .notNull()
      .default([]),
    missingFeatures: jsonb("missing_features").$type<string[]>().notNull().default([]),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("predictions_referral_idx").on(t.referralId, t.calculatedAt),
    uniqueIndex("predictions_referral_model_key").on(t.referralId, t.modelVersionId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                   Audit                                    */
/* -------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorPatientId: uuid("actor_patient_id").references(() => patients.id, {
      onDelete: "set null",
    }),
    actorSystem: varchar("actor_system", { length: 60 }),
    action: varchar("action", { length: 80 }).notNull(),
    resourceType: varchar("resource_type", { length: 60 }).notNull(),
    resourceId: varchar("resource_id", { length: 80 }),
    outcome: varchar("outcome", { length: 20 }).notNull().default("success"),
    /** Non identifying context only. Never clinical content or patient names. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_org_idx").on(t.organisationId, t.occurredAt),
    index("audit_events_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_events_resource_idx").on(t.resourceType, t.resourceId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                              Pilot enquiries                               */
/* -------------------------------------------------------------------------- */

export const pilotEnquiries = pgTable(
  "pilot_enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationName: varchar("organisation_name", { length: 200 }).notNull(),
    contactName: varchar("contact_name", { length: 160 }).notNull(),
    contactEmail: varchar("contact_email", { length: 254 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }),
    role: varchar("role", { length: 120 }),
    country: varchar("country", { length: 80 }).notNull(),
    facilityCount: varchar("facility_count", { length: 40 }),
    monthlyReferralVolume: varchar("monthly_referral_volume", { length: 40 }),
    message: text("message").notNull(),
    status: pilotEnquiryStatusEnum("status").notNull().default("new"),
    internalNote: text("internal_note"),
    sourcePath: varchar("source_path", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pilot_enquiries_status_idx").on(t.status, t.createdAt)],
);

/** Generic fixed window rate limiting store, keyed by action plus subject. */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    bucketKey: varchar("bucket_key", { length: 200 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucketKey, t.windowStart] })],
);

/* -------------------------------------------------------------------------- */
/*                                 Relations                                  */
/* -------------------------------------------------------------------------- */

export const organisationsRelations = relations(organisations, ({ many }) => ({
  facilities: many(facilities),
  memberships: many(memberships),
}));

export const facilitiesRelations = relations(facilities, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [facilities.organisationId],
    references: [organisations.id],
  }),
  departments: many(departments),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  organisation: one(organisations, {
    fields: [memberships.organisationId],
    references: [organisations.id],
  }),
  facility: one(facilities, { fields: [memberships.facilityId], references: [facilities.id] }),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [patients.organisationId],
    references: [organisations.id],
  }),
  homeFacility: one(facilities, {
    fields: [patients.homeFacilityId],
    references: [facilities.id],
  }),
  referrals: many(referrals),
  identifiers: many(patientIdentifiers),
  pregnancyEpisodes: many(pregnancyEpisodes),
}));

export const referralsRelations = relations(referrals, ({ one, many }) => ({
  patient: one(patients, { fields: [referrals.patientId], references: [patients.id] }),
  referringFacility: one(facilities, {
    fields: [referrals.referringFacilityId],
    references: [facilities.id],
  }),
  receivingFacility: one(facilities, {
    fields: [referrals.receivingFacilityId],
    references: [facilities.id],
  }),
  receivingDepartment: one(departments, {
    fields: [referrals.receivingDepartmentId],
    references: [departments.id],
  }),
  statusEvents: many(referralStatusEvents),
  appointments: many(appointments),
  notes: many(clinicalNotes),
  documents: many(documents),
  tasks: many(followUpTasks),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  referral: one(referrals, { fields: [appointments.referralId], references: [referrals.id] }),
  patient: one(patients, { fields: [appointments.patientId], references: [patients.id] }),
  facility: one(facilities, { fields: [appointments.facilityId], references: [facilities.id] }),
}));

export const followUpTasksRelations = relations(followUpTasks, ({ one, many }) => ({
  referral: one(referrals, { fields: [followUpTasks.referralId], references: [referrals.id] }),
  patient: one(patients, { fields: [followUpTasks.patientId], references: [patients.id] }),
  facility: one(facilities, { fields: [followUpTasks.facilityId], references: [facilities.id] }),
  assignee: one(users, { fields: [followUpTasks.assignedToUserId], references: [users.id] }),
  contactAttempts: many(contactAttempts),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  patient: one(patients, { fields: [messages.patientId], references: [patients.id] }),
  referral: one(referrals, { fields: [messages.referralId], references: [referrals.id] }),
  events: many(messageEvents),
}));

/* -------------------------------------------------------------------------- */
/*                              Inferred types                                */
/* -------------------------------------------------------------------------- */

export type Organisation = typeof organisations.$inferSelect;
export type Facility = typeof facilities.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type PregnancyEpisode = typeof pregnancyEpisodes.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type ReferralStatusEvent = typeof referralStatusEvents.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type ClinicalNote = typeof clinicalNotes.$inferSelect;
export type DocumentRecord = typeof documents.$inferSelect;
export type FollowUpTask = typeof followUpTasks.$inferSelect;
export type ContactAttempt = typeof contactAttempts.$inferSelect;
export type Escalation = typeof escalations.$inferSelect;
export type EscalationPolicy = typeof escalationPolicies.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type PilotEnquiry = typeof pilotEnquiries.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ReferralStatus = (typeof referralStatusEnum.enumValues)[number];
export type ReferralPriority = (typeof referralPriorityEnum.enumValues)[number];
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type CommunicationChannel = (typeof communicationChannelEnum.enumValues)[number];
export type TaskKind = (typeof taskKindEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type ConsentType = (typeof consentTypeEnum.enumValues)[number];
export type FacilityType = (typeof facilityTypeEnum.enumValues)[number];
export type MessageStatus = (typeof messageStatusEnum.enumValues)[number];
export type MessageDirection = (typeof messageDirectionEnum.enumValues)[number];
export type ContactOutcome = (typeof contactOutcomeEnum.enumValues)[number];
export type NotificationKindValue = (typeof notificationKindEnum.enumValues)[number];
