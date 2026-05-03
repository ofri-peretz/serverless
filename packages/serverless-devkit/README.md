# @interlace/serverless-devkit

> TypeScript-first configuration toolkit for Serverless Framework.

Provides `defineConfig()`, `defineFunction()`, typed helpers, and plugin development interfaces — zero dependencies, full IntelliSense.

## Install

```bash
npm install @interlace/serverless-devkit
```

## Quick Start

```typescript
// serverless.ts
import { defineConfig, defineFunction } from '@interlace/serverless-devkit';

export default defineConfig({
  service: 'my-api',
  provider: {
    name: 'aws',
    runtime: 'nodejs20.x',
    region: 'us-east-1',
    memorySize: 512,
  },
  functions: {
    getUser: defineFunction({
      handler: 'src/handlers/getUser.handler',
      events: [{ http: { path: '/users/{id}', method: 'get' } }],
    }),
  },
});
```

## API

### `defineConfig(config)`

Returns a typed Serverless configuration object with full IntelliSense for all AWS provider settings.

### `defineFunction(config)`

Type-safe function definition with event, IAM, and build configuration support.

### `defineFunctions(map)`

Batch-define multiple functions with shared type safety:

```typescript
import { defineFunctions } from '@interlace/serverless-devkit';

const functions = defineFunctions({
  createUser: {
    handler: 'src/handlers/createUser.handler',
    events: [{ http: { path: '/users', method: 'post' } }],
  },
  deleteUser: {
    handler: 'src/handlers/deleteUser.handler',
    events: [{ http: { path: '/users/{id}', method: 'delete' } }],
  },
});
```

## Compatibility Helpers

Typed shims for legacy community plugins — useful while migrating to `@interlace` native plugins. Each helper returns a `custom.*` fragment ready to spread into `defineConfig`:

```typescript
import { defineConfig } from '@interlace/serverless-devkit';
import {
  cachingConfig,
  domainManagerConfig,
  pruneConfig,
} from '@interlace/serverless-devkit/compat';

export default defineConfig({
  custom: {
    // Typed config for @interlace/serverless-api-gateway-caching
    // (also a drop-in upgrade from serverless-api-gateway-caching)
    ...cachingConfig({
      enabled: true,
      clusterSize: '0.5',
      ttlInSeconds: 300,
    }),

    // Typed config for serverless-domain-manager
    ...domainManagerConfig({
      domainName: 'api.example.com',
      basePath: '',
    }),

    // Typed config for serverless-prune-plugin
    ...pruneConfig({
      automatic: true,
      number: 3,
    }),
  },
});
```

## Plugin Development

Export types for building Serverless Framework plugins:

```typescript
import type {
  ServerlessInstance,
  ServerlessOptions,
  ServerlessPlugin,
  ServerlessHooks,
  ServerlessCommands,
  AwsProvider,
} from '@interlace/serverless-devkit';

class MyPlugin implements ServerlessPlugin {
  hooks: ServerlessHooks;
  commands: ServerlessCommands;

  constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
    this.hooks = {
      'after:deploy:deploy': this.afterDeploy.bind(this),
    };
    this.commands = {};
  }

  private async afterDeploy(): Promise<void> {
    // plugin logic
  }
}

export default MyPlugin;
```

## License

MIT
