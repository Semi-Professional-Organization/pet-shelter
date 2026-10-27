import { SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError, isDatabasePersistent } from "@/lib/persistenceMode";
import { ShelterSettingsInput, ShelterSettingsOutput } from "@/lib/validations/settings";
import {
  DEFAULT_VOLUNTEER_FORM_URL,
  DEFAULT_VOLUNTEER_FORM_RESPONSES_URL,
} from "@/lib/volunteerFormUrl";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Shelter Settings persistence over the repository layer.
 *
 * Deterministic storage strategy:
 * - When DATABASE_URL is set / active: pure Prisma persistence with PostgreSQL.
 * - When offline / test mode: isolated in-memory fixture store for fast zero-dependency runs.
 */

const DEFAULT_SETTINGS_ID = "default-settings";

const INITIAL_SETTINGS: ShelterSettingsOutput = {
  shelterName: "Hope for Strays",
  email: "info@hopeforstrays.org",
  phone: SHELTER_PHONE_DISPLAY,
  address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia",
  operatingHours: "Tuesday – Sunday: 10:00 AM – 5:00 PM",
  announcementBanner: "Weekend Adoption Drive & Free Microchip Clinic this Saturday 9 AM – 1 PM at Petaling Jaya sanctuary!",
  adoptionFeeDog: "Free",
  adoptionFeeCat: "Free",
  duitNowQrUrl: "",
  tngQrUrl: "",
  bankQrUrl: "",
  paymentPayload: "",
  volunteerFormUrl: DEFAULT_VOLUNTEER_FORM_URL,
  volunteerFormResponsesUrl: DEFAULT_VOLUNTEER_FORM_RESPONSES_URL,
  resendApiKey: "",
  emailFrom: "Hope for Strays <onboarding@resend.dev>",
  shelterNotificationEmail: "fergeley@gmail.com",
  storageProvider: "local",
  s3Bucket: "",
  s3Region: "ap-southeast-1",
  s3CdnUrl: "",
  cloudinaryCloudName: "",
};

function freshSettings(): ShelterSettingsOutput {
  return structuredClone(INITIAL_SETTINGS);
}

let serverSettings: ShelterSettingsOutput = freshSettings();

/** Test-only. Registered below for the test harness. */
export function resetSettings(): void {
  serverSettings = freshSettings();
}

registerStateReset("settings", resetSettings);

/** Synchronous cached read. */
export function getServerSettings(): ShelterSettingsOutput {
  return serverSettings;
}

/**
 * Reads the shelter settings, falling back to the in-memory copy.
 *
 * **A missing settings row is answered from the in-memory copy, on purpose.**
 * That copy starts as the shipped defaults. This is the opposite of the pet and
 * application readers, and the reason is what an empty result means here: the
 * row is created by the first save in admin settings, so "no row" is a shelter
 * that has not saved settings yet, and the defaults are what it should see. A
 * thrown query is answered the same way; `getServerSettingsWithSource` reports
 * both as `fromDatabase: false` so the admin form never treats them as saved.
 * The copy is not always the defaults: `updateServerSettings` writes it even
 * when the upsert failed —
 * `tasks/open/a-failed-settings-save-is-served-as-saved.md`. Pinned by
 * `tests/integration/emptyReadersAreAnswers.test.ts` (#65).
 */
export async function getServerSettingsAsync(): Promise<ShelterSettingsOutput> {
  if (isDatabasePersistent()) {
    try {
      const row = await prisma.shelterSettings.findUnique({
        where: { id: DEFAULT_SETTINGS_ID },
      });

      if (row) {
        return {
          ...serverSettings,
          shelterName: row.shelterName,
          email: row.email,
          phone: row.phone,
          address: row.address,
          operatingHours: row.operatingHours,
          announcementBanner: row.announcementBanner ?? "",
          adoptionFeeDog: row.adoptionFeeDog,
          adoptionFeeCat: row.adoptionFeeCat,
          duitNowQrUrl: row.duitNowQrUrl ?? "",
          tngQrUrl: row.tngQrUrl ?? "",
          bankQrUrl: row.bankQrUrl ?? "",
          paymentPayload: row.paymentPayload ?? "",
          volunteerFormUrl: row.volunteerFormUrl,
          volunteerFormResponsesUrl: row.volunteerFormResponsesUrl,
        };
      }
    } catch (err) {
      handlePersistenceError("Prisma shelter settings query", err, "read");
      return serverSettings;
    }
  }

  return serverSettings;
}

