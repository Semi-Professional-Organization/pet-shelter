import initialApplicationsData from "@/data/applications.json";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import { validateApplicationTransition } from "@/lib/domain/stateMachine";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError, isDatabasePersistent } from "@/lib/persistenceMode";
import { markCachedPetAdopted } from "./petRepository";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Internal signal distinguishing "the caller asked for an illegal transition or
 * lost a race" from "the database is unreachable". The former is a user-facing
 * answer; the latter routes through handlePersistenceError.
 */
class TransitionError extends Error {}

/**
 * A configured database refused or could not take a new application. Thrown
 * instead of mirroring the record, because the applicant would otherwise be
 * given a reference code for a row that no database holds.
 */
export class ApplicationWriteError extends Error {
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super("Could not save the adoption application");
    this.name = "ApplicationWriteError";
    this.cause = cause;
  }
}

/**
 * Adoption-application reads and writes over the repository layer.
 *
 * Ordering invariant (mirrors ./petRepository): **database first, mirror
 * second.** The in-memory store is a fallback read source only; it is written
 * after the database confirms, and reads never overwrite it wholesale — a read
 * that did would race concurrent inserts and silently drop just-submitted
 * applications.
 */

interface DbApplicationRecord {
  id: string;
  referenceCode: string | null;
  petId: string | null;
  petName: string;
  petBreed: string | null;
  applicantName: string;
  email: string;
  phone: string;
  address: string;
  identification: string | null;
  housingType: string;
  hasFencedYard: string;
  landlordApproval: string | null;
  currentPets: string;
  currentPetDetails: string | null;
  householdExperience: string;
  vetClinic: string | null;
  dailyAloneHours: string | null;
  applicantNotes: string | null;
  status: string;
  adminReviewNotes: string | null;
  interviewAt: Date | string | null;
  interviewLocation: string | null;
  interviewMeetingType: string | null;
  homeVisitAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Milestone timestamps keep full precision; only createdAt/updatedAt are days. */
function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// Deep-cloned for the same reason as the pet cache — see `./petRepository`.
function freshApplications(): AdoptionApplicationRecord[] {
  return structuredClone(initialApplicationsData) as AdoptionApplicationRecord[];
}

let serverApplications: AdoptionApplicationRecord[] = freshApplications();

/** Test-only. Registered below for the test harness. */
export function resetApplications(): void {
  serverApplications = freshApplications();
}

registerStateReset("applications", resetApplications);

export function getServerApplications(): AdoptionApplicationRecord[] {
  return serverApplications;
}

/**
 * A `Date | string` column reduced to a `YYYY-MM-DD` domain string.
 *
 * `toString().split("T")[0]` is locale-fragile for real `Date` objects (whose
 * `toString()` is "Mon Jan 05 ..."), so this always goes through the ISO form.
 */
function toDayString(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function mapDbApplicationToRecord(a: DbApplicationRecord): AdoptionApplicationRecord {
  return {
    id: a.id,
    referenceCode: a.referenceCode || undefined,
    petId: a.petId || "",
    petName: a.petName,
    petBreed: a.petBreed || undefined,
    applicantName: a.applicantName,
    email: a.email,
    phone: a.phone,
    address: a.address,
    identification: a.identification || undefined,
    housingType: a.housingType,
    hasFencedYard: a.hasFencedYard,
    landlordApproval: a.landlordApproval || undefined,
    currentPets: a.currentPets,
    currentPetDetails: a.currentPetDetails || undefined,
    householdExperience: a.householdExperience,
    vetClinic: a.vetClinic || undefined,
    dailyAloneHours: a.dailyAloneHours || undefined,
    applicantNotes: a.applicantNotes || undefined,
    status: a.status as ApplicationStatus,
    adminReviewNotes: a.adminReviewNotes || undefined,
    interviewAt: toIsoStringOrNull(a.interviewAt),
    interviewLocation: a.interviewLocation || null,
    interviewMeetingType: a.interviewMeetingType || null,
    homeVisitAt: toIsoStringOrNull(a.homeVisitAt),
    createdAt: toDayString(a.createdAt),
    updatedAt: toDayString(a.updatedAt),
  };
}

/**
 * Lists every application, newest first.
 *
 * **An empty table is an answer, not an outage.** A shelter with no applications
 * yet, or one that has deleted them all, gets `[]`; the `applications.json`
 * fixtures are reached only when the query throws or no database is configured.
 * Serving them after an empty read would put demo applicants on the staff
 * board. Pinned by `tests/integration/emptyReadersAreAnswers.test.ts` (#65).
 */
export async function getServerApplicationsAsync(): Promise<AdoptionApplicationRecord[]> {
  if (isDatabasePersistent()) {
    try {
      const dbApps = await prisma.adoptionApplication.findMany({
        orderBy: { createdAt: "desc" },
      });
      return dbApps.map((a) => mapDbApplicationToRecord(a as unknown as DbApplicationRecord));
    } catch (err) {
      handlePersistenceError("Prisma applications query", err, "read");
      return serverApplications;
    }
  }
  return serverApplications;
}

export function findServerApplicationById(id: string): AdoptionApplicationRecord | null {
  const norm = id.trim().toLowerCase();
  return serverApplications.find((a) => a.id.toLowerCase() === norm) || null;
}

/**
 * Reads one application from the database. Pure read: a successful fetch is
 * *returned*, never pushed into the mirror — cache coherence must not be a
 * side effect of a find.
 */
export async function findServerApplicationByIdAsync(id: string): Promise<AdoptionApplicationRecord | null> {
  if (isDatabasePersistent()) {
    try {
      const dbApp = await prisma.adoptionApplication.findUnique({ where: { id } });
      if (dbApp) return mapDbApplicationToRecord(dbApp as unknown as DbApplicationRecord);
    } catch (err) {
      handlePersistenceError("Prisma find application by id", err, "read");
      return findServerApplicationById(id); // DB unreachable: fall back to the mirror.
    }
  }
  return findServerApplicationById(id);
}

/**
 * Mirror lookup accepting either the public reference code or the raw id.
 * The reference code is tried first: it is the value an applicant is given and
 * the only one they are asked to quote, so it must not be shadowed by an id
 * that happens to collide with it.
 */
export function findServerApplicationByReference(reference: string): AdoptionApplicationRecord | null {
  const norm = reference.trim().toLowerCase();
  return (
    serverApplications.find((a) => (a.referenceCode || "").toLowerCase() === norm) ||
    serverApplications.find((a) => a.id.toLowerCase() === norm) ||
    null
  );
}

/**
 * Public tracking lookup. Accepts the reference code an applicant was issued,
 * and still accepts a bare application id so that every application submitted
 * before reference codes existed remains trackable.
 *
 * This resolves the applicant's *claim* only. It performs no authorization —
 * the caller must still match the record's email before returning anything, as
 * `lookupApplicationStatusAction` does.
 */
export async function findServerApplicationByReferenceAsync(
  reference: string
): Promise<AdoptionApplicationRecord | null> {
  const trimmed = reference.trim();

  if (isDatabasePersistent()) {
    try {
      const dbApp = await prisma.adoptionApplication.findFirst({
        where: { OR: [{ referenceCode: trimmed }, { id: trimmed }] },
      });
      if (dbApp) return mapDbApplicationToRecord(dbApp as unknown as DbApplicationRecord);
    } catch (err) {
      handlePersistenceError("Prisma find application by reference", err, "read");
      return findServerApplicationByReference(trimmed); // DB unreachable: fall back to the mirror.
    }
  }
  return findServerApplicationByReference(trimmed);
}

/**
 * Saves a new application: to the database when one is configured, then to the mirror.
 *
 * **A configured database that fails the insert fails the submission.** This used
 * to swallow the error outside strict mode and mirror the record anyway, so the
 * applicant was told `success: true` and given a reference code for a row that
 * existed only in this process's memory and was gone at the next restart. That
 * was #97: an outage, or a foreign-key miss (P2003) on a `petId` the `Pet` table
 * does not hold, both ended there. An application is a record someone is told
 * we have, so this throws {@link ApplicationWriteError} instead and the caller
 * asks them to try again. Unique violations and strict mode still rethrow the
 * raw error through `handlePersistenceError`, as before.
 *
 * P2003 is not retried with `petId: null` the way `recordSponsorshipPledge`
 * does. The caller has just read the animal from the database, so the miss
 * needs a hard delete inside that window; refusing it is clearer than an
 * application quietly detached from its animal.
 *
 * With no database configured the mirror is the whole store, as it was.
 */
export async function insertServerApplication(newApp: AdoptionApplicationRecord): Promise<void> {
  if (isDatabasePersistent()) {
    try {
      await prisma.adoptionApplication.create({
        data: {
          id: newApp.id,
          referenceCode: newApp.referenceCode || null,
          petId: newApp.petId,
          petName: newApp.petName,
          petBreed: newApp.petBreed || null,
          applicantName: newApp.applicantName,
          email: newApp.email,
          phone: newApp.phone,
          address: newApp.address,
          identification: newApp.identification || null,
          housingType: newApp.housingType,
          hasFencedYard: newApp.hasFencedYard,
          landlordApproval: newApp.landlordApproval || null,
          currentPets: newApp.currentPets,
          currentPetDetails: newApp.currentPetDetails || null,
          householdExperience: newApp.householdExperience,
          vetClinic: newApp.vetClinic || null,
          dailyAloneHours: newApp.dailyAloneHours || null,
          applicantNotes: newApp.applicantNotes || null,
          status: newApp.status,
          adminReviewNotes: newApp.adminReviewNotes || null,
        },
      });
    } catch (err) {
      // Unique violations and strict mode rethrow here — a duplicate submission must reach the
      // caller, not the mirror. Everything else is a lost application if it is swallowed.
      handlePersistenceError("Prisma application creation (refused, not mirrored)", err, "write");
      throw new ApplicationWriteError(err);
    }
  }

  serverApplications = [newApp, ...serverApplications.filter((a) => a.id !== newApp.id)];

  recordAuditLog({
    actorId: "public_user",
    actorEmail: newApp.email,
    actorRole: "PUBLIC",
    action: "APPLICATION_SUBMITTED",
    entity: "AdoptionApplication",
    entityId: newApp.id,
    details: { petId: newApp.petId, petName: newApp.petName, applicantName: newApp.applicantName },
  });
}

export interface ApplicationMilestoneInput {
  interviewAt?: string | null;
  interviewLocation?: string | null;
  interviewMeetingType?: string | null;
  homeVisitAt?: string | null;
}

/**
 * Records workflow milestones against an application.
 *
 * Separate from `atomicUpdateApplicationStatus` on purpose: a milestone is not
 * a status transition and must not be run through the FSM. Scheduling an
 * interview does not decide anything, so it has no legal-transition question to
 * answer and cannot be refused by the transition graph.
 *
 * Only the keys present are written; passing `null` clears a milestone.
 */
export async function recordApplicationMilestones(
  applicationId: string,
  milestones: ApplicationMilestoneInput
): Promise<boolean> {
  const data: Record<string, Date | string | null> = {};
  if ("interviewAt" in milestones) {
    data.interviewAt = milestones.interviewAt ? new Date(milestones.interviewAt) : null;
  }
  if ("interviewLocation" in milestones) data.interviewLocation = milestones.interviewLocation ?? null;
  if ("interviewMeetingType" in milestones) {
    data.interviewMeetingType = milestones.interviewMeetingType ?? null;
  }
  if ("homeVisitAt" in milestones) {
    data.homeVisitAt = milestones.homeVisitAt ? new Date(milestones.homeVisitAt) : null;
  }

  if (Object.keys(data).length === 0) return true;

  if (isDatabasePersistent()) {
    try {
      await prisma.adoptionApplication.update({ where: { id: applicationId }, data });
    } catch (err) {
      handlePersistenceError("Prisma application milestone update", err, "write");
      return false;
    }
  }

  serverApplications = serverApplications.map((a) =>
    a.id === applicationId ? { ...a, ...milestones } : a
  );

  return true;
}

/**
 * Atomic status update with FSM enforcement, a single ACID Prisma transaction,
 * and audit trail.
 *
 * The authoritative pre-state is read from the **database inside the
 * transaction** — never from the mirror — so two concurrent writers cannot both
 * validate against the same stale status and both "succeed". The transition
 * guard is enforced twice: once for a human-readable error, and once as a
 * conditional `updateMany` (`where status = oldStatus`) inside the transaction,
 * which races-loses return zero affected rows on.
 *
 * Failure semantics: if the transaction fails, the function returns
 * `{ success: false }` and touches *nothing* — no mirror mutation, no cascade,
 * no audit entry. The caller must never be told an approval succeeded while the
 * database says otherwise, and the auto-reject cascade must never run for a pet
 * the database did not actually mark Adopted.
 */
export async function atomicUpdateApplicationStatus(
  applicationId: string,
  targetStatus: ApplicationStatus,
  notes: string | undefined,
  actor: SessionUser
): Promise<{ success: boolean; error?: string }> {
  let appIndex = serverApplications.findIndex((a) => a.id === applicationId);
  if (appIndex === -1 && isDatabasePersistent()) {
    const fetched = await findServerApplicationByIdAsync(applicationId);
    if (fetched) {
      serverApplications = [fetched, ...serverApplications.filter((a) => a.id !== fetched.id)];
      appIndex = serverApplications.findIndex((a) => a.id === applicationId);
    }
  }

  const inMemoryApp = appIndex !== -1 ? serverApplications[appIndex] : null;
  if (!inMemoryApp && !isDatabasePersistent()) {
    return { success: false, error: "Application not found" };
  }

  // With a database, the transaction below validates against the row it reads. This
  // instance's mirror may be stale (another instance moved the application on), and
  // checking it first refused transitions the database would allow.
  if (inMemoryApp && !isDatabasePersistent()) {
    try {
      validateApplicationTransition(inMemoryApp.status, targetStatus);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid status transition";
      return { success: false, error: msg };
    }
  }

  const today = toDayString(new Date());
  let currentDbApp: DbApplicationRecord | null = null;
  // Whether this write is the one that approves the application. An approval's
  // consequences, the animal marked adopted and every other open application for it
  // closed, belong to that transition alone: they used to run on any write naming
  // APPROVED, so saving new notes on an application approved long ago adopted an animal
  // returned since and rejected whoever had applied for it in the meantime. Decided from
  // the database's pre-state when there is a database, as the transition guard is.
  let becomesApproved = targetStatus === "APPROVED" && inMemoryApp?.status !== "APPROVED";

  if (isDatabasePersistent()) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.adoptionApplication.findUnique({
          where: { id: applicationId },
        });
        if (!current) throw new Error("Application not found");

        currentDbApp = current as unknown as DbApplicationRecord;

        const oldStatus = current.status as ApplicationStatus;
        validateApplicationTransition(oldStatus, targetStatus);

        const updated = await tx.adoptionApplication.updateMany({
          where: { id: applicationId, status: oldStatus },
          data: {
            status: targetStatus,
            adminReviewNotes: notes !== undefined ? notes : current.adminReviewNotes,
            updatedAt: new Date(),
          },
        });
        if (updated.count === 0) {
          throw new TransitionError(
            "Application was modified concurrently; reload and retry"
          );
        }

        becomesApproved = targetStatus === "APPROVED" && oldStatus !== "APPROVED";
        if (becomesApproved && current.petId) {
          await tx.pet.updateMany({
            where: { id: current.petId },
            data: { status: "Adopted" },
          });

          await tx.adoptionApplication.updateMany({
            where: {
              petId: current.petId,
              id: { not: applicationId },
              status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
            },
            data: {
              status: "REJECTED",
              adminReviewNotes: `Automatically closed: ${current.petName} was adopted by an approved applicant on ${today}.`,
            },
          });
        }
      });
    } catch (err) {
      if (err instanceof TransitionError) {
        return { success: false, error: err.message };
      }
      handlePersistenceError("Prisma application status transaction", err, "write");
      return { success: false, error: err instanceof Error ? err.message : "Persistence failed" };
    }
  }

  // Synchronize the in-memory mirror cache after the transaction commits.
  // If appIndex was -1 (record existed in DB but wasn't in cache), reconstruct it from the DB read.
  if (appIndex === -1 && currentDbApp) {
    const freshRecord = mapDbApplicationToRecord(currentDbApp);
    serverApplications = [freshRecord, ...serverApplications.filter((a) => a.id !== applicationId)];
    appIndex = serverApplications.findIndex((a) => a.id === applicationId);
  }

  if (appIndex === -1) {
    return { success: false, error: "Application not found" };
  }

  const currentApp = serverApplications[appIndex];
  const oldStatus = currentApp.status;

  if (becomesApproved) {
    const adoptedPet = markCachedPetAdopted(currentApp.petId ?? "", currentApp.petName);
    if (adoptedPet) {
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "PET_STATUS_TRANSITION_ADOPTED",
        entity: "Pet",
        entityId: adoptedPet.id,
        details: { adoptionApplicationId: applicationId, applicant: currentApp.applicantName },
      });
    }

    serverApplications = serverApplications.map((otherApp) => {
      if (
        otherApp.id !== applicationId &&
        (otherApp.petId === currentApp.petId ||
          otherApp.petName.toLowerCase() === currentApp.petName.toLowerCase()) &&
        (otherApp.status === "SUBMITTED" || otherApp.status === "UNDER_REVIEW")
      ) {
        recordAuditLog({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "APPLICATION_AUTO_REJECTED_DUE_TO_ADOPTION",
          entity: "AdoptionApplication",
          entityId: otherApp.id,
          details: { approvedApplicationId: applicationId, petId: currentApp.petId },
        });
        return {
          ...otherApp,
          status: "REJECTED" as ApplicationStatus,
          adminReviewNotes: `Automatically closed: ${currentApp.petName} was adopted by an approved applicant on ${today}.`,
          updatedAt: today,
        };
      }
      return otherApp;
    });
  }

  serverApplications = serverApplications.map((a) =>
    a.id === applicationId
      ? {
          ...a,
          status: targetStatus,
          adminReviewNotes: notes !== undefined ? notes : a.adminReviewNotes,
          updatedAt: today,
        }
      : a
  );

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: `APPLICATION_STATUS_${targetStatus}`,
    entity: "AdoptionApplication",
    entityId: applicationId,
    details: { before: oldStatus, after: targetStatus, notes },
  });

  return { success: true };
}

export async function deleteServerApplication(id: string, actor: SessionUser): Promise<boolean> {
  let removed: AdoptionApplicationRecord | undefined = serverApplications.find((a) => a.id === id);

  if (isDatabasePersistent()) {
    try {
      if (!removed) {
        const dbApp = await prisma.adoptionApplication.findUnique({ where: { id } });
        removed = dbApp ? mapDbApplicationToRecord(dbApp as unknown as DbApplicationRecord) : undefined;
      }
      if (!removed) return false;

      await prisma.adoptionApplication.delete({ where: { id } });
    } catch (err) {
      handlePersistenceError("Prisma application delete", err, "write");
      return false;
    }
  } else if (!removed) {
    return false;
  }

  serverApplications = serverApplications.filter((a) => a.id !== id);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "APPLICATION_DELETED",
    entity: "AdoptionApplication",
    entityId: id,
    details: { applicantName: removed.applicantName, petName: removed.petName },
  });

  return true;
}