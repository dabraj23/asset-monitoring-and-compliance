import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contractStore } from './contractStore.ts';
import { loadH2HSources, type H2HSource } from './h2hConfig.ts';
import { enqueueCsv, getCsvJobStatus } from './intakeRoutes.ts';

const remotePath = (value: string) => { if (!/^\/?[A-Za-z0-9_./-]+$/.test(value) || value.includes('..')) throw new Error('Unsafe SFTP remote path.'); return value.replace(/\/$/, ''); };
const safeFile = (value: string) => /^[A-Za-z0-9_.-]+\.csv$/i.test(value) && !value.includes('..');
const received = new Set<string>();
const acknowledged = new Set<string>();
const lastRun = new Map<string, number>();

async function runSftp(source: H2HSource, command: string): Promise<string> {
  const config = source.sftp!;
  if (!/^[A-Za-z0-9.-]+$/.test(config.host) || !/^[A-Za-z0-9_.-]+$/.test(config.username)) throw new Error('Unsafe SFTP host or username.');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-monitor-sftp-'));
  const batch = path.join(temporary, 'batch.txt');
  await fs.writeFile(batch, `${command}\n`, { mode: 0o600 });
  try {
    const args = ['-q', '-b', batch, '-i', path.resolve(config.keyFile), '-oBatchMode=yes', '-oStrictHostKeyChecking=yes', `-oUserKnownHostsFile=${path.resolve(config.knownHostsFile)}`, '-P', String(config.port || 22), `${config.username}@${config.host}`];
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('sftp', args, { shell: false, windowsHide: true }); let stdout = ''; let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('SFTP command timed out.')); }, 60000);
      child.stdout.on('data', chunk => { stdout += String(chunk); if (stdout.length > 1024 * 1024) child.kill(); });
      child.stderr.on('data', chunk => { stderr += String(chunk); if (stderr.length > 1024 * 1024) child.kill(); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`SFTP exited ${code}: ${stderr.slice(0, 200)}`)); });
    });
  } finally { if (temporary.startsWith(os.tmpdir())) await fs.rm(temporary, { recursive: true, force: true }); }
}

async function pollSource(source: H2HSource) {
  const config = source.sftp!;
  if (!source.modules.includes(config.module)) throw new Error('SFTP module is not permitted for this source.');
  const directory = remotePath(config.remoteDirectory);
  const listing = await runSftp(source, `ls -1 "${directory}"`);
  const names = listing.split(/\r?\n/).map(line => path.posix.basename(line.trim())).filter(safeFile).slice(0, 100);
  for (const name of names) {
    const key = `${source.id}:${name}`;
    if (received.has(key) && acknowledged.has(key)) continue;
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-monitor-inbox-'));
    try {
      const localFile = path.join(temporary, name);
      await runSftp(source, `get "${directory}/${name}" "${localFile.replaceAll('\\', '/')}"`);
      const csv = await fs.readFile(localFile, 'utf8');
      const registered = (await contractStore.entities()).some(item => item.id === config.entityId);
      const result = await enqueueCsv({ entityId: config.entityId, module: config.module, csv, fileName: name, mapping: source.mapping?.[config.module] || {}, source: 'SFTP', sourceId: source.id, batchId: name, actor: `System: ${source.id}`, quarantine: !registered || !source.allowedEntityIds.includes(config.entityId) });
      received.add(key);
      const status = await getCsvJobStatus(result.job.id, source.id);
      if (status && ['COMPLETED', 'PARTIAL', 'FAILED'].includes(status.status) && !config.ackDirectory) acknowledged.add(key);
      if (status && ['COMPLETED', 'PARTIAL', 'FAILED'].includes(status.status) && config.ackDirectory && !acknowledged.has(key)) {
        const ackName = `${name}.${crypto.createHash('sha256').update(source.id).digest('hex').slice(0, 8)}.ack.json`;
        const localAck = path.join(temporary, ackName);
        await fs.writeFile(localAck, JSON.stringify(status, null, 2), { mode: 0o600 });
        await runSftp(source, `put "${localAck.replaceAll('\\', '/')}" "${remotePath(config.ackDirectory)}/${ackName}"`);
        acknowledged.add(key);
      }
    } finally { if (temporary.startsWith(os.tmpdir())) await fs.rm(temporary, { recursive: true, force: true }); }
  }
}

export function startSftpIntegration() {
  if (!process.env.H2H_SOURCES_FILE) return;
  const poll = async () => {
    let sources: H2HSource[]; try { sources = await loadH2HSources(); } catch (error) { console.error('SFTP configuration unavailable:', error); return; }
    for (const source of sources.filter(item => item.sftp)) {
      const interval = Math.max(60000, source.sftp?.pollIntervalMs || 60000);
      if (Date.now() - (lastRun.get(source.id) || 0) < interval) continue;
      lastRun.set(source.id, Date.now());
      try { await pollSource(source); } catch (error) { console.error(`SFTP source ${source.id} poll failed:`, error); }
    }
  };
  void poll(); setInterval(() => { void poll(); }, 60000).unref();
}
