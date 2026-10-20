import { describe, it, expect } from "vitest";
import initialFaqs from "@/data/faqs.json";
import {
  faqItemSchema,
  faqFilterSchema,
  faqCategorySchema,
  FAQ_CATEGORIES,
} from "@/lib/validations/faq";
import {
  getFaqsAction,
  fetchFaqsAction,
  getFaqByIdAction,
} from "@/actions/faqs";
import {
  getServerFaqs,
  getServerFaqsAsync,
  findServerFaqById,
  getServerFaqCategories,
  toFaqItem,
} from "@/lib/server/faqRepository";
import { faqMatchesQuery, planFaqRenumber, sortFaqRecords } from "@/lib/domain/faq";
import { FaqRecord } from "@/types/faq";

/** Derived from the fixture so adding content does not break these tests. */
const TOTAL = initialFaqs.length;
const countIn = (category: string) =>
  initialFaqs.filter((f) => f.category === category).length;
const CATEGORIES_PRESENT = FAQ_CATEGORIES.filter((c) => countIn(c) > 0);

describe("FAQ Data Layer & Server Actions", () => {
  describe("Fixture & Schema Validation", () => {
    it("should export defined FAQ category enum constants", () => {
      expect(FAQ_CATEGORIES.length).toBeGreaterThan(0);
      expect(faqCategorySchema.safeParse("tnrm").success).toBe(true);
      expect(faqCategorySchema.safeParse("invalid").success).toBe(false);
    });

    it("should load all 8 committed FAQ fixtures", () => {
      expect(initialFaqs).toBeDefined();
      // A floor rather than an equality: the fixture grows as staff questions
      // accumulate, and pinning the exact number turns every content addition
      // into a test failure.
      expect(initialFaqs.length).toBeGreaterThanOrEqual(8);
    });

    it("should validate all 8 fixture records against faqItemSchema", () => {
      for (const faq of initialFaqs) {
        const result = faqItemSchema.safeParse(faq);
        expect(result.success, `Failed to parse FAQ ${faq.id}: ${JSON.stringify(result)}`).toBe(true);
      }
    });

    it("should reject invalid categories", () => {
      const invalidFaq = {
        ...initialFaqs[0],
        category: "invalid_category",
      };
      const result = faqItemSchema.safeParse(invalidFaq);
      expect(result.success).toBe(false);
    });

    it("should reject missing bilingual fields", () => {
      const invalidFaq = {
        ...initialFaqs[0],
        questionMs: "",
      };
      const result = faqItemSchema.safeParse(invalidFaq);
      expect(result.success).toBe(false);
    });

    it("should parse valid filter input", () => {
      expect(faqFilterSchema.safeParse({ category: "tnrm" }).success).toBe(true);
      expect(faqFilterSchema.safeParse({ category: "all" }).success).toBe(true);
      expect(faqFilterSchema.safeParse({}).success).toBe(true);
      expect(faqFilterSchema.safeParse(undefined).success).toBe(true);
    });
  });

  describe("Bilingual Integrity", () => {
    it("should have non-empty English and Malay text for every FAQ item", () => {
      for (const faq of initialFaqs) {
        expect(faq.question.trim().length).toBeGreaterThan(0);
        expect(faq.questionMs.trim().length).toBeGreaterThan(0);
        expect(faq.answer.trim().length).toBeGreaterThan(0);
        expect(faq.answerMs.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("Category Distribution", () => {
    it("populates every category in the vocabulary", () => {
      // A tab strip is built from the categories the data populates, so an
      // unused category is a label nobody can ever reach.
      for (const category of FAQ_CATEGORIES) {
        expect(countIn(category), `no fixture entry for "${category}"`).toBeGreaterThan(0);
      }
    });

    it("uses only categories the vocabulary declares", () => {
      for (const faq of initialFaqs) {
        expect(faqCategorySchema.safeParse(faq.category).success).toBe(true);
      }
    });

    it("numbers each category contiguously from zero", () => {
      // displayOrder is per-category, and the reorder planner renumbers from 0.
      // Gaps or ties in the committed fixture would surface as a list that
      // reshuffles the first time anyone presses an arrow.
      for (const category of FAQ_CATEGORIES) {
        const orders = initialFaqs
          .filter((f) => f.category === category)
          .map((f) => f.displayOrder)
          .sort((a, b) => a - b);
        expect(orders, `${category} ordering`).toEqual(orders.map((_, i) => i));
      }
    });
  });

  describe("Store Reader Functions (L-B2)", () => {
    it("should return all FAQs when no category filter is passed", async () => {
      const faqs = await getServerFaqsAsync();
      expect(faqs.length).toBe(TOTAL);
    });

    it("should return all FAQs when category is 'all'", async () => {
      const faqs = await getServerFaqsAsync("all");
      expect(faqs.length).toBe(TOTAL);
    });

    it("should filter FAQs by category (tnrm)", async () => {
      const tnrmFaqs = await getServerFaqsAsync("tnrm");
      expect(tnrmFaqs.length).toBe(countIn("tnrm"));
      expect(tnrmFaqs.every((f) => f.category === "tnrm")).toBe(true);
    });

    it("should filter FAQs case-insensitively ('TNRM' -> 'tnrm')", async () => {
      const tnrmFaqs = await getServerFaqsAsync("TNRM");
      expect(tnrmFaqs.length).toBe(countIn("tnrm"));
      expect(tnrmFaqs.every((f) => f.category === "tnrm")).toBe(true);
    });

    it("should return empty array for non-existent category", async () => {
      const empty = await getServerFaqsAsync("nonexistent");
      expect(empty).toEqual([]);
    });

    it("should find an item by id", () => {
      const item = findServerFaqById("faq-001");
      expect(item).toBeDefined();
      expect(item?.id).toBe("faq-001");
      expect(item?.question).toContain("What is TNRM");
    });

    it("should return null when searching for an unknown id", () => {
      const item = findServerFaqById("faq-99999");
      expect(item).toBeNull();
    });

    it("should extract distinct categories with labels via getServerFaqCategories", () => {
      const categories = getServerFaqCategories();
      // Ordered by the vocabulary itself, not by first appearance, so the tab
      // strip does not reshuffle when staff reorder or unpublish entries.
      expect(categories.map((c) => c.category)).toEqual(CATEGORIES_PRESENT);
      expect(categories[0].labelEn).toBe("TNRM & Coexistence");
      expect(categories[0].labelMs).toBe("TNRM & Kewujudan Bersama");
    });

    it("should support synchronous store reads via getServerFaqs", () => {
      const faqs = getServerFaqs();
      expect(faqs.length).toBe(TOTAL);
      const sponsorship = getServerFaqs("sponsorship");
      expect(sponsorship.length).toBe(countIn("sponsorship"));
    });
  });

  describe("Server Actions (L-B8)", () => {
    it("should return all FAQs successfully via getFaqsAction", async () => {
      const res = await getFaqsAction();
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.length).toBe(TOTAL);
      expect(res.error).toBeUndefined();
    });

    it("should filter by category in getFaqsAction", async () => {
      const res = await getFaqsAction("sponsorship");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(countIn("sponsorship"));
      expect(res.data?.every((f) => f.category === "sponsorship")).toBe(true);
    });

    it("should support alias fetchFaqsAction", async () => {
      const res = await fetchFaqsAction("visiting");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(countIn("visiting"));
      expect(res.data?.every((f) => f.category === "visiting")).toBe(true);
    });

    it("should accept object filter with category and search query in getFaqsAction", async () => {
      const res = await getFaqsAction({ category: "tnrm", search: "Vacuum Effect" });
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].id).toBe("faq-001");
    });

    it("should search across Malay terms in getFaqsAction", async () => {
      const res = await getFaqsAction({ search: "Telinga" });
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(3);
      expect(res.data?.map((f) => f.id)).toEqual(["faq-001", "faq-002", "faq-003"]);
    });

    it("should treat whitespace category as all items", async () => {
      const res = await getFaqsAction("   ");
      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(TOTAL);
    });

    it("should retrieve single item via getFaqByIdAction", async () => {
      const res = await getFaqByIdAction("faq-004");
      expect(res.success).toBe(true);
      expect(res.data?.id).toBe("faq-004");
      expect(res.data?.question).toContain("personal animal sponsorship");
    });

    it("should return error when item is not found in getFaqByIdAction", async () => {
      const res = await getFaqByIdAction("faq-nonexistent");
      expect(res.success).toBe(false);
      expect(res.error).toBe("FAQ not found");
      expect(res.data).toBeUndefined();
    });

    it("should return error for invalid or empty ID in getFaqByIdAction", async () => {
      const res = await getFaqByIdAction("");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Valid FAQ ID is required");
    });
  });
});

/**
 * Pure ordering, search and reorder logic behind the FAQ page and its editor.
 * Kept in this file rather than a second faq*.test.ts, which would sit one
 * letter away from this one in the directory listing.
 */
describe("FAQ domain logic", () => {
  function record(over: Partial<FaqRecord> & { id: string }): FaqRecord {
    return {
      category: "general",
      question: "A question",
      answer: "An answer",
      questionMs: null,
      answerMs: null,
      displayOrder: 0,
      isPublished: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...over,
    };
  }

  describe("toFaqItem", () => {
    it("resolves the English copy into a missing Malay field", () => {
      const item = toFaqItem(record({ id: "a", question: "Where?", answer: "PJ." }));
      expect(item.questionMs).toBe("Where?");
      expect(item.answerMs).toBe("PJ.");
    });

    it("keeps a real translation", () => {
      const item = toFaqItem(
        record({ id: "b", questionMs: "Di mana?", answerMs: "Di PJ." })
      );
      expect(item.questionMs).toBe("Di mana?");
      expect(item.answerMs).toBe("Di PJ.");
    });

    it("treats a whitespace-only translation as missing", () => {
      const item = toFaqItem(
        record({ id: "c", question: "Q", answer: "A", questionMs: "   ", answerMs: "\n\t " })
      );
      expect(item.questionMs).toBe("Q");
      expect(item.answerMs).toBe("A");
    });

    it("resolves per field, so a half-translated entry keeps the Malay it has", () => {
      const item = toFaqItem(
        record({ id: "d", question: "Q", answer: "A", questionMs: "Soalan" })
      );
      expect(item.questionMs).toBe("Soalan");
      expect(item.answerMs).toBe("A");
    });
  });

  describe("sortFaqRecords", () => {
    it("orders by displayOrder", () => {
      const rows = [
        record({ id: "third", displayOrder: 5 }),
        record({ id: "first", displayOrder: 1 }),
        record({ id: "second", displayOrder: 3 }),
      ];
      expect(sortFaqRecords(rows).map((r) => r.id)).toEqual(["first", "second", "third"]);
    });

    it("breaks ties by code unit, not locale collation", () => {
      // The list is ordered on the server for the initial HTML and again in the
      // browser while filtering. localeCompare would order these by the
      // runtime's locale — under en-US "apple" sorts before "Zebra" — so the two
      // passes could disagree and desync the rendered list.
      const rows = [
        record({ id: "lower", displayOrder: 0, question: "apple?" }),
        record({ id: "upper", displayOrder: 0, question: "Zebra?" }),
      ];
      expect(sortFaqRecords(rows).map((r) => r.id)).toEqual(["upper", "lower"]);
    });

    it("does not mutate its input", () => {
      const rows = [record({ id: "z", displayOrder: 9 }), record({ id: "y", displayOrder: 1 })];
      const snapshot = rows.map((r) => r.id);
      sortFaqRecords(rows);
      expect(rows.map((r) => r.id)).toEqual(snapshot);
    });
  });

  describe("faqMatchesQuery", () => {
    const item = toFaqItem(
      record({
        id: "tnrm",
        question: "What is TNRM?",
        answer: "Trap-Neuter-Release-Manage keeps colonies stable.",
        questionMs: "Apakah itu TNRM?",
        answerMs: "Perangkap-Mandul-Lepas-Urus mengekalkan koloni.",
      })
    );

    it("matches an empty query", () => {
      expect(faqMatchesQuery(item, "")).toBe(true);
      expect(faqMatchesQuery(item, "   ")).toBe(true);
    });

    it("is case-insensitive and searches the answer body", () => {
      expect(faqMatchesQuery(item, "tNrM")).toBe(true);
      expect(faqMatchesQuery(item, "colonies")).toBe(true);
    });

    it("searches Malay fields even for an English reader", () => {
      expect(faqMatchesQuery(item, "koloni")).toBe(true);
    });

    it("requires every term, narrowing rather than widening", () => {
      expect(faqMatchesQuery(item, "TNRM colonies")).toBe(true);
      expect(faqMatchesQuery(item, "TNRM elephants")).toBe(false);
    });
  });

  describe("planFaqRenumber", () => {
    const siblings = [
      { id: "a", displayOrder: 0, question: "A" },
      { id: "b", displayOrder: 1, question: "B" },
      { id: "c", displayOrder: 2, question: "C" },
    ];

    const apply = (
      rows: { id: string; displayOrder: number; question: string }[],
      updates: { id: string; displayOrder: number }[] | null
    ) =>
      rows
        .map((r) => ({ ...r, displayOrder: updates?.find((u) => u.id === r.id)?.displayOrder ?? r.displayOrder }))
        .sort((x, y) => x.displayOrder - y.displayOrder || (x.question < y.question ? -1 : 1))
        .map((r) => r.id);

    it("moves an entry above and below its neighbour", () => {
      expect(apply(siblings, planFaqRenumber(siblings, "b", "up"))).toEqual(["b", "a", "c"]);
      expect(apply(siblings, planFaqRenumber(siblings, "b", "down"))).toEqual(["a", "c", "b"]);
    });

    it("returns null at either boundary and for an unknown id", () => {
      expect(planFaqRenumber(siblings, "a", "up")).toBeNull();
      expect(planFaqRenumber(siblings, "c", "down")).toBeNull();
      expect(planFaqRenumber(siblings, "nope", "up")).toBeNull();
    });

    it("never produces a negative displayOrder when two entries are tied", () => {
      // Regression: swapping with a "nudge" wrote neighbour - 1, so two entries
      // at 0 produced -1, which faqFormSchema rejects — locking that row out of
      // the edit dialog permanently.
      const tied = [
        { id: "first", displayOrder: 0, question: "Alpha" },
        { id: "second", displayOrder: 0, question: "Bravo" },
      ];
      const updates = planFaqRenumber(tied, "second", "up");
      expect(updates).not.toBeNull();
      for (const u of updates!) expect(u.displayOrder).toBeGreaterThanOrEqual(0);
      expect(apply(tied, updates)).toEqual(["second", "first"]);
    });

    it("renumbers contiguously, healing gaps and ties", () => {
      const messy = [
        { id: "x", displayOrder: 0, question: "X" },
        { id: "y", displayOrder: 0, question: "Y" },
        { id: "z", displayOrder: 97, question: "Z" },
      ];
      const updates = planFaqRenumber(messy, "z", "up");
      const orders = messy.map(
        (r) => updates?.find((u) => u.id === r.id)?.displayOrder ?? r.displayOrder
      );
      expect([...orders].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    });
  });
});
