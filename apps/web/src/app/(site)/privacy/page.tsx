import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy · Quizzly" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="19 November 2026">
      <p>
        Quizzly helps students study their own lecture notes. This page explains what we collect,
        why, who processes it, and the rights you have under the Nigeria Data Protection Act 2023
        (NDPA). Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address, used to sign you in with a code or with Google.</li>
        <li>Your profile: name, country, school, department and level, and a photo if you add one.</li>
        <li>The notes you upload, and what Quizzly makes from them: outlines, explanations, questions, flashcards.</li>
        <li>How you study: quiz answers and scores, chats with your notes, study days, settings.</li>
        <li>Device details needed to run the app: push notification token, app version, crash reports.</li>
      </ul>
      <p>We don&apos;t collect your contacts or location, and we don&apos;t sell your data.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide Quizzly: process your notes, write explanations and questions, mark answers.</li>
        <li>To keep it fair and safe: daily limits, preventing abuse, handling reports.</li>
        <li>To send the notifications and reminders you choose, which you can turn off in the app.</li>
        <li>To fix problems and improve the app, using crash reports and usage counts.</li>
      </ul>

      <h2>AI and your notes</h2>
      <p>
        To write explanations, questions and chat answers, the relevant parts of your notes are
        sent to our AI providers (Groq, OpenRouter and Cloudflare). We don&apos;t use your notes
        to train AI models, and we choose providers on that basis.
      </p>

      <h2>What other students see</h2>
      <p>
        If you share a course, coursemates see its outlines, explanations, questions and short
        quoted passages, never your original files, scores, chats or progress. They see you as your
        first name and last initial (&quot;Ada O.&quot;), your school and level, and your photo
        only if you turn that on. Invite and share links show your first name, school and level
        unless you turn that off in Privacy.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li>Supabase: sign-in, database and file storage.</li>
        <li>Amazon Web Services: the servers that run Quizzly.</li>
        <li>Groq, OpenRouter and Cloudflare: AI processing, as above.</li>
        <li>Expo: push notifications. Sentry: crash reports.</li>
        <li>Google: Google sign-in and, when available, Google Play payments.</li>
      </ul>
      <p>Some of these process data outside Nigeria, under the safeguards the NDPA requires.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while you have an account. When you delete your account (Account → Delete
        account), we delete your profile, notes, files and everything made only from them within
        24 hours. Courses you shared stop being shared.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see, correct, export or delete your data, withdraw consent, and object to how we
        use it. Most of this is in the app. For anything else, email us and we&apos;ll reply
        within 30 days. You can also complain to the Nigeria Data Protection Commission.
      </p>

      <h2>iPhone waitlist</h2>
      <p>
        If you join the waitlist, we keep your email only to tell you once when Quizzly is on
        iPhone. Email us to be removed.
      </p>
    </LegalPage>
  );
}
