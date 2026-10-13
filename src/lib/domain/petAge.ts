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
}>(pet: T, asOf: Date | string = new Date()): T & {
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
 * The age units this module understands, English and Malay. Named constants rather than literals
 * inside `approximateBirthDate` so the two branches below are visibly one vocabulary. Both are
 * applied to an already-lowercased string, so neither needs the `i` flag.
 */
const AGE_YEARS_PATTERN = /(\d+)\s*(?:y|yr|year|thn|tahun)/;
const AGE_MONTHS_PATTERN = /(\d+)\s*(?:m|mo|month|bln|bulan)/;

/**
 * Approximates a birth date from an age string (e.g. "2 years", "4 months", "2 tahun") relative
 * to the intake date. Timezone-invariant UTC arithmetic.
 *
 * **This function is transcribed into SQL, and that transcription is the reason not to "fix" the
 * rollover below.** The production backfill that fills `pets.birthDate` from the old `age` prose
 * reimplements this arithmetic in Postgres, in
 * `prisma/migrations/manual/20260922_pets_birth_date/migration.sql` on the unmerged branch
 * `fix/pets-birth-date-production-migration`. A backfill's job is to store what the application
 * itself would have computed, so the two have to agree case for case. (The *contract* half, on
 * `worktree-pet-birth-date-migration`, only archives and drops the old columns — it does no date
 * arithmetic, so it is not a third copy. Both paths are unmerged as of 2026-10-13; read them
 * from their branches, and expect the folder names to differ by a word.)
 *
 * They do **not** agree on vocabulary. The Malay units below (`thn`, `tahun`, `bln`, `bulan`)
 * have no counterpart in that SQL, which is English-only and needs a hand-run pre-pass to
 * translate them, so "2 tahun" yields a birthday here and is refused there. That is sequencing
 * debt, recorded in `tasks/open/malay-age-units-outpace-the-backfill.md`, not a licence to treat
 * the arithmetic as independent.
 *
 * **The day of month rolls forward, deliberately.** `Date.UTC(2023, 1, 29)` is 1 March, so one
 * year before 2024-02-29 is 2023-03-01, not 2023-02-28; one month before 2026-03-31 is
 * 2026-03-03, not 2026-02-28. Clamping reads better and keeps the anniversary in the intended
 * month, and it was briefly implemented here — but Postgres `make_interval` clamps while
 * JavaScript rolls, so both SQL files build the date with `make_date(y, m, 1) + (day - 1)` to
 * match *this* function. Changing the behaviour here silently changes what a migrated row should
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

  const yearMatch = norm.match(AGE_YEARS_PATTERN);
  if (yearMatch) {
    const years = parseInt(yearMatch[1], 10);
    const d = new Date(Date.UTC(parts.year - years, parts.month, parts.day));
    return { birthDate: d.toISOString().split("T")[0], isEstimate: true };
  }

  const monthMatch = norm.match(AGE_MONTHS_PATTERN);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    const d = new Date(Date.UTC(parts.year, parts.month - months, parts.day));
    return { birthDate: d.toISOString().split("T")[0], isEstimate: true };
  }

  const dateOnly = intakeDateStr.split("T")[0];
  return { birthDate: dateOnly, isEstimate: true };
}
