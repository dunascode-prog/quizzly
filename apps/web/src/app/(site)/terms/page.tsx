import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms · Quizzly" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="19 November 2026">
      <p>
        These terms apply when you use the Quizzly app or website. By creating an account you
        agree to them. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Use your own email address. One account per person.</li>
        <li>Keep your sign-in to yourself. You&apos;re responsible for what happens on your account.</li>
        <li>You can delete your account at any time in the app.</li>
      </ul>

      <h2>Your notes</h2>
      <p>
        Upload only material you have the right to use for your own study, such as your lecture
        notes and slides. You keep any rights you have in what you upload. You allow Quizzly to
        process it to provide the service: reading it, sending parts to our AI providers, and
        storing what we make from it.
      </p>

      <h2>Sharing</h2>
      <p>
        When you share a course, coursemates get the study material Quizzly made from it and short
        quoted passages, never your original files. Share only with people studying the course, and
        stop sharing if you&apos;re asked to.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>Each plan has daily limits, shown in the app. Don&apos;t try to get around them.</li>
        <li>Don&apos;t use Quizzly to cheat in an exam or break your school&apos;s rules.</li>
        <li>Don&apos;t upload anything illegal or offensive, or try to break or overload the service.</li>
      </ul>
      <p>We may pause or close accounts that break these rules.</p>

      <h2>AI answers</h2>
      <p>
        Quizzly&apos;s explanations, questions and marks are written by AI from your notes. They
        show page citations so you can check them, but they can be wrong. Check anything important
        against your notes and lecturers. Report mistakes with the report button.
      </p>

      <h2>Plans and payments</h2>
      <p>
        Quizzly is free during the beta. Paid plans, when available, are billed monthly through
        Google Play, and you can cancel any time in Google Play. Google Play&apos;s refund rules
        apply.
      </p>

      <h2>Copyright</h2>
      <p>
        If you think something on Quizzly uses your work without permission, see{" "}
        <Link href="/copyright">Copyright requests</Link>.
      </p>

      <h2>Changes and liability</h2>
      <p>
        We may change these terms, and we&apos;ll tell you in the app before important changes take
        effect. Quizzly is provided as it is. To the extent the law allows, we aren&apos;t liable
        for indirect losses, such as exam results. These terms are governed by the laws of Nigeria.
      </p>
    </LegalPage>
  );
}
