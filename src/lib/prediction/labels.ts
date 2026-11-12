/**
 * Readable names for model features. Kept separate from the feature builder so
 * that client components can use them without pulling in server only code.
 */

const LABELS: Record<string, string> = {
  lead_time_days: "Days between booking and appointment",
  travel_distance_km: "Distance between facilities",
  priority_rank: "Referral priority",
  prior_missed_appointments: "Previously missed appointments",
  prior_attended_appointments: "Previously attended appointments",
  facility_missed_rate: "Facility missed appointment rate",
  acknowledgement_delay_hours: "Time taken to acknowledge",
  appointment_weekday: "Day of the week of the appointment",
  reschedule_count: "Times rebooked",
  has_contact_number: "Phone number on record",
  appointment_message_delivered: "Appointment message delivered",
};

export function featureLabel(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, " ");
}
