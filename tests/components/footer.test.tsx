import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "@/components/layout/Footer";
import { translations } from "@/lib/i18n/translations";
import { renderWithLanguage } from "./support/render";

/**
 * Tier 4: what the site-wide footer renders.
 *
 * Nothing rendered `Footer` in any tier until sixteen of its `t()` calls had
 * their English fallback argument removed. Those fallbacks were dead — each
 * key exists in both dictionaries, so the fallback could never show — and they
 * had drifted from the dictionary while nobody could see them. Two were not
 * dead: `nav.sponsorWall` and `nav.sponsorPortal` existed in neither
 * dictionary, so their fallback WAS the shipped text, and removing it would
 * have rendered the literal path. That distinction was established by checking
 * each key, not by reading the call. `nav.sponsorWall` has since become a real
 * key — the navbar already shipped Malay for the same link — leaving
 * `nav.sponsorPortal` as the one still tracked in
 * `tasks/open/translation-keys-the-dictionary-does-not-have.md`.
 *
 * The registration line is the reason this file exists: its call changed
 * shape, with the interpolation params moving from the third argument to the
 * second, and it printed a statutory identifier. That line is withdrawn until
 * the shelter's registration is confirmed
 * (`tasks/open/shelter-not-registered-tax-receipts.md`), so the cases below now
 * pin its absence.
 */
describe("Footer", () => {
  it("makes no registration claim in English", () => {
    renderWithLanguage(<Footer />);

    expect(screen.queryByText(/ROS Reg/)).not.toBeInTheDocument();
  });

  it("makes no registration claim in Malay", () => {
    renderWithLanguage(<Footer />, { language: "ms" });

    expect(screen.queryByText(/No\. ROS/)).not.toBeInTheDocument();
  });

  it("renders the link whose key the dictionary lacks as words, not a path", () => {
    // `nav.sponsorPortal` keeps its fallback because it is the only text it
    // has. If the fallback were dropped, `t()` would return the path itself.
    renderWithLanguage(<Footer />);

    expect(screen.getByRole("link", { name: "Sponsor Portal" })).toHaveAttribute(
      "href",
      "/sponsor/dashboard",
    );
    expect(screen.queryByText(/^nav\./)).not.toBeInTheDocument();
  });

  it.each(["en", "ms"] as const)("reads nav.sponsorWall for the sponsor wall link in %s", (language) => {
    // `nav.sponsorWall` was missing from both dictionaries while the navbar
    // carried "Dinding Penaja Awam" inline for the same `/sponsors` link. One
    // key, read by both, so the Malay site no longer shows the same link in two
    // languages on one page. Compared against the dictionary in both languages,
    // as `navbar.test.tsx` does for the other half: a Malay-only literal let an
    // inline English label drift unseen.
    const other = language === "en" ? "ms" : "en";
    renderWithLanguage(<Footer />, { language });
    expect(
      screen.getByRole("link", { name: translations[language].nav.sponsorWall }),
    ).toHaveAttribute("href", "/sponsors");
    expect(screen.queryByText(translations[other].nav.sponsorWall)).not.toBeInTheDocument();
  });

  it("leaves no placeholder unresolved when rendered with no provider at all", () => {
    // `useLanguage` has a fallback for components rendered outside a
    // `LanguageProvider`, and it was a separate, diverged copy of `t`: it never
    // interpolated, so the registration line printed "ROS Reg: {regNo}". Both
    // paths now share one `translate()`, and that line is gone; this keeps the
    // provider-less render honest for whatever interpolates here next.
    // Rendered with plain `render`, deliberately — every other case here goes
    // through the provider, which is why the defect was invisible.
    render(<Footer />);
    expect(screen.queryByText(/\{[A-Za-z]+\}/)).not.toBeInTheDocument();
  });

  it("names the bulletin feature the way the rest of the site does", () => {
    renderWithLanguage(<Footer />);
    expect(screen.getByRole("link", { name: "Shelter Bulletins" })).toHaveAttribute(
      "href",
      "/bulletins",
    );
    expect(screen.queryByText("Updates & News")).not.toBeInTheDocument();
  });

  it("names it in Malay on the Malay site", () => {
    renderWithLanguage(<Footer />, { language: "ms" });
    expect(screen.getByRole("link", { name: "Buletin Pusat Perlindungan" })).toHaveAttribute(
      "href",
      "/bulletins",
    );
    expect(screen.queryByText("Shelter Bulletins")).not.toBeInTheDocument();
  });

  it.each(["en", "ms"] as const)("renders no dictionary path as visible text (%s)", (language) => {
    // The failure mode every removed fallback could have produced: `t()`
    // returning `footer.address` or `nav.donate` to a visitor.
    //
    // Matched per element, not against `container.textContent`. A first version
    // did the latter with a `\b`, and could never fail: textContent glues
    // sibling text together with no separator, so a path arrives as
    // "…Money Goesnav.sponsorWall" and the word boundary is never there. Probed
    // by dropping a live fallback — this case stayed green while the path was
    // on screen.
    renderWithLanguage(<Footer />, { language });
    expect(screen.queryAllByText(/^(footer|nav|common)\.[A-Za-z]+$/)).toHaveLength(0);
  });
});
