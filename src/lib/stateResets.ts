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
 * The registry lives on `globalThis`, under a `Symbol.for` key, and keeps one
 * reset per name. A module evaluated again (after `vi.resetModules()`, or on a
 * dev-server reload) replaces its earlier copy's entry instead of adding one, so
 * the registry cannot grow, and the harness resets the copy loaded last. A test
 * that goes on using a copy it loaded before `vi.resetModules()` owns that
 * copy's state, as it did when the harness imported each store itself.
 * Production code never runs the resets; registering costs one map entry per
 * owner.
 */

type Reset = () => void | Promise<void>;

const REGISTRY_KEY = Symbol.for("pet-shelter.stateResets");

function registry(): Map<string, Reset> {
  const holder = globalThis as unknown as Record<symbol, Map<string, Reset> | undefined>;
  let resets = holder[REGISTRY_KEY];
  if (!resets) {
    resets = new Map();
    holder[REGISTRY_KEY] = resets;
  }
  return resets;
}

/** Called once at module scope by each owner of module-level state. */
export function registerStateReset(name: string, reset: Reset): void {
  registry().set(name, reset);
}

/** The names registered so far, in load order. For the harness's own tests. */
export function registeredStateResets(): string[] {
  return [...registry().keys()];
}

/**
 * Runs every registered reset, awaiting the asynchronous ones.
 *
 * In load order, because no reset depends on another: each one only empties or
 * refills its own store, and none starts work that reads a different store. (The
 * sponsor demo, the one place that looks like a dependency, seeds the ledgers
 * lazily inside the next test, after every reset has finished.)
 */
export async function resetRegisteredState(): Promise<void> {
  for (const reset of registry().values()) {
    await reset();
  }
}
