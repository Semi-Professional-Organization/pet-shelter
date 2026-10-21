# GEMINI.md

## Operating Context for Antigravity / Gemini

This file specifies Gemini- and Antigravity-specific behaviors for this repository. Universal repo rules live in `AGENTS.md`.

## Context & Session Hygiene

**The reset rule is in `AGENTS.md` and is not restated here**: reset on task milestones, not on a
token estimate. This file used to name a 200K–300K threshold while `AGENTS.md` said not to
self-meter at all and `CLAUDE.md` named two different numbers — one rule, three answers, all three
loaded into the same context. Only Gemini- and Antigravity-specific behaviour belongs below.

- **Subagent delegation**: Proactively delegate codebase sweeps, multi-file searches, and log audits to the `research` subagent (`invoke_subagent`). Never dump large file scans into the main session.
- **Artifact-driven handoff**: Maintain state in `implementation_plan.md` and `walkthrough.md`. On finishing a major milestone in the plan, summarize progress in the artifact so the user can start a fresh session seamlessly.
