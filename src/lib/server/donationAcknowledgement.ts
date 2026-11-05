import { ringgitFromSen } from "@/lib/domain/money";
import type { DonationReceiptDTO } from "@/lib/validations/donation";
import type { DonationRecord } from "@/lib/server/donationLedger";

/**
 * Maps a numbered acknowledgement to what the email and the CSV export read.
 *
 * The one builder for both reconcile lanes. Until #251 the general-gift lane and the
 * sponsorship lane each built this object by hand, with their own copy of the date
 * format, and the two had already drifted apart in shape.
 *
 * Converts the ledger's exact integer sen back to a ringgit `number` here, at the
 * edge, so the stored value stays exact. See `src/lib/domain/money.ts`.
 */
export function toDonationReceiptDTO(record: DonationRecord): DonationReceiptDTO {
  return {
    receiptNumber: record.receiptNumber,
    date: new Date(record.issuedAt).toLocaleDateString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    donorName: record.donorName,
    donorEmail: record.donorEmail,
    donorPhone: record.donorPhone,
    tierId: record.tierId,
    tierName: record.tierName,
    amountMYR: ringgitFromSen(record.amountSen),
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    targetPetName: record.targetPetName,
    notes: record.notes,
  };
}
