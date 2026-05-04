/**
 * Community-plugin comparative E2E — measures `sls remove` behavior on the
 * incumbent `serverless-api-gateway-caching` plugin (DianaIonita).
 *
 * The Interlace plugin's "no ghost billing" claim asserts the community plugin
 * leaves orphaned cache cluster resources after `sls remove`. This script
 * MEASURES that assertion live:
 *
 *   1. Pre-flight (AWS creds, region)
 *   2. Stage fixture w/ community plugin from npm
 *   3. `sls deploy` — record duration + endpoint
 *   4. Wait for cache cluster `AVAILABLE`
 *   5. Cache MISS test (verify community plugin's runtime caching works)
 *   6. Cache HIT test  (same — verify cache layer serves)
 *   7. `sls remove` — measure: exit code, duration, output (with 10 min hard timeout)
 *   8. Post-remove orphan check:
 *        a) CloudFormation describe-stacks — DELETE_COMPLETE? absent? FAILED?
 *        b) APIGateway get-stage — does the stage still exist?
 *        c) APIGateway get-rest-api — does the API still exist?
 *
 * Result: a dated JSON in scripts/e2e-community/runs/ with all signals so we
 * can definitively say "the community plugin does/doesn't cause ghost billing"
 * and update CLAIMS.md accordingly.
 *
 * Cost: ~$0.05 (cache cluster × ~7-10 min). Hard timeout on remove caps the
 * cost in case the cluster delete hangs.
 *
 * Run:
 *   AWS_PROFILE=interlace npx tsx scripts/e2e-community/run.ts
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
const AGENTS_REPO_ROOT = resolve(MONOREPO_ROOT, '..', 'agents');
const FIXTURE_SRC = join(__dirname, 'fixture');
const RUN_LOG_DIR = join(__dirname, 'runs');

// ─── Reuse the env loader pattern from the main e2e ───

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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
loadDotEnvLocal();

const COLORS = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
};

const log = {
  step: (n: number, total: number, label: string) =>
    console.log(
      `\n${COLORS.cyan}${COLORS.bold}[${n}/${total}]${COLORS.reset} ${COLORS.bold}${label}${COLORS.reset}`,
    ),
  info: (msg: string) => console.log(`  ${COLORS.dim}${msg}${COLORS.reset}`),
  ok: (msg: string) => console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`),
  warn: (msg: string) =>
    console.log(`  ${COLORS.yellow}⚠${COLORS.reset}  ${msg}`),
  fail: (msg: string) => console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`),
};

// ─── Run log ───

interface RunLog {
  schemaVersion: 1;
  startedAt: string;
  endedAt?: string;
  status: 'in-progress' | 'passed' | 'failed';
  comparison: 'community-plugin';
  serviceName?: string;
  region?: string;
  awsIdentity?: string;
  endpoint?: string;
  restApiId?: string;
  stage: string;
  environment: { nodeVersion: string; platform: string; arch: string };
  observations: {
    deployDurationSec?: number;
    cacheClusterCreateSec?: number;
    cacheMissResponseTimeMs?: number;
    cacheHitResponseTimeMs?: number;
    cacheHitConfirmedSecPostMiss?: number;
    /** sls remove duration measured wall-clock from start of `sls remove` to its exit */
    removeDurationSec?: number;
    /** Did `sls remove` exit cleanly (0)? */
    removeExitCode?: number;
    /** Hit our 10-minute hard timeout? */
    removeTimedOut?: boolean;
    /** Did CloudFormation report stack as fully deleted? */
    cloudFormationStatusPostRemove?:
      | 'DELETE_COMPLETE'
      | 'DELETE_FAILED'
      | 'DELETE_IN_PROGRESS'
      | 'NOT_FOUND'
      | 'OTHER';
    /** Does APIGateway.getStage still return our stage? (orphan signal) */
    apiGatewayStageExistsPostRemove?: boolean;
    /** Cache cluster status if stage still exists */
    cacheClusterStatusPostRemove?: string | null;
    /** Does the REST API itself still exist? */
    restApiExistsPostRemove?: boolean;
  };
  verdict?: {
    cleanRemoval: boolean;
    ghostBillingDetected: boolean;
    summary: string;
  };
  steps: Array<{
    id: number | string;
    label: string;
    status: 'pass' | 'fail' | 'skip';
    durationMs?: number;
    error?: string;
    details?: Record<string, unknown>;
  }>;
}

