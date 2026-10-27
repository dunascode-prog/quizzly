/**
 * Quizzly design tokens. See docs/DESIGN.md for how each token is used.
 * Screens must read colours, type and spacing from here, never hard-code them.
 *
 * Existing keys (text, background, backgroundElement, backgroundSelected,
 * textSecondary) are kept so current components keep working.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0D0D10', // ink: text, hero cards, primary pills, tab bar
    onInk: '#FFFFFF', // text and icons on ink
    textSecondary: '#4D4E5A', // muted: secondary text on ground/surface
    mutedOnInk: '#A3A4AE', // secondary text on ink
    background: '#DCDDE8', // ground: screen background
    backgroundElement: '#ECEDF4', // surface: light cards, sheets
    backgroundSelected: '#F5F5FA', // field: inputs, white pills, options
    inkRaised: '#1B1C22', // tiles inside ink cards
    inactiveOnInk: '#C9CAD3', // inactive tab icons, unselected segments on ink
    line: '#C5C6D3',
    track: '#3A3B44', // ring/bar track on ink
    scrim: 'rgba(13, 13, 16, 0.6)',
    success: '#186A33',
    successSoft: '#D6EEDC',
    danger: '#B42318',
    dangerSoft: '#F7DCD9',
    warning: '#7A5200',
    warningSoft: '#F3E6C4',
  },
  dark: {
    text: '#F5F5FA',
    onInk: '#0D0D10',
    textSecondary: '#A3A4AE',
    mutedOnInk: '#4D4E5A',
    background: '#0D0D10',
    backgroundElement: '#1B1C22',
    backgroundSelected: '#26272E',
    inkRaised: '#E4E5EC',
    inactiveOnInk: '#4D4E5A',
    line: '#33343C',
    track: '#C5C6D3',
    scrim: 'rgba(0, 0, 0, 0.7)',
    success: '#7BD69A',
    successSoft: '#16301F',
    danger: '#FF9D94',
    dangerSoft: '#3A1C1A',
    warning: '#F2C46D',
    warningSoft: '#352A12',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Accent colours (DESIGN.md §3.2). Same in light and dark. Text on an accent is always ink.
 * Only for: a course's own ring/dot/chip, the chosen theme, celebrations, the theme list,
 * the invite progress ring and unread/live dots. Never on sign-in (01) or the landing page (24).
 */
export const Accent = {
  lagoon: '#2BB3A8',
  ankara: '#F28C38',
  palm: '#4CC46A',
  lavender: '#A08CF5',
} as const;

export type AccentName = keyof typeof Accent;
export type ThemeAccent = 'ink' | AccentName;

/** Order used when assigning a new course its accent (FR-CRS-05). */
export const CourseAccentOrder: AccentName[] = ['lagoon', 'ankara', 'palm', 'lavender'];

/**
 * Font family names as registered with expo-font (DESIGN.md §4):
 *   npx expo install expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/manrope
 * Register in app/_layout.tsx with useFonts({ BricolageGrotesque_700Bold, Manrope_400Regular,
 * Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold }). Remove Inter afterwards.
 */
export const FontFamily = {
  display: 'BricolageGrotesque_700Bold',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export const Type = {
  hero: { fontFamily: FontFamily.display, fontSize: 44, lineHeight: 46, letterSpacing: -1.3 },
  display: { fontFamily: FontFamily.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  number: { fontFamily: FontFamily.display, fontSize: 56, lineHeight: 56, letterSpacing: -1.5 },
  title: { fontFamily: FontFamily.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  heading: { fontFamily: FontFamily.bold, fontSize: 20, lineHeight: 26 },
  reading: { fontFamily: FontFamily.regular, fontSize: 17, lineHeight: 27 },
  body: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 23 },
  label: { fontFamily: FontFamily.semibold, fontSize: 16, lineHeight: 20 },
  small: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16 },
} as const;

/** Kept for existing components; prefer FontFamily/Type in new code. */
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  twoHalf: 12,
  three: 16,
  gutter: 20,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  field: 20,
  option: 22,
  card: 28,
  sheet: 32,
  hero: 32,
  tile: 18,
  gridCell: 8,
  full: 999,
} as const;

export const Size = {
  iconButton: 52,
  actionPill: 64,
  pill: 44,
  field: 64,
  tabBar: 68,
  minTouch: 48,
  sticker: 34,
  toggleWidth: 52,
  toggleHeight: 32,
} as const;

/** Space to leave above the floating tab bar (68 tall + 24 from the bottom). */
export const BottomTabInset = Size.tabBar + Spacing.four + Spacing.three;
export const MaxContentWidth = 800;
