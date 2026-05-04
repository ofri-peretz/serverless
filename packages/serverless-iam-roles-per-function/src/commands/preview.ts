import type {
  CompiledCloudFormationTemplate,
  ServerlessInstance,
} from '../framework.js';

/**
 * Dry-run that shows what roles WOULD be created on the next deploy.
 *
 * The flow:
 *   1. Caller (`runPreviewCommand` in index.ts) spawns the `package` lifecycle.
 *      This populates `compiledCloudFormationTemplate` AND triggers our
 *      `before:package:finalize` hook, which builds the per-function roles.
 *   2. We then walk the post-package template and report what landed there.
 *
 * Why we don't run the role-builder ourselves: the post-spawn template
 * already contains the exact roles a deploy would push to AWS — re-running
 * the builder would double-apply. Reading what's there is both simpler and
 * more accurate (it reflects all hook ordering, even other plugins'
 * interactions).
 *
 * The "dry-run" character comes from the fact that no AWS API is called.
 * The local in-memory template is fully synthesised; no network calls fire.
 */
export interface PreviewSummary {
  functionsTotal: number;
  perFunctionRoles: Array<{ fnName: string; roleLogicalId: string }>;
  fallbackToGlobal: string[];
  globalRoleSuppressed: boolean;
}

export function runPreview(serverless: ServerlessInstance): {
  previewLines: string[];
  summary: PreviewSummary;
} {
  const template = serverless.service.provider.compiledCloudFormationTemplate;
  if (!template || !template.Resources) {
    return {
      previewLines: [
        '--- IAM Roles Per Function — Preview (dry-run) ---',
        'CloudFormation template not built — `iam preview` requires the package lifecycle to have run.',
      ],
      summary: {
        functionsTotal: 0,
        perFunctionRoles: [],
        fallbackToGlobal: [],
        globalRoleSuppressed: false,
      },
    };
  }

  const provider = serverless.providers.aws;
  const globalRoleId = provider.naming.getRoleLogicalId();
  const allFns = serverless.service.getAllFunctions();
  const perFunctionRoles: Array<{ fnName: string; roleLogicalId: string }> = [];
  const fallbackToGlobal: string[] = [];
  for (const fnName of allFns) {
    const expectedRoleId =
      provider.naming.getNormalizedFunctionName(fnName) + globalRoleId;
    if (resolvesToRole(template, expectedRoleId)) {
      perFunctionRoles.push({ fnName, roleLogicalId: expectedRoleId });
    } else {
      fallbackToGlobal.push(fnName);
    }
  }
  const globalRoleSuppressed = !template.Resources[globalRoleId];

  const lines: string[] = [];
  lines.push('--- IAM Roles Per Function — Preview (dry-run) ---');
  lines.push(`Functions:                  ${allFns.length}`);
  lines.push(`Per-function roles:         ${perFunctionRoles.length}`);
  lines.push(`Falling back to global:     ${fallbackToGlobal.length}`);
  lines.push(
    `Global role suppressed:     ${globalRoleSuppressed ? 'yes' : 'no'}`,
  );

  if (perFunctionRoles.length > 0) {
    lines.push('');
    lines.push('Roles to be created:');
    const widest = perFunctionRoles.reduce(
      (n, r) => Math.max(n, r.fnName.length),
      0,
    );
    for (const r of perFunctionRoles) {
      lines.push(`  ${r.fnName.padEnd(widest)}  →  ${r.roleLogicalId}`);
    }
  }
  if (fallbackToGlobal.length > 0) {
    lines.push('');
    lines.push('Functions on the global role:');
    for (const fn of fallbackToGlobal) lines.push(`  - ${fn}`);
  }

  return {
    previewLines: lines,
    summary: {
      functionsTotal: allFns.length,
      perFunctionRoles,
      fallbackToGlobal,
      globalRoleSuppressed,
    },
  };
}

function resolvesToRole(
  template: CompiledCloudFormationTemplate,
  logicalId: string,
): boolean {
  const resource = template.Resources[logicalId];
  return resource !== undefined && resource.Type === 'AWS::IAM::Role';
}
