import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLES } from "@/lib/security/permissions";
import { findMemberRow, identityForRole, signInAs } from "../setup/authSession";

/**
 * The donation QR audit path: changing a code donors scan to send money must
 * leave an immutable record naming the actor and the old and new values.
 *
 * `src/actions/settings.ts` emits `DONATION_QR_UPDATED` alongside the
 * whole-settings `SETTINGS_UPDATED` entry, precisely because a QR change is not
 * an ordinary configuration edit — it redirects money. Nothing asserted on that
 * emit before this file; a grep for the action name found exactly one hit, the
 * emit site itself.
 *
 * Ported from an abandoned branch, whose version was written against the
 * pre-refactor module layout (`@/lib/prisma`, `@/lib/domain/shelterSettings`)
 * and against a role check that no longer exists. The intent is the original's;
 * the code under test is master's.
 *
 * Authorization here is real, not stubbed: `signInAs` seals an actual session
 * cookie into the harness jar, so `getVerifiedSession` -> `assertHasPermission`
 * runs the same path a browser would take. Only the Prisma client is doubled.
 */

/**
 * The Prisma surface this path touches: the audit row it writes, the settings
 * row the repository would upsert, and the member lookup the DAL makes to
 * refresh the session's role.
 *
 * `user.findUnique` used to resolve null, and the actor asserted below was the
 * actor signed in only because the DAL then fell through to the cookie's own
 * claims. That fall-through was a privilege-retention hole — a member deleted
 * from a reachable database kept every capability their cookie claimed until
 * it expired — and closing it (`src/lib/security/dal.ts`, pinned by
 * `tests/unit/security/authSessionDal.test.ts`) took this suite's premise with
 * it. So the double now answers the lookup with the row a signed-in member
 * actually has, which is what the suite meant by "authorization here is real"
 * in the first place.
 *
 * Declared through `vi.hoisted` because `vi.mock` is hoisted above every import
 * and so cannot close over an ordinary module-scope binding.
 */
