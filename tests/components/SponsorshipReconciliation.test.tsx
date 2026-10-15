import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

vi.mock("@/actions/sponsorships", () => ({
  listPendingSponsorshipsAction: vi.fn(),
  reconcilePetSponsorshipAction: vi.fn(),
  rejectPetSponsorshipAction: vi.fn(),
}));

import {
  listPendingSponsorshipsAction,
  reconcilePetSponsorshipAction,
  rejectPetSponsorshipAction,
} from "@/actions/sponsorships";
import { SponsorshipReconciliation } from "@/components/admin/SponsorshipReconciliation";
import { renderWithLanguage, setupUser } from "./support/render";

const mockedListPending = vi.mocked(listPendingSponsorshipsAction);
const mockedReconcile = vi.mocked(reconcilePetSponsorshipAction);
const mockedReject = vi.mocked(rejectPetSponsorshipAction);

const pendingPledge = {
  pledgeRef: "HFS-PLG-20260914-ABCD",
  petName: "Bella",
  sponsorName: "Aisyah Rahman",
  sponsorEmail: "aisyah@example.com",
  tierName: "Core Vaccination & Deworming",
  amountDisplay: "RM 50.00",
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
  createdAt: "2026-09-14T12:00:00.000Z",
};

function queuePage(
  data: Array<typeof pendingPledge> = [pendingPledge],
  hasMore = false,
) {
  // `hasMore` is the lookahead contract the action is about to expose. Keeping
  // it in the test double now makes the pagination regression executable before
  // that field reaches the current action type.
  return { success: true as const, data, hasMore };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });

  return { promise, resolve };
}

function renderQueue() {
  return renderWithLanguage(<SponsorshipReconciliation />);
}

async function waitForPledge() {
  return screen.findByText(pendingPledge.pledgeRef);
}

function expectUnconfirmedOutcome(alert: HTMLElement) {
  expect(alert).toHaveTextContent(/outcome (?:is|remains) unconfirmed/i);
  expect(alert).toHaveTextContent(/reload.*before (?:trying|you try|retrying)/i);
  expect(alert).not.toHaveTextContent(/nothing was issued/i);
  expect(alert).not.toHaveTextContent(/still pending/i);
}

