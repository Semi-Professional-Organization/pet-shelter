import { AgeCategory } from "@/types/pet";

/**
 * Domain calculations for pet age and lifecycle category (L-B3).
 *
 * Age is calculated dynamically relative to the current date (or a specified reference date),
 * ensuring that adoption matching and category filters do not rot as animals age in the shelter.
 */

function parseDateParts(dateOrStr: Date | string): { year: number; month: number; day: number } | null {
  if (typeof dateOrStr === "string") {
    const dateOnly = dateOrStr.split("T")[0];
    const parts = dateOnly.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1] - 1, day: parts[2] };
    }
  }
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

/**
 * Computes exact difference in full months between a birth date and a target date.
 * Timezone-invariant for standard YYYY-MM-DD date strings.
 */
export function computeAgeInMonths(birthDateStr: string, asOf: Date | string = new Date()): number {
  const birth = parseDateParts(birthDateStr);
  const target = parseDateParts(asOf);
  if (!birth || !target) return 0;

  let months = (target.year - birth.year) * 12 + (target.month - birth.month);
  if (target.day < birth.day) {
    months -= 1;
  }
  return Math.max(0, months);
}

/**
 * Lifecycle bands, as the inclusive lower bound of each in whole months.
 *
 * **This table is the only definition of a band boundary.** `computeAgeCategory` reads it, and
 * so does every user-facing band label via `formatAgeBandRange` — so a boundary cannot be moved
 * in the maths and left stale in the copy that describes it to a user. It previously could:
 * the gallery advertised "Senior (7+ yrs)" against a 96-month senior boundary, and both 3 and 7
 * were claimed by two adjacent filter options at once (PS-114).
 */
export const AGE_BAND_MIN_MONTHS = {
  puppy_kitten: 0,
  young: 12,
  adult: 36,
  senior: 96,
} as const satisfies Record<AgeCategory, number>;

/** Bands in ascending age order. */
export const AGE_BANDS = ["puppy_kitten", "young", "adult", "senior"] as const;

/**
 * Derives the standardized AgeCategory from `AGE_BAND_MIN_MONTHS` — the highest band whose
 * lower bound the pet has reached.
 */
export function computeAgeCategory(birthDateStr: string, asOf: Date | string = new Date()): AgeCategory {
  const months = computeAgeInMonths(birthDateStr, asOf);
  let band: AgeCategory = AGE_BANDS[0];
  for (const candidate of AGE_BANDS) {
    if (months >= AGE_BAND_MIN_MONTHS[candidate]) band = candidate;
  }
  return band;
}

/**
 * Renders the whole-year range a band covers, e.g. `3 – 7 yrs`, derived from
 * `AGE_BAND_MIN_MONTHS`. Ranges are half-open in months and therefore never overlap: the upper
 * edge is the last whole year still inside the band, not the next band's first year.
 */
export function formatAgeBandRange(band: AgeCategory, locale: "en" | "ms" = "en"): string {
  const unit = locale === "ms" ? "thn" : "yrs";
  const index = AGE_BANDS.indexOf(band);
  const minYears = AGE_BAND_MIN_MONTHS[band] / 12;
  const next = AGE_BANDS[index + 1];

  if (next === undefined) return `${minYears}+ ${unit}`;
  if (minYears === 0) return locale === "ms" ? "< 1 thn" : "< 1 yr";

  const maxYears = AGE_BAND_MIN_MONTHS[next] / 12 - 1;
  return minYears === maxYears ? `${minYears} ${unit}` : `${minYears} – ${maxYears} ${unit}`;
}

/**
 * Returns the pet with `birthDate`, `age` and `ageCategory` recomputed from the calendar.
 *
 * Applied wherever a stored pet record enters the app, so that a hand-written `age` string in a
 * fixture cannot outlive its accuracy. Before PS-114 the fallback store served `pets.json`
 * verbatim and one pet already read "4 months" at five months old.
 */
