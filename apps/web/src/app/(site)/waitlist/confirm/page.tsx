import type { Metadata } from "next";
import { Suspense } from "react";
import { WaitlistConfirm } from "@/components/Waitlist";
import { API_URL } from "@/lib/site";
import "../../link.css";

// The link in the waitlist confirmation email (double opt-in, FR-INV-06).
export const metadata: Metadata = { title: "Confirm your place", robots: { index: false } };

export default function ConfirmPage() {
  return (
    <div className="link-page wrap">
      <h1 className="disp" style={{ fontSize: 40, lineHeight: "44px", margin: 0 }}>
        iPhone <span className="hl">waitlist</span>
      </h1>
      <Suspense>
        <WaitlistConfirm apiUrl={API_URL} />
      </Suspense>
    </div>
  );
}
