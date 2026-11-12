import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { sanitiseAuditMetadata } from "@/lib/audit";
import { checkPasswordPolicy, hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { generateNumericCode, generateReference, hashToken, safeEqualHex } from "@/lib/auth/tokens";
import { base32Decode, base32Encode, generateTotp, totpUri, verifyTotp } from "@/lib/auth/totp";
import { verifyTwilioSignature } from "@/lib/messaging/twilio-provider";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("a reasonably long passphrase");
    expect(await verifyPassword("a reasonably long passphrase", hash)).toBe(true);
    expect(await verifyPassword("a reasonably long passphras", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("produces a different hash each time", async () => {
    const first = await hashPassword("the same passphrase here");
    const second = await hashPassword("the same passphrase here");
    expect(first).not.toEqual(second);
  });

  it("rejects a missing or malformed stored hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$1$2$3")).toBe(false);
  });

  it("normalises unicode before hashing", async () => {
    const composed = "paéssphrase long enough";
    const decomposed = "paéssphrase long enough";
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("flags hashes made with weaker parameters", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash(null)).toBe(true);
  });
});

describe("password policy", () => {
  it("requires a reasonable length", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("x".repeat(12)).ok).toBe(false);
    expect(checkPasswordPolicy("correct horse battery staple").ok).toBe(true);
  });

  it("rejects obvious choices", () => {
    expect(checkPasswordPolicy("mypassword12345").ok).toBe(false);
    expect(checkPasswordPolicy("keaclinic2026!!").ok).toBe(false);
  });

  it("rejects a password containing the email local part", () => {
    const result = checkPasswordPolicy("nomsamolefe12345", "nomsamolefe@example.invalid");
    expect(result.ok).toBe(false);
  });

  it("rejects an excessively long password", () => {
    expect(checkPasswordPolicy("a b c d e f g ".repeat(40)).ok).toBe(false);
  });
});

describe("tokens", () => {
  it("hashes a token to a stable 64 character digest", () => {
    const digest = hashToken("secret-value");
    expect(digest).toHaveLength(64);
    expect(hashToken("secret-value")).toEqual(digest);
    expect(hashToken("secret-value ")).not.toEqual(digest);
  });

  it("compares digests safely", () => {
    const digest = hashToken("abc");
    expect(safeEqualHex(digest, hashToken("abc"))).toBe(true);
    expect(safeEqualHex(digest, hashToken("abd"))).toBe(false);
    expect(safeEqualHex(digest, "short")).toBe(false);
  });

  it("generates numeric codes of the requested length", () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateNumericCode(6);
      expect(code).toMatch(/^\d{6}$/);
      expect(code.startsWith("0")).toBe(false);
    }
  });

  it("generates references without easily confused characters", () => {
    for (let index = 0; index < 50; index += 1) {
      const reference = generateReference("KEA", 6);
      expect(reference).toMatch(/^KEA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe("time based one time passwords", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("round trips base32", () => {
    expect(base32Decode(base32Encode(Buffer.from("hello world"))).toString()).toBe("hello world");
  });

  it("accepts the current code", () => {
    const now = Date.now();
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
  });

  it("tolerates one step of clock drift either way", () => {
    const now = Date.now();
    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, now + 30_000), now)).toBe(true);
  });

  it("rejects a code from further away", () => {
    const now = Date.now();
    expect(verifyTotp(secret, generateTotp(secret, now - 180_000), now)).toBe(false);
  });

  it("rejects malformed codes", () => {
    const now = Date.now();
    expect(verifyTotp(secret, "", now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });

  it("builds an otpauth uri an authenticator can read", () => {
    const uri = totpUri(secret, "nurse@example.invalid");
    expect(uri.startsWith("otpauth://totp/Kea%3Anurse%40example.invalid?")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("twilio webhook signatures", () => {
  const authToken = "test_auth_token_value";
  const url = "https://example.invalid/api/webhooks/twilio/status";
  const params = { MessageSid: "SM123", MessageStatus: "delivered", AccountSid: "AC1" };

  function sign(targetUrl: string, body: Record<string, string>, token = authToken): string {
    let data = targetUrl;
    for (const key of Object.keys(body).sort()) data += key + body[key];
    return createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  }

  it("accepts a correctly signed request", () => {
    expect(
      verifyTwilioSignature({ authToken, signature: sign(url, params), url, params }),
    ).toBe(true);
  });

  it("rejects a signature made with a different token", () => {
    expect(
      verifyTwilioSignature({
        authToken,
        signature: sign(url, params, "another_token"),
        url,
        params,
      }),
    ).toBe(false);
  });

  it("rejects a signature for a different url", () => {
    const signature = sign("https://evil.invalid/hook", params);
    expect(verifyTwilioSignature({ authToken, signature, url, params })).toBe(false);
  });

  it("rejects a tampered parameter", () => {
    const signature = sign(url, params);
    expect(
      verifyTwilioSignature({
        authToken,
        signature,
        url,
        params: { ...params, MessageStatus: "failed" },
      }),
    ).toBe(false);
  });

  it("rejects an absent or malformed signature", () => {
    expect(verifyTwilioSignature({ authToken, signature: "", url, params })).toBe(false);
    expect(verifyTwilioSignature({ authToken, signature: "!!!not base64!!!", url, params })).toBe(
      false,
    );
  });
});

describe("audit metadata", () => {
  it("keeps allowed keys and drops everything else", () => {
    const result = sanitiseAuditMetadata({
      role: "nurse_midwife",
      referralReference: "KEA-ABC123",
      patientName: "Should not appear",
      phone: "+27600000101",
      diagnosis: "Should not appear",
      body: "Message body",
      count: 3,
    });

    expect(result).toEqual({ role: "nurse_midwife", referralReference: "KEA-ABC123", count: 3 });
  });

  it("truncates long strings and arrays", () => {
    const result = sanitiseAuditMetadata({
      reason: "x".repeat(500),
      changedFields: Array.from({ length: 60 }, (_, index) => `field_${index}`),
    });
    expect((result.reason as string).length).toBe(200);
    expect((result.changedFields as string[]).length).toBe(40);
  });

  it("drops null and undefined values", () => {
    expect(sanitiseAuditMetadata({ role: null, count: undefined })).toEqual({});
    expect(sanitiseAuditMetadata(undefined)).toEqual({});
  });
});
