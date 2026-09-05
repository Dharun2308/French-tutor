/** Local HTTP stall only; no real API call. Verifies provider timeout and no hidden SDK retries. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { runStructured, AllProvidersFailed } from '../src/lib/ai/providers';
async function main() {
  assert.ok(process.env.TURSO_DATABASE_URL?.startsWith('file:/tmp/'));
  let requests = 0;
  const server = createServer(() => { requests++; });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  process.env.OPENAI_API_KEY = 'local-test-only';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  try {
    const began = Date.now();
    await assert.rejects(runStructured({ purpose: 'curriculum', system: 'test', user: 'test', schemaName: 'test', jsonSchema: { type: 'object', properties: {}, additionalProperties: false }, timeoutMs: 200 }, z.object({}), { codex: false, claude: false, openai: true }), AllProvidersFailed);
    assert.ok(Date.now() - began < 3000, 'Stalled API must release promptly');
    assert.equal(requests, 1, 'SDK must not silently retry a timed-out curriculum request');
    console.log('API timeout verified against a stalled local server; one request, no SDK retries.');
  } finally { server.closeAllConnections(); server.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
