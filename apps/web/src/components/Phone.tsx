// A phone bezel around a real app screenshot. Renders the light and dark exports and lets CSS show
// the one for the active theme. Lazy images that are display:none are never downloaded.

const SCREEN_W = 780;
const SCREEN_H = 1688;

export function Phone({
  screen,
  alt,
  width,
  className = "",
  style,
  eager = false,
  darkOnly = false,
}: {
  /** File name in public/screens without extension or -dark suffix, e.g. "14-today". */
  screen: string;
  alt: string;
  width: number;
  className?: string;
  style?: React.CSSProperties;
  /** Above the fold on every screen size: load immediately. */
  eager?: boolean;
  /** Always show the dark screenshot (the "Easy on your eyes" card). */
  darkOnly?: boolean;
}) {
  const img = (src: string, themeClass: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- pre-optimised WebP, no image service on Pages
    <img
      src={src}
      alt={alt}
      width={SCREEN_W}
      height={SCREEN_H}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={themeClass}
    />
  );

  return (
    <div className={`phone ${className}`} style={{ width, ...style }}>
      {darkOnly ? (
        img(`/screens/${screen}-dark.webp`, "")
      ) : (
        <>
          {img(`/screens/${screen}.webp`, "when-light")}
          {img(`/screens/${screen}-dark.webp`, "when-dark")}
        </>
      )}
    </div>
  );
}
