import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { Hero } from "@/components/layout/Hero";
import {
  HomeGalleryLoading,
  HomeOurWorkSection,
  HomeProcessSection,
} from "@/components/layout/HomeSections";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import { PetGallery } from "@/components/features/pets/PetGallery";
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
 * Which strings are covered is settled by
 * `tasks/decisions/2026-09-22-home-page-malay-stops-at-the-bulletin-admin-chrome.md`.
 */

/**
 * One notice, as `getPublicBulletins` hands it to the feed. The feed is a
 * Server Component that takes its notices as a prop, so a case states only the
 * bulletin it is about — including none at all.
 */
function bulletin(overrides: Partial<Bulletin> = {}): Bulletin {
  return {
    id: "bulletin-test",
    title: "Test notice",
    content: "Body copy.",
    category: "announcement",
    targetPage: "all",
    mediaType: "none",
    isPinned: false,
    publishedAt: "2026-09-01",
    authorName: "Shelter Team",
    ...overrides,
  };
}

describe("Hero on the Malay site", () => {
  it("translates the page's h1", () => {
    renderWithLanguage(<Hero />, { language: "ms" });

    expect(
      screen.getByRole("heading", { level: 1, name: /Kewujudan Bersama melalui TNRM/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Coexistence through TNRM & Education")).not.toBeInTheDocument();
  });
});

describe("Home gallery chrome on the Malay site", () => {
  it("translates the gallery's loading fallback", () => {
    renderWithLanguage(<HomeGalleryLoading />, { language: "ms" });

    expect(screen.getByText("Memuatkan haiwan reskue...")).toBeInTheDocument();
    expect(screen.queryByText("Loading rescue animals...")).not.toBeInTheDocument();
  });

  it("translates the view-all link", () => {
    // The link sits in the featured gallery's own header, beside its heading.
    renderWithLanguage(
      <PetGallery initialPets={[]} featuredOnly showFilters={false} syncUrl={false} />,
      { language: "ms" }
    );

    expect(
      screen.getByRole("link", { name: /Lihat Semua Haiwan Sedia Diadopsi/i })
    ).toHaveAttribute("href", "/pets");
    expect(screen.queryByText("View All Adoptable Pets")).not.toBeInTheDocument();
    // The wording this replaced, in case someone reintroduces the literal.
    expect(screen.queryByText("View All Animals")).not.toBeInTheDocument();
  });
});

describe("BulletinFeed on the Malay site", () => {
  it("translates the home page's feed heading", () => {
    renderWithLanguage(<BulletinFeed bulletins={[bulletin()]} titleKey="home.bulletinsTitle" />, { language: "ms" });

    expect(screen.getByText("Kemas Kini Terkini")).toBeInTheDocument();
    expect(screen.queryByText("Latest Updates")).not.toBeInTheDocument();
    // The literal `page.tsx` used to pass in, which bypassed the key entirely.
    expect(screen.queryByText("Latest news and updates")).not.toBeInTheDocument();
  });

  // The prop combination the real call site uses, not a convenient one:
  // `/bulletins` renders the plain feed. (`/pets` rendered it `compact` until
  // the animals page dropped its notices; pets-targeted ones list on `/bulletins`.)
  const siblingFeeds = [
    {
      titleKey: "bulletins.allNoticesTitle",
      props: {} as const,
      malay: "Semua Buletin",
      english: "All Bulletins",
    },
  ] as const;

  it.each(siblingFeeds)(
    "translates the $titleKey heading a sibling page asks for",
    ({ titleKey, props, malay, english }) => {
      // `/bulletins` and `/pets` used to pass their headings as English string
      // literals. Once the chrome around them became Malay, that left those two
      // pages with a Malay feed under an English title — a worse mixed-language
      // result than before. They pass a key now, and this is what pins it.
      renderWithLanguage(<BulletinFeed {...props} bulletins={[bulletin()]} titleKey={titleKey} />, {
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
      renderWithLanguage(<BulletinFeed {...props} bulletins={[bulletin()]} titleKey={titleKey} />);

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
    renderWithLanguage(<BulletinFeed bulletins={[bulletin({ category })]} titleKey="home.bulletinsTitle" />, { language: "ms" });

    expect(screen.getByText(malay)).toBeInTheDocument();
    expect(screen.queryByText(english)).not.toBeInTheDocument();
  });

  it("translates the pinned chip", () => {
    renderWithLanguage(<BulletinFeed bulletins={[bulletin({ isPinned: true })]} titleKey="home.bulletinsTitle" />, { language: "ms" });

    expect(screen.getByText("Disemat")).toBeInTheDocument();
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("translates the byline", () => {
    renderWithLanguage(<BulletinFeed bulletins={[bulletin()]} titleKey="home.bulletinsTitle" />, { language: "ms" });

    expect(screen.getByText(/Dihantar oleh:/)).toBeInTheDocument();
    expect(screen.queryByText(/Posted by:/)).not.toBeInTheDocument();
  });

  it.each(["en", "ms"] as const)("shows a visitor no staff control at all in %s", (language) => {
    // This case used to check that the "Staff Admin Access" toggle every
    // visitor was shown read in Malay. #103 removed the toggle: editing moved
    // behind `MANAGE_CONTENT` at `/admin/bulletins`, and the feed is read-only
    // by design. Translating it again would bring it back, so what is pinned
    // now is its absence, in both languages.
    // One notice of each media type, because each renders its own branch of
    // markup: a control added only beside the video iframe or the image would
    // be invisible to a text-only notice. A review showed exactly that.
    const notices = [
      bulletin({ id: "text", isPinned: true }),
      bulletin({
        id: "video",
        mediaType: "video",
        videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      }),
      bulletin({
        id: "image",
        mediaType: "image",
        mediaUrl: "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def",
      }),
    ];
    renderWithLanguage(<BulletinFeed bulletins={notices} titleKey="home.bulletinsTitle" />, {
      language,
    });
    // Each media branch must actually render, or a control inside it is never
    // looked at: every notice renders an article, so the count alone proves
    // nothing about the iframe or the image.
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(document.querySelector("iframe")).not.toBeNull();
    expect(document.querySelector("img")).not.toBeNull();

    // No links either: a staff control does not have to be a button, and a
    // review showed an "Edit notices" link passed this case when it checked
    // buttons only. The feed renders no link of any kind today, so any link is
    // new and worth a look.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/Staff Admin Access|Akses Pentadbir Kakitangan/)).not.toBeInTheDocument();
  });

  it("translates the empty state", () => {
    renderWithLanguage(<BulletinFeed bulletins={[]} titleKey="home.bulletinsTitle" />, { language: "ms" });

    expect(screen.getByText("Tiada kemas kini untuk dipaparkan buat masa ini.")).toBeInTheDocument();
    expect(screen.queryByText("No updates to show right now.")).not.toBeInTheDocument();
    // The wording #103 replaced: false during an outage, when the repository
    // serves no notices rather than stale ones.
    expect(screen.queryByText(/No updates or bulletins posted/)).not.toBeInTheDocument();
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
      screen.getByRole("heading", { name: "How to Adopt" })
    ).toBeInTheDocument();
    expect(screen.getByText("Browse & Submit Application")).toBeInTheDocument();
    expect(screen.getByText("Meet & Socialize")).toBeInTheDocument();
    expect(screen.getByText("Finalize & Welcome Home")).toBeInTheDocument();
    // Step 3 states the fee policy in the organisation's own qualified words.
    //
    // Two wrong versions came first. The dictionary said "no hidden fees",
    // which implies visible ones — and this test once pinned that by asserting
    // the alternative was absent. The fix then said "zero adoption fees", which
    // over-promises: fees are admin-configurable (`adoptionFeeDog`,
    // `adoptionFeeCat`, per-pet `adoptionFee`), and a pet page shows any value
    // that is not "Free". The site's careful copy — this section's own subtitle
    // and the standards section below — says "commercial adoption fees", and
    // that qualifier is what leaves room for a cost-recovery fee.
    expect(screen.getByText(/no commercial adoption fees/)).toBeInTheDocument();
    expect(screen.queryByText(/no hidden fees/)).not.toBeInTheDocument();
    expect(screen.queryByText(/zero adoption fees/)).not.toBeInTheDocument();
  });

  it("renders the three steps in Malay, with no English left behind", () => {
    renderWithLanguage(<HomeProcessSection />, { language: "ms" });

    expect(
      screen.getByRole("heading", { name: "Cara Adopsi" })
    ).toBeInTheDocument();
    expect(screen.getByText("Semak & Hantar Permohonan")).toBeInTheDocument();
    expect(screen.getByText("Sesi Suai Kenal & Interaksi")).toBeInTheDocument();
    expect(screen.getByText("Tandatangan Perjanjian & Bawa Pulang")).toBeInTheDocument();
    // The same pin in Malay, using the standards section's own phrase:
    // "yuran adopsi komersial" (commercial adoption fee), not
    // "yuran tersembunyi" (hidden fee).
    expect(screen.getByText(/tanpa sebarang yuran adopsi komersial/)).toBeInTheDocument();
    expect(screen.queryByText(/yuran tersembunyi/)).not.toBeInTheDocument();

    expect(screen.queryByText("How to Adopt")).not.toBeInTheDocument();
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

describe("HomeOurWorkSection pillar links", () => {
  /**
   * The "Learn More" under a pillar, found from the pillar's own heading.
   *
   * Not by position: choosing the link by array index is exactly how the TNRM
   * card came to point at the adoption steps, and a test that indexed the
   * links would pass straight through the same mistake.
   */
  function learnMoreFor(title: string): string | null {
    let el: HTMLElement | null = screen.getByRole("heading", { name: title });
    while (el && !el.querySelector("a")) el = el.parentElement;
    return el?.querySelector("a")?.getAttribute("href") ?? null;
  }

  it("sends each pillar's Learn More to the page about that pillar", () => {
    renderWithLanguage(<HomeOurWorkSection />);

    // TNRM is trap-neuter-return-manage, not adoption. It pointed at
    // `/#how-it-works` — the adoption steps — until that anchor was restored
    // and the mismatch became visible. `/faq` is the page that explains TNRM.
    expect(learnMoreFor("TNRM (Trap-Neuter-Return-Manage)")).toBe("/faq");
    expect(learnMoreFor("Education & Coexistence")).toBe("/get-involved");
    expect(learnMoreFor("Sanctuary & Rehabilitation")).toBe("/needs");
  });
});

describe("the home page's English is unchanged", () => {
  // The Malay assertions above would all pass if `isMs` were inverted, so the
  // English side is pinned too.
  it("keeps the English copy on the English site", () => {
    renderWithLanguage(<BulletinFeed bulletins={[bulletin({ category: "clinic", isPinned: true })]} titleKey="home.bulletinsTitle" />);

    expect(screen.getByText("Latest Updates")).toBeInTheDocument();
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
