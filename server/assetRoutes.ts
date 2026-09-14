import crypto from 'node:crypto';
import type { Express } from 'express';
import type { Asset, Driver } from '../src/types.ts';
import { assetStore } from './assetStore.ts';
import { canReadEntity, canWriteEntity, currentUser } from './platformAuth.ts';
import { workflowStore } from './workflowStore.ts';
import { evaluateAssetRequirements } from './assetRequirements.ts';

const mask = (number: string) => number ? `••••${number.slice(-4)}` : '';
const safeDriver = (driver: Driver, executive: boolean) => executive ? { ...driver, licenseNumber: mask(driver.licenseNumber), phone: '' } : driver;
const safeAsset = (asset: Asset, executive: boolean) => executive ? {
  ...asset,
  assignedDrivers: asset.assignedDrivers.map(driver => safeDriver(driver, true)),
  allocationHistory: asset.allocationHistory?.map(record => ({ ...record, licenseNumber: mask(record.licenseNumber) })),
} : asset;
const error = (response: any, cause: unknown) => response.status(400).json({ error: cause instanceof Error ? cause.message : 'Request failed.' });

export function registerAssetRoutes(app: Express) {
  app.get('/api/assets', async (request, response) => {
    const user = currentUser(request)!;
    response.json((await assetStore.assets()).filter(asset => canReadEntity(user, asset.entityId)).map(asset => safeAsset(asset, user.role === 'EXECUTIVE')));
  });
  app.get('/api/assets/:id/requirements', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    const instruction = await workflowStore.resolve({ module: 'ASSET', phase: 'VALIDATE', entityId: asset.entityId, categoryId: asset.category });
    response.json({ ruleVersion: instruction?.version || null, results: evaluateAssetRequirements(asset, instruction) });
  });
  app.post('/api/assets', async (request, response) => {
    const user = currentUser(request)!;
    const entityId = String(request.body.entityId || '');
    if (!canWriteEntity(user, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if (!String(request.body.registrationNumber || '').trim()) return response.status(400).json({ error: 'Asset identifier required.' });
    try { response.status(201).json(await assetStore.createAsset(request.body as Asset & { entityId: string }, user.name)); }
    catch (cause) { error(response, cause); }
  });
  app.post('/api/assets/bulk', async (request, response) => {
    const user = currentUser(request)!;
    const items = Array.isArray(request.body.assets) ? request.body.assets as Array<Asset & { entityId: string }> : [];
    if (!items.length || items.length > 500) return response.status(400).json({ error: 'Choose between 1 and 500 assets.' });
    if (items.some(item => !canWriteEntity(user, item.entityId))) return response.status(403).json({ error: 'Entity access denied.' });
    try { const created = []; for (const item of items) created.push(await assetStore.createAsset(item, user.name)); response.status(201).json(created); }
    catch (cause) { error(response, cause); }
  });
  app.patch('/api/assets/:id', async (request, response) => {
    const user = currentUser(request)!;
    const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    if (!canWriteEntity(user, asset.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if ('assignedDrivers' in request.body || 'allocationHistory' in request.body || 'entityId' in request.body || 'actions' in request.body || 'evidenceDocuments' in request.body) return response.status(400).json({ error: 'Use the controlled assignment, evidence or action workflow; entity changes require an administrator migration.' });
    if (request.body.currentOperatingHours !== undefined && (!Number.isFinite(Number(request.body.currentOperatingHours)) || Number(request.body.currentOperatingHours) < 0)) return response.status(400).json({ error: 'Operating hours must be non-negative.' });
    try { response.json(await assetStore.updateAsset(asset.id, request.body, user.name)); }
    catch (cause) { error(response, cause); }
  });
  app.post('/api/assets/:id/actions', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    if (!canWriteEntity(user, asset.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    try { response.status(201).json(await assetStore.createAction(asset.id, request.body, user.name)); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create action.' }); }
  });
  app.patch('/api/assets/:id/actions/:actionId', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    if (!canWriteEntity(user, asset.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    try { response.json(await assetStore.updateAction(asset.id, request.params.actionId, request.body, user.name)); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update action.' }); }
  });
  app.post('/api/assets/:id/actions/:actionId/decision', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    if (!canWriteEntity(user, asset.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if (!['COMPLETED', 'WAIVED'].includes(request.body.decision)) return response.status(400).json({ error: 'Choose completed or waived.' });
    try { response.json(await assetStore.completeAction(asset.id, request.params.actionId, request.body.decision, String(request.body.note || ''), user.name, request.body.nextDueDate || undefined, request.body.nextDueHours === undefined || request.body.nextDueHours === '' ? undefined : Number(request.body.nextDueHours))); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to complete action.' }); }
  });
  app.get('/api/assets/:id/events', async (request, response) => {
    const user = currentUser(request)!;
    const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    response.json(await assetStore.events(asset.id));
  });
  app.get('/api/drivers', async (request, response) => {
    const user = currentUser(request)!;
    response.json((await assetStore.drivers()).filter(driver => canReadEntity(user, driver.entityId)).map(driver => safeDriver(driver, user.role === 'EXECUTIVE')));
  });
  app.post('/api/drivers', async (request, response) => {
    const user = currentUser(request)!;
    const entityId = String(request.body.entityId || '');
    if (!canWriteEntity(user, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    if (!String(request.body.name || '').trim()) return response.status(400).json({ error: 'Driver name required.' });
    try { response.status(201).json(await assetStore.saveDriver({ ...request.body, id: crypto.randomUUID(), entityId } as Driver & { entityId: string }, user.name)); }
    catch (cause) { error(response, cause); }
  });
  app.patch('/api/drivers/:id', async (request, response) => {
    const user = currentUser(request)!;
    const existing = await assetStore.driver(request.params.id);
    if (!existing || !canReadEntity(user, existing.entityId)) return response.status(404).json({ error: 'Driver not found.' });
    if (!canWriteEntity(user, existing.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    try { response.json(await assetStore.saveDriver({ ...existing, ...request.body, id: existing.id, entityId: existing.entityId }, user.name)); }
    catch (cause) { error(response, cause); }
  });
  app.post('/api/assets/:id/assign-driver', async (request, response) => {
    const user = currentUser(request)!;
    const asset = await assetStore.asset(request.params.id);
    if (!asset || !canReadEntity(user, asset.entityId)) return response.status(404).json({ error: 'Asset not found.' });
    if (!canWriteEntity(user, asset.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    try { response.json(await assetStore.assignDriver(asset.id, String(request.body.driverId || ''), String(request.body.effectiveDate || ''), String(request.body.reason || ''), user.name)); }
    catch (cause) { error(response, cause); }
  });
}
