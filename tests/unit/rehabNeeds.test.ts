import { describe, it, expect } from "vitest";
import initialRehabNeeds from "@/data/rehabNeeds.json";
import {
  rehabNeedSchema,
  rehabFilterSchema,
  rehabNeedCategorySchema,
  REHAB_NEED_CATEGORIES,
} from "@/lib/validations/rehab";
import {
  getRehabNeedsAction,
  fetchRehabNeedsAction,
  getRehabNeedByIdAction,
} from "@/actions/rehabNeeds";
import {
  getServerRehabNeeds,
  getServerRehabNeedsAsync,
  findServerRehabNeedById,
  getServerRehabCategories,
} from "@/lib/server/rehabNeedsCatalog";

describe("Rehabilitation Needs Data Layer & Server Actions", () => {
  describe("Fixture & Schema Validation", () => {
    it("should export defined category enum constants", () => {
      expect(REHAB_NEED_CATEGORIES.length).toBeGreaterThan(0);
      expect(rehabNeedCategorySchema.safeParse("URGENT").success).toBe(true);
      expect(rehabNeedCategorySchema.safeParse("INVALID").success).toBe(false);
    });

    it("should load all 11 committed rehabilitation needs fixtures", () => {
      expect(initialRehabNeeds).toBeDefined();
      expect(initialRehabNeeds.length).toBe(11);
    });

    it("should validate all 11 fixture records against rehabNeedSchema", () => {
      for (const need of initialRehabNeeds) {
        const result = rehabNeedSchema.safeParse(need);
        expect(result.success, `Failed to parse need ${need.id}: ${JSON.stringify(result)}`).toBe(true);
      }
    });

    it("should reject invalid categories", () => {
      const invalidNeed = {
        ...initialRehabNeeds[0],
        category: "INVALID_CATEGORY",
      };
      const result = rehabNeedSchema.safeParse(invalidNeed);
      expect(result.success).toBe(false);
    });

    it("should reject negative estimatedCostMYR", () => {
      const invalidNeed = {
        ...initialRehabNeeds[0],
        estimatedCostMYR: -50,
      };
      const result = rehabNeedSchema.safeParse(invalidNeed);
      expect(result.success).toBe(false);
    });

    it("should reject missing required bilingual fields", () => {
      const invalidNeed = {
        ...initialRehabNeeds[0],
        nameMs: "",
      };
      const result = rehabNeedSchema.safeParse(invalidNeed);
      expect(result.success).toBe(false);
    });

    it("should parse valid filter input", () => {
      expect(rehabFilterSchema.safeParse({ category: "URGENT" }).success).toBe(true);
      expect(rehabFilterSchema.safeParse({ category: "all" }).success).toBe(true);
      expect(rehabFilterSchema.safeParse({}).success).toBe(true);
      expect(rehabFilterSchema.safeParse(undefined).success).toBe(true);
    });
  });

  describe("Bilingual Integrity", () => {
    it("should have non-empty English and Malay text for every need item", () => {
      for (const need of initialRehabNeeds) {
        expect(need.name.trim().length).toBeGreaterThan(0);
        expect(need.nameMs.trim().length).toBeGreaterThan(0);
        expect(need.description.trim().length).toBeGreaterThan(0);
        expect(need.descriptionMs.trim().length).toBeGreaterThan(0);
        expect(need.quantityNeeded.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("Category Distribution", () => {
    it("should span all 4 primary shelter operational categories", () => {
      const categories = initialRehabNeeds.map((n) => n.category);
      expect(categories).toContain("URGENT");
      expect(categories).toContain("REGULAR");
      expect(categories).toContain("LONG_TERM");
      expect(categories).toContain("TNRM_EQUIPMENT");

      const urgentCount = categories.filter((c) => c === "URGENT").length;
      const regularCount = categories.filter((c) => c === "REGULAR").length;
      const longTermCount = categories.filter((c) => c === "LONG_TERM").length;
      const tnrmCount = categories.filter((c) => c === "TNRM_EQUIPMENT").length;

      expect(urgentCount).toBe(3);
      expect(regularCount).toBe(3);
      expect(longTermCount).toBe(2);
      expect(tnrmCount).toBe(3);
    });
  });

  describe("Store Reader Functions (L-B2)", () => {
    it("should return all needs when no category filter is passed", async () => {
      const needs = await getServerRehabNeedsAsync();
      expect(needs.length).toBe(11);
    });

    it("should return all needs when category is 'all'", async () => {
      const needs = await getServerRehabNeedsAsync("all");
      expect(needs.length).toBe(11);
    });

    it("should filter needs by category (URGENT)", async () => {
      const urgentNeeds = await getServerRehabNeedsAsync("URGENT");
      expect(urgentNeeds.length).toBe(3);
      expect(urgentNeeds.every((n) => n.category === "URGENT")).toBe(true);
    });

    it("should filter needs case-insensitively ('urgent' -> 'URGENT')", async () => {
      const urgentNeeds = await getServerRehabNeedsAsync("urgent");
      expect(urgentNeeds.length).toBe(3);
      expect(urgentNeeds.every((n) => n.category === "URGENT")).toBe(true);
    });

    it("should return empty array for non-existent category", async () => {
      const empty = await getServerRehabNeedsAsync("NONEXISTENT");
      expect(empty).toEqual([]);
    });

    it("should find an item by id", () => {
      const item = findServerRehabNeedById("need-001");
      expect(item).toBeDefined();
      expect(item?.id).toBe("need-001");
      expect(item?.name).toContain("Veterinary Recovery Wet Food");
    });

    it("should return null when searching for an unknown id", () => {
      const item = findServerRehabNeedById("need-99999");
      expect(item).toBeNull();
    });

    it("should extract distinct categories with labels via getServerRehabCategories", () => {
      const categories = getServerRehabCategories();
      expect(categories.length).toBe(4);
      expect(categories.map((c) => c.category)).toEqual([
        "URGENT",
        "REGULAR",
        "LONG_TERM",
        "TNRM_EQUIPMENT",
      ]);
      expect(categories[0].labelEn).toBe("Urgent Needs");
      expect(categories[0].labelMs).toBe("Keperluan Mendesak");
    });

    it("should support synchronous store reads via getServerRehabNeeds", () => {
      const needs = getServerRehabNeeds();
      expect(needs.length).toBe(11);
      const regular = getServerRehabNeeds("REGULAR");
      expect(regular.length).toBe(3);
    });
  });

  describe("Server Actions (L-B8)", () => {
    it("should return all needs successfully via getRehabNeedsAction", async () => {
      const res = await getRehabNeedsAction();
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.length).toBe(11);
      expect(res.error).toBeUndefined();
    });

    it("should filter by category in getRehabNeedsAction", async () => {
      const res = await getRehabNeedsAction("TNRM_EQUIPMENT");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(3);
      expect(res.data?.every((n) => n.category === "TNRM_EQUIPMENT")).toBe(true);
    });

    it("should support alias fetchRehabNeedsAction", async () => {
      const res = await fetchRehabNeedsAction("LONG_TERM");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(2);
      expect(res.data?.every((n) => n.category === "LONG_TERM")).toBe(true);
    });

    it("should accept object filter with category and search query in getRehabNeedsAction", async () => {
      const res = await getRehabNeedsAction({ category: "URGENT", search: "Disinfectant" });
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].id).toBe("need-002");
    });

    it("should search across Malay terms in getRehabNeedsAction", async () => {
      const res = await getRehabNeedsAction({ search: "Selimut" });
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(2);
      expect(res.data?.map((n) => n.id)).toEqual(["need-006", "need-008"]);
    });

    it("should treat whitespace category as all items", async () => {
      const res = await getRehabNeedsAction("   ");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(11);
    });

    it("should retrieve single item via getRehabNeedByIdAction", async () => {
      const res = await getRehabNeedByIdAction("need-003");
      expect(res.success).toBe(true);
      expect(res.data?.id).toBe("need-003");
      expect(res.data?.urgencyLevel).toBe("High");
    });

    it("should return error when item is not found in getRehabNeedByIdAction", async () => {
      const res = await getRehabNeedByIdAction("need-nonexistent");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Rehabilitation need not found");
      expect(res.data).toBeUndefined();
    });

    it("should return error for invalid or empty ID in getRehabNeedByIdAction", async () => {
      const res = await getRehabNeedByIdAction("");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Valid need ID is required");
    });
  });
});
