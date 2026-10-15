"use client";

import { useState, useEffect, useCallback } from "react";
import { DonationReceipt } from "@/types/sponsorship";
import { SPONSORSHIP_TIERS } from "@/lib/domain/sponsorshipTiers";

/**
 * Re-exported so existing client consumers keep importing tiers from the store.
 * The canonical definition lives in `@/lib/domain/sponsorshipTiers` because
 * server-side callers must not import this "use client" module.
 */
export { SPONSORSHIP_TIERS };

const STORAGE_RECEIPTS_KEY = "hope_for_strays_donation_receipts_v1";

/**
 * Browser-side history of receipts this device has been shown.
 *
 * It stores receipts; it does not create them. A receipt number is allocated
 * inside the same transaction that writes the `Donation` row, so a number that
 * never went through Postgres is not a receipt — it is a string that looks like
 * one. This module used to mint exactly that as an "offline fallback"; see the
 * note on `saveDonationReceipt`.
 *
 * ## No production caller since 2026-09-22
 *
 * The donation form used to hand every submission's receipt to this hook. It no
 * longer issues one: a general gift is recorded as a pending pledge and its
 * Section 44(6) receipt is emailed after a coordinator confirms the transfer, so
 * there is nothing at checkout to store. The hook, its `localStorage` history and
 * `activeReceipt` are therefore currently unused; only the `SPONSORSHIP_TIERS`
 * re-export from this module still has importers, which is why the layer graph
 * does not report the file as an orphan.
 *
 * Kept rather than deleted, deliberately. A donor-facing view of an *issued*
 * receipt is the obvious next home for it, and it belongs behind the sponsor
 * portal keyed on a receipt that exists. Deleting a hook that owns a
 * `localStorage` key is its own reversible decision and did not belong in the
 * change that orphaned it — recorded in
 * `tasks/decisions/2026-09-22-general-gifts-become-pending-until-reconciled.md`.
 */
export function useSponsorshipStore() {
  const [receipts, setReceipts] = useState<DonationReceipt[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_RECEIPTS_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [activeReceipt, setActiveReceipt] = useState<DonationReceipt | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_RECEIPTS_KEY, JSON.stringify(receipts));
      } catch (e) {
        console.error(e);
      }
    }
  }, [receipts]);

  /**
   * Records a receipt the server has already issued.
   *
   * Only ever call this with a `DonationReceipt` the ledger issued.
   * `submitDonationPledgeAction` no longer returns one — it returns a pending
   * `DonationPledgeDTO`, which is a claim reference and must not be stored here.
   * There is deliberately no local constructor: the donor's copy and the
   * shelter's ledger must carry the same number, and the only way to guarantee
   * that is for the number to come from the ledger.
   */
  const saveDonationReceipt = useCallback((receipt: DonationReceipt) => {
    setReceipts((prev) => [receipt, ...prev]);
    setActiveReceipt(receipt);
  }, []);

  return {
    tiers: SPONSORSHIP_TIERS,
    receipts,
    activeReceipt,
    setActiveReceipt,
    saveDonationReceipt,
  };
}
