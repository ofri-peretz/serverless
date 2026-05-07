import type { AwsProvider, ServerlessInstance } from './framework.js';

/**
 * Build the per-function role name based on the framework's global role name
 * template. The framework returns a `Fn::Join` that looks like:
 *
 *   { 'Fn::Join': ['-', [<service>, <stage>, { Ref: 'AWS::Region' }, 'lambdaRole']] }
 *
 * We splice the function name in BEFORE 'lambdaRole' to give each function
 * its own role name. AWS limits role names to 64 chars — if the result is
 * over the limit, we drop the trailing 'lambdaRole' suffix to make space.
 */
export interface BuildRoleNameOptions {
  serverless: ServerlessInstance;
  provider: AwsProvider;
  functionName: string;
  /** If set, overrides the auto-derived name (caller's `iamRoleStatementsName`). */
  customName?: string;
}

const AWS_ROLE_NAME_LIMIT = 64;

export function buildPerFunctionRoleName(opts: BuildRoleNameOptions): unknown {
  const { provider, functionName, customName } = opts;
  if (customName) return customName;

  const roleName = provider.naming.getRoleName();
  const fnJoin = (roleName as { 'Fn::Join'?: unknown[] })['Fn::Join'];
  if (
    !Array.isArray(fnJoin) ||
    fnJoin.length !== 2 ||
    !Array.isArray(fnJoin[1]) ||
    (fnJoin[1] as unknown[]).length < 2
  ) {
    throw new Error(
      `Global Role Name is not in expected format. Got: ${JSON.stringify(roleName)}`,
    );
  }

  // Clone parts so we don't mutate the framework's global role name template.
  const parts: unknown[] = [...(fnJoin[1] as unknown[])];
  parts.splice(2, 0, functionName);

  if (
    nameLength(parts, opts.serverless) > AWS_ROLE_NAME_LIMIT &&
    parts[parts.length - 1] === 'lambdaRole'
  ) {
    // Drop trailing 'lambdaRole' suffix to make room for the function name.
    parts.pop();
  }

  if (nameLength(parts, opts.serverless) > AWS_ROLE_NAME_LIMIT) {
    throw new Error(
      `Auto-generated role name for function "${functionName}" exceeds AWS's 64-char limit. ` +
        `Set 'iamRoleStatementsName' on the function definition to override.`,
    );
  }

  return { 'Fn::Join': [(fnJoin[0] as string) ?? '-', parts] };
}

function nameLength(parts: unknown[], serverless: ServerlessInstance): number {
  let length = 0;
  for (const part of parts) {
    if (isRef(part)) {
      if (part.Ref === 'AWS::Region') {
        length += (serverless.service.provider.region ?? 'us-east-1').length;
      } else {
        length += part.Ref.length;
      }
    } else if (typeof part === 'string') {
      length += part.length;
    }
  }
  // Account for separator chars between parts (typically '-')
  length += Math.max(0, parts.length - 1);
  return length;
}

function isRef(p: unknown): p is { Ref: string } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as { Ref?: unknown }).Ref === 'string'
  );
}
