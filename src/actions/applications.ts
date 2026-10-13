"use server";

import { revalidatePath } from "next/cache";
import {
  applicationFormSchema,
  ApplicationFormInput,
  updateApplicationStatusSchema,
  UpdateApplicationStatusInput,
  scheduleInterviewSchema,
  ScheduleInterviewInput,
  recordHomeVisitSchema,
  RecordHomeVisitInput,
} from "@/lib/validations/application";
import {
  trackApplicationLookupSchema,
  TrackApplicationLookupInput,
  PublicApplicationTrackingDTO,
  PublicInterviewDetails,
} from "@/lib/validations/applicationTracking";
import { AdoptionApplicationRecord } from "@/types/application";
import { getVerifiedSession } from "@/lib/security/dal";
import { assertHasPermission, PERMISSIONS } from "@/lib/security/rbac";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { checkAddressRateLimit } from "@/lib/security/clientAddress";
import { withIdempotency } from "@/lib/security/idempotency";
import {
  getServerApplicationsAsync,
  insertServerApplication,
  atomicUpdateApplicationStatus,
  deleteServerApplication,
  findServerApplicationById,
  findServerApplicationByIdAsync,
  findServerApplicationByReferenceAsync,
  recordApplicationMilestones,
} from "@/lib/server/applicationRepository";
import {
  generateReferenceCode,
  normalizeReferenceCode,
  deriveApplicationProgress,
  combineInterviewDateTime,
  splitInterviewDateTime,
} from "@/lib/domain/applicationWorkflow";
import { findServerPetById, findServerPetByIdAsync } from "@/lib/server/petRepository";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import {
  sendApplicationConfirmationEmail,
  sendStaffApplicationAlert,
  sendApplicationStatusUpdateEmail,
  sendInterviewInvitationEmail,
} from "@/lib/email";
import { recordAuditLog } from "@/lib/domain/auditLog";

export async function getApplications(): Promise<AdoptionApplicationRecord[]> {
  const session = await getVerifiedSession();
  assertHasPermission(session, PERMISSIONS.VIEW_APPLICATIONS);

  return getServerApplicationsAsync();
}

const MAX_REFERENCE_CODE_ATTEMPTS = 5;

/** True for a Prisma unique-constraint violation naming the referenceCode index. */
function isReferenceCodeCollision(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: string; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  const asText = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return asText.includes("referenceCode");
}

/**
 * Inserts an application, allocating its public reference code.
 *
 * Uniqueness is enforced by the unique index, not by the generator: a losing
 * race surfaces as P2002 and is retried with a fresh code. Any other error
 * propagates untouched, so a genuine write failure is never mistaken for a
 * collision and silently retried.
 */
async function insertWithUniqueReferenceCode(
  draft: Omit<AdoptionApplicationRecord, "referenceCode">
): Promise<AdoptionApplicationRecord> {
  for (let attempt = 0; attempt < MAX_REFERENCE_CODE_ATTEMPTS; attempt += 1) {
    const candidate: AdoptionApplicationRecord = {
      ...draft,
      referenceCode: generateReferenceCode(),
    };

    try {
      await insertServerApplication(candidate);
      return candidate;
    } catch (err) {
      if (!isReferenceCodeCollision(err)) throw err;
    }
  }

  throw new Error("Could not allocate a unique application reference. Please try again.");
}

