import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MemberRecord } from "@/lib/domain/member";

vi.mock("@/actions/members", () => ({
  inviteMember: vi.fn(),
  resendInvitation: vi.fn(),
  toggleMemberStatus: vi.fn(),
  updateMemberRole: vi.fn(),
}));

import { MemberDataTable } from "@/components/admin/MemberDataTable";

/**
 * "Edit Role" on the operator's own row.
 *
 * Only a Super Admin can open Staff & Permissions, and `updateMemberRole` refuses any change
 * to your own row except to Super Admin, the role you already hold. The dialog still offered
 * all five roles, four of them refused on save. The first case fails against the table before
 * 2026-10-19, which disabled only "Suspend" on your own row.
 */
function member(id: string, name: string): MemberRecord {
  return {
    id,
    email: `${id}@hopeforstrays.org`,
    name,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    lastLoginAt: null,
    invitedBy: null,
    hasPendingInvite: false,
    inviteExpiresAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function editRoleButtonInRowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return within(row).getByRole("button", { name: /Edit Role/i });
}

describe("Staff & Permissions own row", () => {
  it("offers no role change on your own row, and says why", () => {
    render(<MemberDataTable members={[member("me", "Operator"), member("other", "Colleague")]} currentUserId="me" />);

    const button = editRoleButtonInRowOf("Operator");
    expect(button).toBeDisabled();
    // A disabled button takes no pointer events, so its own title never shows; the
    // reason has to sit on an element that does.
    expect(button.closest('[title="You cannot change your own role"]')).not.toBe(button);
    expect(button.closest('[title="You cannot change your own role"]')).not.toBeNull();
  });

  it("still offers it on everyone else's", () => {
    render(<MemberDataTable members={[member("me", "Operator"), member("other", "Colleague")]} currentUserId="me" />);

    expect(editRoleButtonInRowOf("Colleague")).toBeEnabled();
  });
});
