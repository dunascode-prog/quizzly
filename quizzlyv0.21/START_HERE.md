# Quizzly v0.2 handoff — start here

This zip updates the Quizzly repo (`dunascode-prog/quizzly`) to the v0.2 product and design: new sign-in, Today home, habits, course sharing, real-time notifications, invite links, the Bricolage Grotesque + Manrope type, and the security fixes from the v0.1 review.

## What's inside (paths match the repo root)

| Path | Status |
|---|---|
| `CLAUDE.md` | Replaces the current file |
| `docs/PRD.md` | v0.2 (replaces) |
| `docs/FRD.md` | v0.2 (replaces) — new FR-HOME, FR-HAB, FR-SEC, FR-SHARE, FR-INV; FR-NOTIF rewritten |
| `docs/ARCHITECTURE.md` | v0.2 (replaces) — Realtime, link service, progress engine, sharing, security |
| `docs/DATA_MODELS.md` | v0.2 (replaces) — new tables §2.9–2.12, access rules §5 |
| `docs/DATA_FLOWS.md` | v0.2 (replaces) — new flows 3.26–3.29, sequences 4.4–4.6 |
| `docs/DESIGN.md` | v0.4 (replaces) — 30 screens, new components, accents, fonts, dark mode |
| `docs/BUILD_PLAN.md` | **New** — ordered task list (phases A–E) |
| `docs/design/*.png` | Replaces old images; screens 01–30 in light and dark (`-dark`), plus 01b/01c sign-in steps and 01d small-phone sign-in, UI spec, type and logo boards |
| `apps/mobile/src/constants/theme.ts` | Replaces — adds `Accent`, Bricolage/Manrope `FontFamily`, `Type.number`, new sizes |

## How to use it with Claude Code

1. In your local clone: `git checkout main && git pull && git checkout -b docs/v0.2-handoff`
2. Unzip this file **at the repo root** so the files overwrite the old ones (`unzip -o quizzly-v0.2-handoff.zip -d .`). Delete `START_HERE.md` afterwards or keep it out of the commit.
3. Also delete the old image `docs/design/build-guide-for-claude-code.png` (the build guide now lives in `docs/BUILD_PLAN.md`).
4. Commit: `git add -A && git commit -m "docs: v0.2 PRD/FRD/design handoff"` and open a PR.
5. Start Claude Code in the repo and paste the prompt below.

> **Note:** `theme.ts` switches the font names to Bricolage Grotesque and Manrope. The app won't load those fonts until task **B1** installs and registers them, so either do B1 straight after merging, or merge the docs first and let B1 bring in `theme.ts`.

## Prompt to paste into Claude Code

```text
Read CLAUDE.md, then docs/BUILD_PLAN.md, docs/FRD.md (v0.2) and docs/DESIGN.md (v0.4).

We are moving Quizzly from v0.1 to v0.2. Work through docs/BUILD_PLAN.md in order,
starting with Phase A (security hardening) — Phase A must be finished before Phase C.

For each task:
1. Create a branch named claude/<task-id>-<short-name> (e.g. claude/a1-client-read-only).
2. Read the FR IDs the task lists and the relevant sections of DATA_MODELS.md / ARCHITECTURE.md.
3. Implement it with tests (pytest for the API, every FR-SEC item gets a regression test).
4. For UI tasks, match the screen image in docs/design/ and DESIGN.md exactly: theme tokens only,
   Bricolage Grotesque + Manrope only, accents only where DESIGN.md §3.2 allows,
   accessibility labels, 200% font scale, dark mode, reduce motion.
5. Run `uv run pytest` in services/api and `npx expo lint` + `npx tsc --noEmit` in apps/mobile.
6. Tick the task in docs/BUILD_PLAN.md and open a PR listing the FR IDs.

Start with A1 (client read-only database). Before writing code, tell me your plan for A1–A3
in a few lines, then go.
```

## Open decisions (defaults are in BUILD_PLAN.md)

- Domain for invite/share links (`INVITE_DOMAIN`).
- Which features, if any, go behind a paid plan.
