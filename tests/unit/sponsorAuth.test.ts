import { describe, it, expect, beforeEach, vi } from "vitest";

const cookieStore = new Map<string, { name: string; value: string }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      if (options?.maxAge === 0) cookieStore.delete(name);
      else cookieStore.set(name, { name, value });
    },
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendCaretakerQuestionEmail: vi.fn(async () => ({ success: true })),
}));

import {
  registerSponsorAction,
  sponsorLoginAction,
  sponsorLogoutAction,
  updateWallPreferenceAction,
  submitCaretakerQuestionAction,
  cancelRecurringPledgeAction,
} from "@/actions/sponsors";
import {
  SPONSOR_SESSION_COOKIE_NAME,
  sealSponsorSession,
  unsealSponsorSession,
} from "@/lib/security/sponsorSession";
import {
  SESSION_COOKIE_NAME,
  sealSession,
  unsealSession,
} from "@/lib/security/session";
import { getSponsorDashboard, getSponsorWall } from "@/lib/domain/sponsorAccess";
import { resetSponsorRepository } from "@/lib/server/sponsorRepository";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import {
  listSponsorshipsByEmail,
  listSponsorshipsByUserId,
} from "@/lib/server/sponsorshipLedger";
import { sendCaretakerQuestionEmail } from "@/lib/email";
import { getAuditLogs } from "@/lib/domain/auditLog";
import { seedOfflineSponsorships } from "@/lib/server/sponsorDemoSeed";
import { deriveTier } from "@/lib/domain/supporterTier";

/**
 * Seeded pledge that no account has claimed yet.
 *
 * The receipt number is looked up rather than hard-coded: the ledger allocates it from
 * a sequence now, so a literal here would pin a number this repository does not choose.
 */
const UNCLAIMED = {
  email: "unclaimed@example.com",
  name: "Tan Wei Ming",
  receiptNumber: "",
};

async function loadUnclaimedReceipt(): Promise<string> {
  await seedOfflineSponsorships();
  const [commitment] = await listSponsorshipsByEmail(UNCLAIMED.email);
  if (!commitment?.receiptNumber) {
    throw new Error("Expected a seeded, reconciled unclaimed commitment");
  }
  return commitment.receiptNumber;
}

const STRONG_PASSWORD = "correct-horse-battery";

