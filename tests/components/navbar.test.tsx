import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { Navbar } from "@/components/layout/Navbar";
import { translations, type Language } from "@/lib/i18n/translations";
import { renderWithLanguage, setupUser } from "./support/render";

/**
 * Tier 4: what the site-wide navbar renders.
 *
 * `nav.sponsorWall` replaced two copies of one label: the navbar's inline
 * "Dinding Penaja Awam" / "Public Sponsor Wall", and the footer's English-only
 * fallback. `footer.test.tsx` pins the footer half; this pins the navbar half.
 *
 * Both languages are compared against the dictionary, not against a literal,
 * so editing either side of the key without the other fails here. What a
 * rendered test cannot see is the navbar going back to inline copy that
 * happens to equal the dictionary today — that is the same label from two
 * sources, and only a source-level guard would catch it. The wider version of
 * that problem, other links whose navbar and footer labels already disagree,
 * is `tasks/open/home-page-copy-is-duplicated-outside-the-dictionary.md`.
 */
const getInvolved: Record<Language, RegExp> = { en: /Get Involved/, ms: /Sertai Kami/ };

describe("the navbar's sponsor-wall link", () => {
  for (const language of ["en", "ms"] as const) {
    const other = language === "en" ? "ms" : "en";

    it(`reads nav.sponsorWall in ${language}`, async () => {
      const user = setupUser();
      renderWithLanguage(<Navbar />, { language });

      // Hover, not click: the desktop menu opens on `mouseenter` and its
      // button toggles on click, so a simulated click opens it and closes it
      // again. That is a real defect, not a test quirk —
      // `tasks/open/desktop-nav-menus-close-on-the-click-that-hover-opened.md`.
      await user.hover(screen.getAllByRole("button", { name: getInvolved[language] })[0]);

      // `getAllByRole` throws when nothing matches, so it is the presence check.
      // Containment, because each menu link's name also carries its description.
      const label = translations[language].nav.sponsorWall;
      const links = screen.getAllByRole("link", { name: (name) => name.includes(label) });
      for (const link of links) expect(link).toHaveAttribute("href", "/sponsors");
      expect(screen.queryByText(translations[other].nav.sponsorWall)).not.toBeInTheDocument();
    });
  }
});
