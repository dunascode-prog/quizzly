# apps/web

The public site at `quizzly.app` and, in later steps, the invite/share link pages and the admin app at `/admin`. Spec: [docs/WEB.md](../../docs/WEB.md). Approved designs: [docs/reference/](../../docs/reference/) (open the HTML in a browser) and `docs/design/web/`.

Next.js 16 (App Router, TypeScript, Cache Components). Next 16 changed a lot, so read the guides in `node_modules/next/dist/docs/` before relying on older patterns (see `AGENTS.md`).

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev      # http://localhost:3000
npm run lint
npm run build    # CI runs lint + build on every PR
```

## Environment

Read at **build time**, so set them in the Cloudflare Pages build settings.

| Variable | Default | Used for |
|---|---|---|
| `INVITE_DOMAIN` | `quizzly.app` | Canonical URL, contact address, invite links |
| `ANDROID_PACKAGE` | `app.quizzly` | Play link fallback; App Links later |
| `PLAY_STORE_URL` | Play listing for `ANDROID_PACKAGE` | Download buttons and the QR code |

## Layout

```
src/app/layout.tsx         Root: fonts (next/font, self-hosted), theme script, metadata
src/app/(site)/layout.tsx  Public header + footer
src/app/(site)/page.tsx    Landing page (WEB.md §2)
src/app/(site)/landing.css Landing styles, one column under 700px
src/components/            Icon, Phone (light/dark screenshot pair), PlayQrCode, ThemeToggle
src/lib/site.ts            Domain, Play URL and other build-time values
src/styles/tokens.css      Design tokens, light + dark. Mirrors apps/mobile/src/constants/theme.ts
public/screens/            Real app screenshots, light and -dark
public/brand/              Logo and app icon
```

## Rules

- Colours, fonts and radii come only from the CSS variables in `tokens.css`. No hard-coded hex.
- Theme: `prefers-color-scheme`, overridden by `data-theme` on `<html>` (the header toggle saves it to `localStorage`).
- Screenshots: use `<Phone>`, which renders the light and dark files and shows the one for the active theme. Only the hero's centre phone loads eagerly; everything else is lazy, so hidden images are never downloaded.
- No invented user counts, ratings or testimonials. Copy stays kind (DESIGN.md §11).
- Lighthouse mobile performance must stay ≥ 90 on `/`. Below-the-fold sections use `content-visibility: auto` to keep layout cost down.
