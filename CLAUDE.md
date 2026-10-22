# Quizzly

AI study app for Nigerian university students. Monorepo: Expo app in `apps/mobile`, FastAPI + worker in `services/api`, Supabase schema in `supabase/`.

## Read before working

- Product and requirements: `docs/PRD.md`, `docs/FRD.md` (requirement IDs like `FR-QGEN-02`).
- Architecture and data: `docs/ARCHITECTURE.md`, `docs/DATA_MODELS.md`, `docs/DATA_FLOWS.md`.
- **Any UI work: follow `docs/DESIGN.md` exactly.** It defines the tokens, type, components, every MVP screen, the logo and the sign-in illustration. Screen images are in `docs/design/`, numbered to match the screens in DESIGN.md §7.
- Mobile app rules: `apps/mobile/AGENTS.md` (check versioned Expo docs, use `npx expo install`).

## UI rules (summary of DESIGN.md)

- Use tokens from `apps/mobile/src/constants/theme.ts` only; never hard-code hex colours.
- Monochrome: lavender-grey ground, ink cards, white pills. Colour only for correct (green), wrong (red), not-in-notes or warnings (amber).
- One job per screen: one headline (one word on an ink block), one ink hero card, one bottom `ActionPill`.
- Fonts: Inter Display SemiBold for headlines, Inter for everything else. No other fonts, no UI kits, no images except `assets/brand/*.svg`.
- Every AI answer shows page citations or a "Not in your notes" callout.
- Accessibility: labels and roles on every touchable, targets ≥ 48, works at 200% font scale and in dark mode, respect reduce motion.
- Error and limit messages use the exact copy in FRD §4.

## Before finishing a task

- Mobile: `npx expo lint` and `npx tsc --noEmit` in `apps/mobile`.
- API: `uv run pytest` in `services/api`.
- Work on a feature branch; reference FR IDs in the PR description.