const prismaDouble = vi.hoisted(() => ({
  auditLog: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  shelterSettings: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
  user: {
    // `memberRowForId` mirrors `identityForRole`, so whichever role a case
    // signs in as is the role the DAL reads back. An id no helper mints is
    // answered null on purpose — that is the deleted-member case.
    findUnique: vi.fn((args?: { where?: { id?: string } }) => findMemberRow(args)),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaDouble,
  default: prismaDouble,
  disconnectPrisma: vi.fn().mockResolvedValue(undefined),
}));

/**
 * The subject, imported dynamically *inside* each test.
 *
 * Required by the harness contract in `.claude/skills/test-harness`: a static
 * import can instantiate the repositories and the real client ahead of the
 * mock, after which these spies observe zero calls while the suite still goes
 * green.
 */
async function loadSubject() {
  const [actions, auditLog, settingsRepository] = await Promise.all([
    import("@/actions/settings"),
    import("@/lib/domain/auditLog"),
    import("@/lib/server/settingsRepository"),
  ]);
  return { actions, auditLog, settingsRepository };
}

/** The Super Admin acting in every case that is allowed to succeed. */
const QR_ADMIN = identityForRole(ROLES.SUPER_ADMIN);

/** The four fields `pickQrSettings` narrows the diff to, sorted for comparison. */
const QR_KEYS = ["bankQrUrl", "duitNowQrUrl", "paymentPayload", "tngQrUrl"];

/**
 * A schema-valid settings submission.
 *
 * QR fields are omitted rather than blanked so the schema's own defaults apply,
 * which is what a save that touched no QR field actually sends.
 */
function settingsWith(overrides: Record<string, unknown> = {}) {
  return {
    shelterName: "Hope for Strays",
    email: "contact@hopeforstrays.org",
    phone: "03-7876 5432",
    address: "No. 18, Jalan SS 2/72, Petaling Jaya",
    operatingHours: "Tue-Sun 10am-5pm",
    adoptionFeeDog: "Free",
    adoptionFeeCat: "Free",
    ...overrides,
  };
}

interface QrDiff {
  before: Record<string, string>;
  after: Record<string, string>;
}

interface AuditRow {
  action: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  targetEntity: string;
  targetId: string | null;
  metadata?: unknown;
}

/** Every row handed to `prisma.auditLog.create` so far. */
function persistedAuditRows(): AuditRow[] {
  return prismaDouble.auditLog.create.mock.calls.map(
    (call) => (call[0] as { data: AuditRow }).data
  );
}

beforeEach(async () => {
  // Call counts only — `mockClear`, not `mockReset`, so the resolved values
  // configured above survive into every test.
  vi.clearAllMocks();
  // After the harness's own hook, which empties the cookie jar and the audit store.
  await signInAs(QR_ADMIN);
});

describe("donation QR audit trail", () => {
  it("records DONATION_QR_UPDATED with the actor and an old/new diff", async () => {
    const { actions, auditLog } = await loadSubject();

    const result = await actions.updateShelterSettings(
      settingsWith({ duitNowQrUrl: "/uploads/new-duitnow.png" })
    );
    expect(result.success).toBe(true);

    const entry = auditLog.getAuditLogs(50).find((log) => log.action === "DONATION_QR_UPDATED");
    expect(entry).toBeDefined();
    expect(entry!.actorId).toBe(QR_ADMIN.id);
    expect(entry!.actorEmail).toBe(QR_ADMIN.email);
    expect(entry!.actorRole).toBe(QR_ADMIN.role);
    expect(entry!.entity).toBe("ShelterSettings");
    expect(entry!.entityId).toBe("global-settings");

    const details = entry!.details as unknown as QrDiff;
    expect(details.before.duitNowQrUrl).toBe("");
    expect(details.after.duitNowQrUrl).toBe("/uploads/new-duitnow.png");
  });

  it("persists that entry as an audit_logs row targeting ShelterSettings", async () => {
    const { actions, auditLog } = await loadSubject();

    await actions.updateShelterSettings(
      settingsWith({ duitNowQrUrl: "/uploads/new-duitnow.png" })
    );
    // `recordAuditLog` is synchronous and its write floats; draining it is what
    // makes the row observable rather than racy.
    await auditLog.flushAuditLogWrites();

    const row = persistedAuditRows().find((data) => data.action === "DONATION_QR_UPDATED");
    expect(row).toBeDefined();
    expect(row!.targetEntity).toBe("ShelterSettings");
    expect(row!.targetId).toBe("global-settings");
    expect(row!.actorId).toBe(QR_ADMIN.id);
    expect(row!.actorEmail).toBe(QR_ADMIN.email);
    expect(row!.actorRole).toBe(QR_ADMIN.role);

    const metadata = row!.metadata as QrDiff;
    expect(metadata.before.duitNowQrUrl).toBe("");
    expect(metadata.after.duitNowQrUrl).toBe("/uploads/new-duitnow.png");
  });

  // All four, not just the DuitNow one: the emit is gated on
  // `QR_SETTING_KEYS.some(...)`, so a key dropped from that list would silently
  // stop auditing that payment rail while every other case here still passed.
  it.each([
    ["duitNowQrUrl", "/uploads/duitnow.png"],
    ["tngQrUrl", "/uploads/tng.png"],
    ["bankQrUrl", "https://cdn.example.test/bank.png"],
    ["paymentPayload", "00020126580014A000000615000101"],
  ])("audits a change to %s", async (field, value) => {
    const { actions, auditLog } = await loadSubject();

    const result = await actions.updateShelterSettings(settingsWith({ [field]: value }));
    expect(result.success).toBe(true);

    const entry = auditLog.getAuditLogs(50).find((log) => log.action === "DONATION_QR_UPDATED");
    expect(entry).toBeDefined();

    const details = entry!.details as unknown as QrDiff;
    expect(details.before[field]).toBe("");
    expect(details.after[field]).toBe(value);
  });

  it("appends a second entry rather than amending the first", async () => {
    const { actions, auditLog } = await loadSubject();

    await actions.updateShelterSettings(settingsWith({ duitNowQrUrl: "/uploads/first.png" }));
    await actions.updateShelterSettings(settingsWith({ duitNowQrUrl: "/uploads/second.png" }));

    const entries = auditLog
      .getAuditLogs(50)
      .filter((log) => log.action === "DONATION_QR_UPDATED");
    expect(entries).toHaveLength(2);

    // Newest first. The first change is still readable in full afterwards --
    // that superseded record is the whole point of an audit trail.
    const newest = entries[0].details as unknown as QrDiff;
    const oldest = entries[1].details as unknown as QrDiff;
    expect(newest.before.duitNowQrUrl).toBe("/uploads/first.png");
    expect(newest.after.duitNowQrUrl).toBe("/uploads/second.png");
    expect(oldest.before.duitNowQrUrl).toBe("");
    expect(oldest.after.duitNowQrUrl).toBe("/uploads/first.png");
  });

  it("does not record a QR entry when no QR field changed", async () => {
    const { actions, auditLog } = await loadSubject();

    const result = await actions.updateShelterSettings(
      settingsWith({ shelterName: "Renamed Shelter" })
    );
    expect(result.success).toBe(true);

    // The harness empties the audit store before every test, so the whole log
    // belongs to this call; the original's slice arithmetic is now dead weight.
    const recorded = auditLog.getAuditLogs(50).map((log) => log.action);
    expect(recorded).toContain("SETTINGS_UPDATED");
    expect(recorded).not.toContain("DONATION_QR_UPDATED");
  });

  it("scopes the QR entry to the four QR fields, so no credential rides along", async () => {
    const { actions, auditLog } = await loadSubject();

    await actions.updateShelterSettings(
      settingsWith({
        resendApiKey: "re_live_supersecret",
        duitNowQrUrl: "/uploads/new-duitnow.png",
      })
    );

    const entry = auditLog.getAuditLogs(50).find((log) => log.action === "DONATION_QR_UPDATED");
    expect(entry).toBeDefined();

    const details = entry!.details as unknown as QrDiff;
    expect(Object.keys(details.before).sort()).toEqual(QR_KEYS);
    expect(Object.keys(details.after).sort()).toEqual(QR_KEYS);
    // /admin/audit renders these details to any VIEW_AUDIT_LOG holder, so a
    // widened diff here would publish the live Resend key.
    expect(JSON.stringify(entry)).not.toContain("re_live_supersecret");
  });

  it("refuses the write, and logs nothing, for a session without MANAGE_SETTINGS", async () => {
    const { actions, auditLog, settingsRepository } = await loadSubject();
    await signInAs(ROLES.VOLUNTEER_COORDINATOR);

    const result = await actions.updateShelterSettings(
      settingsWith({ duitNowQrUrl: "/uploads/sneaky.png" })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("MANAGE_SETTINGS");
    expect(
      auditLog.getAuditLogs(50).some((log) => log.action === "DONATION_QR_UPDATED")
    ).toBe(false);
    // The refusal has to be a refusal to *write*, not merely a false return.
    expect((await settingsRepository.getServerSettingsAsync()).duitNowQrUrl).toBe("");
  });

  it("rejects an unsafe QR URL before it can reach the store", async () => {
    const { actions, auditLog, settingsRepository } = await loadSubject();

    const result = await actions.updateShelterSettings(
      settingsWith({ duitNowQrUrl: "javascript:alert(1)" })
    );

    expect(result.success).toBe(false);
    expect(
      auditLog.getAuditLogs(50).some((log) => log.action === "DONATION_QR_UPDATED")
    ).toBe(false);
    expect((await settingsRepository.getServerSettingsAsync()).duitNowQrUrl).toBe("");
  });
});
