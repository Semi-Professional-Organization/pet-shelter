import { describe, it, expect } from "vitest";
import { sealSession, unsealSession } from "@/lib/security/sessionToken";
import { sealSponsorSession, unsealSponsorSession } from "@/lib/security/sponsorSession";
import { createNotificationToken, verifyNotificationToken } from "@/lib/notificationTokens";

/**
 * #286: every signed token ends in its signature, so a lenient signature check made
 * `${token}0`, `${token}zz` and an uppercased signature all open the same session.
 * These go through the three token codecs that call verifySignature today, so a codec
 * that stops calling it fails here.
 *
 * ceiling: this covers the codecs only. It does not see the code that reads a token out
 * of a request (a cookie or query-string read that trimmed its input would pass here),
 * and a new token type has to be added to `tokens` by hand.
 */
const tokens: [string, string, (token: string) => boolean][] = [
  [
    "staff session",
    sealSession({
      id: "user-staff-42",
      email: "staff@example.org",
      name: "Staff Member",
      role: "COORDINATOR",
    }),
    (token) => unsealSession(token) !== null,
  ],
  [
    "sponsor session",
    sealSponsorSession({
      typ: "sponsor",
      sponsorId: "sponsor-1",
      email: "sponsor@example.org",
      name: "Sponsor",
    }),
    (token) => unsealSponsorSession(token) !== null,
  ],
  [
    "notification link",
    createNotificationToken("adopter@example.org", "manage"),
    (token) => verifyNotificationToken(token, "manage").valid,
  ],
];

const upperCaseSignature = (token: string) => {
  const cut = token.lastIndexOf(".") + 1;
  return token.slice(0, cut) + token.slice(cut).toUpperCase();
};

const alterations: [string, (token: string) => string][] = [
  ["a trailing 0", (token) => `${token}0`],
  ["a trailing zz", (token) => `${token}zz`],
  ["a trailing newline", (token) => `${token}\n`],
  ["an uppercase signature", upperCaseSignature],
  ["a signature one character short", (token) => token.slice(0, -1)],
];

describe.each(tokens)("a %s is valid only as the exact string issued (#286)", (_name, token, accepts) => {
  it("is accepted as issued", () => {
    expect(accepts(token)).toBe(true);
  });

  it.each(alterations)("is refused with %s", (_label, alter) => {
    const altered = alter(token);
    expect(altered).not.toBe(token);
    expect(accepts(altered)).toBe(false);
  });
});