export async function submitApplication(
  data: ApplicationFormInput,
  idempotencyKey?: string
): Promise<{ success: boolean; data?: AdoptionApplicationRecord; error?: string }> {
  try {
    const validated = applicationFormSchema.parse(data);

    // 1. Rate limiting — two independent budgets, neither keyed on the other's input.
    // The address budget is the one that actually bounds an attacker; the email
    // budget bounds spam against one mailbox but is trivially bypassed by varying
    // the address. See tasks/decisions/2026-09-08-rate-limit-keys-carry-no-attacker-supplied-value.md.
    const addressLimit = await checkAddressRateLimit("submit-app", 20, 600000);
    if (addressLimit.limited) {
      return {
        success: false,
        error: `Submission rate limit exceeded. Please wait ${addressLimit.retryAfterSeconds}s before submitting again.`,
      };
    }
    const emailLimit = checkRateLimit(`submit-app:email:${validated.email.toLowerCase()}`, 10, 600000);
    if (!emailLimit.success) {
      return {
        success: false,
        error: `Submission rate limit exceeded. Please wait ${emailLimit.retryAfterSeconds}s before submitting again.`,
      };
    }

    // 2. The target animal: it must exist, not be archived, and be adoptable.
    //
    // The first two lines are `getPetById`'s guard in `src/actions/pets.ts`, deliberately
    // identical, and **that comment is the long form of both** — not restated here, so the two
    // copies cannot drift into disagreeing explanations of the same three lines. This is the
    // second site carrying it; a third wants `findVisiblePetById` in the repository instead.
    //
    // Placed after the rate limits on purpose. This is a database query on an unauthenticated
    // POST; the mirror read it replaces was free, so leaving it above the budgets would hand
    // an anonymous caller one `findUnique` per request with nothing bounding it.
    //
    // The exact-id comparison is **not** redundant, though what it covers narrowed when
    // `findServerPetByIdAsync` began returning null after a successful empty read (#89). Where the
    // database answers, a case-variant is now simply not found. Where it does not — no database
    // configured, or a read that threw and was swallowed — the mirror still answers, and its
    // lookup lowercases while Postgres does not, so `PET-001` resolves to fixture `pet-001`,
    // Available and unarchived there. That is the one route left to this comparison, and it is
    // load-bearing on it: deleting the comparison leaves the strict-mode suite entirely green.
    // `tests/integration/adoptionSubmissionGuards.test.ts` covers it on the mirror route for
    // exactly that reason.
    //
    // What none of this closes: on those same mirror routes the fixture answers under the very id
    // posted, so the comparison cannot fire and `isArchived`/`status` are read off `pets.json`.
    // The application is then written against an id the `Pet` table does not hold, the insert
    // raises P2003, `insertServerApplication` swallows it, and the applicant is returned
    // `success: true` with a reference code for a row that reached no database. So: checked
    // against the database whenever the database answers, and silently fixture-backed when it
    // cannot — `tasks/open/an-application-can-succeed-against-no-database-row.md`, alongside
    // `tasks/open/an-outage-serves-and-bills-fixture-animals.md`, which is the same route costing
    // the sponsorship path money.
    const requestedPetId = validated.petId.trim();
    const pet = await findServerPetByIdAsync(requestedPetId);
    if (!pet || pet.id !== requestedPetId) {
      // The comment above the old check said "verify target pet exists"; the code read
      // `pet && pet.isArchived`, which skipped the check entirely when nothing matched, so any
      // id the mirror did not hold — including one that exists nowhere — was accepted.
      return {
        success: false,
        error: "We could not find that animal. Please choose one from the adoption gallery and try again.",
      };
    }
    if (pet.isArchived) {
      return {
        success: false,
        error: "This animal is currently archived and is no longer accepting new adoption applications.",
      };
    }
    const presentation = getPetStatusPresentation(pet.status);
    if (!presentation.isAdoptable) {
      // `isAdoptable` rather than a status comparison here, so this agrees with the gallery's
      // preselect and the detail page's button by construction. It is true for `Available`
      // alone: `Pending` is a stage of the adoption track whose button already renders
      // disabled, and that is the product call recorded in
      // `tasks/decisions/2026-09-10-pending-is-a-stage-of-adoption-not-a-track.md`.
      //
      // This check is only as good as the status it is handed, and on the database route that is
      // **fail-open, not fail-closed**. `getPetStatusPresentation` does fall back to the `pending`
      // presentation for a value it does not know, but nothing unknown reaches it from a database
      // read: `fromDbPetStatus` matches four exact, case-sensitive spellings and returns
      // `"Available"` for everything else, so a column holding `adopted` or `ADOPTED` arrives here
      // as Available and this guard lets it through — the animal it was written to refuse. That
      // matters because the production branch has held `Pet.status` as text rather than the
      // `PetStatus` enum. Not fixed here: the default lives in a mapper every pet read goes
      // through, so changing it is a catalogue-wide behaviour change, not a line in this action.
      // `tasks/open/an-unknown-pet-status-reads-as-available.md`.
      return {
        success: false,
        error: `${pet.name} is not currently accepting adoption applications (${presentation.labelFallback}).`,
      };
    }

    // 3. Idempotency Wrapper
    return await withIdempotency(idempotencyKey, async () => {
      const today = new Date().toISOString().split("T")[0];

      const draft: Omit<AdoptionApplicationRecord, "referenceCode"> = {
        id: `app-${Date.now()}`,
        // The verified row's own id and name, not the request's. Both matter, and neither is
        // cosmetic:
        //
        // `petId` — the guard above compares `validated.petId.trim()`, while this used to write
        // the untrimmed string. `applicationFormSchema` does not trim, so a posted `" pet-001 "`
        // passed every check and was then written with its whitespace into a column carrying a
        // foreign key to `Pet.id`. Prisma raises P2003, `insertServerApplication` hands it to
        // `handlePersistenceError(…, "write")`, and outside strict mode that swallows anything
        // but P2002 — so the row never reached the database, survived only in the in-memory
        // mirror until the next restart, and the applicant was still told `success: true` and
        // given a reference code.
        //
        // `petName` — it was taken from the request while the resolved animal sat in scope, and
        // two places downstream treat that name as identifying. `atomicUpdateApplicationStatus`
        // auto-rejects other open applications matching on `petName` as well as `petId`, and
        // `markCachedPetAdopted` marks the first pet matching *either* id or name. A submission
        // naming a popular animal it was not for could therefore close that animal's real
        // applications on approval, and flip the wrong pet to Adopted when it sorted earlier in
        // the mirror.
        // `petBreed` for the same reason, and it was not being written at all. The column's own
        // comment in `prisma/schema.prisma` says "Snapshot of the pet's breed at application
        // time. Same rationale as petName" — it exists so the record survives `petId` going null
        // under `onDelete: SetNull`. Leaving it null meant the tracking portal's
        // `pet?.breed || app.petBreed` was carried entirely by re-reading the live animal, and
        // showed no breed at all once that animal was gone, which is the case the column is for.
        petId: pet.id,
        petName: pet.name,
        petBreed: pet.breed,
        applicantName: validated.applicantName,
        email: validated.email,
        phone: validated.phone,
        address: validated.address,
        identification: validated.identification,
        housingType: validated.housingType,
        hasFencedYard: validated.hasFencedYard,
        landlordApproval: validated.landlordApproval,
        currentPets: validated.currentPets,
        currentPetDetails: validated.currentPetDetails,
        householdExperience: validated.householdExperience,
        vetClinic: validated.vetClinic,
        dailyAloneHours: validated.dailyAloneHours,
        applicantNotes: validated.applicantNotes,
        status: "SUBMITTED",
        adminReviewNotes: "",
        createdAt: today,
        updatedAt: today,
      };

      // The reference code's suffix is random, so uniqueness is guaranteed by
      // the unique index rather than by generation. A collision is a retry, not
      // a failed application — see generateReferenceCode's ceiling note.
      const newApp = await insertWithUniqueReferenceCode(draft);
      try {
        revalidatePath("/admin/applications");
        revalidatePath("/admin");
      } catch {
        // Safe outside Next.js runtime
      }

      // Non-blocking, resilient email notification dispatch
      Promise.allSettled([
        sendApplicationConfirmationEmail(newApp),
        sendStaffApplicationAlert(newApp),
      ]).catch((err) => console.error("[Email Notification Dispatch Failed]", err));

      return { success: true, data: newApp };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit adoption application";
    return { success: false, error: msg };
  }
}

export async function updateApplicationStatus(
  input: UpdateApplicationStatusInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getVerifiedSession();
    assertHasPermission(session, PERMISSIONS.REVIEW_APPLICATIONS);

    const validated = updateApplicationStatusSchema.parse(input);
    const existingApp = (await findServerApplicationByIdAsync(validated.id)) || findServerApplicationById(validated.id);

    const result = await atomicUpdateApplicationStatus(
      validated.id,
      validated.status,
      validated.adminReviewNotes,
      session
    );

    if (!result.success) {
      return result;
    }

    // Non-blocking transactional email notification for status change
    if (existingApp && validated.notifyApplicant !== false) {
      const updatedApp: AdoptionApplicationRecord = {
        ...existingApp,
        status: validated.status,
        adminReviewNotes: validated.adminReviewNotes ?? existingApp.adminReviewNotes,
      };

      sendApplicationStatusUpdateEmail(
        updatedApp,
        validated.status,
        validated.adminReviewNotes
      ).catch((err) => console.error("[Status Email Notification Error]", err));
    }

    try {
      revalidatePath("/admin/applications");
      revalidatePath("/admin/pets");
      revalidatePath("/pets");
      revalidatePath("/");
    } catch {
      // Safe outside Next.js runtime
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update application status";
    return { success: false, error: msg };
  }
}

export async function scheduleApplicationInterview(
  input: ScheduleInterviewInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getVerifiedSession();
    assertHasPermission(session, PERMISSIONS.REVIEW_APPLICATIONS);

    const validated = scheduleInterviewSchema.parse(input);
    const app = (await findServerApplicationByIdAsync(validated.applicationId)) || findServerApplicationById(validated.applicationId);

    if (!app) {
      return { success: false, error: "Application not found" };
    }

    const meetingTypeLabel = validated.meetingType === "video_call" ? "Virtual Video Call" : "In-Person Visit";
    const formattedNotes = `[Meet & Greet Scheduled: ${validated.interviewDate} at ${validated.interviewTime} (${meetingTypeLabel}) - Location: ${validated.location}] ${validated.coordinatorNotes || ""}`.trim();

    // If currently SUBMITTED, transition to UNDER_REVIEW
    if (app.status === "SUBMITTED") {
      await atomicUpdateApplicationStatus(
        app.id,
        "UNDER_REVIEW",
        formattedNotes,
        session
      );
    } else {
      // Append interview details to review notes
      await atomicUpdateApplicationStatus(
        app.id,
        app.status,
        formattedNotes,
        session
      );
    }

    // Record the interview as structured data. The formatted note above stays
    // for staff readability, but the public tracking portal now reads these
    // columns instead of parsing that text back out of the notes field.
    //
    // Only written when the date and time actually parse. Passing the null
    // through would clear whatever interview was already on the record, so an
    // unparseable time would silently un-schedule a real appointment; leaving
    // the columns alone instead means the note above still carries it, and the
    // legacy reader in `readInterviewDetails` still lights the step.
    const interviewAt = combineInterviewDateTime(validated.interviewDate, validated.interviewTime);
    if (interviewAt) {
      await recordApplicationMilestones(app.id, {
        interviewAt,
        interviewLocation: validated.location,
        interviewMeetingType: validated.meetingType,
      });
    }

    // Record interview scheduled audit log
    recordAuditLog({
      actorId: session.id,
      actorEmail: session.email,
      actorRole: session.role,
      action: "INTERVIEW_SCHEDULED",
      entity: "AdoptionApplication",
      entityId: app.id,
      details: {
        petId: app.petId,
        petName: app.petName,
        applicantName: app.applicantName,
        interviewDate: validated.interviewDate,
        interviewTime: validated.interviewTime,
        meetingType: validated.meetingType,
        location: validated.location,
      },
    });

    // Dispatch interview invitation email to applicant
    if (validated.notifyApplicant !== false) {
      sendInterviewInvitationEmail(app, {
        interviewDate: validated.interviewDate,
        interviewTime: validated.interviewTime,
        location: validated.location,
        meetingType: validated.meetingType,
        coordinatorNotes: validated.coordinatorNotes,
        coordinatorName: session.email.split("@")[0],
      }).catch((err) => console.error("[Interview Email Notification Error]", err));
    }

    try {
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
    } catch {
      // Safe outside Next.js runtime
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to schedule interview";
    return { success: false, error: msg };
  }
}

/**
 * Records that a pre-adoption home visit took place.
 *
 * Deliberately not a status transition: the application stays UNDER_REVIEW
 * while the home visit happens, and this only lights the corresponding step in
 * the applicant's tracking portal. See
 * `tasks/decisions/2026-09-08-interview-and-home-visit-are-milestones-not-statuses.md`.
 */
export async function recordApplicationHomeVisit(
  input: RecordHomeVisitInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getVerifiedSession();
    assertHasPermission(session, PERMISSIONS.REVIEW_APPLICATIONS);

    const validated = recordHomeVisitSchema.parse(input);
    const app = (await findServerApplicationByIdAsync(validated.applicationId)) ||
      findServerApplicationById(validated.applicationId);

    if (!app) {
      return { success: false, error: "Application not found" };
    }

    const homeVisitAt = combineInterviewDateTime(validated.homeVisitDate, validated.homeVisitTime);
    if (!homeVisitAt) {
      return { success: false, error: "Home visit date and time could not be understood." };
    }

    const recorded = await recordApplicationMilestones(app.id, { homeVisitAt });
    if (!recorded) {
      return { success: false, error: "Failed to record the home visit." };
    }

    recordAuditLog({
      actorId: session.id,
      actorEmail: session.email,
      actorRole: session.role,
      action: "HOME_VISIT_RECORDED",
      entity: "AdoptionApplication",
      entityId: app.id,
      details: {
        petId: app.petId,
        petName: app.petName,
        applicantName: app.applicantName,
        homeVisitAt,
        coordinatorNotes: validated.coordinatorNotes,
      },
    });

    try {
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
    } catch {
      // Safe outside Next.js runtime
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record the home visit";
    return { success: false, error: msg };
  }
}

export async function deleteApplication(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getVerifiedSession();
    assertHasPermission(session, PERMISSIONS.DELETE_APPLICATIONS);

    const ok = await deleteServerApplication(id, session);
    if (!ok) {
      return { success: false, error: "Application not found" };
    }

    try {
      revalidatePath("/admin/applications");
    } catch {
      // Safe outside Next.js runtime
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete application";
    return { success: false, error: msg };
  }
}

/**
 * Reads an application's interview, preferring the structured milestone columns.
 *
 * ceiling: the second branch recovers interviews by regex from the free-text
 * `adminReviewNotes` field, which is how every interview scheduled before the
 * milestone columns existed was recorded. It is a read-only compatibility path
 * — nothing writes that format any more — and should be deleted once no
 * application predating those columns is still open.
 */
function readInterviewDetails(app: AdoptionApplicationRecord): PublicInterviewDetails | undefined {
  if (app.interviewAt) {
    const parts = splitInterviewDateTime(app.interviewAt);
    if (parts) {
      return {
        interviewDate: parts.date,
        interviewTime: parts.time,
        location: app.interviewLocation || "",
        meetingType: app.interviewMeetingType === "video_call" ? "video_call" : "in_person",
      };
    }
  }

  const notes = app.adminReviewNotes;
  if (!notes || !notes.includes("[Meet & Greet Scheduled:")) return undefined;

  const match = notes.match(
    /\[Meet & Greet Scheduled:\s*([0-9-]+)\s*at\s*([0-9:]+)\s*\(([^)]+)\)\s*-\s*Location:\s*([^\]]+)\]\s*(.*)/i
  );
  if (!match) return undefined;

  return {
    interviewDate: match[1],
    interviewTime: match[2],
    meetingType: match[3].toLowerCase().includes("virtual") ? "video_call" : "in_person",
    location: match[4].trim(),
    coordinatorNotes: match[5]?.trim() || undefined,
  };
}

