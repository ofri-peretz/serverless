/**
 * @interlace/serverless-iam-roles-per-function
 *
 * Per-function IAM roles for Serverless Framework v3 + v4. Drop-in replacement
 * for the community plugin `serverless-iam-roles-per-function@1.x` with:
 *
 * - Full TypeScript types + IntelliSense
 * - Zero runtime dependencies (community: 2 lodash subpackages)
 * - 4 CLI commands the community plugin lacks (preview / audit / validate / status)
 * - Auto-permissions for EventBridge + S3 event sources (community: only SQS / streams / DLQ)
 * - Strict statement validation (Effect enum, Action format, ARN format)
 * - Statement templates (share base policies across functions)
 * - Optional global-role suppression
 * - Optional `requirePerFunctionRoles` enforcement
 * - Backwards-compatible config: reads `custom.serverless-iam-roles-per-function`
 *   too, so swapping the plugin in serverless.yml is the only required change
 *
 * Migration guide: `docs/MIGRATION.md`
 *
 * @example
 * ```yaml
 * # serverless.yml
 * plugins:
 *   - '@interlace/serverless-iam-roles-per-function'
 *
 * custom:
 *   interlaceIamRolesPerFunction:
 *     defaultInherit: false
 *     suppressGlobalRole: true
 *     requirePerFunctionRoles: true
 *     statementTemplates:
 *       data-read:
 *         - Effect: Allow
 *           Action: ['dynamodb:GetItem', 'dynamodb:Query']
 *           Resource: '*'
 *
 * functions:
 *   listUsers:
 *     handler: src/handler.list
 *     iamRoleStatementsTemplate: data-read
 *     iamRoleStatements:
 *       - Effect: Allow
 *         Action: ['s3:GetObject']
 *         Resource: 'arn:aws:s3:::my-bucket/*'
 * ```
 */

import type {
  ServerlessCommands,
  ServerlessHooks,
  ServerlessInstance,
  ServerlessOptions,
  ServerlessPlugin,
} from './framework.js';
import { applyPerFunctionRoles } from './role-builder.js';
import { runPreview } from './commands/preview.js';
import { runAudit } from './commands/audit.js';
import { runValidate } from './commands/validate.js';
import { resolveSettings } from './settings.js';

const PLUGIN_NAME = '@interlace/serverless-iam-roles-per-function';
const PROVIDER_AWS = 'aws';

class InterlaceIamRolesPlugin implements ServerlessPlugin {
  public hooks: ServerlessHooks;
  public commands: ServerlessCommands;

  private serverless: ServerlessInstance;
  private options: ServerlessOptions;

  constructor(serverless: ServerlessInstance, options: ServerlessOptions = {}) {
    this.serverless = serverless;
    this.options = options;

    if (this.serverless.service.provider.name !== PROVIDER_AWS) {
      const ErrorClass = this.serverless.classes?.Error ?? Error;
      throw new ErrorClass(`${PLUGIN_NAME} only supports the AWS provider.`);
    }

    this.defineValidationSchema();

    this.commands = {
      iam: {
        usage: 'Per-function IAM role tooling',
        commands: {
          preview: {
            usage:
              'Dry-run: show the per-function roles that WOULD be created on deploy',
            lifecycleEvents: ['preview'],
          },
          audit: {
            usage:
              'Audit: list functions falling back to the broad global role',
            lifecycleEvents: ['audit'],
            options: {
              strict: {
                usage:
                  'Exit non-zero when any function lacks iamRoleStatements',
                type: 'boolean',
              },
            },
          },
          validate: {
            usage: "Strict validation of every function's iamRoleStatements",
            lifecycleEvents: ['validate'],
            options: {
              'strict-wildcard-action': {
                usage: 'Treat wildcard "*" Action as an error (not warning)',
                type: 'boolean',
              },
              'strict-wildcard-resource': {
                usage: 'Treat wildcard "*" Resource as an error (not warning)',
                type: 'boolean',
              },
              'warnings-as-errors': {
                usage: 'Exit non-zero on warnings too',
                type: 'boolean',
              },
            },
          },
          status: {
            usage: 'Show summary: how many functions have per-function roles',
            lifecycleEvents: ['status'],
          },
        },
      },
    };

    this.hooks = {
      // Main lifecycle: install per-function roles into the CFN template
      'before:package:finalize': this.applyRoles.bind(this),

      // Custom commands
      'iam:preview:preview': this.runPreviewCommand.bind(this),
      'iam:audit:audit': this.runAuditCommand.bind(this),
      'iam:validate:validate': this.runValidateCommand.bind(this),
      'iam:status:status': this.runStatusCommand.bind(this),
    };
  }

  // ─── Lifecycle ───

  private applyRoles(): void {
    const settings = resolveSettings(this.serverless);
    const result = applyPerFunctionRoles({
      serverless: this.serverless,
      provider: this.serverless.providers.aws,
      settings,
    });
    this.log(
      `Generated ${result.functionToRoleMap.size} per-function role(s); ${result.skippedFunctions.length} function(s) use the global role${result.globalRoleSuppressed ? '; global role suppressed.' : '.'}`,
    );
  }

  // ─── Custom commands ───

  private runPreviewCommand(): void {
    const settings = resolveSettings(this.serverless);
    const { previewLines } = runPreview(this.serverless, settings);
    for (const line of previewLines) this.log(line);
  }

