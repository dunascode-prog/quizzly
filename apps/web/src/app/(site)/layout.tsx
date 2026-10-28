import Link from "next/link";
import { Icon, Logo } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CONTACT_EMAIL } from "@/lib/site";
import "./landing.css";

// Public site shell: landing, legal pages and the invite landing share this header and footer.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="qz">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="qz-inner">
        <header className="wrap site-header">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Logo />
            </span>
            <span className="disp" style={{ fontSize: 24 }}>
              Quizzly
            </span>
          </Link>
          <nav className="nav-links" aria-label="Main">
            <Link className="pill" href="/#how">How it works</Link>
            <Link className="pill" href="/#features">Features</Link>
            <Link className="pill" href="/#share">Study together</Link>
            <Link className="pill" href="/#faq">FAQ</Link>
          </nav>
          <div className="header-actions">
            <Link className="team-link hide-m" href="/admin/sign-in" prefetch={false}>
              Team
            </Link>
            <ThemeToggle className="icon-btn hide-m" />
            <Link className="btn-ink" href="/#get">
              <Icon name="download" size={18} />
              Get the app
            </Link>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="wrap site-footer">
          <div className="footer-top stack-m">
            <div className="footer-brand">
              <span style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text)" }}>
                <span className="brand-mark">
                  <Logo />
                </span>
                <span className="disp" style={{ fontSize: 22 }}>
                  Quizzly
                </span>
              </span>
              <span>Your notes, explained and turned into exam practice. Made in Lagos.</span>
            </div>
            <div className="footer-cols">
              <nav aria-labelledby="f-product">
                <h2 id="f-product">Product</h2>
                <Link href="/#how">How it works</Link>
                <Link href="/#features">Features</Link>
                <Link href="/#share">Study together</Link>
                <Link href="/#faq">FAQ</Link>
              </nav>
              <nav aria-labelledby="f-company">
                <h2 id="f-company">Company</h2>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
                <Link href="/privacy" prefetch={false}>Privacy policy</Link>
                <Link href="/terms" prefetch={false}>Terms</Link>
                <Link href="/copyright" prefetch={false}>Copyright requests</Link>
              </nav>
              <nav aria-labelledby="f-team">
                <h2 id="f-team">Team</h2>
                <Link href="/admin/sign-in" prefetch={false}>Team sign-in</Link>
              </nav>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Quizzly. Not affiliated with any university.</span>
            <span>Data handled in line with the Nigeria Data Protection Act 2023.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
