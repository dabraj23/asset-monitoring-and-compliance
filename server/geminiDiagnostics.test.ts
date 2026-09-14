import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyGeminiTestError } from './geminiDiagnostics.ts';

test('provider HTTP 429 is not misreported as a network or key failure', () => {
  const result = classifyGeminiTestError({ status: 429, message: 'Too Many Requests' }, 'gemini-2.5-flash');
  assert.equal(result.providerStatus, 429);
  assert.match(result.message, /quota or rate limit/);
  assert.doesNotMatch(result.message, /could not reach|rejected this key/);
});

test('connection, permission and model failures retain distinct safe messages', () => {
  assert.match(classifyGeminiTestError(new TypeError('fetch failed'), 'gemini-2.5-flash').message, /could not reach/);
  assert.match(classifyGeminiTestError({ status: 403, message: 'Forbidden' }, 'gemini-2.5-flash').message, /rejected this key/);
  assert.match(classifyGeminiTestError({ status: 404, message: 'Not found' }, 'gemini-2.5-flash').message, /model gemini-2.5-flash/);
});
