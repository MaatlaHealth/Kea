/**
 * Static site constants. These are public values only, never credentials.
 */

export const REPOSITORY_URL = "https://github.com/MaatlaHealth/Kea";

export const PRODUCT_NAME = "Kea";

export const PRODUCT_TAGLINE = "Connected maternal care for every woman";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "af", label: "Afrikaans" },
  { code: "zu", label: "isiZulu" },
  { code: "xh", label: "isiXhosa" },
  { code: "st", label: "Sesotho" },
  { code: "tn", label: "Setswana" },
  { code: "nso", label: "Sepedi" },
  { code: "ts", label: "Xitsonga" },
  { code: "ve", label: "Tshivenda" },
  { code: "ss", label: "siSwati" },
  { code: "nr", label: "isiNdebele" },
] as const;

export const REFERRAL_REASON_CATEGORIES = [
  "Hypertensive disorder in pregnancy",
  "Suspected pre-eclampsia",
  "Antepartum haemorrhage",
  "Reduced fetal movement",
  "Abnormal ultrasound finding",
  "Gestational diabetes",
  "Anaemia requiring investigation",
  "Previous caesarean section assessment",
  "Multiple pregnancy",
  "Preterm labour risk",
  "Infection requiring specialist care",
  "Specialist antenatal review",
  "Postnatal complication",
  "Other clinical concern",
] as const;

export const FACILITY_TYPE_LABELS = {
  primary_health_clinic: "Primary health clinic",
  community_health_centre: "Community health centre",
  district_hospital: "District hospital",
  regional_hospital: "Regional hospital",
  tertiary_hospital: "Tertiary hospital",
  specialist_unit: "Specialist unit",
} as const;