describe("Sponsor registration", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetSponsorRepository();
    resetRateLimitStore();
    UNCLAIMED.receiptNumber = await loadUnclaimedReceipt();
  });

  it("claims an unattached pledge when the receipt number matches the email", async () => {
    const result = await registerSponsorAction({
      name: UNCLAIMED.name,
      email: UNCLAIMED.email,
      password: STRONG_PASSWORD,
      receiptNumber: UNCLAIMED.receiptNumber,
      displayOnWall: false,
    });

    expect(result.success).toBe(true);
    expect(result.linkedContributions).toBe(1);
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(true);

    const dashboard = await getSponsorDashboard();
    expect(dashboard!.name).toBe(UNCLAIMED.name);
    expect(dashboard!.rescues.map((rescue) => rescue.petId)).toContain("pet-001");
  });

  it("refuses a receipt number that belongs to a different donor", async () => {
    // The whole point of the challenge: without it, registering with someone else's
    // address would hand over their standing, their rescues and their gated media.
    const result = await registerSponsorAction({
      name: "Impostor",
      email: "impostor@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: UNCLAIMED.receiptNumber,
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(false);
  });

  it("refuses a commitment that has not been reconciled", async () => {
    // The regression this exists for: sponsorship checkout is public and hands the caller
    // back the pledgeRef it just minted, so an attacker could pledge RM 10 as someone
    // else and quote it to claim their account. Only a reconciled commitment carries a
    // receipt number, and reconciling is a coordinator's act.
    await seedOfflineSponsorships();
    const [unpaid] = await listSponsorshipsByEmail("pending@example.com");

    expect(unpaid.status).toBe("PENDING_PAYMENT");
    expect(unpaid.receiptNumber).toBeFalsy();

    const result = await registerSponsorAction({
      name: "Siti Nurhaliza",
      email: "pending@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: unpaid.pledgeRef.replace("HFS-PLG", "HFS-DON"),
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
  });

  it("grants no standing for an unreconciled commitment, however large", async () => {
    // RM 5,000 pledged, nothing paid. Counting it would make the public checkout form a
    // self-service route to Gold.
    await seedOfflineSponsorships();
    const [unpaid] = await listSponsorshipsByEmail("pending@example.com");

    expect(deriveTier([unpaid])).toBeNull();
  });

  it("refuses a receipt number that does not exist", async () => {
    const result = await registerSponsorAction({
      name: "Nobody",
      email: "nobody@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: "HFS-DON-209912-0001",
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
  });

  it("gives the same message for a missing receipt and a mismatched one", async () => {
    // Distinct messages would turn the form into a receipt-number oracle.
    const missing = await registerSponsorAction({
      name: "Nobody",
      email: "nobody@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: "HFS-DON-209912-0001",
      displayOnWall: false,
    });
    const mismatched = await registerSponsorAction({
      name: "Impostor",
      email: "impostor@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: UNCLAIMED.receiptNumber,
      displayOnWall: false,
    });

    expect(missing.error).toBe(mismatched.error);
  });

  it("rejects a malformed receipt number before any lookup", async () => {
    const result = await registerSponsorAction({
      name: UNCLAIMED.name,
      email: UNCLAIMED.email,
      password: STRONG_PASSWORD,
      receiptNumber: "not-a-receipt",
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a password under ten characters", async () => {
    const result = await registerSponsorAction({
      name: UNCLAIMED.name,
      email: UNCLAIMED.email,
      password: "short",
      receiptNumber: UNCLAIMED.receiptNumber,
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
  });

  it("refuses to register an email that already has an account", async () => {
    await seedOfflineSponsorships();
    const [bronzeDonation] = await listSponsorshipsByEmail("bronze@example.com");

    const result = await registerSponsorAction({
      name: "Nurul Aisyah",
      email: "bronze@example.com",
      password: STRONG_PASSWORD,
      receiptNumber: bronzeDonation.receiptNumber!,
      displayOnWall: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("inherits the checkout consent when the registrant expresses no preference", async () => {
    // The seeded unclaimed pledge was made with the wall box ticked, so a claim form that
    // says nothing about it should not silently discard that choice.
    const result = await registerSponsorAction({
      name: UNCLAIMED.name,
      email: UNCLAIMED.email,
      password: STRONG_PASSWORD,
      receiptNumber: UNCLAIMED.receiptNumber,
    });

    expect(result.success).toBe(true);
    expect((await getSponsorDashboard())!.displayOnWall).toBe(true);
  });

  it("lets the registrant withdraw a consent they gave at checkout", async () => {
    // Consent is the most recent expression, not a sticky OR. Previously
    // `parsed.displayOnWall || consentedAtCheckout` republished a donor who had just
    // deliberately unticked the box.
    const result = await registerSponsorAction({
      name: UNCLAIMED.name,
      email: UNCLAIMED.email,
      password: STRONG_PASSWORD,
      receiptNumber: UNCLAIMED.receiptNumber,
      displayOnWall: false,
    });

    expect(result.success).toBe(true);
    expect((await getSponsorDashboard())!.displayOnWall).toBe(false);
  });
});

describe("Sponsor login", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetSponsorRepository();
    resetRateLimitStore();
    UNCLAIMED.receiptNumber = await loadUnclaimedReceipt();
  });

  it("signs in a seeded sponsor with the right password", async () => {
    const result = await sponsorLoginAction({
      email: "silver@example.com",
      password: "silver123",
    });

    expect(result.success).toBe(true);
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(true);
    expect((await getSponsorDashboard())!.tier).toBe("SILVER");
  });

  it("does NOT accept the staff development password '1234'", async () => {
    // `loginAction` in @/actions/auth accepts "1234" for any staff account. Sponsor
    // authentication deliberately does not go through that code path, and this test is
    // what stops the backdoor being reintroduced by a future refactor that "unifies" them.
    const result = await sponsorLoginAction({
      email: "gold@example.com",
      password: "1234",
    });

    expect(result.success).toBe(false);
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(false);
  });

  it("rejects a wrong password with the same message as an unknown email", async () => {
    const wrongPassword = await sponsorLoginAction({
      email: "gold@example.com",
      password: "definitely-not-it",
    });
    const unknownEmail = await sponsorLoginAction({
      email: "no-such-sponsor@example.com",
      password: "definitely-not-it",
    });

    expect(wrongPassword.success).toBe(false);
    expect(unknownEmail.success).toBe(false);
    expect(wrongPassword.error).toBe(unknownEmail.error);
  });

  it("rate limits repeated sign-in attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sponsorLoginAction({ email: "gold@example.com", password: "wrong" });
    }

    const limited = await sponsorLoginAction({
      email: "gold@example.com",
      password: "gold123",
    });

    expect(limited.success).toBe(false);
    expect(limited.error).toContain("Too many");
  });

  it("clears the sponsor session on sign out", async () => {
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(true);

    await sponsorLogoutAction();
    expect(cookieStore.has(SPONSOR_SESSION_COOKIE_NAME)).toBe(false);
    expect(await getSponsorDashboard()).toBeNull();
  });

  it("does not let a sponsor token pass as a staff session", async () => {
    // Both namespaces are signed with the same HMAC key, so a signature check alone
    // cannot say which one a token came from. Without a type claim, pasting a sponsor
    // cookie into hope_shelter_session yielded a SessionUser with no role.
    const sponsorToken = sealSponsorSession({
      sponsorId: "spn-gold-01",
      email: "gold@example.com",
      name: "Datin Sofia Rahman",
    });

    expect(unsealSession(sponsorToken)).toBeNull();
  });

  it("does not let a staff token pass as a sponsor session", async () => {
    const staffToken = sealSession({
      id: "usr-admin-01",
      email: "admin@hopeforstrays.org",
      name: "Dr. Sarah Tan",
      role: "ADMIN",
    });

    expect(unsealSponsorSession(staffToken)).toBeNull();
  });

  it("uses a different cookie from the staff session", async () => {
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });

    expect(SPONSOR_SESSION_COOKIE_NAME).not.toBe(SESSION_COOKIE_NAME);
    expect(cookieStore.has(SESSION_COOKIE_NAME)).toBe(false);
  });
});

describe("Sponsor Wall preference", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetSponsorRepository();
    resetRateLimitStore();
    UNCLAIMED.receiptNumber = await loadUnclaimedReceipt();
  });

  it("refuses to change a preference for a signed-out visitor", async () => {
    const result = await updateWallPreferenceAction(true);
    expect(result.success).toBe(false);
  });

  it("removes a sponsor from the wall when they opt out", async () => {
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });

    expect((await getSponsorWall()).GOLD.map((e) => e.name)).toContain(
      "Datin Sofia Rahman"
    );

    await updateWallPreferenceAction(false);

    expect((await getSponsorWall()).GOLD.map((e) => e.name)).not.toContain(
      "Datin Sofia Rahman"
    );
  });
});

