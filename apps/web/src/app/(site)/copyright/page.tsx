import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Copyright requests · Quizzly" };

export default function CopyrightPage() {
  const subject = encodeURIComponent("Copyright request");
  return (
    <LegalPage title="Copyright requests" updated="19 November 2026">
      <p>
        Students upload their own course notes to study them. Original files are only ever visible
        to the student who uploaded them. When a course is shared, coursemates see study material
        made from it and short quoted passages, never the files.
      </p>
      <p>
        If you own the copyright in material on Quizzly, such as lecture slides, and want it
        removed, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`}>{CONTACT_EMAIL}</a> with:
      </p>
      <ul>
        <li>Your name, and how to contact you.</li>
        <li>The work you own (for example the course, title and year of the slides).</li>
        <li>Where it appears on Quizzly: a share link (one with /c/ in it) or a description.</li>
        <li>A statement that you own the work or act for the owner, and that the information is accurate.</li>
      </ul>

      <h2>What happens next</h2>
      <p>
        We reply within 5 working days. If the request is valid, we take down the shared course,
        and everyone who joined it is told it&apos;s no longer available. We tell the student who
        shared it and let them respond. We keep a record of each request.
      </p>
    </LegalPage>
  );
}
