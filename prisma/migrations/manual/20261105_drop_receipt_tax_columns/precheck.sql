-- READ-ONLY. Run first, before any other file in this folder, and keep the output.
--
-- #251 asked whether the live site ever issued a tax receipt. The owner answered no
-- (2026-11-05), and this confirms it against production before anything is dropped.
-- It changes nothing and takes no lock beyond an ordinary read.
--
-- What to expect, and what each answer means:
--
--   donations_with_tax_snapshot   0 expected. Any other number means a row in
--                                 `donations` carries an NRIC, an LHDN reference or a
--                                 ROS number: a tax receipt WAS issued. Stop, and do
--                                 not run migration.sql (it would refuse anyway).
--   donations_total               Acknowledgements issued so far. May be above 0: a
--                                 reconciled gift earns a numbered acknowledgement,
--                                 which is not a tax receipt. These rows are kept;
--                                 only their tax columns go.
--   nric_gifts / nric_sponsorships
--                                 Pledges of any status where a donor typed an NRIC
--                                 before 2026-11-05. Dropping the column deletes those
--                                 NRICs, which is the intent: nothing reads them.
--   audit_rows_with_nric          DONATION_RECEIVED audit rows (some predate the
--                                 `donations` ledger) whose payload names a non-empty
--                                 NRIC. Not changed by this migration, but a number
--                                 above 0 means a tax receipt may have been recorded
--                                 there, so record it on #251 before going on.
--                                 ceiling: a regex for the `taxIdOrIc` JSON key with a
--                                 non-empty value, the only spelling the app ever wrote
--                                 (checked by rehearse.mjs). An NRIC typed into free prose
--                                 under another key is not found.

SELECT
  (SELECT count(*) FROM "public"."donations"
    WHERE COALESCE("taxIdOrIc", '') <> ''
       OR "taxDeductibleRef" <> ''
       OR "shelterRegistrationNo" <> '')                               AS donations_with_tax_snapshot,
  (SELECT count(*) FROM "public"."donations")                                      AS donations_total,
  (SELECT min("issuedAt") FROM "public"."donations")                               AS donations_first,
  (SELECT max("issuedAt") FROM "public"."donations")                               AS donations_last,
  (SELECT count(*) FROM "public"."donation_pledges" WHERE COALESCE("taxIdOrIc", '') <> '') AS nric_gifts,
  (SELECT count(*) FROM "public"."pet_sponsorships" WHERE COALESCE("taxIdOrIc", '') <> '') AS nric_sponsorships,
  (SELECT count(*) FROM "public"."audit_logs"
    WHERE action = 'DONATION_RECEIVED'
      AND (details ~ '"taxIdOrIc"\s*:\s*"[^"]+'
           OR COALESCE(metadata::text, '') ~ '"taxIdOrIc"\s*:\s*"[^"]+'))   AS audit_rows_with_nric;
