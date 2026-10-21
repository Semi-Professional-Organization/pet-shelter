/**
 * Suggestions for `scripts/issue-groups.mjs --suggest`: which group an ungrouped issue most
 * resembles. Pure and print-only; a person decides by editing the grouping file.
 *
 * An issue here is `{ number, title, body }`; nothing else is read.
 */

const normalise = (text) => String(text ?? "").replace(/\r\n/g, "\n").trim();

const STOPWORDS = new Set(
  // Only words the tokenizer below can produce: three letters or more, no apostrophes.
  ("the and for that this with from are was were not but its has have had all any can cannot " +
    "one two three four five six seven eight nine ten each every only also than then them they their " +
    "there here what when where which who whom why how does did done into onto over under out off " +
    "per via yet still now new old same other more most less least such very just because " +
    "while before after again once both either neither nor own being been would could should will " +
    "may might must shall about above below between through during without within whose these those " +
    "status open opened asserted read found code review reviews reasoned measured fixed left " +
    "entry tasks see https github com blob master issue issues").split(/\s+/),
);

/** The ledger mirror's marker and header line say the same thing on every ledger issue. */
const stripMirrorHeader = (body) =>
  normalise(body)
    .replace(/^<!--[^\n]*-->\n?/, "")
    .replace(/^> Mirrored from [^\n]*\n?/, "");

