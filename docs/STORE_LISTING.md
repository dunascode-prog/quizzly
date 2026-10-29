# Play Store release (E3)

What's needed to put Quizzly on the Play Store internal testing track, and the draft listing and
Data safety answers. Drafts are based on what the app does today; check them against the final
privacy policy before submitting.

## 1. Steps

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Create the EAS project and link it: `npx eas init` in `apps/mobile` (adds `extra.eas.projectId`, also needed for push) | Expo account | To do |
| 2 | Set build variables per environment: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_INVITE_DOMAIN`, optional `EXPO_PUBLIC_SENTRY_DSN` (`eas env:create`) | EAS | To do |
| 3 | First internal build: `npx eas build -p android --profile preview` (APK for testers) | EAS | To do |
| 4 | Create the app in Play Console (package `app.quizzly`), fill the listing below, upload the 512 px icon and feature graphic | Play Console | To do |
| 5 | Production build and submit to the internal track: `npx eas build -p android --profile production` then `npx eas submit -p android --profile production` (needs a Play service-account key) | EAS + Play Console | To do |
| 6 | Copy the release SHA-256 signing fingerprint from Play Console → App integrity into `/.well-known/assetlinks.json` on the website, so invite links open the app (FR-INV-02) | `apps/web` | To do |
| 7 | Privacy policy and terms updated for sharing, notifications and invites (NDPA), published at a stable URL on the website | `apps/web` | To do |
| 8 | An account deletion web page or link (Play requires one outside the app as well; in the app it's Account → Delete account) | `apps/web` | To do |
| 9 | Data safety form, content rating questionnaire, target audience (18+ or 16+, university students) | Play Console | To do |

`eas.json` has three profiles: `development` (dev client APK), `preview` (internal APK) and
`production` (app bundle, version code increased automatically, submitted to the **internal** track as
a draft).

## 2. Listing (draft)

**App name:** Quizzly: Study from your notes

**Short description (80 characters max):**
Turn your lecture notes into explanations and exam questions, with page citations.

**Full description:**

Quizzly turns your own lecture notes into a study partner.

Upload a PDF, PowerPoint or photos of your notes, and Quizzly:

• Explains each topic in plain English, in three styles: standard, simple or exam-focused
• Writes practice questions from your notes: multiple choice, true/false, fill-in-the-blank, short answer and theory questions like your university exams, with answers and marking
• Answers your questions about the notes in a chat, and shows the page every answer comes from
• Plans your day: a short Daily 5, your weak topics, and how ready you are for each exam
• Flashcards, past-question style practice, and offline study for saved courses
• Lets you share a course with coursemates, so one upload helps the whole class

Every answer comes from your notes, with the page cited. If something isn't in your notes, Quizzly says so.

Made for Nigerian university students. Free during the beta, with fair daily limits.

**Category:** Education
**Tags:** study, exam preparation, flashcards, quizzes
**Contact email:** the team's support address (to fill in)
**Privacy policy URL:** the website's privacy page (to fill in, step 7)

**Screenshots:** take them from the app on a real phone in light mode (Today, a topic explanation with
a page citation, a quiz question, the results, chat with citations, flashcards), so the listing shows
exactly what students get.

## 3. Data safety (draft answers)

Data collected (all over HTTPS; none sold; none used for advertising):

| Data type | What exactly | Why | Optional? |
|---|---|---|---|
| Personal info: email address | Sign-in (Google or email code) | Account management | Required |
| Personal info: name | Full name; others see a short display name ("Ada O.") | App functionality, sharing | Required |
| Personal info: other | University and level | Personalisation | Required |
| Files and docs | Uploaded notes, past papers and photos of notes | App functionality (explanations, questions, chat) | Required to use the app |
| Photos | Only photos the student picks or takes for notes; recap images saved on request | App functionality | Optional |
| App activity: in-app actions and other user-generated content | Quiz answers, chat questions, study progress, ratings, reports | App functionality, analytics of quality | Required |
| App info and performance: crash logs, diagnostics | Only when Sentry is enabled; no student content (see E2) | Diagnostics | Required when on |
| Device or other IDs | A one-way hash of the Android ID, only when the app was installed from an invite link (to stop referral abuse); the push token | Fraud prevention, notifications | Required for those features |

Shared with third parties: **no** in Play's sense. Service providers process data on Quizzly's
behalf (Supabase for the database and storage, the AI model providers for reading notes and writing
answers, Expo for push, Sentry for crash reports). Declare them in the privacy policy.

Security: data encrypted in transit (yes). Students can ask for their data to be deleted (yes:
Account → Delete account in the app, and the web page from step 8).

## 4. Content rating notes

No violence, sexual content, gambling or purchases. Users can share content with coursemates and
report courses (FR-SHARE, FR-DOC-12): answer "users can interact / share content" and mention the
reporting and blocking tools.
