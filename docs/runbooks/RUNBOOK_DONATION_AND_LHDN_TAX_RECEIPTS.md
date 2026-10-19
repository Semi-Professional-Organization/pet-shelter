# Operational Runbook: Donations, Pet Sponsorships & LHDN Tax Receipts

**Hope for Strays — Animal Sanctuary & Adoption Center**  
*Location: No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia*  
*Related Handoff*: [`documents/HANDOFF_DONATION_AND_SPONSORSHIP_SUBSYSTEM.md`](file:///c:/Users/User/pet-shelter/documents/HANDOFF_DONATION_AND_SPONSORSHIP_SUBSYSTEM.md)

---

## 📖 Table of Contents
1. [Overview & Fiscal Credentials](#1-overview--fiscal-credentials)
2. [Managing Inbound Public Contributions](#2-managing-inbound-public-contributions)
3. [E-Receipt Issuance & Verification Flow](#3-e-receipt-issuance--verification-flow)
4. [Printing & PDF Export Guide](#4-printing--pdf-export-guide)
5. [In-Kind Wishlist & Physical Drop-off Procedures](#5-in-kind-wishlist--physical-drop-off-procedures)
6. [Corporate Donations & SSM Tax Exemption](#6-corporate-donations--ssm-tax-exemption)
7. [Troubleshooting & Incident Scenarios](#7-troubleshooting--incident-scenarios)
8. [Configuration & Bank Account Updates](#8-configuration--bank-account-updates)

---

## 1. Overview & Fiscal Credentials

All public contributions to Hope for Strays are tax-deductible under Malaysian tax law. Staff and volunteers must ensure the following credentials appear on all official communications:

| Field | Official Value |
| :--- | :--- |
| **Registered NGO Name** | Pertubuhan Kebajikan Hope for Strays |
| **ROS Registration No.** | `PPM-021-10-18082021` |
| **LHDN Tax Exemption Ref** | `LHDN.01/35/42/51/179-6.4912` |
| **Statutory Law** | Subsection 44(6), Income Tax Act 1967 (Malaysia) |
| **Sanctuary Address** | No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor |
| **Operating Hours** | Tuesday – Sunday: 10:00 AM – 5:00 PM (Closed Mondays) |
| **Finance Helpline** | +60 10-550 3056 (calls and WhatsApp) / `donations@hopeforstrays.org` |

---

## 2. Managing Inbound Public Contributions

Donors contribute through two primary payment rails:

### A. DuitNow National QR Standard (PayNet Malaysia)
- **Displayed On**: `/donate` page and `SponsorshipModal`.
- **Compatible Apps**: Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank PB engage, GrabPay, RHB, Boost, and all Malaysian DuitNow-participating banks.
- **Verification**: Cross-reference the transaction reference on your Maybank Business Banking terminal with the receipt ID generated (`HFS-DON-YYYYMM-XXXX`).

### B. Direct Maybank Bank Transfer
- **Bank Name**: Malayan Banking Berhad (Maybank)
- **Account Number**: `5140 1234 5678`
- **Account Holder**: `Pertubuhan Kebajikan Hope for Strays`
- **Branch**: SS2 Petaling Jaya Branch, Selangor
- **Reference Tag**: Donors are instructed to input their receipt reference (e.g. `HFS-DON-...`) or pet name in the transfer description.

---

## 3. E-Receipt Issuance & Verification Flow

### Standard Automated Lifecycle
```
1. Donor selects package (or custom RM) on /donate or pet profile modal
2. Donor completes DuitNow transfer / Maybank payment
3. Donor enters Name, Email, Phone, and optional IC/SSM
4. System executes Server Action (submitDonationPledgeAction):
   ├── Validates inputs via Zod
   ├── Assigns unique receipt number: HFS-DON-YYYYMM-XXXX
   ├── Records immutable entry in audit log (DONATION_RECEIVED)
   └── Dispatches HTML/Plain text receipt via Resend
5. On-screen printable receipt is immediately displayed to donor
```

### Manual Audit Log Inspection
Shelter coordinators can review recorded donations in the admin panel:
1. Navigate to `/admin/audit`.
2. Filter or search by `Action: DONATION_RECEIVED` or `Entity: DonationReceipt`.
3. View donor name, email, amount (RM), dedication animal, and receipt number.

---

## 4. Printing & PDF Export Guide

Both the modal and dedicated `/donate` page feature an optimized **Print / Save Receipt** button.

### How to Save as Clean PDF:
1. Click **Print / Save Receipt** on the completed receipt screen.
2. In the browser print dialog:
   - **Destination**: Select *Save as PDF* (or select physical printer).
   - **Paper Size**: A4 or Letter.
   - **Headers & Footers**: Uncheck (the receipt already includes full official headers).
   - **Background Graphics**: Checked.
3. Click **Save**.

> [!NOTE]
> The custom `@media print` stylesheet automatically isolates the official tax voucher `#donation-receipt-print`. Web navigation bars, close buttons, and backdrop shadows are automatically excluded from the final output.

---

## 5. In-Kind Wishlist & Physical Drop-off Procedures

For donors visiting the shelter in person with physical goods:

### Receiving Checklist:
1. **Food Items**: Ensure dog/cat kibble bags and puppy milk formulas (KMR/Esbilac) are **unopened and within expiration date**.
2. **Medical Supplies**: Accept unopened hospital-grade disinfectants (Clorox, F10), disposable pee pads, sterile gloves, and flea/tick preventatives (Frontline/Bravecto).
3. **Bedding & Towels**: Clean bath towels and fleece blankets are accepted. Damaged items with loose nylon strings should be recycled safely.
4. **Recording**: Record in-kind donations in the physical sanctuary intake logbook at the front reception.

**Drop-off Address**:  
No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor  
*Visiting Hours: Tuesday – Sunday: 10:00 AM – 5:00 PM*

---

## 6. Corporate Donations & SSM Tax Exemption

Malaysian companies wishing to claim tax deductions on donations:

1. **Information Required**:
   - Registered Corporate Entity Name (e.g. *Apex Technologies Sdn Bhd*).
   - SSM Registration Number (e.g. *202101023456 (1423756-X)*).
   - Official Finance / Accounts Email.
2. **Procedure**:
   - The corporate donor enters their SSM number in the `NRIC / Passport / SSM No.` field.
   - The receipt will explicitly display the company name and SSM number under the *Issued To* section.
   - For wire transfers exceeding RM 5,000, finance staff can issue an official signed certificate upon request by emailing `donations@hopeforstrays.org`.

---

## 7. Troubleshooting & Incident Scenarios

### Scenario A: Donor Did Not Receive Receipt Email
1. **Check Spam / Junk Folder**: Transactional emails are sent from `onboarding@resend.dev` (or custom verified domain).
2. **Verify in Audit Log**:
   - Open `/admin/audit`.
   - Search for the donor's email address.
   - Check if `EMAIL_SENT` or `EMAIL_FAILED` is logged.
3. **Resending / Re-printing**:
   - If the donor is on the phone or in person, look up the receipt number in `/admin/audit` and provide the PDF or print a replacement voucher.

### Scenario B: "Too many submissions" Rate Limit Error
- **Root Cause**: The donor submitted more than 20 times within 5 minutes (`checkRateLimit`).
- **Resolution**: Advise the donor to wait 5 minutes before submitting again, or complete their direct transfer using the Maybank account number shown on-screen.

### Scenario C: Custom Amount Validation Error
- **Root Cause**: The donor entered an amount below RM 5.00 or an invalid character.
- **Resolution**: Remind the donor that the minimum transaction threshold is RM 5.00 to offset banking rail overheads.

---

## 8. Configuration & Bank Account Updates

To update official banking details or sponsorship packages:

### Updating Bank Details:
- **Component File**: [`src/components/DonationWidget.tsx`](file:///c:/Users/User/pet-shelter/src/components/DonationWidget.tsx) & [`src/components/SponsorshipModal.tsx`](file:///c:/Users/User/pet-shelter/src/components/SponsorshipModal.tsx)
- Search for the account number `5140 1234 5678` and replace with updated credentials.

### Updating Sponsorship Tiers:
- **Store File**: [`src/lib/sponsorshipStore.ts`](file:///c:/Users/User/pet-shelter/src/lib/sponsorshipStore.ts)
- Modify the `SPONSORSHIP_TIERS` array (amounts, descriptions, impact metrics).

### Updating LHDN Exemption Reference:
- **Files**: [`src/actions/donations.ts`](file:///c:/Users/User/pet-shelter/src/actions/donations.ts), [`src/lib/sponsorshipStore.ts`](file:///c:/Users/User/pet-shelter/src/lib/sponsorshipStore.ts), [`src/app/donate/page.tsx`](file:///c:/Users/User/pet-shelter/src/app/donate/page.tsx).
- Update constant `LHDN_TAX_REF = "LHDN.01/35/42/51/179-6.4912"`.
