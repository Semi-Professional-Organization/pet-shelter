import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { Footer } from "@/components/layout/Footer";
import { PUBLIC_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import { renderWithLanguage } from "./support/render";

/**
 * Tier 4: what the site-wide footer renders.
 *
 * Nothing rendered `Footer` in any tier until sixteen of its `t()` calls had
 * their English fallback argument removed. Those fallbacks were dead — each
 * key exists in both dictionaries, so the fallback could never show — and they
 * had drifted from the dictionary while nobody could see them. Two were not
 * dead: `nav.sponsorWall` and `nav.sponsorPortal` exist in neither dictionary,
 * so their fallback IS the shipped text, and removing it would render the
 * literal path. That distinction was established by checking each key, not by
 * reading the call — see
 * `tasks/open/translation-keys-the-dictionary-does-not-have.md`.
 *
 * The registration line is the reason this file exists: its call changed
 * shape, with the interpolation params moving from the third argument to the
 * second, and it prints a statutory identifier.
 */
describe("Footer", () => {
  it("prints the public ROS registration number in English", () => {
    renderWithLanguage(<Footer />);

    expect(screen.getByText(`ROS Reg: ${PUBLIC_ROS_REGISTRATION_NO}`)).toBeInTheDocument();
    // An unresolved placeholder would mean the params never reached `t()`.
    expect(screen.queryByText(/\{regNo\}/)).not.toBeInTheDocument();
  });

  it("prints the public ROS registration number in Malay", () => {
    renderWithLanguage(<Footer />, { language: "ms" });

    expect(screen.getByText(`No. ROS: ${PUBLIC_ROS_REGISTRATION_NO}`)).toBeInTheDocument();
    expect(screen.queryByText(/\{regNo\}/)).not.toBeInTheDocument();
  });

  it("renders the two links whose keys the dictionary lacks as words, not paths", () => {
    // These keep their fallback because it is the only text they have. If the
    // fallback were dropped, `t()` would return the path itself.
    renderWithLanguage(<Footer />);

    expect(screen.getByRole("link", { name: "Public Sponsor Wall" })).toHaveAttribute(
      "href",
      "/sponsors",
    );
    expect(screen.getByRole("link", { name: "Sponsor Portal" })).toHaveAttribute(
      "href",
      "/sponsor/dashboard",
    );
    expect(screen.queryByText(/^nav\./)).not.toBeInTheDocument();
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
