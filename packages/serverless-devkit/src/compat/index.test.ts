import { describe, it, expect } from 'vitest';
import { domainManagerConfig, pruneConfig } from './index.js';

// Note: `cachingConfig` was removed in v1.0.0 — the caching plugin now
// ships types directly via `PluginConfigRegistry` module augmentation
// (see `apps/docs/content/docs/serverless-devkit/extending-types.mdx`).
// Compat helpers are reserved for community plugins without their own
// types; first-party Interlace plugins should always use augmentation.

describe('domainManagerConfig', () => {
  it('wraps config under customDomain key', () => {
    const result = domainManagerConfig({
      domainName: 'api.example.com',
      basePath: 'v1',
      certificateName: '*.example.com',
      createRoute53Record: true,
      endpointType: 'REGIONAL',
      securityPolicy: 'TLS_1_2',
      autoDomain: true,
    });

    expect(result).toHaveProperty('customDomain');
    expect(result.customDomain.domainName).toBe('api.example.com');
    expect(result.customDomain.securityPolicy).toBe('TLS_1_2');
  });
});

describe('pruneConfig', () => {
  it('wraps config under prune key', () => {
    const result = pruneConfig({
      automatic: true,
      number: 3,
      includeLayers: true,
    });

    expect(result).toHaveProperty('prune');
    expect(result.prune.automatic).toBe(true);
    expect(result.prune.number).toBe(3);
  });
});
