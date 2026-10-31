# Profile setup v2 and profile photos

| | |
|---|---|
| **Status** | v0.1 · approved design |
| **Date** | 2026-10-29 |
| **Replaces** | DESIGN.md §7 "02 Profile setup" (one form). Merge §2–§4 of this file into FRD §2.2, DESIGN.md §7 and DATA_MODELS.md when you apply it |
| **Images** | `docs/design/02a`–`02i` (+ `-dark`) |
| **Design canvas** | "Quizzly MVP Design" → App screens, board **02 Profile setup** (interactive: tap through it) and row "Profile setup v2" |

## 1. What changes

Screen 02 becomes a short **four-step flow** with a progress bar, and students can add a **profile photo** that replaces the initials avatar everywhere in the app.

1. **Your photo** (02a–02d). Optional. Full name field is here too.
2. **Your school** (02e–02f). Institution search, department, level. Required.
3. **How you practise** (02g). Optional, with good defaults: when they usually practise, weekly goal, explanation style.
4. **All set** (02h). Profile card summary, photo visibility toggle, terms, "Start studying".

The edit-profile screen (from Account) reuses steps 1–3 as one scrolling form. The photo sheet (02b) also opens from the camera badge on Account (02i).

## 2. Requirements (add to FRD §2.2)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-PROF-01 | P0 | *(updated)* Onboarding is a 4-step flow: photo + name, school, how you practise, all set. | Can't reach Today until name, institution and level are set and terms are accepted. Steps 1 and 3 have **Skip**. Back keeps entered values. Progress shows "Step n of 4 · name". |
| FR-PROF-04 | P1 | **Profile photo.** The student can take a photo (front camera) or pick one from the gallery, then move and zoom it inside a circle crop, and can change or remove it later. | Output is a 512×512 WebP (quality 0.8, ≤ 150 KB) made on the phone with `expo-image-manipulator`; EXIF/GPS stripped. Upload goes through the API (`PUT /me/avatar`), never straight from the app to storage. Removing deletes the file. Initials show while loading, on error and when there is no photo. Works offline: the new photo is queued in the outbox and shown locally right away. |
| FR-PROF-05 | P1 | **Photo visibility.** "Show my photo to classmates" (default **off**). | Off: other students see initials only (as today). On: members of courses the student shares or joins see the photo next to "Tolu A.". Admins never see photos. Blocked users never see it. Changing the toggle takes effect on next load. |
| FR-PROF-06 | P1 | **When you practise.** Multi-select: On my commute · Between lectures · Evenings · Late night. | Sets the default Daily 5 reminder time (`notification_settings.daily_reminder_time`): commute 06:45, lectures 11:50, evenings 17:45, late night 21:45, none 19:30 — earliest chosen wins, respecting quiet hours. Editable later in Reminders (21). |
| FR-PROF-07 | P1 | **Weekly goal** in onboarding: 3 / 4 / 6 study days (Light / Steady / Serious). | Writes `profiles.weekly_goal_days` (default 4). |
| FR-PROF-03 | P1 | *(moved into onboarding)* Explanation style Standard / Simple / Exam with a one-line description of each. | As before. |
| FR-MOD-06 | P1 | **Report a profile photo.** In a shared course's members list, a visible photo can be reported (`reports.target_type = 'avatar'`). | 3 reports hide the photo (back to initials) until an admin reviews it in Reports. Admin "Remove photo" deletes the file and notifies the student kindly. |

**Copy (exact):** headline "Make it **yours**"; helper "Add a photo so your account feels like yours. It's optional, and only you see it unless you choose otherwise."; "Classmates see you as **Tolu A.**"; sheet tips "Good light · Just you · Face the camera"; sheet footnote "We crop it to a circle and shrink it to a small file. Photos of other people, logos or anything offensive can be removed."; CTA on step 1 is "Continue without photo" until a photo is added, then "Continue".

## 3. Design (replace DESIGN.md §7 "02 Profile setup")

