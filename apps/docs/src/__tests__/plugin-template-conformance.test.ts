import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { validatePluginTemplateConformance } from '#interlace/validators/plugin-template-conformance';

describe('plugin template conformance', () => {
  it('every plugin under content/docs/plugins/ ships the canonical page set', async () => {
    const findings = await validatePluginTemplateConformance({
      pluginsRoot: resolve(__dirname, '..', '..', 'content', 'docs', 'plugins'),
    });

    if (findings.length > 0) {
      console.error('Plugin template conformance issues:', findings);
    }
    expect(findings).toEqual([]);
  });
});
