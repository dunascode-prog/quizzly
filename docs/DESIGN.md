# Quizzly — Design Guidelines

| | |
|---|---|
| **Status** | v0.4 (replaces v0.3) |
| **Date** | 2026-10-26 |
| **Applies to** | `apps/mobile` (Expo SDK in `apps/mobile/package.json`, Expo Router) and the link-service landing page |
| **Related** | [PRD](PRD.md) · [FRD](FRD.md) · [Architecture](ARCHITECTURE.md) · [Build plan](BUILD_PLAN.md) |
| **Source of truth** | The "Quizzly MVP Design" canvas on claude.ai. Screen images live in `docs/design/` (`01-sign-in.png` … `30-admin-dashboard.png`, plus `01b`/`01c` sign-in steps, `-dark` versions of 25–30, the UI spec, type options and logo boards). |

This file is written for whoever builds the UI, human or Claude Code. Follow it exactly. Where it is silent, follow the FRD and keep to the look described here.

### What changed from v0.3

1. **Type:** Inter → **Bricolage Grotesque** (headlines, big numbers) + **Manrope** (everything else). §4.
2. **Accents:** four brand accents (Lagoon, Ankara, Palm, Lavender) join the monochrome base, with strict rules on where they may appear. §3.
3. **Sign-in is now a welcome screen** that sells the app while staying monochrome: the study illustration with three ink/white feature stickers, an ink hero card "Your notes, exam‑ready." with a short ticked list of what Quizzly does, and a "Get started" pill. Email and code are steps 2 and 3. §7 screen 01.
4. **Today is the home tab.** Tabs: Today, Library, Practice, Account.
5. **Eleven new screens (14–24)** for habits, sharing, notifications and invites, and the components they need. §6, §7.
6. **Screens 25–30** for v0.1 requirements that had no design yet: flashcards, past-question mode, rename/merge topics, save for offline, the original page viewer and the admin dashboard, each in light and dark. §7.

---

## 1. The look in one paragraph

Clean monochrome with confident type, and colour only where it carries meaning. A lavender-grey background, near-black ("ink") cards, white pill buttons and inputs, and big chunky Bricolage headlines with **one word set on an ink block**. Every screen has one job, one headline, one ink hero card and one main action pill at the bottom. Colour appears when it means something (green = correct, red = wrong, amber = "not in your notes" or warnings) or when it marks something that is the student's own: their course's accent ring, their chosen theme and a celebration. The welcome screen is fully monochrome.

## 2. Principles (with requirement sources)

| # | Principle | Source |
|---|---|---|
| 1 | **Light on the phone.** No photos, no gradients, no UI kit, no Lottie. The only artwork is the vector study illustration. Skeleton blocks instead of spinners. Only two bundled font families. | G4, NFR-01/02, NFR-15 |
| 2 | **Every AI answer shows its page.** Explanations, questions and chat replies carry outlined page chips ("p. 12") that open the source page (or the quote view in a shared course). | US-10, FR-QGEN-03, FR-CHAT-02, FR-DOC-10, FR-SHARE-02 |
| 3 | **Label what isn't from the notes** in a dashed amber frame titled "Not in your notes". Never mix it into grounded text. | FR-EXPL-03, FR-CHAT-03 |
| 4 | **Offline is normal.** Saved content works; network actions show "Queued" and sync via the SQLite outbox. | G5, FR-OFF-01/02 |
| 5 | **Upfront about limits.** Remaining daily usage is visible before it is spent. Errors use the exact FRD §4 copy. | FR-LIM-01/03, PRD §9 |
| 6 | **Contrast first.** All text pairs ≥ 4.5:1, touch targets ≥ 48 (icon buttons 52), layouts survive 200% font scale, right/wrong always uses an icon *and* a word. | NFR-08 |
| 7 | **One job per screen.** 20 px side gutters, 24 px between groups. If an element doesn't help the student act now, it moves to a menu, a sheet or further down. | — |
| 8 | **Kind, not pushy.** Celebrate progress, never shame a gap. Weekly goals instead of fragile streaks, one reminder a day at most, quiet hours, every nudge can be switched off. | NFR-14, PRD R10 |
| 9 | **Private by default in social features.** Other people only ever see a display name ("Ada O."), institution and level. Scores, chats and progress are never shown to anyone else. Sharing always says what is shared and what stays private. | FR-SHARE-02/05, FR-INV-02 |

## 3. Colour tokens

Defined in `apps/mobile/src/constants/theme.ts`. **Never hard-code hex values in screens.**

### 3.1 Base (unchanged from v0.3)

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
| `inactiveOnInk` | `#C9CAD3` | `#4D4E5A` | Inactive tab icons, unselected segments on ink |
| `line` | `#C5C6D3` | `#33343C` | Dividers, outlines, empty study-grid cells |
| `track` | `#3A3B44` | `#C5C6D3` | Ring/bar track on ink |
| `scrim` | `rgba(13,13,16,.6)` | `rgba(0,0,0,.7)` | Behind sheets |
| `success` / `successSoft` | `#186A33` / `#D6EEDC` | `#7BD69A` / `#16301F` | Correct, Ready, "Joined" |
| `danger` / `dangerSoft` | `#B42318` / `#F7DCD9` | `#FF9D94` / `#3A1C1A` | Wrong, Failed, Delete, Stop sharing |
| `warning` / `warningSoft` | `#7A5200` / `#F3E6C4` | `#F2C46D` / `#352A12` | Not-in-notes, OCR flag, limits |

### 3.2 Accents (new in v0.4)

`Accent` in `theme.ts`. Same values in light and dark. **Text on an accent is always ink (`#0D0D10`)**; never put white text or muted text on an accent.

| Token | Hex | Ink on it | Unlock (FR-HAB-07) |
|---|---|---|---|
| `lagoon` | `#2BB3A8` | 7.6:1 | First mastered topic |
| `ankara` | `#F28C38` | 7.9:1 | 10 topics mastered |
| `palm` | `#4CC46A` | 9.0:1 | Weekly goal met 4 weeks running |
| `lavender` | `#A08CF5` | 7.0:1 | 3 friends join through your invite |

