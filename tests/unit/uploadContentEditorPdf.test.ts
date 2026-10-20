import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { PERMISSIONS, type Permission } from "@/lib/security/permissions";

vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// A Content Editor: holds MANAGE_CONTENT and nothing that stores pet media.
vi.mock("@/lib/security/adminSession", () => ({
  verifyAdminSession: vi.fn(async (permission?: Permission) =>
    permission === PERMISSIONS.MANAGE_CONTENT
      ? {
          id: "usr-content_editor",
          email: "editor@hopeforstrays.org",
          name: "Editor",
          role: "CONTENT_EDITOR",
          expiresAt: Date.now() + 86_400_000,
          authMethod: "session",
        }
      : null
  ),
}));

import { POST } from "@/app/api/upload/route";

/**
 * A Content Editor uploads audit-report PDFs, and only PDFs.
 *
 * The transparency editor exists for this role, but `/api/upload` took files from
 * MANAGE_PET_MEDIA holders alone, so its "Upload PDF" was refused. The owner chose on
 * 2026-10-20 to let content editors store report PDFs; pet photos stay with pet media.
 * The first case fails against the endpoint before that change.
 */
function upload(name: string, type: string, signature: number[]): NextRequest {
  const bytes = new Uint8Array(1024);
  bytes.set(signature, 0);
  const body = new FormData();
  body.append("file", new File([bytes], name, { type }));
  return new NextRequest("http://localhost:3000/api/upload", { method: "POST", body });
}

describe("POST /api/upload for a Content Editor", () => {
  it("stores a report PDF", async () => {
    const response = await POST(upload("audit-2026.pdf", "application/pdf", [0x25, 0x50, 0x44, 0x46]));

    expect(response.status).toBe(200);
    expect((await response.json()).url).toMatch(/\.pdf$/);
  });

  it("refuses an image, which only pet media holders store", async () => {
    const response = await POST(upload("cat.png", "image/png", [0x89, 0x50, 0x4e, 0x47]));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Your role can upload PDF reports only.");
  });
});
