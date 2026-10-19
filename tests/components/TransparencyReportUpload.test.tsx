import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setupUser } from "./support/render";
import type { TransparencySnapshot } from "@/lib/domain/transparency";

const SNAPSHOT = vi.hoisted(
  (): TransparencySnapshot => ({
    expenses: [],
    reports: [],
    impactStats: [],
    allocation: [],
    totalSen: 0,
    expenseCount: 0,
    hasMoreExpenses: false,
    lastExpenseDate: null,
    source: "database",
  })
);

vi.mock("@/lib/client/adminAuth", () => ({
  useAdminAuth: () => ({
    user: { id: "usr-editor", email: "editor@hopeforstrays.org", name: "Editor", role: "CONTENT_EDITOR" },
    isLoading: false,
  }),
}));
vi.mock("@/actions/transparency", () => ({
  getAdminTransparencySnapshotAction: vi.fn().mockResolvedValue({ success: true, data: SNAPSHOT }),
}));

import { TransparencyEditor } from "@/components/admin/TransparencyEditor";

/**
 * "Upload PDF" on the Audit Reports tab posts to `/api/upload`, which stores files for
 * MANAGE_PET_MEDIA holders only. A Content Editor, the role this editor exists for, holds
 * MANAGE_CONTENT alone, so the button was always answered "Unauthorized: Admin access
 * required". The first case fails against the editor before 2026-10-19, which offered the
 * button to everyone.
 */
async function openAuditReports(canUploadFiles: boolean): Promise<void> {
  render(<TransparencyEditor canUploadFiles={canUploadFiles} />);
  const user = setupUser();
  await user.click(await screen.findByRole("button", { name: /Audit Reports/i }));
}

describe("transparency Audit Reports tab", () => {
  it("offers no upload to a member the upload endpoint refuses, and says what to do instead", async () => {
    await openAuditReports(false);

    expect(screen.queryByRole("button", { name: /Upload PDF/i })).toBeNull();
    expect(screen.getByText(/Your role cannot upload files/)).toBeInTheDocument();
    expect(screen.getByLabelText(/PDF link or path/i)).toBeInTheDocument();
  });

  it("offers the upload to a member it accepts", async () => {
    await openAuditReports(true);

    expect(screen.getByRole("button", { name: /Upload PDF/i })).toBeInTheDocument();
    expect(screen.queryByText(/Your role cannot upload files/)).toBeNull();
  });
});
