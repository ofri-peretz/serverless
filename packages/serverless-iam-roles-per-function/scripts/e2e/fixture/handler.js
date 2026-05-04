'use strict';

/**
 * Minimal Lambda handler for the IAM plugin E2E.
 * Just echoes back the event + a generation timestamp so the orchestrator
 * can prove the function ran under its per-function role.
 */
exports.echo = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      generatedAt: Date.now(),
      eventKeys: Object.keys(event ?? {}).sort(),
      pid: process.pid,
    }),
  };
};
