import { describe, expect, it, vi } from 'vitest';
import { getProviderStatements } from './settings.js';
import type { ServerlessInstance, IamStatement } from './framework.js';

function makeServerless(
  v3?: IamStatement[],
  v2?: IamStatement[],
): { serverless: ServerlessInstance; logSpy: ReturnType<typeof vi.fn> } {
  const logSpy = vi.fn();
  const serverless = {
    service: {
      provider: {
        iam: v3 ? { role: { statements: v3 } } : undefined,
        iamRoleStatements: v2,
      },
    },
    cli: { log: logSpy },
  } as unknown as ServerlessInstance;
  return { serverless, logSpy };
}

const stmtA: IamStatement = {
  Effect: 'Allow',
  Action: ['s3:GetObject'],
  Resource: '*',
};
const stmtB: IamStatement = {
  Effect: 'Allow',
  Action: ['dynamodb:GetItem'],
  Resource: '*',
};

describe('getProviderStatements — v3 vs v2 form precedence', () => {
  it('returns the v3 form when only v3 is set', () => {
    const { serverless } = makeServerless([stmtA], undefined);
    expect(getProviderStatements(serverless)).toEqual([stmtA]);
  });

  it('returns the v2 form when only v2 is set', () => {
    const { serverless } = makeServerless(undefined, [stmtB]);
    expect(getProviderStatements(serverless)).toEqual([stmtB]);
  });

  it('returns an empty list when neither form is set', () => {
    const { serverless } = makeServerless(undefined, undefined);
    expect(getProviderStatements(serverless)).toEqual([]);
  });

  it('returns the v3 form and warns once when both are non-empty', () => {
    const { serverless, logSpy } = makeServerless([stmtA], [stmtB]);
    const result = getProviderStatements(serverless);
    expect(result).toEqual([stmtA]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(
      /Both provider\.iam\.role\.statements/,
    );
  });

  it('only warns once per serverless instance', () => {
    const { serverless, logSpy } = makeServerless([stmtA], [stmtB]);
    getProviderStatements(serverless);
    getProviderStatements(serverless);
    getProviderStatements(serverless);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('does not warn when only one form is non-empty', () => {
    // v3 set, v2 explicitly empty
    const { serverless: s1, logSpy: log1 } = makeServerless([stmtA], []);
    getProviderStatements(s1);
    expect(log1).not.toHaveBeenCalled();

    // v2 set, v3 explicitly empty
    const { serverless: s2, logSpy: log2 } = makeServerless([], [stmtB]);
    getProviderStatements(s2);
    expect(log2).not.toHaveBeenCalled();
  });
});
