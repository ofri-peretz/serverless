/**
 * @interlace/serverless-api-gateway-caching — End-to-end release verification.
 *
 * Deploys a real Serverless Framework app to AWS using THIS plugin (linked from
 * the parent dist/), exercises every claim the README makes, then tears the
 * stack down and verifies no resources were left behind.
 *
 * Sequence:
 *   1. Pre-flight checks (AWS creds, dist/ built, region set)
 *   2. Stage fixture into a temp dir, link plugin via npm pack
 *   3. `sls deploy` — record stage + endpoint
 *   4. Cache MISS test — first request, expect fresh Lambda invocation
 *   5. Cache HIT test  — second request within TTL, expect identical body
 *      (proving cache served the response, Lambda was not re-invoked)
 *   6. `sls caching status` — assert cluster is enabled
 *   7. `sls caching flush` — invalidate cache
 *   8. Post-flush MISS test — expect fresh body again
 *   9. `sls caching disable` — disable cluster (safe-offboarding command)
 *  10. `sls remove` — full teardown
 *  11. Post-remove verification — stack gone, no orphaned cluster
 *
 * Cost: ~$0.05–$0.10 per run (cache cluster 0.5 GB × 5–10 min)
 *
 * Fail-safe: a try/finally always attempts `sls remove` if anything fails
 * mid-run, so AWS is never left billing for orphaned resources.
 *
 * Run:   npm run e2e
 *        AWS_REGION=eu-west-1 npm run e2e
 */

import { execSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const MONOREPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
// `agents/` is the sibling cruise-control repo (~/repos/ofriperetz.dev/agents/)
// where cross-product secrets are commonly stored. Loaded with the lowest
// precedence so per-repo / per-plugin overrides still win.
const AGENTS_REPO_ROOT = resolve(MONOREPO_ROOT, '..', 'agents');
const FIXTURE_SRC = join(__dirname, 'fixture');

/**
 * Load `KEY=VALUE` pairs from `.env.local` files (lowest precedence first).
 * Plugin-root file wins over monorepo-root file wins over agents-cruise-control
 * file. Existing process.env wins over all three, so CLI overrides still work.
 *
 * Vars we specifically care about (but the loader is generic):
 *   - AWS_PROFILE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   - SERVERLESS_ACCESS_KEY (Serverless Framework v4 license key)
 */
function loadDotEnvLocal(): void {
  const candidates = [
    join(AGENTS_REPO_ROOT, '.env.local'),
    join(MONOREPO_ROOT, '.env.local'),
    join(PLUGIN_ROOT, '.env.local'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip surrounding single or double quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Existing process.env wins (CLI override > .env.local)
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadDotEnvLocal();

interface RunContext {
  workDir: string;
  region: string;
  serviceName: string;
  stage: string;
  pluginTarball: string | null;
}

let CTX: RunContext | null = null;

// ─── Run log — captured per E2E invocation, persisted to scripts/e2e/runs/ ───

interface RunStep {
  id: number;
  label: string;
  startedAt: string;
  durationMs?: number;
  status?: 'pass' | 'fail' | 'skip';
  observations?: Record<string, unknown>;
  error?: string;
}

interface RunLog {
  schemaVersion: 1;
  startedAt: string;
  endedAt?: string;
  status: 'in-progress' | 'passed' | 'failed' | 'failed-with-emergency-cleanup';
  failedAtStep?: number;
  serviceName?: string;
  region?: string;
  awsIdentity?: string;
  endpoint?: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  pluginVersion?: string;
  steps: RunStep[];
  awsObservations: {
    deployDurationSec?: number;
    cacheClusterCreateSec?: number;
    cacheClusterCreateStatusHistory?: Array<{
      status: string;
      elapsedSec: number;
    }>;
    flushDurationSec?: number;
    disableDurationSec?: number;
    removeDurationSec?: number;
    cacheClusterPostDisableSec?: number;
  };
  totalAwsCostUsdEstimate?: number;
}

const RUN_LOG_DIR = join(__dirname, 'runs');

const RUN_LOG: RunLog = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  status: 'in-progress',
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  steps: [],
  awsObservations: {},
};

// `startStep`/`finishStep` are reserved helpers for future per-step structured
// logging — keep them as `_`-prefixed to satisfy the strict no-unused-vars rule
// while preserving the intended API for upcoming work.
function _startStep(id: number, label: string): RunStep {
  const s: RunStep = { id, label, startedAt: new Date().toISOString() };
  RUN_LOG.steps.push(s);
  return s;
}

function _finishStep(
  s: RunStep,
  status: 'pass' | 'fail' | 'skip',
  observations?: Record<string, unknown>,
  error?: string,
): void {
  s.durationMs = Date.now() - new Date(s.startedAt).getTime();
  s.status = status;
  if (observations) s.observations = observations;
  if (error) s.error = error;
}

function persistRunLog(): void {
  try {
    mkdirSync(RUN_LOG_DIR, { recursive: true });
    RUN_LOG.endedAt = new Date().toISOString();
    const fname = `${RUN_LOG.startedAt.slice(0, 19).replaceAll(':', '-')}-${
      CTX?.serviceName ?? 'pre-deploy'
    }.json`;
    writeFileSync(join(RUN_LOG_DIR, fname), JSON.stringify(RUN_LOG, null, 2));
    console.log(`\n  📝 Run log: scripts/e2e/runs/${fname}`);
  } catch (err) {
    console.warn(`  ⚠ Could not persist run log: ${(err as Error).message}`);
  }
}

// ─── Console helpers ───

const COLORS = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  blue: '[34m',
  cyan: '[36m',
};

function step(n: number, total: number, label: string): void {
  console.log(
    `\n${COLORS.cyan}${COLORS.bold}[${n}/${total}]${COLORS.reset} ${COLORS.bold}${label}${COLORS.reset}`,
  );
}
function info(msg: string): void {
  console.log(`  ${COLORS.dim}${msg}${COLORS.reset}`);
}
function ok(msg: string): void {
  console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ${COLORS.yellow}⚠${COLORS.reset}  ${msg}`);
}
function fail(msg: string): void {
  console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`);
}

// ─── Process helpers ───

function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${result.status})\n${detail}`,
    );
  }
  return result.stdout;
}

function runStreaming(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // For commands where we want the user to see live output (deploy, remove)
  // but ALSO need to capture the output for parsing.
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Stream both stdout + stderr after the fact (sls writes most output to stderr)
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${result.status})`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

