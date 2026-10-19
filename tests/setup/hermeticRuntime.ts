import { afterAll, afterEach, expect } from "vitest";

/**
 * The parts of a hermetic run every tier shares, `integration-db` included.
 *
 *  1. The mode. Vitest sets `NODE_ENV=test` only when the shell has not set it,
 *     and the code branches on it in about twenty places: a shell exporting
 *     `production` failed whole files at import (the session secret becomes
 *     mandatory), and `development` switched on dev-only paths. A test that needs
 *     another mode stubs it with `vi.stubEnv`.
 *  2. The time zone. CI and Vercel run in UTC; this machine runs UTC+8, so date
 *     arithmetic near midnight could pass in one and fail in the other.
 *  3. The network, through `fetch`, which is the only HTTP client the code under
 *     test has (email; the storage providers only build URLs). The database is
 *     covered separately: with no `DATABASE_URL` the Prisma client opens no
 *     socket. A `fetch` that is not stubbed fails the test, with the URL — even
 *     when the code under test catches the error and carries on, which is
 *     exactly the case a plain rejection would hide.
 *
 * The network check runs after each test and once more after the file, and names
 * the test that was running when the call was made. Background work (an email
 * sent after the response, say) can call out after its own test has finished, so
 * that name may be a later test than the one that started the work; the URL is
 * the better lead. The end-of-file check catches what the last test left behind.
 * A call made after that check, by work that outlives the file, is still refused,
 * but nothing is left running to report it.
 */

// Object.assign because Next types NODE_ENV as read-only, which it is not at runtime.
Object.assign(process.env, { NODE_ENV: "test", TZ: "UTC" });

interface UnexpectedRequest {
  url: string;
  during: string;
}

const unexpectedRequests: UnexpectedRequest[] = [];

function describeRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = describeRequest(input);
  unexpectedRequests.push({ url, during: expect.getState().currentTestName ?? "file setup" });
  throw new TypeError(`Network access is disabled in tests; stub fetch for ${url}`);
}) as typeof fetch;

function failOnUnexpectedRequests(): void {
  if (unexpectedRequests.length === 0) return;
  const calls = unexpectedRequests.splice(0).map(({ url, during }) => `${url} (made during "${during}")`);
  throw new Error(
    `A test tried to reach the network: ${calls.join(", ")}. ` +
      'Stub fetch for it (vi.spyOn(globalThis, "fetch")) or stop the code from calling out.'
  );
}

afterEach(failOnUnexpectedRequests);
afterAll(failOnUnexpectedRequests);
