import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { env } from '@/lib/env';

/*
 * Crash and error reports (NFR-09, Sentry free tier). Off unless EXPO_PUBLIC_SENTRY_DSN is set.
 * Nothing a student wrote or uploaded is sent: no request or response bodies, no personal details,
 * no screenshots; breadcrumbs keep navigation and the API route, not query strings.
 */

export const sentryOn = Boolean(env.sentryDsn);

function stripQuery(url: string | undefined) {
  return url ? url.split('?')[0] : url;
}

if (sentryOn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        event.request.url = stripQuery(event.request.url);
      }
      if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
      return event;
    },
    beforeBreadcrumb(crumb) {
      // Console output can contain a student's text; network crumbs keep the route only.
      if (crumb.category === 'console') return null;
      if (crumb.data?.url) crumb.data = { ...crumb.data, url: stripQuery(String(crumb.data.url)) };
      return crumb;
    },
  });
}

/** Ties reports to the account without anything personal: the anonymous user id only. */
export function setSentryUser(id: string | null) {
  if (sentryOn) Sentry.setUser(id ? { id } : null);
}

export const wrapRoot = (component: ComponentType<Record<string, unknown>>) =>
  sentryOn ? Sentry.wrap(component) : component;
