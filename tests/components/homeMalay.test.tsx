import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";

import { Hero } from "@/components/layout/Hero";
import {
  HomeGalleryLoading,
  HomeProcessSection,
  HomeViewAllPetsLink,
} from "@/components/layout/HomeSections";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import type { Bulletin, BulletinCategory } from "@/types/bulletin";
import { renderWithLanguage } from "./support/render";

/**
 * Tier 4: the home page's own copy switches language.
 *
 * Every assertion here checks that the **English is absent**, not merely that
 * the Malay is present. `tests/components/home.test.tsx` already asserted
 * presence, and it passed for sixteen days over a hero whose `<h1>` was a
 * hardcoded English literal: a component that renders both strings, or the
 * right string somewhere else on the page, satisfies a presence check.
 * Absence is what discriminates, so it is what is asserted.
 *
 * The strings covered, and the bulletin admin chrome deliberately left in
 * English, are both settled by
 * `tasks/decisions/2026-09-22-home-page-malay-stops-at-the-bulletin-admin-chrome.md`.
 */

const BULLETIN_STORAGE_KEY = "hope_for_strays_bulletins_v1";

/**
 * Drives `useBulletins` through the storage key its initializer reads, rather
 * than mocking the store. That keeps the real read path under test and lets a
 * case state only the bulletin it is about — including none at all, which the
 * four seeded fixtures otherwise make unreachable.
 */
function seedBulletins(bulletins: Bulletin[]): void {
  localStorage.setItem(BULLETIN_STORAGE_KEY, JSON.stringify(bulletins));
}

