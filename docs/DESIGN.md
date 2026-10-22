# Quizzly — Design Guidelines (MVP)

| | |
|---|---|
| **Status** | v0.3 |
| **Date** | 2026-10-22 |
| **Applies to** | `apps/mobile` (Expo SDK 57, Expo Router) |
| **Related** | [PRD](PRD.md) · [FRD](FRD.md) · [Architecture](ARCHITECTURE.md) |
| **Source of truth** | The "Quizzly MVP Design" canvas on claude.ai. Screen images live in `docs/design/` (`01-sign-in.png` … `13-account.png`, plus the UI spec, logo options and build guide boards). |

This file is written for whoever builds the UI, human or Claude Code. Follow it exactly. Where it is silent, follow the FRD and keep to the look described here.

---

## 1. The look in one paragraph

Quiet monochrome, clear type. A lavender-grey background, near-black ("ink") cards, white pill buttons and inputs, and large semibold headlines with **one word set on an ink block**. Every screen has one job, one headline, one ink hero card and one main action pill at the bottom. Colour appears only when it means something: green = correct, red = wrong, amber = "not in your notes" or warnings.

## 2. Principles (with requirement sources)

| # | Principle | Source |
|---|---|---|
| 1 | **Light on the phone.** No photos, no shadows, no gradients, no UI kit. The only image is the vector sign-in illustration. Skeleton blocks instead of spinners. | G4, NFR-01/02 |
| 2 | **Every AI answer shows its page.** Explanations, questions and chat replies carry outlined page chips ("p. 12") that open the source page. | US-10, FR-QGEN-03, FR-CHAT-02, FR-DOC-10 |
| 3 | **Label what isn't from the notes** in a dashed amber frame titled "Not in your notes". Never mix it into grounded text. | FR-EXPL-03, FR-CHAT-03 |
| 4 | **Offline is normal.** Saved content works; network actions show "Queued" and sync via the SQLite outbox. | G5, FR-OFF-01/02 |
| 5 | **Upfront about limits.** Remaining daily usage is visible before it is spent (Library header, Account). Errors use the exact FRD §4 copy. | FR-LIM-01/03, PRD §9 |
| 6 | **Contrast first.** All text pairs ≥ 4.5:1, touch targets ≥ 48 (icon buttons 52), layouts survive 200% font scale, right/wrong always uses an icon *and* a word. | NFR-08 |
| 7 | **One job per screen.** 20 px side gutters, 24 px between groups. If an element doesn't help the student act now, it moves to a menu, a sheet or further down the scroll. | — |

## 3. Colour tokens

Defined in `apps/mobile/src/constants/theme.ts`. **Never hard-code hex values in screens.** The existing keys (`text`, `background`, `backgroundElement`, `backgroundSelected`, `textSecondary`) are kept and remapped.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` (ground) | `#DCDDE8` | `#0D0D10` | Screen background |
| `backgroundElement` (surface) | `#ECEDF4` | `#1B1C22` | Light cards, sheets |
| `backgroundSelected` (field) | `#F5F5FA` | `#26272E` | Inputs, white pills, light circle buttons, answer options |
| `text` (ink) | `#0D0D10` | `#F5F5FA` | Text, hero cards, primary pills, tab bar |
| `onInk` | `#FFFFFF` | `#0D0D10` | Text/icons on ink |
| `textSecondary` (muted) | `#4D4E5A` | `#A3A4AE` | Secondary text on ground/surface |
| `mutedOnInk` | `#A3A4AE` | `#4D4E5A` | Secondary text on ink |
| `inkRaised` | `#1B1C22` | `#E4E5EC` | Tiles inside ink cards |
| `line` | `#C5C6D3` | `#33343C` | Dividers, outlines |
| `track` | `#3A3B44` | `#C5C6D3` | Ring/bar track on ink |
| `success` / `successSoft` | `#186A33` / `#D6EEDC` | `#7BD69A` / `#16301F` | Correct, Ready |
| `danger` / `dangerSoft` | `#B42318` / `#F7DCD9` | `#FF9D94` / `#3A1C1A` | Wrong, Failed, Delete |
| `warning` / `warningSoft` | `#7A5200` / `#F3E6C4` | `#F2C46D` / `#352A12` | Not-in-notes, OCR flag, limits |

In dark theme the roles invert: the ground is black and hero cards become light, so each screen keeps one high-contrast block. `app.json` already has `userInterfaceStyle: "automatic"`.