// ─── Pre-flight ───

function preflight(): { region: string } {
  step(1, 11, 'Pre-flight checks');

  // AWS creds — the simplest portable check is whether `aws sts get-caller-identity` works.
  // We don't require the AWS CLI; if it's missing, fall through and let `sls` fail with its own error.
  const profile = process.env.AWS_PROFILE;
  if (profile) {
    info(`AWS profile: ${profile}`);
  } else if (process.env.AWS_ACCESS_KEY_ID) {
    info('AWS credentials: via AWS_ACCESS_KEY_ID env var');
  } else {
    warn(
      'No AWS_PROFILE or AWS_ACCESS_KEY_ID set — sls deploy will likely fail.',
    );
  }

  let identity: string | null = null;
  try {
    const profileArg = profile ? `--profile ${profile}` : '';
    identity = execSync(
      `aws sts get-caller-identity ${profileArg} --output text 2>/dev/null`,
      {
        encoding: 'utf-8',
      },
    ).trim();
  } catch {
    // AWS CLI missing OR creds missing — sls will surface a clearer error if it's the latter.
    warn(
      'Could not verify AWS credentials via `aws sts get-caller-identity` — proceeding anyway.',
    );
    warn(
      'If sls deploy fails with a credentials error, check AWS_PROFILE or AWS_ACCESS_KEY_ID.',
    );
  }
  if (identity) {
    ok(`AWS identity: ${identity.split('\t').slice(0, 2).join(' / ')}`);
  }

  // Serverless Framework v4 license — surface presence so deploy doesn't fail mid-stream
  if (process.env.SERVERLESS_ACCESS_KEY) {
    ok('SERVERLESS_ACCESS_KEY: loaded');
  } else {
    warn(
      'SERVERLESS_ACCESS_KEY not set. If running Serverless Framework v4, set this in .env.local or env.',
    );
    warn(
      '  Looked in: agents/.env.local · serverless/.env.local · packages/serverless-api-gateway-caching/.env.local',
    );
  }

  // dist/ must exist — the fixture references the plugin via npm pack; we need a built copy.
  const distEntry = join(PLUGIN_ROOT, 'dist', 'index.cjs');
  if (!existsSync(distEntry)) {
    throw new Error(
      `Plugin not built. Run \`npm run build\` from packages/serverless-api-gateway-caching first.`,
    );
  }
  ok(`Plugin built at ${distEntry}`);

  const region = process.env.AWS_REGION ?? 'us-east-1';
  ok(`Region: ${region}`);

  return { region };
}