  private runAuditCommand(): void {
    const strict = this.optionAsBool('strict');
    const { findings, lines } = runAudit(this.serverless, { strict });
    for (const line of lines) this.log(line);
    if (strict && findings.some((f) => f.severity === 'error')) {
      const ErrorClass = this.serverless.classes?.Error ?? Error;
      throw new ErrorClass(
        `iam audit --strict: ${findings.length} function(s) without iamRoleStatements.`,
      );
    }
  }

  private runValidateCommand(): void {
    const opts = {
      strictWildcardAction: this.optionAsBool('strict-wildcard-action'),
      strictWildcardResource: this.optionAsBool('strict-wildcard-resource'),
      treatWarningsAsErrors: this.optionAsBool('warnings-as-errors'),
    };
    const { findings, lines } = runValidate(this.serverless, opts);
    for (const line of lines) this.log(line);
    const errors = findings.filter((f) => f.severity === 'error');
    const warnings = findings.filter((f) => f.severity === 'warning');
    const fail =
      errors.length > 0 || (opts.treatWarningsAsErrors && warnings.length > 0);
    if (fail) {
      const ErrorClass = this.serverless.classes?.Error ?? Error;
      throw new ErrorClass(
        `iam validate: ${errors.length} error(s), ${warnings.length} warning(s).`,
      );
    }
  }

  private runStatusCommand(): void {
    const all = this.serverless.service.getAllFunctions();
    const withRoles = all.filter(
      (n) => this.serverless.service.getFunction(n).iamRoleStatements,
    );
    this.log('--- IAM Roles Per Function — Status ---');
    this.log(`  Functions:                   ${all.length}`);
    this.log(`  With per-function role:      ${withRoles.length}`);
    this.log(`  Falling back to global role: ${all.length - withRoles.length}`);
    const settings = resolveSettings(this.serverless);
    this.log(
      `  defaultInherit:              ${settings.global.defaultInherit}`,
    );
    this.log(
      `  suppressGlobalRole:          ${settings.global.suppressGlobalRole}`,
    );
    this.log(
      `  requirePerFunctionRoles:     ${settings.global.requirePerFunctionRoles}`,
    );
  }

  // ─── Helpers ───

  private optionAsBool(name: string): boolean {
    const v = this.options[name];
    if (v === undefined || v === null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '';
    return Boolean(v);
  }

  private log(message: string): void {
    this.serverless.cli.log(`[interlace-iam] ${message}`);
  }

  // ─── Schema ───

  private defineValidationSchema(): void {
    const handler = this.serverless.configSchemaHandler;
    if (!handler?.defineCustomProperties) return;

    const customSchema = {
      type: 'object',
      properties: {
        // New canonical key
        interlaceIamRolesPerFunction: this.globalConfigSchema(),
        // Backwards-compat alias (community plugin's key) — accept silently
        'serverless-iam-roles-per-function': this.globalConfigSchema(),
      },
    };
    handler.defineCustomProperties(customSchema);

    // v3+ defineFunctionProperties (preferred)
    if (handler.defineFunctionProperties) {
      handler.defineFunctionProperties(PROVIDER_AWS, {
        properties: {
          iamRoleStatements: { $ref: '#/definitions/awsIamPolicyStatements' },
          iamRoleStatementsInherit: { type: 'boolean' },
          iamRoleStatementsName: { type: 'string' },
          iamPermissionsBoundary: { $ref: '#/definitions/awsArn' },
          iamManagedPolicies: {
            type: 'array',
            items: { type: 'string' },
          },
          iamRoleStatementsTemplate: { type: 'string' },
        },
      });
    }
  }

  private globalConfigSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        defaultInherit: { type: 'boolean' },
        iamGlobalPermissionsBoundary: { $ref: '#/definitions/awsArn' },
        suppressGlobalRole: { type: 'boolean' },
        requirePerFunctionRoles: { type: 'boolean' },
        consolidateIdenticalRoles: { type: 'boolean' },
        statementTemplates: {
          type: 'object',
          additionalProperties: {
            $ref: '#/definitions/awsIamPolicyStatements',
          },
        },
      },
      additionalProperties: false,
    };
  }
}

/**
 * Default export — Serverless Framework v3 + v4 plugin loader expects this.
 *
 * Both versions resolve via `createRequire().resolve()` → `dist/index.cjs`,
 * then `await import()` it. Node CJS↔ESM interop wraps `module.exports` as
 * `namespace.default`. The framework does `Plugin = Plugin.default || Plugin`.
 *
 * For that unwrap to land on the constructor, our CJS output must be
 * `module.exports = InterlaceIamRolesPlugin` — Vite's `output.exports: 'default'`
 * achieves that. Named imports (`import { InterlaceIamRolesPlugin } from ...`)
 * resolve via the static property attached below.
 */
export default InterlaceIamRolesPlugin;

// Runtime named-export shim — supports CJS consumers using
// `const { InterlaceIamRolesPlugin } = require('...')`.
(
  InterlaceIamRolesPlugin as unknown as {
    InterlaceIamRolesPlugin: typeof InterlaceIamRolesPlugin;
  }
).InterlaceIamRolesPlugin = InterlaceIamRolesPlugin;

/** Re-exported config types for `serverless.ts` users */
export type {
  InterlaceIamConfig,
  InterlaceFunctionIamConfig,
  ValidationFinding,
} from './types.js';
