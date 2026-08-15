/**
 * Version + live/preview metadata for HouseholdScreen's footer. Nowhere else reads
 * this — see that screen's own comment for why the footer is scoped there and not
 * global.
 *
 * `appVersion` reads app.json's `expo.version` rather than package.json's. They're
 * kept in step by convention (bump both, see CHANGE-LOG.md), but app.json's is the
 * one Expo itself treats as canonical — EAS builds, App Store/Play Store submissions
 * and `expo-constants` at runtime all resolve to this field, not package.json's. JSON
 * imports work here without `expo-constants` as a dependency: `resolveJsonModule` is
 * already on via `expo/tsconfig.base`, and Metro requires `.json` natively.
 *
 * `buildChannel` reads EXPO_PUBLIC_VERCEL_ENV, which does not exist as a Vercel
 * variable — it's a stand-in for VERCEL_ENV, an in-house name because Expo only
 * inlines the `EXPO_PUBLIC_*` prefix into the client bundle (see env.ts's doc
 * comment) and VERCEL_ENV itself is build-time-only, invisible to browser code
 * without forwarding. mobile/vercel.json's buildCommand does that forwarding
 * (`EXPO_PUBLIC_VERCEL_ENV=$VERCEL_ENV npx expo export ...`); nothing here talks to
 * Vercel directly. Confirmed live against a real preview+production deploy pair —
 * see HANDOFF.md's version-footer entry for the verification record.
 *
 * Local dev (`npx expo start --web`) never sets VERCEL_ENV at all, so the unset case
 * is a named branch below rather than a value falling through to "undefined" on
 * screen.
 */
import appConfig from '../../app.json';

export const appVersion: string = appConfig.expo.version;

export type BuildChannel = 'live' | 'preview' | 'dev';

const rawVercelEnv = process.env.EXPO_PUBLIC_VERCEL_ENV;

export const buildChannel: BuildChannel =
  rawVercelEnv === 'production' ? 'live' : rawVercelEnv === 'preview' ? 'preview' : 'dev';

export const buildChannelLabel: Record<BuildChannel, string> = {
  live: 'Live',
  preview: 'Preview',
  dev: 'Dev',
};
