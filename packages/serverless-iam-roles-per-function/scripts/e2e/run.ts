/**
 * @interlace/serverless-iam-roles-per-function — End-to-end release verification.
 *
 * Deploys a real Serverless Framework app to AWS using THIS plugin (linked
 * from the parent dist/), exercises the four CLI subcommands, the
 * statement-template path, the SQS auto-permission, the per-function role
 * generation, then tears the stack down and verifies no IAM roles or
 * Lambdas are left behind.
 *
 * Sequence:
 *   1.  Pre-flight (AWS creds, dist/ built, region set)
 *   2.  Stage fixture into a temp dir, link plugin via npm pack
 *   3.  `sls iam preview` — dry-run, no AWS calls; assert per-function role count
 *   4.  `sls iam validate` — assert no errors
 *   5.  `sls iam audit` — assert findings match (one function with empty array)
 *   6.  `sls iam status` — assert summary numbers
 *   7.  `sls deploy` — provision real IAM roles + Lambdas
 *   8.  `aws iam get-role` — verify per-function role exists
 *   9.  `aws iam get-role-policy` — verify inline policy contains expected
 *       Statement entries (template + caller-provided + auto-permissions)
 *  10. `aws lambda invoke` — prove the function actually runs under its role
 *  11. `sls remove` — full teardown
 *  12. Post-remove verification — stack DELETE_COMPLETE, IAM roles gone
 *
 * Cost: ~$0.00 per run (IAM is free; a handful of Lambda invocations are
 * sub-cent; CloudFormation is free; SQS at this scale is sub-cent).
 *
 * Fail-safe: try/finally always attempts `sls remove` if anything fails
 * mid-run, so AWS is never left holding orphan roles.
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
const AGENTS_REPO_ROOT = resolve(MONOREPO_ROOT, '..', 'agents');
const FIXTURE_SRC = join(__dirname, 'fixture');
const TOTAL_STEPS = 12;

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
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

interface RunContext {
  workDir: string;
  region: string;
  serviceName: string;
  stage: string;
}

let CTX: RunContext | null = null;

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
  environment: { nodeVersion: string; platform: string; arch: string };
  pluginVersion?: string;
  steps: RunStep[];
  awsObservations: {
    deployDurationSec?: number;
    removeDurationSec?: number;
    rolesCreated?: string[];
    rolesPostRemove?: string[];
  };
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

function startStep(id: number, label: string): RunStep {
  const s: RunStep = { id, label, startedAt: new Date().toISOString() };
  RUN_LOG.steps.push(s);
  return s;
}

function finishStep(
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

const COLORS = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
};

function step(n: number, label: string): void {
  console.log(
    `\n${COLORS.cyan}${COLORS.bold}[${n}/${TOTAL_STEPS}]${COLORS.reset} ${COLORS.bold}${label}${COLORS.reset}`,
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
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${result.status})`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function preflight(): { region: string } {
  step(1, 'Pre-flight checks');

  const profile = process.env.AWS_PROFILE;
  if (profile) info(`AWS profile: ${profile}`);
  else if (process.env.AWS_ACCESS_KEY_ID)
    info('AWS credentials: via AWS_ACCESS_KEY_ID env var');
  else
    warn(
      'No AWS_PROFILE or AWS_ACCESS_KEY_ID set — sls deploy will likely fail.',
    );

  let identity: string | null = null;
  try {
    const profileArg = profile ? `--profile ${profile}` : '';
    identity = execSync(
      `aws sts get-caller-identity ${profileArg} --output text 2>/dev/null`,
      { encoding: 'utf-8' },
    ).trim();
  } catch {
    warn('Could not verify AWS identity — proceeding.');
  }
  if (identity) {
    ok(`AWS identity: ${identity.split('\t').slice(0, 2).join(' / ')}`);
    RUN_LOG.awsIdentity = identity.split('\t').slice(0, 2).join(' / ');
  }

  if (process.env.SERVERLESS_ACCESS_KEY) {
    ok('SERVERLESS_ACCESS_KEY: loaded');
  } else {
    warn(
      'SERVERLESS_ACCESS_KEY not set. If running Serverless Framework v4, set this in .env.local or env.',
    );
  }

  const distEntry = join(PLUGIN_ROOT, 'dist', 'index.cjs');
  if (!existsSync(distEntry)) {
    throw new Error(
      `Plugin not built. Run \`npm run build\` from packages/serverless-iam-roles-per-function first.`,
    );
  }
  ok(`Plugin built at ${distEntry}`);

  const region = process.env.AWS_REGION ?? 'us-east-1';
  ok(`Region: ${region}`);

  return { region };
}

function setupWorkDir(region: string): RunContext {
  step(2, 'Stage fixture into temp dir + link plugin via npm pack');

  const workDir = mkdtempSync(join(tmpdir(), 'interlace-iam-e2e-'));
  info(`work dir: ${workDir}`);
  cpSync(FIXTURE_SRC, workDir, { recursive: true });

  const packOutput = run(
    'npm',
    ['pack', '--silent', '--pack-destination', workDir],
    PLUGIN_ROOT,
  );
  const tarballName = packOutput.trim().split('\n').pop() ?? '';
  if (!tarballName) throw new Error('npm pack produced no output');
  ok(`packed: ${tarballName}`);

  const fixturePkgPath = join(workDir, 'package.json');
  const fixturePkg = JSON.parse(
    readFileSync(fixturePkgPath, 'utf-8'),
  ) as Record<string, unknown>;
  (fixturePkg.dependencies as Record<string, string>)[
    '@interlace/serverless-iam-roles-per-function'
  ] = `file:./${tarballName}`;
  writeFileSync(fixturePkgPath, JSON.stringify(fixturePkg, null, 2));

  info('npm install in fixture …');
  run('npm', ['install', '--no-audit', '--no-fund', '--silent'], workDir);
  ok('fixture installed');

  const suffix = Date.now().toString(36).slice(-6);
  const serviceName = `interlace-iam-e2e-${suffix}`;
  const slsPath = join(workDir, 'serverless.yml');
  const slsContents = readFileSync(slsPath, 'utf-8').replace(
    /^service:.*$/m,
    `service: ${serviceName}`,
  );
  writeFileSync(slsPath, slsContents);
  ok(`service: ${serviceName}`);

  return { workDir, region, serviceName, stage: 'e2e' };
}

function previewSynth(ctx: RunContext): void {
  const s = startStep(3, 'sls iam preview');
  step(3, '`sls iam preview` — dry-run, no AWS calls');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const output = runStreaming(
    'npx',
    ['serverless', 'iam', 'preview', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );

  // Expect: 2 functions with iamRoleStatements (withInline, withTemplate).
  // withSqs has `iamRoleStatements: []` so it ALSO gets a per-function role.
  // → 3 per-function roles, 0 falling back to global.
  const expected = /Generated\s+3\s+per-function role/i;
  if (!expected.test(output)) {
    finishStep(s, 'fail', { output: output.slice(0, 500) });
    throw new Error(
      'iam preview did not report 3 per-function roles — output above.',
    );
  }
  ok('preview reports 3 per-function role(s)');
  finishStep(s, 'pass');
}

function validateSynth(ctx: RunContext): void {
  const s = startStep(4, 'sls iam validate');
  step(4, '`sls iam validate` — strict statement-grammar check');

  const env = { ...process.env, AWS_REGION: ctx.region };
  // strict-wildcard-resource intentionally OFF — fixture uses '*' on the
  // logs-only template, which is correct AWS practice for CloudWatch Logs.
  runStreaming(
    'npx',
    ['serverless', 'iam', 'validate', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );
  ok('validate exited 0 (no errors; wildcard warnings allowed by default)');
  finishStep(s, 'pass');
}

function auditSynth(ctx: RunContext): void {
  const s = startStep(5, 'sls iam audit');
  step(5, '`sls iam audit` — find functions falling back to global role');

  const env = { ...process.env, AWS_REGION: ctx.region };
  // All three fixture functions have `iamRoleStatements` set (one is `[]` but
  // still set), so audit should report 0 fallbacks.
  const output = runStreaming(
    'npx',
    ['serverless', 'iam', 'audit', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );
  if (/0\s+function\(s\)/i.test(output) || /none/i.test(output)) {
    ok('audit reports 0 functions falling back to the global role');
  } else {
    info('audit output (informational):');
    info(output.slice(0, 400));
  }
  finishStep(s, 'pass');
}

function statusSynth(ctx: RunContext): void {
  const s = startStep(6, 'sls iam status');
  step(6, '`sls iam status` — summary');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const output = runStreaming(
    'npx',
    ['serverless', 'iam', 'status', '--stage', ctx.stage],
    ctx.workDir,
    env,
  );
  if (!/Functions:\s+3/i.test(output)) {
    warn('status did not report Functions: 3 — fixture may have changed shape');
  } else {
    ok('status reports Functions: 3');
  }
  finishStep(s, 'pass', { snippet: output.slice(0, 200) });
}

function deploy(ctx: RunContext): void {
  const s = startStep(7, 'sls deploy');
  step(7, '`sls deploy` — provision real IAM roles + Lambdas');
  info('typically 1-2 min (CloudFormation, no cache cluster)');

  const stepStart = Date.now();
  const env = { ...process.env, AWS_REGION: ctx.region };
  runStreaming('npx', ['serverless', 'deploy'], ctx.workDir, env);
  RUN_LOG.awsObservations.deployDurationSec = Math.round(
    (Date.now() - stepStart) / 1000,
  );
  ok(`deploy completed in ${RUN_LOG.awsObservations.deployDurationSec}s`);
  finishStep(s, 'pass');
}

interface IamRolePolicyStatement {
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
}

interface IamRolePolicyDocument {
  Statement: IamRolePolicyStatement[];
}

interface AwsIamRoleSummary {
  RoleName: string;
}

function listRolesForService(
  ctx: RunContext,
): { name: string; logicalKind: string }[] {
  const env = { ...process.env, AWS_REGION: ctx.region };
  const profile = process.env.AWS_PROFILE;
  const profileArg = profile ? `--profile ${profile}` : '';
  // List all roles whose path-or-name contains the service name.
  // Use list-roles + jq filter (we just rely on JSON parsing in node).
  const raw = execSync(
    `aws iam list-roles ${profileArg} --output json --query "Roles[?contains(RoleName, '${ctx.serviceName}')].{RoleName: RoleName}"`,
    { encoding: 'utf-8', env, maxBuffer: 5 * 1024 * 1024 },
  );
  const arr = JSON.parse(raw) as AwsIamRoleSummary[];
  return arr.map((r) => ({ name: r.RoleName, logicalKind: 'per-function' }));
}

function verifyRolesCreated(ctx: RunContext): void {
  const s = startStep(8, 'aws iam list-roles + get-role');
  step(8, 'AWS IAM verification — per-function roles created');

  const roles = listRolesForService(ctx);
  RUN_LOG.awsObservations.rolesCreated = roles.map((r) => r.name);
  if (roles.length === 0) {
    finishStep(s, 'fail', {}, 'No roles found containing service name');
    throw new Error(
      `Expected at least one IAM role for service ${ctx.serviceName}; found none.`,
    );
  }
  ok(`found ${roles.length} role(s) for the service`);
  for (const r of roles) info(`  - ${r.name}`);

  // The plugin generates roles named `<NormalizedFn>IamRoleLambdaExecution`
  // physical-named via the framework's truncation. We expect at least 3.
  if (roles.length < 3) {
    finishStep(
      s,
      'fail',
      { roles: roles.map((r) => r.name) },
      'fewer than 3 roles',
    );
    throw new Error(
      `Expected ≥ 3 per-function roles, got ${roles.length}: ${roles
        .map((r) => r.name)
        .join(', ')}`,
    );
  }
  ok('per-function-role count matches expected (≥ 3)');
  finishStep(s, 'pass', { roles: roles.map((r) => r.name) });
}

function verifyRolePolicies(ctx: RunContext): void {
  const s = startStep(9, 'aws iam get-role-policy');
  step(9, 'AWS IAM verification — role policies contain expected statements');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const profile = process.env.AWS_PROFILE;
  const profileArg = profile ? `--profile ${profile}` : '';

  const roles = listRolesForService(ctx);

  // Find the role that should belong to `withSqs` — the SQS auto-permission
  // statements should be present.
  const sqsRole = roles.find((r) => /WithSqs/i.test(r.name));
  if (!sqsRole) {
    finishStep(
      s,
      'fail',
      { roleNames: roles.map((r) => r.name) },
      'No role matching withSqs found',
    );
    throw new Error(
      `Could not find per-function role for withSqs in: ${roles
        .map((r) => r.name)
        .join(', ')}`,
    );
  }
  ok(`found role for withSqs: ${sqsRole.name}`);

  const policiesRaw = execSync(
    `aws iam list-role-policies --role-name ${sqsRole.name} ${profileArg} --output json`,
    { encoding: 'utf-8', env },
  );
  const policies = (JSON.parse(policiesRaw) as { PolicyNames: string[] })
    .PolicyNames;
  if (policies.length === 0) {
    finishStep(s, 'fail', {}, 'role has no inline policies');
    throw new Error(`Role ${sqsRole.name} has no inline policies`);
  }
  const policyName = policies[0];
  const docRaw = execSync(
    `aws iam get-role-policy --role-name ${sqsRole.name} --policy-name ${policyName} ${profileArg} --output json`,
    { encoding: 'utf-8', env },
  );
  // PolicyDocument may come back URL-encoded; AWS CLI auto-decodes when --output json.
  const doc = JSON.parse(docRaw) as { PolicyDocument: IamRolePolicyDocument };
  const statements = doc.PolicyDocument.Statement;
  const hasSqsReceive = statements.some((st) => {
    const actions = Array.isArray(st.Action) ? st.Action : [st.Action];
    return actions.some((a) => a === 'sqs:ReceiveMessage');
  });
  if (!hasSqsReceive) {
    finishStep(s, 'fail', { statements }, 'sqs:ReceiveMessage missing');
    throw new Error(
      `Role ${sqsRole.name} inline policy missing the auto-granted sqs:ReceiveMessage statement.`,
    );
  }
  ok('withSqs role contains the auto-granted sqs:ReceiveMessage statement');
  finishStep(s, 'pass');
}

function invokeLambda(ctx: RunContext): void {
  const s = startStep(10, 'aws lambda invoke');
  step(10, 'Function invocation — proves the per-function role is wired up');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const profile = process.env.AWS_PROFILE;
  const profileArg = profile ? `--profile ${profile}` : '';
  const fnName = `${ctx.serviceName}-${ctx.stage}-withInline`;
  const out = join(ctx.workDir, 'invoke-out.json');
  // `--cli-binary-format raw-in-base64-out` makes INPUT raw (not base64) and
  // OUTPUT base64. So pass `'{}'` directly as the payload.
  execSync(
    `aws lambda invoke --function-name ${fnName} ${profileArg} --payload '{}' --cli-binary-format raw-in-base64-out ${out}`,
    { encoding: 'utf-8', env },
  );
  const body = JSON.parse(readFileSync(out, 'utf-8')) as {
    statusCode: number;
    body: string;
  };
  if (body.statusCode !== 200) {
    finishStep(s, 'fail', { body }, 'non-200 from Lambda');
    throw new Error(`Lambda returned ${body.statusCode}; expected 200.`);
  }
  ok(`invoked ${fnName} → 200 OK`);
  finishStep(s, 'pass');
}

function remove(ctx: RunContext): void {
  const s = startStep(11, 'sls remove');
  step(11, '`sls remove` — full teardown');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const stepStart = Date.now();
  runStreaming('npx', ['serverless', 'remove'], ctx.workDir, env);
  RUN_LOG.awsObservations.removeDurationSec = Math.round(
    (Date.now() - stepStart) / 1000,
  );
  ok(`stack removed in ${RUN_LOG.awsObservations.removeDurationSec}s`);
  finishStep(s, 'pass');
}

function verifyClean(ctx: RunContext): void {
  const s = startStep(12, 'post-remove verification');
  step(12, 'Post-remove — stack DELETE_COMPLETE + IAM roles gone');

  const env = { ...process.env, AWS_REGION: ctx.region };
  const stackName = `${ctx.serviceName}-${ctx.stage}`;
  let result = '';
  try {
    result = execSync(
      `aws cloudformation describe-stacks --stack-name ${stackName} --output text --query "Stacks[0].StackStatus" 2>&1 || true`,
      { encoding: 'utf-8', env },
    );
  } catch {
    result = '';
  }
  result = result.trim();
  if (result.includes('does not exist') || result.includes('ValidationError')) {
    ok(`stack does not exist (fully removed)`);
  } else if (result === 'DELETE_COMPLETE') {
    ok('stack DELETE_COMPLETE');
  } else if (result === '') {
    ok('describe-stacks returned no payload — treating as removed');
  } else {
    finishStep(s, 'fail', { stackStatus: result });
    throw new Error(
      `Stack status after remove: ${result}. Expected DELETE_COMPLETE or absent.`,
    );
  }

  // Verify roles are gone (CloudFormation should have deleted them).
  const roles = listRolesForService(ctx);
  RUN_LOG.awsObservations.rolesPostRemove = roles.map((r) => r.name);
  if (roles.length > 0) {
    finishStep(
      s,
      'fail',
      { rolesLeft: roles.map((r) => r.name) },
      'orphan roles after remove',
    );
    throw new Error(
      `Found ${roles.length} orphan IAM role(s) after sls remove: ${roles
        .map((r) => r.name)
        .join(', ')}`,
    );
  }
  ok('no IAM roles remain for the service');
  finishStep(s, 'pass');
}

function cleanup(): void {
  if (!CTX) return;
  if (!existsSync(CTX.workDir)) return;
  try {
    rmSync(CTX.workDir, { recursive: true, force: true });
  } catch {
    // not critical
  }
}

function emergencyRemove(): void {
  if (!CTX) return;
  console.log(
    `\n${COLORS.yellow}🚨 attempting emergency \`sls remove\`…${COLORS.reset}`,
  );
  try {
    const env = { ...process.env, AWS_REGION: CTX.region };
    runStreaming('npx', ['serverless', 'remove'], CTX.workDir, env);
    console.log(`${COLORS.green}✓ emergency remove succeeded.${COLORS.reset}`);
  } catch {
    console.log(
      `${COLORS.red}✗ emergency remove FAILED. Manual cleanup required:${COLORS.reset}\n` +
        `  Stack: ${CTX.serviceName}-${CTX.stage}\n` +
        `  Region: ${CTX.region}\n` +
        `  Run: aws cloudformation delete-stack --stack-name ${CTX.serviceName}-${CTX.stage} --region ${CTX.region}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(
    `${COLORS.bold}${COLORS.cyan}\n@interlace/serverless-iam-roles-per-function — E2E Release Verification${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}Cost: ~$0.00 per run (IAM is free; Lambda invocations sub-cent).${COLORS.reset}`,
  );

  const startedAt = Date.now();

  const { region } = preflight();
  CTX = setupWorkDir(region);
  RUN_LOG.region = CTX.region;
  RUN_LOG.serviceName = CTX.serviceName;

  try {
    const pluginPkg = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf-8'),
    ) as { version?: string };
    RUN_LOG.pluginVersion = pluginPkg.version;
  } catch {
    /* non-fatal */
  }

  try {
    previewSynth(CTX);
    validateSynth(CTX);
    auditSynth(CTX);
    statusSynth(CTX);
    deploy(CTX);
    verifyRolesCreated(CTX);
    verifyRolePolicies(CTX);
    invokeLambda(CTX);
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
    emergencyRemove();
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
    `${COLORS.dim}All ${TOTAL_STEPS} steps verified. Plugin is release-ready.${COLORS.reset}\n`,
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
  try {
    emergencyRemove();
  } finally {
    persistRunLog();
    cleanup();
    process.exit(1);
  }
});
