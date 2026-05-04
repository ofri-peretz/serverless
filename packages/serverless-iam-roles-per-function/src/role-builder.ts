import type {
  AwsProvider,
  CompiledCloudFormationTemplate,
  IamRoleProperties,
  IamStatement,
  ServerlessFunctionConfig,
  ServerlessInstance,
} from './framework.js';
import type { ResolvedSettings } from './types.js';
import { buildPerFunctionRoleName } from './role-name.js';
import { buildLogStatement } from './statements/log.js';
import { buildSqsStatement } from './statements/sqs.js';
import { buildStreamStatements } from './statements/streams.js';
import { buildDlqStatement } from './statements/dlq.js';
import { buildEventBridgeStatements } from './statements/eventbridge.js';
import { buildS3Statements } from './statements/s3.js';
import { VPC_MANAGED_POLICY_ARN } from './statements/vpc.js';
import { getProviderStatements } from './settings.js';

const ANNOTATION_KEY = 'Metadata' as const;

export interface BuildContext {
  serverless: ServerlessInstance;
  provider: AwsProvider;
  settings: ResolvedSettings;
}

/**
 * Result of role-building — what `index.ts` and the `preview` command consume.
 */
export interface BuildResult {
  /** Function name → resolved role logical ID. Functions without iamRoleStatements absent. */
  functionToRoleMap: Map<string, string>;
  /** Functions skipped (no iamRoleStatements set). */
  skippedFunctions: string[];
  /** Whether the global role was suppressed (because suppressGlobalRole + every function has its own role). */
  globalRoleSuppressed: boolean;
}

export function applyPerFunctionRoles(ctx: BuildContext): BuildResult {
  const { serverless, settings } = ctx;
  const functions = serverless.service.getAllFunctions();
  const functionToRoleMap = new Map<string, string>();
  const skipped: string[] = [];
  const fnsWithStatements = new Set<string>();

  if (settings.global.requirePerFunctionRoles) {
    enforceRequiredRoles(serverless);
  }

  for (const fnName of functions) {
    const fn = serverless.service.getFunction(fnName);
    if (!fn.iamRoleStatements) {
      skipped.push(fnName);
      continue;
    }
    if (fn.role) {
      throw new Error(
        `Function "${fnName}" has both 'role' and 'iamRoleStatements'. Pick one — they're mutually exclusive.`,
      );
    }
    fnsWithStatements.add(fnName);
    buildAndInsertRoleForFunction(ctx, fnName, fn, functionToRoleMap);
  }

  rewriteEventSourceMappings(serverless, ctx.provider, functionToRoleMap);
  applyGlobalPermissionsBoundary(serverless, settings);

  const globalRoleSuppressed = maybeSuppressGlobalRole(
    serverless,
    settings,
    fnsWithStatements,
  );

  return { functionToRoleMap, skippedFunctions: skipped, globalRoleSuppressed };
}

function enforceRequiredRoles(serverless: ServerlessInstance): void {
  const missing = serverless.service
    .getAllFunctions()
    .filter((name) => !serverless.service.getFunction(name).iamRoleStatements);
  if (missing.length > 0) {
    throw new Error(
      `requirePerFunctionRoles is enabled but the following functions have no iamRoleStatements: ${missing.join(
        ', ',
      )}. Add 'iamRoleStatements: []' for explicitly-empty roles, or set requirePerFunctionRoles: false.`,
    );
  }
}

function buildAndInsertRoleForFunction(
  ctx: BuildContext,
  fnName: string,
  fn: ServerlessFunctionConfig,
  functionToRoleMap: Map<string, string>,
): void {
  const { serverless, provider, settings } = ctx;
  const template = serverless.service.provider.compiledCloudFormationTemplate;
  const globalRoleLogicalId = provider.naming.getRoleLogicalId();
  const globalRole = template.Resources[globalRoleLogicalId];

  if (!globalRole) {
    throw new Error(
      `Global IAM role "${globalRoleLogicalId}" not found in CloudFormation template. ` +
        `This usually means the framework changed its role naming convention. Open an issue.`,
    );
  }

  const policyStatements = collectStatementsForFunction(ctx, fnName, fn);

  const roleResource = cloneRoleTemplate(globalRole);
  setPolicyStatements(roleResource, policyStatements);
  applyManagedPolicies(roleResource, fn, serverless);
  applyPermissionsBoundary(roleResource, fn, settings);
  setRoleName(roleResource, ctx, fnName, fn);

  const roleLogicalId =
    provider.naming.getNormalizedFunctionName(fnName) + globalRoleLogicalId;
  template.Resources[roleLogicalId] = roleResource;

  rewriteFunctionRoleRef(
    template,
    provider,
    fnName,
    roleLogicalId,
    globalRoleLogicalId,
  );
  functionToRoleMap.set(fnName, roleLogicalId);
}

