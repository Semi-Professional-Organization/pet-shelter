import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CANONICAL_ROLES,
  PERMISSIONS,
  ROLES,
  normalizeRole,
  roleHasPermission,
} from "@/lib/security/permissions";
import { senFromInteger } from "@/lib/domain/money";
// Type-only, so it is erased at compile time: nothing here instantiates the
// repository ahead of a file's own vi.mock.
import type { SponsorshipDraft } from "@/lib/server/sponsorshipLedger";

/**
 * The sponsor portal shipped inert.
 *
 * `reconcilePetSponsorshipAction` was exported, RBAC-guarded and audited from PR #6,
 * and nothing called it. Every commitment stayed `PENDING_PAYMENT`, so no
 * `receiptNumber` was ever assigned — and the portal's account-claim challenge
 * requires one, which meant nobody could register an account at all. See
 * `tasks/open/sponsor-portal-is-inert-until-reconciliation-is-reachable.md` §1.
 *
 * These cover the read half that makes the mutation reachable, and the guard
 * equivalence the admin nav depends on.
 */

const currentRole = { value: null as string | null };

/**
 * The seeded staff account for each role.
 *
 * The actions guard through `requirePermission`, which re-reads the member behind
 * the cookie — Postgres first, then the in-memory seed when nothing is listening —
 * and only an id one of those stores vouches for survives it. With no database at
 * all the lookup throws and the cookie's own claims pass through. These ids resolve
 * to the same role and email on every path, so a case means the same thing with or
 * without a database on localhost.
 */
const SEEDED: Record<string, { id: string; email: string }> = {
  [ROLES.SUPER_ADMIN]: { id: "usr-admin-01", email: "admin@hopeforstrays.org" },
  [ROLES.VOLUNTEER_COORDINATOR]: { id: "usr-coord-01", email: "coordinator@hopeforstrays.org" },
  [ROLES.ANIMAL_MANAGER]: { id: "usr-animal-01", email: "animals@hopeforstrays.org" },
  [ROLES.CONTENT_EDITOR]: { id: "usr-editor-01", email: "content@hopeforstrays.org" },
  [ROLES.STAFF]: { id: "usr-staff-01", email: "staff@hopeforstrays.org" },
};

vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn(async () => {
    if (currentRole.value === null) return null;
    const seeded = SEEDED[currentRole.value];
    return {
      id: seeded.id,
      email: seeded.email,
      name: `Test ${currentRole.value}`,
      role: currentRole.value,
      expiresAt: Date.now() + 3_600_000,
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * Mirrors the tier catalogue's shape without depending on its prices.
 *
 * `amountSen` goes through `senFromInteger` because `Sen` is branded — a bare
 * `number` is deliberately not assignable, which is what stops a ringgit figure
 * being stored as if it were sen.
 */
function pledge(overrides: Partial<SponsorshipDraft> = {}): SponsorshipDraft {
  return {
    petId: "pet-1",
    petName: "Barnaby",
    sponsorName: "Nurul Huda binti Ahmad",
    sponsorEmail: "nurul.huda@example.com",
    tierId: "vaccine",
    tierName: "Core Vaccination & Deworming",
    frequency: "one_time",
    amountSen: senFromInteger(5000),
    paymentMethod: "online_banking",
    pledgeRef: "HFS-PLG-000001",
    ...overrides,
  };
}

describe("the reconciliation guard admits exactly who the mutation admits", () => {
  /**
   * K2 from the build gate, kept as a permanent guard rather than a one-off spike.
   *
   * The admin nav gates `/admin/donations` on RECONCILE_SPONSORSHIPS, and since
   * 2026-09-14 so do all three queue actions, through `requirePermission`. Until
   * then `reconcilePetSponsorshipAction` enforced `[ROLES.ADMIN, ROLES.COORDINATOR]`,
   * and the grant was chosen to equal that list. This pins that the migration
   * changed nobody's access: the set of roles that may reconcile is exactly the set
   * the old allow-list admitted.
   */
  it("grants RECONCILE_SPONSORSHIPS to precisely the roles the legacy allow-list admits", () => {
    const permissionHolders = (CANONICAL_ROLES as readonly string[]).filter((role) =>
      roleHasPermission(role, PERMISSIONS.RECONCILE_SPONSORSHIPS)
    );

    const legacyAdmits = (CANONICAL_ROLES as readonly string[]).filter((role) =>
      [ROLES.ADMIN, ROLES.COORDINATOR].some(
        (allowed) => normalizeRole(allowed) === normalizeRole(role)
      )
    );

    expect(permissionHolders).toEqual(legacyAdmits);
    expect(permissionHolders).toEqual(["SUPER_ADMIN", "VOLUNTEER_COORDINATOR"]);
  });

  it("does not hand receipt issuance to an editorial role", () => {
    // The reason this is its own permission rather than a reuse of MANAGE_CONTENT:
    // minting a statutory document from a gapless series is not content editing.
    expect(roleHasPermission(ROLES.CONTENT_EDITOR, PERMISSIONS.RECONCILE_SPONSORSHIPS)).toBe(
      false
    );
    expect(roleHasPermission(ROLES.ANIMAL_MANAGER, PERMISSIONS.RECONCILE_SPONSORSHIPS)).toBe(
      false
    );
    expect(roleHasPermission(ROLES.STAFF, PERMISSIONS.RECONCILE_SPONSORSHIPS)).toBe(false);
  });
});

describe("listPendingSponsorshipsAction", () => {
  beforeEach(() => {
    currentRole.value = null;
  });

  it("refuses an anonymous caller with a returned denial, not a thrown one", async () => {
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    // Returned rather than thrown: a production build masks a thrown Server Action
    // error into an opaque digest, so the page could not tell a denial from an
    // outage. This is the `fetchAuditLogsAction` shape — see
    // `tasks/open/donation-form-and-admin-denials-have-loose-ends.md` §1.
    const result = await listPendingSponsorshipsAction();
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/Authentication required/i);
  });

  it.each([ROLES.CONTENT_EDITOR, ROLES.ANIMAL_MANAGER, ROLES.STAFF])(
    "refuses a %s by name, naming the missing permission",
    async (role) => {
      currentRole.value = role;
      const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

      const result = await listPendingSponsorshipsAction();
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toMatch(/RECONCILE_SPONSORSHIPS/);
      // And not the read-failure message: a denial is not an outage.
      expect(result.error).not.toMatch(/empty queue/i);
    }
  );

  it("returns only commitments awaiting payment, oldest first", async () => {
    const { recordSponsorshipPledge, reconcileSponsorship } = await import(
      "@/lib/server/sponsorshipLedger"
    );
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000001" }));
    await recordSponsorshipPledge(
      pledge({ pledgeRef: "HFS-PLG-000002", sponsorName: "Chong Wei" })
    );
    await recordSponsorshipPledge(
      pledge({ pledgeRef: "HFS-PLG-000003", sponsorName: "Already Paid" })
    );
    await reconcileSponsorship("HFS-PLG-000003", "HFS-DON-202609-0001", "coordinator@x.org");

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const result = await listPendingSponsorshipsAction();

    expect(result.success).toBe(true);
    const refs = result.data!.map((r) => r.pledgeRef);
    // The settled one is gone; a reconciled commitment is not work.
    expect(refs).not.toContain("HFS-PLG-000003");
    expect(refs).toEqual(["HFS-PLG-000001", "HFS-PLG-000002"]);
  });

  it("is a work queue, so the longest-waiting supporter sorts first", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000010" }));
    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000011" }));

    currentRole.value = ROLES.SUPER_ADMIN;
    const result = await listPendingSponsorshipsAction();

    const timestamps = result.data!.map((r) => Date.parse(r.createdAt));
    // Every other list in the ledger is newest-first; this one is deliberately not.
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("uses one-row lookahead so a full page cannot masquerade as the end", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    for (let index = 0; index < 201; index += 1) {
      await recordSponsorshipPledge(
        pledge({ pledgeRef: `HFS-PLG-PAGE-${String(index).padStart(6, "0")}` })
      );
    }

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const result = await listPendingSponsorshipsAction();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(200);
    expect(result.hasMore).toBe(true);
  });

  it("projects no tax identifier onto the coordinator's screen", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ taxIdOrIc: "920512-10-5432" }));

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const result = await listPendingSponsorshipsAction();

    // Confirming a bank transfer landed does not require the supporter's NRIC, so
    // the DTO does not carry one. Serialising it to the browser would be a statutory
    // identifier on screen for no purpose.
    expect(result.data![0]).not.toHaveProperty("taxIdOrIc");
    expect(JSON.stringify(result.data)).not.toContain("920512-10-5432");
  });

  it("preformats money rather than shipping sen to the client", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ amountSen: senFromInteger(12050) }));

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const result = await listPendingSponsorshipsAction();

    expect(result.data![0].amountDisplay).toContain("120.50");
  });
});

