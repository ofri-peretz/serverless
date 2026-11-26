/**
 * Property tests for `buildPerFunctionRoleName`: generated service, stage, region and function
 * names try to produce a role name AWS refuses (over 64 characters) or one that loses the function.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AwsProvider, ServerlessInstance } from './framework.js';
import { buildPerFunctionRoleName } from './role-name.js';

const AWS_ROLE_NAME_LIMIT = 64;
const name = fc.stringMatching(/^[A-Za-z0-9]{1,40}$/);
const region = fc.constantFrom('us-east-1', 'eu-central-1', 'ap-southeast-2');

/** The name AWS would see: the join's parts, the region in place of its Ref. */
const rendered = (join: unknown, at: string): string => {
  const [separator, parts] = (join as { 'Fn::Join': [string, unknown[]] })[
    'Fn::Join'
  ];
  return parts
    .map((part) => (typeof part === 'string' ? part : at))
    .join(separator);
};

const setup = (service: string, stage: string, at: string) => {
  const template = [
    '-',
    [service, stage, { Ref: 'AWS::Region' }, 'lambdaRole'],
  ] as const;
  const serverless = {
    service: { service, provider: { region: at } },
  } as ServerlessInstance;
  const provider = {
    naming: { getRoleName: () => ({ 'Fn::Join': template }) },
  } as unknown as AwsProvider;
  return { template, serverless, provider };
};

describe('buildPerFunctionRoleName (properties)', () => {
  it('returns a name within the AWS limit that holds the function name, or refuses only when no name fits', () => {
    fc.assert(
      fc.property(
        name,
        name,
        region,
        name,
        (service, stage, at, functionName) => {
          const { serverless, provider } = setup(service, stage, at);
          const shortest = [service, stage, functionName, at].join('-');
          if (shortest.length > AWS_ROLE_NAME_LIMIT) {
            expect(() =>
              buildPerFunctionRoleName({ serverless, provider, functionName }),
            ).toThrow(/exceeds AWS's 64-char limit/);
            return;
          }
          const role = rendered(
            buildPerFunctionRoleName({ serverless, provider, functionName }),
            at,
          );
          expect(role.length).toBeLessThanOrEqual(AWS_ROLE_NAME_LIMIT);
          expect(role.startsWith(shortest)).toBe(true);
          const full = `${shortest}-lambdaRole`;
          expect(role).toBe(
            full.length <= AWS_ROLE_NAME_LIMIT ? full : shortest,
          );
        },
      ),
    );
  });

  it('never changes the framework template it reads', () => {
    fc.assert(
      fc.property(
        name,
        name,
        region,
        name,
        (service, stage, at, functionName) => {
          const { template, serverless, provider } = setup(service, stage, at);
          const before = JSON.stringify(template);
          try {
            buildPerFunctionRoleName({ serverless, provider, functionName });
          } catch {
            // A refusal is covered above; this property is only about the template.
          }
          expect(JSON.stringify(template)).toBe(before);
        },
      ),
    );
  });

  it('returns a custom name as given, whatever the template would build', () => {
    fc.assert(
      fc.property(
        fc.tuple(name, name, region),
        name,
        fc.string({ minLength: 1 }),
        ([service, stage, at], functionName, customName) => {
          const { serverless, provider } = setup(service, stage, at);
          expect(
            buildPerFunctionRoleName({
              serverless,
              provider,
              functionName,
              customName,
            }),
          ).toBe(customName);
        },
      ),
    );
  });
});
