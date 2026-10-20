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

// What the browser's copy of the session says. The editor no longer asks it; the mock
// stays so the last case can hold it to that against the version that did.
const browserSession = vi.hoisted(() => ({ role: "CONTENT_EDITOR" }));

vi.mock("@/lib/client/adminAuth", () => ({
  useAdminAuth: () => ({
    user: { id: "usr-editor", email: "editor@hopeforstrays.org", name: "Editor", role: browserSession.role },
    isLoading: false,
  }),
}));
vi.mock("@/actions/transparency", () => ({
  getAdminTransparencySnapshotAction: vi.fn().mockResolvedValue({ success: true, data: SNAPSHOT }),
}));

import { TransparencyEditor } from "@/components/admin/TransparencyEditor";

/**
 * "Upload PDF" on the Audit Reports tab posts to `/api/upload`. A Content Editor, the role
 * this editor exists for, holds MANAGE_CONTENT alone; the endpoint now takes a report PDF
 * from that permission (the owner's decision, 2026-10-20), so every member the page admits
 * is offered the upload. Before, the button was answered "Unauthorized" for them.
 */
async function openAuditReports(): Promise<void> {
  render(<TransparencyEditor />);
  const user = setupUser();
  await user.click(await screen.findByRole("button", { name: /Audit Reports/i }));
}

describe("transparency Audit Reports tab", () => {
  it("offers the upload, and a link field, to every member the page admits", async () => {
    await openAuditReports();

    expect(screen.getByRole("button", { name: /Upload PDF/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/PDF link or path/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your role cannot upload files/)).toBeNull();
  });

  it("opens for a member the page admitted, whatever the browser's cached role says", async () => {
    // The page renders this editor only after its server gate admitted the member. The editor
    // used to check again from the browser's copy, and a stale one showed "Insufficient
    // permissions" on a page the server had opened. Fails against that version.
    browserSession.role = "STAFF";
    try {
      render(<TransparencyEditor />);

      expect(await screen.findByRole("button", { name: /Expense Ledger/i })).toBeInTheDocument();
      expect(screen.queryByText(/Insufficient permissions/)).toBeNull();
    } finally {
      browserSession.role = "CONTENT_EDITOR";
    }
  });
});