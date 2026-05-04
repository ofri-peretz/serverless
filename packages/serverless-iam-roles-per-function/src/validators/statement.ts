import type { IamStatement } from '../framework.js';
import type { ValidationFinding } from '../types.js';

/**
 * Strict statement validator — verifies AWS IAM statement grammar.
 *
 * Stricter than the community plugin's check (which only verifies presence
 * of Effect/Action/Resource). We additionally validate:
 *
 * - Effect must be exactly `Allow` or `Deny` (not just non-empty)
 * - Action and NotAction (when present) follow `service:action` format
 *   (or wildcard) — flagged as warning, not error
 * - Statement uses Action XOR NotAction, Resource XOR NotResource
 * - Sid (when present) must match `[A-Za-z0-9]+` per AWS spec
 *
 * Returns findings with `severity: 'error' | 'warning'`. Errors block the
 * deploy; warnings are surfaced via `sls iam validate` but don't block.
 */
export interface StatementValidationOptions {
  /** If true, wildcard Action (`*`) is treated as an error, not a warning. */
  strictWildcardAction?: boolean;
  /** If true, wildcard Resource (`*`) is treated as an error, not a warning. */
  strictWildcardResource?: boolean;
}

export function validateStatement(
  statement: IamStatement,
  options: StatementValidationOptions = {},
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  // Effect — must be Allow or Deny
  if (!statement.Effect) {
    findings.push({
      severity: 'error',
      message: 'Statement missing required field "Effect".',
      field: 'Effect',
    });
  } else if (statement.Effect !== 'Allow' && statement.Effect !== 'Deny') {
    findings.push({
      severity: 'error',
      message: `Statement Effect must be "Allow" or "Deny", got "${String(statement.Effect)}".`,
      field: 'Effect',
    });
  }

  // Action XOR NotAction
  const hasAction = !isEmpty(statement.Action);
  const hasNotAction = !isEmpty(statement.NotAction);
  if (!hasAction && !hasNotAction) {
    findings.push({
      severity: 'error',
      message: 'Statement must have either "Action" or "NotAction".',
      field: 'Action',
    });
  } else if (hasAction && hasNotAction) {
    findings.push({
      severity: 'error',
      message: 'Statement cannot have both "Action" and "NotAction".',
      field: 'Action',
    });
  }

  // Resource XOR NotResource
  const hasResource = !isEmpty(statement.Resource);
  const hasNotResource = !isEmpty(statement.NotResource);
  if (!hasResource && !hasNotResource) {
    findings.push({
      severity: 'error',
      message: 'Statement must have either "Resource" or "NotResource".',
      field: 'Resource',
    });
  } else if (hasResource && hasNotResource) {
    findings.push({
      severity: 'error',
      message: 'Statement cannot have both "Resource" and "NotResource".',
      field: 'Resource',
    });
  }

  // Action format — `service:action` or wildcard
  for (const action of toArray(statement.Action ?? statement.NotAction)) {
    if (typeof action !== 'string') continue;
    if (action === '*') {
      findings.push({
        severity: options.strictWildcardAction ? 'error' : 'warning',
        message:
          'Wildcard "*" Action grants every permission — verify this is intentional.',
        field: 'Action',
      });
      continue;
    }
    if (!/^[a-z0-9-]+:[A-Za-z0-9*]+$/.test(action)) {
      findings.push({
        severity: 'warning',
        message: `Action "${action}" does not match the expected "service:action" format.`,
        field: 'Action',
      });
    }
  }

  // Resource wildcards (warning by default; some services legitimately need *)
  for (const resource of toArray(statement.Resource ?? statement.NotResource)) {
    if (typeof resource !== 'string') continue;
    if (resource === '*') {
      findings.push({
        severity: options.strictWildcardResource ? 'error' : 'warning',
        message:
          'Wildcard "*" Resource grants access to all resources for the listed actions.',
        field: 'Resource',
      });
    }
  }

  // Sid — alphanumeric only per AWS spec
  if (statement.Sid !== undefined && !/^[A-Za-z0-9]+$/.test(statement.Sid)) {
    findings.push({
      severity: 'error',
      message: `Sid "${statement.Sid}" must contain only alphanumeric characters.`,
      field: 'Sid',
    });
  }

  return findings;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'string' && v.length === 0) return true;
  return false;
}

function toArray<T>(v: T | T[] | undefined | unknown): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? (v as T[]) : ([v] as T[]);
}
