import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

/**
 * The controller calls this Server Action directly. Importing the real module
 * pulls `@/lib/server/prisma` — and through it `pg` — into jsdom, which is both
 * slow and meaningless here: Tier 4 is about what the form does with the
 * action's *answer*, and Tier 3 already owns whether the action is correct.
 *
 * Hoisted above the component import by Vitest, so the controller receives the
 * double rather than the real function.
 */
const submitApplication = vi.hoisted(() => vi.fn());
vi.mock("@/actions/applications", () => ({ submitApplication }));

import { AdoptionForm } from "@/components/features/adoptions/AdoptionForm";
import { AdoptionWizard } from "@/components/features/adoptions/AdoptionWizard";
import { adoptionFormSchema } from "@/hooks/useAdoptionFormController";
import { renderWithLanguage, setupUser, makePet } from "./support/render";

const VALID = {
  name: "Nurul Huda binti Ahmad",
  email: "nurul@example.com",
  phone: "012-345 6789",
  identification: "880101-14-5678",
  address: "No. 24, Jalan SS 2/10, 47300 Petaling Jaya, Selangor",
  vetClinic: "Klinik Haiwan SS2, Petaling Jaya",
};

type User = ReturnType<typeof setupUser>;

function renderForm(overrides: Partial<Parameters<typeof AdoptionForm>[0]> = {}) {
  const pet = makePet({ name: "Bella", breed: "Labrador Mix" });
  const onOpenChange = vi.fn();
  const result = renderWithLanguage(
    <AdoptionForm
      selectedPet={pet}
      allPets={[pet]}
      open
      onOpenChange={onOpenChange}
      {...overrides}
    />
  );
  return { ...result, pet, onOpenChange, user: setupUser() };
}

const nextButton = () => screen.getByRole("button", { name: /next/i });
const backButton = () => screen.getByRole("button", { name: /^back$/i });
const submitButton = () => screen.getByRole("button", { name: /submit/i });

/**
 * The form is a four-step wizard (`ADOPTION_STEPS`), and only the current
 * step's fields are mounted. Each helper below fills the step it names with
 * input the schema accepts and presses Next.
 *
 * Next is `type="button"` and advances only when `trigger()` passes for that
 * step's own fields, so awaiting the *next* step's first control is both the
 * wait and the assertion that the step just filled was accepted — a helper that
 * silently failed to advance fails here rather than three lines into the test.
 */
async function completeContactStep(user: User) {
  await user.type(screen.getByLabelText(/full name/i), VALID.name);
  await user.type(screen.getByLabelText(/email address/i), VALID.email);
  await user.type(screen.getByLabelText(/contact phone number/i), VALID.phone);
  await user.type(screen.getByLabelText(/nric or passport number/i), VALID.identification);
  await user.type(screen.getByLabelText(/residential address/i), VALID.address);

  await user.click(nextButton());
  await screen.findByLabelText(/housing & accommodation type/i);
}

/** Fills the contact step with no animal chosen; Next must stop on the pet field. */
async function completeContactStepExpectingRefusal(user: User) {
  await user.type(screen.getByLabelText(/full name/i), VALID.name);
  await user.type(screen.getByLabelText(/email address/i), VALID.email);
  await user.type(screen.getByLabelText(/contact phone number/i), VALID.phone);
  await user.type(screen.getByLabelText(/nric or passport number/i), VALID.identification);
  await user.type(screen.getByLabelText(/residential address/i), VALID.address);

  await user.click(nextButton());
  expect(await screen.findByText(/please select an adoptable pet/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/housing & accommodation type/i)).not.toBeInTheDocument();
}

/** Every control on this step has a schema-valid default; `housingType` is the one tests vary. */
async function completeLivingStep(user: User, housingType?: string) {
  if (housingType) {
    await user.selectOptions(screen.getByLabelText(/housing & accommodation type/i), housingType);
  }

  await user.click(nextButton());
  await screen.findByLabelText(/preferred veterinary clinic/i);
}