function collectStatementsForFunction(
  ctx: BuildContext,
  fnName: string,
  fn: ServerlessFunctionConfig,
): IamStatement[] {
  const { serverless, provider, settings } = ctx;
  const out: IamStatement[] = [];

  // Always: scoped log statement (function-specific log group)
  out.push(buildLogStatement(provider, fn.name ?? fnName));

  // Auto-permissions for event sources
  out.push(...buildStreamStatements(fn));
  const sqs = buildSqsStatement(fn);
  if (sqs) out.push(sqs);
  const dlq = buildDlqStatement(fn);
  if (dlq) out.push(dlq);
  out.push(...buildEventBridgeStatements(fn));
  out.push(...buildS3Statements(fn));

  // Inheritance from provider-level statements
  const isInherit =
    fn.iamRoleStatementsInherit === true ||
    (settings.global.defaultInherit && fn.iamRoleStatementsInherit !== false);
  if (isInherit) {
    out.push(...getProviderStatements(serverless));
  }

  // Templates referenced by name
  if (fn.iamRoleStatementsTemplate) {
    const template =
      settings.global.statementTemplates[fn.iamRoleStatementsTemplate];
    if (!template) {
      throw new Error(
        `Function "${fnName}" references unknown statement template "${fn.iamRoleStatementsTemplate}". ` +
          `Define it under custom.interlaceIamRolesPerFunction.statementTemplates.`,
      );
    }
    out.push(...template);
  }

  // Caller-provided statements last (so they override / shadow inherited ones)
  if (fn.iamRoleStatements) out.push(...fn.iamRoleStatements);

  return out;
}

function cloneRoleTemplate(globalRole: {
  Properties?: Record<string, unknown>;
}): {
  Type: string;
  Properties: IamRoleProperties;
  DependsOn?: string[] | string;
} {
  // Deep clone — JSON round-trip is sufficient because the template only
  // contains JSON-serializable values (CFN intrinsics are plain objects).
  const cloned = JSON.parse(JSON.stringify(globalRole)) as {
    Type: string;
    Properties: IamRoleProperties;
    DependsOn?: string[] | string;
  };
  if (!cloned.Properties) cloned.Properties = {};
  return cloned;
}

function setPolicyStatements(
  role: { Properties: IamRoleProperties },
  statements: IamStatement[],
): void {
  // Replace the entire Policies array with a single inline policy holding the
  // function's own statements. Don't preserve any Policies entries cloned
  // from the global role — a third-party plugin that appends a second inline
  // policy to the global role (VPC flow loggers, observability agents, etc.)
  // would otherwise leak that policy onto every per-function role and silently
  // over-grant permissions.
  role.Properties.Policies = [
    {
      PolicyName: 'iam-roles-per-function-inline',
      PolicyDocument: { Version: '2012-10-17', Statement: statements },
    },
  ];
}

function applyManagedPolicies(
  role: { Properties: IamRoleProperties },
  fn: ServerlessFunctionConfig,
  serverless: ServerlessInstance,
): void {
  // Reset to empty by default — global role's managed policies are not
  // automatically inherited.
  role.Properties.ManagedPolicyArns = [];

  const needsVpc = !!fn.vpc || !!serverless.service.provider.vpc;
  if (needsVpc) role.Properties.ManagedPolicyArns.push(VPC_MANAGED_POLICY_ARN);

  if (fn.iamManagedPolicies && fn.iamManagedPolicies.length > 0) {
    for (const arn of fn.iamManagedPolicies) {
      role.Properties.ManagedPolicyArns.push(arn);
    }
  }
}

function applyPermissionsBoundary(
  role: { Properties: IamRoleProperties },
  fn: ServerlessFunctionConfig,
  settings: ResolvedSettings,
): void {
  const boundary =
    fn.iamPermissionsBoundary ?? settings.global.iamGlobalPermissionsBoundary;
  if (boundary) role.Properties.PermissionsBoundary = boundary;
}

function setRoleName(
  role: { Properties: IamRoleProperties },
  ctx: BuildContext,
  fnName: string,
  fn: ServerlessFunctionConfig,
): void {
  role.Properties.RoleName = buildPerFunctionRoleName({
    serverless: ctx.serverless,
    provider: ctx.provider,
    functionName: fnName,
    customName: fn.iamRoleStatementsName,
  });
}

