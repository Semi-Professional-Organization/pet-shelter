import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/security/crypto";
import { INITIAL_STAFF_USERS } from "@/lib/server/userStore";
import { PUBLISHED_STAFF_PASSWORDS } from "@/lib/security/publishedPasswords";
import { SEED_SPONSORS } from "@/lib/server/sponsorRepository";

/**
 * The demo accounts' password hashes are constants, derived once from their
 * published passwords (`INITIAL_STAFF_USERS` in `userStore.ts`, `SEED_SPONSORS`
 * in `sponsorRepository.ts`). The staff passwords are not kept beside their
 * hashes, so the list below says which one each account has; it is checked
 * against the published list the login refuses. They used to be derived with scrypt at runtime, in
 * every test file and on every sponsor reset.
 *
 * A constant can drift from its password where a derivation cannot: change a
 * seed password and forget the hash, and the demo account stops signing in
 * with nothing else failing. This is the check that catches it.
 */
const STAFF_PASSWORDS: Record<string, string> = {
  "admin@hopeforstrays.org": "admin123",
  "coordinator@hopeforstrays.org": "coord123",
  "animals@hopeforstrays.org": "animal123",
  "content@hopeforstrays.org": "content123",
  "staff@hopeforstrays.org": "staff123",
};

const SEEDS = [
  ...INITIAL_STAFF_USERS.map((s) => ({ who: `staff ${s.email}`, password: STAFF_PASSWORDS[s.email], hash: s.passwordHash })),
  ...SEED_SPONSORS.map((s) => ({ who: `sponsor ${s.email}`, password: s.initialPassword, hash: s.passwordHash })),
];

describe("demo seed password hashes", () => {
  it("knows each staff account's password, and every one is a published password the login refuses", () => {
    expect(Object.keys(STAFF_PASSWORDS).sort()).toEqual(INITIAL_STAFF_USERS.map((s) => s.email).sort());
    for (const password of Object.values(STAFF_PASSWORDS)) expect(PUBLISHED_STAFF_PASSWORDS.has(password)).toBe(true);
  });

  it.each(SEEDS)("$who: the stored hash verifies the published password", async ({ password, hash }) => {
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it.each(SEEDS)("$who: the stored hash refuses any other password", async ({ password, hash }) => {
    expect(await verifyPassword(`${password}x`, hash)).toBe(false);
  });

  it("gives every seed its own salt, so no hash was copied from another", () => {
    const salts = SEEDS.map(({ hash }) => hash.split(":")[0]);
    expect(new Set(salts).size).toBe(SEEDS.length);
  });

  it.each([
    ["staff", INITIAL_STAFF_USERS],
    ["sponsor", SEED_SPONSORS],
  ] as const)("keeps the %s seeds frozen, since every reset re-reads them", (_, seeds) => {
    // A change made through the export would otherwise outlive the reset meant to undo it.
    expect(Object.isFrozen(seeds)).toBe(true);
    expect(seeds.every((seed) => Object.isFrozen(seed))).toBe(true);
  });
});
