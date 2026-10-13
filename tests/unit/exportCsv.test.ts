import { describe, it, expect } from "vitest";
import { LHDN_TAX_DEDUCTIBLE_REF, STATUTORY_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import {
  formatCsvField,
  generateReceiptsCsvString,
  generateAuditLogsCsvString,
  generateApplicationsCsvString,
  generatePetsCsvString,
} from "@/lib/presentation/exportCsv";
import { DonationReceipt } from "@/types/sponsorship";
import { AuditEntry } from "@/lib/domain/auditLog";
import { isReceiptAuditRow, resolveAuditAmountMYR } from "@/lib/domain/receiptAuditRow";
import { AdoptionApplicationRecord } from "@/types/application";
import { Pet } from "@/types/pet";

describe("CSV Export Formatting & Security Engine (RFC-4180)", () => {
  it("should escape commas, quotes, and newlines properly", () => {
    expect(formatCsvField("Tan Sri Dr. Lim, Jr.")).toBe('"Tan Sri Dr. Lim, Jr."');
    expect(formatCsvField('He said "Hello"')).toBe('"He said ""Hello"""');
    expect(formatCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(formatCsvField("SimpleText")).toBe('"SimpleText"');
    expect(formatCsvField(null)).toBe('""');
    expect(formatCsvField(undefined)).toBe('""');
    expect(formatCsvField(120)).toBe('"120"');
  });

  it("should mitigate CSV formula injection attacks on strings (=, +, -, @, \\t, \\r)", () => {
    expect(formatCsvField("=SUM(A1:A10)")).toBe("\"'=SUM(A1:A10)\"");
    expect(formatCsvField("+12345")).toBe("\"'+12345\"");
    expect(formatCsvField("-50.00")).toBe("\"'-50.00\"");
    expect(formatCsvField("@cmd")).toBe("\"'@cmd\"");
    expect(formatCsvField("\tTabInjection")).toBe("\"'\tTabInjection\"");
  });

  it("should treat numbers and booleans cleanly", () => {
    expect(formatCsvField(50)).toBe('"50"');
    expect(formatCsvField(true)).toBe('"true"');
    expect(formatCsvField(false)).toBe('"false"');
  });
});

describe("LHDN Donation Receipt CSV Generator", () => {
  it("should generate standard CSV headers and rows for DonationReceipt records", () => {
    const mockReceipts: DonationReceipt[] = [
      {
        receiptNumber: "HFS-DON-202608-1234",
        date: "16 Aug 2026, 10:00 AM",
        donorName: "Dr. Cheryl Tan",
        donorEmail: "cheryl.tan@example.com",
        donorPhone: "012-345 6789",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 50,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        targetPetName: "Milo",
        taxIdOrIc: "920512-10-5432",
        taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
        shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
      },
    ];

    const csv = generateReceiptsCsvString(mockReceipts);
    expect(csv).toContain("Official Receipt No");
    expect(csv).toContain("Tax ID / IC / Passport");
    expect(csv).toContain("LHDN Exemption Ref");
    expect(csv).toContain("HFS-DON-202608-1234");
    expect(csv).toContain('"Dr. Cheryl Tan"');
    expect(csv).toContain('"cheryl.tan@example.com"');
    expect(csv).toContain('"920512-10-5432"');
    expect(csv).toContain('"50.00"');
    expect(csv).toContain(`"${LHDN_TAX_DEDUCTIBLE_REF}"`);
    expect(csv).toContain(`"${STATUTORY_ROS_REGISTRATION_NO}"`);
  });

  it("should parse donation audit log entries into valid receipt CSV rows", () => {
    const auditLogs: AuditEntry[] = [
      {
        id: "audit-123",
        actorId: "donor_public",
        actorEmail: "donor@example.com",
        actorRole: "DONOR",
        action: "DONATION_RECEIVED",
        entity: "DonationReceipt",
        entityId: "HFS-DON-202608-5678",
        createdAt: "2026-08-16T08:00:00.000Z",
        details: {
          receiptNumber: "HFS-DON-202608-5678",
          donorName: "Ahmad Farhan",
          donorPhone: "017-888 9999",
          amountMYR: 120,
          tierName: "Spay / Neuter Surgery Sponsorship",
          paymentMethod: "duitnow_qr",
          taxIdOrIc: "891101-14-1122",
          targetPetName: "Bella",
        },
      },
    ];

    const csv = generateReceiptsCsvString(auditLogs);
    expect(csv).toContain("HFS-DON-202608-5678");
    expect(csv).toContain('"Ahmad Farhan"');
    expect(csv).toContain('"891101-14-1122"');
    expect(csv).toContain('"120.00"');
    expect(csv).toContain('"Spay / Neuter Surgery Sponsorship"');
  });
});

describe("Audit Trail CSV Generator (ROS AGM Compliance)", () => {
  it("should format audit log entries into CSV string with timestamp and details snapshot", () => {
    const auditLogs: AuditEntry[] = [
      {
        id: "audit-999",
        actorId: "usr-admin-01",
        actorEmail: "admin@hopeforstrays.org",
        actorRole: "ADMIN",
        action: "APPLICATION_APPROVED",
        entity: "AdoptionApplication",
        entityId: "app-2026-001",
        createdAt: "2026-08-16T09:00:00.000Z",
        details: { approvedBy: "admin@hopeforstrays.org", petName: "Luna" },
      },
    ];

    const csv = generateAuditLogsCsvString(auditLogs);
    expect(csv).toContain("Audit Log ID");
    expect(csv).toContain("Timestamp (UTC)");
    expect(csv).toContain("Actor Email");
    expect(csv).toContain("Action Event");
    expect(csv).toContain("audit-999");
    expect(csv).toContain("APPLICATION_APPROVED");
    expect(csv).toContain("admin@hopeforstrays.org");
  });
});

describe("Applications and Pets CSV Generators", () => {
  it("should generate adoption application CSV with applicant details", () => {
    const mockApp: AdoptionApplicationRecord = {
      id: "app-test-1",
      petId: "pet-1",
      petName: "Milo",
      petBreed: "Malaysian Domestic Dog",
      applicantName: "Ken Tan",
      email: "ken@example.com",
      phone: "0123456789",
      address: "SS2 Petaling Jaya",
      housingType: "Landed",
      hasFencedYard: "Yes",
      currentPets: "None",
      householdExperience: "Owned dogs for 10 years",
      status: "UNDER_REVIEW",
      createdAt: "2026-08-16T08:00:00.000Z",
      updatedAt: "2026-08-16T08:00:00.000Z",
    };

    const csv = generateApplicationsCsvString([mockApp]);
    expect(csv).toContain("Application ID");
    expect(csv).toContain("app-test-1");
    expect(csv).toContain("Ken Tan");
    expect(csv).toContain("ken@example.com");
  });

  it("should generate pet inventory CSV with medical details", () => {
    const mockPet: Pet = {
      id: "pet-1",
      name: "Barnaby",
      species: "dog",
      breed: "Mixed Breed",
      age: "2 years",
      ageCategory: "adult",
      gender: "Male",
      size: "Medium",
      weight: "16 kg",
      status: "Available",
      adoptionFee: "Free",
      description: "Friendly dog",
      rescueStory: "Rescued from SS2",
      image: "https://example.com/pet.jpg",
      intakeDate: "2026-01-01",
      tags: ["Friendly", "Good with Kids"],
      medical: {
        vaccinated: true,
        microchipped: true,
        spayedNeutered: true,
      },
      compatibility: {
        goodWithDogs: true,
        goodWithCats: false,
        goodWithKids: true,
        energyLevel: "Moderate",
      },
    };

    const csv = generatePetsCsvString([mockPet]);
    expect(csv).toContain("Pet ID");
    expect(csv).toContain("Barnaby");
    expect(csv).toContain("Spayed/Neutered");
    expect(csv).toContain("Yes");
  });
});

/**
 * The audit row -> LHDN CSV contract, which nothing tested and which was
 * therefore half-fixed twice in one week.
 *
 * `generateReceiptsCsvString` reads one specific key per column. A reconciled
 * contribution's audit row is classified as a donation by the presence of
 * `receiptNumber`, so whatever that row omits, this exporter invents or blanks.
 * Two rounds of review found the same defect from opposite ends: the row gained
 * a real supporter name and address while the amount column still read `0.00`,
 * because the only amount key this exporter read was `amountMYR` and the row
 * carried `amountSen`.
 *
 * These pin the contract from the exporter's side, so the next omission fails
 * here rather than on a document somebody files.
 */
describe("a reconciled contribution's audit row exports every column it can fill", () => {
  /**
   * The "Amount (MYR)" cell of the first data row, exactly as written.
   *
   * Split on RFC-4180 fields, not on bare commas: every cell is quoted, and a
   * donor name or tier containing a comma would otherwise shift the index and
   * make the assertion read some other column.
   */
  function amountCell(csv: string): string {
    const cells = csv.split("\r\n")[1].match(/"(?:[^"]|"")*"/g) ?? [];
    return cells[6];
  }

  function reconciledSponsorship(details: Record<string, unknown>): AuditEntry {
    return {
      id: "audit-spn-1",
      // The reconciling coordinator, not the supporter. That is the point: the
      // supporter's identity has to come out of `details`.
      actorId: "usr-coord-01",
      actorEmail: "coordinator@hopeforstrays.org",
      actorRole: "VOLUNTEER_COORDINATOR",
      action: "SPONSORSHIP_RECONCILED",
      entity: "PetSponsorship",
      entityId: "HFS-PLG-20260914-123456",
      createdAt: "2026-09-22T02:00:00.000Z",
      details,
    };
  }

  it("names the supporter and their amount, not the coordinator and zero", () => {
    const csv = generateReceiptsCsvString([
      reconciledSponsorship({
        pledgeRef: "HFS-PLG-20260914-123456",
        receiptNumber: "HFS-DON-202609-0007",
        petName: "Bella",
        sponsorName: "Aisyah Rahman",
        sponsorEmail: "aisyah@example.com",
        amountMYR: 80,
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        frequency: "one_time",
        paymentMethod: "online_banking",
        targetPetName: "Bella",
        amountSen: 8000,
        amountDisplay: "RM 80.00",
      }),
    ]);

    expect(csv).toContain('"HFS-DON-202609-0007"');
    expect(csv).toContain('"Aisyah Rahman"');
    expect(csv).toContain('"aisyah@example.com"');
    expect(csv).toContain('"80.00"');
    expect(csv).toContain('"Core Vaccination & Deworming"');
    expect(csv).toContain('"online_banking"');
    // The coordinator must not appear in the donor column.
    expect(csv).not.toContain("coordinator@hopeforstrays.org");
    // And the amount must never read zero for a receipted contribution.
    expect(csv).not.toContain('"0.00"');
  });

  it("falls back to the exact sen for rows written before amountMYR was carried", () => {
    // Every `SPONSORSHIP_RECONCILED` row in the existing audit history has this
    // shape. No change to what is written from now on can retrofit them, so the
    // exporter has to read what they actually hold.
    const csv = generateReceiptsCsvString([
      reconciledSponsorship({
        pledgeRef: "HFS-PLG-20260914-123456",
        receiptNumber: "HFS-DON-202609-0007",
        petName: "Bella",
        sponsorEmail: "aisyah@example.com",
        amountSen: 8000,
        amountDisplay: "RM 80.00",
      }),
    ]);

    expect(csv).toContain('"80.00"');
    expect(csv).not.toContain('"0.00"');
  });

  it("leaves the amount blank rather than claiming zero when it is unknowable", () => {
    // "We do not know what this was" and "this was nothing" are different facts,
    // and on a tax return the second is the more dangerous to assert.
    const csv = generateReceiptsCsvString([
      reconciledSponsorship({
        receiptNumber: "HFS-DON-202609-0008",
        sponsorEmail: "aisyah@example.com",
      }),
    ]);

    expect(csv).toContain('"HFS-DON-202609-0008"');
    // The cell itself, not merely the absence of one spelling of zero: "NaN",
    // "undefined" and "0" would all have passed a `not.toContain('"0.00"')`.
    expect(amountCell(csv)).toBe('""');
  });

  it("reads an amount stored as text, and prefers the exact sen when both are present", () => {
    // Details round-trip through JSON, so a backfill can leave either key as a
    // string. And a row carrying both must print the sen, which is the integer
    // every ledger stores; `amountMYR` is a float derived from it.
    expect(
      amountCell(
        generateReceiptsCsvString([
          reconciledSponsorship({ receiptNumber: "HFS-DON-202609-0009", amountSen: "8000" }),
        ])
      )
    ).toBe('"80.00"');

    expect(
      amountCell(
        generateReceiptsCsvString([
          reconciledSponsorship({
            receiptNumber: "HFS-DON-202609-0010",
            amountSen: 8000,
            amountMYR: 79.99,
          }),
        ])
      )
    ).toBe('"80.00"');
  });

  it("does not let an empty or non-numeric amountMYR mask the sen beside it", () => {
    for (const amountMYR of ["", "not a number", Number.NaN, "0x10", "1e3"]) {
      expect(
        amountCell(
          generateReceiptsCsvString([
            reconciledSponsorship({
              receiptNumber: "HFS-DON-202609-0011",
              amountMYR,
              amountSen: 8000,
            }),
          ])
        )
      ).toBe('"80.00"');
    }
  });
});

describe("a ledger receipt's amount is printed as the ledger computed it", () => {
  const receipt = (amountMYR: unknown) =>
    ({
      receiptNumber: "HFS-DON-202610-0001",
      date: "13 Oct 2026",
      donorName: "Aisyah Rahman",
      donorEmail: "aisyah@example.com",
      tierId: "vaccine",
      tierName: "Core Vaccination & Deworming",
      amountMYR,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
      taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
      shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
    }) as unknown as DonationReceipt;
  const cell = (csv: string) => (csv.split("\r\n")[1].match(/"(?:[^"]|"")*"/g) ?? [])[6];

  it("keeps a zero or a negative visible on the filed document", () => {
    // What an offsetting correction would look like. Blanking it would hide the
    // one row an accountant most needs to see.
    expect(cell(generateReceiptsCsvString([receipt(0)]))).toBe('"0.00"');
    // Still there, with the leading apostrophe `formatCsvField` puts on any cell
    // starting with `-` so a spreadsheet does not evaluate it as a formula.
    expect(cell(generateReceiptsCsvString([receipt(-50)]))).toBe("\"'-50.00\"");
    expect(cell(generateReceiptsCsvString([receipt(80)]))).toBe('"80.00"');
  });

  it("never prints NaN or undefined", () => {
    expect(cell(generateReceiptsCsvString([receipt(Number.NaN)]))).toBe('""');
    expect(cell(generateReceiptsCsvString([receipt(undefined)]))).toBe('""');
  });
});

describe("resolveAuditAmountMYR is the one answer every reader shares", () => {
  it("resolves sen, then ringgit, then nothing", () => {
    expect(resolveAuditAmountMYR({ amountSen: 12345 })).toBe(123.45);
    expect(resolveAuditAmountMYR({ amountMYR: 50 })).toBe(50);
    expect(resolveAuditAmountMYR({ amountMYR: "50" })).toBe(50);
    expect(resolveAuditAmountMYR({})).toBeUndefined();
    expect(resolveAuditAmountMYR({ amountMYR: "", amountSen: null })).toBeUndefined();
    expect(resolveAuditAmountMYR({ amountMYR: Number.NaN })).toBeUndefined();
  });

  it("does not let a zero, negative or fractional sen mask the ringgit beside it", () => {
    // No receipt is issued for nothing, so a stored zero is a placeholder. Read
    // as authoritative, `amountSen: 0` would turn a real RM 250 into RM 0.00 on
    // the export — the claimed zero this resolver exists to prevent.
    for (const amountSen of [0, "0", -500, 100.5]) {
      expect(resolveAuditAmountMYR({ amountMYR: 250, amountSen })).toBe(250);
    }
    expect(resolveAuditAmountMYR({ amountSen: 0 })).toBeUndefined();
  });

  it("reads a whole number of sen written with a zero fraction, and no other fraction", () => {
    // How a whole number comes back from some JSON and decimal round-trips.
    expect(resolveAuditAmountMYR({ amountSen: "12345.0" })).toBe(123.45);
    expect(resolveAuditAmountMYR({ amountSen: "12345.00", amountMYR: 1 })).toBe(123.45);
    expect(resolveAuditAmountMYR({ amountSen: "12345.5" })).toBeUndefined();
  });

  it("reads ringgit a person formatted, and refuses what merely parses", () => {
    expect(resolveAuditAmountMYR({ amountMYR: "1,250.00" })).toBe(1250);
    expect(resolveAuditAmountMYR({ amountMYR: "RM 250.00" })).toBe(250);
    // `Number()` would call these 16 and 1000.
    expect(resolveAuditAmountMYR({ amountMYR: "0x10" })).toBeUndefined();
    expect(resolveAuditAmountMYR({ amountMYR: "1e3" })).toBeUndefined();
  });
});

describe("isReceiptAuditRow is the one classifier every reader shares", () => {
  const row = (over: Record<string, unknown>) => ({
    action: "PET_UPDATED",
    entity: "Pet",
    details: {},
    ...over,
  });

  it("admits the three shapes a receipt is written in", () => {
    expect(isReceiptAuditRow(row({ action: "DONATION_RECEIVED" }))).toBe(true);
    expect(isReceiptAuditRow(row({ entity: "DonationReceipt" }))).toBe(true);
    expect(isReceiptAuditRow(row({ details: { receiptNumber: "HFS-DON-202609-0001" } }))).toBe(true);
  });

  it("does not call a row a receipt for carrying an empty receiptNumber key", () => {
    // The viewer and the receipts tab used to test for the key's presence while
    // the exporter tested its truthiness, so this row wore a donation badge on
    // screen and was missing from the CSV exported from that same screen.
    expect(isReceiptAuditRow(row({ details: { receiptNumber: null } }))).toBe(false);
    expect(isReceiptAuditRow(row({ details: { receiptNumber: "" } }))).toBe(false);
  });

  it("keeps a pending pledge and a dismissal out of every receipt view", () => {
    expect(
      isReceiptAuditRow(
        row({ action: "DONATION_PLEDGED", entity: "DonationPledge", details: { pledgeRef: "x" } })
      )
    ).toBe(false);
    expect(
      isReceiptAuditRow(row({ action: "DONATION_PLEDGE_REJECTED", entity: "DonationPledge" }))
    ).toBe(false);
  });
});
