// Line icons used across the site (24×24, stroke = currentColor), copied from the reference HTML.

const paths = {
  download: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
  apple: (
    <>
      <path d="M16 3c-1.5.1-3 1-3.7 2.2-.7 1.1-1 2.4-.8 3.6 1.5 0 2.9-.8 3.7-2C16 5.7 16.3 4.3 16 3z" />
      <path d="M12 9c-1 0-2-.6-3.3-.6C6.6 8.4 4.5 10.2 4.5 13.5 4.5 17.8 7.4 22 9.4 22c1 0 1.6-.6 2.8-.6s1.6.6 2.7.6c2 0 3.4-3 4.1-4.9-1.8-.8-2.9-2.4-2.9-4.3 0-1.6.9-3 2.2-3.8-.9-1.3-2.4-2-3.9-2-1.3 0-2.4.7-2.9.7z" />
    </>
  ),
  repeat: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0M12 20h.01M5 12.5a10 10 0 0 1 4.5-2.4M19 12.5a10 10 0 0 0-2.4-1.7" />
    </>
  ),
  quote: <path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  cards: (
    <>
      <rect x="3" y="6" width="14" height="14" rx="2" />
      <path d="M7 2h12a2 2 0 0 1 2 2v12" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  chevron: <path d="M9 18l6-6-6-6" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="8 4 92 92" aria-hidden="true">
      <circle cx="44" cy="44" r="30" fill="none" stroke="currentColor" strokeWidth="12" />
      <path d="M60 72 L72 84 L94 60" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
