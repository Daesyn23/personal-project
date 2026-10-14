import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Exercise the real route and Supabase client against an in-memory HTTP transport.
// No production credentials or database are used.
const root = new URL('../../../', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(fileURLToPath(new URL(specifier.slice(2) + '.ts', root)), context);
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
const { NextRequest } = await import('next/server.js');
const { GET, POST } = await import('./route.ts');
const { emptyProgress, recordRound } = await import('../../../lib/games/kanji-progress.ts');

const request = (path = '', body) => new NextRequest('https://workspace.test/api/kanji-progress' + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const event = { id: 'phone-round', playedAt: '2026-10-15T01:00:00.000Z', progress: recordRound(emptyProgress(), { id: 'phone-round', lesson: 0, mode: 'kanji', completed: true, answers: [{ card: { id: '0-0' }, correct: true, hinted: false }] }) };

test('automatic shared progress API: no auth, fixed scope, retries, validation, pagination and failures', async () => {
  const previousFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const rows = new Map(); let fail = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://mock.supabase.co');
    assert.equal(url.pathname, '/rest/v1/workspace_kanji_progress_events');
    if (fail) return new Response(JSON.stringify({ message: 'temporary failure' }), { status: 503 });
    if (init.method === 'POST') {
      assert.equal(new Headers(init.headers).get('prefer').includes('resolution=ignore-duplicates'), true);
      for (const row of JSON.parse(init.body)) {
        assert.equal(row.user_id, '527d5b6c-18fb-4a69-a19a-305ba7d65872');
        if (!rows.has(row.id)) rows.set(row.id, row);
      }
      return new Response(null, { status: 201 });
    }
    assert.equal(url.searchParams.get('user_id'), 'eq.527d5b6c-18fb-4a69-a19a-305ba7d65872');
    const data = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
    const offset = Number(url.searchParams.get('offset') || 0);
    return new Response(init.method === 'HEAD' ? null : JSON.stringify(data.slice(offset, offset + 500)), { headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.size - 1)}/${rows.size}` } });
  };
  try {
    assert.equal((await POST(request('', [event]))).status, 200);
    assert.equal((await POST(request('', [event]))).status, 200);
    assert.equal(rows.size, 1, 'lost response retries do not duplicate progress');
    const loaded = await GET(request('?user_id=someone-else'));
    assert.equal(loaded.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await loaded.json()).events, [event]);
    assert.deepEqual(await (await GET(request('?count=1'))).json(), { count: 1, events: [] });
    assert.deepEqual((await (await GET(request('?offset=500'))).json()).events, []);
    assert.equal((await GET(request('?offset=-1'))).status, 400);
    assert.equal((await POST(request('', [{ ...event, progress: {} }]))).status, 400);
    assert.equal((await POST(request('', Array(101).fill(event)))).status, 400);
    assert.equal((await POST(request('', ['x'.repeat(1_048_577)]))).status, 413);
    assert.equal(rows.size, 1);
    fail = true;
    assert.equal((await GET(request())).status, 502);
    assert.equal((await POST(request('', [event]))).status, 502);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
