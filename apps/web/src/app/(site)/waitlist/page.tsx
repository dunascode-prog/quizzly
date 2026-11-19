import type { Metadata } from "next";
import { Suspense } from "react";
import { WaitlistForm } from "@/components/Waitlist";
import { API_URL } from "@/lib/site";
import "../link.css";

// iPhone waitlist (FR-INV-06). Links from the landing page and from /i/ and /c/ on an iPhone.
export const metadata: Metadata = {
  title: "Quizzly for iPhone: join the waitlist",
  description: "Quizzly is on Android now. Leave your email and we'll tell you once it's on iPhone.",
};

export default function WaitlistPage() {
  return (
    <div className="link-page wrap">
      <h1 className="disp" style={{ fontSize: 44, lineHeight: "48px", margin: 0 }}>
        Quizzly for <span className="hl">iPhone</span>
      </h1>
      <p className="lead" style={{ margin: 0 }}>
        Quizzly is on Android now and coming to iPhone. Leave your email and we&apos;ll tell you
        once, when it&apos;s ready.
      </p>
      <Suspense>
        <WaitlistForm apiUrl={API_URL} />
      </Suspense>
    </div>
  );
}
