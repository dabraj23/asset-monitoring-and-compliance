import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Asset, AssetCategory, Driver } from '../src/types.ts';
import type { CreateVendorInput } from '../src/vendorTypes.ts';
import { assetStore } from './assetStore.ts';
import { contractStore } from './contractStore.ts';
import { canReadEntity, canWriteEntity, currentUser } from './platformAuth.ts';
import { vendorStore } from './vendorStore.ts';
import { createVendor } from './vendorRoutes.ts';

export type Module = 'VENDOR' | 'ASSET' | 'DRIVER';
type Row = { number: number; status: 'QUEUED' | 'PROCESSING' | 'CREATED' | 'REVIEW_REQUIRED' | 'FAILED'; recordId?: string; message?: string; values: Record<string, string> };
interface CsvJob { id: string; module: Module; entityId: string; source: 'MANUAL' | 'HTTPS' | 'SFTP'; sourceId?: string; batchId?: string; fileName: string; sha256: string; status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'; createdAt: string; updatedAt: string; createdBy: string; mapping: Record<string, string>; rows: Row[] }
const root = path.join(process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform'), 'intake');
const file = path.join(root, 'jobs.json');
let queue: Promise<unknown> = Promise.resolve();
let jobsCache: CsvJob[] | null = null;
const init = async () => { if (jobsCache) return; await fs.mkdir(root, { recursive: true }); try { jobsCache = JSON.parse(await fs.readFile(file, 'utf8')) as CsvJob[]; } catch (error: any) { if (error?.code !== 'ENOENT') throw error; jobsCache = []; } };
const mutate = async <T>(operation: (jobs: CsvJob[]) => T): Promise<T> => { await init(); const pending = queue.then(async () => { const result = operation(jobsCache!); const temp = `${file}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(jobsCache, null, 2), { mode: 0o600 }); await fs.rename(temp, file); return structuredClone(result); }); queue = pending.catch(() => undefined); return pending; };
const job = async (id: string) => { await init(); return structuredClone(jobsCache!.find(item => item.id === id)); };
export const getCsvJobStatus = async (id: string, sourceId: string) => { const item = await job(id); if (!item || item.sourceId !== sourceId) return undefined; return { id: item.id, source: item.source, module: item.module, entityId: item.entityId, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt, rows: item.rows.map(row => ({ number: row.number, status: row.status, message: row.message, recordId: row.recordId })) }; };
const aliases: Record<string, string[]> = {
  legalName: ['legalname', 'vendorname', 'companyname', 'suppliername', 'name'], registrationNumber: ['registrationnumber', 'ssmnumber', 'companynumber', 'businessregistrationnumber', 'regno'], category: ['category', 'vendorcategory', 'type'], email: ['email', 'contactemail'], phone: ['phone', 'telephone', 'mobile'], address: ['address', 'registeredaddress'], services: ['services', 'scopeofwork'],
  assetName: ['assetname', 'description', 'name'], registrationNumberAsset: ['registrationnumber', 'numberplate', 'platenumber', 'assetnumber', 'assetid'], assetCategory: ['category', 'assetcategory', 'type'], brand: ['brand', 'make'], model: ['model'], year: ['year', 'manufactureyear'], roadTaxExpiry: ['roadtaxexpiry', 'roadtaxexpiration'], insuranceExpiry: ['insuranceexpiry', 'insuranceexpiration'], nextServiceDate: ['nextservicedate', 'nextmaintenance'],
  driverName: ['drivername', 'name'], licenseNumber: ['licensenumber', 'licencenumber', 'drivinglicencenumber'], licenseType: ['licenseclass', 'licenceclass', 'licensetype', 'licencetype'], licenseExpiry: ['licenseexpiry', 'licenceexpiry'], driverPhone: ['phone', 'mobile'],
};
const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export const parseCsv = (content: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < content.length; i++) { const char = content[i]; if (char === '"') { if (quoted && content[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (char === ',' && !quoted) { row.push(field); field = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && content[i + 1] === '\n') i++; row.push(field); if (row.some(value => value.trim())) rows.push(row); row = []; field = ''; } else field += char; }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(field); if (row.some(value => value.trim())) rows.push(row);
  return rows;
};
const mapValues = (headers: string[], values: string[], module: Module, manual: Record<string, string>) => {
  const result: Record<string, string> = {};
  const fields = module === 'VENDOR' ? ['legalName', 'registrationNumber', 'category', 'email', 'phone', 'address', 'services'] : module === 'ASSET' ? ['assetName', 'registrationNumberAsset', 'assetCategory', 'brand', 'model', 'year', 'roadTaxExpiry', 'insuranceExpiry', 'nextServiceDate'] : ['driverName', 'licenseNumber', 'licenseType', 'licenseExpiry', 'driverPhone'];
  for (const field of fields) { const target = manual[field]; const index = target ? headers.findIndex(header => header === target) : headers.findIndex(header => aliases[field]?.includes(clean(header))); if (index >= 0) result[field] = (values[index] || '').trim(); }
  return result;
};
const sourceFile = (id: string) => path.join(root, `${id}.csv`);
const execute = async (id: string) => {
  const initial = await job(id); if (!initial) return;
  await mutate(jobs => { const current = jobs.find(item => item.id === id)!; current.status = 'PROCESSING'; current.updatedAt = new Date().toISOString(); });
  for (const row of initial.rows.filter(item => ['QUEUED', 'PROCESSING'].includes(item.status))) {
    await mutate(jobs => { jobs.find(item => item.id === id)!.rows.find(item => item.number === row.number)!.status = 'PROCESSING'; });
    let status: Row['status'] = 'CREATED'; let recordId = ''; let message = '';
    try {
      const values = row.values;
      if (initial.module === 'VENDOR') {
        if (!values.legalName || !values.registrationNumber) throw new Error('Vendor name and registration number need review.');
        const configuration = await vendorStore.configuration();
        const category = configuration.categories.find(item => item.name.toLowerCase() === values.category?.toLowerCase()) || configuration.categories.find(item => item.id === values.category) || configuration.categories[0];
        if (!category) throw new Error('No active vendor category configured.');
        if ((await vendorStore.vendors()).some(item => item.entityId === initial.entityId && item.registrationNumber === values.registrationNumber)) { status = 'REVIEW_REQUIRED'; message = 'Matching vendor registration already exists; review before merging.'; }
        else { const input: CreateVendorInput = { entityId: initial.entityId, legalName: values.legalName, registrationNumber: values.registrationNumber, categoryId: category.id, email: values.email || '', phone: values.phone || '', address: values.address || '', services: values.services ? values.services.split(';').map(item => item.trim()) : [], activityTags: [], contactName: '', personnel: [] }; const vendor = await createVendor(input, configuration); await vendorStore.saveVendor(vendor); recordId = vendor.id; }
      } else if (initial.module === 'ASSET') {
        if (!values.registrationNumberAsset) throw new Error('Asset identifier or number plate needs review.');
        const category = (['COMMERCIAL_VEHICLE', 'LIGHT_VEHICLE', 'HEAVY_MACHINERY', 'WAREHOUSE_EQUIPMENT', 'MOBILE_SITE_EQUIPMENT', 'CRATE', 'OTHER'].includes(values.assetCategory?.toUpperCase().replaceAll(' ', '_')) ? values.assetCategory.toUpperCase().replaceAll(' ', '_') : 'OTHER') as AssetCategory;
        const doc = (type: string, expiryDate: string) => expiryDate ? { id: crypto.randomUUID(), type, expiryDate, status: expiryDate < new Date().toISOString().slice(0, 10) ? 'EXPIRED' as const : 'VALID' as const } : undefined;
        const asset: Asset & { entityId: string } = { id: crypto.randomUUID(), entityId: initial.entityId, name: values.assetName || values.registrationNumberAsset, registrationNumber: values.registrationNumberAsset, category, brand: values.brand || '', model: values.model || '', year: Number(values.year) || 0, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: '', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: { roadTax: doc('ROAD_TAX', values.roadTaxExpiry), insurance: doc('INSURANCE', values.insuranceExpiry) }, maintenance: { lastServiceDate: '', nextServiceDate: values.nextServiceDate || '', records: [] } };
        recordId = (await assetStore.createAsset(asset, initial.createdBy)).id;
      } else {
        if (!values.driverName || !values.licenseNumber) throw new Error('Driver name and licence number need review.');
        if ((await assetStore.drivers()).some(item => item.entityId === initial.entityId && item.licenseNumber.toLowerCase() === values.licenseNumber.toLowerCase())) { status = 'REVIEW_REQUIRED'; message = 'Matching driver licence already exists; review before merging.'; }
        else {
        const driver: Driver & { entityId: string } = { id: crypto.randomUUID(), entityId: initial.entityId, name: values.driverName, licenseNumber: values.licenseNumber, licenseType: values.licenseType || '', licenseExpiry: values.licenseExpiry || '', phone: values.driverPhone || '', status: 'ACTIVE', image: '' };
        recordId = (await assetStore.saveDriver(driver, initial.createdBy)).id;
        }
      }
    } catch (error) { status = 'REVIEW_REQUIRED'; message = error instanceof Error ? error.message : 'Row needs review.'; }
    await mutate(jobs => { const current = jobs.find(item => item.id === id)!; const target = current.rows.find(item => item.number === row.number)!; Object.assign(target, { status, recordId, message }); current.updatedAt = new Date().toISOString(); });
  }
  await mutate(jobs => { const current = jobs.find(item => item.id === id)!; const created = current.rows.filter(item => item.status === 'CREATED').length; current.status = created === current.rows.length ? 'COMPLETED' : created ? 'PARTIAL' : 'FAILED'; current.updatedAt = new Date().toISOString(); });
};
export const resumeIntakeJobs = async () => { await init(); for (const current of jobsCache!.filter(item => ['QUEUED', 'PROCESSING'].includes(item.status))) void execute(current.id); };
type CsvInput = { entityId: string; module: Module; csv: string; fileName: string; mapping?: Record<string, string>; source: CsvJob['source']; sourceId?: string; batchId?: string; actor: string; quarantine?: boolean };
const enqueueCsvInternal = async (input: CsvInput) => {
  if (!['VENDOR', 'ASSET', 'DRIVER'].includes(input.module)) throw new Error('Choose vendor, asset or driver intake.');
  if (!input.csv || Buffer.byteLength(input.csv) > 5 * 1024 * 1024) throw new Error('CSV must be between 1 byte and 5 MB.');
  const matrix = parseCsv(input.csv); const headers = matrix.shift();
  if (!headers?.length || !matrix.length || matrix.length > 5000) throw new Error('CSV needs a header and 1–5000 data rows.');
  await init();
  const digest = crypto.createHash('sha256').update(input.csv).digest('hex');
  if (input.source !== 'MANUAL') {
    const sameBatch = jobsCache!.find(item => item.sourceId === input.sourceId && item.module === input.module && input.batchId && item.batchId === input.batchId);
    if (sameBatch && sameBatch.sha256 !== digest) throw new Error('Batch ID was reused with different CSV content.');
    const previous = sameBatch || jobsCache!.find(item => item.sourceId === input.sourceId && item.module === input.module && item.sha256 === digest);
    if (previous) return { job: structuredClone(previous), duplicate: true };
  }
  const id = crypto.randomUUID(); const mapping = input.mapping || {};
  const entry: CsvJob = { id, module: input.module, entityId: input.quarantine ? '' : input.entityId, source: input.source, sourceId: input.sourceId, batchId: input.batchId, fileName: path.basename(input.fileName || 'upload.csv'), sha256: digest, status: input.quarantine ? 'FAILED' : 'QUEUED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: input.actor, mapping, rows: matrix.map((values, index) => ({ number: index + 2, status: input.quarantine ? 'REVIEW_REQUIRED' : 'QUEUED', message: input.quarantine ? `Unknown or unpermitted entity: ${input.entityId}. Group administrator review required.` : '', values: mapValues(headers, values, input.module, mapping) })) };
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(sourceFile(id), input.csv, { flag: 'wx', mode: 0o600 }); await mutate(jobs => { jobs.push(entry); });
  if (!input.quarantine) setImmediate(() => { void execute(id); });
  return { job: entry, duplicate: false };
};
let enqueueQueue: Promise<unknown> = Promise.resolve();
export const enqueueCsv = (input: CsvInput) => { const pending = enqueueQueue.then(() => enqueueCsvInternal(input)); enqueueQueue = pending.catch(() => undefined); return pending; };

export function registerIntakeRoutes(app: Express) {
  app.post('/api/intake/csv', async (request, response) => {
    const user = currentUser(request)!; const entityId = String(request.body.entityId || '');
    if (!canWriteEntity(user, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if (!(await contractStore.entities()).some(item => item.id === entityId)) return response.status(400).json({ error: 'Choose a registered entity.' });
    try {
      const result = await enqueueCsv({ entityId, module: String(request.body.module || '') as Module, csv: String(request.body.csv || ''), fileName: String(request.body.fileName || 'upload.csv'), mapping: request.body.mapping && typeof request.body.mapping === 'object' ? request.body.mapping : {}, source: 'MANUAL', actor: user.name });
      response.status(202).json(result.job);
    } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV.' }); }
  });
  app.get('/api/intake/jobs', async (request, response) => { await init(); const user = currentUser(request)!; response.json(jobsCache!.filter(item => canReadEntity(user, item.entityId)).map(item => ({ ...item, rows: item.rows.map(row => ({ ...row, values: user.role === 'EXECUTIVE' ? {} : row.values })) }))); });
  app.get('/api/intake/jobs/:id', async (request, response) => { const entry = await job(request.params.id); if (!entry || !canReadEntity(currentUser(request)!, entry.entityId)) return response.status(404).json({ error: 'Job not found.' }); response.json(currentUser(request)!.role === 'EXECUTIVE' ? { ...entry, rows: entry.rows.map(row => ({ ...row, values: {} })) } : entry); });
}