describe("a failed read is reported as a failure, never as an empty queue", () => {
  beforeEach(() => {
    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
  });

  it("returns success:false rather than [] when the ledger read throws", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    const spy = vi
      .spyOn(ledger, "listPendingSponsorships")
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

    const result = await listPendingSponsorshipsAction();

    // An empty array is a *claim* that every supporter has been settled, and a
    // coordinator who believes it stops looking. The two must not look alike.
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/not an empty queue/i);

    spy.mockRestore();
  });
});

describe("reconcilePetSponsorshipAction issues exactly one receipt per pledge", () => {
  beforeEach(() => {
    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
  });

  it("issues one receipt when two coordinators confirm the same pledge at once", async () => {
    const { recordSponsorshipPledge, findSponsorshipByPledgeRef } = await import(
      "@/lib/server/sponsorshipLedger"
    );
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { reconcilePetSponsorshipAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000020" }));

    // Both calls start before either has written. Before the fix, each found the
    // pledge pending, each drew a serial, and the loser's receipt was left attached
    // to nothing — a statutory document for money that has one receipt already.
    const [first, second] = await Promise.all([
      reconcilePetSponsorshipAction("HFS-PLG-000020"),
      reconcilePetSponsorshipAction("HFS-PLG-000020"),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // The loser is told the number that exists, not a number of its own.
    expect(first.receiptNumber).toBe(second.receiptNumber);
    expect(
      [first, second]
        .map((result) => (result as typeof result & { outcome?: string }).outcome)
        .sort()
    ).toEqual(["already_reconciled", "reconciled"]);

    const issued = await listDonations();
    expect(issued.map((d) => d.receiptNumber)).toEqual([first.receiptNumber]);

    const stored = await findSponsorshipByPledgeRef("HFS-PLG-000020");
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.receiptNumber).toBe(first.receiptNumber);

    // The loser's serial rolled back with its receipt: the next commitment settled
    // draws 0002, not 0003. That is the gapless property, kept across a lost race.
    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000021" }));
    const next = await reconcilePetSponsorshipAction("HFS-PLG-000021");
    expect(next.receiptNumber).toMatch(/-0002$/);
  });

  it("refuses an anonymous caller with a returned denial, like its siblings", async () => {
    currentRole.value = null;
    const { reconcilePetSponsorshipAction } = await import("@/actions/sponsorships");

    // Confirm and Dismiss sit on the same row; one throwing its denial while the
    // other returned it would show a coordinator two different stories.
    const result = await reconcilePetSponsorshipAction("HFS-PLG-000020");
    expect(result.success).toBe(false);
    expect(result.receiptNumber).toBeUndefined();
    expect(result.error).toMatch(/Authentication required/i);
  });

  it("refuses a STAFF account with a returned denial", async () => {
    currentRole.value = ROLES.STAFF;
    const { recordSponsorshipPledge, findSponsorshipByPledgeRef } = await import(
      "@/lib/server/sponsorshipLedger"
    );
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { reconcilePetSponsorshipAction } = await import("@/actions/sponsorships");

    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000023" }));
    const result = await reconcilePetSponsorshipAction("HFS-PLG-000023");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorized/i);
    // Denied before anything moved: still pending, nothing drawn.
    expect((await findSponsorshipByPledgeRef("HFS-PLG-000023"))?.status).toBe("PENDING_PAYMENT");
    expect(await listDonations()).toEqual([]);
  });

  it("refuses to reconcile a pledge that was dismissed", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { reconcilePetSponsorshipAction, rejectPetSponsorshipAction } = await import(
      "@/actions/sponsorships"
    );

    await recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000022" }));
    expect(await rejectPetSponsorshipAction("HFS-PLG-000022")).toEqual({ success: true });

    const result = await reconcilePetSponsorshipAction("HFS-PLG-000022");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
    // The Postgres branch has always refused this through its conditional UPDATE;
    // the memory branch used to reconcile it. Both now say no, and nothing is drawn.
    expect(await listDonations()).toEqual([]);
  });
});

