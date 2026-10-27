# Quizzly

AI study app for Nigerian university students. Monorepo: Expo app in `apps/mobile`, FastAPI + worker in `services/api`, Supabase schema in `supabase/`.

## Read before working

- **What to build next, in order: `docs/BUILD_PLAN.md`.** Pick the first unchecked task unless told otherwise.
- Product and requirements: `docs/PRD.md` (v0.2), `docs/FRD.md` (v0.2, requirement IDs like `FR-SHARE-03`).
- Architecture and data: `docs/ARCHITECTURE.md`, `docs/DATA_MODELS.md` (incl. §5 access rules), `docs/DATA_FLOWS.md`.
- **Any UI work: follow `docs/DESIGN.md` (v0.4) exactly.** It defines tokens, type, components and all 24 screens. Screen images are in `docs/design/`, numbered to match DESIGN.md §7.
- Mobile app rules: `apps/mobile/AGENTS.md` (check versioned Expo docs, use `npx expo install`).

## Security rules (FRD §2.16) — never break these

- The app is **read-only** on Supabase tables. Every insert/update/delete goes through the API, which checks ownership. Never add a client write policy or call `.insert/.update/.delete` from the app.
- The server generates storage paths (`uploads/{user_id}/{document_id}/…`, `shared/{sha256}`); never accept a path from the client.
- Shared-course members never receive storage URLs or other users' scores, chats or progress.
- Exam-mode quiz payloads contain no answers until submission.
- Session tokens live in `expo-secure-store`, not plain storage.
- Every new user-facing event inserts a `notifications` row server-side; the app only reads and marks read via the API.

## UI rules (summary of DESIGN.md)

- Use tokens from `apps/mobile/src/constants/theme.ts` only; never hard-code hex colours.
- Monochrome base: lavender-grey ground, ink cards, white pills. Semantic colour for correct (green), wrong (red), not-in-notes or warnings (amber). The four `Accent` colours only where DESIGN.md §3.2 allows (course rings, chosen theme, celebrations, unread dots) and **never on sign-in or the landing page**. Text on an accent is ink.
- One job per screen: one headline (one word on an ink block), one ink hero card, one bottom `ActionPill`.
- Fonts: **Bricolage Grotesque 700** for headlines and big numbers, **Manrope** for everything else. No other fonts, no UI kits, no images except `assets/brand/*.svg`.
- Every AI answer shows page citations (or the quote view in shared courses) or a "Not in your notes" callout.
- Engagement copy is kind: no guilt, no fake urgency, no public rankings. Other people appear only as display names ("Ada O.").
- Accessibility: labels and roles on every touchable, targets ≥ 48, works at 200% font scale and in dark mode, respect reduce motion.
- Error and limit messages use the exact copy in FRD §4.

## Before finishing a task

- Mobile: `npx expo lint` and `npx tsc --noEmit` in `apps/mobile`.
- API: `uv run pytest` in `services/api`. Add tests for every FR-SEC item you touch.
- Migrations: new numbered files in `supabase/migrations/`; never edit an applied migration.
- Work on a feature branch; reference FR IDs in the PR description; tick the task in `docs/BUILD_PLAN.md`.
