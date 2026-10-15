import { resetPets } from "./petRepository";
import { resetApplications } from "./applicationRepository";
import { resetRehabNeeds } from "./rehabNeedsCatalog";
import { resetFaqs } from "./faqRepository";
import { resetBulletins } from "./bulletinRepository";
import { resetSettings } from "./settingsRepository";

/**
 * Composition root for the in-memory fallback lifecycle.
 *
 * Each module owns its own cache and its own reset; this file is the single
 * place that knows all six exist. The dependency runs one way — this module
 * imports the repositories, never the reverse — so no repository can reach
 * another domain's cache through it.
 */

/**
 * Restores in-memory collections to the committed JSON fixtures and initial settings.
 *
 * Test-only, mirroring `resetUserStore()`. Wired into the global `beforeEach`
 * in `tests/setup/nextMocks.ts` so a mutation made by one test — an inserted
 * pet, an approved application, an archived record, a settings edit — cannot leak into the next
 * and make the suite order-dependent.
 */
export function resetServerStore(): void {
  resetPets();
  resetApplications();
  resetRehabNeeds();
  resetFaqs();
  resetBulletins();
  resetSettings();
}
