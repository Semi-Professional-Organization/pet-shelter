import { AdoptionApplicationRecord } from "@/types/application";
import { DonationReceipt } from "@/types/sponsorship";
import { AuditEntry } from "@/lib/domain/auditLog";
import { Pet } from "@/types/pet";
import {
  auditDetails,
  formatAmountCell,
  isReceiptAuditRow,
  resolveAuditAmountMYR,
} from "@/lib/domain/receiptAuditRow";

/**
 * Escapes a single CSV field following RFC-4180:
 * - Wrap with double quotes if contains commas, quotes, or newlines.
 * - Escape internal double quotes with two double quotes ("").
 * - Mitigate CSV Formula Injection by prepending single quote to formula trigger characters (=, +, -, @, \t, \r).
 */
export function formatCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }

  // Pure numbers and booleans are not prone to formula injection
  if (typeof value === "number" || typeof value === "boolean") {
    return `"${value}"`;
  }

  let str = String(value);

  // CSV injection mitigation for string formula characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r") ||
    str.includes("\t")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return `"${str}"`;
}

/**
 * Helper to trigger browser file download from a CSV string.
 */
function triggerCsvDownload(csvContent: string, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  // UTF-8 BOM for Excel / Numbers compatibility
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an RFC-4180 formatted CSV string of adoption application records.
 */
export function generateApplicationsCsvString(applications: AdoptionApplicationRecord[]): string {
  const headers = [
    "Application ID",
    "Submitted Date",
    "Status",
    "Pet Name",
    "Pet ID",
    "Applicant Name",
    "Email",
    "Phone",
    "Residential Address",
    "Housing Type",
    "Fenced Yard",
    "Existing Pets",
    "Existing Pet Details",
    "Household Experience",
    "Applicant Notes",
    "Admin Review Notes",
  ];

  const rows = applications.map((app) => [
    app.id,
    new Date(app.createdAt).toISOString().split("T")[0],
    app.status,
    app.petName,
    app.petId,
    app.applicantName,
    app.email,
    app.phone,
    app.address,
    app.housingType,
    app.hasFencedYard,
    app.currentPets,
    app.currentPetDetails || "",
    app.householdExperience,
    app.applicantNotes || "",
    app.adminReviewNotes || "",
  ]);

  return [
    headers.map(formatCsvField).join(","),
    ...rows.map((row) => row.map(formatCsvField).join(",")),
  ].join("\r\n");
}

/**
 * Exports adoption application records to a formatted CSV file and triggers download.
 */
export function exportApplicationsToCsv(
  applications: AdoptionApplicationRecord[],
  filenamePrefix = "hope-for-strays-applications"
): void {
  const csvContent = generateApplicationsCsvString(applications);
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `${filenamePrefix}-${timestamp}.csv`);
}

/**
 * Generates an RFC-4180 formatted CSV string of pet inventory records.
 */
export function generatePetsCsvString(pets: Pet[]): string {
  const headers = [
    "Pet ID",
    "Name",
    "Species",
    "Breed",
    "Age",
    "Age Category",
    "Gender",
    "Size",
    "Weight",
    "Status",
    "Adoption Fee",
    "Vaccinated",
    "Microchipped",
    "Spayed/Neutered",
    "Intake Date",
    "Tags",
  ];

  const rows = pets.map((p) => [
    p.id,
    p.name,
    p.species,
    p.breed,
    p.age,
    p.ageCategory,
    p.gender,
    p.size,
    p.weight,
    p.status,
    p.adoptionFee,
    p.medical.vaccinated ? "Yes" : "No",
    p.medical.microchipped ? "Yes" : "No",
    p.medical.spayedNeutered ? "Yes" : "No",
    p.intakeDate,
    p.tags.join("; "),
  ]);

  return [
    headers.map(formatCsvField).join(","),
    ...rows.map((row) => row.map(formatCsvField).join(",")),
  ].join("\r\n");
}

/**
 * Exports pet inventory records to formatted RFC-4180 CSV string and triggers download.
 */
export function exportPetsToCsv(pets: Pet[], filenamePrefix = "hope-for-strays-pets"): void {
  const csvContent = generatePetsCsvString(pets);
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `${filenamePrefix}-${timestamp}.csv`);
}

/**
 * Generates an RFC-4180 formatted CSV string of reconciled donations for the
 * shelter's own accounting.
 *
 * Until 2026-11-05 this was an LHDN tax-receipt export with donor tax number, LHDN
 * reference and ROS number columns. The shelter holds neither registration (#239),
 * so the export no longer has those columns; the stored values go with #251.
 */
