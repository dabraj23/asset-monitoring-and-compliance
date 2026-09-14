import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Asset, Driver } from '../src/types.ts';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-monitor-flow-test-'));
process.env.PLATFORM_DATA_DIR = temporary;
delete process.env.GEMINI_API_KEY;
const { assetStore } = await import('./assetStore.ts');
const { parseCsv, enqueueCsv, getCsvJobStatus } = await import('./intakeRoutes.ts');
const { canReadEntity, canWriteEntity } = await import('./platformAuth.ts');
const { entityAccess } = await import('./entityAccess.ts');
const { assetActionStatus } = await import('./assetActions.ts');
const { evaluateAssetRequirements } = await import('./assetRequirements.ts');
const { registerAssetDocumentRoutes } = await import('./assetDocumentRoutes.ts');
const { workflowStore } = await import('./workflowStore.ts');
after(async () => { if (temporary.startsWith(os.tmpdir())) await fs.rm(temporary, { recursive: true, force: true }); });

test('CSV parser keeps quoted commas and multiline fields together', () => {
  assert.deepEqual(parseCsv('name,notes\r\n"Acme, Sdn Bhd","line one\nline two"\r\n'), [['name', 'notes'], ['Acme, Sdn Bhd', 'line one\nline two']]);
});

test('host-to-host retries deduplicate and unknown entities stay in restricted row review', async () => {
  const input = { entityId: 'UNKNOWN', module: 'VENDOR' as const, csv: 'company_name,registration_number\nExample Sdn Bhd,123-X', fileName: 'vendors.csv', source: 'HTTPS' as const, sourceId: 'erp-test', batchId: 'batch-001', actor: 'System: erp-test', quarantine: true };
  const first = await enqueueCsv(input);
  const repeat = await enqueueCsv(input);
  assert.equal(first.duplicate, false);
  assert.equal(repeat.duplicate, true);
  assert.equal(first.job.id, repeat.job.id);
  const status = await getCsvJobStatus(first.job.id, 'erp-test');
  assert.equal(status?.status, 'FAILED');
  assert.equal(status?.rows[0].status, 'REVIEW_REQUIRED');
  assert.equal(await getCsvJobStatus(first.job.id, 'another-source'), undefined);
  await assert.rejects(() => enqueueCsv({ ...input, csv: 'company_name,registration_number\nDifferent Sdn Bhd,456-Y' }), /reused with different/);
});

test('entity roles and executive API surface are enforced on the server', async () => {
  const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test', role: 'OWNER' as const, entityIds: ['A'], passwordHash: '', active: true, createdAt: '' };
  const executive = { ...owner, role: 'EXECUTIVE' as const };
  assert.equal(canReadEntity(owner, 'A'), true);
  assert.equal(canReadEntity(owner, 'B'), false);
  assert.equal(canWriteEntity(owner, 'A'), false);
  assert.equal(canReadEntity(executive, 'B'), true);
  assert.equal(canWriteEntity(executive, 'A'), false);
  let status = 0; let nextCalled = false;
  const response = { status(value: number) { status = value; return this; }, json(_value: unknown) { return this; } };
  await entityAccess({ platformUser: executive, originalUrl: '/api/vendors', method: 'GET' } as any, response as any, () => { nextCalled = true; });
  assert.equal(status, 403); assert.equal(nextCalled, false);
  status = 0; nextCalled = false;
  await entityAccess({ platformUser: executive, originalUrl: '/api/executive/overview', method: 'GET' } as any, response as any, () => { nextCalled = true; });
  assert.equal(status, 0); assert.equal(nextCalled, true);
});

test('server-backed asset and driver allocation enforces licence, entity and unique assignment', async () => {
  const entityId = crypto.randomUUID();
  const asset: Asset & { entityId: string } = { id: crypto.randomUUID(), entityId, name: 'Test truck', registrationNumber: 'ABC123', category: 'COMMERCIAL_VEHICLE', brand: '', model: '', year: 2024, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: '', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] } };
  await assetStore.createAsset(asset, 'Test Admin');
  await assert.rejects(() => assetStore.createAsset({ ...asset, id: crypto.randomUUID() }, 'Test Admin'), /already exists/);
  const driver: Driver & { entityId: string } = { id: crypto.randomUUID(), entityId, name: 'Test Driver', licenseNumber: 'D1234', licenseType: 'E', licenseExpiry: '2030-01-01', phone: '', status: 'ACTIVE', image: '' };
  await assetStore.saveDriver(driver, 'Test Admin');
  await assetStore.assignDriver(asset.id, driver.id, '2028-01-01', 'Initial allocation', 'Test Admin');
  assert.equal((await assetStore.asset(asset.id))?.assignedDrivers[0].id, driver.id);
  const second = await assetStore.createAsset({ ...asset, id: crypto.randomUUID(), registrationNumber: 'DEF456' }, 'Test Admin');
  await assert.rejects(() => assetStore.assignDriver(second.id, driver.id, '2028-01-01', '', 'Test Admin'), /already assigned/);
  const expired = await assetStore.saveDriver({ ...driver, id: crypto.randomUUID(), licenseExpiry: '2020-01-01' }, 'Test Admin');
  await assert.rejects(() => assetStore.assignDriver(second.id, expired.id, '2028-01-01', '', 'Test Admin'), /expired/);
  const wrongEntity = await assetStore.saveDriver({ ...driver, id: crypto.randomUUID(), entityId: crypto.randomUUID() }, 'Test Admin');
  await assert.rejects(() => assetStore.assignDriver(second.id, wrongEntity.id, '2028-01-01', '', 'Test Admin'), /same entity/);
});

