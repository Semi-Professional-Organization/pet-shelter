import { describe, it, expect } from "vitest";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { getServerRehabNeeds } from "@/lib/server/rehabNeedsCatalog";
import committedFaqs from "@/data/faqs.json";
import { getServerFaqs } from "@/lib/server/faqRepository";
import { getRehabNeedsAction } from "@/actions/rehabNeeds";
import { getFaqsAction } from "@/actions/faqs";

describe("Frontend TNRM Overhaul & UI Contracts", () => {
  describe("P5 Adoption Fee Suppression on Rehab Rescues", () => {
    it("should mark In Rehabilitation animals as isInRehabilitation=true and isAdoptable=false", () => {
      const rehabPresentation = getPetStatusPresentation("In Rehabilitation");
      expect(rehabPresentation.isInRehabilitation).toBe(true);
      expect(rehabPresentation.isAdoptable).toBe(false);
      expect(rehabPresentation.tone).toBe("rehabilitation");
    });

    it("should mark legacy Rehabilitation alias animals identically", () => {
      const aliasPresentation = getPetStatusPresentation("Rehabilitation");
      expect(aliasPresentation.isInRehabilitation).toBe(true);
      expect(aliasPresentation.isAdoptable).toBe(false);
      expect(aliasPresentation.tone).toBe("rehabilitation");
    });

    it("should mark Available animals as adoptable with no rehabilitation flag", () => {
      const availablePresentation = getPetStatusPresentation("Available");
      expect(availablePresentation.isInRehabilitation).toBe(false);
      expect(availablePresentation.isAdoptable).toBe(true);
      expect(availablePresentation.tone).toBe("available");
    });
  });

  describe("Wishlist Needs Data Layer (FE-07 / /needs)", () => {
    it("should retrieve all 11 items on initial load", () => {
      const allNeeds = getServerRehabNeeds();
      expect(allNeeds.length).toBe(11);
    });

    it("should support filtering across all 4 operational categories via Server Action", async () => {
      const urgentRes = await getRehabNeedsAction("URGENT");
      expect(urgentRes.success).toBe(true);
      expect(urgentRes.data?.length).toBe(3);
      expect(urgentRes.data?.every((i) => i.category === "URGENT")).toBe(true);

      const regularRes = await getRehabNeedsAction("REGULAR");
      expect(regularRes.success).toBe(true);
      expect(regularRes.data?.length).toBe(3);

      const longTermRes = await getRehabNeedsAction("LONG_TERM");
      expect(longTermRes.success).toBe(true);
      expect(longTermRes.data?.length).toBe(2);

      const tnrmEquipRes = await getRehabNeedsAction("TNRM_EQUIPMENT");
      expect(tnrmEquipRes.success).toBe(true);
      expect(tnrmEquipRes.data?.length).toBe(3);
    });

    it("should support search filtering across bilingual terms", async () => {
      const f10Res = await getRehabNeedsAction({ search: "F10" });
      expect(f10Res.success).toBe(true);
      expect(f10Res.data?.length).toBe(1);
      expect(f10Res.data?.[0].id).toBe("need-002");

      const trapRes = await getRehabNeedsAction({ search: "Perangkap" });
      expect(trapRes.success).toBe(true);
      expect(trapRes.data?.length).toBe(2);
      expect(trapRes.data?.map((i) => i.id)).toEqual(["need-009", "need-010"]);
    });
  });

  describe("Interactive FAQ Accordion Data Layer (FE-09 / FaqBrowser)", () => {
    it("should retrieve every committed FAQ", () => {
      // Counted from the fixture rather than restated: the FAQ set grows as
      // staff questions accumulate, and a hardcoded total turns every content
      // addition into a failure here.
      const allFaqs = getServerFaqs();
      expect(allFaqs.length).toBe(committedFaqs.length);
    });

    it("should support category filtering for TNRM, sponsorship, and visiting via Server Action", async () => {
      const countIn = (category: string) =>
        committedFaqs.filter((f) => f.category === category).length;

      for (const category of ["tnrm", "sponsorship", "visiting"] as const) {
        const res = await getFaqsAction(category);
        expect(res.success).toBe(true);
        expect(res.data?.length, category).toBe(countIn(category));
        expect(res.data?.every((f) => f.category === category)).toBe(true);
      }
    });
  });
});