/**
 * Updates settings in the database or the in-memory test store.
 */
export async function updateServerSettings(data: ShelterSettingsInput): Promise<ShelterSettingsOutput> {
  if (isDatabasePersistent()) {
    try {
      const updated = await prisma.shelterSettings.upsert({
        where: { id: DEFAULT_SETTINGS_ID },
        update: {
          shelterName: data.shelterName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          operatingHours: data.operatingHours,
          announcementBanner: data.announcementBanner || null,
          adoptionFeeDog: data.adoptionFeeDog,
          adoptionFeeCat: data.adoptionFeeCat,
          duitNowQrUrl: data.duitNowQrUrl?.trim() || null,
          tngQrUrl: data.tngQrUrl?.trim() || null,
          bankQrUrl: data.bankQrUrl?.trim() || null,
          paymentPayload: data.paymentPayload?.trim() || null,
          volunteerFormUrl: data.volunteerFormUrl ?? DEFAULT_VOLUNTEER_FORM_URL,
          volunteerFormResponsesUrl:
            data.volunteerFormResponsesUrl ?? DEFAULT_VOLUNTEER_FORM_RESPONSES_URL,
        },
        create: {
          id: DEFAULT_SETTINGS_ID,
          shelterName: data.shelterName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          operatingHours: data.operatingHours,
          announcementBanner: data.announcementBanner || null,
          adoptionFeeDog: data.adoptionFeeDog,
          adoptionFeeCat: data.adoptionFeeCat,
          duitNowQrUrl: data.duitNowQrUrl?.trim() || null,
          tngQrUrl: data.tngQrUrl?.trim() || null,
          bankQrUrl: data.bankQrUrl?.trim() || null,
          paymentPayload: data.paymentPayload?.trim() || null,
          volunteerFormUrl: data.volunteerFormUrl ?? DEFAULT_VOLUNTEER_FORM_URL,
          volunteerFormResponsesUrl:
            data.volunteerFormResponsesUrl ?? DEFAULT_VOLUNTEER_FORM_RESPONSES_URL,
        },
      });

      serverSettings = {
        ...serverSettings,
        ...data,
        shelterName: updated.shelterName,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        operatingHours: updated.operatingHours,
        announcementBanner: updated.announcementBanner ?? "",
        adoptionFeeDog: updated.adoptionFeeDog,
        adoptionFeeCat: updated.adoptionFeeCat,
        duitNowQrUrl: updated.duitNowQrUrl ?? "",
        tngQrUrl: updated.tngQrUrl ?? "",
        bankQrUrl: updated.bankQrUrl ?? "",
        paymentPayload: updated.paymentPayload ?? "",
      };
      return serverSettings;
    } catch (err) {
      handlePersistenceError("Prisma shelter settings update", err, "write");
    }
  }

  serverSettings = {
    ...serverSettings,
    ...data,
  };
  return serverSettings;
}

/**
 * Reads settings and reports whether they came from Postgres.
 *
 * The admin settings form seeds itself from a `localStorage`-backed store, so
 * it has to overwrite its local copy from the server or a second admin would
 * open the page with empty QR fields and blank the saved codes on save. It may
 * only do that when the values are authoritative: treating the in-memory
 * fallback as real would let a database outage replace live settings with
 * defaults.
 */
export async function getServerSettingsWithSource(): Promise<{
  settings: ShelterSettingsOutput;
  fromDatabase: boolean;
}> {
  if (!isDatabasePersistent()) {
    return { settings: serverSettings, fromDatabase: false };
  }

  try {
    const row = await prisma.shelterSettings.findUnique({
      where: { id: DEFAULT_SETTINGS_ID },
    });
    if (!row) return { settings: serverSettings, fromDatabase: false };
  } catch (err) {
    handlePersistenceError("Prisma shelter settings query", err, "read");
    return { settings: serverSettings, fromDatabase: false };
  }

  return { settings: await getServerSettingsAsync(), fromDatabase: true };
}