const stem = (word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

/**
 * An issue as weighted features: the source files and identifiers it names, and its words. A file
 * named by path in one issue and as a bare component name in another meet at `id:<basename>`.
 */
export function features(issue) {
  const text = `${issue.title ?? ""}\n${stripMirrorHeader(issue.body)}`;
  const counts = new Map();
  const add = (feature, weight = 1) => counts.set(feature, (counts.get(feature) ?? 0) + weight);
  // A repo-root directory only: not the `prisma/` in `@prisma/client` or the `docs/` deep in a path.
  // A leading `./` is the same path.
  const paths = text.match(/(?<![\w@/.-])(?:\.\/)?(?:src|tests|scripts|prisma|docs|\.claude|\.github|\.codex)\/[\w.@[\]/-]+/g) ?? [];
  // A file's extensions go, so `issueGroups.test.ts` meets a backticked `issueGroups`. Only file
  // extensions: `Pet.age` is a property, not a file called Pet, and stays whole.
  const bare = (name) => name.replace(/(?:\.(?:test|spec|d))?\.(?:tsx?|[cm]?js|json|md|sql|css|prisma|ya?ml|http)$/i, "").toLowerCase();
  // Next.js names every route's files alike; `page` in two issues is rarely the same file.
  const generic = new Set(["page", "route", "layout", "loading", "error", "not-found", "template", "default", "index"]);
  const addId = (name) => {
    const base = bare(name);
    if (base && !generic.has(base)) add(`id:${base}`, 2);
  };
  for (const raw of paths) {
    // Trailing punctuation, and the `]` of a markdown link around the path, are not part of it; the
    // `]` closing a dynamic segment such as `[id]` is.
    let path = raw.replace(/^\.\//, "").replace(/[.:]+$/, "");
    while (path.endsWith("]") && path.split("]").length > path.split("[").length) path = path.slice(0, -1).replace(/[.:]+$/, "");
    add(`path:${path.toLowerCase()}`, 2);
    addId(path.slice(path.lastIndexOf("/") + 1));
  }
  // A backticked name meets a path by its bare name: `agent-guard`, `PetFormDialog.tsx`, `fn(x)`.
  for (const match of text.matchAll(/`([A-Za-z_$][\w$.-]*)(?:\([^`]*\))?`/g)) addId(match[1]);
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOPWORDS.has(word)) add(`w:${stem(word)}`);
  }
  // The title says what the issue is about; its words count three times.
  for (const word of String(issue.title ?? "").toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOPWORDS.has(word)) add(`w:${stem(word)}`, 2);
  }
  return counts;
}

/** TF-IDF vectors, unit length, over a corpus of feature maps. */
function vectorise(corpus) {
  const df = new Map();
  for (const counts of corpus.values()) for (const feature of counts.keys()) df.set(feature, (df.get(feature) ?? 0) + 1);
  const total = corpus.size;
  const vectors = new Map();
  for (const [number, counts] of corpus) {
    const vector = new Map();
    for (const [feature, count] of counts) {
      // A feature on one issue only cannot link it to anything; drop it.
      if (df.get(feature) < 2) continue;
      vector.set(feature, (1 + Math.log(count)) * Math.log(total / df.get(feature)));
    }
    const length = Math.hypot(...vector.values()) || 1;
    for (const [feature, value] of vector) vector.set(feature, value / length);
    vectors.set(number, vector);
  }
  return vectors;
}

const dot = (a, b) => {
  let sum = 0;
  for (const [feature, value] of a) sum += value * (b.get(feature) ?? 0);
  return sum;
};

/**
 * Sum of member vectors, scaled to unit length: a plain mean of many members pointing different ways
 * is shorter than a mean of two, which would favour small groups for being small.
 */
function centroid(vectors, members) {
  const sum = new Map();
  for (const number of members) {
    for (const [feature, value] of vectors.get(number) ?? []) sum.set(feature, (sum.get(feature) ?? 0) + value);
  }
  const length = Math.hypot(...sum.values()) || 1;
  for (const [feature, value] of sum) sum.set(feature, value / length);
  return sum;
}

/**
 * Ranks the groups for one issue by cosine similarity to each group's centroid, with the
 * features that contributed most. `exclude` leaves an issue out of the centroids (leave-one-out).
 *
 * ceiling: bag of words plus named files, compared with each group's direction. It cannot read meaning,
 * so an issue about a group's subject in new vocabulary scores low, and one that merely names a
 * shared file scores high. Accuracy is measured by `--suggest --evaluate`, which hides each grouped
 * issue in turn and scores the proposal as `--suggest` would print it, ties counted against the real
 * group; the figures for the first grouping are in
 * `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`. Suggestions are only printed:
 * a human puts an issue in the file.
 */
export function rankGroups(number, vectors, groups, { exclude = null } = {}) {
  const vector = vectors.get(number) ?? new Map();
  return groups
    .map((group) => {
      const members = group.issues.filter((member) => member !== exclude && vectors.has(member));
      const center = members.length > 0 ? centroid(vectors, members) : new Map();
      const evidence = [...vector]
        .map(([feature, value]) => [feature, value * (center.get(feature) ?? 0)])
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([feature]) => feature.replace(/^(w|id|path):/, ""));
      return { key: group.key, score: dot(vector, center), evidence };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** Below this, or this close to the runner-up, a guess is reported as no clear group. */
export const MIN_SCORE = 0.05;
export const MIN_MARGIN = 0.01;

const judge = ([best, next]) => ({
  best,
  next,
  clear: Boolean(best) && best.score >= MIN_SCORE && (!next || best.score - next.score >= MIN_MARGIN),
});

/**
 * Vectors over the issues given. The caller leaves group parents out: a parent repeats its summary
 * and the script's header, so counting it would shift every weight once the grouping is applied.
 */
const corpusVectors = (issues) => vectorise(new Map(issues.map((issue) => [issue.number, features(issue)])));

export function suggest(config, issues, candidates) {
  const vectors = corpusVectors(issues);
  return candidates.map((issue) => ({ number: issue.number, title: issue.title, ...judge(rankGroups(issue.number, vectors, config.groups)) }));
}

/**
 * Leave-one-out over the file's own grouping, judged as `--suggest` would print it: `right` is the
 * share of issues whose clear proposal is their real group, `wrong` a clear proposal of another, and
 * `unclear` the share printed as no clear group. `top2` ranks without the gate.
 */
export function evaluate(config, issues) {
  const vectors = corpusVectors(issues);
  const results = [];
  for (const group of config.groups) {
    for (const number of group.issues) {
      if (!vectors.has(number)) continue;
      const ranked = rankGroups(number, vectors, config.groups, { exclude: number });
      // Ties count against the real group: it ranks after every group scoring as high, so a
      // zero shared with many groups is never a hit for whichever key sorts first.
      const own = ranked.find((entry) => entry.key === group.key).score;
      const rank = ranked.filter((entry) => entry.score >= own).length;
      results.push({ number, actual: group.key, guess: ranked[0].key, rank, clear: judge(ranked).clear });
    }
  }
  const share = (test) => (results.length === 0 ? 0 : results.filter(test).length / results.length);
  return {
    results,
    right: share((r) => r.clear && r.rank === 1),
    wrong: share((r) => r.clear && r.rank !== 1),
    unclear: share((r) => !r.clear),
    top2: share((r) => r.rank <= 2),
  };
}
