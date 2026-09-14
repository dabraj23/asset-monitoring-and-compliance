import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { contractStore } from './contractStore.ts';
import { loadH2HSources, type H2HSource } from './h2hConfig.ts';
import { enqueueCsv, getCsvJobStatus, type Module } from './intakeRoutes.ts';

const authenticate = async (request: Request, response: Response): Promise<H2HSource | undefined> => {
  let sources: H2HSource[];
  try { sources = await loadH2HSources(); } catch { response.status(503).json({ error: 'Host-to-host source configuration unavailable.' }); return; }
  const source = sources.find(item => item.id === request.params.sourceId);
  if (!source?.tokenSha256) { response.status(404).json({ error: 'Source not configured.' }); return; }
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] || '';
  const digest = crypto.createHash('sha256').update(token).digest();
  const expected = Buffer.from(source.tokenSha256, 'hex');
  if (!token || expected.length !== digest.length || !crypto.timingSafeEqual(digest, expected)) { response.status(401).json({ error: 'Invalid source credential.' }); return; }
  return source;
};

export function registerH2HRoutes(app: Express) {
  app.post('/api/integrations/:sourceId/csv', async (request, response) => {
    const source = await authenticate(request, response); if (!source) return;
    const module = String(request.headers['x-module'] || request.body?.module || '') as Module;
    const entityId = String(request.headers['x-entity-id'] || request.body?.entityId || '');
    const batchId = String(request.headers['x-batch-id'] || request.body?.batchId || '').slice(0, 128);
    const csv = typeof request.body === 'string' ? request.body : String(request.body?.csv || '');
    if (!source.modules.includes(module)) return response.status(403).json({ error: 'Module is not permitted for this source.' });
    if (!batchId) return response.status(400).json({ error: 'X-Batch-Id is required for retry-safe intake.' });
    const registered = (await contractStore.entities()).some(item => item.id === entityId);
    const quarantine = !registered || !source.allowedEntityIds.includes(entityId);
    try { const result = await enqueueCsv({ entityId, module, csv, fileName: String(request.headers['x-file-name'] || request.body?.fileName || `${batchId}.csv`), mapping: source.mapping?.[module] || {}, source: 'HTTPS', sourceId: source.id, batchId, actor: `System: ${source.id}`, quarantine }); response.status(result.duplicate ? 200 : 202).json({ jobId: result.job.id, duplicate: result.duplicate, status: result.job.status, quarantined: quarantine }); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV payload.' }); }
  });
  app.get('/api/integrations/:sourceId/jobs/:jobId', async (request, response) => {
    const source = await authenticate(request, response); if (!source) return;
    const item = await getCsvJobStatus(request.params.jobId, source.id);
    if (!item) return response.status(404).json({ error: 'Batch not found.' });
    response.json(item);
  });
}
