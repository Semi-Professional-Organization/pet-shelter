import { describe, expect, it } from "vitest";
import { isClientCurrent } from "../../scripts/prisma-generate-if-stale.mjs";

/**
 * `npm test` regenerates the Prisma client only when the schema changed
 * (`scripts/prisma-generate-if-stale.mjs`). A wrong "current" leaves a stale
 * client, which fails in files nobody touched; a wrong "stale" brings back the
 * regeneration that broke concurrent runs. Both directions are pinned here.
 */
const SCHEMA = [
  "model Pet {",
  "  id     String @id",
  "  name   String",
  "}",
].join("\n");

describe("isClientCurrent", () => {
  it("is current when the generated copy matches the schema", () => {
    expect(isClientCurrent(SCHEMA, SCHEMA)).toBe(true);
  });

  it("ignores the column alignment prisma format changes", () => {
    const realigned = SCHEMA.replace("id     String", "id   String").replace(/\n/g, "\r\n");
    expect(isClientCurrent(SCHEMA, realigned)).toBe(true);
  });

  it("is stale when a field was added", () => {
    const changed = SCHEMA.replace("}", "  age Int\n}");
    expect(isClientCurrent(changed, SCHEMA)).toBe(false);
  });

  it("is stale when no client has been generated yet", () => {
    expect(isClientCurrent(SCHEMA, null)).toBe(false);
  });
});
