import type { ServerlessInstance } from '../framework.js';
import type { ValidationFinding } from '../types.js';
import {
  validateStatement,
  type StatementValidationOptions,
} from '../validators/statement.js';

/**
 * Validate every function's iamRoleStatements with the strict statement
 * validator. Useful in CI to catch malformed policies before deploy fails
 * at CloudFormation time.
 */
export interface ValidateOptions extends StatementValidationOptions {
  /** If true, exit non-zero on warnings too (default: only errors fail). */
  treatWarningsAsErrors?: boolean;
}

export function runValidate(
  serverless: ServerlessInstance,
  options: ValidateOptions = {},
): { findings: ValidationFinding[]; lines: string[] } {
  const findings: ValidationFinding[] = [];
  const lines: string[] = [];

  for (const name of serverless.service.getAllFunctions()) {
    const fn = serverless.service.getFunction(name);
    if (!fn.iamRoleStatements) continue;
    fn.iamRoleStatements.forEach((statement, index) => {
      for (const finding of validateStatement(statement, options)) {
        findings.push({
          ...finding,
          functionName: name,
          statementIndex: index,
        });
      }
    });
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  lines.push('--- IAM Statement Validation ---');
  lines.push(`Errors:    ${errors.length}`);
  lines.push(`Warnings:  ${warnings.length}`);

  if (findings.length === 0) {
    lines.push('All iamRoleStatements pass strict validation. ✓');
    return { findings, lines };
  }

  lines.push('');
  for (const f of findings) {
    const sev = f.severity === 'error' ? '✗' : '⚠';
    const loc = `${f.functionName ?? '?'}[${f.statementIndex ?? '?'}]`;
    lines.push(`  ${sev} ${loc}  ${f.field ?? ''}  ${f.message}`);
  }
  return { findings, lines };
}