Accents never appear on the welcome/sign-in screen (01) or the invite landing page (24); those stay ink, white and grey like the reference.

**Where accents may appear:**

1. A **course's own accent** (FR-CRS-05): its readiness ring, dot and chip. Never as a card fill.
2. The student's **chosen theme**: replaces white on ink for rings, the highlighted-word block on Today, unread dots and badges.
3. **Celebrations** (16), the theme list (18), the invite progress ring (23), the "Personal best" pill, the weekly recap readiness chart (17).
4. The live/unread dot (Lagoon) in notifications and the toast.

Accents never replace the semantic colours: correct is always `success`, wrong is always `danger`.

Checked contrast (light): muted on ground 6.0:1, muted on surface 6.9:1, mutedOnInk on ink 7.8:1, success on successSoft 5.4:1, danger on dangerSoft 5.1:1, warning on warningSoft 5.7:1, ink on every accent ≥ 7:1.


### 3.3 Dark mode (every screen is drawn in both)

Every screen 01–30 has a `-dark.png` next to its light image in `docs/design/`, and a "· dark" artboard on the canvas. Dark mode follows the phone setting (`userInterfaceStyle: "automatic"`) and Night study mode (FR-HAB-07).

- **Normal screens:** ground → black, surface → `#1B1C22`, field → `#26272E`, and **ink cards turn light** (`#F5F5FA` with ink text), so each screen keeps one high-contrast block. The floating tab bar and primary action pills invert the same way.
- **Ink "detail" screens** (06 Outline, 12 Results, 16 Celebrate): the ink top part becomes **dark grey `#1B1C22`, not white**, and the sheet below becomes black. In code: these screens use `hdr`/`onHdr` colours instead of `text`/`onInk` for the top part.
- **Extra tokens used by the dark drawings:** `inkTile` (tiles on ink cards: `#26272E` light / `#E4E5EC` dark), `onInkSoft` (soft text on ink: `#E4E5EC` / `#26272E`), `dangerText` (rubric hints: `#7F1910` / `#FFB4AC`), `dim` (behind sheets: `#5E5F6B` / black).
- **Unchanged in dark:** accent colours (text on them stays ink), the page image in the viewer (29) stays white, and the **weekly recap image (17) always exports in light** so it looks the same on WhatsApp.
- Check contrast on every new component in both modes; the study-days grid gets brighter as activity rises in dark mode.

## 4. Typography

Two families, bundled with `expo-font` (never downloaded at runtime):

```bash
npx expo install expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/manrope
```

- **Bricolage Grotesque Bold (700)** for screen headlines, card titles, big numbers (scores, countdowns, stats) and the "Quizzly" wordmark on the landing page. It is the chunky, slightly condensed "cut" grotesque from the reference.
- **Manrope** (400, 500, 600, 700) for body, labels, buttons, inputs, chips, captions.
- **Code in explanations:** the platform monospace.
- Remove Inter (`@expo-google-fonts/inter`, `assets/fonts/InterDisplay-SemiBold.ttf`) once every screen uses the new tokens.

| Token | Family | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `hero` | Bricolage Grotesque 700 | 44 / 44–48 | −1.3 | Welcome headline, Today greeting |
| `display` | Bricolage Grotesque 700 | 40 / 44 (min 32 / 38) | −1.0 | Screen headlines |
| `number` | Bricolage Grotesque 700 | 48–88 / 1.0 | −1.5 | Countdown "12 days", recap "142", ring values |
| `title` | Bricolage Grotesque 700 | 24–30 / 30–36 | −0.6 | Card titles, results title |
| `heading` | Manrope 700 | 18–20 / 24–26 | 0 | Section headings ("Today's plan") |
| `reading` | Manrope 400 | 17 / 27 | 0 | Explanation text |
| `body` | Manrope 400 | 15 / 23 | 0 | General text |
| `label` | Manrope 600 | 15–17 / 20 | 0 | Buttons, options, chips, list titles |
| `small` | Manrope 400–500 | 13–14 / 18–20 | 0 | Meta, helper text |
| `caption` | Manrope 600 | 12 / 16 | 0 | Field labels, chips, uppercase section labels (+0.4 tracking) |

**Highlighted word:** each screen headline puts one word (or a short phrase) on an ink block (`background: ink`, `color: onInk`, horizontal padding 10, radius 12), or on the theme accent with ink text when a theme is chosen. Examples: "Revise your **courses**", "Daily 5 **done**". Implement as `<HighlightText>` (exists).

## 5. Shape, space, motion

- **Radius:** pills/buttons/chips/tab bar `999`; cards `28`; welcome hero `32`; sheets `32` (top corners); fields, options and tiles `20–24`; small icon squares `14`; study-grid cells `8`.
- **Spacing:** `Spacing` keys (2, 4, 8, 12, 16, 20, 24, 32, 64). Screen padding 28 top / 20 sides / 28 bottom (welcome screen 24 / 20 / 22). 24 between groups, 8–12 between items.
- **Depth:** no shadows or blur. Depth comes from ground → surface → field → ink. The welcome stickers get a 1.5 px ink outline instead of a shadow.
- **Motion** (all with `react-native-reanimated`; all off when `AccessibilityInfo.isReduceMotionEnabled()`):

| Where | Motion |
|---|---|
| Welcome illustration | §9 |
| Welcome stickers | Pop in on mount (scale 0.6 → 1.06 → 1, 500 ms, staggered 0 / 150 / 300 ms), then bob ±6 px every 3.6 s with offset phases, keeping their tilt (−6°, 5°, −4°) |
| Toast (FR-NOTIF-02) | Slides down from the top 250 ms, auto-hides after 6 s, swipe up to dismiss |
| Rings and readiness | Animate from the previous value 600 ms ease-out |
| Celebration (16) | Ring fills, rays fade in, one light haptic (`expo-haptics`). No confetti |
| Screen transitions | Default native stack |

