import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import { PetFormDialog } from "@/components/admin/PetFormDialog";
import {
  computeAgeCategory,
  formatAgeBandRange,
  formatAgeString,
} from "@/lib/domain/petAge";
import type { AgeCategory, Pet } from "@/types/pet";
import { makePet, renderWithLanguage, setupUser } from "./support/render";

/**
 * The admin pet form's age input (PS-114 /
 * `tasks/decisions/2026-09-22-the-pet-form-collects-a-birthday-not-age-prose.md`).
 *
 * The form used to collect a free-text `age` and an `ageCategory` band, both of which the
 * persistence layer threw away — it stored `intakeDate − age` and recomputed band and age from
 * that on every read. These specs pin the replacement: one `birthDate` the operator actually
 * chose, one honesty flag beside it, and an age/band readout that is derived rather than typed.
 *
 * Deliberately asserts the *absence* of the two old controls. That absence is the fix; a suite
 * that only checked the new field would stay green if someone re-added the stale ones alongside.
 */

/**
 * The admin-only English band labels. Duplicated from the component on purpose: they are copy
 * under test, not a shared constant (`ADMIN_AGE_BAND_NAMES` is module-private), and the band each
 * one is looked up by is derived from the domain below rather than assumed.
 */
const ADMIN_BAND_LABEL: Record<AgeCategory, string> = {
  puppy_kitten: "Puppy / Kitten",
  young: "Young",
  adult: "Adult",
  senior: "Senior",
};

/** What the read-only readout must show for a birth date, computed from the domain, not frozen. */
function expectedReadout(birthDate: string): string {
  const band = computeAgeCategory(birthDate);
  return `${formatAgeString(birthDate).en} — ${ADMIN_BAND_LABEL[band]} (${formatAgeBandRange(band)})`;
}

function renderDialog(editingPet?: Pet) {
  const onSave = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderWithLanguage(
    <PetFormDialog
      open
      onOpenChange={onOpenChange}
      editingPet={editingPet ?? null}
      onSave={onSave}
    />
  );
  return { ...view, onSave, onOpenChange, user: setupUser() };
}

const birthDateInput = () => screen.getByLabelText(/^birth date/i);
const estimateCheckbox = () => screen.getByLabelText(/estimated — exact date unknown/i);

/**
 * Sets an `<input type="date">`.
 *
 * `user.type` cannot drive one: user-event applies a keystroke to a date/time input only when the
 * *accumulated* value parses as a valid value, so every intermediate prefix of "2023-04-15" is
 * discarded and the field never fills. One change event is also what a native date picker emits,
 * so this is the truthful interaction rather than a shortcut around the component.
 */
