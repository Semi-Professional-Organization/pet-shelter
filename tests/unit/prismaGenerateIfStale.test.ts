import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generatedSchemaPath,
  isClientComplete,
  isClientCurrent,
} from "../../scripts/prisma-generate-if-stale.mjs";

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

  it("is stale when only the spacing inside a quoted value changed", () => {
    const before = SCHEMA.replace("  name   String", '  name   String @default("Ongoing  care")');
    const after = SCHEMA.replace("  name   String", '  name   String @default("Ongoing care")');
    expect(isClientCurrent(after, before)).toBe(false);
  });

  it("is stale when no client has been generated yet", () => {
    expect(isClientCurrent(SCHEMA, null)).toBe(false);
  });

  describe("a client that is not all there", () => {
    let dir: string;

    function writeClient(version = "7.9.1"): void {
      dir = mkdtempSync(join(tmpdir(), "prisma-client-"));
      for (const file of ["default.js", "index.js", "schema.prisma"]) writeFileSync(join(dir, file), "");
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    }

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("is complete with every file, from the installed version", () => {
      writeClient();
      expect(isClientComplete(dir, "7.9.1")).toBe(true);
    });

    it("is incomplete when a generation stopped before default.js", () => {
      writeClient();
      unlinkSync(join(dir, "default.js"));
      expect(isClientComplete(dir, "7.9.1")).toBe(false);
    });

    it("is incomplete when another Prisma version built it", () => {
      writeClient("7.8.0");
      expect(isClientComplete(dir, "7.9.1")).toBe(false);
    });

    it("is incomplete, not a crash, when package.json was cut off mid-write", () => {
      writeClient();
      writeFileSync(join(dir, "package.json"), '{"version": "7.9');
      expect(isClientComplete(dir, "7.9.1")).toBe(false);
    });
  });

  it("finds the schema copy beside the client Node actually loads", () => {
    // A worktree that borrows its parent's node_modules must compare against that client,
    // not against a node_modules folder of its own that does not exist.
    expect(generatedSchemaPath().replace(/\\/g, "/")).toMatch(/node_modules\/\.prisma\/client\/schema\.prisma$/);
    expect(existsSync(generatedSchemaPath())).toBe(true);
  });
});