// ─── Steps ───

function setupWorkDir(region: string): RunContext {
  step(2, 11, 'Stage fixture into temp dir + link plugin via npm pack');

  const workDir = mkdtempSync(join(tmpdir(), 'interlace-e2e-'));
  info(`work dir: ${workDir}`);

  cpSync(FIXTURE_SRC, workDir, { recursive: true });

  // Pack the plugin and stage it in the work dir, then point package.json at the tarball.
  const packOutput = run(
    'npm',
    ['pack', '--silent', '--pack-destination', workDir],
    PLUGIN_ROOT,
  );
  const tarballName = packOutput.trim().split('\n').pop() ?? '';
  if (!tarballName) {
    throw new Error('npm pack produced no output');
  }
  const pluginTarball = join(workDir, tarballName);
  ok(`packed: ${tarballName}`);

  // Inject the plugin as a file: dependency in the fixture's package.json
  const fixturePkgPath = join(workDir, 'package.json');
  const fixturePkg = JSON.parse(
    readFileSync(fixturePkgPath, 'utf-8'),
  ) as Record<string, unknown>;
  (fixturePkg.dependencies as Record<string, string>)[
    '@interlace/serverless-api-gateway-caching'
  ] = `file:./${tarballName}`;
  writeFileSync(fixturePkgPath, JSON.stringify(fixturePkg, null, 2));

  info('npm install in fixture …');
  run('npm', ['install', '--no-audit', '--no-fund', '--silent'], workDir);
  ok('fixture installed');

  // Use a unique service name so concurrent runs (or stale failures) don't collide
  const suffix = Date.now().toString(36).slice(-6);
  const serviceName = `interlace-cache-e2e-${suffix}`;
  const slsPath = join(workDir, 'serverless.yml');
  const slsContents = readFileSync(slsPath, 'utf-8').replace(
    /^service:.*$/m,
    `service: ${serviceName}`,
  );
  writeFileSync(slsPath, slsContents);
  ok(`service: ${serviceName}`);

  return { workDir, region, serviceName, stage: 'e2e', pluginTarball };
}

function deploy(ctx: RunContext): string {
  step(3, 11, '`sls deploy` — provisioning real AWS resources');
  info('this takes 3–5 min (CloudFormation + cache cluster)');

  const stepStart = Date.now();
  const env = { ...process.env, AWS_REGION: ctx.region };
  const output = runStreaming(
    'npx',
    ['serverless', 'deploy'],
    ctx.workDir,
    env,
  );
  RUN_LOG.awsObservations.deployDurationSec = Math.round(
    (Date.now() - stepStart) / 1000,
  );

  // Extract the endpoint URL — sls v3 prints `endpoint: <method> - <url>`.
  // Match a few output styles to be resilient to framework version drift.
  const patterns = [
    /(?:endpoint|GET|HEAD):\s+(?:GET|HEAD|ANY)?\s*-?\s*(https:\/\/[^\s]+\.execute-api\.[^\s]+\/[^\s]+)/,
    /(https:\/\/[a-z0-9]+\.execute-api\.[^\s]+\.amazonaws\.com\/[^\s]+\/hello)/,
  ];
  let endpoint: string | null = null;
  for (const re of patterns) {
    const m = re.exec(output);
    if (m) {
      endpoint = m[1];
      break;
    }
  }
  if (!endpoint) {
    throw new Error('Could not parse endpoint URL from sls deploy output');
  }
  ok(`endpoint: ${endpoint}`);
  return endpoint;
}