## 6. Components (`src/components/ui/`)

### 6.1 Existing (update fonts only unless noted)

| Component | Spec |
|---|---|
| `ActionPill` | 64 tall, radius 999. Left: 52 circle with icon. Centre: label (Manrope 600–700, 17). Right: `›››` in muted colour (decorative, `accessible={false}`). Variants: `ink` (ink fill, field-coloured circle, white text — the primary action on most screens) and `light` (field fill, ink circle, ink text — used on the welcome steps, like the reference). Loading: the circle becomes a progress ring. One per screen, pinned at the bottom. |
| `IconButton` | 52 circle. Tones `light` (field) and `ink`. `accessibilityLabel` required. Optional `badge` (v0.4: number on a Lagoon dot, top-right, for the bell). |
| `Pill` | 44–48 tall chip or small button. Selected = ink fill + white text; unselected = field fill. |
| `SegmentedPill` | Ink track (padding 5, radius 999); selected segment is a field-coloured pill. `accessibilityRole="tablist"` / `"tab"`. |
| `HeroCard` | Ink card, radius 28, padding 20–22. Slots: small muted label, optional `ProgressRing` top-right, title, optional action pill. |
| `ListCard` | Surface fill, radius 24, padding 14–18. Optional leading 48 ink circle (course code), title (Manrope 600, 17), meta (13 muted), trailing chevron. **v0.4:** optional `tag` ("Shared by Ada") and accent dot. |
| `ProgressRing` | 52–68 (168 on Results/Celebrate). Fill `onInk` or the course/theme accent; track `track`. Always shows a number inside. |
| `TextField` | 64 tall, field fill, radius 20. Small label (12/600 muted) above the value (16/600). Focused = 2 px ink border. |
| `CodeField` | Six 64-tall cells; current cell has a 2 px ink border. |
| `AnswerOption`, `CitationChip`, `GroundingCallout`, `Banner`, `Sheet`, `TextButton`, `Skeleton` | As v0.3. |
| `FloatingTabBar` | Ink pill, 68 tall. **v0.4 tabs: Today (home), Library, Practice, Account.** Active tab = field pill with icon + label; inactive = 52 icon-only circles. |
| `Logo`, `StudyIllustration` | §8, §9. |

### 6.2 New in v0.4