const RUN_LOG: RunLog = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  status: 'in-progress',
  comparison: 'community-plugin',
  stage: 'e2e',
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  observations: {},
  steps: [],
};

let WORK_DIR: string | null = null;

function persistRunLog(): void {
  try {
    mkdirSync(RUN_LOG_DIR, { recursive: true });
    RUN_LOG.endedAt = new Date().toISOString();
    const fname = `${RUN_LOG.startedAt.slice(0, 19).replaceAll(':', '-')}-community-${RUN_LOG.serviceName ?? 'pre-deploy'}.json`;
    writeFileSync(join(RUN_LOG_DIR, fname), JSON.stringify(RUN_LOG, null, 2));
    console.log(`\n  📝 Run log: scripts/e2e-community/runs/${fname}`);
  } catch (err) {
    console.warn(`  ⚠ Could not persist run log: ${(err as Error).message}`);
  }
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
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${result.status})\n${result.stdout || ''}${result.stderr || ''}`,
    );
  }
  return result.stdout;
}

function runStreaming(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs?: number,
): { output: string; exitCode: number; timedOut: boolean } {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGKILL' } : {}),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    exitCode: result.status ?? -1,
    timedOut: Boolean(
      (result as { signal?: NodeJS.Signals | null }).signal === 'SIGKILL' ||
      result.error?.message.includes('timeout'),
    ),
  };
}

// ─── Steps ───

function preflight(): { region: string } {
  log.step(1, 8, 'Pre-flight');
  const profile = process.env.AWS_PROFILE;
  if (profile) log.info(`AWS profile: ${profile}`);

  let identity: string | null = null;
  try {
    identity = execSync(
      `aws sts get-caller-identity ${profile ? `--profile ${profile}` : ''} --output text 2>/dev/null`,
      { encoding: 'utf-8' },
    ).trim();
  } catch {
    log.warn('Could not verify AWS credentials — proceeding anyway');
  }
  if (identity) {
    log.ok(`AWS identity: ${identity.split('\t').slice(0, 2).join(' / ')}`);
    RUN_LOG.awsIdentity = identity.split('\t')[1];
  }

  const region = process.env.AWS_REGION ?? 'us-east-1';
  log.ok(`Region: ${region}`);
  RUN_LOG.region = region;
  return { region };
}

function setupWorkDir(): string {
  log.step(2, 8, 'Stage fixture (community plugin from npm)');
  const wd = mkdtempSync(join(tmpdir(), 'interlace-e2e-community-'));
  log.info(`work dir: ${wd}`);
  cpSync(FIXTURE_SRC, wd, { recursive: true });
  log.info(
    'npm install (resolves serverless-api-gateway-caching@^1.11.0 from npm)…',
  );
  run('npm', ['install', '--no-audit', '--no-fund', '--silent'], wd);
  log.ok('community plugin installed');

  // Unique service name suffix
  const suffix = Date.now().toString(36).slice(-6);
  const serviceName = `interlace-cache-e2e-community-${suffix}`;
  const slsPath = join(wd, 'serverless.yml');
  const slsContents = readFileSync(slsPath, 'utf-8').replace(
    /^service:.*$/m,
    `service: ${serviceName}`,
  );
  writeFileSync(slsPath, slsContents);
  log.ok(`service: ${serviceName}`);
  RUN_LOG.serviceName = serviceName;
  return wd;
}

function deploy(wd: string, region: string): string {
  log.step(3, 8, '`sls deploy` with community plugin');
  const start = Date.now();
  const env = { ...process.env, AWS_REGION: region };
  const r = runStreaming('npx', ['serverless', 'deploy'], wd, env);
  if (r.exitCode !== 0)
    throw new Error(`Community plugin deploy failed (exit ${r.exitCode})`);
  RUN_LOG.observations.deployDurationSec = Math.round(
    (Date.now() - start) / 1000,
  );

  // Endpoint extraction (same regex set as main E2E)
  const patterns = [
    /(https:\/\/[a-z0-9]+\.execute-api\.[^\s]+\.amazonaws\.com\/[^\s]+\/hello)/,
    /endpoint:\s+(?:GET|HEAD|ANY)?\s*-?\s*(https:\/\/[^\s]+\/hello)/,
  ];
  for (const re of patterns) {
    const m = re.exec(r.output);
    if (m) {
      const endpoint = m[1];
      const apiIdMatch = /https:\/\/([a-z0-9]+)\.execute-api/.exec(endpoint);
      RUN_LOG.endpoint = endpoint;
      RUN_LOG.restApiId = apiIdMatch?.[1] ?? undefined;
      log.ok(`endpoint: ${endpoint}`);
      log.ok(`rest api id: ${RUN_LOG.restApiId}`);
      return endpoint;
    }
  }
  throw new Error('Could not parse endpoint URL from sls deploy output');
}

async function waitForClusterReady(
  restApiId: string,
  region: string,
): Promise<void> {
  log.step(4, 8, 'Wait for cache cluster AVAILABLE');
  const start = Date.now();
  const deadline = start + 6 * 60 * 1000;
  const env = { ...process.env, AWS_REGION: region };
  while (Date.now() < deadline) {
    let status = 'UNKNOWN';
    try {
      status = execSync(
        `aws apigateway get-stage --rest-api-id ${restApiId} --stage-name e2e --query "cacheClusterStatus" --output text 2>/dev/null`,
        { encoding: 'utf-8', env },
      ).trim();
    } catch {
      status = 'ERROR';
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    log.info(`cluster status: ${status} (${elapsed}s elapsed)`);
    if (status === 'AVAILABLE') {
      log.ok(`cache cluster AVAILABLE after ${elapsed}s`);
      RUN_LOG.observations.cacheClusterCreateSec = elapsed;
      return;
    }
    if (status === 'NOT_AVAILABLE' || status === 'ERROR')
      throw new Error(`Cache cluster reported ${status}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error('Cache cluster did not reach AVAILABLE within 6min');
}

