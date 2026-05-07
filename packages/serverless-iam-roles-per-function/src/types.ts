/**
 * Plugin configuration types — exposed for consumers that want type-safe
 * `serverless.ts` configs.
 */

import type { IamStatement } from './framework.js';

/**
 * Global plugin config (lives under `custom.interlaceIamRolesPerFunction`).
 *
 * For backwards compatibility with the community plugin, we ALSO accept
 * `custom.serverless-iam-roles-per-function` — see `src/settings.ts`.
 */
export interface InterlaceIamConfig {
  /**
   * If true, every per-function role inherits the provider-level statements
   * unless the function explicitly sets `iamRoleStatementsInherit: false`.
   * Default: false.
   */
  defaultInherit?: boolean;

  /**
   * ARN of an IAM permissions boundary applied to EVERY generated role
   * (per-function and the global role).
   *
   * Format: `arn:aws:iam::<account>:policy/<name>` or CFN intrinsic.
   */
  iamGlobalPermissionsBoundary?: string;

  /**
   * If true, the global IAM role is NOT emitted into the CloudFormation
   * template when every function has its own role. Saves a wasted resource
   * and avoids the global role being silently used by anything.
   *
   * Default: false (preserves community plugin behavior).
   */
  suppressGlobalRole?: boolean;

  /**
   * If true, fail packaging when ANY function lacks `iamRoleStatements`.
   * Useful as a guardrail in security-conscious teams that want to enforce
   * least-privilege per function.
   *
   * Default: false.
   */
  requirePerFunctionRoles?: boolean;

  /**
   * If true and two or more functions resolve to identical statement sets,
   * a single role is shared between them. Cuts CloudFormation resource
   * count for repetitive services.
   *
   * Default: false (each function gets its own role — preserves community
   * plugin behavior).
   */
  consolidateIdenticalRoles?: boolean;

  /**
   * Named statement templates that functions can reference via
   * `iamRoleStatementsTemplate`. Useful for sharing common base policies
   * (e.g., "data-read", "logging") across many functions without YAML
   * anchors or duplication.
   */
  statementTemplates?: Record<string, IamStatement[]>;
}

/**
 * Per-function plugin config — declared on each Lambda function definition
 * via the schema in `src/index.ts`.
 */
export interface InterlaceFunctionIamConfig {
  /** Per-function IAM policy statements (required to trigger per-function role generation). */
  iamRoleStatements?: IamStatement[];

  /**
   * Inherit provider-level statements into this function's role.
   * Overrides the global `defaultInherit` setting.
   */
  iamRoleStatementsInherit?: boolean;

  /** Custom name for the generated role (avoids the 64-char auto-name limit). */
  iamRoleStatementsName?: string;

  /** Per-function permissions boundary ARN (overrides `iamGlobalPermissionsBoundary`). */
  iamPermissionsBoundary?: string;

  /**
   * AWS managed policy ARNs to attach to this function's role.
   * Useful for `AWSLambdaVPCAccessExecutionRole`, `AmazonS3ReadOnlyAccess`, etc.
   * VPC-required policies are still auto-attached when `vpc` is configured —
   * this list is additive.
   */
  iamManagedPolicies?: string[];

  /**
   * Reference a named template defined in `custom.interlaceIamRolesPerFunction.statementTemplates`.
   * Statements from the template are appended BEFORE `iamRoleStatements`
   * (so function-level statements can extend or shadow template entries).
   */
  iamRoleStatementsTemplate?: string;
}

/**
 * Validation finding — emitted by `validators/*` and consumed by the
 * `iam validate` command.
 */
export interface ValidationFinding {
  functionName?: string;
  statementIndex?: number;
  severity: 'error' | 'warning';
  message: string;
  /** Optional pointer to the statement field that triggered the finding. */
  field?: string;
}

/**
 * Result of resolving the plugin's settings — what the rest of the codebase
 * receives after `settings.ts` has merged custom config + defaults + per-function
 * overrides.
 */
export interface ResolvedSettings {
  global: Required<
    Pick<
      InterlaceIamConfig,
      | 'defaultInherit'
      | 'suppressGlobalRole'
      | 'requirePerFunctionRoles'
      | 'consolidateIdenticalRoles'
    >
  > & {
    iamGlobalPermissionsBoundary?: string;
    statementTemplates: Record<string, IamStatement[]>;
  };
}
