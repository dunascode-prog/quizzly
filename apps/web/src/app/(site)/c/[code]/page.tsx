import type { Metadata } from "next";
import { LinkLanding } from "@/components/LinkLanding";
import { ANDROID_PACKAGE, API_URL, DOMAIN, PLAY_STORE_URL } from "@/lib/site";
import "../../link.css";

// /c/{code}: share link landing (screen 24, FR-INV-02). Static; the browser reads the code.
export const metadata: Metadata = {
  title: "A course was shared with you on Quizzly",
  description: "Quizzly turns your lecture notes into clear explanations and exam-style practice.",
  robots: { index: false },
};

export default function Page() {
  return (
    <LinkLanding
      kind="share"
      apiUrl={API_URL}
      playUrl={PLAY_STORE_URL}
      domain={DOMAIN}
      androidPackage={ANDROID_PACKAGE}
    />
  );
}