| Component | Spec | Used on |
|---|---|---|
| `Sticker` | 34 tall pill with a 1.5 px ink outline, two tones: field fill + ink text with a 24 ink circle and white icon, or ink fill + white text with a field circle and ink icon. Manrope 700 13. Fixed tilt, pop + bob motion (§5). Decorative: `accessibilityElementsHidden`; the illustration area has one label describing the features. | 01 |
| `FeatureList` | Stacked rows inside an ink card, gap 10, vertically centred: a 26 field-coloured (white) circle with a 14 ink tick, then one line of text (Manrope 15/21, `#E4E5EC`) that starts with a bold white verb ("**Upload** slides or note photos"). Written like a short write-up, not tiles. Same pattern on the landing page (24) and the join screen (20). | 01, 20, 24 |
| `Toast` | Ink card, radius 24, top of screen under the status bar: avatar (40), bold actor + text, meta, a field "View" pill and a close button. Lagoon dot when live. `accessibilityLiveRegion="polite"`. | 14, global |
| `WeekStrip` | 7 circles (M–S, 28): studied = ink fill; today = dashed outline; future = field. Caption "3 of 4 study days". | 14, 15 |
| `PlanRow` | Field row, radius 22, min 64: 44 leading circle (ink play icon when it's the next item, outlined otherwise), title (Manrope 700), meta ("5 questions due · 3 min"), chevron. | 14 |
| `CountdownCard` | `HeroCard` variant: course code + accent dot, "exam in", big `number` "12 days", "You're 64% ready. Up 18% this week." and a 68 ring. | 14 |
| `StudyGrid` | 5 × 7 cells (34 tall, radius 8), 4 intensity fills (field, `#A3A4AE`, `#4D4E5A`, ink), today outlined in Lagoon; "Less · · · More" legend. Each cell has an `accessibilityLabel`. | 15 |
| `StatTile` | `inkRaised` tile inside an ink card: muted label + `number`. | 13, 17 |
| `ToggleRow` | Field row, radius 22, label + optional helper, 52×32 switch (on = ink track, white knob). `accessibilityRole="switch"`. | 18, 21 |
| `ThemeRow` | Field row: 40 accent swatch, name + unlock rule, check (selected) or lock icon (locked; disabled, says how to unlock). Selected row has a 2 px ink border. | 18 |
| `MateChip` | 52 pill: 40 initials circle + first name; selected = ink fill. Multi-select. | 19 |
| `AvatarStack` | Up to 3 overlapping 32 initials circles + count text. Only shown when the count ≥ 3. | 20 |
| `NotificationRow` | Field row, radius 22: 48 avatar (initials, or the Logo mark for system events), bold actor + text, time, Lagoon unread dot, optional inline pills ("Add to library" ink, "View" light). | 22 |
| `FilterPills` | Row of `Pill`s (All / Shared with me / Study). | 22 |
| `LinkCard` | Ink card: "Your invite link" label, the link (Manrope 700 17, breaks anywhere), helper text, a field "Copy link" pill (turns Lagoon "Copied ✓" for 2 s), and a 112 QR code (`react-native-qrcode-svg`, ink on field). | 19, 23 |
| `ShareTargets` | Three equal pills: WhatsApp (ink), Status / Story, More (system share sheet). | 17, 23 |
| `InviteProgress` | 60 ring in Lavender with "2/3" + "1 more friend to go" + reward line, then friend rows (initials, name, "Joined" in success). | 23 |
| `PrivacyList` | Two groups with uppercase captions: "THEY GET" (ink ticks) and "STAYS PRIVATE" (lock icons). | 19, 20 |
| `RecapCard` | Ink card designed to be captured as an image (1080×1920 when shared): logo, name/school (optional), big number, stat tiles, readiness donut, footer with the invite link. | 17 |

Icons: 24 grid, 2 px stroke, round caps and joins (Lucide-style, `lucide-react-native` or inline `react-native-svg`). Never emoji.

## 7. Screens

Routes live in `src/app/`. A root redirect sends signed-out users to `(auth)`, users without institution/level to `onboarding` (FR-PROF-01), and applies a pending invite/share code after onboarding (FR-AUTH-07).

| # | Route | Screen | Requirements | Data |
|---|---|---|---|---|
| 01 | `(auth)/sign-in.tsx` | Welcome → email → code | FR-AUTH-01/02/03 | Supabase Auth |
| 02 | `onboarding.tsx` | Profile setup | FR-PROF-01/02, FR-AUTH-03 | `profiles`, `institutions` |
| 14 | `(tabs)/index.tsx` | **Today (home)** | FR-HOME-01..06 | `GET /home`, Realtime |
| 03 | `(tabs)/library.tsx` | Library (image `03-library-home.png`) | FR-CRS-01/02, FR-LIM-01, FR-SHARE-05 | `courses`, `documents`, memberships |
| 04 | `upload.tsx` (formSheet) | Add notes | FR-DOC-01/02/03 | `POST /documents` → signed PUT → `POST /documents/{id}/uploaded` |
| 05 | `course/[id]/index.tsx` | Course | FR-CRS-03/04, FR-DOC-04–09/12 | `documents`, `jobs.progress` |
| 06 | `document/[id]/index.tsx` | Outline | FR-TOP-01 | `GET /documents/{id}/outline` |
| 07 | `document/[id]/topic/[topicId].tsx` | Explanation | FR-EXPL-01–05, FR-MOD-01/03 | `explanations` |
| 08 | `document/[id]/chat.tsx` | Chat | FR-CHAT-01–06, FR-SEC-14 | SSE |
| 29 | `document/[id]/page/[n].tsx` | Original page viewer (own docs) / quote view (shared) | FR-DOC-10, FR-SHARE-02 | signed URL (5 min) / chunk text |
| 09 | `quiz/new.tsx` | Quiz setup | FR-QGEN-01/07/08 | `POST /quizzes` |
| 10–11 | `quiz/[id]/play.tsx` | Question (objective + theory) | FR-QUIZ-01–05, FR-SEC-12 | `GET /quizzes/{id}`, outbox |
| 12 | `quiz/[id]/results.tsx` | Results | FR-QUIZ-06 | `quiz_attempts` |
| 15 | `daily5/done.tsx` | Daily 5 done + weekly goal | FR-HAB-01..04 | `GET /home`, `study_days` |
| — | `daily5/index.tsx` | Daily 5 (uses `play.tsx` UI) | FR-HAB-01 | `GET /daily5` |
| 16 | `celebrate/[achievementId].tsx` (modal) | Celebration | FR-HAB-05 | `achievements` |
| — | `(tabs)/practice.tsx` | Practice history | FR-QUIZ-05/07 | `quizzes`, `quiz_attempts` |
| 13 | `(tabs)/account.tsx` | Account | FR-AUTH-04/05, FR-LIM-01 | `profiles`, `usage_counters` |
| 17 | `recap/[week].tsx` | Weekly recap | FR-HAB-06 | `GET /recap/{week}` |
| 18 | `settings/themes.tsx` | Themes and study modes | FR-HAB-07 | `profiles`, `achievements` |
| 21 | `settings/reminders.tsx` | Reminders | FR-HAB-08 | `notification_settings` |
| — | `settings/privacy.tsx` | Privacy and blocking | FR-SHARE-09, FR-INV-02 | `profiles`, `user_blocks` |
| 19 | `course/[id]/share.tsx` (formSheet) | Share a course | FR-SHARE-01/02/07/10 | `POST /courses/{id}/share` |
| — | `course/[id]/members.tsx` | Members of a shared course | FR-SHARE-07 | `GET /courses/{id}/members` |
| 20 | `c/[code].tsx` and `share/[memberId].tsx` | Join a shared course | FR-SHARE-03/04, FR-AUTH-07 | `GET /shares/...` |
| 22 | `notifications.tsx` | Notifications inbox | FR-NOTIF-04 | `notifications` |
| 23 | `invite.tsx` | Invite friends | FR-INV-01/04/05 | `GET /me/invite` |
| — | `i/[code].tsx` | Invite deep link (stores code, routes on) | FR-INV-02/03 | — |
| 24 | web: `INVITE_DOMAIN/i/{code}`, `/c/{code}` | Invite / share landing (mobile web) | FR-INV-02, FR-INV-06 | link service |
| 25 | `document/[id]/topic/[topicId]/cards.tsx` | Flashcards (front, back, finished) | FR-QGEN-10 | `GET /topics/{id}/flashcards`, `review_queue` |
| 26a | `past-questions/upload.tsx` (formSheet) | Add past questions | FR-QGEN-09, FR-DOC-01..03 | `POST /courses/{id}/past-papers` |
| 26b | `quiz/new.tsx` (style row) | Quiz setup with past-question style | FR-QGEN-01, FR-QGEN-09 | `POST /quizzes {style}` |
| 27 | `document/[id]/index.tsx` (sheets) | Rename / merge topics | FR-TOP-03 | `PUT /documents/{id}/topic-overrides` |
| 28 | `course/[id]/offline.tsx` (formSheet) | Save course for offline | FR-OFF-03 | `GET /courses/{id}/offline-manifest` |
| 30 | admin web: `/admin` | Costs and reports | FR-LIM-02, FR-MOD-01/02/04 | `llm_calls`, `reports` (service role) |

Move the current Library from `(tabs)/index.tsx` to `(tabs)/library.tsx`; Today takes `index`.

### 01 Sign in — welcome (redesigned, monochrome)
Follows the reference: ground background, padding 24/20/22, no accent colours. **Top row:** only the logo in a 52 ink circle (no pill, no wordmark). **Illustration area** (flex, fills the free space): the animated `StudyIllustration` at about 320 wide, with three `Sticker`s around it: "Slides in" (field, up arrow, top-left), "20 exam questions" (ink, tick, top-right), "Cited from page 14" (field, "p.", bottom-right). **Ink hero card** (radius 32, padding 24/22/20): "Your notes,⏎exam‑ready." (`hero` 44) with a diagonal ↗ arrow (up-right) top-right, then a `FeatureList`: ✓ **Upload** slides or note photos · ✓ **Understand** it in plain English · ✓ **Practise** exam-style questions · ✓ **Check** the page every answer cites. **Bottom:** light `ActionPill` "Get started" (ink circle with a book icon), then two text buttons side by side: "Continue with Google" (ink) and "I have an account" (muted). Footer: terms + privacy links (12 muted).
**Step 2 (email):** the illustration and card stay; the card drops the list. Below: Email `TextField` labelled "Email · we'll send a 6‑digit code", light `ActionPill` "Send my code", text button "Back". **Step 3 (code):** `CodeField`, light `ActionPill` "Verify" (tick), text button "Use a different email · Resend in 0:42" (60 s countdown). Images: `01-sign-in.png`, `01b-sign-in-email.png`, `01c-sign-in-code.png`.

**Small phones (v0.4.1).** The welcome screen must never cut the hero card. Layout rules, in order of priority:
1. The hero card, the "Get started" pill, the two text buttons and the terms line are fixed size and always fully visible.
2. The illustration takes whatever height is left (`flex: 1`, `minHeight: 0`) and scales down with its aspect ratio (max 320 × 216).
3. **Compact mode when the window height is under 740 dp** (`useWindowDimensions`): hide the three stickers, headline 36/38 instead of 44, feature list 14/19 with 7 px gaps, card padding 20. See `01d-sign-in-small-phone.png` (360 × 640).
4. **Under 600 dp, or at large font scales**, hide the illustration entirely; if the content still doesn't fit (e.g. 200% font), the middle becomes a `ScrollView` while the "Get started" pill stays pinned at the bottom.


### 02 Profile setup
Back `IconButton`. Headline "Where do you **study?**". Fields: Full name, Institution (searchable; "My school isn't listed"), Department. "Level" pills: 100L–500L, Other. Terms checkbox. Ink `ActionPill` "Start studying". After this, a pending share/invite code is applied (FR-AUTH-07).

### 03 Library (tab)
Header: initials avatar, "Hello, Tolu" + "12 quizzes left today", ink `IconButton` "+" (opens 04). Headline "Revise your **courses**". `HeroCard` "Continue · CSC 225" with ring and "RESUME". `ListCard`s per course, with the course accent dot and, for joined courses, the tag "Shared by Ada". Floating tab bar (Library active). Empty: "Add your first course" + "Add notes", and a secondary "Join with a link" text button.

### 04 Add notes (sheet) · 05 Course · 06 Outline · 07 Explanation · 08 Chat · 09 Quiz setup · 10 Question · 11 Theory · 12 Results
As v0.3 (see images 04–12), with the new type. Additions:
- **05 Course:** the meta line shows the exam date ("CSC 225 · 4 documents · Exam 7 Nov"); the share `IconButton` opens 19; the `…` menu has Rename, Exam date, Accent colour, Members (if shared), Delete. In a joined course: tag "Shared by Ada", no upload/rename/delete; `…` has "Leave course" and "Report course".
- **07 Explanation / 08 Chat in a shared course:** citation chips open the quote view (text of the cited passage), not the page image.
- **10 Question (exam mode):** timer in the header; answers aren't revealed until Submit (FR-SEC-12).

### 13 Account (tab)
Avatar + name + "UNILAG · 200L" + "Edit". Headline "Left **today**". Ink card with 2×2 `StatTile`s: Uploads, Quizzes, Explanations, Chat (remaining / max). Rows: **Themes and study modes** (→18), **Reminders** (→21), ink row **Invite friends to Quizzly** with "2 joined" (→23). Small pills: **Privacy** (→ privacy and blocking), **Sign out**, danger text **Delete account** (→ confirmation: type DELETE; explains shared courses stop being shared).

### 14 Today (home tab)
Header: initials avatar, date ("Monday, 26 October"), bell `IconButton` with unread badge (→22). Greeting "Good evening, **Tolu**". `CountdownCard` for the nearest exam with the course accent ring. "This week" `WeekStrip` card with "3 of 4 study days". "Today's plan · About 15 min": `PlanRow`s Daily 5 (5 questions due · 3 min), Fix a weak topic (topic · 5 questions), Learn something new (topic · 6 min read). Floating tab bar (Today active). The live `Toast` slides in at the top for shares ("Ada O. shared CSC 225 with you · Just now · 31 topics, 240 questions · View"). **New user:** countdown card asks "When is your first exam?"; plan shows "Upload your first notes" and "Join a shared course".

### 15 Daily 5 done + weekly goal
Ink check circle + "Daily 5 **done**" + "5 of 5 correct · 2 min 40 s". Ink card "Weekly goal met · 4 of 4 days" with `WeekStrip` (today in Lagoon) and "3 weeks in a row. Missing a day never resets your week." Surface card "Your study days · 19 in 5 weeks" with `StudyGrid`. Ink `ActionPill` "Next: fix a weak topic" + text button "Done for today".

### 16 Celebration (modal)
Ink full screen. Close button, Lagoon pill "Personal best" (or the achievement kind). 168 ring "80%" with rays. Title "Topic **mastered**" + "Evaluating expressions · CSC 225". Ground sheet: "Since last Monday" before/after bars (0% → 80%), "CSC 225 readiness 64% → 71%", ink row "New theme unlocked: Lagoon" (→18). `ActionPill` "Back to today". At most one per session (FR-HAB-05).

### 17 Weekly recap (share)
Close button, "Your week · 19–25 Oct". `RecapCard`: logo, "Tolu · UNILAG 200L", "This week I answered **142** practice questions", tiles Topics mastered 3 · Study days 4/4, readiness 71% +18% with a Lagoon donut, footer "Study smarter with Quizzly · {invite link}". `ShareTargets`: WhatsApp, Story, Save image. A toggle in the `…` menu hides name and school.

### 18 Themes and study modes
Back. Headline "Make it **yours**". Ink preview card: ring in the selected accent "71%", "Lagoon accent · Rings, highlights and badges use this colour." `ThemeRow`s: Ink (Default), Lagoon (Unlocked: first mastered topic), Ankara (Master 10 topics, locked), Palm (Meet your weekly goal 4 weeks running, locked), Lavender (3 friends join Quizzly, locked). `ToggleRow`s: Night study mode (Dark from 9 PM, calmer animations), Low-data mode (This week: 3.2 MB used).

### 19 Share a course (sheet)
Title "Share **CSC 225**" + "Coursemates study it without uploading", close button. `PrivacyList` — THEY GET: Outlines and explanations · 31 topics; Practice questions · 240; Notes you add later, automatically. STAYS PRIVATE: Your scores, chats and progress; Original files (they see quoted pages only). "SEND IN QUIZZLY · THEY'RE NOTIFIED INSTANTLY": a search `IconButton` (enter a Quizzly code) + `MateChip`s (wrap). Invite link row "{domain}/c/7KQ2M9XD" + Copy. Ink `ActionPill` "Share to WhatsApp" (or "Send to 2" when chips are selected). Footer: "4 coursemates joined" (→ members) and danger text "Stop sharing" (confirm dialog).

### 20 Join a shared course
Close button. Sharer row: "Ada O. shared a course with you". Ink card: "CSC 225 · UNILAG · 200L", title "Data Structures", tiles 4 notes · 31 topics · 240 questions, `AvatarStack` "12 coursemates are studying this" (only if ≥ 3). Ticks: "Ready now. No uploading, no waiting." · "Your scores and progress stay private." · "New notes Ada adds appear for you too." `ActionPill` "Add to my library" + text button "Not now" (declines). `…` menu: Block Ada, Report.

### 21 Reminders
Back. Headline "Nudge me **kindly**". Ink card "Preview on your lock screen" with two sample notifications. `ToggleRow` "Daily study reminder · Only if you haven't studied yet" with an ink time pill "7:30 PM" (opens a time picker). Toggles: Exam countdown, Questions due for review, Weekly recap on Sunday, Coursemate joins and challenges (off by default), Notes ready to study. Footer: "Quiet hours 11 PM – 7 AM · At most 2 reminders a day" (tap to edit quiet hours).

### 22 Notifications (inbox)
Back + "Mark all read" pill. Headline "Notifications" + ink pill "2 new". `FilterPills` All / Shared with me / Study. `NotificationRow`s, newest first; a pending share shows "Add to library" + "View" inline and becomes "Added to your library" after tapping. Long-press a person's row: Block, Turn off this type. Empty: "You're all caught up."

### 23 Invite friends
Back. Headline "Study with your **friends**". `LinkCard` with "{domain}/i/TOLU7", "Opens the app, or the download page if they don't have it.", Copy, QR. `ShareTargets` WhatsApp / Status / More. `InviteProgress`: Lavender ring "2/3", "1 more friend to go · 3 friends join → unlock the Lavender theme", friend rows (Kemi B. Joined, Femi E. Joined, "Your next friend · Preview link").

### 24 Invite / share landing (mobile web, link service)
Same tokens and fonts as the app (web fonts from Google Fonts are fine here). A grey URL pill shows the link (in the canvas only, to explain context). Logo + "Quizzly" wordmark. Inviter card: "**Tolu** (UNILAG, 200L) invited you to study together on Quizzly" (hidden if the inviter turned identity off; for `/c/` links: "Ada shared CSC 225 with you"). Ink card "Your notes, **made clear.**" with three ticks (upload, explanations and questions, share with coursemates). `ActionPill` "Get it on Google Play" (download icon). Footer: "iPhone: coming soon · Join the waitlist" and "Already have Quizzly? Open the app". On desktop: the same card centred with a QR code.

### 25–30: more study tools (from the v0.1 FRD; drawn in light and dark)

All six use the same tokens; the dark images (`*-dark.png`) show the dark token set from §3.1, where ink cards turn light (`#F5F5FA`) and the ground turns black. Typography is Bricolage Grotesque + Manrope (not Inter).

#### 25 Flashcards (FR-QGEN-10)
Header: close `IconButton`, centred "Flashcards · CSC 225" + topic name, report `IconButton`. Headline "Flip and **recall**". Progress: "4 of 20" + "3 known · 0 missed" and a 6 px bar. The **ink card** fills the free height and is one big touch target (`accessibilityRole="button"`, label "Flip card to see the answer"): front = "QUESTION" caption + the term/question (`title`, 32/38) + "Tap to flip"; back = "ANSWER" caption + answer (22/30 bold) + a one-line extra in `mutedOnInk` + a `CitationChip` (outlined in `onInk`) "p. 6 · From your notes" + "Flip back". Flip is a 250 ms Y-rotation (cross-fade under reduce motion). Under the card: two 56-tall field pills **Didn't know** (✕) and **Knew it** (✓); the chosen one gets a 2 px `text` border (no red/green — this is self-rating, not marking). Choosing one also flips to the back. Main action: ink `ActionPill` "Next card". **Finished:** headline "Round **done**", ink card with a 96 ring "60%" + "12 of 20 known" + "The 8 you missed will come back in your Daily 5.", list "Cards to go over" (surface rows with the question and a page chip, "+ 5 more"), `ActionPill` "Review the 8 you missed" (flip icon), text button "Back to topic". Missed cards go to `review_queue` box 1.

#### 26a Add past questions — sheet (FR-QGEN-09)
Scrimmed sheet, radius 32. Title "Add past **questions**" + close. Ink card "HOW IT WORKS": three numbered rows (1 Upload a past paper for this course · 2 Quizzly learns its style: question types, wording and marks · 3 New questions copy that style, using only your notes) + "We never reuse the old questions or answers word for word." `TextField` Course. "Year" radio pills 2024 / **2023** / 2022 / Older. Two tiles: Photos (camera) and PDF (file; selected = ink). `ActionPill` "Choose PDF" (or "Take photos") + "Up to 25 MB · counts as 1 upload today".

#### 26b Quiz setup with past-question style (FR-QGEN-09)
Screen 09 plus an **ink style card** under the headline: 48 circle with a history icon, "Style" caption, "Past questions (CSC 225, 2023)", a "Change" pill, and "Same format as the 2023 paper. Every answer comes from your notes." With a past-paper style the type chips collapse into one surface row "Matches the paper: **Theory, Short answer**" with an "Edit" pill (opens the type chips). Count circles and the Practice/Exam segmented pill as 09; Exam is pre-selected for past-paper style.

#### 27 Rename or merge topics (FR-TOP-03)
On screen 06, **long-press** a topic row (also available from a `…` on the row for TalkBack users) → scrimmed sheet:
- **27a Menu:** the topic (48 ink number circle, title, "Topic 2 · p. 6–11") + close; two 72-tall field option rows with an ink icon circle: **Rename** ("Give it a name that makes sense to you") and **Merge with next topic** ("Combine with 3 · Array vs linked list"); info note "Only you see these changes. Coursemates and shared copies keep the original names." (Hide Merge on the last topic.)
- **27b Rename:** "Rename **topic**", focused `TextField` "Topic name" with a clear button, "Was: Push, pop and peek" and a 0/60 counter, info note, `ActionPill` "Save name", text button "Reset to original name" (only when renamed).
- **27c Merge:** "Merge **topics**", ink preview card: the two topics as `inkRaised` rows with page ranges → "BECOMES ONE TOPIC" + combined title + "Topic 2 · p. 6–17 · 12 pages"; `TextField` "Name for the merged topic"; info note "Only you see this. Your outline goes from 7 to 6 topics; nothing is deleted, and you can split them again."; `ActionPill` "Merge topics"; "Cancel". Merged topics can be split from the same sheet ("Split back into 2 topics").

#### 28 Save course for offline (FR-OFF-03)
From the ink download `IconButton` on screen 05 → sheet:
- **28a:** "Save for **offline**"; ink card "WHAT WE'LL SAVE" with ticked rows (12 explanations · All 3 styles you've opened / 4 quizzes · 80 questions with answers / Outlines · For all 4 documents), a divider, "About **3.2 MB**" and "Original files stay online. Chat needs internet."; `ToggleRow` "Only download on Wi‑Fi"; note "New notes you add to CSC 225 are saved automatically while this is on."; `ActionPill` "Download".
- **28b In progress:** "Saving for **offline**"; ink card with an 88 ring "62%", "2.0 of 3.2 MB", "You can leave this screen. We'll keep going.", and per-part rows (✓ Outlines 4 of 4, ✓ 12 explanations Done, spinner Quizzes 2 of 4); `ActionPill` "Keep studying" (closes the sheet; download continues), text button "Cancel download".
- **28c Saved:** on screen 05 the ink hero becomes "✓ Saved for offline · 3.2 MB · Updated just now" with an "Update" pill; each document row adds "✓ On this phone".

#### 29 Original page viewer (FR-DOC-10)
Opens from any `CitationChip` on your own documents. Header: back `IconButton` ("Back to explanation"), centred "Page 4 of 25" + file name (ellipsised), "All pages" grid `IconButton`. The page image fills the remaining height on the ground (black in dark mode); the page itself stays white. The cited passage is tinted with a translucent amber highlight. A one-time ink hint chip "Pinch to zoom · double-tap to fit" pulses three times, then hides. Bottom: floating ink bar (68) with previous/next 52 circles and "4 / 25 · Cited page" + a thin progress bar. Swipe left/right also pages. In a shared course the chip opens the quote view instead (FR-SHARE-02).

#### 30 Admin dashboard (web, 1280; FR-LIM-02, FR-MOD-02)
Sidebar (`hdr` colour): logo + "Quizzly Admin", nav pills Overview / AI costs / Reports (count badge) / Takedowns / Limits, footer status. Main: date line + headline "Costs and **reports**" + Today / 7 days segmented pill.
- **Ink cost card:** "AI cost today $0.42 of $2.00 daily budget" with a budget bar ("21% used · breaker trips at 100%"), "Last 7 days $2.69", and **three small-multiple bar charts** (Groq, OpenRouter, Cloudflare), one series each, so no categorical colours are needed: seven bars per provider, today solid with its value labelled, earlier days at 42% opacity, one mid gridline, a hover tooltip per bar ("Groq · Tue · $0.21").
- **Calls and tokens table:** Provider × (Today: Calls, Tokens, Cost | Last 7 days: Calls, Tokens, Cost) with a Total row; tabular numbers.
- **Reports queue:** filter pills (All 14 · Questions 9 · Explanations 3 · Chat answers 2 · Auto-hidden 3); columns Type, Reason, Note, Reports, Date, Status, Actions. Rows with ≥ 3 reports from different students show an amber **Auto-hidden** chip (eye-off icon) and the actions View / Keep hidden / Dismiss (Dismiss restores it); other rows show "Open" and View / Hide / Dismiss.

### Not drawn — build from the components
- **Practice tab:** quizzes and attempts as `ListCard`s (title, score ring, date; "Resume" for in-progress).
- **Daily 5 play:** screen 10's UI with "Daily 5 · 3 of 5" in the header.
- **Quote view (shared courses):** the quoted passage on a field card with "From Ada's notes · p. 14" (the own-document viewer is screen 29).
- **Report sheet:** Wrong / Unclear / Inappropriate (+ Copyright for shared courses) + optional note ≤ 500 chars.
- **Delete course dialog:** "Delete documents" or "Move to Unfiled"; if shared: "Members will lose access."
- **New / edit course sheet:** Course code (2–12), optional title, **Exam date** (optional date picker, "Add exam date for a countdown"), accent swatches.
- **Members (shared course):** list of display names with a `…` per row → Remove; "Regenerate link"; "Stop sharing".
- **Privacy and blocking:** "Who can send me courses" (Coursemates only / Anyone with my code / No one), "Show my name on invite links and recaps" toggle, Blocked people list with Unblock, links to Privacy Policy and Terms.
- **Delete account confirmation:** explains what is deleted, type DELETE, danger `ActionPill`.
- **Quiz scope/difficulty sheet** opened by "Change" on 09.
- **iPhone waitlist form** on the landing page: email + consent checkbox + "Join the waitlist".

## 8. Logo — "Checked Q"

A ring whose tail is a tick: question in, right answer out. Asset: `apps/mobile/assets/brand/logo.svg` (exists; component `src/components/logo.tsx`).

- Geometry (100-unit grid): circle centre (44, 44), r 30, stroke 12; tick path `M60 72 L72 84 L94 60`, stroke 12; round caps and joins; `viewBox="8 4 92 92"`.
- Single colour only: ink on light, white on ink. Never outline, recolour or add effects.
- On the welcome screen it sits in a 48 ink circle (white mark ~26). It also appears in 40–48 circles as the avatar for system notifications and on the recap card; don't use it as a generic button icon.
- App icon / splash: white mark (~50%) on `#0D0D10`.

## 9. Sign-in illustration

Asset: `apps/mobile/assets/brand/study-illustration.svg` (viewBox 0 0 340 230; component `src/components/study-illustration.tsx` exists). **v0.4:** shown at about 320 × 216 on the ground with three stickers around it; ink lines, `#F5F5FA` fills; the "?" uses Bricolage Grotesque 700.

| Element | Motion |
|---|---|
| Notes page, cap, pencil, lightbulb, speech bubble | Float 6–7 px, 3.6–5 s loops, offset phases |
| Head group | Sways ±2° (5 s) |
| Speech bubble | "?" cross-fades to ✓ and back (6 s) |
| Mug steam | Two wisps rise and fade (2.8 s, offset) |
| Sparkles | Twinkle (scale 0.7→1, opacity 0.25→1, 3 s) |

All motion off under reduce motion. The hero container has `accessibilityLabel="A student studying at a laptop. Quizzly turns slides into exam questions with page citations."`

## 10. States every screen handles

| State | Behaviour |
|---|---|
| Loading | Skeleton blocks shaped like the content; cached data first (TanStack Query persisted to SQLite). |
| Empty | One sentence + the next action pill. |
| Error | Soft red block with FRD §4 copy + "Retry". Never a blank screen. |
| Offline | Ink pill banner "You're offline. Saved notes still work." Network actions show "Queued" and go to the outbox. Share, invite and inbox actions say "Needs internet". |
| Limit (HTTP 429) | Amber block with count and reset time; disable only that action. |
| Queued job | Ring with `jobs.progress`; "High demand — we'll notify you when it's ready." when the breaker is open. |
| Realtime | No UI when disconnected; catch up on reconnect (FR-NOTIF-07). |
| Revoked / taken down | Shared course rows show "No longer shared" with a "Remove" pill; opening shows the FRD §4 message. |

## 11. Copy

- **Do:** short headlines with one stressed word; plain English; course codes as students write them ("CSC 225"); levels as "200L"; say what happens next; sentence case; celebrate effort ("4 of 4 days").
- **Do (social):** always name what's shared and what stays private; show people as "Ada O.".
- **Don't:** mention models, providers or tokens; hint that another student uploaded the same file; use emoji, stock images or exclamation marks in errors; use guilt or fear ("You'll lose your streak!", "Your classmates are ahead of you").

## 12. Build order (UI)

See [BUILD_PLAN.md](BUILD_PLAN.md) for the full sequence including backend work. UI order:

1. Fonts + `theme.ts` (Bricolage/Manrope, `Accent`), update existing components, remove Inter.
2. 01 Welcome sign-in (monochrome: stickers, ticked feature list in the hero card, three steps).
3. Tabs: Today becomes `index`, Library moves to `library`; 14 Today with `GET /home`.
4. Daily 5 + 15, then 16 Celebration.
5. Notifications: Realtime hook, `Toast`, bell badge, 22 inbox, push registration.
6. Sharing: 19, 20, members, privacy and blocking, joined-course read-only states in 03/05/07/08.
7. Invites: 23, deep links `/i` and `/c`, install referrer; link service + 24 landing.
8. 17 Recap, 18 Themes, 21 Reminders.
9. Passes: dark mode, 200% font scale, reduce motion, TalkBack.

## 13. Checklist before any UI PR

- [ ] Only theme tokens; no raw hex in screens. Accents only where §3.2 allows; ink text on accents.
- [ ] Only Bricolage Grotesque and Manrope via `Type`.
- [ ] Every touchable has `accessibilityRole` and `accessibilityLabel`; targets ≥ 48.
- [ ] Works at 200% font scale, in dark mode and with reduce motion.
- [ ] Loading, empty, error, offline and limit states implemented.
- [ ] AI text has citations or a grounding callout.
- [ ] Social screens show only display names and say what stays private.
- [ ] `npx expo lint` and `npx tsc --noEmit` pass.
- [ ] PR description lists the FR IDs covered.