describe("the queue breaks a same-millisecond tie in recording order", () => {
  it("lists three pledges recorded at one instant in the order they were made", async () => {
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const { listPendingSponsorshipsAction } = await import("@/actions/sponsorships");

    const instant = new Date("2026-09-14T04:00:00.000Z");
    for (const pledgeRef of ["HFS-PLG-000031", "HFS-PLG-000032", "HFS-PLG-000033"]) {
      await recordSponsorshipPledge(pledge({ pledgeRef }), { now: instant });
    }

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const result = await listPendingSponsorshipsAction();

    // Equal `createdAt` on all three. The memory ledger stores newest-first, so a
    // sort on `createdAt` alone would leave the queue backwards; the `id` tiebreak
    // — a zero-padded serial in memory — is what pins recording order.
    expect(result.data!.map((r) => r.pledgeRef)).toEqual([
      "HFS-PLG-000031",
      "HFS-PLG-000032",
      "HFS-PLG-000033",
    ]);
  });
});

describe("rejectPetSponsorshipAction", () => {
  beforeEach(() => {
    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
  });

  it("removes an unpaid pledge from the queue without issuing anything", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");
    const { listPendingSponsorshipsAction, rejectPetSponsorshipAction } = await import(
      "@/actions/sponsorships"
    );

    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000040" }));
    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000041" }));

    const result = await rejectPetSponsorshipAction(
      "HFS-PLG-000040",
      "No transfer received after 30 days"
    );
    expect(result).toEqual({ success: true });

    const queue = await listPendingSponsorshipsAction();
    expect(queue.data!.map((r) => r.pledgeRef)).toEqual(["HFS-PLG-000041"]);

    const stored = await ledger.findSponsorshipByPledgeRef("HFS-PLG-000040");
    expect(stored?.status).toBe("CANCELLED");
    expect(stored?.receiptNumber).toBeNull();
    // The supporter's own note is not where a coordinator's reason goes: `notes`
    // is copied onto the receipt if the row is ever reconciled.
    expect(stored?.notes).toBeUndefined();
    expect(await listDonations()).toEqual([]);

    // The reason and the actor live in the audit trail.
    const entry = getAuditLogs().find((e) => e.action === "SPONSORSHIP_REJECTED");
    expect(entry).toMatchObject({
      actorEmail: "coordinator@hopeforstrays.org",
      entity: "PetSponsorship",
      entityId: "HFS-PLG-000040",
      details: { pledgeRef: "HFS-PLG-000040", reason: "No transfer received after 30 days" },
    });
  });

  it("refuses to dismiss a pledge that already has a receipt", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { reconcilePetSponsorshipAction, rejectPetSponsorshipAction } = await import(
      "@/actions/sponsorships"
    );

    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000042" }));
    const settled = await reconcilePetSponsorshipAction("HFS-PLG-000042");
    expect(settled.success).toBe(true);

    const result = await rejectPetSponsorshipAction("HFS-PLG-000042", "changed my mind");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been reconciled/i);

    const stored = await ledger.findSponsorshipByPledgeRef("HFS-PLG-000042");
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.receiptNumber).toBe(settled.receiptNumber);
  });

  it("rejects a runtime non-string reason before the ledger mutation", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");

    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000043" }));
    const rejectSpy = vi.spyOn(ledger, "rejectPendingSponsorship");

    try {
      const result = await rejectPetSponsorshipAction(
        "HFS-PLG-000043",
        42 as unknown as string
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/reason/i);
      expect(rejectSpy).not.toHaveBeenCalled();
      expect((await ledger.findSponsorshipByPledgeRef("HFS-PLG-000043"))?.status).toBe(
        "PENDING_PAYMENT"
      );
    } finally {
      rejectSpy.mockRestore();
    }
  });

  it("reports an unknown pledge rather than inventing one", async () => {
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");
    const result = await rejectPetSponsorshipAction("HFS-PLG-20260101-000000");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No sponsorship found/i);
  });

  it("refuses an anonymous caller with a returned denial", async () => {
    currentRole.value = null;
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");
    const result = await rejectPetSponsorshipAction("HFS-PLG-000040");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Authentication required/i);
  });

  it("refuses a STAFF account, naming the missing permission", async () => {
    currentRole.value = ROLES.STAFF;
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");
    const result = await rejectPetSponsorshipAction("HFS-PLG-000040");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/RECONCILE_SPONSORSHIPS/);
  });
});

