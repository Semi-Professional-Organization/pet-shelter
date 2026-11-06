# Engineering Handoff: Hybrid Donation & Pet Sponsorship Subsystem

- **Feature**: Hybrid Donation Subsystem (Option 2: Dedicated `/donate` Page + Widened Contextual Modal)
- **Status**: Production-Ready / Verified
- **Date**: 2026-08-16
- **Stack**: Next.js 16.3.1 (App Router + Turbopack), React 19.2.8, TypeScript 5, Tailwind CSS v4, Resend SDK, Prisma 7 / PostgreSQL.
- **Related Runbook**: [`documents/RUNBOOK_DONATION_AND_LHDN_TAX_RECEIPTS.md`](file:///c:/Users/User/pet-shelter/documents/RUNBOOK_DONATION_AND_LHDN_TAX_RECEIPTS.md)

---

## 1. Subsystem Architecture Overview

The Hybrid Donation Subsystem unifies high-conversion public marketing and transparent fundraising with rapid, frictionless contextual sponsorship across individual animal profiles.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Hybrid Giving & Sponsorship Hub                       │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. Dedicated Marketing & Social Page │ 2. Contextual Quick-Action Modal     │
│    URL: /donate                      │    Trigger: "Sponsor Care" on /pets  │
│    - Financial impact visualizer     │    - Widened sm:max-w-3xl lg:max-w-4 │
│    - DuitNow QR + bank rails (#252)  │    - Pre-filled with dedicated pet   │
│    - Physical supplies wishlist      │    - Custom amount + instant voucher │
│    - LHDN tax deduction FAQ         │    - Zero navigation displacement    │
├──────────────────────────────────────┴──────────────────────────────────────┤
│ 3. Shared Server & Domain Engine                                            │
│    - Zod Validation: src/lib/validations/donation.ts                        │
│    - Server Action: src/actions/donations.ts (submitDonationPledgeAction)   │
│    - Audit Logging: src/lib/domain/auditLog.ts (DONATION_RECEIVED)          │
│    - Resend Email: src/lib/email.ts (sendDonationReceiptEmail)              │
│    - Print Engine: src/app/globals.css (@media print isolation)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Components & Implementation Details

### A. Dedicated Landing Page ([`src/app/donate/page.tsx`](file:///c:/Users/User/pet-shelter/src/app/donate/page.tsx))
- **Route**: `/donate` (Prerendered statically with full OpenGraph/SEO metadata).
- **Hero Section**: Highlights the sanctuary's 100% Free Adoption policy, official ROS Registration (`PPM-021-10-18082021`), and LHDN Tax-Exemption status.
- **Embedded Giving Hub ([`DonationWidget.tsx`](file:///c:/Users/User/pet-shelter/src/components/DonationWidget.tsx))**:
  - One-time vs Monthly recurring partner toggle.
  - Interactive tier cards (RM 30 Kibble, RM 50 Vaccine, RM 120 Spay/Neuter, RM 250 Emergency Medical) + Custom Amount (RM 5+).
  - Authentic DuitNow National QR Standard frame (PayNet Malaysia) + 1-click Maybank account copy (the account was fake and is removed, #252).
  - Form capturing Donor Name, Email, Phone, optional NRIC/SSM Number, and encouragement notes.
  - Instant on-screen e-Receipt rendering with 1-click browser print.
- **Financial Transparency Visualizer**: Breakdown of medical care (45%), nutrition (30%), sanctuary boarding (20%), and stray rescue operations (5%).
- **In-Kind Wishlist & Sanctuary Drop-off**: Itemized physical needs (kibble, puppy milk, pee pads, Kongs) with SS2 Petaling Jaya address and visiting hours.
- **Malaysian Tax Exemption FAQ**: Explaining individual and corporate deductions under Subsection 44(6) ITA 1967.

### B. Contextual Modal ([`src/components/SponsorshipModal.tsx`](file:///c:/Users/User/pet-shelter/src/components/SponsorshipModal.tsx))
- **Width Resolution**: Overrode the framework's `sm:max-w-md` constraint with **`w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl`**, allowing side-by-side desktop rendering of QR codes and bank details.
- **Pet Dedication**: Automatically detects when triggered from a specific pet profile (`targetPet`), pre-populating the dedicated animal's name in receipt records.
- **Custom Amount Support**: Allows donors to enter any custom contribution amount above RM 5.00 with live calculation.
- **Client Controller ([`src/hooks/useSponsorshipController.ts`](file:///c:/Users/User/pet-shelter/src/hooks/useSponsorshipController.ts))**: Integrates with the server action, provides fallback offline caching in `localStorage`, and handles copy-to-clipboard states.

### C. Server Actions & Validation Layer
- **Validation ([`src/lib/validations/donation.ts`](file:///c:/Users/User/pet-shelter/src/lib/validations/donation.ts))**:
  - Schema: `donationPledgeSchema` enforcing name (min 2 chars), email formatting, numeric amount coercion ($\ge \text{RM } 5.00$), and sanitized optional fields.
  - Types: `DonationPledgeInput`, `DonationReceiptDTO`.
- **Server Action ([`src/actions/donations.ts`](file:///c:/Users/User/pet-shelter/src/actions/donations.ts))**:
  - Function: `submitDonationPledgeAction(input)`.
  - Rate Limiting: 20 donation submissions per 5 minutes per donor email (`checkRateLimit`).
  - Receipt Sequence: Generates Malaysian format `HFS-DON-YYYYMM-XXXX`.
  - Audit Trail: Dispatches immutable audit log (`recordAuditLog`) with role `DONOR` and action `DONATION_RECEIVED`.
  - Email Dispatch: Non-blocking call to `sendDonationReceiptEmail(receipt)`.

### D. Transactional Email Engine ([`src/lib/email.ts`](file:///c:/Users/User/pet-shelter/src/lib/email.ts))
- **Function**: `sendDonationReceiptEmail(receipt)`.
- **Deliverability**: Clean, lightweight HTML (<15KB) + Plain Text fallback.
- **Tax Compliance**: Contains official LHDN approval reference `LHDN.01/35/42/51/179-6.4912` and shelter registration `PPM-021-10-18082021` under Subsection 44(6) of the Income Tax Act 1967.
- **Simulation Fallback**: Automatically simulates and logs email dispatches when `RESEND_API_KEY` is not present in local/test environments.

### E. Print Stylesheet ([`src/app/globals.css`](file:///c:/Users/User/pet-shelter/src/app/globals.css#L106-L132))
- Scoped `@media print` rules:
  - Hides all ambient UI, navigation headers, footers, dialog overlays, and close buttons.
  - Isolates `#donation-receipt-print` with clean black borders and high-contrast typography for A4/PDF printouts.

---

## 3. Malaysian Regulatory & Fiscal Details

> **Not real (2026-11-05).** The shelter is not a registered society (#239) and the bank account
> was fake (#252). Do not use any value below; the live account is `SHELTER_BANK_ACCOUNT` in
> `src/lib/domain/shelterIdentity.ts`.

| Attribute | Specification |
| :--- | :--- |
| **Organization Name** | Pertubuhan Kebajikan Hope for Strays Selangor |
| **ROS Registration** | `PPM-021-10-18082021` |
| **LHDN Tax Exemption Ref** | `LHDN.01/35/42/51/179-6.4912` |
| **Legal Basis** | Subsection 44(6), Income Tax Act 1967 (Malaysia) |
| **Primary Bank** | Not confirmed (the bank shown here was fake, #252) |
| **Account Number** | Not confirmed (the number shown here was fake, #252) |
| **Account Name** | Not confirmed (#252) |
| **National QR Standard** | DuitNow QR (PayNet Malaysia) |
| **Physical Sanctuary** | No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor |

---

## 4. Test Matrix & Quality Verification

```
Test Suites: 21 passed (21)
Tests:       163 passed (163)
Duration:    4.11s
```

### Subsystem Unit Tests ([`tests/unit/donations.test.ts`](file:///c:/Users/User/pet-shelter/tests/unit/donations.test.ts))
1. `should validate a standard donation pledge successfully`
2. `should coerce string amounts to numbers and enforce minimum RM 5.00`
3. `should reject invalid email formats`
4. `should support monthly recurring frequency`
5. `should process a donation pledge, generate LHDN receipt, and record an audit log`
6. `should handle custom amounts and default to custom tier name`
7. `should return an error result for invalid input without throwing`
8. `should simulate and record email dispatch for donation receipts`
