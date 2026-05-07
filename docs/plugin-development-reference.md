# Serverless Framework Plugin Development Reference

> Comprehensive guide for developing Serverless Framework plugins in TypeScript.
> This is the authoritative reference for all `@interlace/serverless-plugin-*` packages in this monorepo.

## 1. Plugin Architecture

A Serverless Framework plugin is a **class** that the framework instantiates during initialization. The plugin system follows a hook-based architecture where plugins subscribe to lifecycle events.

### Core Concepts

```text
┌─────────────────────────────────────────────────────────┐
│                  Serverless Framework                     │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  CLI      │───▶│ PluginManager│───▶│ Plugin Class   │  │
│  │  Command  │    │              │    │ - constructor  │  │
│  │           │    │ Lifecycle    │    │ - hooks        │  │
│  │  deploy   │    │ Events       │    │ - commands     │  │
│  │  package  │    │              │    │ - schema       │  │
│  │  invoke   │    │ before:*     │    │                │  │
│  │  ...      │    │ *            │    │ configSchema   │  │
│  │           │    │ after:*      │    │ Handler        │  │
│  └──────────┘    └──────────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Constructor Signature

```typescript
import type Serverless from 'serverless';

class MyPlugin {
  serverless: Serverless;
  options: Serverless.Options;
  hooks: Record<string, () => void | Promise<void>>;
  commands?: Record<string, unknown>;

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.serverless = serverless;
    this.options = options;

    // Define hooks — map lifecycle events to methods
    this.hooks = {
      'before:deploy:deploy': this.beforeDeploy.bind(this),
      'after:package:compileFunctions': this.afterCompile.bind(this),
    };
  }

  async beforeDeploy(): Promise<void> {
    // Access RESOLVED configuration here (not in constructor!)
    const service = this.serverless.service;
    // ...
  }
}

module.exports = MyPlugin;
```

> **Critical**: Configuration values (`${ssm:...}`, `${param:...}`, `${file:...}`) are **not** resolved in the constructor. Always access `this.serverless.service` inside hook methods.

---

## 2. Lifecycle Events Reference

### Package Lifecycle

Triggered by `serverless package` (and as part of `deploy`):

| Event                                | Hook Format                                 | Description                                    |
| ------------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| `package:cleanup`                    | `before:package:cleanup`                    | Clean previous artifacts                       |
| `package:initialize`                 | `before:package:initialize`                 | Initialize packaging                           |
| `package:setupProviderConfiguration` | `before:package:setupProviderConfiguration` | Provider-specific setup                        |
| `package:createDeploymentArtifacts`  | `before:package:createDeploymentArtifacts`  | Create zip artifacts                           |
| `package:compileFunctions`           | `after:package:compileFunctions`            | Compile function definitions to CloudFormation |
| `package:compileEvents`              | `after:package:compileEvents`               | Compile event sources to CloudFormation        |
| `package:finalize`                   | `after:package:finalize`                    | Finalize packaging                             |

### Deploy Lifecycle

Triggered by `serverless deploy`:

| Event             | Hook Format             | Description               |
| ----------------- | ----------------------- | ------------------------- |
| `deploy:deploy`   | `before:deploy:deploy`  | Main deployment execution |
| `deploy:finalize` | `after:deploy:finalize` | Post-deployment cleanup   |

### AWS-Specific Events

| Event                               | Description                 |
| ----------------------------------- | --------------------------- |
| `aws:deploy:deploy:createStack`     | Create CloudFormation stack |
| `aws:deploy:deploy:uploadArtifacts` | Upload to S3                |
| `aws:deploy:deploy:updateStack`     | Update CloudFormation       |

### Other Commands

| Command  | Key Events      |
| -------- | --------------- |
| `invoke` | `invoke:invoke` |
| `remove` | `remove:remove` |
| `info`   | `info:info`     |
| `logs`   | `logs:logs`     |

---

## 3. Custom Commands

Plugins can define new CLI commands:

```typescript
constructor(serverless: Serverless, options: Serverless.Options) {
  this.commands = {
    'my-command': {
      usage: 'Description of my command',
      lifecycleEvents: ['init', 'run', 'cleanup'],
      options: {
        target: {
          usage: 'Specify target (e.g. --target production)',
          required: false,
          type: 'string',
        },
      },
    },
  };

  this.hooks = {
    'my-command:init': this.init.bind(this),
    'my-command:run': this.run.bind(this),
    'my-command:cleanup': this.cleanup.bind(this),
  };
}
```

---

## 4. Configuration Schema Extension

Plugins can extend `serverless.yml` validation:

```typescript
constructor(serverless: Serverless, options: Serverless.Options) {
  // Add custom top-level properties
  serverless.configSchemaHandler.defineTopLevelProperty('myPlugin', {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      targets: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  });

  // Add custom function-level properties
  serverless.configSchemaHandler.defineFunctionProperties('aws', {
    properties: {
      myPluginConfig: { type: 'object' },
    },
  });

  // Add custom event types
  serverless.configSchemaHandler.defineFunctionEvent('aws', 'myEvent', {
    type: 'object',
    properties: {
      topic: { type: 'string' },
    },
    required: ['topic'],
  });
}
```

---

## 5. CLI Output (v3+)

The legacy `this.serverless.cli.log()` is deprecated. Use the logging utilities:

```typescript
// In v3+, use console or the progress API
constructor(serverless: Serverless, options: Serverless.Options, { log, progress, writeText }: any) {
  this.log = log;
  this.progress = progress;

  this.hooks = {
    'before:deploy:deploy': async () => {
      // Simple logging
      log.notice('Starting deployment...');
      log.warning('This is a warning');
      log.error('This is an error');

      // Progress indicator
      const p = progress.create({ message: 'Deploying...' });
      // ... do work ...
      p.update('Almost done...');
      p.remove();

      // Verbose output (only shown with --verbose)
      log.verbose('Debug details here');
    },
  };
}
```

---

## 6. Type Definitions

### Key Interfaces from `@types/serverless`

```typescript
// Core Serverless instance
declare class Serverless {
  init(): Promise<any>;
  run(): Promise<any>;
  setProvider(name: string, provider: AwsProvider): null;
  getProvider(name: string): AwsProvider;
  getVersion(): string;
  service: Service;
  config: { servicePath: string; serviceDir: string };
  pluginManager: PluginManager;
  configSchemaHandler: {
    defineCustomProperties(schema: unknown): void;
    defineFunctionEvent(
      provider: string,
      event: string,
      schema: Record<string, unknown>,
    ): void;
    defineFunctionEventProperties(
      provider: string,
      existingEvent: string,
      schema: unknown,
    ): void;
    defineFunctionProperties(provider: string, schema: unknown): void;
    defineProvider(provider: string, options?: Record<string, unknown>): void;
    defineTopLevelProperty(
      provider: string,
      schema: Record<string, unknown>,
    ): void;
  };
}

