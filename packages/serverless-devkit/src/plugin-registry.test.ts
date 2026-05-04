/**
 * Type-level tests for {@link PluginConfigRegistry} module augmentation.
 *
 * The mechanism: a plugin declares `module '@interlace/serverless-devkit'`
 * to add a slot to {@link PluginConfigRegistry}; importing the plugin then
 * extends `defineConfig({ custom: { ... } })` with full IntelliSense.
 *
 * This file declares its own augmentation inline to keep devkit's tests
 * self-contained — exercising the augmentation pattern without taking a
 * dev-dependency on a real plugin (which would create a turbo build cycle).
 * Each `@interlace/*` plugin still has its own augmentation in source; the
 * inline `declare module` block here validates the *mechanism*.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineConfig } from './index.js';

interface TestPluginConfig {
  enabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  ttl?: number;
}

declare module './index.js' {
  interface PluginConfigRegistry {
    testPlugin?: TestPluginConfig;
  }
}

describe('PluginConfigRegistry — augmentation mechanism', () => {
  it('accepts a fully typed plugin config slot', () => {
    const config = defineConfig({
      service: 'augmentation-test',
      provider: { name: 'aws', runtime: 'nodejs20.x', region: 'us-east-1' },
      custom: {
        testPlugin: {
          enabled: true,
          size: 'medium',
          ttl: 300,
        },
      },
    });

    expect(config.custom).toBeDefined();
    expect(config.custom?.testPlugin).toMatchObject({
      enabled: true,
      size: 'medium',
    });
  });

  it("types `custom.testPlugin` as the plugin's own config interface", () => {
    type CustomShape = NonNullable<ReturnType<typeof defineConfig>['custom']>;

    expectTypeOf<CustomShape['testPlugin']>().toEqualTypeOf<
      TestPluginConfig | undefined
    >();
  });

  it('still accepts arbitrary `custom` keys as `unknown`', () => {
    const config = defineConfig({
      service: 'augmentation-test',
      provider: { name: 'aws', runtime: 'nodejs20.x', region: 'us-east-1' },
      custom: {
        // No augmentation for this key — should still be allowed (typed as unknown).
        someThirdPartyPlugin: { whatever: 'shape' },
      },
    });

    expect(config.custom?.someThirdPartyPlugin).toBeDefined();
  });

  it('rejects invalid values at the type level', () => {
    defineConfig({
      service: 'augmentation-test',
      provider: { name: 'aws', runtime: 'nodejs20.x', region: 'us-east-1' },
      custom: {
        testPlugin: {
          // @ts-expect-error — 'huge' is not in the literal union
          size: 'huge',
        },
      },
    });

    defineConfig({
      service: 'augmentation-test',
      provider: { name: 'aws', runtime: 'nodejs20.x', region: 'us-east-1' },
      custom: {
        testPlugin: {
          // @ts-expect-error — `enabled` must be boolean
          enabled: 'yes',
        },
      },
    });

    // The `@ts-expect-error` directives are the assertions; this just
    // satisfies vitest's "test must do something" requirement.
    expect(true).toBe(true);
  });
});