test('asset statutory and maintenance actions react to operating hours and retain successor history', async () => {
  const asset = await assetStore.createAsset({ id: crypto.randomUUID(), entityId: 'entity-action-test', name: 'Tower lift', registrationNumber: `LIFT-${crypto.randomUUID()}`, category: 'HEAVY_MACHINERY', brand: '', model: '', year: 2025, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: 'KL Tower', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] }, currentOperatingHours: 950 }, 'Test Admin');
  const created = await assetStore.createAction(asset.id, { kind: 'CERTIFICATE_OF_FITNESS', title: 'Renew lift Certificate of Fitness', dueHours: 1000, ownerName: 'Site PIC', ownerEmail: 'pic@example.test' }, 'Test Admin');
  const first = created.actions![0];
  assert.equal(assetActionStatus(created, first), 'DUE_SOON');
  const later = await assetStore.updateAsset(asset.id, { currentOperatingHours: 1001 }, 'Test Admin');
  assert.equal(assetActionStatus(later, first), 'OVERDUE');
  const completed = await assetStore.completeAction(asset.id, first.id, 'COMPLETED', 'Inspection evidence reviewed', 'Test Admin', undefined, 1500);
  assert.equal(completed.actions?.find(item => item.id === first.id)?.status, 'COMPLETED');
  assert.equal(completed.actions?.[0].predecessorId, first.id);
  assert.equal(completed.actions?.[0].dueHours, 1500);
  await assert.rejects(() => assetStore.completeAction(asset.id, first.id, 'COMPLETED', 'Again', 'Test Admin'), /already closed/);
});

test('published category requirements distinguish missing evidence, manual dates and accepted documents', async () => {
  const asset = (await assetStore.assets()).find(item => item.registrationNumber === 'ABC123')!;
  const rule = { id: 'vehicle-check', module: 'ASSET' as const, phase: 'VALIDATE' as const, entityId: '', categoryId: 'COMMERCIAL_VEHICLE', prompt: 'Check vehicle evidence', requiredDocumentTypes: ['ROAD_TAX', 'INSURANCE'], requiredFields: ['expiryDate'], blocking: true, active: true, version: 2 };
  assert.deepEqual(evaluateAssetRequirements(asset, rule).map(item => item.status), ['FAILED', 'FAILED']);
  const withManual = { ...asset, documents: { ...asset.documents, roadTax: { id: 'manual', type: 'ROAD_TAX', expiryDate: '2030-01-01', status: 'VALID' as const } } };
  assert.deepEqual(evaluateAssetRequirements(withManual, rule).map(item => item.status), ['REVIEW_REQUIRED', 'FAILED']);
  const withEvidence = { ...withManual, documents: { ...withManual.documents, roadTax: { ...withManual.documents.roadTax!, sourceFileId: 'accepted-job' } } };
  assert.deepEqual(evaluateAssetRequirements(withEvidence, rule).map(item => item.status), ['PASSED', 'FAILED']);
});