// CLI Options
interface Options {
  function?: string;
  watch?: boolean;
  verbose?: boolean;
  stage?: string;
  region?: string;
  [key: string]: string | boolean | string[] | undefined;
}

// Function definition
interface FunctionDefinition {
  name?: string;
  handler: string;
  runtime?: string;
  timeout?: number;
  memorySize?: number;
  environment?: { [name: string]: string };
  events: Event[];
  tags?: { [key: string]: string };
}

// Package configuration
interface Package {
  /** @deprecated use `patterns` instead */
  include?: string[];
  /** @deprecated use `patterns` instead */
  exclude?: string[];
  patterns?: string[];
  artifact?: string;
  individually?: boolean;
}
```

### Plugin Manager

```typescript
class PluginManager {
  addPlugin(plugin: any): void;
  loadAllPlugins(servicePlugins: any[]): void;
  spawn(commandsArray: string | string[], options?: any): Promise<void>;
  // Spawn allows programmatic invocation of other lifecycle events
}
```

---

## 7. v4-Specific Considerations

### License Requirement

Serverless Framework v4 requires authentication for certain operations. Ensure your CI and development environments are configured.

### Native Build (`build` property)

v4 includes native esbuild support. If your plugin modifies the build pipeline, check for conflicts with the native `build` configuration:

```yaml
# serverless.yml
build:
  esbuild:
    bundle: true
    minify: true
```

Set `build: false` in `serverless.yml` if using legacy bundler plugins to avoid conflicts.

### Stages and Parameters

v4 formalizes stage-specific configuration:

```yaml
stages:
  production:
    params:
      tableName: users-prod
    resolvers:
      vault:
        address: https://vault.example.com
```

---

## 8. Testing Patterns

### Unit Testing with Vitest

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyPlugin from './index';

describe('MyPlugin', () => {
  let serverless: any;
  let options: any;

  beforeEach(() => {
    serverless = {
      service: {
        service: 'test-service',
        provider: { stage: 'development' },
        functions: {},
        custom: {},
      },
      cli: { log: vi.fn() },
      configSchemaHandler: {
        defineTopLevelProperty: vi.fn(),
        defineFunctionProperties: vi.fn(),
        defineFunctionEvent: vi.fn(),
      },
      getProvider: vi.fn(),
    };
    options = { stage: 'development' };
  });

  it('should register hooks', () => {
    const plugin = new MyPlugin(serverless, options);
    expect(plugin.hooks).toBeDefined();
    expect(plugin.hooks['before:deploy:deploy']).toBeInstanceOf(Function);
  });

  it('should execute hook logic', async () => {
    const plugin = new MyPlugin(serverless, options);
    await plugin.hooks['before:deploy:deploy']();
    // Assert side effects
  });
});
```

### Integration Testing

Use the `example/` pattern — a minimal Serverless service that uses your local plugin:

```yaml
# example/serverless.yml
service: my-plugin-test
plugins:
  - '../' # Reference parent plugin
provider:
  name: aws
  runtime: nodejs20.x
functions:
  hello:
    handler: handler.hello
```

---

## 9. Publishing Checklist

- [ ] `main` field points to compiled output (`dist/index.js` or `src/index.js`)
- [ ] `types` field points to declaration file
- [ ] `files` array restricts published content
- [ ] `peerDependencies` declares `serverless` version compatibility
- [ ] `engines.node` specifies minimum Node.js version
- [ ] `prepublishOnly` runs `tsc` build
- [ ] README includes installation, configuration, and example usage
- [ ] CHANGELOG documents version history

---

## 10. Official Resources

| Resource                | URL                                                                           |
| ----------------------- | ----------------------------------------------------------------------------- |
| Plugin authoring guide  | https://www.serverless.com/framework/docs/guides/plugins/creating-plugins     |
| Plugin installation     | https://www.serverless.com/framework/docs/guides/plugins                      |
| CLI output guide (v3+)  | https://www.serverless.com/framework/docs/guides/plugins/cli-output           |
| Custom configuration    | https://www.serverless.com/framework/docs/guides/plugins/custom-configuration |
| Plugin directory (360+) | https://www.serverless.com/plugins                                            |
| `@types/serverless`     | https://www.npmjs.com/package/@types/serverless                               |
| Framework source        | https://github.com/serverless/serverless                                      |
| Community Slack         | https://www.serverless.com/slack                                              |
