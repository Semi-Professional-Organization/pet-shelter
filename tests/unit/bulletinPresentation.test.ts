import { describe, it, expect } from "vitest";

import { BULLETIN_CATEGORY_PRESENTATION } from "@/lib/presentation/bulletinPresentation";
import { getTranslation } from "@/lib/i18n/translations";

describe("BULLETIN_CATEGORY_PRESENTATION", () => {
  // Each category carries two English names: `label`, which the admin editor
  // shows, and `labelKey`, whose English the public feed shows. One table keeps
  // the *set* of categories in step; nothing kept the *strings* in step, so a
  // copy edit to one would give staff and visitors different names for the same
  // category. This pins them equal.
  it.each(Object.entries(BULLETIN_CATEGORY_PRESENTATION))(
    "gives %s the same English name in the admin editor and the public feed",
    (_category, { label, labelKey }) => {
      expect(getTranslation("en", labelKey)).toBe(label);
    },
  );

  it("gives every category a Malay label that is not the English one", () => {
    for (const { label, labelKey } of Object.values(BULLETIN_CATEGORY_PRESENTATION)) {
      const ms = getTranslation("ms", labelKey);
      // A key missing from `ms` falls back to `en`, and a missing key entirely
      // returns the path itself — both would pass a presence check.
      expect(ms).not.toBe(label);
      expect(ms).not.toBe(labelKey);
    }
  });
});