describe("Cancelling a recurring pledge", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetSponsorRepository();
    resetRateLimitStore();
    UNCLAIMED.receiptNumber = await loadUnclaimedReceipt();
  });

  /** Cancellation is addressed by pledge reference, not by receipt number. */
  async function goldRecurringPledgeRef(): Promise<string> {
    await seedOfflineSponsorships();
    const commitments = await listSponsorshipsByUserId("spn-gold-01");
    const monthly = commitments.find((c) => c.frequency === "monthly");
    if (!monthly) throw new Error("Expected a seeded recurring commitment");
    return monthly.pledgeRef;
  }

  it("drops the standing immediately, which is what makes the decay branch reachable", async () => {
    // Before this action existed, `isActive` was written true everywhere and false
    // nowhere, so the documented "cancelling drops the standing" behaviour was
    // unreachable by any code path.
    const pledgeRef = await goldRecurringPledgeRef();
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });
    expect((await getSponsorDashboard())!.tier).toBe("GOLD");

    const result = await cancelRecurringPledgeAction(pledgeRef);
    expect(result.success).toBe(true);

    const after = await getSponsorDashboard();
    expect(after!.tier).toBe("BRONZE");
    expect(after!.hasActiveRecurring).toBe(false);
  });

  it("refuses a receipt number belonging to another sponsor", async () => {
    const pledgeRef = await goldRecurringPledgeRef();
    await sponsorLoginAction({ email: "silver@example.com", password: "silver123" });

    const result = await cancelRecurringPledgeAction(pledgeRef);

    expect(result.success).toBe(false);
    expect((await getSponsorWall()).GOLD.map((e) => e.name)).toContain(
      "Datin Sofia Rahman"
    );
  });

  it("refuses a signed-out caller", async () => {
    expect(
      (await cancelRecurringPledgeAction(await goldRecurringPledgeRef())).success
    ).toBe(false);
  });
});

