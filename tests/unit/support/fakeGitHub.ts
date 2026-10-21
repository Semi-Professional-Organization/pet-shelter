/**
 * A small GitHub for `scripts/issue-groups.mjs`, written from GitHub's documented rules and not from
 * the planner, so a test can catch the planner believing something GitHub does not.
 *
 * Rules it enforces, each refused with an error as GitHub refuses it:
 *   - an issue has at most one parent, and a second needs `replaceParent` (always set by the script);
 *   - a parent has at most 100 sub-issues;
 *   - no loops, and at most eight levels of nested sub-issues below a top-level issue;
 *   - a title over 256 characters or a body over 65,536 is refused;
 *   - labels compare ignoring case, and a new issue's labels are dropped without push access;
 *   - an issue the account cannot see cannot be read, linked or unlinked.
 */

export type FakeIssue = {
  id: string;
  number: number;
  repo: string;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  parentId: string | null;
  hidden: boolean;
};

const LIMIT = { children: 100, levels: 8, title: 256, body: 65_536 };

export class FakeGitHub {
  readonly issues = new Map<string, FakeIssue>();
  pushAccess = true;
  writes = 0;
  private next = new Map<string, number>();

  constructor(readonly repo: string) {}

  add(fields: Partial<FakeIssue> & { repo?: string } = {}): FakeIssue {
    const repo = fields.repo ?? this.repo;
    const number = fields.number ?? (this.next.get(repo) ?? 1);
    this.next.set(repo, Math.max(this.next.get(repo) ?? 1, number + 1));
    const issue: FakeIssue = {
      id: `I_${repo}_${number}`,
      number,
      repo,
      title: `Issue ${number}`,
      body: "",
      state: "OPEN",
      labels: [],
      parentId: null,
      hidden: false,
      ...fields,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  byNumber(number: number): FakeIssue | undefined {
    return [...this.issues.values()].find((issue) => issue.repo === this.repo && issue.number === number);
  }

  children(id: string): FakeIssue[] {
    return [...this.issues.values()].filter((issue) => issue.parentId === id);
  }

  ancestors(id: string): string[] {
    const seen: string[] = [];
    for (let at = this.issues.get(id)?.parentId ?? null; at && !seen.includes(at); at = this.issues.get(at)?.parentId ?? null) seen.push(at);
    return seen;
  }

  height(id: string): number {
    const below = this.children(id);
    return below.length === 0 ? 0 : 1 + Math.max(...below.map((child) => this.height(child.id)));
  }

  private visible(id: string, what: string): FakeIssue {
    const issue = this.issues.get(id);
    if (!issue || issue.hidden) throw new Error(`refused: ${what} ${id} cannot be seen`);
    return issue;
  }

  private check(title: string, body: string) {
    if ([...title].length > LIMIT.title) throw new Error("refused: title too long");
    if ([...body].length > LIMIT.body) throw new Error("refused: body too long");
  }

  /** What `readSnapshot` would return: every issue this account can see. */
  snapshot() {
    const visible = [...this.issues.values()].filter((issue) => !issue.hidden);
    return {
      repo: this.repo,
      issues: visible.map((issue) => {
        const parent = issue.parentId ? this.issues.get(issue.parentId)! : null;
        return {
          id: issue.id,
          number: issue.number,
          repo: issue.repo,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: [...issue.labels],
          parentId: parent && !parent.hidden ? parent.id : null,
          parentRef: parent && !parent.hidden ? (parent.repo === this.repo ? `#${parent.number}` : `${parent.repo}#${parent.number}`) : null,
          parentHidden: Boolean(parent?.hidden),
          childCount: this.children(issue.id).length,
          height: this.height(issue.id),
        };
      }),
    };
  }

  /** Links as GitHub's addSubIssue with replaceParent does, refusing what GitHub refuses. */
  link(parentId: string, childId: string) {
    const parent = this.visible(parentId, "parent");
    const child = this.visible(childId, "child");
    if (child.parentId === parent.id) return;
    if (this.children(parent.id).length >= LIMIT.children) throw new Error("refused: parent is full");
    if (parent.id === child.id || this.ancestors(parent.id).includes(child.id)) throw new Error("refused: loop");
    if (this.ancestors(parent.id).length + 1 + this.height(child.id) > LIMIT.levels) throw new Error("refused: too deep");
    child.parentId = parent.id;
  }

  port() {
    const write = <T>(fn: () => T): T => {
      this.writes += 1;
      return fn();
    };
    return {
      createIssue: ({ title, body, labels }: { title: string; body: string; labels: string[] }) =>
        write(() => {
          this.check(title, body);
          const issue = this.add({ title, body, labels: this.pushAccess ? [...labels] : [] });
          return { id: issue.id, number: issue.number, labels: [...issue.labels] };
        }),
      addLabel: (number: number) =>
        write(() => {
          const issue = this.byNumber(number);
          if (!issue) throw new Error(`refused: no issue #${number}`);
          if (!issue.labels.some((name) => name.toLowerCase() === "group")) issue.labels.push("group");
          return [...issue.labels];
        }),
      setState: (number: number, state: string) =>
        write(() => {
          const issue = this.byNumber(number);
          if (!issue) throw new Error(`refused: no issue #${number}`);
          issue.state = state === "closed" ? "CLOSED" : "OPEN";
        }),
      updateIssue: (number: number, fields: { title: string; body: string }) =>
        write(() => {
          const issue = this.byNumber(number);
          if (!issue) throw new Error(`refused: no issue #${number}`);
          this.check(fields.title, fields.body);
          Object.assign(issue, fields);
        }),
      link: (parentId: string, childId: string) => write(() => this.link(parentId, childId)),
      unlink: (parentId: string, childId: string) =>
        write(() => {
          const child = this.visible(childId, "child");
          this.visible(parentId, "parent");
          if (child.parentId !== parentId) throw new Error("refused: not a sub-issue of that parent");
          child.parentId = null;
        }),
    };
  }
}