describe("SponsorshipReconciliation uncertain action outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListPending.mockResolvedValue(queuePage());
    mockedReconcile.mockResolvedValue({
      success: false,
      error: "stubbed confirmation",
    });
    mockedReject.mockResolvedValue({
      success: false,
      error: "stubbed dismissal",
    });
  });

  it("treats a rejected confirmation promise as unconfirmed and requires a reload before retry", async () => {
    mockedReconcile.mockRejectedValue(new Error("connection lost after dispatch"));
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    const alert = await screen.findByRole("alert");
    expectUnconfirmedOutcome(alert);
    expect(mockedReconcile).toHaveBeenCalledWith(pendingPledge.pledgeRef);
  });

  it("treats a rejected dismissal promise as unconfirmed and requires a reload before retry", async () => {
    mockedReject.mockRejectedValue(new Error("connection lost after dispatch"));
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(screen.getByRole("button", { name: /^dismiss$/i }));
    await user.click(screen.getByRole("button", { name: /dismiss pledge/i }));

    const alert = await screen.findByRole("alert");
    expectUnconfirmedOutcome(alert);
    expect(mockedReject).toHaveBeenCalledWith(pendingPledge.pledgeRef, "");
  });

  it("keeps the issuing progress step mounted while confirmation is unresolved", async () => {
    const pending = deferred<
      Awaited<ReturnType<typeof reconcilePetSponsorshipAction>>
    >();
    mockedReconcile.mockReturnValue(pending.promise);
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    expect(
      await screen.findByRole("button", { name: /issuing/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    await act(async () => {
      pending.resolve({ success: false, error: "stubbed confirmation" });
      await pending.promise;
    });
  });

  it("keeps the dismissing progress step mounted while dismissal is unresolved", async () => {
    const pending = deferred<
      Awaited<ReturnType<typeof rejectPetSponsorshipAction>>
    >();
    mockedReject.mockReturnValue(pending.promise);
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(screen.getByRole("button", { name: /^dismiss$/i }));
    await user.click(screen.getByRole("button", { name: /dismiss pledge/i }));

    expect(
      await screen.findByRole("button", { name: /dismissing/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    await act(async () => {
      pending.resolve({ success: false, error: "stubbed dismissal" });
      await pending.promise;
    });
  });

  it("preserves a refused dismissal's reason and retry step", async () => {
    mockedReject.mockResolvedValue({
      success: false,
      error: "The pledge could not be dismissed.",
    });
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(screen.getByRole("button", { name: /^dismiss$/i }));
    const reason = screen.getByLabelText(
      `Reason for dismissing ${pendingPledge.pledgeRef}`,
    );
    await user.type(reason, "No matching transfer after 30 days");
    await user.click(screen.getByRole("button", { name: /dismiss pledge/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be dismissed/i,
    );
    expect(screen.getByLabelText(/reason for dismissing/i)).toHaveValue(
      "No matching transfer after 30 days",
    );
    expect(
      screen.getByRole("button", { name: /dismiss pledge/i }),
    ).toBeEnabled();
    expect(mockedReject).toHaveBeenCalledWith(
      pendingPledge.pledgeRef,
      "No matching transfer after 30 days",
    );
  });
});

describe("SponsorshipReconciliation receipt copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListPending.mockResolvedValue(queuePage());
  });

  it("does not label an identifier-free pledge receipt as LHDN, Section 44, or tax", async () => {
    const { container } = renderQueue();

    await waitForPledge();

    // PendingSponsorshipDTO intentionally does not expose the supporter's tax
    // identifier. The queue therefore cannot truthfully promise tax treatment.
    expect(container).not.toHaveTextContent(/LHDN|Section 44\(6\)|tax(?:-| )?receipt/i);
    expect(
      screen
        .getByRole("button", { name: /confirm payment received/i })
        .getAttribute("title"),
    ).not.toMatch(/LHDN|Section 44\(6\)|\btax\b/i);
  });
});

describe("SponsorshipReconciliation queue continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListPending.mockResolvedValue(queuePage());
    mockedReconcile.mockResolvedValue({
      success: false,
      error: "stubbed confirmation",
    });
  });

  it("does not count an already reconciled receipt as issued by this session", async () => {
    const alreadyReconciled = {
      success: true as const,
      outcome: "already_reconciled" as const,
      receiptNumber: "HFS-DON-202609-0042",
    };
    mockedReconcile.mockResolvedValue(alreadyReconciled);
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    expect(
      await screen.findByText(alreadyReconciled.receiptNumber),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/receipts issued this session/i),
    ).not.toBeInTheDocument();
  });

  it("refreshes a drained page with more rows or withholds the all-reconciled claim", async () => {
    mockedListPending
      .mockResolvedValueOnce(queuePage([pendingPledge], true))
      .mockResolvedValueOnce(queuePage([], false));
    const reconciled = {
      success: true as const,
      outcome: "reconciled" as const,
      receiptNumber: "HFS-DON-202609-0043",
    };
    mockedReconcile.mockResolvedValue(reconciled);
    renderQueue();
    const user = setupUser();

    await waitForPledge();
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));
    await screen.findByText(reconciled.receiptNumber);

    await waitFor(() => {
      const refreshedFromServer = mockedListPending.mock.calls.length > 1;
      const claimsEverythingIsReconciled = screen.queryByText(
        /every commitment has been reconciled/i,
      );

      expect(
        refreshedFromServer || claimsEverythingIsReconciled === null,
      ).toBe(true);
    });
  });
});

/**
 * The queue asks the ledger for one row more than it renders, so truncation is
 * *observed* rather than guessed -- the same contract the statutory export uses.
 * Computing it and not showing it is what made that export silently drop receipts
 * from an annual return, and this queue is oldest-first and fed by an
 * unauthenticated public form, so what falls off the end is the newest genuine
 * claims. These pin the banner in both directions.
 */
describe("the queue says when it is truncated", () => {
  it("warns that older rows are shown when the lookahead found more", async () => {
    mockedListPending.mockResolvedValue(queuePage([pendingPledge], true));

    renderQueue();
    await waitForPledge();

    expect(
      await screen.findByText(/more than 1 commitments are awaiting confirmation/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/only the oldest are shown/i)).toBeInTheDocument();
  });

  it("says nothing about truncation when the page is the whole queue", async () => {
    mockedListPending.mockResolvedValue(queuePage([pendingPledge], false));

    renderQueue();
    await waitForPledge();

    expect(
      screen.queryByText(/awaiting confirmation/i),
    ).not.toBeInTheDocument();
  });
});