function rewriteFunctionRoleRef(
  template: CompiledCloudFormationTemplate,
  provider: AwsProvider,
  fnName: string,
  newRoleLogicalId: string,
  globalRoleLogicalId: string,
): void {
  const fnLogicalId = provider.naming.getLambdaLogicalId(fnName);
  const fnResource = template.Resources[fnLogicalId];
  if (!fnResource || !fnResource.Properties) {
    throw new Error(
      `CFN resource "${fnLogicalId}" missing or malformed for function "${fnName}".`,
    );
  }
  const props = fnResource.Properties as Record<string, unknown>;
  const role = props.Role as { 'Fn::GetAtt'?: unknown[] } | undefined;
  if (!role || !Array.isArray(role['Fn::GetAtt'])) {
    throw new Error(
      `Function "${fnName}" CFN resource has a Role property that isn't ` +
        `\`{ 'Fn::GetAtt': [...] }\`. The plugin only supports the framework's ` +
        `default Role shape. ` +
        `Common causes: ` +
        `(1) \`provider.role\` set to a literal ARN — remove \`iamRoleStatements\` ` +
        `from this function and set \`role: <arn>\` on the function instead. ` +
        `(2) \`customRole: true\` — same workaround. ` +
        `(3) An esbuild/webpack plugin that rewrites function resources before ours runs — ` +
        `re-order \`plugins:\` so this plugin is listed AFTER the rewriter.`,
    );
  }
  role['Fn::GetAtt'][0] = newRoleLogicalId;

  const dependsOn = fnResource.DependsOn;
  if (Array.isArray(dependsOn)) {
    fnResource.DependsOn = [
      newRoleLogicalId,
      ...dependsOn.filter((d) => d !== globalRoleLogicalId),
    ];
  } else if (
    typeof dependsOn === 'string' &&
    dependsOn === globalRoleLogicalId
  ) {
    fnResource.DependsOn = newRoleLogicalId;
  } else if (dependsOn === undefined) {
    fnResource.DependsOn = [newRoleLogicalId];
  } else {
    fnResource.DependsOn = [
      newRoleLogicalId,
      ...(Array.isArray(dependsOn) ? dependsOn : [dependsOn]),
    ];
  }
}

function rewriteEventSourceMappings(
  serverless: ServerlessInstance,
  provider: AwsProvider,
  functionToRoleMap: Map<string, string>,
): void {
  if (functionToRoleMap.size === 0) return;
  // Build an exact function-logical-id → role-logical-id map by asking the
  // framework's naming helper. No prefix heuristic — two functions whose
  // normalized names share a prefix (e.g. `fn` and `fnExtra`) would otherwise
  // both match the shorter prefix and a Map iteration race would assign the
  // wrong role's `DependsOn` to the EventSourceMapping.
  const logicalIdToRole = new Map<string, string>();
  for (const [fnName, roleLogicalId] of functionToRoleMap.entries()) {
    logicalIdToRole.set(
      provider.naming.getLambdaLogicalId(fnName),
      roleLogicalId,
    );
  }

  const template = serverless.service.provider.compiledCloudFormationTemplate;
  for (const resource of Object.values(template.Resources)) {
    if (resource.Type !== 'AWS::Lambda::EventSourceMapping') continue;
    const props = resource.Properties as
      | { FunctionName?: { 'Fn::GetAtt'?: unknown[] } }
      | undefined;
    const fnGetAtt = props?.FunctionName?.['Fn::GetAtt'];
    if (!Array.isArray(fnGetAtt) || typeof fnGetAtt[0] !== 'string') continue;
    const fnLogicalId = fnGetAtt[0];
    const roleLogicalId = logicalIdToRole.get(fnLogicalId);
    if (roleLogicalId) resource.DependsOn = roleLogicalId;
  }
}

function applyGlobalPermissionsBoundary(
  serverless: ServerlessInstance,
  settings: ResolvedSettings,
): void {
  const boundary = settings.global.iamGlobalPermissionsBoundary;
  if (!boundary) return;
  const globalRoleId = (
    serverless.providers.aws.naming as { getRoleLogicalId(): string }
  ).getRoleLogicalId();
  const template = serverless.service.provider.compiledCloudFormationTemplate;
  const globalRole = template.Resources[globalRoleId];
  if (globalRole && globalRole.Properties) {
    (globalRole.Properties as IamRoleProperties).PermissionsBoundary = boundary;
  }
}

function maybeSuppressGlobalRole(
  serverless: ServerlessInstance,
  settings: ResolvedSettings,
  fnsWithStatements: Set<string>,
): boolean {
  if (!settings.global.suppressGlobalRole) return false;
  const allFunctions = serverless.service.getAllFunctions();
  // Only safe to drop the global role if EVERY function has a per-function role.
  // Otherwise functions without iamRoleStatements would lose their role reference.
  if (allFunctions.length === 0) return false;
  if (allFunctions.some((name) => !fnsWithStatements.has(name))) return false;

  const template = serverless.service.provider.compiledCloudFormationTemplate;
  const globalRoleId = serverless.providers.aws.naming.getRoleLogicalId();
  delete template.Resources[globalRoleId];
  // Also strip Outputs that reference it, if any.
  if (template.Outputs) {
    for (const [outKey, out] of Object.entries(template.Outputs)) {
      const value = (
        out as { Value?: { 'Fn::GetAtt'?: unknown[] } } | undefined
      )?.Value;
      const getAtt = value?.['Fn::GetAtt'];
      if (Array.isArray(getAtt) && getAtt[0] === globalRoleId) {
        delete template.Outputs[outKey];
      }
    }
  }
  return true;
}

// Marker so TS doesn't complain about unused import in some build configs
void ANNOTATION_KEY;