export function generateReceiptsCsvString(
  items: (DonationReceipt | AuditEntry)[]
): string {
  const headers = [
    "Record No",
    "Date & Time",
    "Donor Name",
    "Donor Email",
    "Donor Phone",
    "Amount (MYR)",
    "Sponsorship Tier",
    "Payment Method",
    "Frequency",
    // `targetPetName` has two sources: on a general gift it is the donor's own
    // dedication, checked against no animal
    // (tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md); on a
    // sponsorship receipt it is the sponsored pet's name, verified by id at checkout
    // (`receiptDraftFor` in src/lib/server/sponsorshipLedger.ts). Not "Donor's Note",
    // which would collide with the separate `notes` field.
    // ceiling: one column, two sources, and nothing on the row says which. Split it
    // into a dedication and a sponsored-pet column when staff need to tell them apart
    // (tasks/open/donation-receipt-dedication-column-mixes-two-sources.md).
    "Dedication / Sponsored Pet",
  ];

  const rows: (string | number | boolean | null | undefined)[][] = [];

  for (const item of items) {
    if ("receiptNumber" in item && "donorName" in item) {
      // Standard DonationReceipt object
      const r = item as DonationReceipt;
      // A ledger receipt's amount is a number the ledger computed, so any finite
      // one is printed — including a zero or a negative, which is what an
      // offsetting correction would look like and must be visible on the filed
      // document. A negative is emitted as a *number*, not as text: `formatCsvField`
      // prefixes any string starting with `-` with an apostrophe to defuse formula
      // injection, which would turn the correction into a text cell that a SUM over
      // the column silently skips. Anything that is not a finite number goes
      // through the stricter reader, so this can never print `NaN` or `undefined`.
      const formattedAmount: string | number =
        typeof r.amountMYR === "number" && Number.isFinite(r.amountMYR)
          ? r.amountMYR < 0
            ? Number(r.amountMYR.toFixed(2))
            : r.amountMYR.toFixed(2)
          : formatAmountCell(r.amountMYR);

      rows.push([
        r.receiptNumber,
        r.date,
        r.donorName,
        r.donorEmail,
        r.donorPhone || "",
        formattedAmount,
        r.tierName || r.tierId,
        r.paymentMethod,
        r.frequency || "one_time",
        r.targetPetName || "",
      ]);
    } else if ("action" in item) {
      // AuditEntry representing a donation
      const entry = item as AuditEntry;
      const d = auditDetails(entry);

      // Classified and priced by `src/lib/domain/receiptAuditRow.ts`, which the
      // audit viewer and the receipts tab use too. An unresolvable amount is an
      // empty cell, never `0.00`.
      if (isReceiptAuditRow(entry)) {
        const formattedAmount = formatAmountCell(resolveAuditAmountMYR(d));

        const formattedDate = entry.createdAt.includes("T")
          ? entry.createdAt.replace("T", " ").slice(0, 19)
          : entry.createdAt;

        rows.push([
          (d.receiptNumber as string) || entry.entityId || "N/A",
          formattedDate,
          (d.donorName as string) || (d.sponsorName as string) || "Anonymous Donor",
          // The supporter's own address first, the actor's only as a last resort.
          // The two were the same value while a contribution was audited by the
          // person who made it. They no longer are: a reconciled row is written by
          // the coordinator who confirmed the transfer, so preferring `actorEmail`
          // prints staff addresses in the "Donor Email" column of the export.
          //
          // Both spellings are checked because both kinds of row land here — a
          // general gift's `DONATION_RECEIVED` carries `donorEmail`, and a
          // `SPONSORSHIP_RECONCILED` row is classified as a donation by the
          // `receiptNumber` test above and carries `sponsorEmail`. Rows older than
          // 2026-09-22 carry neither and still resolve to `actorEmail`, which for
          // them is correct.
          (d.donorEmail as string) || (d.sponsorEmail as string) || entry.actorEmail || "",
          (d.donorPhone as string) || "",
          formattedAmount,
          (d.tierName as string) || (d.tierId as string) || "Rescue Donation",
          (d.paymentMethod as string) || "DuitNow QR",
          (d.frequency as string) || "one_time",
          (d.targetPetName as string) || "",
        ]);
      }
    }
  }

  return [
    headers.map(formatCsvField).join(","),
    ...rows.map((row) => row.map(formatCsvField).join(",")),
  ].join("\r\n");
}

/**
 * Exports reconciled donation records to CSV and triggers download.
 */
export function exportReceiptsToCsv(
  items: (DonationReceipt | AuditEntry)[],
  filenamePrefix = "hope-for-strays-donations"
): void {
  const csvContent = generateReceiptsCsvString(items);
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `${filenamePrefix}-${timestamp}.csv`);
}

/**
 * Generates an RFC-4180 formatted CSV string of immutable audit logs
 * for the shelter's own records and security verification.
 */
export function generateAuditLogsCsvString(logs: AuditEntry[]): string {
  const headers = [
    "Audit Log ID",
    "Timestamp (UTC)",
    "Actor Email",
    "Actor Role",
    "Action Event",
    "Target Entity",
    "Entity ID",
    "Details Snapshot",
  ];

  const rows = logs.map((log) => [
    log.id,
    log.createdAt,
    log.actorEmail,
    log.actorRole,
    log.action,
    log.entity,
    log.entityId,
    log.details ? JSON.stringify(log.details) : "",
  ]);

  return [
    headers.map(formatCsvField).join(","),
    ...rows.map((row) => row.map(formatCsvField).join(",")),
  ].join("\r\n");
}

/**
 * Exports full audit logs to CSV and triggers download.
 */
export function exportAuditLogsToCsv(
  logs: AuditEntry[],
  filenamePrefix = "hope-for-strays-audit-trail"
): void {
  const csvContent = generateAuditLogsCsvString(logs);
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `${filenamePrefix}-${timestamp}.csv`);
}
