import { vi } from "vitest";

export const REJECTION_PLEDGE_REF = "HFS-PLG-29990115-ATOMIC";

export const REJECTION_AUDIT_CONTEXT = {
  actorId: "probe-coordinator-id",
  actorEmail: "coordinator@example.test",
  actorRole: "VOLUNTEER_COORDINATOR",
  reason: "No transfer received after 30 days",
};

export interface FakeSponsorshipRow {
  id: string;
  petId: string | null;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  sponsorPhone: string | null;
  userId: string | null;
  displayOnWall: boolean;
  tierId: string;
  tierName: string;
  frequency: string;
  amountSen: number;
  paymentMethod: string;
  status: string;
  pledgeRef: string;
  receiptNumber: string | null;
  reconciledAt: Date | null;
  reconciledBy: string | null;
  cancelledAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAuditRow {
  action: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  targetEntity: string;
  targetId: string | null;
  details: string;
  metadata?: unknown;
  createdAt?: Date;
}

interface ConditionalUpdateArgs {
  where: { pledgeRef: string; status?: string };
  data: Partial<FakeSponsorshipRow>;
}

interface FindUniqueArgs {
  where: { pledgeRef: string };
}

interface AuditCreateArgs {
  data: FakeAuditRow;
}

function initialSponsorshipRow(): FakeSponsorshipRow {
  const createdAt = new Date("2999-01-15T04:00:00.000Z");
  return {
    id: "probe-sponsorship-id",
    petId: null,
    petName: "Probe Pet",
    sponsorName: "Probe Sponsor",
    sponsorEmail: "probe@example.test",
    sponsorPhone: null,
    userId: null,
    displayOnWall: false,
    tierId: "kibble",
    tierName: "Kibble Fund",
    frequency: "one_time",
    amountSen: 5_000,
    paymentMethod: "online_banking",
    status: "PENDING_PAYMENT",
    pledgeRef: REJECTION_PLEDGE_REF,
    receiptNumber: null,
    reconciledAt: null,
    reconciledBy: null,
    cancelledAt: null,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * A transaction-aware Prisma double for the rejection contract.
 *
 * Transaction-client writes are applied optimistically and restored when the
 * callback throws, matching the one property the test needs from PostgreSQL.
 * Top-level delegates are deliberately separate so the test can detect a write
 * or audit row that escaped the transaction client.
 */
export function createSponsorshipRejectionFakeDb() {
  let sponsorshipRow = initialSponsorshipRow();
  const auditRows: FakeAuditRow[] = [];
  let auditInsertFailuresRemaining = 0;

  const updateMany = async (args: ConditionalUpdateArgs): Promise<number> => {
    const matches =
      sponsorshipRow.pledgeRef === args.where.pledgeRef &&
      (args.where.status === undefined || sponsorshipRow.status === args.where.status);
    if (!matches) return 0;

    sponsorshipRow = { ...sponsorshipRow, ...args.data };
    return 1;
  };

  const findUnique = async (args: FindUniqueArgs): Promise<FakeSponsorshipRow | null> =>
    sponsorshipRow.pledgeRef === args.where.pledgeRef ? { ...sponsorshipRow } : null;

  const createAudit = async (args: AuditCreateArgs): Promise<FakeAuditRow> => {
    if (auditInsertFailuresRemaining > 0) {
      auditInsertFailuresRemaining -= 1;
      throw new Error("audit insert refused");
    }

    const row = { ...args.data };
    auditRows.push(row);
    return row;
  };

  const transactionClient = {
    petSponsorship: {
      updateManyAndReturn: vi.fn(async (args: ConditionalUpdateArgs) => {
        const count = await updateMany(args);
        return count === 1 ? [{ ...sponsorshipRow }] : [];
      }),
      findUnique: vi.fn(findUnique),
    },
    auditLog: {
      create: vi.fn(createAudit),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (work: (tx: typeof transactionClient) => Promise<unknown>) => {
      const rowSnapshot = { ...sponsorshipRow };
      const auditCount = auditRows.length;
      try {
        return await work(transactionClient);
      } catch (error) {
        sponsorshipRow = rowSnapshot;
        auditRows.length = auditCount;
        throw error;
      }
    }),
    petSponsorship: {
      updateMany: vi.fn(async (args: ConditionalUpdateArgs) => ({ count: await updateMany(args) })),
      findUnique: vi.fn(findUnique),
    },
    auditLog: {
      create: vi.fn(createAudit),
    },
  };

  return {
    prisma,
    transactionClient,
    auditRows: () => auditRows.map((row) => ({ ...row })),
    currentSponsorship: () => ({ ...sponsorshipRow }),
    failNextAuditInsert: () => {
      auditInsertFailuresRemaining += 1;
    },
    setSponsorship: (overrides: Partial<FakeSponsorshipRow>) => {
      sponsorshipRow = { ...sponsorshipRow, ...overrides };
    },
  };
}