export function withDerivedAge<T extends {
  birthDate?: string;
  birthDateIsEstimate?: boolean;
  intakeDate: string;
  age?: string;
  ageCategory?: string;
}>(
  pet: T,
  asOf: Date | string = new Date()
  // `Omit` first, then the four fields this function decides. A plain `T & { … }` intersected the
  // caller's types with the computed ones, so a literal `birthDateIsEstimate: false` survived as
  // the type `false` while the runtime returned `true`, and a flag typed `undefined` collapsed the
  // whole result to `never`. These four are recomputed here, so the input's types must not leak.
): Omit<T, "birthDate" | "birthDateIsEstimate" | "age" | "ageCategory"> & {
  birthDate: string;
  birthDateIsEstimate: boolean;
  age: string;
  ageCategory: AgeCategory;
} {
  const birthDate = deriveBirthDate(pet);
  // A birthday nobody entered is always an estimate: with no `birthDate` the value below is
  // approximated from the age text or falls back to intake, and neither is an exact birthday.
  const birthDateIsEstimate = pet.birthDate ? (pet.birthDateIsEstimate ?? true) : true;

  return {
    ...pet,
    birthDate,
    birthDateIsEstimate,
    age: formatAgeString(birthDate, asOf).en,
    ageCategory: computeAgeCategory(birthDate, asOf),
  };
}

/**
 * Formats a human-readable age string in English and Malay.
 */
export function formatAgeString(
  birthDateStr: string,
  asOf: Date | string = new Date()
): { en: string; ms: string } {
  const months = computeAgeInMonths(birthDateStr, asOf);
  if (months < 12) {
    const m = Math.max(1, months);
    const en = `${m} ${m === 1 ? "month" : "months"}`;
    const ms = `${m} bulan`;
    return { en, ms };
  }

  const years = Math.floor(months / 12);
  const en = `${years} ${years === 1 ? "year" : "years"}`;
  const ms = `${years} tahun`;
  return { en, ms };
}

/**
 * Resolves the birth date to reckon from: the stored one, else one approximated from a legacy
 * age string, else the intake date. Shared by the read mapper, the persistence payload builder
 * and `withDerivedAge`, which previously carried three copies of this expression.
 */
export function deriveBirthDate(pet: { birthDate?: string; age?: string; intakeDate: string }): string {
  return pet.birthDate || (pet.age ? approximateBirthDate(pet.age, pet.intakeDate).birthDate : pet.intakeDate);
}

/**
 * The age units this module understands, English and Malay. Applied to an already-lowercased
 * string, so none needs the `i` flag.
 *
 * **Every unit ends at a word boundary, and every abbreviation is listed explicitly.** Those two
 * properties are one decision, not two. A bare `m` with no boundary matches the *m* of `minggu`
 * — Malay for *weeks* — and read "3 minggu" as three months, ten weeks early, for exactly the
 * operators the Malay vocabulary was added to serve. But adding the boundary alone is a worse
 * bug: `\b` after a bare `m` or `y` rejects any abbreviation that continues with letters, so
 * `2 mth`, `2 mths`, `3 mnth` and `5 yo` all stop parsing and fall silently through to the
 * intake date. Measured, both ways. The boundary is only safe because `mths?`, `mnths?`, `mos?`
 * and `yo` are spelled out beside the bare forms.
 *
 * `mnths?` is here and is deliberately *not* in the backfill SQL's list: the app has always read
 * `3 mnth` via the bare `m`, and dropping it to match the migration would trade a wrong date for
 * a silent fall-through.
 */
const AGE_YEARS_PATTERN = /(\d+)\s*(?:years?|yrs?|yo|tahun|thn|y)\b/;
const AGE_MONTHS_PATTERN = /(\d+)\s*(?:months?|mths?|mnths?|mos?|bulan|bln|m)\b/;
const AGE_WEEKS_PATTERN = /(\d+)\s*(?:weeks?|wks?|minggu|mggu)\b/;