function bulletin(overrides: Partial<Bulletin> = {}): Bulletin {
  return {
    id: "bulletin-test",
    title: "Test notice",
    content: "Body copy.",
    category: "announcement",
    targetPage: "all",
    mediaType: "none",
    isPinned: false,
    createdAt: "2026-09-01",
    author: "Shelter Team",
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("Hero on the Malay site", () => {
  it("translates the page's h1", () => {
    renderWithLanguage(<Hero />, { language: "ms" });

    expect(
      screen.getByRole("heading", { level: 1, name: /Kewujudan Bersama melalui TNRM/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Coexistence through TNRM & Education")).not.toBeInTheDocument();
  });

  it("translates the hero image's alt text", () => {
    // Read from the alt attribute rather than by text: an image's alt is its
    // accessible name, and `queryByText` cannot see it at all — which is how
    // this string sat untranslated while a Malay test passed beside it.
    renderWithLanguage(<Hero />, { language: "ms" });

    const alts = screen.getAllByRole("img").map((img) => img.getAttribute("alt"));
    expect(alts).toContain("Haiwan reskue menikmati kawasan santuari");
    expect(alts).not.toContain("Rescued shelter animals enjoying sanctuary grounds");
  });
});

describe("Home gallery chrome on the Malay site", () => {
  it("translates the gallery's loading fallback", () => {
    renderWithLanguage(<HomeGalleryLoading />, { language: "ms" });

    expect(screen.getByText("Memuatkan haiwan reskue...")).toBeInTheDocument();
    expect(screen.queryByText("Loading rescue animals...")).not.toBeInTheDocument();
  });

  it("translates the view-all link", () => {
    renderWithLanguage(<HomeViewAllPetsLink />, { language: "ms" });

    expect(
      screen.getByRole("link", { name: /Lihat Semua Haiwan Sedia Diadopsi/i })
    ).toHaveAttribute("href", "/pets");
    expect(screen.queryByText("View All Adoptable Pets")).not.toBeInTheDocument();
    // The wording this replaced, in case someone reintroduces the literal.
    expect(screen.queryByText("View All Animals")).not.toBeInTheDocument();
  });
});

describe("BulletinFeed on the Malay site", () => {
  it("translates the heading it falls back to", () => {
    seedBulletins([bulletin()]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(screen.getByText("Buletin Terkini")).toBeInTheDocument();
    expect(screen.queryByText("Latest Bulletins")).not.toBeInTheDocument();
    // The literal `page.tsx` used to pass in, which bypassed the key entirely.
    expect(screen.queryByText("Latest news and updates")).not.toBeInTheDocument();
  });

  // The prop combinations the real call sites use, not a convenient one:
  // `/bulletins` renders `targetPage="all"` and `/pets` renders
  // `targetPage="pets"` with `compact` and `maxItems`.
  const siblingFeeds = [
    {
      titleKey: "bulletins.allNoticesTitle",
      props: { targetPage: "all" } as const,
      malay: "Semua Buletin",
      english: "All Bulletins",
    },
    {
      titleKey: "bulletins.petsFeedTitle",
      props: { targetPage: "pets", compact: true, maxItems: 2 } as const,
      malay: "Buletin Adopsi & Klinik",
      english: "Adoption & Clinic Bulletins",
    },
  ] as const;

  it.each(siblingFeeds)(
    "translates the $titleKey heading a sibling page asks for",
    ({ titleKey, props, malay, english }) => {
      // `/bulletins` and `/pets` used to pass their headings as English string
      // literals. Once the chrome around them became Malay, that left those two
      // pages with a Malay feed under an English title — a worse mixed-language
      // result than before. They pass a key now, and this is what pins it.
      seedBulletins([bulletin()]);
      renderWithLanguage(<BulletinFeed {...props} titleKey={titleKey} />, {
        language: "ms",
      });

      expect(screen.getByText(malay)).toBeInTheDocument();
      expect(screen.queryByText(english)).not.toBeInTheDocument();
    },
  );

  it.each(siblingFeeds)(
    "keeps the $titleKey heading English on the English site",
    ({ titleKey, props, malay, english }) => {
      // Without this, a key that resolved in `ms` but not in `en` would pass
      // every assertion above. The case this replaced covered the English side
      // for a caller-supplied heading; that coverage is kept here rather than
      // dropped along with the string prop.
      seedBulletins([bulletin()]);
      renderWithLanguage(<BulletinFeed {...props} titleKey={titleKey} />);

      expect(screen.getByText(english)).toBeInTheDocument();
      expect(screen.queryByText(malay)).not.toBeInTheDocument();
    },
  );

  it.each<[BulletinCategory, string, string]>([
    ["urgent_need", "Asuhan Segera / Keperluan", "Urgent Foster / Need"],
    ["clinic", "Klinik / Vaksin", "Clinic / Vaccine"],
    ["event", "Program", "Event"],
    ["happy_tail", "Perkembangan Adopsi", "Adoption Update"],
    ["announcement", "Notis", "Notice"],
  ])("translates the %s category chip", (category, malay, english) => {
    seedBulletins([bulletin({ category })]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(screen.getByText(malay)).toBeInTheDocument();
    expect(screen.queryByText(english)).not.toBeInTheDocument();
  });

  it("translates the pinned chip", () => {
    seedBulletins([bulletin({ isPinned: true })]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(screen.getByText("Disemat")).toBeInTheDocument();
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("translates the byline", () => {
    seedBulletins([bulletin()]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(screen.getByText(/Dihantar oleh:/)).toBeInTheDocument();
    expect(screen.queryByText(/Posted by:/)).not.toBeInTheDocument();
  });

  it("translates the staff toggle every visitor is shown", () => {
    seedBulletins([bulletin()]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(
      screen.getByRole("button", { name: /Akses Pentadbir Kakitangan/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Staff Admin Access")).not.toBeInTheDocument();
  });

  it("translates the empty state", () => {
    seedBulletins([]);
    renderWithLanguage(<BulletinFeed targetPage="home" />, { language: "ms" });

    expect(
      screen.getByText("Tiada kemas kini atau buletin disiarkan untuk bahagian ini.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No updates or bulletins posted for this section.")
    ).not.toBeInTheDocument();
  });
});

describe("HomeProcessSection, the remounted #how-it-works anchor", () => {
  // Nothing rendered this component at all before 2026-09-22: `1137d3e`
  // unmounted it and the only test touching it since is the structural anchor
  // guard, which asserts the string `<HomeProcessSection />` appears in
  // `page.tsx` and never renders anything. Remounting it made its copy visible
  // again, and reading that copy from the dictionary is the change that needs
  // covering — a future edit reintroducing an inline literal would otherwise
  // pass CI.
  it("renders the three steps from the dictionary in English", () => {
    renderWithLanguage(<HomeProcessSection />);

    expect(
      screen.getByRole("heading", { name: "Our Transparent Adoption Journey" })
    ).toBeInTheDocument();
    expect(screen.getByText("Adoption Protocol")).toBeInTheDocument();
    expect(screen.getByText("Browse & Submit Application")).toBeInTheDocument();
    expect(screen.getByText("Meet & Socialize")).toBeInTheDocument();
    expect(screen.getByText("Finalize & Welcome Home")).toBeInTheDocument();
    // The wording the inline ternary had drifted to, which the dictionary does
    // not use. Its presence would mean the literals came back.
    expect(screen.queryByText(/zero adoption fees/)).not.toBeInTheDocument();
  });

  it("renders the three steps in Malay, with no English left behind", () => {
    renderWithLanguage(<HomeProcessSection />, { language: "ms" });

    expect(
      screen.getByRole("heading", { name: "Proses Adopsi Telus & Mudah" })
    ).toBeInTheDocument();
    expect(screen.getByText("Protokol Adopsi Santuari")).toBeInTheDocument();
    expect(screen.getByText("Semak & Hantar Permohonan")).toBeInTheDocument();
    expect(screen.getByText("Sesi Suai Kenal & Interaksi")).toBeInTheDocument();
    expect(screen.getByText("Tandatangan Perjanjian & Bawa Pulang")).toBeInTheDocument();

    expect(screen.queryByText("Our Transparent Adoption Journey")).not.toBeInTheDocument();
    expect(screen.queryByText("Adoption Protocol")).not.toBeInTheDocument();
    expect(screen.queryByText("Browse & Submit Application")).not.toBeInTheDocument();
    expect(screen.queryByText("Meet & Socialize")).not.toBeInTheDocument();
    expect(screen.queryByText("Finalize & Welcome Home")).not.toBeInTheDocument();
    // The pre-2026-09-22 inline Malay, which disagreed with the dictionary.
    expect(screen.queryByText("Pilih Haiwan & Hantar Permohonan")).not.toBeInTheDocument();
  });

  it("declares the id three links in the nav and footer point at", () => {
    const { container } = renderWithLanguage(<HomeProcessSection />);
    expect(container.querySelector("section#how-it-works")).not.toBeNull();
  });
});

describe("the home page's English is unchanged", () => {
  // The Malay assertions above would all pass if `isMs` were inverted, so the
  // English side is pinned too.
  it("keeps the English copy on the English site", () => {
    seedBulletins([bulletin({ category: "clinic", isPinned: true })]);
    renderWithLanguage(<BulletinFeed targetPage="home" />);

    expect(screen.getByText("Latest Bulletins")).toBeInTheDocument();
    expect(screen.getByText("Clinic / Vaccine")).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.queryByText("Disemat")).not.toBeInTheDocument();
  });

  it("keeps the English hero heading on the English site", () => {
    renderWithLanguage(<Hero />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Coexistence through TNRM & Education" })
    ).toBeInTheDocument();
  });
});
