import { AdoptionApplicationRecord } from "@/types/application";
import { DonationReceipt } from "@/types/sponsorship";
import { AuditEntry } from "@/lib/domain/auditLog";
import { Pet } from "@/types/pet";
import {
  LHDN_TAX_DEDUCTIBLE_REF,
  STATUTORY_ROS_REGISTRATION_NO,
} from "@/lib/domain/shelterIdentity";
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
 * Generates an RFC-4180 formatted CSV string of official donation receipts
 * tailored for Malaysian LHDN Section 44(6) tax reporting and internal accounting.
 */
export function generateReceiptsCsvString(
  items: (DonationReceipt | AuditEntry)[]
): string {
  const headers = [
    "Official Receipt No",
    "Date & Time",
    "Donor Name",
    "Donor Email",
    "Donor Phone",
    "Tax ID / IC / Passport",
    "Amount (MYR)",
    "Sponsorship Tier",
    "Payment Method",
    "Frequency",
    "Dedicated Pet",
    "LHDN Exemption Ref",
    "Shelter Reg No (ROS)",
  ];

  const rows: (string | number | boolean | null | undefined)[][] = [];

  for (const item of items) {
    if ("receiptNumber" in item && "donorName" in item) {
      // Standard DonationReceipt object
      const r = item as DonationReceipt;
      // The same formatter as the audit-row branch below, so the two cannot print
      // the same figure differently — or print `NaN` and `undefined` at all.
      const formattedAmount = formatAmountCell(r.amountMYR);

      rows.push([
        r.receiptNumber,
        r.date,
        r.donorName,
        r.donorEmail,
        r.donorPhone || "",
        r.taxIdOrIc || "",
        formattedAmount,
        r.tierName || r.tierId,
        r.paymentMethod,
        r.frequency || "one_time",
        r.targetPetName || "",
        r.taxDeductibleRef || LHDN_TAX_DEDUCTIBLE_REF,
        r.shelterRegistrationNo || STATUTORY_ROS_REGISTRATION_NO,
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
          // prints staff addresses in the "Donor Email" column of a tax export.
          //
          // Both spellings are checked because both kinds of row land here — a
          // general gift's `DONATION_RECEIVED` carries `donorEmail`, and a
          // `SPONSORSHIP_RECONCILED` row is classified as a donation by the
          // `receiptNumber` test above and carries `sponsorEmail`. Rows older than
          // 2026-09-22 carry neither and still resolve to `actorEmail`, which for
          // them is correct.
          (d.donorEmail as string) || (d.sponsorEmail as string) || entry.actorEmail || "",
          (d.donorPhone as string) || "",
          (d.taxIdOrIc as string) || "",
          formattedAmount,
          (d.tierName as string) || (d.tierId as string) || "Rescue Donation",
          (d.paymentMethod as string) || "DuitNow QR",
          (d.frequency as string) || "one_time",
          (d.targetPetName as string) || "",
          LHDN_TAX_DEDUCTIBLE_REF,
          STATUTORY_ROS_REGISTRATION_NO,
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
 * Exports donation receipts / tax records to CSV and triggers download.
 */
export function exportReceiptsToCsv(
  items: (DonationReceipt | AuditEntry)[],
  filenamePrefix = "hope-for-strays-lhdn-receipts"
): void {
  const csvContent = generateReceiptsCsvString(items);
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `${filenamePrefix}-${timestamp}.csv`);
}

/**
 * Generates an RFC-4180 formatted CSV string of immutable audit logs
 * for Registrar of Societies (ROS) AGM compliance and security verification.
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