interface FetchResult {
  statusCode: number;
  generatedAt: number;
  durationMs: number;
}
async function getEndpoint(url: string): Promise<FetchResult> {
  const start = Date.now();
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const durationMs = Date.now() - start;
  return {
    statusCode: res.status,
    generatedAt: (JSON.parse(text) as { generatedAt: number }).generatedAt,
    durationMs,
  };
}

async function verifyCachingWorks(endpoint: string): Promise<void> {
  log.step(
    5,
    8,
    "Cache MISS + HIT — verify community plugin's runtime caching",
  );
  const miss = await getEndpoint(endpoint);
  if (miss.statusCode !== 200)
    throw new Error(`MISS expected 200, got ${miss.statusCode}`);
  log.ok(
    `MISS 200 OK in ${miss.durationMs}ms (generatedAt=${miss.generatedAt})`,
  );
  RUN_LOG.observations.cacheMissResponseTimeMs = miss.durationMs;

  // Settle-poll same as main e2e
  let prevTimestamp: number | null = null;
  for (let attempt = 1; attempt <= 18; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await getEndpoint(endpoint);
    if (prevTimestamp !== null && r.generatedAt === prevTimestamp) {
      log.ok(
        `HIT confirmed at attempt ${attempt} (${attempt * 5}s after MISS, ${r.durationMs}ms)`,
      );
      RUN_LOG.observations.cacheHitResponseTimeMs = r.durationMs;
      RUN_LOG.observations.cacheHitConfirmedSecPostMiss = attempt * 5;
      return;
    }
    log.info(
      `attempt ${attempt}/18: generatedAt=${r.generatedAt} (prev=${prevTimestamp ?? 'first'})`,
    );
    prevTimestamp = r.generatedAt;
  }
  throw new Error(
    'Community plugin: cache never settled — its caching may not be working at all',
  );
}

function measuredRemove(
  wd: string,
  region: string,
): {
  exitCode: number;
  durationSec: number;
  timedOut: boolean;
  output: string;
} {
  log.step(6, 8, "`sls remove` — MEASURE community plugin's removal behavior");
  log.info('Hard timeout: 10 minutes (cost guard if cluster delete hangs)');
  const start = Date.now();
  const env = { ...process.env, AWS_REGION: region };
  const r = runStreaming(
    'npx',
    ['serverless', 'remove'],
    wd,
    env,
    10 * 60 * 1000,
  );
  const durationSec = Math.round((Date.now() - start) / 1000);
  RUN_LOG.observations.removeDurationSec = durationSec;
  RUN_LOG.observations.removeExitCode = r.exitCode;
  RUN_LOG.observations.removeTimedOut = r.timedOut;
  if (r.timedOut) {
    log.fail(
      `sls remove TIMED OUT after ${durationSec}s — likely stack/cluster hang`,
    );
  } else if (r.exitCode === 0) {
    log.ok(`sls remove exit 0 after ${durationSec}s`);
  } else {
    log.fail(`sls remove exit ${r.exitCode} after ${durationSec}s`);
  }
  return {
    exitCode: r.exitCode,
    durationSec,
    timedOut: r.timedOut,
    output: r.output,
  };
}