async function completeCareStep(user: User) {
  await user.type(screen.getByLabelText(/preferred veterinary clinic/i), VALID.vetClinic);

  await user.click(nextButton());
  await screen.findByLabelText(/shelter adoption terms/i);
}

/** Leaves the wizard on step 4, every earlier step valid and both consents unticked. */
async function advanceToAgreementStep(user: User, housingType?: string) {
  await completeContactStep(user);
  await completeLivingStep(user, housingType);
  await completeCareStep(user);
}

/** Both consents default to unchecked, so submission stays gated until this runs. */
async function acceptConsents(user: User) {
  await user.click(screen.getByLabelText(/shelter adoption terms/i));
  await user.click(screen.getByLabelText(/home check/i));
}

async function submitCompletedApplication(user: User, housingType?: string) {
  await advanceToAgreementStep(user, housingType);
  await acceptConsents(user);
  await user.click(submitButton());
}

beforeEach(() => {
  submitApplication.mockReset();
  submitApplication.mockResolvedValue({ success: true, data: { id: "app-1" } });
});

describe("AdoptionForm", () => {
  it("opens as a dialog naming the selected pet", () => {
    renderForm();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/adoption application for bella/i)).toBeInTheDocument();
  });

  it("preselects the designated pet in the animal chooser", () => {
    const { pet } = renderForm();

    expect(screen.getByLabelText(/selected rescue animal/i)).toHaveValue(pet.id);
  });

  describe("wizard navigation", () => {
    it("keeps a later step's fields out of the DOM until that step is reached", async () => {
      const { user } = renderForm();

      // Guards the step partition itself. Were every field mounted at once and
      // merely hidden, the per-step validation asserted below would be proving
      // nothing, and a later step's control could be queried — and reported as
      // present — while the applicant never saw it.
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/housing & accommodation type/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/preferred veterinary clinic/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/shelter adoption terms/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();

      await completeContactStep(user);

      expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/housing & accommodation type/i)).toBeInTheDocument();
    });

    it("returns to the previous step with the entered values intact", async () => {
      const { user } = renderForm();
      await completeContactStep(user);

      await user.selectOptions(
        screen.getByLabelText(/housing & accommodation type/i),
        "condo_apartment"
      );
      await user.click(backButton());

      // Unmounting a step must not reset it: an applicant stepping back to fix
      // one typo would otherwise find the whole step blank.
      expect(await screen.findByLabelText(/full name/i)).toHaveValue(VALID.name);
      expect(screen.getByLabelText(/email address/i)).toHaveValue(VALID.email);
      expect(screen.getByLabelText(/contact phone number/i)).toHaveValue(VALID.phone);
      expect(screen.getByLabelText(/nric or passport number/i)).toHaveValue(VALID.identification);
      expect(screen.getByLabelText(/residential address/i)).toHaveValue(VALID.address);

      await user.click(nextButton());

      expect(await screen.findByLabelText(/housing & accommodation type/i)).toHaveValue(
        "condo_apartment"
      );
    });
  });

  describe("validation", () => {
    it("reports every empty required field rather than only the first", async () => {
      const { user } = renderForm();

      await user.click(nextButton());

      // Asserted together: Next resolves the whole of its own step in one pass
      // (`trigger(ADOPTION_STEPS[0].fields)`), so a form surfacing only one
      // message at a time would still pass a test that checked them one by one.
      expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
      expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/valid malaysian phone number/i)).toBeInTheDocument();
      expect(screen.getByText(/enter your nric or passport number/i)).toBeInTheDocument();
      expect(screen.getByText(/residential address and city/i)).toBeInTheDocument();
      // A step that fails validation does not advance, so nothing is sent.
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(submitApplication).not.toHaveBeenCalled();
    });

    it("rejects a domainless email the browser would have accepted", async () => {
      const { user } = renderForm();

      await user.type(screen.getByLabelText(/full name/i), VALID.name);
      // `nurul@example` deliberately: the field is `type="email"`, so anything
      // the browser's own constraint validation rejects (`nurul@@example`) can
      // be stopped before the application ever sees it. Only a value that
      // passes native validation and fails the schema proves this layer works.
      await user.type(screen.getByLabelText(/email address/i), "nurul@example");
      await user.click(nextButton());

      expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
      expect(submitApplication).not.toHaveBeenCalled();
    });

    it("rejects a phone number too short to be Malaysian", async () => {
      const { user } = renderForm();

      await user.type(screen.getByLabelText(/contact phone number/i), "0123");
      await user.click(nextButton());

      expect(await screen.findByText(/valid malaysian phone number/i)).toBeInTheDocument();
      expect(submitApplication).not.toHaveBeenCalled();
    });

    it("blocks submission until the adoption terms are agreed", async () => {
      const { user } = renderForm();
      await advanceToAgreementStep(user);

      // Both consent boxes default to unchecked, so the gate is observable
      // without clearing anything — the applicant has to give consent rather
      // than withdraw a consent the form gave on their behalf.
      await user.click(submitButton());

      expect(await screen.findByText(/agree to the adoption terms/i)).toBeInTheDocument();
      expect(screen.getByText(/consent to a home check/i)).toBeInTheDocument();
      expect(submitApplication).not.toHaveBeenCalled();

      await acceptConsents(user);
      await user.click(submitButton());

      await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
    });
  });

  describe("housing type contract", () => {
    /**
     * Regression guard. The markup used to offer `own_house_yard`,
     * `rent_house_yard`, `apartment` and `condo`, none of which
     * `adoptionFormSchema` accepts, and the select renders no error message —
     * so picking any of them failed validation silently and the submit button
     * appeared to do nothing at all.
     */
    it("offers exactly the values the schema accepts", async () => {
      const { user } = renderForm();
      await completeContactStep(user);

      const rendered = within(screen.getByLabelText(/housing & accommodation type/i))
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value);

      expect([...rendered].sort()).toEqual([...adoptionFormSchema.shape.housingType.options].sort());
    });

    it("submits successfully with a housing type chosen from the control", async () => {
      const { user } = renderForm();

      await submitCompletedApplication(user, "condo_apartment");

      await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
      expect(submitApplication.mock.calls[0][0]).toMatchObject({
        housingType: "condo_apartment",
      });
    });
  });

  describe("submission", () => {
    it("sends the applicant's details to the server action", async () => {
      const { user, pet } = renderForm();

      await submitCompletedApplication(user);

      await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
      const payload = submitApplication.mock.calls[0][0];
      // Pins the payload, not merely the call: every step's answers have to
      // arrive under the canonical names the action and the record use.
      expect(payload).toMatchObject({
        petId: pet.id,
        petName: pet.name,
        applicantName: VALID.name,
        email: VALID.email,
        phone: VALID.phone,
        identification: VALID.identification,
        address: VALID.address,
        housingType: "landed_terrace",
        hasFencedYard: "yes",
        landlordApproval: "owner_occupied",
        currentPets: "none",
        householdExperience: "experienced",
        vetClinic: VALID.vetClinic,
        dailyAloneHours: "4_to_8",
      });
      // The consents gate submission; they are not application data, and
      // `toApplicationInput()` is what has to keep them out of the record.
      expect(payload).not.toHaveProperty("agreeToTerms");
      expect(payload).not.toHaveProperty("agreeToHomeVisit");
    });

    it("replaces the form with a confirmation naming the applicant and pet", async () => {
      const { user, pet } = renderForm();

      await submitCompletedApplication(user);

      expect(await screen.findByText(/application submitted/i)).toBeInTheDocument();
      // One query for both names: the dialog title also says "Bella", so a bare
      // `/bella/i` would match two elements and prove nothing about the
      // confirmation itself.
      expect(
        screen.getByText(new RegExp(`${VALID.name}[\\s\\S]*${pet.name}`, "i"))
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/shelter adoption terms/i)).not.toBeInTheDocument();
    });

    it("names the animal the server recorded, not the one posted", async () => {
      // Staff renamed the animal between the page render and the submission; the reference code
      // points at the written record, so the confirmation must name what it holds.
      submitApplication.mockImplementation(async (input: { petId: string }) => ({
        success: true,
        data: { id: "app-1", petId: input.petId, petName: "Bella Rose" },
      }));
      const { user } = renderForm();

      await submitCompletedApplication(user);

      expect(await screen.findByText(new RegExp(`${VALID.name}[\\s\\S]*Bella Rose`, "i"))).toBeInTheDocument();
    });

    it("shows the reference code the action returns so the applicant can track it", async () => {
      submitApplication.mockResolvedValue({
        success: true,
        data: { id: "app-1", referenceCode: "HFS-APP-202609-K7QM" },
      });
      const { user } = renderForm();

      await submitCompletedApplication(user);

      expect(await screen.findByText("HFS-APP-202609-K7QM")).toBeInTheDocument();
      // Shown *and* carried into the tracking link: the code is useless to the
      // applicant if the confirmation prints it and then sends them to a bare
      // /applications/track form.
      expect(screen.getByRole("link", { name: /track my application/i })).toHaveAttribute(
        "href",
        "/applications/track?ref=HFS-APP-202609-K7QM"
      );
    });

    it("keeps the form open and shows the reason when the action refuses", async () => {
      submitApplication.mockResolvedValue({
        success: false,
        error: "This animal is currently archived and is no longer accepting new adoption applications.",
      });
      const { user } = renderForm();

      await submitCompletedApplication(user);

      expect(await screen.findByText(/currently archived/i)).toBeInTheDocument();
      expect(screen.queryByText(/application submitted/i)).not.toBeInTheDocument();
      // Still on the last step and still editable, so the applicant can correct
      // and retry rather than refilling four steps.
      expect(screen.getByLabelText(/shelter adoption terms/i)).toBeInTheDocument();
      expect(submitButton()).toBeInTheDocument();
    });

    it("surfaces a thrown transport error instead of failing silently", async () => {
      submitApplication.mockRejectedValue(new Error("Network unreachable"));
      const { user } = renderForm();

      await submitCompletedApplication(user);

      expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
      expect(screen.queryByText(/application submitted/i)).not.toBeInTheDocument();
    });

    it("disables the submit button while the action is in flight", async () => {
      let release!: (value: { success: boolean }) => void;
      submitApplication.mockReturnValue(
        new Promise<{ success: boolean }>((resolve) => {
          release = resolve;
        })
      );
      const { user } = renderForm();

      await submitCompletedApplication(user);

      // Guards against a double-submit creating two applications for one animal.
      await waitFor(() => expect(submitButton()).toBeDisabled());

      release({ success: true });
      await waitFor(() => expect(screen.getByText(/application submitted/i)).toBeInTheDocument());
    });
  });

  describe("which animals the form offers", () => {
    // Issues #99 and #96; the rules are in
    // `tasks/decisions/2026-10-27-an-unrecognised-pet-status-is-refused-not-available.md`.
    const petSelect = () => screen.getByLabelText(/selected rescue animal/i) as HTMLSelectElement;
    const offeredIds = () => Array.from(petSelect().options).map((o) => o.value);

    it("offers only adoptable animals", () => {
      const bella = makePet({ name: "Bella", status: "Available" });
      const max = makePet({ name: "Max", status: "Adopted" });
      const kiki = makePet({ name: "Kiki", status: "Pending" });
      renderForm({ selectedPet: bella, allPets: [bella, max, kiki] });

      expect(offeredIds()).toEqual(["", bella.id]);
      expect(petSelect().value).toBe(bella.id);
    });

    it("keeps the field and the control agreeing on nobody when no animal is adoptable", () => {
      const max = makePet({ name: "Max", status: "Adopted" });
      renderForm({ selectedPet: null, allPets: [max] });

      expect(offeredIds()).toEqual([""]);
      expect(petSelect().value).toBe("");
      expect(screen.getByRole("option", { name: /no animals are accepting applications/i })).toBeInTheDocument();
    });

    it("says at the point of choice that a non-adoptable selected animal cannot be applied for", async () => {
      // `/adopt?petId=` opens on any public animal, adopted ones included.
      const max = makePet({ name: "Max", status: "Adopted" });
      const bella = makePet({ name: "Bella", status: "Available" });
      const { user } = renderForm({ selectedPet: max, allPets: [max, bella] });

      expect(screen.getByRole("status")).toHaveTextContent(/max is not currently accepting adoption applications/i);
      expect(offeredIds()).toEqual(["", bella.id]);
      expect(petSelect().value).toBe("");

      await completeContactStepExpectingRefusal(user);
    });

    it("keeps the applicant's pick when the animal list refreshes while the form is open", async () => {
      const bella = makePet({ name: "Bella", status: "Available" });
      const max = makePet({ name: "Max", status: "Available" });
      const coco = makePet({ name: "Coco", status: "Available" });
      const props = { selectedPet: null, onOpenChange: vi.fn(), open: true };
      const { rerender } = renderWithLanguage(<AdoptionWizard {...props} allPets={[bella, max, coco]} />);
      await setupUser().selectOptions(petSelect(), coco.id);

      // Bella is adopted elsewhere, so the default animal becomes Max; the applicant chose Coco.
      rerender(<AdoptionWizard {...props} allPets={[{ ...bella, status: "Adopted" }, max, coco]} />);

      expect(petSelect().value).toBe(coco.id);
    });

    it("reopened for another animal after a submission, starts a fresh form for that animal", async () => {
      // The confirmation used to be cleared by a `reset()` on a timer after close, which a quick
      // reopen could beat (and an Escape close, which bypasses the wizard's own close, never ran).
      const bella = makePet({ name: "Bella", status: "Available" });
      const max = makePet({ name: "Max", status: "Available" });
      const props = { allPets: [bella, max], onOpenChange: vi.fn() };
      const { rerender } = renderWithLanguage(<AdoptionWizard {...props} selectedPet={bella} open />);
      await submitCompletedApplication(setupUser());
      expect(await screen.findByText(/application submitted/i)).toBeInTheDocument();

      rerender(<AdoptionWizard {...props} selectedPet={bella} open={false} />);
      rerender(<AdoptionWizard {...props} selectedPet={max} open />);

      expect(screen.queryByText(/application submitted/i)).not.toBeInTheDocument();
      expect(petSelect().value).toBe(max.id);
      expect(screen.getByLabelText(/full name/i)).toHaveValue("");
    });

    it("reopened on nobody within the close animation, submits for the animal its title names", async () => {
      // The wizard stays mounted while the dialog animates closed, so this drives it directly
      // through close and reopen. The second opening passes `selectedPet = null`, and the old
      // effect, which ran only for a real pet, left Max's id in the field under Bella's title.
      const bella = makePet({ name: "Bella", status: "Available" });
      const max = makePet({ name: "Max", status: "Available" });
      const props = { allPets: [bella, max], onOpenChange: vi.fn() };
      const { rerender } = renderWithLanguage(<AdoptionWizard {...props} selectedPet={max} open />);
      expect(petSelect().value).toBe(max.id);

      rerender(<AdoptionWizard {...props} selectedPet={max} open={false} />);
      rerender(<AdoptionWizard {...props} selectedPet={null} open />);

      expect(petSelect().value).toBe(bella.id);
      await submitCompletedApplication(setupUser());
      await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
      expect(submitApplication.mock.calls[0][0]).toMatchObject({ petId: bella.id, petName: "Bella" });
    });
  });

  describe("bilingual rendering", () => {
    it("renders Malay section headings when the language is ms", () => {
      renderWithLanguage(
        <AdoptionForm
          selectedPet={makePet({ name: "Bella" })}
          allPets={[makePet({ name: "Bella" })]}
          open
          onOpenChange={vi.fn()}
        />,
        { language: "ms" }
      );

      // The wizard names its sections from `STEP_TITLES`: the current step's
      // title appears in the step counter and again in the progress rail, and
      // the rail names every section still to come.
      expect(screen.getAllByText(/hubungan & pengenalan/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/persekitaran kediaman/i)).toBeInTheDocument();
      expect(screen.getByText(/pengalaman & pelan penjagaan/i)).toBeInTheDocument();
    });
  });
});