- **Header:** Back `IconButton` + 4-segment progress bar (6 px bars, `text` done / `line` to do) with "Step 1 of 4 · Your photo" below; **Skip** text button on steps 1 and 3.
- **02a Your photo:** headline, helper, 156 px avatar. Empty: dashed `muted` ring, initials in `field`, ink camera badge (bottom right, 4 px `bg` outline). Under it: ink pill "Take a photo" + light pill "Gallery". Full name `TextField` (focused) and the line "Classmates see you as **Tolu A.**" with a 28 px mini avatar (live preview of what others see).
- **02b Photo sheet:** `Sheet` titled "Profile **photo**": rows Take a photo (Uses the front camera) · Choose from gallery (JPG, PNG or HEIC) · **Remove photo** (danger, only when a photo exists); tip chips; footnote.
- **02c Move and scale:** full-screen black viewer (like 29): Cancel · "Move and scale" · rotate button; 1:1 image with a white circle mask, rule-of-thirds grid inside, 55% black outside; zoom slider + "+" button; hint "Drag to move. Pinch or use the slider to zoom."; light `ActionPill` "Use photo". Use `expo-image-picker` with `allowsEditing: false` and our own crop UI (pan/pinch with `react-native-gesture-handler` + Reanimated), then `expo-image-manipulator` to crop, resize and convert.
- **02d Photo added:** the photo in the circle, "Change photo" and "Remove" text buttons.
- **02e Your school (searching):** Institution field focused with a search icon and "3 results", results list in a `field` card (name bold + "UNILAG · Akoka, Lagos"), selected row on `bg` with an ink check, "My school isn't listed" link. Continue is disabled while the list is open.
- **02f Your school (picked):** Institution (with pencil, tap to search again), Department, Level pills (100L–500L, Other; 600L/700L under Other as today).
- **02g How you practise:** 2×2 grid of selectable cards with icon circle + title + sub (bus / coffee / sun / moon icons), helper "Pick any. We'll send your Daily 5 reminder just before these times."; Weekly goal 3 cards (3 days Light / 4 days Steady / 6 days Serious); Explanations 3 pills + live description under them. Selected = ink, others = `field`.
- **02h All set:** ink profile card: 72 px photo with a 3 px `onInk` ring, name in Bricolage 24, "UNILAG · 200L · Computer Science", ↗ arrow; divider; three ticked lines generated from the choices ("**4 study days** a week, mostly commute, evenings" · "**Standard** explanations" · "**Daily 5 reminder** at 6:45 am, before your commute"). Then the `ToggleRow` "Show my photo to classmates" (default off), terms checkbox, ink `ActionPill` "Start studying" (disabled until terms are ticked).
- **02i Your photo, everywhere:** the `Avatar` component replaces initials in the Today and Library headers (52 px), Account (76 px with camera badge → 02b), shared-course members (40 px; photo only when that student opted in), the share toast (40 px).
- **Rules:** photos are the only image a student adds to the UI; no accent colours added; works in dark mode (all tokens); avatar `accessibilityLabel` "Profile photo" / "Add profile photo"; 48 px targets; the crop screen supports reduce motion (no zoom animation).

## 4. Data, storage and API (add to DATA_MODELS.md and the API)

**Migration `0018_profile_photo.sql`**

```sql
alter table profiles
  add column avatar_path text,                 -- avatars/{user_id}/{uuid}.webp, server-generated
  add column avatar_visible boolean not null default false,
  add column avatar_updated_at timestamptz,
  add column avatar_hidden boolean not null default false,   -- set by reports/admin
  add column practice_times text[] not null default '{}'
    check (practice_times <@ array['commute','lectures','evening','night']);
-- reports: allow target_type 'avatar' (extend the enum / check used by FR-MOD-01)
```

- **Storage:** private bucket `avatars`. Path is generated by the API (`avatars/{user_id}/{uuid}.webp`); a new upload writes a new uuid (cache-busting) and deletes the old file. No client write policy (CLAUDE.md security rules).
- **Reads:** the app gets `avatar_url` (signed, 7 days) in `GET /me`. Course member lists include `avatar_url` only when `avatar_visible and not avatar_hidden` and the viewer isn't blocked. Cache images with `expo-image` (`cachePolicy: 'disk'`, key = path).
- **API:** `PUT /me/avatar` (multipart, ≤ 300 KB, `image/webp` only, server re-checks dimensions with Pillow and re-encodes to strip metadata) · `DELETE /me/avatar` · `PATCH /me` accepts `avatar_visible`, `practice_times`, `weekly_goal_days`, `explanation_style`; setting `practice_times` also updates `notification_settings.daily_reminder_time` unless the student has changed it manually in Reminders.
- **Account deletion** (FR-AUTH-05) deletes the avatar file. **Data export** includes it.
- **Admin:** no photos anywhere in the admin except the reported photo itself in the Reports detail.

## 5. Tests

- API: upload rejects non-WebP, oversized and >1024 px files; path ignores any client value; member list hides the URL when `avatar_visible = false`, when hidden by reports, and for blocked users; delete removes the object.
- App: onboarding can't finish without institution + level + terms; Skip on steps 1 and 3; Back keeps values; offline photo change queues and shows locally; screen fits at 360×640 and at 200% font scale (the body scrolls, the CTA stays pinned).
