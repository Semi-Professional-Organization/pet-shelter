"use client";

import {
  listPendingSponsorshipsAction,
  reconcilePetSponsorshipAction,
  rejectPetSponsorshipAction,
} from "@/actions/sponsorships";
import {
  ReconciliationQueue,
  type QueueOutcome,
  type ReconciliationQueueSource,
} from "@/components/admin/ReconciliationQueue";

/**
 * The coordinator's queue of pet sponsorships awaiting confirmation.
 *
 * All of the behaviour lives in `ReconciliationQueue`; this file is the adapter
 * that names the sponsorship actions and normalises their DTO. The screen was
 * generalised on 2026-09-22 when general gifts gained the same lifecycle — two
 * queues exist only because the money lives in two tables, and a coordinator
 * reading one bank statement does the same thing to both.
 *
 * **Module-level, not built in render.** `source.load` is a dependency of the
 * queue's mount effect. A fresh object literal each render would give it a new
 * identity every time, re-running the effect on its own result — a refetch loop.
 * Server Action imports are stable module bindings, so a module-level constant is
 * the correct lifetime for this.
 */
const SPONSORSHIP_QUEUE: ReconciliationQueueSource = {
  title: "Sponsorship Payment Reconciliation",
  blurb: (
    <>
      Confirm a transfer has landed to issue the supporter&apos;s official receipt. Match the{" "}
      <span className="font-mono font-semibold">HFS-PLG</span> reference against your bank
      statement — a pledge reference is not a receipt number. Dismiss a pledge that no transfer
      ever backed.
    </>
  ),
  plural: "commitments",
  emptyBody:
    "Every commitment has been reconciled. New pledges appear here as supporters complete checkout.",

  async load(): Promise<QueueOutcome> {
    const result = await listPendingSponsorshipsAction();
    if (result.success && result.data) {
      return {
        hasMore: result.hasMore === true,
        rows: result.data.map((row) => ({
          pledgeRef: row.pledgeRef,
          supporterName: row.sponsorName,
          supporterEmail: row.sponsorEmail,
          purpose: `${row.tierName} for ${row.petName}`,
          amountDisplay: row.amountDisplay,
          frequency: row.frequency,
          paymentMethod: row.paymentMethod,
          createdAt: row.createdAt,
        })),
      };
    }
    return { error: result.error ?? "Could not load the pending commitments." };
  },

  confirm: reconcilePetSponsorshipAction,
  dismiss: rejectPetSponsorshipAction,
};

export function SponsorshipReconciliation() {
  return <ReconciliationQueue source={SPONSORSHIP_QUEUE} />;
}
