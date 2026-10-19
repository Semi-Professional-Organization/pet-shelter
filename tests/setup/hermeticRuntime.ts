import net from "node:net";
import { afterAll, afterEach, expect } from "vitest";

/**
 * The parts of a hermetic run every tier shares, `integration-db` included.
 *
 *  1. The mode. Vitest sets `NODE_ENV=test` only when the shell has not set it,
 *     and the code branches on it in about twenty places: a shell exporting
 *     `production` failed whole files at import (the session secret becomes
 *     mandatory), and `development` switched on dev-only paths. A test that needs
 *     another mode stubs it with `vi.stubEnv`.
 *  2. The time zone, the same on every machine: this one runs UTC+8, so date
 *     arithmetic near midnight could pass here and fail on CI, or the reverse.
 *     UTC for server code, as on Vercel; `Asia/Kuala_Lumpur` for the components
 *     tier, which stands in for the browser.
 *  3. The network, through `fetch`, which is the only HTTP client the code under
 *     test has (email; the storage providers only build URLs). A `fetch` that is
 *     not stubbed fails the test, with the URL — even when the code under test
 *     catches the error and carries on, which is exactly the case a plain
 *     rejection would hide.
 *  4. Sockets, in every tier with no database: all but `integration-db`, whose
 *     setup sets `DATABASE_URL` before this file runs. With no `DATABASE_URL` the
 *     Prisma client opens none, and `pg`, `http` and `tls` all connect through
 *     `net.Socket.prototype.connect`, so a test that stubs a `DATABASE_URL` and
 *     forgets to mock Prisma fails here, naming the address, instead of writing
 *     into whatever listens on it.
 *
 * The check runs after each test and once more after the file, and names the test
 * that was running when the call was made. Background work (an email sent after
 * the response, say) can call out after its own test has finished, so that name
 * may be a later test than the one that started the work; the address is the
 * better lead. The end-of-file check catches what the last test left behind. A
 * call made after that check, by work that outlives the file, is still refused,
 * but nothing is left running to report it.
 *
 * ceiling: such a late call is refused silently. If one ever matters, log it from
 * the guard once the end-of-file check has run.
 */

// The browser runs where the shelter's staff and supporters are, so a client-side date bug
// (a UTC day shown as today before 08:00 there) can show up in the components tier. Chosen by
// environment: any jsdom file runs in that zone, which today means the components tier.
const TIME_ZONE = typeof window === "undefined" ? "UTC" : "Asia/Kuala_Lumpur";

// Object.assign because Next types NODE_ENV as read-only, which it is not at runtime.
Object.assign(process.env, { NODE_ENV: "test", TZ: TIME_ZONE });

interface UnexpectedRequest {
  url: string;
  during: string;
}

const unexpectedRequests: UnexpectedRequest[] = [];

function record(url: string): void {
  unexpectedRequests.push({ url, during: expect.getState().currentTestName ?? "file setup" });
}

function describeRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = describeRequest(input);
  record(url);
  throw new TypeError(`Network access is disabled in tests; stub fetch for ${url}`);
}) as typeof fetch;

/** `host:port` or a socket path, from any of the ways `connect` is called. */
function describeConnect(args: unknown[]): string {
  // `net.connect()` hands `connect` its arguments already normalized, as an array.
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (typeof first === "object" && first !== null) {
    const options = first as { host?: string; port?: number | string; path?: string };
    return options.path ?? `${options.host ?? "localhost"}:${options.port}`;
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    return `${typeof second === "string" ? second : "localhost"}:${first}`;
  }
  return String(first);
}

if (!process.env.DATABASE_URL) {
  net.Socket.prototype.connect = function connect(...args: unknown[]) {
    const target = describeConnect(args);
    record(`socket ${target}`);
    throw new Error(`Sockets are disabled in tests with no database; mock what opened one to ${target}`);
  } as typeof net.Socket.prototype.connect;
}

/** Takes what the guards recorded, for the harness's own tests of them. */
export function takeUnexpectedRequests(): UnexpectedRequest[] {
  return unexpectedRequests.splice(0);
}

function failOnUnexpectedRequests(): void {
  if (unexpectedRequests.length === 0) return;
  const calls = unexpectedRequests.splice(0).map(({ url, during }) => `${url} (made during "${during}")`);
  throw new Error(
    `A test tried to reach the network: ${calls.join(", ")}. ` +
      'Stub fetch for it with vi.stubGlobal("fetch", ...), which is undone before the next test, ' +
      "mock the database client, or stop the code from calling out."
  );
}

afterEach(failOnUnexpectedRequests);
afterAll(failOnUnexpectedRequests);
