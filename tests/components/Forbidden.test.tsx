import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Forbidden from "@/app/forbidden";

/**
 * The 403 page's way back.
 *
 * "Back to Admin" pointed at /admin/pets, which only Super Admins and Animal Managers can
 * open, so a refused STAFF, Content Editor or Volunteer Coordinator was sent to a second
 * refusal. /admin sends each role to the first section it can open.
 */
describe("403 page", () => {
  it("leads back to /admin rather than to one section", () => {
    render(<Forbidden />);

    expect(screen.getByRole("link", { name: /Back to Admin/i })).toHaveAttribute("href", "/admin");
  });
});
