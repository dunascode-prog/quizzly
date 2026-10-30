import type { Level } from '@/lib/profile';

/*
 * Country-ready (FR-PROF-08): Nigeria first, the rest ready. Codes are ISO 3166-1 alpha-2; "ZZ" is
 * "somewhere else". Schools are listed per country; where none are listed yet the student types
 * theirs ("My school isn't listed").
 */

export type Country = { code: string; name: string };

export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'IN', name: 'India' },
  { code: 'ZZ', name: 'Somewhere else' },
];

// The phone's time zone is the best hint we have without asking for location.
const BY_ZONE: Record<string, string> = {
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kigali': 'RW',
  'Africa/Lusaka': 'ZM',
  'Africa/Douala': 'CM',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Cairo': 'EG',
  'Europe/London': 'GB',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
};

/** The phone's IANA time zone, e.g. "Africa/Lagos"; undefined if the platform can't say. */
export function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** A sensible starting country: from the phone's time zone, else Nigeria. */
export function guessCountry(): string {
  const zone = deviceTimezone() ?? '';
  if (BY_ZONE[zone]) return BY_ZONE[zone];
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage)$/.test(zone)) return 'US';
  return 'NG';
}

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

type LevelChoice = { value: Level; label: string };

/** Pills for the level question: Nigerian levels in Nigeria, years elsewhere. `more` sits behind
 * "Other". */
export function levelsFor(country: string): { main: LevelChoice[]; more: LevelChoice[] } {
  if (country === 'NG') {
    return {
      main: (['100L', '200L', '300L', '400L', '500L'] as Level[]).map((l) => ({ value: l, label: l })),
      more: [
        { value: '600L', label: '600L' },
        { value: '700L', label: '700L' },
        { value: 'other', label: 'Not listed' },
      ],
    };
  }
  return {
    main: (['Y1', 'Y2', 'Y3', 'Y4'] as Level[]).map((l) => ({ value: l, label: `Year ${l.slice(1)}` })),
    more: [
      { value: 'Y5', label: 'Year 5' },
      { value: 'Y6', label: 'Year 6' },
      { value: 'PG', label: 'Postgraduate' },
      { value: 'other', label: 'Not listed' },
    ],
  };
}

/** "200L", "Year 2", "Postgraduate"; nothing for "other". */
export function levelLabel(level: Level | null | undefined): string | null {
  if (!level || level === 'other') return null;
  if (level === 'PG') return 'Postgraduate';
  if (level.startsWith('Y')) return `Year ${level.slice(1)}`;
  return level;
}