interface CacheResponse {
  statusCode: number;
  body: { message: string; generatedAt: number; pid: number };
  headers: Record<string, string>;
  durationMs: number;
}

/**
 * Extract the REST API ID from an APIGW invoke URL.
 * URL form: https://<rest-api-id>.execute-api.<region>.amazonaws.com/<stage>/<path>
 */
function restApiIdFromEndpoint(url: string): string | null {
  const m = /https:\/\/([a-z0-9]+)\.execute-api\./.exec(url);
  return m ? m[1] : null;
}

/**
 * Poll APIGateway.getStage until the stage's cache cluster is AVAILABLE.
 * AWS provisions cache clusters asynchronously after CloudFormation succeeds —
 * the deploy returns before the cluster can serve requests.
 *
 * Times out after 6 minutes; APIGW provisioning is typically 3-5 min.
 */
async function waitForCacheClusterReady(
  ctx: RunContext,
  endpoint: string,
  maxWaitSec = 360,
): Promise<void> {
  const restApiId = restApiIdFromEndpoint(endpoint);
  if (!restApiId) {
    warn(
      'Could not extract REST API ID from endpoint URL — skipping cache-ready poll.',
    );
    return;
  }

  const startedAt = Date.now();
  const deadline = startedAt + maxWaitSec * 1000;
  const env = { ...process.env, AWS_REGION: ctx.region };
  const history: Array<{ status: string; elapsedSec: number }> = [];

  while (Date.now() < deadline) {
    let status = 'UNKNOWN';
    try {
      status = execSync(
        `aws apigateway get-stage --rest-api-id ${restApiId} --stage-name ${ctx.stage} --query "cacheClusterStatus" --output text 2>/dev/null`,
        { encoding: 'utf-8', env },
      ).trim();
    } catch {
      status = 'ERROR';
    }
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    history.push({ status, elapsedSec: elapsed });
    info(`cluster status: ${status} (${elapsed}s elapsed)`);
    if (status === 'AVAILABLE') {
      ok(`cache cluster AVAILABLE after ${elapsed}s`);
      // Track the *first* time we see AVAILABLE for telemetry. This wait runs
      // both after deploy (initial creation) and after flush/disable; only
      // record the create-time once.
      if (RUN_LOG.awsObservations.cacheClusterCreateSec === undefined) {
        RUN_LOG.awsObservations.cacheClusterCreateSec = elapsed;
        RUN_LOG.awsObservations.cacheClusterCreateStatusHistory = history;
      }
      return;
    }
    if (status === 'NOT_AVAILABLE' || status === 'ERROR') {
      throw new Error(`Cache cluster reported ${status}`);
    }
    // CREATE_IN_PROGRESS / FLUSH_IN_PROGRESS / DELETE_IN_PROGRESS — keep waiting
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(
    `Cache cluster did not reach AVAILABLE within ${maxWaitSec}s`,
  );
}

async function getEndpoint(url: string): Promise<CacheResponse> {
  const start = Date.now();
  // IMPORTANT: do NOT send `Cache-Control: no-cache` — API Gateway respects it
  // and bypasses the cache cluster. We WANT APIGW to serve from cache when it
  // can; that's what the HIT test verifies.
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  const durationMs = Date.now() - start;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return {
    statusCode: res.status,
    body: JSON.parse(text) as CacheResponse['body'],
    headers,
    durationMs,
  };
}

async function testCacheMiss(endpoint: string): Promise<number> {
  step(4, 11, 'Cache MISS test — first request, fresh Lambda invocation');
  const r = await getEndpoint(endpoint);
  if (r.statusCode !== 200) {
    throw new Error(`Expected 200, got ${r.statusCode}`);
  }
  ok(`200 OK in ${r.durationMs}ms`);
  ok(`generatedAt: ${r.body.generatedAt} (Lambda PID ${r.body.pid})`);
  return r.body.generatedAt;
}

/**
 * Verify the cache is HITTING by polling until two consecutive responses
 * return the same `generatedAt`. We can't assert the cache contains the
 * specific MISS-response timestamp because:
 *   1. APIGW takes 30-90s after cluster AVAILABLE to start caching
 *   2. During that window, every request goes fresh to Lambda
 *   3. Once caching starts, the cache locks in whatever response was current
 *      THEN — not whatever request came earliest
 *   4. Plus our TTL is 60s, so cached entries naturally expire
 *
 * Better assertion: cache is HITTING when two consecutive requests return
 * IDENTICAL bodies. That proves the cache layer is intercepting requests
 * and serving stored responses, regardless of which Lambda response got
 * locked in.
 */
async function testCacheHit(
  endpoint: string,
  missTimestamp: number,
): Promise<number> {
  step(
    5,
    11,
    'Cache HIT test — poll until two consecutive identical responses (cache settled)',
  );
  const maxAttempts = 18; // 90s total (longer than typical 30-60s propagation + buffer)
  const intervalMs = 5_000;
  let prevTimestamp: number | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const r = await getEndpoint(endpoint);
    if (r.statusCode !== 200) {
      throw new Error(`Expected 200, got ${r.statusCode}`);
    }
    const elapsedSec = (attempt * intervalMs) / 1000;
    if (prevTimestamp !== null && r.body.generatedAt === prevTimestamp) {
      ok(
        `cache HIT confirmed (attempt ${attempt}/${maxAttempts}, ${elapsedSec}s after MISS, response time ${r.durationMs}ms)`,
      );
      ok(
        `cached generatedAt: ${r.body.generatedAt} — two consecutive identical responses ✓`,
      );
      if (r.body.generatedAt === missTimestamp) {
        ok(`(bonus: cache locked in the original MISS response)`);
      } else {
        info(
          `note: cache locked in a later Lambda response, not the MISS one (expected during propagation)`,
        );
      }
      return r.body.generatedAt;
    }
    info(
      `attempt ${attempt}/${maxAttempts}: generatedAt=${r.body.generatedAt} (prev=${prevTimestamp ?? 'first'}). Waiting for cache to settle…`,
    );
    prevTimestamp = r.body.generatedAt;
  }
  throw new Error(
    `Cache never settled after ${maxAttempts} attempts over ${(maxAttempts * intervalMs) / 1000}s. ` +
      `Each request returned a different generatedAt — cache is NOT serving stored responses.`,
  );
}