function pickDate(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

/** The five fields with no usable default on a new pet. Everything else is pre-filled. */
async function fillRequiredFields(
  user: ReturnType<typeof setupUser>,
  birthDate: string
): Promise<void> {
  // Kept short on purpose: two `watch()` calls re-render the whole form on every keystroke, so
  // prose costs seconds here. These are the shortest strings the schema accepts (10+ characters
  // for the two narrative fields).
  await user.type(screen.getByLabelText(/pet name/i), "Barnaby");
  await user.type(screen.getByLabelText(/^breed/i), "Mixed");
  await user.type(screen.getByLabelText(/short card summary/i), "Calm leashed dog");
  await user.type(screen.getByLabelText(/full rescue background story/i), "Found in PJ.");
  pickDate(birthDateInput(), birthDate);
}

describe("PetFormDialog birth date field", () => {
  it("offers a date input for the birthday and no free-text age or band select", () => {
    renderDialog();

    const input = birthDateInput();
    expect(input).toHaveAttribute("type", "date");

    // The two controls PS-114 removed. Queried by their old accessible names and by their old
    // ids, because either one surviving would mean an operator can still type an age that the
    // store silently discards.
    expect(screen.queryByLabelText(/age \(text\)/i)).toBeNull();
    expect(document.querySelector("input#age")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /age stage/i })).toBeNull();
    expect(document.querySelector("select#ageCategory")).toBeNull();
  });

  it("seeds the stored birth date when editing an existing pet", () => {
    renderDialog(makePet({ birthDate: "2023-04-15", intakeDate: "2026-06-12" }));

    expect(birthDateInput()).toHaveValue("2023-04-15");
  });

  it("derives the age and band readout from the typed birth date", async () => {
    renderDialog();

    const readout = screen.getByText("Enter a birth date");

    pickDate(birthDateInput(), "2023-04-15");
    await waitFor(() => expect(readout).toHaveTextContent(expectedReadout("2023-04-15")));

    // A second date proves the readout tracks the field rather than rendering once.
    pickDate(birthDateInput(), "2026-05-02");
    await waitFor(() => expect(readout).toHaveTextContent(expectedReadout("2026-05-02")));
  });

  it("treats the birth date as an estimate by default for a new pet", () => {
    renderDialog();

    expect(estimateCheckbox()).toBeChecked();
  });

  it("renders an exactly-known birth date as not estimated", () => {
    renderDialog(
      makePet({ birthDate: "2023-04-15", birthDateIsEstimate: false, intakeDate: "2026-06-12" })
    );

    expect(estimateCheckbox()).not.toBeChecked();
  });

  it("submits birthDate and birthDateIsEstimate, and no age or ageCategory", async () => {
    const { onSave, user } = renderDialog();

    await fillRequiredFields(user, "2023-04-15");
    await user.click(screen.getByRole("button", { name: /create pet record/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const payload = onSave.mock.calls[0][0];
    expect(payload.birthDate).toBe("2023-04-15");
    expect(payload.birthDateIsEstimate).toBe(true);
    // Key-level, not value-level: an `age: undefined` riding along would still be persisted as a
    // column write by the action layer.
    expect(Object.keys(payload)).not.toContain("age");
    expect(Object.keys(payload)).not.toContain("ageCategory");
  });

  /**
   * Two clicks back to back must save one pet record, not two. react-hook-form disables the
   * button from the first click (`isSubmitting`); this pins the outcome, whichever guard holds.
   */
  it("hands the form to onSave once on a fast double-click", async () => {
    const { onSave, user } = renderDialog();

    await fillRequiredFields(user, "2023-04-15");
    const submit = screen.getByRole("button", { name: /create pet record/i });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  /**
   * After a save the dialog closes, but it stays mounted while it animates out (which jsdom
   * cannot show). Save stays locked through that window, and a submit that does not come from
   * the button, as `form.requestSubmit()` can make, does not reach onSave a second time either.
   */
  it("keeps Save locked after a save while the dialog closes", async () => {
    const { onSave, user } = renderDialog();

    await fillRequiredFields(user, "2023-04-15");
    const submit = screen.getByRole("button", { name: /create pet record/i });
    await user.click(submit);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    // The submit handler awaits only promises, so one macrotask runs it to the end.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  /**
   * A handler that throws before taking the form leaves the dialog open, so the lock must not
   * outlive the throw: the operator can try again, and the error is reported, not lost.
   */
  it("unlocks Save when onSave throws, so the operator can try again", async () => {
    const { onSave, user } = renderDialog();
    onSave.mockImplementationOnce(() => {
      throw new Error("the table refused the save");
    });
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await fillRequiredFields(user, "2023-04-15");
      const submit = screen.getByRole("button", { name: /create pet record/i });
      await user.click(submit);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

      await waitFor(() => expect(submit).toBeEnabled());
      expect(reported).toHaveBeenCalledWith(expect.stringContaining("onSave threw"), expect.any(Error));

      await user.click(submit);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    } finally {
      reported.mockRestore();
    }
  });

  /**
   * Two submits dispatched before the dialog re-renders both run against the same render, so a
   * guard kept only in state would let both through to onSave.
   */
  it("saves once when two submits arrive before it re-renders", async () => {
    const { onSave, user } = renderDialog();

    await fillRequiredFields(user, "2023-04-15");
    const form = screen.getByRole("button", { name: /create pet record/i }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  /**
   * The guard holds while the dialog closes (it stays mounted while it animates out, which jsdom
   * cannot show) and is cleared only when the dialog opens again, so the next save goes through.
   */
  it("accepts a new save once the dialog opens again", async () => {
    const { onSave, onOpenChange, user, rerender } = renderDialog();

    await fillRequiredFields(user, "2023-04-15");
    await user.click(screen.getByRole("button", { name: /create pet record/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const dialog = (open: boolean) => (
      <PetFormDialog open={open} onOpenChange={onOpenChange} editingPet={null} onSave={onSave} />
    );
    rerender(dialog(false));
    rerender(dialog(true));

    await fillRequiredFields(user, "2023-04-15");
    await user.click(screen.getByRole("button", { name: /create pet record/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  /**
   * `petFormSchema` also rejects this ("...is after the intake date"), but the dialog never gets
   * that far and cannot render the message: the field carries `max={intakeDate}`, so the value is
   * `rangeOverflow` and constraint validation refuses the submit before react-hook-form runs the
   * resolver at all. Asserted as the refusal it actually is. The schema's message is reachable
   * only through the action layer, and wants a schema-level spec of its own.
   */
  it("refuses to save a birth date after the intake date", async () => {
    const pet = makePet({ birthDate: "2023-04-15", intakeDate: "2026-06-12" });
    const { onSave, user } = renderDialog(pet);

    const input = birthDateInput() as HTMLInputElement;
    // The guard is bound to this animal's intake date rather than to a constant.
    expect(input).toHaveAttribute("max", pet.intakeDate);

    pickDate(input, "2026-08-01");
    expect(input.validity.rangeOverflow).toBe(true);

    // The refusal happens before any submit event is dispatched, so watch for the event itself
    // rather than sleeping and hoping `onSave` would have been called by now. The submit spec
    // above is the positive control: a click on this button does submit and reach `onSave`.
    const submitted = vi.fn();
    input.form!.addEventListener("submit", submitted);

    await user.click(screen.getByRole("button", { name: /update pet profile/i }));

    expect(submitted).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