describe("Caretaker Q&A (Gold privilege)", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetSponsorRepository();
    resetRateLimitStore();
    vi.clearAllMocks();
  });

  it("refuses a signed-out caller", async () => {
    const result = await submitCaretakerQuestionAction(
      "How is Luna's recovery going this week?"
    );
    expect(result.success).toBe(false);
  });

  it("refuses a Silver sponsor even though the action is reachable", async () => {
    // The Server Action is a public endpoint. Rendering the form behind <TierGate> stops
    // nobody who calls it directly, so authorization has to live in the action itself.
    await sponsorLoginAction({ email: "silver@example.com", password: "silver123" });

    const result = await submitCaretakerQuestionAction(
      "How is Bella's recovery going this week?"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Gold");
  });

  it("accepts a question from a Gold sponsor and actually delivers it", async () => {
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });

    const result = await submitCaretakerQuestionAction(
      "How is Luna's hydrotherapy progressing?"
    );

    expect(result.success).toBe(true);

    // The UI tells the sponsor the message was sent to the care team, so it has to be.
    // Dispatch is non-blocking, so let the microtask queue drain first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendCaretakerQuestionEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendCaretakerQuestionEmail).mock.calls[0][0]).toMatchObject({
      sponsorEmail: "gold@example.com",
      tier: "Gold",
      message: "How is Luna's hydrotherapy progressing?",
    });
  });

  it("keeps the message body in the audit trail, not just its length", async () => {
    // If the mail provider is down this entry is the only surviving record of a message
    // the sponsor has already been told was sent.
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });
    await submitCaretakerQuestionAction("Is Cleo eating well after her move?");

    const entry = getAuditLogs().find(
      (log) => log.action === "CARETAKER_QUESTION_SUBMITTED"
    );

    expect(entry?.details?.message).toBe("Is Cleo eating well after her move?");
  });

  it("does not dispatch anything when the sponsor is under Gold", async () => {
    await sponsorLoginAction({ email: "silver@example.com", password: "silver123" });
    await submitCaretakerQuestionAction("Can I visit Bella this weekend?");

    // "Not called yet" alone proves nothing for a non-blocking dispatch: one slower
    // than whatever the test waited for passes it. A Gold question sent afterwards
    // takes the same path, so once its email has arrived, one the Silver attempt
    // queued earlier would have arrived too.
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });
    await submitCaretakerQuestionAction("How is Luna's hydrotherapy progressing?");
    await vi.waitFor(() =>
      expect(sendCaretakerQuestionEmail).toHaveBeenCalledWith(
        expect.objectContaining({ sponsorEmail: "gold@example.com" })
      )
    );

    expect(sendCaretakerQuestionEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty or oversized message from a Gold sponsor", async () => {
    await sponsorLoginAction({ email: "gold@example.com", password: "gold123" });

    expect((await submitCaretakerQuestionAction("hi")).success).toBe(false);
    expect((await submitCaretakerQuestionAction("x".repeat(2001))).success).toBe(false);
  });
});
