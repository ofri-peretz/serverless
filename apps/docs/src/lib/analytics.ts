/**
 * Vendor-neutral analytics primitives for serverless.interlace.tools.
 *
 * `identify` / `track` / `pageview` backed by PostHog. Empty
 * `TrackedEventMap` for now — extend when business events surface.
 *
 * See ANALYTICS_PHILOSOPHY.md.
 */
import { posthog } from './posthog-init';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TrackedEventMap {}

export type TrackedEventName = keyof TrackedEventMap & string;

function isTrackingAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
  const dnt = navigator.doNotTrack;
  if (dnt === '1' || dnt === 'yes') return false;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl;
  if (gpc === true) return false;
  return true;
}

function safe<T>(fn: () => T, fallback?: T): T | undefined {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function track<E extends TrackedEventName>(
  event: E,
  payload: TrackedEventMap[E],
): void {
  if (!isTrackingAllowed()) return;
  safe(() => {
    posthog.capture?.(event, payload as Record<string, unknown>);
  });
}

export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!isTrackingAllowed()) return;
  if (!distinctId) return;
  safe(() => {
    posthog.identify?.(distinctId, properties);
  });
}

export function pageview(
  url?: string,
  properties?: Record<string, unknown>,
): void {
  if (!isTrackingAllowed()) return;
  safe(() => {
    const $current_url =
      url ?? (typeof window !== 'undefined' ? window.location.href : '');
    posthog.capture?.('$pageview', { $current_url, ...properties });
  });
}
