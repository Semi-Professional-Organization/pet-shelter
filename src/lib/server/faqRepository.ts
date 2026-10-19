import type { FaqCategory as PrismaFaqCategory } from "@prisma/client";

import initialFaqsData from "@/data/faqs.json";
import { FaqCategory, FaqItem, FaqRecord } from "@/types/faq";
import { FAQ_CATEGORIES, FaqFormValues } from "@/lib/validations/faq";
import { FAQ_CATEGORY_LABELS } from "@/lib/presentation/categoryTabs";
import { filterFaqItems, planFaqRenumber, sortFaqRecords } from "@/lib/domain/faq";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError } from "@/lib/persistenceMode";
import { registerStateReset } from "@/lib/stateResets";

/**
 * FAQ reads and writes over the repository layer.
 *
 * Storage strategy matches `./petRepository`: Prisma when a database is
 * reachable, the committed `src/data/faqs.json` fixture when it is not, so the
 * public page still renders during an outage and the unit suite needs no
 * database. Unlike the pet path, an *empty* result is not treated as an
 * outage — see `getServerFaqsAsync`.
 *
 * This module is the only FAQ code permitted to touch Prisma
 * (docs/architecture/LAYERS.md, L-B2); `src/actions/faqs.ts` calls in here.
 */

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time proof that the four declarations of the category vocabulary
 * agree: the Prisma enum, the `FaqCategory` union, and the zod tuple. (The
 * fourth, `FAQ_CATEGORY_LABELS`, is a `Record<FaqCategory, …>` and so is
 * checked by the compiler already.)
 *
 * Adding a category to the schema without adding it to the union — or the
 * reverse — makes this line a type error rather than a category that reaches
 * production and renders as its own raw slug.
 */
export const FAQ_CATEGORY_VOCABULARY_IS_CONSISTENT: Exact<PrismaFaqCategory, FaqCategory> &
  Exact<(typeof FAQ_CATEGORIES)[number], FaqCategory> = true;

/** The fixture, typed. Its shape is asserted by tests/unit/faqs.test.ts. */
interface FaqFixtureRow {
  id: string;
  category: FaqCategory;
  question: string;
  questionMs: string;
  answer: string;
  answerMs: string;
  displayOrder: number;
  isPublished: boolean;
}

function freshFaqs(): FaqRecord[] {
  const epoch = new Date(0).toISOString();
  return (structuredClone(initialFaqsData) as FaqFixtureRow[]).map((row) => ({
    ...row,
    createdAt: epoch,
    updatedAt: epoch,
  }));
}

let serverFaqs: FaqRecord[] = freshFaqs();

/** Test-only. Reached through `resetServerStore()` in `./fallbackState`. */
export function resetFaqs(): void {
  serverFaqs = freshFaqs();
}

registerStateReset("faqs", resetFaqs, 0);

interface DbFaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  questionMs: string | null;
  answerMs: string | null;
  displayOrder: number;
  isPublished: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const toIso = (v: Date | string) => (typeof v === "string" ? v : new Date(v).toISOString());

