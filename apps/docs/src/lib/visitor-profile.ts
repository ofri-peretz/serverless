/**
 * Visitor-profile inference for serverless.interlace.tools.
 * Mirror of the eslint apps/docs visitor-profile.ts.
 * See ANALYTICS_PHILOSOPHY.md principle 5.
 */
import type { LandingUtm } from './utm';
import { posthog } from './posthog-init';

export type VisitorProfile =
  | 'developer'
  | 'engineering_leader'
  | 'recruiter'
  | 'investor'
  | 'founder'
  | 'student'
  | 'curious'
  | 'unknown';

interface InferenceInput {
  utm: LandingUtm;
  landingPath: string;
}

const DEVELOPER_REFERRER_RE =
  /(^|\.)(dev\.to|github\.com|npmjs\.com|stackoverflow\.com|news\.ycombinator\.com)$/i;
const DEVELOPER_REDDIT_RE =
  /^reddit\.com\/r\/(programming|javascript|typescript|node|reactjs|aws|serverless)/i;
const INVESTOR_REFERRER_RE = /(^|\.)(angellist|producthunt|crunchbase)\.com$/i;
const CURIOUS_REFERRER_RE =
  /(^|\.)(techcrunch|theverge|wired|arstechnica|hackernoon)\.com$/i;

const RECRUITER_PATH_RE = /^\/(resume|hire|about|talks)(\/|$)/i;
const PHILOSOPHY_PATH_RE = /^\/docs\/design(\/|$)/i;
const STUDENT_PATH_RE = /^\/docs\/(getting-started|installation|guide)(\/|$)/i;

function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function referrerPath(referrer: string | null): string {
  if (!referrer) return '';
  try {
    const u = new URL(referrer);
    return u.hostname.toLowerCase() + u.pathname;
  } catch {
    return '';
  }
}

export function inferVisitorProfile({
  utm,
  landingPath,
}: InferenceInput): VisitorProfile {
  switch (utm.source) {
    case 'dev_to':
    case 'github':
    case 'npm':
      return 'developer';
    case 'linkedin':
      if (RECRUITER_PATH_RE.test(landingPath)) return 'recruiter';
      if (landingPath.startsWith('/docs')) return 'developer';
      return 'recruiter';
  }

  const host = referrerHost(utm.referrer);
  const path = referrerPath(utm.referrer);
  if (host) {
    if (DEVELOPER_REFERRER_RE.test(host)) return 'developer';
    if (host === 'reddit.com' && DEVELOPER_REDDIT_RE.test(path))
      return 'developer';
    if (INVESTOR_REFERRER_RE.test(host)) return 'investor';
    if (CURIOUS_REFERRER_RE.test(host)) return 'curious';
    if (/(^|\.)linkedin\.com$/i.test(host)) {
      if (RECRUITER_PATH_RE.test(landingPath)) return 'recruiter';
      if (landingPath.startsWith('/docs')) return 'developer';
      return 'recruiter';
    }
  }

  if (RECRUITER_PATH_RE.test(landingPath)) return 'recruiter';
  if (PHILOSOPHY_PATH_RE.test(landingPath)) return 'engineering_leader';
  if (STUDENT_PATH_RE.test(landingPath)) return 'student';

  return 'unknown';
}

export function setVisitorProfileOnFirstPageview(
  input: InferenceInput,
): VisitorProfile {
  const profile = inferVisitorProfile(input);
  if (typeof window === 'undefined') return profile;
  try {
    const refHost = referrerHost(input.utm.referrer);
    posthog.people?.set_once?.({
      first_visitor_profile: profile,
      first_referrer_domain: refHost ?? 'direct',
      first_landing_path: input.landingPath,
      first_utm_source: input.utm.source ?? null,
      first_utm_medium: input.utm.medium ?? null,
      first_utm_campaign: input.utm.campaign ?? null,
    });
    posthog.people?.set?.({
      last_visitor_profile: profile,
      last_seen_app: 'serverless_docs',
    });
  } catch (err) {
    console.warn('visitor profile posthog sync failed', err);
  }
  return profile;
}
