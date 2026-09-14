import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Module } from './intakeRoutes.ts';

export interface H2HSource {
  id: string;
  tokenSha256?: string;
  modules: Module[];
  allowedEntityIds: string[];
  mapping?: Partial<Record<Module, Record<string, string>>>;
  sftp?: { host: string; port?: number; username: string; keyFile: string; knownHostsFile: string; remoteDirectory: string; ackDirectory?: string; entityId: string; module: Module; pollIntervalMs?: number };
}
export async function loadH2HSources(): Promise<H2HSource[]> {
  if (!process.env.H2H_SOURCES_FILE) return [];
  const file = path.resolve(process.env.H2H_SOURCES_FILE);
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(parsed.sources)) throw new Error('H2H sources file needs a sources array.');
  return parsed.sources.filter((item: H2HSource) => /^[a-z0-9_-]{2,64}$/.test(item.id) && Array.isArray(item.modules) && Array.isArray(item.allowedEntityIds));
}
