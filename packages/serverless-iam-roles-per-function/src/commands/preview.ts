import type { ServerlessInstance } from '../framework.js';
import type { ResolvedSettings } from '../types.js';
import { applyPerFunctionRoles } from '../role-builder.js';

/**
 * Dry-run that shows what roles WOULD be created without actually mutating
 * the CloudFormation template. Useful in CI gates and code review.
 *
 * The community plugin has no equivalent — users have to deploy and inspect
 * the CloudFormation console to see the generated roles.
 */
export function runPreview(
  serverless: ServerlessInstance,
  settings: ResolvedSettings,
): { previewLines: string[] } {
  const provider = serverless.providers.aws;
  // Run the role builder on a deep clone of the template so the live one
  // is not mutated.
  const original = serverless.service.provider.compiledCloudFormationTemplate;
  const cloned = JSON.parse(JSON.stringify(original));
  serverless.service.provider.compiledCloudFormationTemplate = cloned;
  const result = applyPerFunctionRoles({ serverless, provider, settings });
  serverless.service.provider.compiledCloudFormationTemplate = original;

  const lines: string[] = [];
  lines.push('--- IAM Roles Per Function — Preview (dry-run) ---');
  lines.push(
    `Functions:                ${serverless.service.getAllFunctions().length}`,
  );
  lines.push(`Per-function roles:       ${result.functionToRoleMap.size}`);
  lines.push(
    `Skipped (no iamRoleStatements): ${result.skippedFunctions.length}`,
  );
  lines.push(
    `Global role suppressed:   ${result.globalRoleSuppressed ? 'yes' : 'no'}`,
  );
  lines.push('');
  if (result.functionToRoleMap.size > 0) {
    lines.push('Roles to be created:');
    for (const [fnName, roleLogicalId] of result.functionToRoleMap.entries()) {
      lines.push(`  ${fnName.padEnd(40)} → ${roleLogicalId}`);
    }
  }
  if (result.skippedFunctions.length > 0) {
    lines.push('');
    lines.push('Functions WITHOUT per-function roles (use the global role):');
    for (const fn of result.skippedFunctions) lines.push(`  - ${fn}`);
  }
  return { previewLines: lines };
}