Checked contrast (light): muted on ground 6.0:1, muted on surface 6.9:1, mutedOnInk on ink 7.8:1, success on successSoft 5.4:1, danger on dangerSoft 5.1:1, warning on warningSoft 5.7:1.

## 4. Typography

The reference style is a Helvetica-like neo-grotesk: **semibold headlines, normal tracking, plain sans body.** Closest free match:

- **Headlines:** Inter Display SemiBold (static TTF from the [rsms/inter](https://github.com/rsms/inter) release, placed in `assets/fonts/`).
- **Body and UI:** Inter (`@expo-google-fonts/inter`: 400, 500, 600).
- **Code in explanations:** the platform monospace.

Load with `expo-font` (bundled, about 250 KB, never downloaded at runtime). If the exact reference family is confirmed later (e.g. Neue Montreal), change only the `fontFamily` values in `Type`.

| Token | Family | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `hero` | Inter Display SemiBold | 44 / 48 | −1.1 | Sign-in headline |
| `display` | Inter Display SemiBold | 40 / 44 (min 32 / 38) | −1.0 | Screen headlines |
| `title` | Inter Display SemiBold | 24–30 / 30–36 | −0.4 | Card titles, results title |
| `heading` | Inter 600 | 18–22 / 24–28 | 0 | Section headings |
| `body` | Inter 400 | 15–17 / 23–27 | 0 | Reading text (explanations 17/27) |
| `label` | Inter 500 | 15–17 / 20 | 0 | Buttons, options, chips |
| `small` | Inter 400 | 13–14 / 18–20 | 0 | Meta, helper text |
| `caption` | Inter 500 | 12 / 16 | 0 | Field labels, chips (minimum size) |

**Highlighted word:** each screen headline puts one word on an ink block (`background: ink`, `color: onInk`, horizontal padding 10, radius 12). Example: "Revise your **courses**". Implement as `<HighlightText>`.

## 5. Shape, space, motion

- **Radius:** pills/buttons/chips/tab bar `999`; cards `28`; sheets `32` (top corners); fields, options and tiles `20–24`.
- **Spacing:** keep existing `Spacing` keys (2, 4, 8, 16, 24, 32, 64) and add `twoHalf: 12`, `gutter: 20`. Screen padding 28 top / 20 sides / 28 bottom. 24 between groups, 10–12 between items in a list.
- **Depth:** no shadows or blur. Depth comes from ground → surface → field → ink.
- **Motion:** only the sign-in illustration animates (§9). Screen transitions use the default native stack. Respect reduce-motion everywhere.

## 6. Components (`src/components/ui/`)

| Component | Spec |
|---|---|
| `ActionPill` | 64 tall, radius 999. Left: 52 circle with icon. Centre: label (Inter 500 17). Right: `›››` in muted colour (decorative, `accessible={false}`). Variants: `ink` (ink fill, field-coloured circle, white text — the primary action) and `light` (field fill, ink circle). Loading: the circle becomes a progress ring; label stays. One per screen, pinned at the bottom. |
| `IconButton` | 52 circle. Tones `light` (field) and `ink`. `accessibilityLabel` required. |
| `Pill` | 44–48 tall chip or small button. Selected = ink fill + white text; unselected = field fill. |
| `SegmentedPill` | Ink track (padding 5, radius 999); selected segment is a field-coloured pill, others are transparent with `#C9CAD3` text. Used for explanation style and quiz mode. `accessibilityRole="tablist"` / `"tab"`. |
| `HeroCard` | Ink card, radius 28, padding 20–22. Slots: small muted label, optional `ProgressRing` top-right, title (24–30), optional action pill (field-coloured "RESUME"). |
| `ListCard` | Surface fill, radius 24, padding 14–18, no border. Optional leading 48 ink circle (course code), title (17/600), meta (13 muted), trailing chevron. |
| `ProgressRing` | 52–60 (168 on Results). Fill `onInk`, track `track`. Always shows a number inside ("6/10", "45%"). |
| `TextField` | 64 tall, field fill, radius 20, padding 10×20. Small label (12/500 muted) above the value (16/500). No border; focused = 2 px ink border. |
| `AnswerOption` | Field row, radius 22, min height 64, 48 letter circle on the left. States: `default`, `selected` (ink fill), `correct` (successSoft + 2 px success border, ✓ circle), `wrong` (dangerSoft + 2 px danger border, ✕ circle). |
| `CitationChip` | Outlined ink pill, 26–28 tall, "p. 12", hitSlop to 48. Opens `document/[id]/page/[n]`. |
| `GroundingCallout` | 1.5 px dashed `warning` border, radius 16–20, label "NOT IN YOUR NOTES" (12/600, uppercase, warning colour), body text. |
| `Banner` | Offline: ink pill with icon. Limit / error / info: soft-tone block, radius 20, FRD §4 copy verbatim. |
| `FloatingTabBar` | Ink pill, 68 tall, 20 from the sides and 24 from the bottom. Active tab = field-coloured pill with icon + label; inactive = 52 icon-only circles (`#C9CAD3`) with `accessibilityLabel`. Shown on (tabs) screens only. |
| `Logo` | See §8. |
| `StudyIllustration` | See §9. |
| `Skeleton` | Surface blocks shaped like the content; no shimmer. |

Icons: 24 grid, 2 px stroke, round caps and joins (Lucide-style). Use `lucide-react-native` or inline `react-native-svg` paths. Never emoji.

## 7. Screens

Routes live in `src/app/`. Move the current `index.tsx` and `practice.tsx` into a `(tabs)` group with the floating tab bar as its layout. A root redirect sends signed-out users to `(auth)` and users without institution/level to `onboarding` (FR-PROF-01).

| # | Route | Screen | Requirements | Data |
|---|---|---|---|---|
| 01 | `(auth)/sign-in.tsx` | Sign in (email → code, Google) | FR-AUTH-01/02/03 | Supabase Auth |
| 02 | `onboarding.tsx` | Profile setup | FR-PROF-01/02, FR-AUTH-03 | `profiles`, `institutions` |
| 03 | `(tabs)/index.tsx` | Library | FR-CRS-01/02, FR-LIM-01 | `courses`, `documents`, `usage_counters` |
| 04 | `upload.tsx` (formSheet) | Add notes | FR-DOC-01/02/03 | `POST /documents` → signed PUT → `POST /documents/{id}/uploaded` |
| 05 | `course/[id].tsx` | Course | FR-CRS-03, FR-DOC-04–09 | `documents`, `jobs.progress` (poll 3 s) |
| 06 | `document/[id]/index.tsx` | Outline | FR-TOP-01 | `GET /documents/{id}/outline` |
| 07 | `document/[id]/topic/[topicId].tsx` | Explanation | FR-EXPL-01–05, FR-MOD-01/03 | `explanations` |
| 08 | `document/[id]/chat.tsx` | Chat | FR-CHAT-01–06 | `POST /chat/{thread_id}/messages` (SSE) |
| — | `document/[id]/page/[n].tsx` | Source page viewer | FR-DOC-10 | signed download URL |
| 09 | `quiz/new.tsx` | Quiz setup | FR-QGEN-01/07/08 | `POST /quizzes` |
| 10–11 | `quiz/[id]/play.tsx` | Question (objective + theory marked) | FR-QUIZ-01–05 | `GET /quizzes/{id}`, outbox |
| 12 | `quiz/[id]/results.tsx` | Results | FR-QUIZ-06 | `quiz_attempts` |
| — | `(tabs)/practice.tsx` | Practice history | FR-QUIZ-05/07 | `quizzes`, `quiz_attempts` |
| 13 | `(tabs)/account.tsx` | Account | FR-AUTH-04/05, FR-LIM-01 | `profiles`, `usage_counters` |

### 01 Sign in
Ground background. Top-left: the logo in a 56 ink circle (no wordmark). Centre (flex): the animated `StudyIllustration`. Then an ink hero card: "Your notes,⏎made clear." (`hero`) + "Explanations and practice questions from your own slides." (muted) + a diagonal ↘ arrow. Then `TextField` "Email", ink `ActionPill` "Continue", and a text button "Continue with Google". Footer: terms + privacy links (12, muted). Code step replaces the field with six 64-tall digit boxes, ink `ActionPill` "Verify", text button "Use a different email".

### 02 Profile setup
Back `IconButton`. Headline "Where do you **study?**". Fields: Full name, Institution (searchable; "My school isn't listed" appears in the search results), Department. "Level" pills: 100L, 200L, 300L, 400L, 500L, Other (more levels in "Other"). Terms checkbox. Ink `ActionPill` "Start studying".

### 03 Library (tab)
Header: initials avatar (52 field circle), "Hello, Tolu" + "12 quizzes left today", ink `IconButton` "+" (opens 04). Headline "Revise your **courses**". `HeroCard` "Continue · CSC 225", ring "6/10", title "Stacks and queues", "RESUME" pill. Then `ListCard`s per course (code circle, title, "CSC 225 · 5 documents"). `FloatingTabBar` (Library active). Empty state: "Add your first course" + ink `ActionPill` "Add notes".

### 04 Add notes (sheet)
Sheet on a dimmed scrim, radius 32 top. Title "Add notes" + close `IconButton`. Three 120-tall tiles: PDF or slides (selected = ink), Camera, Photos. `TextField` "Course" (select). Ink `ActionPill` "Choose file" + one line "Up to 25 MB or 150 pages · 4 uploads left today". Over-limit files are rejected before upload with a red soft block (FR-DOC-02).

### 05 Course
Back + options (`…`) `IconButton`s. Headline = course title ("Data Structures") + "CSC 225 · 4 documents". If something is processing: `HeroCard` with 60 ring "45%", file name, "Getting it ready. You can leave." Then document `ListCard`s with one-line status: ready ("7 topics"), OCR flag in warning colour ("2 pages hard to read"), failed in danger colour ("Couldn't read this file") + ink "Replace" pill, paused upload + ink "Retry" pill. Light `ActionPill` "Add notes".

### 06 Outline (dark detail screen)
Ink background. Field-coloured back + "view original" `IconButton`s. Title "Stacks and queues" (`display`, white) + "CSC 225 · 38 pages · 7 topics" (muted). Two pills: "Practise" (field) and "Ask your notes" (outlined). A ground-coloured sheet rises from the bottom (radius 32) titled "Topics": rows = 48 number circle + title + first page.

### 07 Explanation
Back + report `IconButton`s, "Topic 2 of 7" centred. Headline = topic title. `SegmentedPill`: Standard / Simple / Exam (FR-EXPL-02, cached per style). Body text 17/27 with inline `CitationChip`s; code in an ink block (radius 24, mono 13/22); `GroundingCallout` last. Thumbs up/down sit at the end of the article (FR-MOD-03). Ink `ActionPill` "Quiz me on this" (5-question quiz on this topic).

### 08 Chat
Back `IconButton` + "Ask your notes" / document title. User bubbles: ink, radius 24 with 8 bottom-right. Assistant bubbles: field, radius 24 with 8 bottom-left, `CitationChip`s under the text, `GroundingCallout` when needed. Thumbs and report on long-press (FR-MOD-01/03). Above the input: pills "Explain simpler", "Quiz me on this" (FR-CHAT-06). Input: 64 field pill with ink 52 send button. Streaming: text appears token by token (FR-CHAT-04).

### 09 Quiz setup
Close `IconButton`. Headline "Build a **quiz**" + "All topics · Mixed difficulty" with a "Change" pill (opens a sheet for scope and difficulty). "Question types" pills (multi-select). "Questions" as four 72 circles: 5, 10, 20, 30. "Mode" `SegmentedPill`: Practice / Exam. Ink `ActionPill` "Start 10 questions" (count updates). Defaults per FR-QGEN-01.

### 10 Question (objective)
Close + report `IconButton`s. `HeroCard`: "Multiple choice" + ring "7/10" + the question (26/32). Four `AnswerOption`s. After answering (practice mode): one line "Correct." / "Not quite." in success/danger + one-sentence explanation + `CitationChip`. Ink `ActionPill` "Next" (disabled until answered). Exam mode: timer in the header, no feedback until submit (FR-QUIZ-02).

### 11 Question (theory, marked)
`HeroCard`: "Theory · 6 marks", question, big score "4 / 6 marks". Rubric rows: field (or dangerSoft when 0) with ✓/✕ icon, criterion, marks; missed criteria show a one-line hint. Text button "See model answer". Ink `ActionPill` "Next". Offline answers queue and are marked on reconnect (FR-QUIZ-04).

### 12 Results (dark detail screen)
Ink background. Close button. Centred 168 ring with "70%", title, "10 questions · 12 min". Ground sheet "Revise next" with the weakest topics (score in danger/warning colour). Ink `ActionPill` "Practise these" + text button "Review answers".

### 13 Account (tab)
Avatar (ink circle) + name + "UNILAG · 200L" + "Edit" pill. Headline "Left **today**". Ink card with 2×2 tiles: Uploads 4/5, Quizzes 12/15, Explanations 25/30, Chat 38/40 (reset at 12:00 AM). Rows: "Privacy and terms", "Sign out". Danger text button "Delete account" → confirmation screen (FR-AUTH-05). `FloatingTabBar` (Account active).

### Not drawn — build from the components
- **Practice tab:** list of quizzes/attempts as `ListCard`s (title, score ring, date; "Resume" for in-progress, FR-QUIZ-05).
- **Source viewer:** full-screen page with the page number in the header.
- **Report sheet:** Wrong / Unclear / Inappropriate + optional note (FR-MOD-01).
- **Delete course dialog:** "Delete documents" or "Move to Unfiled" (FR-CRS-03).
- **New/rename course sheet:** course code (2–12 chars) + optional title (FR-CRS-01).
- **Quiz scope/difficulty sheet** opened by "Change" on 09.

## 8. Logo — "Checked Q"

A ring whose tail is a tick: question in, right answer out. Asset: `apps/mobile/assets/brand/logo.svg`.

- Geometry (100-unit grid): circle centre (44, 44), r 30, stroke 12; tick path `M60 72 L72 84 L94 60`, stroke 12; round caps and joins; use `viewBox="8 4 92 92"` so it is optically centred.
- Single colour only: ink on light, white on ink. Never outline, recolour or add effects.
- In the app: `<Logo size color />` with `react-native-svg`. On sign-in it sits in a 56 ink circle (white mark at ~30). Don't place the mark alone in small circles elsewhere, where it could read as a search button.
- **App icon / splash:** white mark (about 50% of the canvas) on `#0D0D10`. In `app.json`, set `expo-splash-screen.backgroundColor` and `android.adaptiveIcon.backgroundColor` to `#0D0D10`, and use the mark as `monochromeImage`. Replace the Expo placeholder icons in `assets/images/`.

## 9. Sign-in illustration

Asset: `apps/mobile/assets/brand/study-illustration.svg` (viewBox 0 0 340 230, about 5 KB). Build `components/StudyIllustration.tsx` from it with `react-native-svg` and animate with `react-native-reanimated`:

| Element | Motion |
|---|---|
| Notes page, cap, pencil, lightbulb, speech bubble | Float up and down 6–7 px, 3.6–5 s loops, offset phases |
| Head group | Sways ±2° around the neck (5 s) |
| Speech bubble | "?" cross-fades to ✓ and back (6 s cycle) |
| Mug steam | Two wisps rise and fade (2.8 s, offset) |
| Sparkles | Twinkle (scale 0.7→1, opacity 0.25→1, 3 s) |

Disable all motion when `AccessibilityInfo.isReduceMotionEnabled()` returns true. Give the SVG `accessibilityLabel="A student studying at a laptop"`.

## 10. States every screen handles

| State | Behaviour |
|---|---|
| Loading | Skeleton blocks shaped like the content; show cached data first (TanStack Query persisted to SQLite). |
| Empty | One sentence + the next action pill. |
| Error | Soft red block with FRD §4 copy + "Retry". Never a blank screen. |
| Offline | Ink pill banner "You're offline. Saved notes still work." Network actions show "Queued" and go to the outbox with a UUID idempotency key. |
| Limit (HTTP 429) | Amber block with count and reset time; disable only that action. |
| Queued job | Ring with `jobs.progress`; "High demand — we'll notify you when it's ready." when the circuit breaker is open. |

## 11. Copy

- **Do:** short headlines with one stressed word; plain English; course codes as students write them ("CSC 225"); levels as "200L"; say what happens next; sentence case.
- **Don't:** mention models, providers or tokens; hint that another student uploaded the same file (FR-DOC-06); use emoji, stock illustrations or exclamation marks in errors.

## 12. Build order

1. Foundation: fonts, `theme.ts`, `components/ui/*`, `Logo`, `(auth)` / `(tabs)` layouts, auth guard, offline hook (NetInfo), API error mapping.
2. M1: 01 Sign in, 02 Profile setup, 03 Library, 04 Add notes, 05 Course.
3. M2: 06 Outline, 07 Explanation (Markdown + KaTeX WebView only here), 08 Chat (SSE), source viewer.
4. M3: 09 Quiz setup, 10–11 Question, 12 Results, Practice tab.
5. M4: 13 Account, report sheet, outbox sync, dark-mode pass, 200% font-scale pass, reduce-motion pass.

## 13. Checklist before any UI PR

- [ ] Only theme tokens; no raw hex in screens.
- [ ] Every touchable has `accessibilityRole` and `accessibilityLabel`; targets ≥ 48.
- [ ] Works at 200% font scale and in dark mode.
- [ ] Loading, empty, error, offline and limit states implemented.
- [ ] AI text has citations or a grounding callout.
- [ ] `npx expo lint` and `npx tsc --noEmit` pass.
- [ ] PR description lists the FR IDs covered.