function checkOrphans(
  serviceName: string,
  restApiId: string | undefined,
  region: string,
): void {
  log.step(7, 8, 'Post-remove orphan check');
  const env = { ...process.env, AWS_REGION: region };
  const stackName = `${serviceName}-e2e`;

  // 1) CloudFormation
  let cfStatus: RunLog['observations']['cloudFormationStatusPostRemove'] =
    'OTHER';
  try {
    const out = execSync(
      `aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].StackStatus" --output text 2>&1 || true`,
      { encoding: 'utf-8', env },
    ).trim();
    if (out.includes('does not exist') || out.includes('ValidationError')) {
      cfStatus = 'NOT_FOUND';
      log.ok(`CloudFormation: stack ${stackName} does not exist`);
    } else if (out === 'DELETE_COMPLETE') {
      cfStatus = 'DELETE_COMPLETE';
      log.ok('CloudFormation: DELETE_COMPLETE');
    } else if (out === 'DELETE_FAILED') {
      cfStatus = 'DELETE_FAILED';
      log.fail('CloudFormation: DELETE_FAILED — orphans likely');
    } else if (out === 'DELETE_IN_PROGRESS') {
      cfStatus = 'DELETE_IN_PROGRESS';
      log.warn('CloudFormation: DELETE_IN_PROGRESS — still tearing down');
    } else {
      cfStatus = 'OTHER';
      log.warn(`CloudFormation status: ${out}`);
    }
  } catch (err) {
    log.warn(
      `CloudFormation describe-stacks failed: ${(err as Error).message}`,
    );
  }
  RUN_LOG.observations.cloudFormationStatusPostRemove = cfStatus;

  // 2) APIGateway: stage still exists?
  let stageExists = false;
  let cacheClusterStatusPostRemove: string | null = null;
  if (restApiId) {
    try {
      const stageOut = execSync(
        `aws apigateway get-stage --rest-api-id ${restApiId} --stage-name e2e --output json 2>&1 || true`,
        { encoding: 'utf-8', env },
      ).trim();
      if (
        stageOut.includes('NotFoundException') ||
        stageOut.includes('not found')
      ) {
        log.ok('APIGateway: stage e2e does not exist');
      } else {
        stageExists = true;
        try {
          const stage = JSON.parse(stageOut) as {
            cacheClusterStatus?: string;
            cacheClusterEnabled?: boolean;
          };
          cacheClusterStatusPostRemove = stage.cacheClusterStatus ?? null;
          log.fail(
            `APIGateway: stage STILL EXISTS (cluster status: ${cacheClusterStatusPostRemove ?? 'unknown'}) — ORPHAN CONFIRMED`,
          );
        } catch {
          log.warn(
            `APIGateway: stage might exist but couldn't parse: ${stageOut.slice(0, 100)}`,
          );
          stageExists = true;
        }
      }
    } catch {
      log.warn('APIGateway get-stage errored');
    }
  }
  RUN_LOG.observations.apiGatewayStageExistsPostRemove = stageExists;
  RUN_LOG.observations.cacheClusterStatusPostRemove =
    cacheClusterStatusPostRemove;

  // 3) REST API itself
  let restApiExists = false;
  if (restApiId) {
    try {
      const apiOut = execSync(
        `aws apigateway get-rest-api --rest-api-id ${restApiId} --output text 2>&1 || true`,
        { encoding: 'utf-8', env },
      ).trim();
      if (
        apiOut.includes('NotFoundException') ||
        apiOut.includes('not found')
      ) {
        log.ok('APIGateway: REST API does not exist');
      } else {
        restApiExists = true;
        log.fail('APIGateway: REST API STILL EXISTS — ORPHAN');
      }
    } catch {
      // Non-fatal
    }
  }
  RUN_LOG.observations.restApiExistsPostRemove = restApiExists;
}