/**
 * UTC calendar arithmetic on parsed date parts, as a `YYYY-MM-DD` string — or `null` when the
 * result lies outside the range a `Date` can hold.
 *
 * `Date.UTC` reads a year argument of 0–99 as 1900–1999, so `2000 years` before 2026 lands in
 * 1926. That is left alone deliberately. Replacing it with `setUTCFullYear` was tried and
 * withdrawn: it fixed only junk ages, and it turned a hand-typed two-digit intake (`26-06-12`)
 * from 1926 into 26 AD, and put year-0026 dates into the pet form, whose `isoDateSchema` still
 * has the `Date.UTC` reading and calls them "not a real calendar day". A third copy, `isIsoDate`
 * in `transparency.ts`, already reads years 0–99 literally, so the copies disagree today; a fix
 * for the century reading has to settle all three together.
 */
function isoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month, day));
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

/**
 * The earliest date a `Date` can hold. An age so large that its birth date would be earlier still
 * — `15000000 weeks` — gets this, rather than `toISOString()` throwing `RangeError`. At runtime
 * only a pet with an `age` and no `birthDate` reaches this function, and the Prisma `Pet` model has
 * no `age` field, so no database read does. What remains is a legacy `localStorage` copy, in
 * `usePetStore`'s initializer. The contract migration's rehearsal also calls it directly.
 *
 * ceiling: no plausibility check at all, deliberately. `61 years` or `15000000 weeks` is junk, but
 * the only other answer this function can give is the intake date, which shows the animal as a
 * newborn. Clamping keeps an overflowing age older than any age that fits, and the upgrade path is
 * an "age unknown" result the read path can show. Why:
 * `tasks/decisions/2026-10-15-the-app-does-not-refuse-a-fractional-age-it-cannot-show-as-unknown.md`.
 * Also known: an extended-year string such as this one does not split as `YYYY-MM-DD`, so
 * `parseDateParts` reads it in local time and can land a day early west of UTC. That was already
 * true of the in-range junk readings (`12345678 wks` gives `-234583-03-21`).
 */
const EARLIEST_DATE = new Date(-8.64e15).toISOString().split("T")[0];

