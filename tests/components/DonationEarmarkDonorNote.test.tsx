import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({
  submitDonationPledgeAction: vi.fn(),
  listPendingDonationPledgesAction: vi.fn(),
  reconcileDonationPledgeAction: vi.fn(),
  rejectDonationPledgeAction: vi.fn(),
}));
vi.mock("@/actions/pets", () => ({ getPublicPets: vi.fn().mockResolvedValue([]) }));

import {
  listPendingDonationPledgesAction,
  submitDonationPledgeAction,
} from "@/actions/donations";
import { getPublicPets } from "@/actions/pets";
import { DonationWidget } from "@/components/features/donations/DonationWidget";
import { DonationPledgeReconciliation } from "@/components/admin/DonationPledgeReconciliation";
import { setMockLocation } from "../setup/nextMocks";
import { makePet, renderWithLanguage, setupUser } from "./support/render";

/**
 * A donation earmark is the donor's own note, not a verified animal (owner's decision,
 * tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md; #205).
 *
 * `/donate?pet=Tuah` seeds the earmark from the query string and the server stores it
 * unchecked, so a gift can name an animal the shelter does not hold. That is allowed:
 * what is not allowed is any surface presenting it as a confirmed animal. Until this
 * change the donor's confirmation said "Dedicated Pet: Tuah" and the coordinator's queue
 * said "in honour of Tuah".
 */

const mockedSubmit = vi.mocked(submitDonationPledgeAction);

async function fillAndSubmit(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
  await user.type(screen.getByLabelText(/email address/i), "aisyah@example.com");
  await user.click(screen.getByRole("button", { name: /complete donation pledge/i }));
}

const carousel = () => screen.getByRole("region", { name: /pet selection carousel/i });

/** A promise the test settles, standing in for a catalogue that arrives late. */
function lateCatalogue() {
  let resolve!: (pets: ReturnType<typeof makePet>[]) => void;
  const promise = new Promise<ReturnType<typeof makePet>[]>((fulfil) => {
    resolve = fulfil;
  });
  vi.mocked(getPublicPets).mockReturnValueOnce(promise);
  return { arrive: (pets: ReturnType<typeof makePet>[]) => act(async () => resolve(pets)) };
}

/** The queue's bordered block holding a gift's dedication, label and quoted text. */
async function dedicationBlock() {
  const label = await screen.findByText("Donor's note (dedication):");
  const block = label.parentElement!;
  expect(block).toHaveClass("border");
  return block;
}

/** The deepest element whose text contains `needle`, for text split across nodes. */
function deepestContaining(needle: string) {
  return screen.getByText((_content, element) => {
    const text = element?.textContent ?? "";
    return (
      text.includes(needle) &&
      !Array.from(element?.children ?? []).some((child) => child.textContent?.includes(needle))
    );
  });
}
const mockedListPending = vi.mocked(listPendingDonationPledgesAction);

// The catalogue the widget is handed holds no Tuah.
const catalogue = [makePet({ id: "pet-001", name: "Bella" }), makePet({ id: "pet-002", name: "Tiger" })];

beforeEach(() => {
  vi.clearAllMocks();
  setMockLocation("/donate", "");
});

/**
 * `/donate` mounts the widget with no `initialPets` (DonatePageView), so the catalogue
 * arrives after the first render. These cases run that path, with the catalogue held back
 * until the test lets it arrive.
 */
