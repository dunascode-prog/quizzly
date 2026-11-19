# Quizzly credits and plans

| | |
|---|---|
| **Status** | v0.1 · approved design |
| **Date** | 2026-10-30 |
| **Updates** | FRD §2.18 Invites (FR-INV-03/04/05), FR-HAB-07, DESIGN.md §7 screens 13 and 23; adds 23b, 23c, 31 |
| **Images** | `docs/design/` (light + `-dark`), `docs/design/checks/` (360×640 and 200% text) |
| **Canvas** | "Quizzly MVP Design" → App screens, row "Quizzly credits and plans" (plus fit-check rows) |

> **Numbering:** Plans is screen **32** (`32a`–`32c`); `31-landing-*` stays the website.

> **Owner's decisions (2026-10-30), which override the numbers in the images and below:**
> - **5 credits unlock 10% off** (not 10 credits / 30%): Student $6 → **$5.40**, Premium $10 → **$9** a month. 3 credits still unlock Lavender. The images show 10 / 30%; the app uses 5 / 10%.
> - **Daily limits:** Free unchanged (5 uploads / 15 quiz sets / 30 explanations / 40 chats / 20 markings); Student 10 / 30 / 60 / 80 / 40; Premium 20 / 50 / 120 / 150 / 80 (lower than the placeholders, to keep costs down).
> - **Monthly AI allowance** (fair use, FR-LIM-06): free $0.60, Student $2.00, Premium $3.50 at paid-tier list prices. Storage: 500 MB / 2 GB / 5 GB.
> - **Offline course downloads stay free** on every plan (no cost to us); they're not a Premium extra.
> - **Priority processing** is built (FR-LIM-07).

## 1. Rules

- **One credit** = one friend who joined through the student's invite link **and** really started studying: confirmed their email, finished profile setup, and **studied on 3 different days** (any of: a quiz, flashcards, a Daily 5). Days are counted in the friend's timezone.
- One credit per person and per phone (device ID / Play Integrity). No credit for the student's own code. Accounts made to collect rewards don't count (keep the existing cap of 50 credits per inviter, FR-INV-03).
- **Rewards:** 3 credits unlock the **Lavender** theme; **5 credits unlock 10% off Student or Premium**.
- **Prices:** Student $6 → $5.40 a month (₦9,000 → ₦8,100); Premium $10 → $9 (₦15,000 → ₦13,500). The naira prices come from the Google Play price table, so they're approximate.
- Undecided: whether the discount expires. The 23c copy says it's "saved to your account", so no expiry for now.

## 2. Requirement changes (FRD)

| ID | Change |
|---|---|
| FR-INV-03 | Credit only after: email confirmed + onboarding finished + studied on **3 different days** (was "first 5 questions"). Keeps the one-per-device, own-code and 50-credit cap rules. The server computes credits nightly and on each qualifying session; the friend's progress (0–3 days) is stored per referral. |
| FR-INV-04 | Screen 23 shows the credit total, a ring toward the next reward with both milestones (3, 10), "n more friends to unlock 30% off Student or Premium", and friend rows: **Counted** / **Getting started · Studied n of 3 days** / **Your next friend · Preview link**. Friends appear as display names only. |
| FR-INV-05 | Rewards: 3 → Lavender theme (FR-HAB-07), 10 → 30% off Student or Premium. When the 10th credit is counted, show 23c once (at most one celebration per session, FR-HAB-05) and send an `invite_reward` notification. |
| FR-PLAN-01 *(new)* | Screen 32 Plans: Free (current limits), Student, Premium; one selected card; `ActionPill` "Choose Student / Choose Premium" starts a Google Play subscription (the discount is a Play offer applied to eligible users). Footer: "Billed monthly through Google Play. Cancel any time." |
| FR-PLAN-02 *(new)* | Account shows "Your plan · Free" (→ 31) and the ink row "Quizzly credits · 7" (→ 23). |

## 3. Screens (DESIGN.md §7)

- **13 Account (updated):** header uses the profile photo (see the profile v2 handoff). Rows: **Your plan · Free** (→32), Themes and study modes, Reminders, ink row **Quizzly credits · 7** with sub "Invite friends · 3 more for 30% off" (→23). Privacy / Sign out / Delete account pills. The body scrolls above the pinned tab bar.
- **23 Invite friends (updated):** link card, QR and share buttons unchanged. The credits card replaces `InviteProgress`:
  - "QUIZZLY CREDITS" label, **7 credits** (Bricolage, 56/26).
  - A 112 px ring: Lavender fill to 7/10; milestone discs on the track at 3 (Lavender with an ink tick) and 10 (outlined, "10"); centre "7/10 · to 30% off".
  - Milestone rows: Lavender theme (ticked) · 30% off Student or Premium (at 10).
  - The line "3 more friends to unlock 30% off Student or Premium".
  - Friend rows in three states; counted friends collapse after two ("+ 5 more counted · Show all").
  - Text link **How credits work** (→23b).
