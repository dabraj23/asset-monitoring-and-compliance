import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('a locally saved Gemini key remains available after server restart', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-monitor-ai-key-'));
  const priorDir = process.env.PLATFORM_DATA_DIR;
  const priorKey = process.env.GEMINI_API_KEY;
  process.env.PLATFORM_DATA_DIR = root;
  delete process.env.GEMINI_API_KEY;
  try {
    const { saveGeminiKey, loadGeminiKey, geminiKeySource } = await import('./aiKeyStore.ts');
    await saveGeminiKey('synthetic-testing-key-123456789');
    assert.equal(geminiKeySource(), 'LOCAL_FILE');
    delete process.env.GEMINI_API_KEY;
    await loadGeminiKey();
    assert.equal(process.env.GEMINI_API_KEY, 'synthetic-testing-key-123456789');
    assert.equal(geminiKeySource(), 'LOCAL_FILE');
  } finally {
    if (priorDir === undefined) delete process.env.PLATFORM_DATA_DIR; else process.env.PLATFORM_DATA_DIR = priorDir;
    if (priorKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = priorKey;
    await fs.rm(root, { recursive: true, force: true });
  }
});