describe("the queue's arguments are checked before anything is written", () => {
  beforeEach(() => {
    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
  });

  it("refuses a pledge reference that is not a string, on both mutations", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { reconcilePetSponsorshipAction, rejectPetSponsorshipAction } = await import(
      "@/actions/sponsorships"
    );

    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000050" }));
    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000051" }));

    // Server Action arguments are deserialised, not typed. Prisma's `where` would
    // read this object as a filter, and a filter matching every pending row would
    // have cancelled every pending pledge in one statement.
    const crafted = { not: "" } as unknown as string;
    expect(await rejectPetSponsorshipAction(crafted)).toEqual({
      success: false,
      error: expect.stringMatching(/No sponsorship found/),
    });
    expect(await reconcilePetSponsorshipAction(crafted)).toEqual({
      success: false,
      error: expect.stringMatching(/No sponsorship found/),
    });

    const pending = await ledger.listPendingSponsorships();
    expect(pending.map((r) => r.pledgeRef)).toEqual(["HFS-PLG-000050", "HFS-PLG-000051"]);
    expect(await listDonations()).toEqual([]);
  });

  it("refuses a reason that is over length or not text, leaving the pledge pending", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");

    await ledger.recordSponsorshipPledge(pledge({ pledgeRef: "HFS-PLG-000052" }));

    // Refused, not truncated: the audit row must never carry a note the coordinator
    // did not write, and a bad argument must fail before the row flips.
    const tooLong = await rejectPetSponsorshipAction("HFS-PLG-000052", "x".repeat(501));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error).toMatch(/500/);

    const notText = await rejectPetSponsorshipAction("HFS-PLG-000052", 123 as unknown as string);
    expect(notText.success).toBe(false);
    expect(notText.error).toMatch(/must be text/i);

    expect((await ledger.findSponsorshipByPledgeRef("HFS-PLG-000052"))?.status).toBe(
      "PENDING_PAYMENT"
    );
    expect(getAuditLogs().find((e) => e.action === "SPONSORSHIP_REJECTED")).toBeUndefined();
  });

  it("accepts exactly 500 characters and records nullish reasons as no reason", async () => {
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");
    const { rejectPetSponsorshipAction } = await import("@/actions/sponsorships");
    const refs = ["HFS-PLG-000053", "HFS-PLG-000054", "HFS-PLG-000055"] as const;

    for (const pledgeRef of refs) {
      await ledger.recordSponsorshipPledge(pledge({ pledgeRef }));
    }

    const exactLimit = "x".repeat(500);
    expect(await rejectPetSponsorshipAction(refs[0], exactLimit)).toEqual({ success: true });
    expect(await rejectPetSponsorshipAction(refs[1], undefined)).toEqual({ success: true });
    expect(
      await rejectPetSponsorshipAction(refs[2], null)
    ).toEqual({ success: true });

    const rejectionReason = (pledgeRef: string) =>
      getAuditLogs().find(
        (entry) =>
          entry.action === "SPONSORSHIP_REJECTED" && entry.entityId === pledgeRef
      )?.details?.reason;

    expect(rejectionReason(refs[0])).toBe(exactLimit);
    expect(rejectionReason(refs[1])).toBeNull();
    expect(rejectionReason(refs[2])).toBeNull();
  });
});

describe("a settled commitment its supporter later withdrew still names its receipt", () => {
  it("reports the existing receipt to Confirm and refuses Dismiss by number", async () => {
    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { reconcilePetSponsorshipAction, rejectPetSponsorshipAction } = await import(
      "@/actions/sponsorships"
    );

    await ledger.recordSponsorshipPledge(
      pledge({ pledgeRef: "HFS-PLG-000060", userId: "spn-test-01", frequency: "monthly" })
    );
    const settled = await reconcilePetSponsorshipAction("HFS-PLG-000060");
    expect(settled.success).toBe(true);

    // The supporter cancels their recurring pledge from the portal. The row is
    // CANCELLED but keeps the receipt the money already has — and that receipt,
    // not the status, is what a coordinator with a stale queue needs to hear.
    expect(await ledger.cancelSponsorshipForUser("spn-test-01", "HFS-PLG-000060")).not.toBeNull();

    expect(await reconcilePetSponsorshipAction("HFS-PLG-000060")).toEqual({
      success: true,
      outcome: "already_reconciled",
      receiptNumber: settled.receiptNumber,
    });
    const dismissed = await rejectPetSponsorshipAction("HFS-PLG-000060");
    expect(dismissed.success).toBe(false);
    expect(dismissed.error).toContain(settled.receiptNumber);
  });
});
