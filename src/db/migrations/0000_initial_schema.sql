CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'rescheduled', 'attended', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('sms', 'whatsapp', 'voice_callback', 'none');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('granted', 'withdrawn', 'not_asked');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('data_processing', 'appointment_messaging', 'follow_up_messaging', 'third_party_sharing');--> statement-breakpoint
CREATE TYPE "public"."contact_outcome" AS ENUM('reached', 'no_answer', 'wrong_number', 'voicemail', 'message_sent', 'refused', 'other');--> statement-breakpoint
CREATE TYPE "public"."encounter_kind" AS ENUM('antenatal_screening', 'antenatal_visit', 'clinical_review', 'admission', 'discharge', 'postnatal_visit', 'other');--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('live', 'demonstration');--> statement-breakpoint
CREATE TYPE "public"."facility_type" AS ENUM('primary_health_clinic', 'community_health_centre', 'district_hospital', 'regional_hospital', 'tertiary_hospital', 'specialist_unit');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undeliverable', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('experimental', 'shadow', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('referral_submitted', 'referral_acknowledged', 'referral_rejected', 'appointment_scheduled', 'appointment_missed', 'care_completed', 'task_assigned', 'escalation_raised');--> statement-breakpoint
CREATE TYPE "public"."pilot_enquiry_status" AS ENUM('new', 'in_review', 'contacted', 'declined', 'archived');--> statement-breakpoint
CREATE TYPE "public"."referral_priority" AS ENUM('routine', 'urgent', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('draft', 'submitted', 'received', 'acknowledged', 'appointment_scheduled', 'patient_attended', 'care_completed', 'follow_up_required', 'follow_up_completed', 'closed', 'rejected', 'cancelled', 'missed_appointment', 'unable_to_contact', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('acknowledgement_overdue', 'missed_appointment', 'follow_up_due', 'communication_failure', 'manual_review', 'clinical_follow_up');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('platform_admin', 'organisation_admin', 'facility_admin', 'nurse_midwife', 'receiving_clinician', 'referral_coordinator', 'programme_analyst');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"department_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"location_note" varchar(200),
	"scheduled_by_user_id" uuid,
	"attendance_recorded_at" timestamp with time zone,
	"attendance_recorded_by_user_id" uuid,
	"superseded_by_appointment_id" uuid,
	"patient_confirmed_at" timestamp with time zone,
	"patient_assistance_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"actor_user_id" uuid,
	"actor_patient_id" uuid,
	"actor_system" varchar(60),
	"action" varchar(80) NOT NULL,
	"resource_type" varchar(60) NOT NULL,
	"resource_id" varchar(80),
	"outcome" varchar(20) DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(300),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"referral_id" uuid,
	"facility_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"visible_to_patient" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"status" "consent_status" NOT NULL,
	"captured_by_user_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" varchar(120),
	"notes" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "contact_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"task_id" uuid,
	"referral_id" uuid,
	"patient_id" uuid NOT NULL,
	"channel" varchar(40) NOT NULL,
	"outcome" "contact_outcome" NOT NULL,
	"note" text,
	"attempted_by_user_id" uuid,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"service_type" varchar(80) NOT NULL,
	"accepts_referrals" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_blobs" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"referral_id" uuid,
	"patient_id" uuid NOT NULL,
	"file_name" varchar(240) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" varchar(400) NOT NULL,
	"checksum_sha256" varchar(64),
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"pregnancy_episode_id" uuid,
	"kind" "encounter_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" varchar(300) NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"facility_id" uuid,
	"acknowledgement_due_hours" integer DEFAULT 48 NOT NULL,
	"urgent_acknowledgement_due_hours" integer DEFAULT 6 NOT NULL,
	"missed_appointment_grace_hours" integer DEFAULT 24 NOT NULL,
	"follow_up_due_days" integer DEFAULT 14 NOT NULL,
	"contact_attempts_before_escalation" integer DEFAULT 3 NOT NULL,
	"appointment_reminder_lead_hours" integer DEFAULT 48 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"referral_id" uuid NOT NULL,
	"task_id" uuid,
	"reason" varchar(200) NOT NULL,
	"raised_by_user_id" uuid,
	"raised_by_system" varchar(60),
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"code" varchar(40) NOT NULL,
	"type" "facility_type" NOT NULL,
	"district" varchar(120),
	"province" varchar(120),
	"address_line" varchar(240),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"phone" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"referral_id" uuid,
	"patient_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"kind" "task_kind" NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"title" varchar(200) NOT NULL,
	"detail" text,
	"due_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"created_by_system" varchar(60),
	"dedupe_key" varchar(160),
	"resolution_outcome" varchar(80),
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"organisation_id" uuid NOT NULL,
	"facility_id" uuid,
	"role" "user_role" NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"facility_id" uuid,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"status" "message_status" NOT NULL,
	"provider_event_id" varchar(160),
	"detail" varchar(300),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"key" varchar(80) NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"body" text NOT NULL,
	"provider_template_id" varchar(160),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"patient_id" uuid,
	"referral_id" uuid,
	"appointment_id" uuid,
	"direction" "message_direction" NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"template_key" varchar(80),
	"body" text NOT NULL,
	"to_address" varchar(64) NOT NULL,
	"from_address" varchar(64),
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider" varchar(40) DEFAULT 'twilio' NOT NULL,
	"provider_message_id" varchar(120),
	"error_code" varchar(40),
	"error_detail" varchar(300),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"idempotency_key" varchar(160),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"version" varchar(40) NOT NULL,
	"algorithm" varchar(80) NOT NULL,
	"feature_set_version" varchar(40) NOT NULL,
	"status" "model_status" DEFAULT 'experimental' NOT NULL,
	"trained_on_real_data" boolean DEFAULT false NOT NULL,
	"clinically_validated" boolean DEFAULT false NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"trained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(400),
	"referral_id" uuid,
	"task_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opt_outs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"address" varchar(64) NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"source" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"country" varchar(2) DEFAULT 'ZA' NOT NULL,
	"environment" "environment_kind" DEFAULT 'live' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"system" varchar(60) NOT NULL,
	"value" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_record_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"changed_by_user_id" uuid,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_facility_id" uuid NOT NULL,
	"record_number" varchar(40) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"phone" varchar(32),
	"alternate_phone" varchar(32),
	"preferred_language" varchar(12) DEFAULT 'en' NOT NULL,
	"preferred_channel" "communication_channel" DEFAULT 'sms' NOT NULL,
	"residential_area" varchar(160),
	"emergency_contact_name" varchar(160),
	"emergency_contact_phone" varchar(32),
	"notes" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"merged_into_patient_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pilot_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_name" varchar(200) NOT NULL,
	"contact_name" varchar(160) NOT NULL,
	"contact_email" varchar(254) NOT NULL,
	"contact_phone" varchar(32),
	"role" varchar(120),
	"country" varchar(80) NOT NULL,
	"facility_count" varchar(40),
	"monthly_referral_volume" varchar(40),
	"message" text NOT NULL,
	"status" "pilot_enquiry_status" DEFAULT 'new' NOT NULL,
	"internal_note" text,
	"source_path" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"referral_id" uuid NOT NULL,
	"model_version_id" uuid NOT NULL,
	"score" numeric(5, 4) NOT NULL,
	"band" varchar(20) NOT NULL,
	"contributing_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregnancy_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"estimated_due_date" date,
	"last_menstrual_period" date,
	"gravidity" smallint,
	"parity" smallint,
	"booking_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"outcome_recorded_at" timestamp with time zone,
	"outcome_summary" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"bucket_key" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_counters_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start")
);
--> statement-breakpoint
CREATE TABLE "referral_pathways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"referring_facility_id" uuid NOT NULL,
	"receiving_facility_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"from_status" "referral_status",
	"to_status" "referral_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_system" varchar(60),
	"facility_id" uuid,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(24) NOT NULL,
	"organisation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"pregnancy_episode_id" uuid,
	"referring_facility_id" uuid NOT NULL,
	"receiving_facility_id" uuid NOT NULL,
	"receiving_department_id" uuid,
	"status" "referral_status" DEFAULT 'draft' NOT NULL,
	"priority" "referral_priority" DEFAULT 'routine' NOT NULL,
	"reason_category" varchar(80) NOT NULL,
	"reason_detail" text,
	"clinical_observations" text,
	"requested_actions" text,
	"requested_date" date,
	"created_by_user_id" uuid NOT NULL,
	"assigned_coordinator_id" uuid,
	"submitted_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_user_id" uuid,
	"first_appointment_at" timestamp with time zone,
	"attended_at" timestamp with time zone,
	"care_completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"outcome_summary" text,
	"rejection_reason" varchar(300),
	"cancellation_reason" varchar(300),
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" varchar(64),
	"user_agent" varchar(300),
	"mfa_satisfied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"full_name" varchar(160) NOT NULL,
	"job_title" varchar(120),
	"phone" varchar(32),
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_id" varchar(200) NOT NULL,
	"kind" varchar(60) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_scheduled_by_user_id_users_id_fk" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_attendance_recorded_by_user_id_users_id_fk" FOREIGN KEY ("attendance_recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_patient_id_patients_id_fk" FOREIGN KEY ("actor_patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_task_id_follow_up_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."follow_up_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_attempted_by_user_id_users_id_fk" FOREIGN KEY ("attempted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_blobs" ADD CONSTRAINT "document_blobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_pregnancy_episode_id_pregnancy_episodes_id_fk" FOREIGN KEY ("pregnancy_episode_id") REFERENCES "public"."pregnancy_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_task_id_follow_up_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."follow_up_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_follow_up_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."follow_up_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_access_codes" ADD CONSTRAINT "patient_access_codes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identifiers" ADD CONSTRAINT "patient_identifiers_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identifiers" ADD CONSTRAINT "patient_identifiers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_record_changes" ADD CONSTRAINT "patient_record_changes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_record_changes" ADD CONSTRAINT "patient_record_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_home_facility_id_facilities_id_fk" FOREIGN KEY ("home_facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_episodes" ADD CONSTRAINT "pregnancy_episodes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_episodes" ADD CONSTRAINT "pregnancy_episodes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_pathways" ADD CONSTRAINT "referral_pathways_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_pathways" ADD CONSTRAINT "referral_pathways_referring_facility_id_facilities_id_fk" FOREIGN KEY ("referring_facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_pathways" ADD CONSTRAINT "referral_pathways_receiving_facility_id_facilities_id_fk" FOREIGN KEY ("receiving_facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_status_events" ADD CONSTRAINT "referral_status_events_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_status_events" ADD CONSTRAINT "referral_status_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_status_events" ADD CONSTRAINT "referral_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_status_events" ADD CONSTRAINT "referral_status_events_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_pregnancy_episode_id_pregnancy_episodes_id_fk" FOREIGN KEY ("pregnancy_episode_id") REFERENCES "public"."pregnancy_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referring_facility_id_facilities_id_fk" FOREIGN KEY ("referring_facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_receiving_facility_id_facilities_id_fk" FOREIGN KEY ("receiving_facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_receiving_department_id_departments_id_fk" FOREIGN KEY ("receiving_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_assigned_coordinator_id_users_id_fk" FOREIGN KEY ("assigned_coordinator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_referral_idx" ON "appointments" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "appointments_facility_date_idx" ON "appointments" USING btree ("facility_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "appointments_status_date_idx" ON "appointments" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("patient_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "audit_events_org_idx" ON "audit_events" USING btree ("organisation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "clinical_notes_patient_idx" ON "clinical_notes" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "clinical_notes_referral_idx" ON "clinical_notes" USING btree ("referral_id","created_at");--> statement-breakpoint
CREATE INDEX "consent_records_patient_type_idx" ON "consent_records" USING btree ("patient_id","type","captured_at");--> statement-breakpoint
CREATE INDEX "contact_attempts_task_idx" ON "contact_attempts" USING btree ("task_id","attempted_at");--> statement-breakpoint
CREATE INDEX "contact_attempts_patient_idx" ON "contact_attempts" USING btree ("patient_id","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_facility_name_key" ON "departments" USING btree ("facility_id","name");--> statement-breakpoint
CREATE INDEX "departments_facility_idx" ON "departments" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "documents_referral_idx" ON "documents" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "documents_patient_idx" ON "documents" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "encounters_patient_idx" ON "encounters" USING btree ("patient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "encounters_facility_idx" ON "encounters" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_policies_org_facility_key" ON "escalation_policies" USING btree ("organisation_id","facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_policies_org_default_key" ON "escalation_policies" USING btree ("organisation_id") WHERE facility_id is null;--> statement-breakpoint
CREATE INDEX "escalations_referral_idx" ON "escalations" USING btree ("referral_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_org_code_key" ON "facilities" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE INDEX "facilities_org_idx" ON "facilities" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_tasks_dedupe_key" ON "follow_up_tasks" USING btree ("dedupe_key") WHERE dedupe_key is not null;--> statement-breakpoint
CREATE INDEX "follow_up_tasks_facility_status_idx" ON "follow_up_tasks" USING btree ("facility_id","status","due_at");--> statement-breakpoint
CREATE INDEX "follow_up_tasks_assignee_idx" ON "follow_up_tasks" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "follow_up_tasks_referral_idx" ON "follow_up_tasks" USING btree ("referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "memberships_facility_idx" ON "memberships" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_unique_scope" ON "memberships" USING btree ("user_id","organisation_id","facility_id","role") WHERE facility_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_unique_org_scope" ON "memberships" USING btree ("user_id","organisation_id","role") WHERE facility_id is null;--> statement-breakpoint
CREATE INDEX "message_events_message_idx" ON "message_events" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_events_provider_event_key" ON "message_events" USING btree ("message_id","provider_event_id") WHERE provider_event_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_scope_key" ON "message_templates" USING btree ("organisation_id","key","channel","language");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_key" ON "messages" USING btree ("idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_message_id_key" ON "messages" USING btree ("provider","provider_message_id") WHERE provider_message_id is not null;--> statement-breakpoint
CREATE INDEX "messages_patient_idx" ON "messages" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "messages_org_idx" ON "messages" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "model_versions_name_version_key" ON "model_versions" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opt_outs_unique" ON "opt_outs" USING btree ("organisation_id","address","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "patient_access_codes_patient_idx" ON "patient_access_codes" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_identifiers_unique" ON "patient_identifiers" USING btree ("organisation_id","system","value");--> statement-breakpoint
CREATE INDEX "patient_identifiers_patient_idx" ON "patient_identifiers" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patient_record_changes_patient_idx" ON "patient_record_changes" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_sessions_token_hash_key" ON "patient_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "patient_sessions_patient_idx" ON "patient_sessions" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_org_record_number_key" ON "patients" USING btree ("organisation_id","record_number");--> statement-breakpoint
CREATE INDEX "patients_org_idx" ON "patients" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "patients_home_facility_idx" ON "patients" USING btree ("home_facility_id");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "patients_phone_idx" ON "patients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "pilot_enquiries_status_idx" ON "pilot_enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "predictions_referral_idx" ON "predictions" USING btree ("referral_id","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_referral_model_key" ON "predictions" USING btree ("referral_id","model_version_id");--> statement-breakpoint
CREATE INDEX "pregnancy_episodes_patient_idx" ON "pregnancy_episodes" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancy_episodes_one_active" ON "pregnancy_episodes" USING btree ("patient_id") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_pathways_pair_key" ON "referral_pathways" USING btree ("referring_facility_id","receiving_facility_id");--> statement-breakpoint
CREATE INDEX "referral_pathways_receiving_idx" ON "referral_pathways" USING btree ("receiving_facility_id");--> statement-breakpoint
CREATE INDEX "referral_status_events_referral_idx" ON "referral_status_events" USING btree ("referral_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_status_events_org_idx" ON "referral_status_events" USING btree ("organisation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_status_events_to_status_idx" ON "referral_status_events" USING btree ("to_status","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_reference_key" ON "referrals" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "referrals_org_status_idx" ON "referrals" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "referrals_receiving_status_idx" ON "referrals" USING btree ("receiving_facility_id","status");--> statement-breakpoint
CREATE INDEX "referrals_referring_status_idx" ON "referrals" USING btree ("referring_facility_id","status");--> statement-breakpoint
CREATE INDEX "referrals_patient_idx" ON "referrals" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "referrals_coordinator_idx" ON "referrals" USING btree ("assigned_coordinator_id");--> statement-breakpoint
CREATE INDEX "referrals_created_at_idx" ON "referrals" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_provider_external_key" ON "webhook_deliveries" USING btree ("provider","external_id");