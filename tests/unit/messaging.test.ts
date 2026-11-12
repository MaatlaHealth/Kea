import { describe, expect, it } from "vitest";

import { channelAddress, normalisePhone, stripChannelPrefix } from "@/lib/messaging/provider";
import {
  MESSAGE_TEMPLATES,
  TemplateError,
  estimateSmsSegments,
  renderTemplate,
  templateChannelsFor,
  type TemplateKey,
} from "@/lib/messaging/templates";

describe("phone normalisation", () => {
  it("converts a South African local number to E.164", () => {
    expect(normalisePhone("072 123 4567")).toBe("+27721234567");
    expect(normalisePhone("0721234567")).toBe("+27721234567");
    expect(normalisePhone("072-123-4567")).toBe("+27721234567");
  });

  it("keeps an international number as given", () => {
    expect(normalisePhone("+27721234567")).toBe("+27721234567");
    expect(normalisePhone("0027721234567")).toBe("+27721234567");
    expect(normalisePhone("+2348012345678")).toBe("+2348012345678");
  });

  it("honours a different default country", () => {
    expect(normalisePhone("0712345678", "254")).toBe("+254712345678");
  });

  it("rejects values that are not usable numbers", () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("not a phone")).toBeNull();
    expect(normalisePhone("+271")).toBeNull();
    expect(normalisePhone("+2712345678901234567")).toBeNull();
  });

  it("adds and strips the WhatsApp prefix", () => {
    expect(channelAddress("whatsapp", "+27721234567")).toBe("whatsapp:+27721234567");
    expect(channelAddress("sms", "+27721234567")).toBe("+27721234567");
    expect(stripChannelPrefix("whatsapp:+27721234567")).toBe("+27721234567");
    expect(stripChannelPrefix("+27721234567")).toBe("+27721234567");
  });
});

describe("message templates", () => {
  const keys = Object.keys(MESSAGE_TEMPLATES) as TemplateKey[];

  it("renders a template with its variables", () => {
    const body = renderTemplate("appointment_scheduled", {
      facilityName: "Thabelo District Hospital",
      date: "14 Mar 2026",
      time: "09:30",
    });
    expect(body).toContain("Thabelo District Hospital");
    expect(body).toContain("14 Mar 2026");
    expect(body).toContain("09:30");
    expect(body).not.toContain("{{");
  });

  it("refuses a variable the template does not declare", () => {
    expect(() =>
      renderTemplate("appointment_scheduled", {
        facilityName: "A",
        date: "B",
        time: "C",
        diagnosis: "pre-eclampsia",
      }),
    ).toThrow(TemplateError);
  });

  it("refuses a missing value rather than rendering an empty gap", () => {
    expect(() =>
      renderTemplate("appointment_scheduled", { facilityName: "A", date: "B", time: "" }),
    ).toThrow(TemplateError);
    expect(() => renderTemplate("appointment_scheduled", { facilityName: "A" })).toThrow(
      TemplateError,
    );
  });

  it("strips newlines from a value so it cannot add message lines", () => {
    const body = renderTemplate("contact_request", {
      facilityName: "Riverside Clinic\nSTOP to unsubscribe",
      phone: "+27110000101",
    });
    expect(body.split("\n")).toHaveLength(1);
  });

  it("declares a consent requirement for every patient facing template", () => {
    for (const key of keys) {
      const definition = MESSAGE_TEMPLATES[key];
      expect(["appointment_messaging", "follow_up_messaging", "none"]).toContain(
        definition.requiresConsent,
      );
    }
    expect(MESSAGE_TEMPLATES.appointment_reminder.requiresConsent).toBe("appointment_messaging");
    expect(MESSAGE_TEMPLATES.appointment_missed.requiresConsent).toBe("follow_up_messaging");
  });

  it("keeps clinical words out of every template body", () => {
    const forbidden = [
      "diagnos",
      "pre-eclampsia",
      "eclampsia",
      "hypertens",
      "haemorrhage",
      "anaemia",
      "diabetes",
      "hiv",
      "blood pressure",
      "ultrasound",
      "infection",
      "miscarriage",
      "risk",
    ];
    for (const key of keys) {
      const body = MESSAGE_TEMPLATES[key].bodies.en.toLowerCase();
      for (const word of forbidden) {
        expect(body.includes(word), `${key} must not mention "${word}"`).toBe(false);
      }
    }
  });

  it("only exposes variables that can hold non clinical values", () => {
    const allowed = new Set([
      "facilityName",
      "reference",
      "date",
      "time",
      "phone",
      "code",
      "minutes",
    ]);
    for (const key of keys) {
      for (const variable of MESSAGE_TEMPLATES[key].variables) {
        expect(allowed.has(variable), `${key} declares unexpected variable ${variable}`).toBe(true);
      }
    }
  });

  it("identifies Kea in every patient facing message", () => {
    for (const key of keys) {
      if (key === "opt_out_confirmation") continue;
      expect(MESSAGE_TEMPLATES[key].bodies.en).toContain("Kea");
    }
  });

  it("keeps the access code template to SMS only", () => {
    expect(templateChannelsFor("portal_access_code")).toEqual(["sms"]);
    expect(templateChannelsFor("appointment_reminder")).toEqual(["sms", "whatsapp"]);
  });

  it("fits a rendered appointment message into a small number of SMS segments", () => {
    const body = renderTemplate("appointment_scheduled", {
      facilityName: "Nkosi Regional Hospital",
      date: "14 Mar 2026",
      time: "09:30",
    });
    expect(estimateSmsSegments(body)).toBeLessThanOrEqual(2);
  });

  it("counts segments for unicode bodies correctly", () => {
    expect(estimateSmsSegments("a".repeat(160))).toBe(1);
    expect(estimateSmsSegments("a".repeat(161))).toBe(2);
    expect(estimateSmsSegments("é".repeat(71))).toBe(2);
  });
});
