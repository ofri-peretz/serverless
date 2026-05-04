import type { ServerlessInstance } from '../framework.js';
import type { ValidationFinding } from '../types.js';

/**
 * Audit functions WITHOUT per-function IAM roles. Surfaces a list so security
 * reviewers can see which functions still depend on the broad global role.
 *
 * Exits 0 even when findings exist — exits non-zero ONLY when
 * `--strict` (or `requirePerFunctionRoles: true`) is set.
 */
export interface AuditOptions {
  /** If true, report missing per-function roles as errors (else warnings). */
  strict?: boolean;
}

export function runAudit(
  serverless: ServerlessInstance,
  options: AuditOptions = {},
): { findings: ValidationFinding[]; lines: string[] } {
  const findings: ValidationFinding[] = [];
  const lines: string[] = [];

  const allFunctions = serverless.service.getAllFunctions();
  if (allFunctions.length === 0) {
    lines.push('No functions defined — nothing to audit.');
    return { findings, lines };
  }

  const withoutRoles: string[] = [];
  const withRoles: string[] = [];
  for (const name of allFunctions) {
    const fn = serverless.service.getFunction(name);
    if (fn.iamRoleStatements) {
      withRoles.push(name);
    } else {
      withoutRoles.push(name);
      findings.push({
        functionName: name,
        severity: options.strict ? 'error' : 'warning',
        message: `Function "${name}" has no per-function iamRoleStatements; falls back to the broad global role.`,
        field: 'iamRoleStatements',
      });
    }
  }

  lines.push('--- IAM Audit ---');
  lines.push(`Total functions:               ${allFunctions.length}`);
  lines.push(`With per-function roles:       ${withRoles.length}`);
  lines.push(`Using global role (fallback):  ${withoutRoles.length}`);
  if (withoutRoles.length > 0) {
    lines.push('');
    lines.push('Functions falling back to the global role:');
    for (const name of withoutRoles) {
      lines.push(`  ${options.strict ? '✗' : '⚠'} ${name}`);
    }
    lines.push('');
    lines.push(
      'To enforce least-privilege per function, add iamRoleStatements to each.',
    );
    if (!options.strict) {
      lines.push(
        'Set custom.interlaceIamRolesPerFunction.requirePerFunctionRoles: true to fail builds.',
      );
    }
  }
  return { findings, lines };
}
