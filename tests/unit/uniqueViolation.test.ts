import { describe, it, expect } from "vitest";
import { uniqueViolationOn } from "@/lib/server/uniqueViolation";

/**
 * The unique-violation reader, on error objects.
 *
 * `CAPTURED` is not hand-built. It is the `code` and `meta` of a real duplicate
 * insert into `donation_pledges` against PostgreSQL 18 through Prisma 7 and
 * `@prisma/adapter-pg`, recorded on 2026-10-13, and
 * `tests/integration/db/uniqueViolation.postgres.test.ts` re-observes it against a
 * live server. That matters because the predicates this module replaced were all
 * tested against fabricated errors carrying a `meta.target` this client never
 * sets, and so stayed green while being wrong.
 *
 * The other cases here are deliberately *not* that shape. They cover what the
 * reader must still do if a driver reports the constraint some other way.
 */
const CAPTURED = {
  code: "P2002",
  meta: {
    modelName: "DonationPledge",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage:
          'duplicate key value violates unique constraint "donation_pledges_pledgeRef_key"',
        kind: "UniqueConstraintViolation",
        constraint: { fields: ['"pledgeRef"'] },
      },
    },
  },
};

function p2002(meta: unknown) {
  return { code: "P2002", meta };
}

describe("uniqueViolationOn", () => {
  it("reads the error this client really raises", () => {
    expect(uniqueViolationOn(CAPTURED, "pledgeRef")).toBe(true);
    expect(uniqueViolationOn(CAPTURED, "receiptNumber")).toBe(false);
  });

  it("is false for anything that is not a P2002", () => {
    expect(uniqueViolationOn(new Error("boom"), "pledgeRef")).toBe(false);
    expect(uniqueViolationOn({ code: "P2003", meta: CAPTURED.meta }, "pledgeRef")).toBe(false);
    expect(uniqueViolationOn(null, "pledgeRef")).toBe(false);
    expect(uniqueViolationOn("P2002", "pledgeRef")).toBe(false);
  });

  it("says 'unnamed', not false, when the violation names nothing", () => {
    // A different fact from "names something else", and each caller decides what
    // it may do with it. Folding it into a boolean is how the earlier predicates
    // ended up either never retrying or retrying everything.
    expect(uniqueViolationOn(p2002(undefined), "pledgeRef")).toBe("unnamed");
    expect(uniqueViolationOn(p2002({}), "pledgeRef")).toBe("unnamed");
    expect(
      uniqueViolationOn(
        p2002({ driverAdapterError: { cause: { kind: "UniqueConstraintViolation" } } }),
        "pledgeRef"
      )
    ).toBe("unnamed");
  });

  it("falls back to the constraint name when the adapter parsed no fields", () => {
    const err = p2002({
      driverAdapterError: {
        cause: {
          originalMessage:
            'duplicate key value violates unique constraint "donation_pledges_receiptNumber_key"',
        },
      },
    });

    expect(uniqueViolationOn(err, "receiptNumber")).toBe(true);
    // Not "unnamed": the message names the constraint, so this must be a refusal.
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(false);
  });

  it("reads a constraint reported by index name", () => {
    const err = p2002({
      driverAdapterError: {
        cause: { constraint: { index: "adoption_applications_referenceCode_key" } },
      },
    });

    expect(uniqueViolationOn(err, "referenceCode")).toBe(true);
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(false);
  });

  it("does not let an empty fields array shadow a populated target", () => {
    const err = p2002({
      target: ["referenceCode"],
      driverAdapterError: { cause: { constraint: { fields: [] } } },
    });

    expect(uniqueViolationOn(err, "referenceCode")).toBe(true);
  });

  it("still reads the pre-adapter target shapes", () => {
    expect(uniqueViolationOn(p2002({ target: ["pledgeRef"] }), "pledgeRef")).toBe(true);
    expect(
      uniqueViolationOn(p2002({ target: "pet_sponsorships_pledgeRef_key" }), "pledgeRef")
    ).toBe(true);
    expect(uniqueViolationOn(p2002({ target: ["receiptNumber"] }), "pledgeRef")).toBe(false);
  });

  it("matches a column exactly, not by substring", () => {
    // A substring test would read `originalPledgeRef` as `pledgeRef` and `petId`
    // as `id`, and a caller would retry a collision on the wrong constraint.
    const fields = (f: string[]) =>
      p2002({ driverAdapterError: { cause: { constraint: { fields: f } } } });

    expect(uniqueViolationOn(fields(['"originalPledgeRef"']), "pledgeRef")).toBe(false);
    expect(uniqueViolationOn(fields(['"petId"']), "id")).toBe(false);
    expect(uniqueViolationOn(fields(["email"]), "email")).toBe(true);

    const index = (name: string) =>
      p2002({ driverAdapterError: { cause: { constraint: { index: name } } } });

    expect(uniqueViolationOn(index("t_originalPledgeRef_key"), "pledgeRef")).toBe(false);
    // The table name contains the column string; the constraint is on another.
    expect(uniqueViolationOn(index("pledgeRef_archive_receiptNumber_key"), "pledgeRef")).toBe(
      false
    );
    expect(uniqueViolationOn(index("donation_pledges_pledgeRef_key"), "pledgeRef")).toBe(true);
  });

  it("lets a column list overrule a constraint name that merely ends the same way", () => {
    // A compound unique whose index name ends in the column asked about. The
    // adapter lists the fields, so the answer comes from them and is exact.
    const err = p2002({
      driverAdapterError: {
        cause: {
          originalMessage:
            'duplicate key value violates unique constraint "pet_sponsorships_petId_pledgeRef_key"',
          constraint: { fields: ['"petId"', '"pledgeRef"'] },
        },
      },
    });
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(true);
    expect(uniqueViolationOn(err, "receiptNumber")).toBe(false);

    const other = p2002({
      driverAdapterError: {
        cause: {
          originalMessage:
            'duplicate key value violates unique constraint "archive_pledgeRef_key"',
          constraint: { fields: ['"originalPledgeRef"'] },
        },
      },
    });
    // The name ends `_pledgeRef_key`; the column it is actually on is not `pledgeRef`.
    expect(uniqueViolationOn(other, "pledgeRef")).toBe(false);
  });

  it("reads an index name that arrives inside the legacy target array", () => {
    expect(
      uniqueViolationOn(p2002({ target: ["donation_pledges_pledgeRef_key"] }), "pledgeRef")
    ).toBe(true);
    expect(
      uniqueViolationOn(p2002({ target: ["donation_pledges_receiptNumber_key"] }), "pledgeRef")
    ).toBe(false);
  });
});
