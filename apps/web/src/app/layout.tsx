import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { DOMAIN } from "@/lib/site";
import "@/styles/tokens.css";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  // DESIGN.md uses Bricolage only at 700; the static cut is far smaller than the variable opsz font.
  weight: "700",
  display: "swap",
  variable: "--font-bricolage",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${DOMAIN}`),
  title: { default: "Quizzly: practise on the go", template: "%s · Quizzly" },
  description:
    "Upload your lecture notes and Quizzly writes fresh exam-style questions from them, round after round, with the page every answer came from. Made for Nigerian university students.",
  icons: { icon: "/brand/logo-app-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#DCDDE8" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D10" },
  ],
};

// Applies a saved theme choice before first paint so there is no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG" className={`${bricolage.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
