# Quizzly mobile app

Expo (SDK 58, React Native, TypeScript) app with Expo Router. Routes live in `src/app/`.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the values
npx expo start               # press a for Android, or scan the QR code with Expo Go
```

On a physical phone, `localhost` points at the phone itself. Set `EXPO_PUBLIC_API_URL` to your computer's LAN address instead (e.g. `http://192.168.1.20:8000`).

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

Always add packages with `npx expo install <package>` so versions match the SDK.

## Structure

| Path | What it holds |
|---|---|
| `src/app/` | Screens (file-based routes): Home, Practice |
| `src/components/` | Shared UI: themed text/view, tab bars |
| `src/lib/api.ts` | Calls the Quizzly API with the student's access token |
| `src/lib/supabase.ts` | Supabase client, used for sign-in only |
| `src/lib/env.ts` | Public build-time config (`EXPO_PUBLIC_*`) |
| `src/constants/theme.ts` | Colours, spacing, fonts |

Server state uses TanStack Query; small UI state will use Zustand. See [ARCHITECTURE §5.7](../../docs/ARCHITECTURE.md#57-mobile-app).