test('uploaded PMA evidence enters review then renews the correct asset action history', async () => {
  const asset = await assetStore.createAsset({ id: crypto.randomUUID(), entityId: 'entity-pma-test', name: 'Crane A', registrationNumber: `CRANE-${crypto.randomUUID()}`, category: 'HEAVY_MACHINERY', brand: '', model: '', year: 2025, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: 'Site A', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] } }, 'Test Admin');
  const app = express(); app.use(express.json({ limit: '25mb' }));
  app.use((request, _response, next) => { (request as any).platformUser = { id: 'admin', name: 'Test Admin', email: 'admin@example.test', role: 'GROUP_ADMIN', entityIds: [] }; next(); });
  registerAssetDocumentRoutes(app);
  const server = await new Promise<Server>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const submit = await fetch(`${base}/api/asset-documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId: asset.entityId, recordId: asset.id, fileName: 'pma.txt', mimeType: 'text/plain', data: Buffer.from('PMA certificate for Crane A').toString('base64') }) });
    assert.equal(submit.status, 202);
    const job = await submit.json() as { id: string };
    let stage = '';
    for (let attempt = 0; attempt < 40; attempt += 1) { const result = await fetch(`${base}/api/asset-documents/jobs/${job.id}`); stage = (await result.json()).stage; if (stage === 'REVIEW_REQUIRED') break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(stage, 'REVIEW_REQUIRED');
    const accept = await fetch(`${base}/api/asset-documents/jobs/${job.id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordType: 'ASSET_ACTION', recordId: asset.id, fields: { registrationNumber: asset.registrationNumber, actionKind: 'PMA', certificateNumber: 'PMA-123', expiryDate: '2030-01-01' } }) });
    assert.equal(accept.status, 200);
    const updated = (await assetStore.asset(asset.id))!;
    assert.equal(updated.actions?.[0].kind, 'PMA');
    assert.equal(updated.actions?.[0].sourceFileId, job.id);
    assert.equal(updated.actions?.[0].certificateNumber, 'PMA-123');
    assert.equal((await fetch(`${base}/api/asset-documents/jobs/${job.id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordType: 'ASSET_ACTION', recordId: asset.id, fields: {} }) })).status, 409);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('published custom asset document is accepted from upload, satisfies a rule and retains replacement history', async () => {
  const entityId = 'entity-custom-evidence-test';
  const asset = await assetStore.createAsset({ id: crypto.randomUUID(), entityId, name: 'Forklift B', registrationNumber: `FORK-${crypto.randomUUID()}`, category: 'WAREHOUSE_EQUIPMENT', brand: '', model: '', year: 2025, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: 'Warehouse B', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] } }, 'Test Admin');
  await workflowStore.saveDraftDocument({ id: crypto.randomUUID(), module: 'ASSET', code: 'FORKLIFT_CERT', label: 'Forklift inspection certificate', fields: ['registrationNumber', 'certificateNumber', 'expiryDate'], categoryIds: ['WAREHOUSE_EQUIPMENT'], entityIds: [entityId], active: true });
  await workflowStore.saveDraftInstruction({ id: crypto.randomUUID(), module: 'ASSET', phase: 'VALIDATE', entityId, categoryId: 'WAREHOUSE_EQUIPMENT', prompt: 'Require current forklift evidence.', requiredDocumentTypes: ['FORKLIFT_CERT'], requiredFields: [], blocking: true, active: true });
  await workflowStore.publishModule('ASSET');
  const rule = (await workflowStore.resolve({ module: 'ASSET', phase: 'VALIDATE', entityId, categoryId: 'WAREHOUSE_EQUIPMENT' }))!;
  assert.equal(evaluateAssetRequirements(asset, rule)[0].status, 'FAILED');
  const app = express(); app.use(express.json({ limit: '25mb' }));
  app.use((request, _response, next) => { (request as any).platformUser = { id: 'admin', name: 'Test Admin', email: 'admin@example.test', role: 'GROUP_ADMIN', entityIds: [] }; next(); });
  registerAssetDocumentRoutes(app);
  const server = await new Promise<Server>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const types = await fetch(`${base}/api/asset-documents/types?entityId=${entityId}`);
    assert.equal((await types.json() as Array<{ code: string }>).some(item => item.code === 'FORKLIFT_CERT'), true);
    const accept = async (certificateNumber: string) => {
      const submit = await fetch(`${base}/api/asset-documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId, recordId: asset.id, fileName: `${certificateNumber}.txt`, mimeType: 'text/plain', data: Buffer.from(`Forklift inspection ${certificateNumber}`).toString('base64') }) });
      assert.equal(submit.status, 202);
      const job = await submit.json() as { id: string };
      for (let attempt = 0; attempt < 40; attempt += 1) { const result = await fetch(`${base}/api/asset-documents/jobs/${job.id}`); if ((await result.json() as { stage: string }).stage === 'REVIEW_REQUIRED') break; await new Promise(resolve => setTimeout(resolve, 20)); }
      const applied = await fetch(`${base}/api/asset-documents/jobs/${job.id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordType: 'CONFIGURED_DOCUMENT', recordId: asset.id, fields: { documentCode: 'FORKLIFT_CERT', registrationNumber: asset.registrationNumber, certificateNumber, expiryDate: '2030-01-01' } }) });
      assert.equal(applied.status, 200);
      return job.id;
    };
    const first = await accept('FL-001');
    assert.equal(evaluateAssetRequirements((await assetStore.asset(asset.id))!, rule)[0].status, 'PASSED');
    const second = await accept('FL-002');
    const updated = (await assetStore.asset(asset.id))!;
    assert.equal(updated.evidenceDocuments?.length, 2);
    assert.equal(updated.evidenceDocuments?.[0].sourceFileId, second);
    assert.equal(updated.evidenceDocuments?.[1].sourceFileId, first);
    assert.equal(updated.evidenceDocuments?.[1].supersededBy, updated.evidenceDocuments?.[0].id);
    assert.equal(evaluateAssetRequirements(updated, rule)[0].sourceFileId, second);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