function mapDbFaq(row: DbFaqRow): FaqRecord {
  return {
    id: row.id,
    category: row.category as FaqCategory,
    question: row.question,
    answer: row.answer,
    questionMs: row.questionMs,
    answerMs: row.answerMs,
    displayOrder: row.displayOrder,
    isPublished: row.isPublished,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/**
 * Projects a stored row into the public shape, resolving the English copy into
 * any missing Malay field.
 *
 * Done once, here, rather than at each render site: every consumer then holds a
 * plain `string` and no page can show a blank Malay question. Storing the null
 * rather than a copy of the English is what lets a later edit to the English
 * show through — see the note on `FaqRecord`.
 */
export function toFaqItem(record: FaqRecord): FaqItem {
  return {
    id: record.id,
    category: record.category,
    question: record.question,
    questionMs: record.questionMs?.trim() || record.question,
    answer: record.answer,
    answerMs: record.answerMs?.trim() || record.answer,
  };
}

function publishedItems(records: FaqRecord[]): FaqItem[] {
  return sortFaqRecords(records.filter((r) => r.isPublished)).map(toFaqItem);
}

/** Synchronous fixture read. Retained for the tests that predate the DB path. */
export function getServerFaqs(
  filters?: string | { category?: string; search?: string }
): FaqItem[] {
  return filterFaqItems(publishedItems(serverFaqs), normaliseFilters(filters));
}

function normaliseFilters(filters?: string | { category?: string; search?: string }) {
  const category = typeof filters === "string" ? filters : filters?.category;
  const search = typeof filters === "object" ? filters?.search : undefined;
  return { category, search };
}

/**
 * Published FAQs for the public surfaces.
 *
 * A successful query returning no rows is an ANSWER — staff have unpublished
 * everything — not an outage. Substituting the fixture there would resurrect
 * retracted copy and leave no way to empty the page, so only a thrown error
 * falls back. (`petRepository` uses a `length > 0` guard; that is appropriate
 * for a catalogue that is never legitimately empty, and is not appropriate
 * here.)
 */
export async function getServerFaqsAsync(
  filters?: string | { category?: string; search?: string }
): Promise<FaqItem[]> {
  const normalised = normaliseFilters(filters);

  try {
    const rows = await prisma.faq.findMany({
      where: { isPublished: true },
      orderBy: [{ displayOrder: "asc" }, { question: "asc" }],
    });
    const items = (rows as unknown as DbFaqRow[]).map(mapDbFaq).map(toFaqItem);
    return filterFaqItems(items, normalised);
  } catch (err) {
    handlePersistenceError("FAQ read", err);
  }

  return filterFaqItems(publishedItems(serverFaqs), normalised);
}

export function findServerFaqById(id: string): FaqItem | null {
  const norm = id.trim().toLowerCase();
  const found = serverFaqs.find((f) => f.id.toLowerCase() === norm);
  return found ? toFaqItem(found) : null;
}

/**
 * Distinct categories present in the published data, in the vocabulary's own
 * order, carrying both label languages.
 *
 * Ordered by `FAQ_CATEGORIES` rather than by first appearance so the tab strip
 * does not reshuffle when staff reorder or unpublish entries. Labels come from
 * `@/lib/presentation/categoryTabs`, the single declaration of them.
 */
export async function getServerFaqCategoriesAsync(): Promise<
  { category: FaqCategory; labelEn: string; labelMs: string }[]
> {
  const items = await getServerFaqsAsync();
  return categoriesPresentIn(items);
}

/** Synchronous fixture-backed form of {@link getServerFaqCategoriesAsync}. */
export function getServerFaqCategories(): {
  category: FaqCategory;
  labelEn: string;
  labelMs: string;
}[] {
  return categoriesPresentIn(publishedItems(serverFaqs));
}

function categoriesPresentIn(items: { category: FaqCategory }[]) {
  const present = new Set(items.map((i) => i.category));
  return FAQ_CATEGORIES.filter((c) => present.has(c)).map((category) => ({
    category,
    labelEn: FAQ_CATEGORY_LABELS[category].labelEn,
    labelMs: FAQ_CATEGORY_LABELS[category].labelMs,
  }));
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every row, published or not, for the editor.
 *
 * No fixture fallback: those rows carry ids that need not exist in the
 * database, so every Edit, Delete and Move on them would fail with "not found"
 * while the table insisted the data was there. An outage has to surface.
 */
export async function listFaqRecords(): Promise<FaqRecord[]> {
  const rows = await prisma.faq.findMany({
    orderBy: [{ category: "asc" }, { displayOrder: "asc" }, { question: "asc" }],
  });
  return (rows as unknown as DbFaqRow[]).map(mapDbFaq);
}

function writePayload(values: FaqFormValues) {
  return {
    category: values.category as PrismaFaqCategory,
    question: values.question,
    answer: values.answer,
    questionMs: values.questionMs ?? null,
    answerMs: values.answerMs ?? null,
    displayOrder: values.displayOrder,
    isPublished: values.isPublished,
  };
}

export async function insertServerFaq(
  values: FaqFormValues,
  actor: SessionUser
): Promise<FaqRecord> {
  const created = await prisma.faq.create({ data: writePayload(values) });
  const record = mapDbFaq(created as unknown as DbFaqRow);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "FAQ_CREATED",
    entity: "Faq",
    entityId: record.id,
    details: {
      category: record.category,
      question: record.question,
      isPublished: record.isPublished,
      displayOrder: record.displayOrder,
    },
  });

  return record;
}

export async function updateServerFaq(
  id: string,
  values: FaqFormValues,
  actor: SessionUser
): Promise<FaqRecord | null> {
  const existing = await prisma.faq.findUnique({ where: { id } });
  if (!existing) return null;

  const before = mapDbFaq(existing as unknown as DbFaqRow);
  const updated = await prisma.faq.update({ where: { id }, data: writePayload(values) });
  const record = mapDbFaq(updated as unknown as DbFaqRow);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "FAQ_UPDATED",
    entity: "Faq",
    entityId: id,
    details: {
      before: { category: before.category, question: before.question, answer: before.answer },
      after: { category: record.category, question: record.question, answer: record.answer },
    },
  });

  return record;
}

