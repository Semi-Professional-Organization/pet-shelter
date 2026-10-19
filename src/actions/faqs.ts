"use server";

import { revalidatePath } from "next/cache";

import { FaqItem, FaqRecord } from "@/types/faq";
import {
  faqFilterSchema,
  faqFormSchema,
  FaqFilterInput,
  FaqFormInput,
} from "@/lib/validations/faq";
import type { SessionUser } from "@/lib/security/session";
import { requirePermission } from "@/lib/security/dal";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  deleteServerFaq,
  findServerFaqById,
  getServerFaqsAsync,
  insertServerFaq,
  reorderServerFaq,
  setServerFaqPublished,
  updateServerFaq,
} from "@/lib/server/faqRepository";

/**
 * Every export here becomes a POST endpoint on each route that imports this
 * module, reachable without a session. `PetsFaqSection` calls `getFaqsAction`
 * for its tab filtering, so the public /pets page hosts these; check with
 * `.next/server/server-reference-manifest.json` after changing an importer.
 *
 * The reads below are safe to leave unauthenticated because they return only
 * published rows — exactly what those pages already render to anonymous
 * visitors. Everything that could see a draft or change a row calls
 * `requireFaqEditor()` first.
 */
async function requireFaqEditor(): Promise<SessionUser> {
  // The DAL, not the raw cookie: a suspended or deleted editor's unexpired cookie still
  // verifies its signature, and only the DAL re-reads status.
  //
  // MANAGE_CONTENT, the capability the FAQ tab, the bulletin and transparency editors and
  // the Content Editor's role description all name. This was a role list,
  // `[ADMIN, COORDINATOR]`, written before CONTENT_EDITOR existed, so the one role
  // described as managing FAQs was refused here while a Volunteer Coordinator, offered
  // no FAQ tab, was admitted (tasks/decisions/2026-10-19-faq-editing-is-manage-content.md).
  return requirePermission(PERMISSIONS.MANAGE_CONTENT);
}

/** Refreshes every surface that renders FAQ content. */
function revalidateFaqSurfaces(): void {
  try {
    revalidatePath("/faq");
    revalidatePath("/admin/faqs");
    revalidatePath("/pets");
  } catch {
    // Ignored outside a Next.js request context (e.g. unit tests).
  }
}

/* ----------------------------------------------------------------- public - */

/**
 * Server Action: retrieves published FAQs with optional category/search
 * filtering. Deliberately unauthenticated — see the note on
 * `requireFaqEditor`.
 */
export async function getFaqsAction(
  filterInput?: string | FaqFilterInput
): Promise<{ success: boolean; data?: FaqItem[]; error?: string }> {
  try {
    const rawFilter = typeof filterInput === "string" ? { category: filterInput } : filterInput;
    const validated = faqFilterSchema.parse(rawFilter);
    const faqs = await getServerFaqsAsync(validated);
    return { success: true, data: faqs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch FAQs";
    return { success: false, error: msg };
  }
}

/** Alias for getFaqsAction. */
export async function fetchFaqsAction(
  filterInput?: string | FaqFilterInput
): Promise<{ success: boolean; data?: FaqItem[]; error?: string }> {
  return getFaqsAction(filterInput);
}

/** Server Action: retrieves a single published FAQ by id. */
export async function getFaqByIdAction(
  id: string
): Promise<{ success: boolean; data?: FaqItem; error?: string }> {
  try {
    if (!id || typeof id !== "string" || id.trim() === "") {
      return { success: false, error: "Valid FAQ ID is required" };
    }
    const faq = findServerFaqById(id);
    if (!faq) {
      return { success: false, error: "FAQ not found" };
    }
    return { success: true, data: faq };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch FAQ";
    return { success: false, error: msg };
  }
}

/* ------------------------------------------------------------------ admin - */

// There is deliberately no `getAdminFaqsAction`. The editor page is a Server
// Component and reads drafts straight from the repository, so exporting one
// here would publish a POST endpoint that returns unpublished rows and that
// nothing calls — attack surface for no benefit. Adding one later means adding
// `requireFaqEditor()` OUTSIDE the try/catch, so the refusal propagates instead
// of the catch answering an unauthorised caller with data.

export async function createFaqAction(
  data: FaqFormInput
): Promise<{ success: boolean; data?: FaqRecord; error?: string }> {
  try {
    const actor = await requireFaqEditor();
    const validated = faqFormSchema.parse(data);
    const record = await insertServerFaq(validated, actor);
    revalidateFaqSurfaces();
    return { success: true, data: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create FAQ entry";
    return { success: false, error: msg };
  }
}

export async function updateFaqAction(
  id: string,
  data: FaqFormInput
): Promise<{ success: boolean; data?: FaqRecord; error?: string }> {
  try {
    const actor = await requireFaqEditor();
    const validated = faqFormSchema.parse(data);
    const record = await updateServerFaq(id, validated, actor);
    if (!record) return { success: false, error: "FAQ entry not found" };
    revalidateFaqSurfaces();
    return { success: true, data: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update FAQ entry";
    return { success: false, error: msg };
  }
}

export async function toggleFaqPublishedAction(
  id: string,
  isPublished: boolean
): Promise<{ success: boolean; data?: FaqRecord; error?: string }> {
  try {
    const actor = await requireFaqEditor();
    const record = await setServerFaqPublished(id, isPublished, actor);
    if (!record) return { success: false, error: "FAQ entry not found" };
    revalidateFaqSurfaces();
    return { success: true, data: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to change FAQ visibility";
    return { success: false, error: msg };
  }
}

export async function reorderFaqAction(
  id: string,
  direction: "up" | "down"
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireFaqEditor();
    const outcome = await reorderServerFaq(id, direction, actor);
    if (outcome === "not-found") return { success: false, error: "FAQ entry not found" };
    // "at-boundary" is a no-op, not a failure: the arrow is disabled in the UI,
    // but a concurrent reorder can make it true between render and click.
    if (outcome === "moved") revalidateFaqSurfaces();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reorder FAQ entry";
    return { success: false, error: msg };
  }
}

export async function deleteFaqAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireFaqEditor();
    const removed = await deleteServerFaq(id, actor);
    if (!removed) return { success: false, error: "FAQ entry not found" };
    revalidateFaqSurfaces();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete FAQ entry";
    return { success: false, error: msg };
  }
}
