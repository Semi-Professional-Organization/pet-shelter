/**
 * Exact monetary arithmetic for MYR amounts.
 *
 * ## Why sen, and not `Float` or Prisma `Decimal`
 *
 * Donation amounts back **the shelter's donation records and published accounts**, so
 * an amount that is off by a hundredth of a cent is a defective record, not a rounding
 * curiosity. Three candidate representations were considered:
 *
 * - `Float` / JS `number` in ringgit — rejected. `0.1 + 0.2 !== 0.3`, and summing
 *   a year of donations for the annual accounts accumulates the error.
 * - Prisma `Decimal` (`@db.Decimal(10,2)`) — exact in the database, but crosses
 *   the `"use server"` boundary as a class instance. Next.js serializes Server
 *   Action results structurally, so a `Decimal` arrives at the client as a plain
 *   object (or throws), and every consumer needs to remember to rehydrate it.
 *   Exactness that depends on every call site remembering something is brittle.
 * - **Integer sen** — chosen. 1 ringgit = 100 sen, stored as an `Int`. Exact
 *   under addition and comparison, serializes as a number across every boundary,
 *   and has no library or driver dependency. This is the representation Stripe
 *   and most payment processors use, for the same reasons.
 *
 * `Int` tops out at 2,147,483,647 sen ≈ RM 21.4 million, comfortably above the
 * RM 100,000 per-donation ceiling in `donationPledgeSchema`. Postgres promotes
 * `sum(int)` to `bigint`, so aggregate reporting does not overflow either.
 *
 * ## The brand
 *
 * `Sen` is a branded number: a plain integer at runtime, but not assignable from
 * an unbranded `number`. That makes the one genuinely dangerous mistake in money
 * code — passing ringgit where sen is expected, silently under-charging by 100x —
 * a compile error instead of a defect discovered during an audit.
 */

declare const senBrand: unique symbol;

/** An integer number of sen (1/100 MYR). Construct via the helpers below. */
export type Sen = number & { readonly [senBrand]: true };

export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyFormatError";
  }
}

/** Accepts `12`, `12.5`, `12.50`, `-3.05`. Rejects exponential and >2 decimals. */
const RINGGIT_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Renders a number as a plain decimal string, refusing exponential notation.
 *
 * `String(1e21)` is `"1e+21"` and `String(1e-7)` is `"1e-7"`; both would slip
 * past a decimal regex as malformed rather than as the out-of-range values they
 * are. Failing loudly here keeps {@link senFromRinggit} exact for every input it
 * accepts, instead of exact for most and quietly wrong for the rest.
 */
function toPlainDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new MoneyFormatError(`Amount must be a finite number, received ${String(value)}`);
  }
  const rendered = String(value);
  if (rendered.includes("e") || rendered.includes("E")) {
    throw new MoneyFormatError(
      `Amount ${rendered} is outside the range that can be represented exactly in sen`
    );
  }
  return rendered;
}

/**
 * Converts a ringgit amount to exact sen.
 *
 * Deliberately string-based rather than `Math.round(value * 100)`: the
 * multiplication is itself lossy (`1.005 * 100` is `100.49999999999999`, which
 * rounds *down* to RM 1.00), so rounding it cannot recover the intended value.
 * Reading the decimal digits directly is exact for every input the regex admits.
 *
 * @throws {MoneyFormatError} on non-finite input, exponential notation, or more
 *         than two decimal places — a third decimal in a currency with no
 *         sub-sen denomination is a caller bug, not a value to round away.
 */
export function senFromRinggit(value: number | string): Sen {
  const raw = typeof value === "number" ? toPlainDecimalString(value) : value.trim();
  const match = RINGGIT_PATTERN.exec(raw);
  if (!match) {
    throw new MoneyFormatError(
      `"${raw}" is not a valid MYR amount. Expected digits with at most two decimal places.`
    );
  }

  const [, sign, whole, fraction = ""] = match;
  const paddedFraction = fraction.padEnd(2, "0");
  const magnitude = Number(whole) * 100 + Number(paddedFraction);

  if (!Number.isSafeInteger(magnitude)) {
    throw new MoneyFormatError(`Amount ${raw} exceeds the exactly representable range`);
  }

  return (sign === "-" ? -magnitude : magnitude) as Sen;
}

/**
 * Wraps an already-integral sen value, e.g. one read straight out of an `Int`
 * column. Validates rather than casting so a corrupt or wrongly-mapped row
 * surfaces at the boundary instead of propagating a fractional `Sen`.
 */
export function senFromInteger(value: number): Sen {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyFormatError(`Sen amount must be a safe integer, received ${String(value)}`);
  }
  return value as Sen;
}

/**
 * Converts sen back to a ringgit `number` for DTOs and display.
 *
 * Lossless in this direction: any safe-integer sen value divided by 100 is
 * exactly representable as a float to two decimal places. Use it at the edges;
 * keep {@link Sen} internally wherever amounts are stored, summed, or compared.
 */
export function ringgitFromSen(value: Sen): number {
  return value / 100;
}

/** Exact sum. Returns 0 sen for an empty list. */
export function sumSen(values: readonly Sen[]): Sen {
  return values.reduce<number>((total, current) => total + current, 0) as Sen;
}

/**
 * Formats sen as a receipt-ready MYR string, e.g. `RM 1,250.00`.
 *
 * Always two decimal places and always grouped, because this string lands on
 * emails and in CSV exports for the annual accounts, where a
 * bare `RM 1250` and `RM 1,250.00` are not interchangeable.
 */
export function formatMYR(value: Sen, options?: { withSymbol?: boolean }): string {
  const withSymbol = options?.withSymbol ?? true;
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const grouped = whole.toLocaleString("en-MY", { useGrouping: true });
  const body = `${grouped}.${fraction}`;
  const signed = negative ? `-${body}` : body;
  return withSymbol ? `RM ${signed}` : signed;
}
