import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform');
const file = path.join(root, 'gemini-key.json');
let source: 'LOCAL_FILE' | 'ENVIRONMENT' | 'NONE' = 'NONE';

export async function loadGeminiKey() {
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8')) as { apiKey?: string };
    if (saved.apiKey && saved.apiKey.length >= 20) {
      process.env.GEMINI_API_KEY = saved.apiKey;
      source = 'LOCAL_FILE';
      return;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
  source = process.env.GEMINI_API_KEY ? 'ENVIRONMENT' : 'NONE';
}

export async function saveGeminiKey(apiKey: string) {
  if (apiKey.trim().length < 20) throw new Error('Enter a Gemini API key of at least 20 characters.');
  await fs.mkdir(root, { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ apiKey: apiKey.trim() }), { mode: 0o600 });
  await fs.rename(temporary, file);
  await fs.chmod(file, 0o600);
  process.env.GEMINI_API_KEY = apiKey.trim();
  source = 'LOCAL_FILE';
}

export function geminiKeySource() { return source; }