export async function setServerFaqPublished(
  id: string,
  isPublished: boolean,
  actor: SessionUser
): Promise<FaqRecord | null> {
  const existing = await prisma.faq.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.faq.update({ where: { id }, data: { isPublished } });
  const record = mapDbFaq(updated as unknown as DbFaqRow);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: isPublished ? "FAQ_PUBLISHED" : "FAQ_UNPUBLISHED",
    entity: "Faq",
    entityId: id,
    details: { question: record.question, isPublished },
  });

  return record;
}

export async function deleteServerFaq(id: string, actor: SessionUser): Promise<boolean> {
  const existing = await prisma.faq.findUnique({ where: { id } });
  if (!existing) return false;

  const record = mapDbFaq(existing as unknown as DbFaqRow);
  await prisma.faq.delete({ where: { id } });

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "FAQ_DELETED",
    entity: "Faq",
    entityId: id,
    details: { category: record.category, question: record.question, answer: record.answer },
  });

  return true;
}

export type ReorderOutcome = "moved" | "at-boundary" | "not-found";

/**
 * Moves one entry a slot up or down within its own category.
 *
 * Read and write happen in one transaction with the category's rows locked:
 * planning from a snapshot taken beforehand lets two coordinators reordering
 * adjacent rows overwrite each other. Only the three columns ordering needs are
 * read, and only for that one category, rather than every row's full answer
 * bodies on each arrow press.
 */
export async function reorderServerFaq(
  id: string,
  direction: "up" | "down",
  actor: SessionUser
): Promise<ReorderOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const target = await tx.faq.findUnique({
      where: { id },
      select: { id: true, category: true, question: true },
    });
    if (!target) return { kind: "not-found" as const };

    await tx.$queryRaw`SELECT id FROM "faqs" WHERE category = ${target.category}::"FaqCategory" FOR UPDATE`;

    const siblings = await tx.faq.findMany({
      where: { category: target.category },
      select: { id: true, displayOrder: true, question: true },
    });

    const updates = planFaqRenumber(siblings, id, direction);
    if (!updates || updates.length === 0) return { kind: "at-boundary" as const };

    for (const row of updates) {
      await tx.faq.update({ where: { id: row.id }, data: { displayOrder: row.displayOrder } });
    }

    return { kind: "moved" as const, question: target.question, updates };
  });

  if (outcome.kind === "moved") {
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "FAQ_REORDERED",
      entity: "Faq",
      entityId: id,
      details: { direction, question: outcome.question, renumbered: outcome.updates },
    });
  }

  return outcome.kind;
}