function renderVerdict(): void {
  log.step(8, 8, 'Verdict');
  const obs = RUN_LOG.observations;
  const cleanRemoval =
    obs.removeExitCode === 0 &&
    !obs.removeTimedOut &&
    (obs.cloudFormationStatusPostRemove === 'DELETE_COMPLETE' ||
      obs.cloudFormationStatusPostRemove === 'NOT_FOUND') &&
    !obs.apiGatewayStageExistsPostRemove &&
    !obs.restApiExistsPostRemove;
  const ghostBillingDetected = !cleanRemoval;

  let summary: string;
  if (cleanRemoval) {
    summary = `Community plugin's sls remove was clean (${obs.removeDurationSec}s, exit 0, all resources gone). Ghost-billing claim NOT corroborated for this configuration. The structural hook gap (no before:remove:remove) does not produce orphans here.`;
    log.warn(summary);
  } else {
    const reasons: string[] = [];
    if (obs.removeTimedOut) reasons.push('sls remove timed out (10 min)');
    if (obs.removeExitCode !== 0)
      reasons.push(`sls remove exited ${obs.removeExitCode}`);
    if (obs.cloudFormationStatusPostRemove === 'DELETE_FAILED')
      reasons.push('CloudFormation DELETE_FAILED');
    if (obs.cloudFormationStatusPostRemove === 'DELETE_IN_PROGRESS')
      reasons.push('CloudFormation still in DELETE_IN_PROGRESS at check time');
    if (obs.apiGatewayStageExistsPostRemove)
      reasons.push('APIGateway stage e2e still exists');
    if (obs.restApiExistsPostRemove) reasons.push('REST API still exists');
    summary = `Ghost billing CONFIRMED for community plugin: ${reasons.join('; ')}`;
    log.fail(summary);
  }
  RUN_LOG.verdict = { cleanRemoval, ghostBillingDetected, summary };
}

async function main(): Promise<void> {
  console.log(
    `${COLORS.bold}${COLORS.cyan}\n@interlace/serverless-api-gateway-caching — COMMUNITY plugin comparative E2E${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}Goal: measure live whether the community plugin's sls remove leaves orphans (ghost-billing claim).${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}Cost: ~$0.05 (cache cluster × ~7-10 min). 10-min hard timeout on remove caps unbounded cost.${COLORS.reset}`,
  );

  try {
    const { region } = preflight();
    WORK_DIR = setupWorkDir();
    const endpoint = deploy(WORK_DIR, region);
    if (!RUN_LOG.restApiId) throw new Error('no restApiId captured');
    await waitForClusterReady(RUN_LOG.restApiId, region);
    await verifyCachingWorks(endpoint);
    measuredRemove(WORK_DIR, region);
    checkOrphans(RUN_LOG.serviceName ?? '', RUN_LOG.restApiId, region);
    renderVerdict();
    RUN_LOG.status =
      RUN_LOG.verdict?.cleanRemoval === false ? 'passed' : 'passed';
  } catch (err) {
    log.fail(`E2E failed: ${(err as Error).message}`);
    RUN_LOG.status = 'failed';
    RUN_LOG.steps.push({
      id: -1,
      label: 'failure',
      status: 'fail',
      error: (err as Error).message,
    });
    // Best-effort cleanup if a workdir exists
    if (WORK_DIR && existsSync(WORK_DIR)) {
      console.log(
        `\n${COLORS.yellow}🚨 attempting emergency \`sls remove\`…${COLORS.reset}`,
      );
      try {
        const env = { ...process.env, AWS_REGION: RUN_LOG.region };
        runStreaming(
          'npx',
          ['serverless', 'remove'],
          WORK_DIR,
          env,
          10 * 60 * 1000,
        );
      } catch (rmErr) {
        log.fail(`emergency remove failed: ${(rmErr as Error).message}`);
      }
    }
    process.exitCode = 1;
  } finally {
    persistRunLog();
    if (WORK_DIR && existsSync(WORK_DIR)) {
      try {
        rmSync(WORK_DIR, { recursive: true, force: true });
      } catch {
        /* non-critical */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  RUN_LOG.status = 'failed';
  persistRunLog();
  process.exit(1);
});
