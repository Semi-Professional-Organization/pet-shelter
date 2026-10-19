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
 * Test-only. The global `beforeEach` in `tests/setup/nextMocks.ts` no longer
 * calls this: each of the six stores registers its own reset with
 * `@/lib/stateResets`, so a test file resets only the stores it loaded. This
 * stays for suites that restore all six by hand in the middle of a test.
 */
export function resetServerStore(): void {
  resetPets();
  resetApplications();
  resetRehabNeeds();
  resetFaqs();
  resetBulletins();
  resetSettings();
}
