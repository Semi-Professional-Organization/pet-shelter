import { DonationPledgeReconciliation } from "@/components/admin/DonationPledgeReconciliation";
import { SponsorshipReconciliation } from "@/components/admin/SponsorshipReconciliation";

/**
 * One receipt attempt may spend 5 seconds acquiring the transaction and 15 seconds
 * inside it, and the scoped unique-race recovery permits one retry. Next applies
 * this page-level budget to every Server Action invoked here and to its `after()`
 * work. Sixty seconds therefore leaves 20 seconds beyond the 40-second transaction
 * ceiling for authorization, recovery reads, and best-effort email scheduling;
 * those operations have no separate latency bound.
 *
 * Unchanged by the second queue below: the two reconcile sequentially, one row at a
 * time, and neither holds a transaction open while the other runs.
 */
export const maxDuration = 60;

/**
 * Both reconciliation queues, on the page a coordinator already opens with a bank
 * statement beside them.
 *
 * General gifts come first because they are the newer boundary and the likelier
 * backlog: the donation form is public and unauthenticated, while a pet
 * sponsorship starts from an animal's profile. Two lists rather than one merged
 * table, because the references are drawn from different series and land in
 * different tables — a coordinator matching `HFS-GFT-…` against a statement line
 * should not have to scan past sponsorship rows to find it.
 */
export default function AdminDonationsPage() {
  return (
    <div className="space-y-10">
      <DonationPledgeReconciliation />
      <SponsorshipReconciliation />
    </div>
  );
}
