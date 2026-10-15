"use client";

import {
  listPendingDonationPledgesAction,
  reconcileDonationPledgeAction,
  rejectDonationPledgeAction,
} from "@/actions/donations";
import {
  ReconciliationQueue,
  type QueueOutcome,
  type ReconciliationQueueSource,
} from "@/components/admin/ReconciliationQueue";

/**
 * The coordinator's queue of general gifts awaiting confirmation.
 *
 * The read half of the boundary added on 2026-09-22. Before it, the public
 * donation form issued an official `HFS-DON-*` Section 44(6) receipt on
 * submission, from the donor's word alone. Now the gift waits here, and
 * confirming a row is the only thing in the application that draws its receipt.
 *
 * This screen is not optional furniture: without it every gift would sit in
 * `PENDING_PAYMENT` with no way out, which is precisely the shape of
 * `tasks/open/sponsor-portal-is-inert-until-reconciliation-is-reachable.md` —
 * a guarded reconciliation action that existed for months with no caller.
 *
 * Module-level for the reason `SponsorshipReconciliation` gives: `source.load` is
 * a dependency of the queue's mount effect, and a per-render object literal would
 * turn that effect into a refetch loop.
 */
const DONATION_PLEDGE_QUEUE: ReconciliationQueueSource = {
  title: "General Donation Reconciliation",
  blurb: (
    <>
      Confirm a transfer has landed to issue the donor&apos;s official receipt. Match the{" "}
      <span className="font-mono font-semibold">HFS-GFT</span> reference against your bank
      statement — a pledge reference is not a receipt number, and no receipt exists for these
      gifts until you confirm one here. Dismiss a gift that no transfer ever backed.
    </>
  ),
  plural: "gifts",
  emptyBody:
    "Every gift has been reconciled. New pledges appear here as donors complete the donation form.",

  async load(): Promise<QueueOutcome> {
    const result = await listPendingDonationPledgesAction();
    if (result.success && result.data) {
      return {
        hasMore: result.hasMore === true,
        rows: result.data.map((row) => ({
          pledgeRef: row.pledgeRef,
          supporterName: row.donorName,
          supporterEmail: row.donorEmail,
          // The dedication is the donor's own free text and is not a pet reference,
          // so it is shown as a dedication rather than as a sponsorship target.
          purpose: row.targetPetName
            ? `${row.tierName} · in honour of ${row.targetPetName}`
            : row.tierName,
          amountDisplay: row.amountDisplay,
          frequency: row.frequency,
          paymentMethod: row.paymentMethod,
          createdAt: row.createdAt,
        })),
      };
    }
    return { error: result.error ?? "Could not load the pending gifts." };
  },

  confirm: reconcileDonationPledgeAction,
  dismiss: rejectDonationPledgeAction,
};

export function DonationPledgeReconciliation() {
  return <ReconciliationQueue source={DONATION_PLEDGE_QUEUE} />;
}
