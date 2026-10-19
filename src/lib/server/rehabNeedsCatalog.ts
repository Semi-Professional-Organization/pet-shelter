import initialRehabNeedsData from "@/data/rehabNeeds.json";
import { RehabNeed, RehabNeedCategory } from "@/types/rehab";
import { REHAB_CATEGORY_LABELS } from "@/lib/presentation/categoryTabs";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Rehabilitation-house wishlist reads.
 *
 * A *catalog*, not a repository: there is no `rehabNeed` Prisma model and no
 * write path. `src/data/rehabNeeds.json` is the authoritative source, so this
 * is the fixture half of the dual-layer store with no database half to fall
 * back from. Naming it a repository would imply a persistence layer that does
 * not exist. Give it one and this module becomes a repository for real.
 */

// Deep-cloned for the same reason as the pet cache — see `./petRepository`.
function freshRehabNeeds(): RehabNeed[] {
  return structuredClone(initialRehabNeedsData) as RehabNeed[];
}

let serverRehabNeeds: RehabNeed[] = freshRehabNeeds();

/** Test-only. Reached through `resetServerStore()` in `./fallbackState`. */
export function resetRehabNeeds(): void {
  serverRehabNeeds = freshRehabNeeds();
}

registerStateReset("rehabNeeds", resetRehabNeeds, 0);

export function getServerRehabNeeds(filters?: string | { category?: string; search?: string }): RehabNeed[] {
  let items = [...serverRehabNeeds];
  const category = typeof filters === "string" ? filters : filters?.category;
  const search = typeof filters === "object" ? filters?.search : undefined;

  const trimmedCat = typeof category === "string" ? category.trim() : undefined;
  if (trimmedCat && trimmedCat.toLowerCase() !== "all") {
    const norm = trimmedCat.toUpperCase();
    items = items.filter((item) => item.category.toUpperCase() === norm);
  }

  if (search && search.trim() !== "") {
    const q = search.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.nameMs.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.descriptionMs.toLowerCase().includes(q) ||
        (item.brand && item.brand.toLowerCase().includes(q))
    );
  }

  return items;
}

/**
 * Async face of `getServerRehabNeeds`, kept so callers read identically to the
 * pet and application paths. There is no awaited work behind it today.
 */
export async function getServerRehabNeedsAsync(
  filters?: string | { category?: string; search?: string }
): Promise<RehabNeed[]> {
  return getServerRehabNeeds(filters);
}

export function findServerRehabNeedById(id: string): RehabNeed | null {
  const norm = id.trim().toLowerCase();
  return serverRehabNeeds.find((n) => n.id.toLowerCase() === norm) || null;
}

/**
 * Distinct rehabilitation-need categories present in the dataset, in
 * first-appearance order, carrying both label languages.
 *
 * Labels come from `@/lib/presentation/categoryTabs` — see the note on
 * `getServerFaqCategories` for why they are not declared here.
 */
export function getServerRehabCategories(): {
  category: RehabNeedCategory;
  labelEn: string;
  labelMs: string;
}[] {
  const seen = new Set<string>();
  const categories: { category: RehabNeedCategory; labelEn: string; labelMs: string }[] = [];

  for (const item of serverRehabNeeds) {
    if (seen.has(item.category)) continue;
    seen.add(item.category);
    const def = REHAB_CATEGORY_LABELS[item.category];
    if (def) {
      categories.push({
        category: item.category,
        labelEn: def.labelEn,
        labelMs: def.labelMs,
      });
    }
  }

  return categories;
}
