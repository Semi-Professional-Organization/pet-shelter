import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { BulletinDataTable } from "@/components/admin/BulletinDataTable";
import type { BulletinRecord } from "@/types/bulletin";
import { renderWithLanguage } from "./support/render";

// The table's writes are server actions; none runs in these specs.
vi.mock("@/actions/bulletins", () => ({
  createBulletinAction: vi.fn(),
  updateBulletinAction: vi.fn(),
  setBulletinPublishedAction: vi.fn(),
  setBulletinPinnedAction: vi.fn(),
  deleteBulletinAction: vi.fn(),
  listBulletinsAction: vi.fn(),
}));

/**
 * The "Scheduled" badge and count judge against the `today` the server page
 * passes in, never a day the component works out for itself. A client-computed
 * day lets a server render and its hydration disagree across the shelter's
 * midnight, and under React 19 that discards the server HTML.
 *
 * The clock is frozen in 2026 and the row is dated 2099, so any day the table
 * computed for itself would call it scheduled. Only a component that honours
 * the prop can say it is live.
 */
const ROW: BulletinRecord = {
  id: "bulletin-test-1",
  title: "A notice dated 2099",
  content: "Body",
  titleMs: null,
  contentMs: null,
  category: "announcement",
  targetPage: "all",
  mediaType: "none",
  mediaUrl: null,
  videoEmbedUrl: null,
  isPinned: false,
  isPublished: true,
  authorName: "Shelter Team",
  publishedAt: "2099-01-01",
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};

describe("BulletinDataTable's scheduling day", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T04:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls a notice live when the server's day has reached it", () => {
    renderWithLanguage(<BulletinDataTable initialBulletins={[ROW]} today="2099-01-02" />);
    expect(screen.queryByText("Scheduled")).toBeNull();
    expect(screen.getByText(/1 live · 0 scheduled/)).toBeTruthy();
  });

  it("calls a notice dated the server's day itself live", () => {
    // The boundary: "scheduled" means strictly after today. A `>=` here would
    // badge today's notice while the public feed is already serving it.
    renderWithLanguage(<BulletinDataTable initialBulletins={[ROW]} today="2099-01-01" />);
    expect(screen.queryByText("Scheduled")).toBeNull();
    expect(screen.getByText(/1 live · 0 scheduled/)).toBeTruthy();
  });

  it("badges a notice scheduled when the server's day is before it", () => {
    renderWithLanguage(<BulletinDataTable initialBulletins={[ROW]} today="2098-12-31" />);
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.getByText(/0 live · 1 scheduled/)).toBeTruthy();
  });
});
