/**
 * The resets for module-level state, registered by the modules that own it.
 *
 * Several modules in `src/lib` keep an in-memory store at module scope — the
 * fallback repositories, the ledgers, the rate limiter, the audit log. A test
 * that mutates one must not leak that state into the next test, so each owner
 * exports a reset, and registers it here when it is loaded.
 *
 * The test harness (`tests/setup/nextMocks.ts`) runs every registered reset
 * before every test. Because a module registers only once it is evaluated, a
 * test file resets exactly the stores it actually loaded. The harness used to
 * import all eleven owners itself before every test instead, which loaded
 * Prisma, `pg` and every repository into files that test pure functions, and
 * made that cold import the slowest part of the suite.
 *
 * The registry lives on `globalThis`, under a `Symbol.for` key, so a module
 * re-evaluated after `vi.resetModules()` replaces its own entry by name rather
 * than adding a second, stale one beside it. Production code never runs the
 * resets; registering costs one map entry per owner.
 */

type Reset = () => void | Promise<void>;

/**
 * When a reset runs relative to the others. Almost all module state is
 * independent and resets in the default phase. The two later phases exist for
 * the one real dependency, in the sponsor demo: its seed flag must be cleared
 * only once every ledger is empty, or the next test starts with stale standings.
 */
export const RESET_PHASE = {
  /** No dependency on another store's state. */
  default: 0,
  /** After every ledger is empty: the sponsor demo-seed flag, so the next test re-seeds. */
  afterLedgers: 1,
  /** After the demo-seed flag: the seeded sponsor accounts the demo commitments name. */
  afterDemoSeed: 2,
} as const;

interface RegisteredReset {
  /** A `RESET_PHASE`; lower runs first, and resets in one phase run in load order. */
  order: number;
  reset: Reset;
}

const REGISTRY_KEY = Symbol.for("pet-shelter.stateResets");

function registry(): Map<string, RegisteredReset> {
  const holder = globalThis as unknown as Record<symbol, Map<string, RegisteredReset> | undefined>;
  let resets = holder[REGISTRY_KEY];
  if (!resets) {
    resets = new Map();
    holder[REGISTRY_KEY] = resets;
  }
  return resets;
}

/** Called once at module scope by each owner of module-level state. */
export function registerStateReset(name: string, reset: Reset, order: number = RESET_PHASE.default): void {
  registry().set(name, { order, reset });
}

/** The names registered so far, in run order. For the harness's own tests. */
export function registeredStateResets(): string[] {
  return [...registry().entries()]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([name]) => name);
}

/** Runs every registered reset, in order, awaiting the asynchronous ones. */
export async function resetRegisteredState(): Promise<void> {
  const resets = [...registry().values()].sort((a, b) => a.order - b.order);
  for (const { reset } of resets) {
    await reset();
  }
}