/**
 * Approximates a birth date from an age string (e.g. "2 years", "4 months", "2 tahun") relative
 * to the intake date. Timezone-invariant UTC arithmetic.
 *
 * **This function is transcribed into SQL, and that transcription is the reason not to "fix" the
 * rollover below.** The production backfill that fills `pets.birthDate` from the old `age` prose
 * reimplements this arithmetic in Postgres, in
 * `prisma/migrations/manual/20260922_pets_birth_date/migration.sql` — the *expand* half, landed
 * on master by #94. A backfill's job is to store what the application itself would have computed,
 * so the two have to agree case for case. The *contract* half beside it,
 * `20260922_pets_birth_date_contract/`, only archives and drops the old columns and contains no
 * date arithmetic at all, so it is not a third copy — an earlier revision of it did carry its own
 * backfill, the two disagreed on month-end and leap-day rows, and removing it was the fix. The
 * two folder names differ by one word; check which you have open.
 *
 * They agree on the arithmetic and **not** on the vocabulary, deliberately. The SQL reads English
 * years and months only; this function also reads Malay (`tahun`, `thn`, `bulan`, `bln`,
 * `minggu`, `mggu`) and weeks in either language. So "2 tahun" or "3 minggu" yields a birthday
 * here and is *refused and named* there, which fails closed: the backfill stops on the row rather
 * than storing a different date from the one the app would compute — and that holds for a string
 * MIXING such a unit with an English one, too: "1 tahun 6 months" is refused, because the backfill
 * treats any unit it does not read, anywhere in the string, as underivable. (Before 2026-10-14 it
 * did not, and stored six months where this function reads one year.) The decision and what it
 * does and does not verify: `tasks/decisions/2026-10-14-the-backfill-refuses-any-age-with-a-unit-it-does-not-read.md`.
 *
 * They also disagree outside ASCII, because this function's patterns are JS regexes and the SQL's
 * are Postgres ones: `\s`, `\b` and `[[:space:]]`, `\M` treat a no-break space, U+0085 and accented
 * letters differently. So the backfill refuses any `age` containing a non-ASCII character, before
 * any of its pattern results is used — widening this function to read Unicode (`\p{Zs}`, normalisation)
 * changes nothing there. `tasks/decisions/2026-10-15-the-backfill-refuses-any-non-ascii-age.md`.
 *
 * It is not a licence to treat the arithmetic as independent. Adding a unit HERE widens the gap, so
 * the backfill must refuse it — `20260922_pets_birth_date_contract/rehearse.mjs` imports this
 * function and compares it against the backfill's SQL. But only when someone runs it with
 * `npx tsx`: it is not part of `npm test` or CI, so changing this function does not, on its own,
 * run that comparison. Run it.
 *
 * **The day of month rolls forward, deliberately.** `Date.UTC(2023, 1, 29)` is 1 March, so one
 * year before 2024-02-29 is 2023-03-01, not 2023-02-28; one month before 2026-03-31 is
 * 2026-03-03, not 2026-02-28. Clamping reads better and keeps the anniversary in the intended
 * month, and it was briefly implemented here — but Postgres `make_interval` clamps while
 * JavaScript rolls, so the expand migration builds the date with `make_date(y, m, 1) + (day - 1)`
 * to match *this* function. (The contract migration beside it does no date arithmetic at all, so
 * there is one SQL copy of this rule, not two.) Changing the behaviour here silently changes what a migrated row should
 * have contained. The cost of the rollover is bounded and understood: it biases an animal a few
 * days younger, and only a row sitting within a day or two of exactly 12, 36 or 96 months lands
 * in a different `AGE_BAND_MIN_MONTHS` band as a result. Every value it produces carries
 * `birthDateIsEstimate: true`. The tests below pin it; they fail on an improvement, on purpose.
 */
export function approximateBirthDate(
  ageStr: string,
  intakeDateStr: string
): { birthDate: string; isEstimate: boolean } {
  const norm = ageStr.toLowerCase().trim();
  const parts = parseDateParts(intakeDateStr);
  if (!parts) {
    return { birthDate: new Date().toISOString().split("T")[0], isEstimate: true };
  }

  const intakeOnly = intakeDateStr.split("T")[0];
  // The arithmetic first, so any date that fits is returned exactly as before, even from an
  // intake that is itself out of range. Only when the result overflows does it matter which side
  // did: an age can only reach into the past, so with an intake inside the range the overflow is
  // the age's and clamps. With the intake out of range too there is nothing to reckon from, and it
  // is returned as given, as it is for an age with no unit.
  const derived = (birthDate: string | null) => ({
    birthDate: birthDate ?? (isoDate(parts.year, parts.month, parts.day) ? EARLIEST_DATE : intakeOnly),
    isEstimate: true,
  });

  const yearMatch = norm.match(AGE_YEARS_PATTERN);
  if (yearMatch) {
    const years = parseInt(yearMatch[1], 10);
    return derived(isoDate(parts.year - years, parts.month, parts.day));
  }

  const monthMatch = norm.match(AGE_MONTHS_PATTERN);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    return derived(isoDate(parts.year, parts.month - months, parts.day));
  }

  // Weeks last, so the largest unit still wins: "1 bulan 2 minggu" reads the month, the way
  // "1 year 6 months" reads the year. Day arithmetic rather than a month or year offset, so the
  // month-end rollover above cannot arise here — `Date` normalises a negative day exactly.
  const weekMatch = norm.match(AGE_WEEKS_PATTERN);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return derived(isoDate(parts.year, parts.month, parts.day - weeks * 7));
  }

  return { birthDate: intakeOnly, isEstimate: true };
}
