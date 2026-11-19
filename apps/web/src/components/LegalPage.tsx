import "@/app/(site)/link.css";

// Shell for /privacy, /terms and /copyright. Drafts until reviewed for NDPA compliance (E3).
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="link-page wrap legal">
      <h1 className="disp">{title}</h1>
      <p className="legal-meta">
        Last updated {updated}. Draft: this page will be reviewed before Quizzly launches publicly.
      </p>
      {children}
    </article>
  );
}
