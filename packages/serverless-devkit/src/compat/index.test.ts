import { describe, it, expect } from 'vitest';
import { cachingConfig, domainManagerConfig, pruneConfig } from './index.js';

describe('cachingConfig', () => {
  it('wraps config under interlaceCaching key', () => {
    const result = cachingConfig({
      enabled: true,
      clusterSize: '0.5',
      ttlInSeconds: 300,
      dataEncrypted: true,
      flushOnDeploy: true,
      perKeyInvalidation: {
        requireAuthorization: true,
        handleUnauthorizedRequests: 'Ignore',
      },
    });

    expect(result).toHaveProperty('interlaceCaching');
    expect(result.interlaceCaching.enabled).toBe(true);
    expect(result.interlaceCaching.clusterSize).toBe('0.5');
    expect(result.interlaceCaching.flushOnDeploy).toBe(true);
  });

  it('works with minimal config', () => {
    const result = cachingConfig({ enabled: false });
    expect(result.interlaceCaching.enabled).toBe(false);
  });
});

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