- **23b How credits work (sheet):** `Sheet` titled "How credits **work**":
  - three numbered steps: they join with your link → they finish setup → they study on 3 different days;
  - the plain note, word for word: "Credits count real friends only. One credit per person and phone. Accounts made to collect rewards don't count.";
  - Rewards: Lavender theme (3 credits) and 30% off Student or Premium (10 credits, with the new prices);
  - `ActionPill` "Got it".
- **23c Discount unlocked:** screen 16 style:
  - Ink top: Close, a Lavender "Invite reward" pill, and a "10 credits" ring in Lavender with rays.
  - "30% **off**", then "10 friends are studying with Quizzly because of you. Thank you for sharing it."
  - Ground sheet: an ink card "Your new prices" with Student and Premium (old price struck through, new price, dollars in small text) and the note "The discount is saved to your account…".
  - `ActionPill` **See plans** (→32) and text button **Later**. No countdown and no urgency.
- **32 Plans:** "Pick a **plan**" + "Free stays free. Paid plans give you more room for exam season."
  - **Free** (outlined, "Current plan", ₦0): 5 uploads, 15 quiz sets, 30 explanations, 40 chat messages a day.
  - **Student** and **Premium** are selectable radio cards; the selected one is ink. Each shows its price, daily limits, and these extras: stronger AI model and priority processing (both paid plans), plus offline course downloads (Premium).
  - With the reward: an "Invite reward · 30% off" chip (ink, **no accent**), the old price struck through, then the new price "/month · about $4.20".
  - A pinned `ActionPill` follows the selection ("Choose Student" / "Choose Premium"), with the billing line under it.
- **Placeholder limits (confirm from the cost model):** Student 15 / 50 / 100 / 150, Premium 30 / 120 / 300 / 400 (uploads / quiz sets / explanations / chats a day).
- **Accents:** Lavender only on the invite ring and milestones (23), the Lavender theme swatch in 23b, and the 23c celebration. None on 13 or 31.
- **Fit:** every screen is header + scrolling body + pinned footer. Checked at 360×640 and 200% text (`docs/design/checks/`). Badge numbers inside fixed circles (step numbers, the "30%" disc, initials) use `maxFontSizeMultiplier={1.3}`.

## 4. Data and API

- `referrals`: add `study_days smallint not null default 0`, `credited_at timestamptz`, `device_hash text`; unique `(inviter_id, invitee_id)`, unique `device_hash` among credited referrals.
- `profiles`: add `credits int not null default 0` (denormalised; the source of truth is `referrals`), `discount_unlocked_at timestamptz`.
- `GET /me/credits` → `{credits, next_reward, friends:[{display_name, state: counted|started, study_days}]}`.
- `GET /plans` → plans with limits, prices (USD + NGN from Play), and whether the 30% offer applies. Purchases are verified server-side with the Google Play Developer API (`purchases.subscriptionsv2`), then `profiles.plan` is set.
- Tests: no credit before day 3; no credit for the same device or own code; cap 50; 23c shown once; the offer only applies when `credits >= 10`.

## 5. Prompt for Claude Code

```text
Read CLAUDE.md, then docs/CREDITS_AND_PLANS.md and the images in docs/design (23*, 31*, 13*, checks/).
1. Merge §2 into docs/FRD.md and §3 into docs/DESIGN.md §7 (rename either 31-plans or 31-landing so the
   numbers don't clash), add BUILD_PLAN tasks.
2. Backend: migration for referrals.study_days/credited_at/device_hash and profiles.credits/
   discount_unlocked_at; credit job (3 study days, one per person and device, cap 50); GET /me/credits;
   GET /plans; Google Play subscription verification; invite_reward notification. Tests from §4.
3. App: update screen 23 (CreditsCard with the two-milestone ring, friend rows, How credits work sheet),
   add 23c (shown once when the 10th credit counts), add Plans (radio cards, pinned ActionPill that follows
   the selection, Play Billing), and update Account (Your plan row, Quizzly credits row).
4. Tokens only, light and dark, Lavender only where §3 says, 48 px targets, maxFontSizeMultiplier 1.3 on
   badge numbers; check 360x640 and 200% font scale. Lint, typecheck and tests from CLAUDE.md. One PR per step.
```
