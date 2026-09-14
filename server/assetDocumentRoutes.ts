import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { Express } from 'express';
import type { Asset, AssetCategory, Driver } from '../src/types.ts';
import { assetStore } from './assetStore.ts';
import { canReadEntity, canWriteEntity, currentUser } from './platformAuth.ts';
import { workflowStore } from './workflowStore.ts';
import { extractOfficeText } from './officeText.ts';
import { assetActionKinds, validateAssetAction } from './assetActions.ts';

type Kind = 'ASSET' | 'DRIVER' | 'MAINTENANCE' | 'CLAIM' | 'ROAD_TAX' | 'INSURANCE' | 'INSPECTION' | 'ASSET_ACTION' | 'CONFIGURED_DOCUMENT';
type Stage = 'QUEUED' | 'EXTRACTING' | 'READY_FOR_REVIEW' | 'REVIEW_REQUIRED' | 'APPLIED' | 'FAILED';
interface Job { id: string; entityId: string; fileName: string; mimeType: string; sha256: string; size: number; stage: Stage; progress: number; message: string; recordType?: Kind; recordId?: string; proposedFields: Record<string, string>; confidence: number; sourceReference: string; workflowVersion: number; createdAt: string; updatedAt: string; actor: string; appliedAt?: string }
const root = path.join(process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform'), 'asset-documents');
const index = path.join(root, 'jobs.json');
const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain']);
let cache: Job[] | null = null; let queue: Promise<unknown> = Promise.resolve();
const accepting = new Set<string>();
const init = async () => { if (cache) return; await fs.mkdir(root, { recursive: true }); try { cache = JSON.parse(await fs.readFile(index, 'utf8')) as Job[]; } catch (error: any) { if (error?.code !== 'ENOENT') throw error; cache = []; } };
const mutate = async <T>(operation: (jobs: Job[]) => T): Promise<T> => { await init(); const pending = queue.then(async () => { const result = operation(cache!); const temp = `${index}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(cache, null, 2), { mode: 0o600 }); await fs.rename(temp, index); return structuredClone(result); }); queue = pending.catch(() => undefined); return pending; };
const find = async (id: string) => { await init(); return structuredClone(cache!.find(item => item.id === id)); };
const parseJson = (text: string) => { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const body = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1); return JSON.parse(body); };
const filePath = (id: string) => path.join(root, id);
const asText = async (data: Buffer, mimeType: string) => await extractOfficeText(data, mimeType) || '';
const matching = async (job: Job) => {
  const fields = job.proposedFields;
  if (job.recordType === 'DRIVER') { const drivers = (await assetStore.drivers()).filter(item => item.entityId === job.entityId && (fields.licenseNumber && item.licenseNumber.toLowerCase() === fields.licenseNumber.toLowerCase())); return drivers.length === 1 ? drivers[0].id : ''; }
  const assets = (await assetStore.assets()).filter(item => item.entityId === job.entityId && fields.registrationNumber && item.registrationNumber.toLowerCase() === fields.registrationNumber.toLowerCase());
  return assets.length === 1 ? assets[0].id : '';
};
const processDocumentJob = async (id: string) => {
  let job = await find(id); if (!job || ['APPLIED', 'FAILED'].includes(job.stage)) return;
  await mutate(jobs => { const item = jobs.find(value => value.id === id)!; item.stage = 'EXTRACTING'; item.progress = 20; item.updatedAt = new Date().toISOString(); });
  job = await find(id); if (!job) return;
  if (!process.env.GEMINI_API_KEY) { await mutate(jobs => { const item = jobs.find(value => value.id === id)!; item.stage = 'REVIEW_REQUIRED'; item.progress = 100; item.message = 'AI key unavailable. Choose a document type, target and fields manually.'; item.updatedAt = new Date().toISOString(); }); return; }
  try {
    const data = await fs.readFile(filePath(id));
    const module = job.recordType === 'DRIVER' ? 'DRIVER' : 'ASSET';
    const [classification, extraction] = await Promise.all([
      workflowStore.resolve({ module, phase: 'CLASSIFY', entityId: job.entityId, version: job.workflowVersion }),
      workflowStore.resolve({ module, phase: 'EXTRACT', entityId: job.entityId, version: job.workflowVersion }),
    ]);
    const configuredCodes = (await workflowStore.documents('ASSET', job.workflowVersion)).map(item => item.code);
    const prompt = `Classify this Malaysian fleet, machinery or property evidence as exactly one of ASSET, DRIVER, MAINTENANCE, CLAIM, ROAD_TAX, INSURANCE, INSPECTION, ASSET_ACTION, CONFIGURED_DOCUMENT. Use CONFIGURED_DOCUMENT for a separately configured evidence type (${configuredCodes.join(', ')}), and set documentCode to its exact configured code. Use ASSET_ACTION for PMA, Certificate of Fitness, PUSPAKOM, machinery inspection, property insurance or utility, summons or accident follow-up. For ASSET_ACTION set actionKind to one of ${assetActionKinds.join(', ')}. Classification instructions: ${classification?.prompt || ''}. Extraction instructions: ${extraction?.prompt || ''}. Return JSON only: {"recordType":"","fields":{"registrationNumber":"","assetName":"","category":"","brand":"","model":"","year":"","driverName":"","licenseNumber":"","licenseType":"","licenseExpiry":"","date":"","expiryDate":"","nextDueDate":"","nextDueHours":"","currentOperatingHours":"","dueDate":"","dueHours":"","actionKind":"","documentCode":"","certificateNumber":"","ownerName":"","ownerEmail":"","cost":"","odometer":"","claimNumber":"","amount":"","insurer":"","description":""},"confidence":0.0,"sourceReference":"page/section/photo region"}. Include configured document fields when visible. Extract only visible values, keep unknown fields empty, dates YYYY-MM-DD. The recordType describes what event this document adds to history; do not use ASSET for a maintenance invoice.`;
    const text = await asText(data, job.mimeType);
    const parts: any[] = [{ text: prompt }, text ? { text } : { inlineData: { mimeType: job.mimeType, data: data.toString('base64') } }];
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json' } });
    const parsed = parseJson(result.text || '{}');
    const kind = String(parsed.recordType || '') as Kind;
    const fields = parsed.fields && typeof parsed.fields === 'object' ? Object.fromEntries(Object.entries(parsed.fields).map(([key, value]) => [key, String(value || '')])) as Record<string, string> : {};
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const recordId = await matching({ ...job, recordType: kind, proposedFields: fields });
    const hintedTarget = job.recordId ? (kind === 'DRIVER' ? await assetStore.driver(job.recordId) : await assetStore.asset(job.recordId)) : undefined;
    const conflictingHint = !!job.recordId && (!hintedTarget || (!!recordId && recordId !== job.recordId));
    const requiresMatch = !['ASSET', 'DRIVER'].includes(kind);
    await mutate(jobs => { const item = jobs.find(value => value.id === id)!; item.recordType = kind; item.proposedFields = fields; item.confidence = confidence; item.sourceReference = String(parsed.sourceReference || 'Document'); item.recordId = recordId || (conflictingHint ? undefined : item.recordId); item.stage = !(['ASSET', 'DRIVER', 'MAINTENANCE', 'CLAIM', 'ROAD_TAX', 'INSURANCE', 'INSPECTION', 'ASSET_ACTION', 'CONFIGURED_DOCUMENT'].includes(kind)) || confidence < 0.8 || conflictingHint || (requiresMatch && !item.recordId) ? 'REVIEW_REQUIRED' : 'READY_FOR_REVIEW'; item.progress = 100; item.message = conflictingHint ? 'The uploaded evidence conflicts with the selected target. Review and choose the correct record.' : item.stage === 'REVIEW_REQUIRED' ? 'Check classification, identity match and extracted values before applying.' : 'Proposal ready for human confirmation.'; item.updatedAt = new Date().toISOString(); });
  } catch (error) { await mutate(jobs => { const item = jobs.find(value => value.id === id)!; item.stage = 'REVIEW_REQUIRED'; item.progress = 100; item.message = `Automatic extraction unavailable: ${error instanceof Error ? error.message : 'unknown error'}`; item.updatedAt = new Date().toISOString(); }); }
};
export const resumeAssetDocumentJobs = async () => { await init(); for (const item of cache!.filter(job => ['QUEUED', 'EXTRACTING'].includes(job.stage))) void processDocumentJob(item.id); };
const emptyAsset = (entityId: string, fields: Record<string, string>): Asset & { entityId: string } => ({ id: crypto.randomUUID(), entityId, name: fields.assetName || fields.registrationNumber, registrationNumber: fields.registrationNumber, category: (['COMMERCIAL_VEHICLE', 'LIGHT_VEHICLE', 'HEAVY_MACHINERY', 'WAREHOUSE_EQUIPMENT', 'MOBILE_SITE_EQUIPMENT', 'CRATE', 'PROPERTY', 'OTHER'].includes(fields.category) ? fields.category : 'OTHER') as AssetCategory, brand: fields.brand || '', model: fields.model || '', year: Number(fields.year) || 0, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: '', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] }, actions: [], currentOperatingHours: Number(fields.currentOperatingHours) || 0 });
const apply = async (job: Job, actor: string) => {
  const fields = job.proposedFields;
  const targetAsset = job.recordId ? await assetStore.asset(job.recordId) : undefined;
  const targetDriver = job.recordId ? await assetStore.driver(job.recordId) : undefined;
  if (job.recordId && !targetAsset && !targetDriver) throw new Error('The selected record no longer exists.');
  if (job.recordType === 'DRIVER' && job.recordId && !targetDriver) throw new Error('Select a driver record, not an asset.');
  if (job.recordType !== 'DRIVER' && job.recordId && !targetAsset) throw new Error('Select an asset record, not a driver.');
  if ((targetAsset && targetAsset.entityId !== job.entityId) || (targetDriver && targetDriver.entityId !== job.entityId)) throw new Error('The selected record belongs to another entity.');
  if (targetAsset && fields.registrationNumber && targetAsset.registrationNumber.toLowerCase() !== fields.registrationNumber.toLowerCase()) throw new Error('Extracted asset identifier conflicts with the selected asset. Correct the field or choose another asset.');
  if (targetDriver && fields.licenseNumber && targetDriver.licenseNumber.toLowerCase() !== fields.licenseNumber.toLowerCase()) throw new Error('Extracted licence number conflicts with the selected driver. Correct the field or choose another driver.');
  const validation = await workflowStore.resolve({ module: job.recordType === 'DRIVER' ? 'DRIVER' : 'ASSET', phase: 'VALIDATE', entityId: job.entityId, categoryId: targetAsset?.category || fields.category || '', version: job.workflowVersion });
  const missing = (validation?.requiredFields || []).filter(field => !fields[field]);
  if (validation?.blocking && missing.length) throw new Error(`Configured validation requires: ${missing.join(', ')}.`);
  if (job.recordType === 'DRIVER') {
    const existing = targetDriver;
    if (!existing && (!fields.driverName || !fields.licenseNumber)) throw new Error('Driver name and licence number are required.');
    const driver: Driver & { entityId: string } = { id: existing?.id || crypto.randomUUID(), entityId: job.entityId, name: fields.driverName || existing?.name || '', licenseNumber: fields.licenseNumber || existing?.licenseNumber || '', licenseType: fields.licenseType || existing?.licenseType || '', licenseExpiry: fields.licenseExpiry || existing?.licenseExpiry || '', phone: existing?.phone || '', status: existing?.status || 'ACTIVE', image: existing?.image || '' };
    return (await assetStore.saveDriver(driver, actor)).id;
  }
  if (job.recordType === 'ASSET') {
    if (!fields.registrationNumber && !job.recordId) throw new Error('Asset identifier or number plate is required.');
    const existing = targetAsset;
    return existing ? (await assetStore.updateAsset(existing.id, { name: fields.assetName || existing.name, brand: fields.brand || existing.brand, model: fields.model || existing.model, year: Number(fields.year) || existing.year }, actor)).id : (await assetStore.createAsset(emptyAsset(job.entityId, fields), actor)).id;
  }
  const asset = job.recordId ? await assetStore.asset(job.recordId) : undefined;
  if (!asset || asset.entityId !== job.entityId) throw new Error('Select a matching asset in this entity before applying evidence.');
  if (job.recordType === 'CONFIGURED_DOCUMENT') {
    const code = String(fields.documentCode || '').trim().toUpperCase();
    const definition = (await workflowStore.documents('ASSET', job.workflowVersion)).find(item => item.code === code && (!item.entityIds.length || item.entityIds.includes(asset.entityId)) && (!item.categoryIds.length || item.categoryIds.includes(asset.category)));
    if (!definition) throw new Error('Choose an active configured document code applicable to this entity and asset category.');
    const missing = definition.fields.filter(field => !fields[field]);
    if (missing.length) throw new Error(`Configured document requires: ${missing.join(', ')}.`);
    const expiryDate = fields.expiryDate || undefined;
    if (expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || Number.isNaN(Date.parse(`${expiryDate}T00:00:00Z`)))) throw new Error('Enter a valid expiry date.');
    const documentId = crypto.randomUUID();
    const evidenceDocuments = (asset.evidenceDocuments || []).map(item => item.code === code && !item.supersededBy ? { ...item, supersededBy: documentId } : item);
    evidenceDocuments.unshift({ id: documentId, code, title: definition.label, values: { ...fields }, expiryDate, sourceFileId: job.id, sourceReference: job.sourceReference, recordedAt: new Date().toISOString() });
    return (await assetStore.updateAsset(asset.id, { evidenceDocuments }, actor)).id;
  }
  if (job.recordType === 'ASSET_ACTION') {
    const kind = String(fields.actionKind || '').toUpperCase();
    if (!assetActionKinds.includes(kind as any)) throw new Error('Choose a valid PMA, inspection, property, summons or accident action kind.');
    const dueDate = fields.dueDate || fields.expiryDate || fields.nextDueDate || undefined;
    const dueHours = fields.dueHours ? Number(fields.dueHours) : undefined;
    return (await assetStore.createAction(asset.id, { kind: kind as any, title: fields.description || `${kind.replaceAll('_', ' ')} follow-up`, description: `${fields.description || job.fileName} · source ${job.sourceReference}`, dueDate, dueHours, certificateNumber: fields.certificateNumber || undefined, amount: fields.amount ? Number(fields.amount) : undefined, ownerName: fields.ownerName || asset.picName || '', ownerEmail: fields.ownerEmail || asset.picEmail || '', sourceFileId: job.id }, actor, ['PMA', 'CERTIFICATE_OF_FITNESS', 'PUSPAKOM', 'MACHINERY_INSPECTION', 'PROPERTY_INSURANCE'].includes(kind))).id;
  }
  if (job.recordType === 'MAINTENANCE') {
    const date = fields.date || new Date().toISOString().slice(0, 10);
    const nextDueHours = fields.nextDueHours ? Number(fields.nextDueHours) : undefined;
    if (fields.nextDueDate || nextDueHours !== undefined) validateAssetAction({ kind: 'MAINTENANCE', title: `Next service: ${asset.name}`, dueDate: fields.nextDueDate || undefined, dueHours: nextDueHours });
    const updated = await assetStore.updateAsset(asset.id, { currentOperatingHours: fields.currentOperatingHours ? Number(fields.currentOperatingHours) : asset.currentOperatingHours, maintenance: { ...asset.maintenance, lastServiceDate: date, nextServiceDate: fields.nextDueDate || asset.maintenance.nextServiceDate, nextServiceHours: nextDueHours || asset.maintenance.nextServiceHours, lastOdometer: Number(fields.odometer) || asset.maintenance.lastOdometer, records: [{ id: crypto.randomUUID(), date, type: 'CORRECTIVE', description: fields.description || job.fileName, cost: Number(fields.cost) || 0, status: 'COMPLETED', odometer: Number(fields.odometer) || undefined, nextDueDate: fields.nextDueDate || undefined, attachmentName: job.fileName, sourceFileId: job.id }, ...asset.maintenance.records] } }, actor);
    if (fields.nextDueDate || nextDueHours !== undefined) await assetStore.createAction(asset.id, { kind: 'MAINTENANCE', title: `Next service: ${asset.name}`, description: fields.description || job.fileName, dueDate: fields.nextDueDate || undefined, dueHours: nextDueHours, ownerName: asset.picName || '', ownerEmail: asset.picEmail || '', sourceFileId: job.id }, actor, true);
    return updated.id;
  }
  if (job.recordType === 'CLAIM') { return (await assetStore.updateAsset(asset.id, { claims: [{ id: crypto.randomUUID(), claimNumber: fields.claimNumber || '', incidentDate: fields.date || '', description: fields.description || job.fileName, amount: Number(fields.amount) || 0, insurer: fields.insurer || '', status: 'OPEN', sourceFileId: job.id }, ...(asset.claims || [])] }, actor)).id; }
  if (['ROAD_TAX', 'INSURANCE', 'INSPECTION'].includes(job.recordType || '')) {
    const key = job.recordType === 'ROAD_TAX' ? 'roadTax' : job.recordType === 'INSURANCE' ? 'insurance' : 'inspection';
    if (!fields.expiryDate) throw new Error('Expiry date is required for compliance evidence.');
    const document = { id: crypto.randomUUID(), type: job.recordType!, expiryDate: fields.expiryDate, status: fields.expiryDate < new Date().toISOString().slice(0, 10) ? 'EXPIRED' as const : 'VALID' as const, attachmentName: job.fileName, sourceFileId: job.id };
    return (await assetStore.updateAsset(asset.id, { documents: { ...asset.documents, [key]: document } }, actor)).id;
  }
  throw new Error('Choose a valid document event type.');
};

export function registerAssetDocumentRoutes(app: Express) {
  app.get('/api/asset-documents/types', async (request, response) => {
    const entityId = String(request.query.entityId || '');
    if (!canReadEntity(currentUser(request)!, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    response.json((await workflowStore.documents('ASSET')).filter(item => !item.entityIds.length || item.entityIds.includes(entityId)));
  });
  app.post('/api/asset-documents', async (request, response) => {
    const user = currentUser(request)!; const entityId = String(request.body.entityId || '');
    if (!canWriteEntity(user, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    const mimeType = String(request.body.mimeType || ''); const data = Buffer.from(String(request.body.data || ''), 'base64');
    if (!allowed.has(mimeType) || !data.length || data.length > 10 * 1024 * 1024) return response.status(400).json({ error: 'PDF, Word, spreadsheet, photo, CSV or text up to 10 MB required.' });
    const recordId = String(request.body.recordId || '');
    if (recordId) { const target = await assetStore.asset(recordId) || await assetStore.driver(recordId); if (!target || target.entityId !== entityId) return response.status(400).json({ error: 'Target must belong to the selected entity.' }); }
    const id = crypto.randomUUID(); const entry: Job = { id, entityId, fileName: path.basename(String(request.body.fileName || 'upload')), mimeType, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length, stage: 'QUEUED', progress: 0, message: 'Queued for document reading.', recordId: recordId || undefined, proposedFields: {}, confidence: 0, sourceReference: '', workflowVersion: await workflowStore.version(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), actor: user.name };
    await fs.mkdir(root, { recursive: true }); await fs.writeFile(filePath(id), data, { flag: 'wx', mode: 0o600 }); await mutate(jobs => { jobs.push(entry); });
    setImmediate(() => { void processDocumentJob(id); }); response.status(202).json(entry);
  });
  app.get('/api/asset-documents/jobs', async (request, response) => { await init(); const user = currentUser(request)!; response.json(cache!.filter(item => canReadEntity(user, item.entityId))); });
  app.get('/api/asset-documents/jobs/:id', async (request, response) => { const item = await find(request.params.id); if (!item || !canReadEntity(currentUser(request)!, item.entityId)) return response.status(404).json({ error: 'Job not found.' }); response.json(item); });
  app.get('/api/asset-documents/jobs/:id/file', async (request, response) => { const item = await find(request.params.id); if (!item || !canReadEntity(currentUser(request)!, item.entityId)) return response.status(404).json({ error: 'File not found.' }); response.type(item.mimeType).setHeader('Content-Disposition', `attachment; filename="${item.fileName.replace(/["\r\n]/g, '')}"`).send(await fs.readFile(filePath(item.id))); });
  app.post('/api/asset-documents/jobs/:id/accept', async (request, response) => {
    const user = currentUser(request)!; const item = await find(request.params.id);
    if (!item || !canReadEntity(user, item.entityId)) return response.status(404).json({ error: 'Job not found.' });
    if (!canWriteEntity(user, item.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if (!['READY_FOR_REVIEW', 'REVIEW_REQUIRED'].includes(item.stage) || accepting.has(item.id)) return response.status(409).json({ error: 'Evidence is not ready for acceptance or is already being applied.' });
    const proposal: Job = { ...item, recordType: String(request.body.recordType || item.recordType || '') as Kind, recordId: String(request.body.recordId || item.recordId || ''), proposedFields: request.body.fields && typeof request.body.fields === 'object' ? Object.fromEntries(Object.entries(request.body.fields).map(([key, value]) => [key, String(value || '')])) : item.proposedFields };
    accepting.add(item.id);
    try { const recordId = await apply(proposal, user.name); const updated = await mutate(jobs => { const current = jobs.find(value => value.id === item.id)!; Object.assign(current, { recordType: proposal.recordType, recordId, proposedFields: proposal.proposedFields, stage: 'APPLIED', appliedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), message: `Applied to ${proposal.recordType?.toLowerCase()} history by ${user.name}.` }); return current; }); response.json(updated); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Could not apply evidence.' }); }
    finally { accepting.delete(item.id); }
  });
}
