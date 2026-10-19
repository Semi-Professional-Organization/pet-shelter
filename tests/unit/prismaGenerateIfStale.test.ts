import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedSchemaPath, isClientCurrent } from "../../scripts/prisma-generate-if-stale.mjs";

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

  it("is stale when a field moved into a comment by joining two lines", () => {
    const withComment = SCHEMA.replace("  name   String", "  // legacy\n  name   String");
    const commentedOut = SCHEMA.replace("  name   String", "  // legacy name String");
    expect(isClientCurrent(commentedOut, withComment)).toBe(false);
  });

  it("is stale when no client has been generated yet", () => {
    expect(isClientCurrent(SCHEMA, null)).toBe(false);
  });

  it("finds the schema copy beside the client Node actually loads", () => {
    // A worktree that borrows its parent's node_modules must compare against that client,
    // not against a node_modules folder of its own that does not exist.
    expect(generatedSchemaPath().replace(/\\/g, "/")).toMatch(/node_modules\/\.prisma\/client\/schema\.prisma$/);
    expect(existsSync(generatedSchemaPath())).toBe(true);
  });
});