describe("the dedication when the catalogue loads late, as in production", () => {
  it("never shows a real animal as an unmatched dedication, before or after it loads", async () => {
    const catalogueLoad = lateCatalogue();
    setMockLocation("/donate", "pet=Bella");
    renderWithLanguage(<DonationWidget />);

    expect(screen.queryByText(/your dedication/i)).toBeNull();
    await catalogueLoad.arrive(catalogue);

    expect(within(carousel()).getByRole("button", { name: /bella/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText(/your dedication/i)).toBeNull();
  });

  it("shows an unmatched name only once the catalogue has loaded", async () => {
    const catalogueLoad = lateCatalogue();
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget />);

    expect(screen.queryByText(/your dedication/i)).toBeNull();
    await catalogueLoad.arrive(catalogue);

    expect(deepestContaining("Your dedication")).toHaveTextContent(/^🐾 Your dedication: “Tuah”$/);
  });

  it("sends no note the form has not shown yet, if submitted while the catalogue loads", async () => {
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    lateCatalogue();
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget />);

    await fillAndSubmit(setupUser());

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0].targetPetName).toBeUndefined();
  });

  it("does not re-seed the name when the donor chose the general fund before it loaded", async () => {
    // The strip itself only appears once the catalogue has settled, so the choice a donor
    // can make while it loads is the general-fund card. A late catalogue holding the
    // `?pet=` animal must not override it.
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    const catalogueLoad = lateCatalogue();
    setMockLocation("/donate", "pet=Bella");
    renderWithLanguage(<DonationWidget />);

    const user = setupUser();
    await user.click(within(carousel()).getByRole("button", { name: /general sanctuary fund/i }));
    await catalogueLoad.arrive(catalogue);

    expect(within(carousel()).getByRole("button", { name: /bella/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await fillAndSubmit(user);
    expect(mockedSubmit.mock.calls[0][0].targetPetName).toBeUndefined();
  });
});

describe("/donate?pet=Tuah when the catalogue holds no Tuah", () => {
  it("sends Tuah as the donor's text and confirms it as their dedication, not a pet", async () => {
    mockedSubmit.mockResolvedValue({
      success: true,
      data: {
        pledgeRef: "HFS-GFT-20261111-000001",
        donorName: "Aisyah Rahman",
        donorEmail: "aisyah@example.com",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 50,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        targetPetName: "Tuah",
        status: "PENDING_PAYMENT",
        reconciliationNotice: "Our coordinator will match your transfer.",
      },
    });

    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    // Before submitting: the chooser cannot show a name it does not hold, so the
    // dedication the pledge will carry is stated beside it.
    expect(deepestContaining("Your dedication")).toHaveTextContent(/^🐾 Your dedication: “Tuah”$/);
    expect(screen.getByRole("button", { name: /remove your dedication/i })).toBeInTheDocument();

    const user = setupUser();
    await fillAndSubmit(user);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ targetPetName: "Tuah" });

    await screen.findByText("HFS-GFT-20261111-000001");
    expect(deepestContaining("Tuah")).toHaveTextContent(/^🐾 Your dedication: Tuah$/);
    // Stated with what the donor told us, not under the allocation heading.
    expect(screen.getByText("Allocation").parentElement).not.toHaveTextContent("Tuah");
    expect(document.body).not.toHaveTextContent(/Dedicated (Pet|Animal)/i);
  });

  it("lets the donor remove the dedication before submitting, sending none", async () => {
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    const user = setupUser();
    await user.click(screen.getByRole("button", { name: /remove your dedication/i }));
    expect(screen.queryByText(/your dedication:/i)).toBeNull();
    // The button that had focus is gone: focus lands on the general fund the gift now goes
    // to, and the removal is announced.
    expect(
      within(carousel()).getByRole("button", { name: /general sanctuary fund/i })
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Dedication removed.");

    await fillAndSubmit(user);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0].targetPetName).toBeUndefined();
  });

  it("trims a ?pet= name, caps it at the schema's 100 characters and quotes it", () => {
    setMockLocation("/donate", `pet=${encodeURIComponent(`  ${"A".repeat(150)}  `)}`);
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    expect(deepestContaining("Your dedication")).toHaveTextContent(
      new RegExp(`^🐾 Your dedication: “A{100}”$`)
    );
  });

  it("matches ?pet=Bella%20 to Bella rather than showing it as a note", () => {
    setMockLocation("/donate", "pet=Bella%20&freq=monthly");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    expect(within(carousel()).getByRole("button", { name: /bella/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText(/your dedication/i)).toBeNull();
  });

  it("keeps the note when the donor clicks the general fund that is already chosen", async () => {
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    const user = setupUser();
    await user.click(within(carousel()).getByRole("button", { name: /general sanctuary fund/i }));
    expect(deepestContaining("Your dedication")).toHaveTextContent("“Tuah”");

    await fillAndSubmit(user);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ targetPetName: "Tuah" });
  });

  it("clears the removal announcement once the donor picks an animal", async () => {
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    const user = setupUser();
    await user.click(screen.getByRole("button", { name: /remove your dedication/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Dedication removed.");
    await user.click(within(carousel()).getByRole("button", { name: /bella/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/^$/);
  });

  it("states the strip, its button and the announcement in Malay", async () => {
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />, { language: "ms" });

    expect(deepestContaining("Dedikasi Anda")).toHaveTextContent(/^🐾 Dedikasi Anda: “Tuah”$/);
    const remove = screen.getByRole("button", { name: "Buang dedikasi anda" });
    expect(remove).toHaveTextContent("Buang");

    await setupUser().click(remove);
    expect(screen.getByRole("status")).toHaveTextContent("Dedikasi dibuang.");
  });

  it("shows nothing for a whitespace-only ?pet= name", () => {
    setMockLocation("/donate", "pet=%20%20%20");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    expect(screen.queryByText(/your dedication/i)).toBeNull();
  });

  it("shows no separate dedication line when the name is an animal in the chooser", () => {
    setMockLocation("/donate", "pet=Bella");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    expect(screen.queryByText(/your dedication/i)).toBeNull();
  });

  it("shows the coordinator Tuah under the donor's-note label, never 'in honour of'", async () => {
    mockedListPending.mockResolvedValue({
      success: true,
      hasMore: false,
      data: [
        {
          pledgeRef: "HFS-GFT-20261111-000001",
          donorName: "Aisyah Rahman",
          donorEmail: "aisyah@example.com",
          tierName: "Core Vaccination & Deworming",
          amountDisplay: "RM 50.00",
          frequency: "one_time",
          paymentMethod: "duitnow_qr",
          targetPetName: "Tuah",
          createdAt: "2026-11-11T02:00:00.000Z",
        },
      ],
    });

    renderWithLanguage(<DonationPledgeReconciliation />);

    const block = await dedicationBlock();
    expect(within(block).getByText("“Tuah”")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/in honour of/i);
  });

  it("keeps a dedication containing ' · ' off the queue's own field line, in quotes", async () => {
    const forged = "Tuah · Monthly · Credit / Debit Card · pledged 1 Jan 2020";
    mockedListPending.mockResolvedValue({
      success: true,
      hasMore: false,
      data: [
        {
          pledgeRef: "HFS-GFT-20261111-000002",
          donorName: "Aisyah Rahman",
          donorEmail: "aisyah@example.com",
          tierName: "Core Vaccination & Deworming",
          amountDisplay: "RM 50.00",
          frequency: "one_time",
          paymentMethod: "duitnow_qr",
          targetPetName: forged,
          createdAt: "2026-11-11T02:00:00.000Z",
        },
      ],
    });

    renderWithLanguage(<DonationPledgeReconciliation />);

    const block = await dedicationBlock();
    // The note's whole text sits inside the quotes, in its own bordered block.
    expect(within(block).getByText(`“${forged}”`)).toBeInTheDocument();
    // The line the queue states itself begins with the tier and names none of the note.
    const fields = screen.getByText(/^Core Vaccination & Deworming · One-time ·/);
    expect(fields).not.toHaveTextContent(/Tuah|Monthly|Credit/);
  });
});
