import { describe, it, expect, expectTypeOf } from "vitest";
import {
  computeAgeInMonths,
  computeAgeCategory,
  formatAgeString,
  approximateBirthDate,
  formatAgeBandRange,
  withDerivedAge,
  AGE_BANDS,
} from "@/lib/domain/petAge";

describe("Pet Age & Lifecycle Domain Math (petAge.ts)", () => {
  describe("computeAgeInMonths", () => {
    it("computes exact months between dates", () => {
      expect(computeAgeInMonths("2025-01-15", "2026-01-15")).toBe(12);
      expect(computeAgeInMonths("2025-01-15", "2026-01-14")).toBe(11);
      expect(computeAgeInMonths("2026-01-15", "2026-05-20")).toBe(4);
    });

    it("handles invalid dates safely by returning 0", () => {
      expect(computeAgeInMonths("invalid-date", "2026-01-15")).toBe(0);
    });

    it("parses ISO date-only strings without timezone rollover offsets", () => {
      expect(computeAgeInMonths("2024-06-15", "2025-06-15")).toBe(12);
      expect(computeAgeInMonths("2024-06-15", "2025-06-14")).toBe(11);
    });
  });

  describe("computeAgeCategory (Lifecycle Boundaries)", () => {
    it("classifies < 12 months as puppy_kitten", () => {
      expect(computeAgeCategory("2026-04-01", "2026-08-01")).toBe("puppy_kitten"); // 4 months
      expect(computeAgeCategory("2025-08-02", "2026-08-01")).toBe("puppy_kitten"); // 11 months
    });

    it("classifies 12 to < 36 months (1 - <3 years) as young", () => {
      expect(computeAgeCategory("2025-08-01", "2026-08-01")).toBe("young"); // exactly 12 months
      expect(computeAgeCategory("2024-08-01", "2026-08-01")).toBe("young"); // 24 months (2 years)
      expect(computeAgeCategory("2023-08-02", "2026-08-01")).toBe("young"); // 35 months
    });

    it("classifies 36 to < 96 months (3 - <8 years) as adult", () => {
      expect(computeAgeCategory("2023-08-01", "2026-08-01")).toBe("adult"); // exactly 36 months (3 years)
      expect(computeAgeCategory("2021-08-01", "2026-08-01")).toBe("adult"); // 5 years
      expect(computeAgeCategory("2018-08-02", "2026-08-01")).toBe("adult"); // 95 months
    });

    it("classifies 96+ months (8+ years) as senior", () => {
      expect(computeAgeCategory("2018-08-01", "2026-08-01")).toBe("senior"); // exactly 96 months (8 years)
      expect(computeAgeCategory("2014-08-01", "2026-08-01")).toBe("senior"); // 12 years
    });
  });

  describe("formatAgeString", () => {
    it("formats puppy/kitten ages in months", () => {
      const formatted = formatAgeString("2026-04-01", "2026-08-01");
      expect(formatted.en).toBe("4 months");
      expect(formatted.ms).toBe("4 bulan");
    });

    it("formats 1 month singular properly", () => {
      const formatted = formatAgeString("2026-07-01", "2026-08-01");
      expect(formatted.en).toBe("1 month");
      expect(formatted.ms).toBe("1 bulan");
    });

    it("formats adult/young ages in years", () => {
      const formatted = formatAgeString("2024-08-01", "2026-08-01");
      expect(formatted.en).toBe("2 years");
      expect(formatted.ms).toBe("2 tahun");
    });

    it("formats 1 year singular properly", () => {
      const formatted = formatAgeString("2025-08-01", "2026-08-01");
      expect(formatted.en).toBe("1 year");
      expect(formatted.ms).toBe("1 tahun");
    });
  });

  /**
   * PS-114. The band edges used to be prose typed into the gallery and the admin form, and they
   * had drifted from the maths: "Senior (7+ yrs)" against a 96-month boundary, with 3 and 7 each
   * claimed by two adjacent filter options. These two tests are the guard — they fail if a label
   * and `computeAgeCategory` ever disagree again.
   */
  describe("age band labels agree with the maths", () => {
    /** Does the advertised range string claim this whole-year age? Unit-agnostic (yrs / thn). */
    function claims(range: string, years: number): boolean {
      const r = range.replace(/\s*(yrs?|thn)\s*$/, "").trim();
      let m = r.match(/^<\s*(\d+)$/);
      if (m) return years < Number(m[1]);
      m = r.match(/^(\d+)\+$/);
      if (m) return years >= Number(m[1]);
      m = r.match(/^(\d+)\s*[–-]\s*(\d+)$/);
      if (m) return years >= Number(m[1]) && years <= Number(m[2]);
      m = r.match(/^(\d+)$/);
      if (m) return years === Number(m[1]);
      throw new Error(`unparsable band range: "${range}"`);
    }

    it.each(["en", "ms"] as const)("claims every whole-year age exactly once (%s)", (locale) => {
      for (let years = 0; years <= 30; years++) {
        const hits = AGE_BANDS.filter((band) => claims(formatAgeBandRange(band, locale), years));
        expect(hits, `age ${years}y is claimed by ${hits.length} bands: [${hits.join(", ")}]`).toHaveLength(1);
      }
    });

    it("advertises the band that computeAgeCategory actually assigns", () => {
      for (let years = 0; years <= 30; years++) {
        const advertised = AGE_BANDS.find((band) => claims(formatAgeBandRange(band), years));
        expect(computeAgeCategory(`${2026 - years}-06-15`, "2026-06-15"), `at ${years}y`).toBe(advertised);
      }
    });
  });

  describe("withDerivedAge", () => {
    it("recomputes an age string that has gone stale against the calendar", () => {
      const stale = {
        birthDate: "2026-03-22",
        intakeDate: "2026-03-22",
        age: "4 months",
        ageCategory: "puppy_kitten",
      };
      const fresh = withDerivedAge(stale, "2026-08-30");
      expect(fresh.age).toBe("5 months");
      expect(fresh.ageCategory).toBe("puppy_kitten");
    });

    it("re-files a pet whose stored category no longer matches its birth date", () => {
      const stale = { birthDate: "2018-06-15", intakeDate: "2019-01-01", age: "5 years", ageCategory: "adult" };
      expect(withDerivedAge(stale, "2026-08-30").ageCategory).toBe("senior");
    });

    it("falls back to a birth date approximated from a legacy age string", () => {
      const legacy = { intakeDate: "2026-06-12", age: "2 years" };
      expect(withDerivedAge(legacy, "2026-06-12").birthDate).toBe("2024-06-12");
    });
  });

  describe("approximateBirthDate", () => {
    it("calculates approximate birth date from years", () => {
      const { birthDate, isEstimate } = approximateBirthDate("2 years", "2026-06-12");
      expect(birthDate).toBe("2024-06-12");
      expect(isEstimate).toBe(true);
    });

    it("calculates approximate birth date from months", () => {
      const { birthDate, isEstimate } = approximateBirthDate("4 months", "2026-07-22");
      expect(birthDate).toBe("2026-03-22");
      expect(isEstimate).toBe(true);
    });

    /**
     * These three pin the month-end rollover rather than correcting it, and they are expected to
     * fail if someone "fixes" it. Two SQL transcriptions of `approximateBirthDate` — the expand
     * and contract halves of the `pets.birthDate` backfill — build their dates to match this
     * function exactly, because a backfill must store what the application itself would compute.
     * Postgres `make_interval` would clamp, so both files deliberately do not use it.
     *
     * On 2026-09-22 three branches held three versions of this arithmetic and no two agreed; the
     * divergence was invisible because nothing anywhere asserted the awkward cases. That is what
     * these tests are for. Changing the behaviour means changing all three together —
     * `tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`.
     */
    it("rolls a month-end day forward rather than clamping it", () => {
      // 31 March less one month has no 31st to land on, and `Date.UTC(2026, 1, 31)` is 3 March.
      expect(approximateBirthDate("1 month", "2026-03-31").birthDate).toBe("2026-03-03");
      expect(approximateBirthDate("1 month", "2026-05-31").birthDate).toBe("2026-05-01");
    });

    it("rolls a leap day forward rather than clamping it", () => {
      // `Date.UTC(2023, 1, 29)` is 1 March 2023. The only year-case that moves at all.
      expect(approximateBirthDate("1 year", "2024-02-29").birthDate).toBe("2023-03-01");
    });

    it("leaves a day that exists in the target month alone", () => {
      // Most dates: the rollover is reached only when the day overflows its target month.
      expect(approximateBirthDate("1 month", "2026-03-15").birthDate).toBe("2026-02-15");
      expect(approximateBirthDate("1 year", "2023-02-28").birthDate).toBe("2022-02-28");
      expect(approximateBirthDate("18 months", "2026-06-12").birthDate).toBe("2024-12-12");
    });

    /**
     * Weeks, and the abbreviations that make the word boundary safe.
     *
     * `3 minggu` is Malay for three weeks and used to read as three *months*, because a bare `m`
     * with no boundary matches the m of minggu — ten weeks early, for exactly the operators the
     * Malay vocabulary serves. Adding the boundary alone is a worse bug: it rejects every short
     * month form that continues with letters. Both halves are pinned here, because fixing one
     * and breaking the other passes a narrow test table.
     */
    it("reads weeks in both languages", () => {
      expect(approximateBirthDate("3 minggu", "2026-06-12").birthDate).toBe("2026-05-22");
      expect(approximateBirthDate("2 mggu", "2026-06-12").birthDate).toBe("2026-05-29");
      expect(approximateBirthDate("3 weeks", "2026-06-12").birthDate).toBe("2026-05-22");
      expect(approximateBirthDate("3 wks", "2026-06-12").birthDate).toBe("2026-05-22");
      expect(approximateBirthDate("3 wk", "2026-06-12").birthDate).toBe("2026-05-22");
    });

    it("does not read a Malay week as a month", () => {
      // The defect itself, named by the value it used to produce.
      expect(approximateBirthDate("3 minggu", "2026-06-12").birthDate).not.toBe("2026-03-12");
    });

    it("still reads every short month and year form", () => {
      // These four are what a bare `\b` after `m`/`y` silently destroys. If this test fails, the
      // unit list lost an abbreviation and those ages now fall through to the intake date.
      expect(approximateBirthDate("2 mth", "2026-06-12").birthDate).toBe("2026-04-12");
      expect(approximateBirthDate("2 mths", "2026-06-12").birthDate).toBe("2026-04-12");
      expect(approximateBirthDate("3 mnth", "2026-06-12").birthDate).toBe("2026-03-12");
      expect(approximateBirthDate("5 yo", "2026-06-12").birthDate).toBe("2021-06-12");
      // And the forms that already worked, so the curated list cannot quietly shrink.
      expect(approximateBirthDate("6 mo", "2026-06-12").birthDate).toBe("2025-12-12");
      expect(approximateBirthDate("4 mos", "2026-06-12").birthDate).toBe("2026-02-12");
      expect(approximateBirthDate("3 yrs", "2026-06-12").birthDate).toBe("2023-06-12");
      expect(approximateBirthDate("1 y/o", "2026-06-12").birthDate).toBe("2025-06-12");
    });

    it("lets the largest unit win in a compound age", () => {
      // Weeks are matched last for this reason: a month plus weeks is a month, the way a year
      // plus months is a year.
      expect(approximateBirthDate("1 bulan 2 minggu", "2026-06-12").birthDate).toBe("2026-05-12");
      expect(approximateBirthDate("1 year 6 months", "2026-06-12").birthDate).toBe("2025-06-12");
    });

    it("costs a leap-day animal its band on its own first birthday", () => {
      // The known, accepted price of the rule above, asserted so it is a decision on record
      // rather than a surprise: rolling to 1 March makes the animal 11 months old a year after
      // it was born, and `AGE_BAND_MIN_MONTHS.young` is 12 — so it still reads as a puppy.
      const born = approximateBirthDate("1 year", "2024-02-29").birthDate;
      expect(computeAgeInMonths(born, "2024-02-29")).toBe(11);
      expect(computeAgeCategory(born, "2024-02-29")).toBe("puppy_kitten");
    });
  });

  /**
   * A count so large the derived date leaves the range a `Date` can hold. These threw `RangeError`
   * from `toISOString()`, and no caller catches it. Kept in its own block, away from the spellings.
   */
  describe("approximateBirthDate when the derived date overflows", () => {
    const intake = "2026-06-12";

    // Clamped to the earliest date a `Date` holds, so a larger age is still older — never the
    // intake date, which would show a newborn. The compound case must not fall on to its smaller
    // unit and come back as two months.
    it.each(["300000 years", "99999999 months", "15000000 weeks", "300000 years 2 months"])(
      "clamps %j to the earliest date instead of throwing",
      (age) => {
        expect(approximateBirthDate(age, intake).birthDate).toBe("-271821-04-20");
      },
    );

    // The clamped date has to survive the read path, not just this function.
    it("reads a clamped age as a senior, end to end", () => {
      const pet = withDerivedAge({ intakeDate: intake, age: "15000000 weeks" }, intake);
      expect(pet.ageCategory).toBe("senior");
    });

    // An intake outside the range leaves nothing to reckon from: returned as given, exactly as it
    // is for an age with no unit.
    it("does not throw when the intake date itself is out of range", () => {
      expect(approximateBirthDate("2 years", "300000-01-01").birthDate).toBe("300000-01-01");
    });

    // The arithmetic runs before any range check, so an intake just past the maximum still yields
    // a birth date that fits, exactly as master computed it — not the intake date.
    it("derives a date that fits even when the intake alone is past the maximum", () => {
      expect(approximateBirthDate("1 week", "275760-09-14").birthDate).toBe("+275760-09-07");
    });

    // Inside the range nothing changes, odd as the readings are. No plausibility ceiling.
    it.each([
      ["61 years", "1965-06-12"],
      ["12345678 wks", "-234583-03-21"],
    ])("still derives %j, which stays inside the date range", (age, expected) => {
      expect(approximateBirthDate(age, intake).birthDate).toBe(expected);
    });

    // `Date.UTC` read a year argument of 0–99 as 1900–1999, so `2000 years` came out younger than
    // `1900`. On the months path that argument is the intake year, so an early intake moved too.
    it.each([
      ["2000 years", intake, "0026-06-12"],
      ["1990 years", intake, "0036-06-12"],
      ["700 months", "0050-03-01", "-000009-11-01"],
    ])("keeps %j from %j in the right century", (age, from, expected) => {
      expect(approximateBirthDate(age, from).birthDate).toBe(expected);
    });
  });

  /**
   * `withDerivedAge` recomputes four fields, so their types must come from it, not from the input.
   * `expectTypeOf` is checked by `tsc` (`npm run typecheck`), not at runtime; the `expect` beside
   * each covers the runtime half.
   */
  describe("withDerivedAge's return type", () => {
    it("types the flag it computes as boolean, not as the literal it was given", () => {
      const r = withDerivedAge(
        { intakeDate: "2026-06-12", age: "2 years", birthDateIsEstimate: false },
        "2026-06-12",
      );
      // No birthDate, so the flag is forced to true at runtime — its type must not stay `false`.
      expectTypeOf(r.birthDateIsEstimate).toEqualTypeOf<boolean>();
      expect(r.birthDateIsEstimate).toBe(true);
    });

    it("does not collapse to never when the flag is passed as undefined", () => {
      const r = withDerivedAge(
        { intakeDate: "2026-06-12", age: "2 years", birthDateIsEstimate: undefined },
        "2026-06-12",
      );
      expectTypeOf(r.age).toEqualTypeOf<string>();
      expect(r.age).toBe("2 years");
    });
  });
});