/**
 * Public, rate-limited, privacy-safe status lookup for adoption applicants.
 */
export async function lookupApplicationStatusAction(
  input: TrackApplicationLookupInput
): Promise<{ success: boolean; data?: PublicApplicationTrackingDTO; error?: string }> {
  try {
    const validated = trackApplicationLookupSchema.parse(input);

    // 1. Rate limiting — same two-budget pattern as submitApplication.
    const addressLimit = await checkAddressRateLimit("track-app", 30, 300000);
    if (addressLimit.limited) {
      return {
        success: false,
        error: `Too many lookup attempts. Please wait ${addressLimit.retryAfterSeconds}s before trying again.`,
      };
    }
    const emailLimit = checkRateLimit(`track-app:email:${validated.email}`, 15, 300000);
    if (!emailLimit.success) {
      return {
        success: false,
        error: `Too many lookup attempts. Please wait ${emailLimit.retryAfterSeconds}s before trying again.`,
      };
    }

    // 2. Resolve the claim. The reference code is what the applicant was given;
    //    a bare id is still accepted so applications submitted before reference
    //    codes existed remain trackable.
    const reference = normalizeReferenceCode(validated.referenceId);
    const app = await findServerApplicationByReferenceAsync(reference);

    // Authorization: the reference code alone proves nothing. The email on the
    // record must match, and both misses return the same message so the portal
    // cannot be used to test whether a reference code exists.
    if (!app || app.email.trim().toLowerCase() !== validated.email) {
      return {
        success: false,
        error:
          "No application matching this reference code and email combination was found. Please check your reference code.",
      };
    }

    // 3. Enrich with live pet profile data if available
    const pet = app.petId ? findServerPetById(app.petId) : null;

    // 4. Interview details, structured columns first.
    const interviewDetails = readInterviewDetails(app);

    // 5. Milestone progress, derived from evidence rather than status alone.
    const progress = deriveApplicationProgress({
      status: app.status,
      // A legacy row carries its interview only in the notes; treat a parsed
      // note as the same evidence a real interviewAt column would provide.
      interviewAt: app.interviewAt ?? (interviewDetails ? app.updatedAt : null),
      homeVisitAt: app.homeVisitAt,
    });

    // 6. Construct public-safe sanitized DTO. Built field by field, never
    //    spread: `identification` (NRIC/passport), phone and address must not
    //    cross to an unauthenticated caller, and a future column must not
    //    publish itself by being added to the record.
    const publicDto: PublicApplicationTrackingDTO = {
      id: app.id,
      referenceCode: app.referenceCode,
      petId: app.petId,
      petName: app.petName,
      petBreed: pet?.breed || app.petBreed,
      petSpecies: pet?.species,
      petImage: pet?.image,
      applicantName: app.applicantName,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      publicNotes:
        app.adminReviewNotes && !app.adminReviewNotes.startsWith("[Meet & Greet")
          ? app.adminReviewNotes
          : undefined,
      interviewDetails,
      milestone: progress.currentMilestone,
      milestoneIndex: progress.currentIndex,
      homeVisitAt: app.homeVisitAt ?? null,
    };

    return { success: true, data: publicDto };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to lookup application status";
    return { success: false, error: msg };
  }
}
