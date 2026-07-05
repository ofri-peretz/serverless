'use client';

/**
 * `$pageview` on App Router route change for serverless.interlace.tools.
 * Mirror of the eslint apps/docs tracker — see ANALYTICS_PHILOSOPHY
 * principle 6 (pageview-exactly-once).
 */
import { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { posthog } from '@/lib/posthog-init';
import { consumeLandingUtm, isPlausibleDistinctId } from '@/lib/utm';
import { setVisitorProfileOnFirstPageview } from '@/lib/visitor-profile';
import { pageview } from '@/lib/analytics';

function PageviewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstMount = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    if (firstMount.current) {
      firstMount.current = false;
      try {
        const utm = consumeLandingUtm();
        if (isPlausibleDistinctId(utm.phDistinctId)) {
          try {
            posthog.identify?.(utm.phDistinctId as string);
          } catch (err) {
            console.warn('posthog identify failed', err);
          }
        }
        setVisitorProfileOnFirstPageview({ utm, landingPath: pathname });
      } catch (err) {
        console.warn('first-pageview tracking failed', err);
      }
    }
    let url = pathname;
    const search = searchParams?.toString() ?? '';
    if (search) url += `?${search}`;
    const absolute =
      typeof window !== 'undefined' ? window.location.origin + url : url;
    pageview(absolute);
  }, [pathname, searchParams]);

  return null;
}

export function PostHogPageviewTracker() {
  return (
    <Suspense fallback={null}>
      <PageviewTrackerInner />
    </Suspense>
  );
}
