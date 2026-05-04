import type { ServerlessInstance, IamStatement } from './framework.js';
import type { InterlaceIamConfig, ResolvedSettings } from './types.js';

/**
 * Where to read the plugin's global config from `serverless.yml`. The first
 * matching key wins — the new key is preferred but the legacy community-plugin
 * key is honored so users can migrate by simply swapping the plugin name.
 */
const CUSTOM_KEY_PRIMARY = 'interlaceIamRolesPerFunction';
const CUSTOM_KEY_COMMUNITY_COMPAT = 'serverless-iam-roles-per-function';

export function resolveSettings(
  serverless: ServerlessInstance,
): ResolvedSettings {
  const custom = (serverless.service.custom ?? {}) as Record<string, unknown>;
  const config = (custom[CUSTOM_KEY_PRIMARY] ??
    custom[CUSTOM_KEY_COMMUNITY_COMPAT] ??
    {}) as InterlaceIamConfig;

  return {
    global: {
      defaultInherit: config.defaultInherit ?? false,
      iamGlobalPermissionsBoundary: config.iamGlobalPermissionsBoundary,
      suppressGlobalRole: config.suppressGlobalRole ?? false,
      requirePerFunctionRoles: config.requirePerFunctionRoles ?? false,
      consolidateIdenticalRoles: config.consolidateIdenticalRoles ?? false,
      statementTemplates: config.statementTemplates ?? {},
    },
  };
}

/**
 * Read the provider-level IAM statements from either the v3+ form
 * (`provider.iam.role.statements`) or the deprecated v2 form
 * (`provider.iamRoleStatements`). The legacy form still appears in
 * many real-world v3 codebases that never migrated.
 */
export function getProviderStatements(
  serverless: ServerlessInstance,
): IamStatement[] {
  const provider = serverless.service.provider;
  const v3Form = provider.iam?.role?.statements;
  if (v3Form && v3Form.length > 0) return v3Form;
  return provider.iamRoleStatements ?? [];
}
