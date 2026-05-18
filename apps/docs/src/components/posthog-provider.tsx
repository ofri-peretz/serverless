'use client';

/**
 * PostHog provider for serverless.interlace.tools.
 * Mirror of the eslint apps/docs provider.
 */
import { type ReactNode, useEffect } from 'react';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { initPostHog, posthog } from '@/lib/posthog-init';

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