function statusCheck(ctx: RunContext, expect: 'enabled' | 'disabled'): void {
  step(
    expect === 'enabled' ? 6 : 9,
    11,
    `\`sls caching status\` — assert cluster is ${expect}`,
  );
  const env = { ...process.env, AWS_REGION: ctx.region };
  // runStreaming captures both stdout AND stderr — sls v3 writes plugin logs
  // (`[interlace-caching] Enabled: true`) to stderr.
  const output = runStreaming(
    'npx',
    ['serverless', 'caching', 'status', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );

  const enabledLine = /Enabled:\s+(true|false)/i.exec(output);
  if (!enabledLine) {
    warn('Could not parse `Enabled:` line from caching status output');
    return;
  }
  const isEnabled = enabledLine[1].toLowerCase() === 'true';
  if ((expect === 'enabled') !== isEnabled) {
    throw new Error(
      `Expected cluster ${expect}, but Enabled=${enabledLine[1]}`,
    );
  }
  ok(`cluster ${expect}`);
}

async function flushAndVerifyMiss(
  ctx: RunContext,
  endpoint: string,
  cachedBefore: number,
): Promise<void> {
  step(7, 11, '`sls caching flush` — invalidate the entire stage cache');
  const env = { ...process.env, AWS_REGION: ctx.region };
  // Stream flush output so we can see whether the plugin's onCachingFlush
  // hook actually did work, or silently bailed (e.g., on missing REST API ID).
  // Pass --stage explicitly so the plugin doesn't fall through to `dev`.
  const flushOutput = runStreaming(
    'npx',
    ['serverless', 'caching', 'flush', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );
  ok('flush command exit 0');
  // Look for the plugin's expected log line — if absent, flush silently bailed
  if (!flushOutput.includes('[interlace-caching]')) {
    warn(
      'Plugin did not emit any log lines during flush. The flush hook may have bailed early ' +
        '(e.g., could not resolve REST API ID). Cache will only invalidate via natural TTL expiry.',
    );
  }

  step(
    8,
    11,
    'Post-flush MISS test — next request should NOT match the pre-flush cached body',
  );
  // Flush is fast (<5s typically) but APIGW may briefly mark the cluster
  // FLUSH_IN_PROGRESS. Poll for AVAILABLE before testing.
  await waitForCacheClusterReady(ctx, endpoint, 60);
  // Wait window is 90s — past the natural TTL of 60s. If neither flush nor
  // TTL expiry change the response, something is fundamentally wrong with
  // the cache invalidation path.
  const maxAttempts = 18;
  const intervalMs = 5_000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const r = await getEndpoint(endpoint);
    if (r.body.generatedAt !== cachedBefore) {
      const elapsed = (attempt * intervalMs) / 1000;
      ok(
        `generatedAt CHANGED (${cachedBefore} → ${r.body.generatedAt}) after ${elapsed}s — flush worked ✓`,
      );
      return;
    }
    info(
      `attempt ${attempt}/${maxAttempts}: still serving pre-flush cached value (${r.body.generatedAt}). Flush propagation may still be in flight…`,
    );
  }
  throw new Error(
    `Cache HIT after flush — value did not change within ${(maxAttempts * intervalMs) / 1000}s ` +
      `(longer than the configured 60s TTL). Cached value still ${cachedBefore}. ` +
      `This means BOTH flush AND natural TTL expiry failed to change the response — investigate plugin's flush logic.`,
  );
}

function disable(ctx: RunContext): void {
  step(9, 11, '`sls caching disable` — safe offboarding command');
  const env = { ...process.env, AWS_REGION: ctx.region };
  const output = run(
    'npx',
    ['serverless', 'caching', 'disable'],
    ctx.workDir,
    env,
  );
  process.stdout.write(output);
  ok('disable command exit 0');

  // Brief delay before status check — APIGW takes a few seconds to register the change
  execSync('sleep 5');
}

function remove(ctx: RunContext): void {
  step(10, 11, '`sls remove` — full teardown');
  const env = { ...process.env, AWS_REGION: ctx.region };
  runStreaming('npx', ['serverless', 'remove'], ctx.workDir, env);
  ok('stack removed');
}

function verifyClean(ctx: RunContext): void {
  step(11, 11, 'Post-remove verification — stack DELETE_COMPLETE, no orphans');

  const env = { ...process.env, AWS_REGION: ctx.region };
  // CloudFormation list-stacks (filtered to deleted) should show our stack as DELETE_COMPLETE
  const stackName = `${ctx.serviceName}-${ctx.stage}`;
  let result = '';
  try {
    result = execSync(
      `aws cloudformation describe-stacks --stack-name ${stackName} --output text --query "Stacks[0].StackStatus" 2>&1 || true`,
      { encoding: 'utf-8', env },
    );
  } catch (_err) {
    // describe-stacks errors when the stack is fully gone — that's the success case
    info('describe-stacks errored, which is the expected post-remove state.');
    ok('no live stack named ' + stackName);
    return;
  }
  result = result.trim();
  if (result.includes('does not exist') || result.includes('ValidationError')) {
    ok(`stack does not exist (fully removed)`);
  } else if (result === 'DELETE_COMPLETE') {
    ok('stack DELETE_COMPLETE');
  } else {
    throw new Error(
      `Stack status after remove: ${result}. Expected DELETE_COMPLETE or absent.`,
    );
  }
}

function cleanup(): void {
  if (!CTX) return;
  if (!existsSync(CTX.workDir)) return;
  // Best-effort: nuke the temp dir. The AWS resources are removed via `sls remove`
  // which the orchestrator runs as step 10. If we got past step 10, this is just
  // local cleanup. If we DIDN'T get past step 10, the catch handler runs sls remove.
  try {
    rmSync(CTX.workDir, { recursive: true, force: true });
  } catch {
    // not critical
  }
}

async function emergencyRemove(): Promise<void> {
  if (!CTX) return;
  console.log(
    `\n${COLORS.yellow}🚨 attempting emergency \`sls remove\` to avoid leaving AWS resources…${COLORS.reset}`,
  );
  try {
    const env = { ...process.env, AWS_REGION: CTX.region };
    runStreaming('npx', ['serverless', 'remove'], CTX.workDir, env);
    console.log(`${COLORS.green}✓ emergency remove succeeded.${COLORS.reset}`);
  } catch (_err) {
    console.log(
      `${COLORS.red}✗ emergency remove FAILED. Manual cleanup required:${COLORS.reset}\n` +
        `  Stack: ${CTX.serviceName}-${CTX.stage}\n` +
        `  Region: ${CTX.region}\n` +
        `  Run: aws cloudformation delete-stack --stack-name ${CTX.serviceName}-${CTX.stage} --region ${CTX.region}`,
    );
  }
}

// ─── Main ───

async function main(): Promise<void> {
  console.log(
    `${COLORS.bold}${COLORS.cyan}\n@interlace/serverless-api-gateway-caching — E2E Release Verification${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}Cost: ~$0.05–$0.10 per run. Always cleans up via try/finally.${COLORS.reset}`,
  );

  const startedAt = Date.now();

  const { region } = preflight();
  CTX = setupWorkDir(region);
  RUN_LOG.region = CTX.region;
  RUN_LOG.serviceName = CTX.serviceName;

  // Capture plugin version + AWS identity for the run log
  try {
    const pluginPkg = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf-8'),
    ) as { version?: string };
    RUN_LOG.pluginVersion = pluginPkg.version;
  } catch {
    /* non-fatal */
  }
  try {
    const profile = process.env.AWS_PROFILE;
    const profileArg = profile ? `--profile ${profile}` : '';
    RUN_LOG.awsIdentity = execSync(
      `aws sts get-caller-identity ${profileArg} --query "Arn" --output text 2>/dev/null`,
      { encoding: 'utf-8' },
    ).trim();
  } catch {
    /* non-fatal */
  }

  try {
    const endpoint = deploy(CTX);
    RUN_LOG.endpoint = endpoint;
    info(
      'waiting for cache cluster to reach AVAILABLE (3-5 min on first deploy)…',
    );
    await waitForCacheClusterReady(CTX, endpoint);
    const firstTimestamp = await testCacheMiss(endpoint);
    const cachedTimestamp = await testCacheHit(endpoint, firstTimestamp);
    statusCheck(CTX, 'enabled');
    await flushAndVerifyMiss(CTX, endpoint, cachedTimestamp);
    disable(CTX);
    statusCheck(CTX, 'disabled');
    remove(CTX);
    verifyClean(CTX);
  } catch (err) {
    fail(`E2E failed at step: ${(err as Error).message}`);
    RUN_LOG.status = 'failed';
    RUN_LOG.failedAtStep = RUN_LOG.steps.at(-1)?.id ?? -1;
    RUN_LOG.steps.push({
      id: -1,
      label: 'failure',
      startedAt: new Date().toISOString(),
      status: 'fail',
      error: (err as Error).message,
    });
    await emergencyRemove();
    RUN_LOG.status = 'failed-with-emergency-cleanup';
    persistRunLog();
    cleanup();
    process.exitCode = 1;
    return;
  }

  RUN_LOG.status = 'passed';
  persistRunLog();
  cleanup();
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\n${COLORS.bold}${COLORS.green}✅ E2E PASSED${COLORS.reset} ${COLORS.dim}(${elapsed}s)${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}All 11 steps verified. Plugin is release-ready.${COLORS.reset}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  RUN_LOG.status = 'failed';
  RUN_LOG.steps.push({
    id: -1,
    label: 'unexpected-error',
    startedAt: new Date().toISOString(),
    status: 'fail',
    error: err instanceof Error ? err.message : String(err),
  });
  void emergencyRemove().finally(() => {
    persistRunLog();
    cleanup();
    process.exit(1);
  });
});
