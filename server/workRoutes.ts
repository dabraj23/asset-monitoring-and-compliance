import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { contractStore } from './contractStore.ts';
import { paymentStatus } from './contractEngine.ts';
import { vendorStore } from './vendorStore.ts';
import { assetStore } from './assetStore.ts';
import { assetActionStatus } from './assetActions.ts';
import { syncVendorAgreementStatus } from './vendorRoutes.ts';
import { canReadEntity, currentUser, requireGroupAdmin } from './platformAuth.ts';

interface Evidence { id: string; contractId?: string; obligationId?: string; paymentId?: string; vendorId?: string; followUpId?: string; assetId?: string; actionId?: string; entityId: string; fileName: string; mimeType: string; size: number; uploadedBy: string; uploadedAt: string }
interface Mail { id: string; key: string; to: string; subject: string; body: string; status: 'QUEUED'; createdAt: string; entityId: string; recordId: string }
interface State { evidence: Evidence[]; outbox: Mail[] }
const root = path.join(process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform'), 'work');
const stateFile = path.join(root, 'state.json');
const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
let queue: Promise<unknown> = Promise.resolve();
const readState = async (): Promise<State> => { await fs.mkdir(root, { recursive: true }); try { const state = JSON.parse(await fs.readFile(stateFile, 'utf8')); return { evidence: state.evidence || [], outbox: state.outbox || [] }; } catch (error: any) { if (error?.code !== 'ENOENT') throw error; return { evidence: [], outbox: [] }; } };
const writeState = async <T>(operation: (state: State) => T): Promise<T> => {
  const pending = queue.then(async () => { const state = await readState(); const result = operation(state); const temp = `${stateFile}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 }); await fs.rename(temp, stateFile); return result; });
  queue = pending.catch(() => undefined); return pending;
};
const owns = (user: NonNullable<ReturnType<typeof currentUser>>, obligation: { ownerEmail: string; monitoringOwnerEmail: string; entityId: string }) => canReadEntity(user, obligation.entityId) && (user.role === 'GROUP_ADMIN' || user.role === 'ENTITY_ADMIN' || [obligation.ownerEmail, obligation.monitoringOwnerEmail].some(email => email.toLowerCase() === user.email));
const ownsPayment = (user: NonNullable<ReturnType<typeof currentUser>>, payment: { ownerEmail: string; entityId: string }) => canReadEntity(user, payment.entityId) && (user.role === 'GROUP_ADMIN' || user.role === 'ENTITY_ADMIN' || payment.ownerEmail.toLowerCase() === user.email);
const ownsVendor = (user: NonNullable<ReturnType<typeof currentUser>>, vendor: { entityId?: string }, followUp: { owner: string }) =>
  canReadEntity(user, vendor.entityId || '') && (user.role === 'GROUP_ADMIN' || user.role === 'ENTITY_ADMIN' || followUp.owner.toLowerCase() === user.email);
const ownsAsset = (user: NonNullable<ReturnType<typeof currentUser>>, asset: { entityId?: string }, action: { ownerEmail: string }) =>
  canReadEntity(user, asset.entityId || '') && (user.role === 'GROUP_ADMIN' || user.role === 'ENTITY_ADMIN' || !!action.ownerEmail && action.ownerEmail.toLowerCase() === user.email);
const active = (status: string) => !['COMPLETED', 'WAIVED', 'DRAFT', 'WAITING'].includes(status);

export const generateReminderOutbox = async () => {
  await syncVendorAgreementStatus();
  const today = new Date().toISOString().slice(0, 10);
  const planned: Mail[] = [];
  for (const contract of await contractStore.contracts()) {
    for (const payment of contract.paymentMilestones || []) {
      if (!payment.ownerEmail || ['WAIVED'].includes(payment.status) || payment.status === 'SETTLED' && payment.reconciliationStatus === 'RECONCILED') continue;
      const days = Math.round((Date.parse(`${payment.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
      if (payment.status !== 'SETTLED' && !(days < 0 || [90, 60, 30, 14, 7, 0].includes(days))) continue;
      planned.push({ id: crypto.randomUUID(), key: `payment:${payment.id}:${today}`, to: payment.ownerEmail, subject: payment.status === 'SETTLED' ? `Reconciliation pending: ${payment.title}` : `${days < 0 ? 'Overdue' : 'Upcoming'} payment: ${payment.title}`, body: `${contract.title}\n${payment.direction} ${payment.currency} ${payment.amount}\nDue: ${payment.dueDate}\nOpen My Work to update evidence.`, status: 'QUEUED', createdAt: new Date().toISOString(), entityId: payment.entityId, recordId: contract.id });
    }
    for (const obligation of contract.obligations) {
    const due = obligation.nextDueDate || obligation.dueDate;
    if (!due || !obligation.ownerEmail || !active(obligation.status)) continue;
    const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (!(days < 0 || [90, 60, 30, 14, 7, 0].includes(days))) continue;
    planned.push({ id: crypto.randomUUID(), key: `contract:${obligation.id}:${today}`, to: obligation.ownerEmail, subject: `${days < 0 ? 'Overdue' : 'Upcoming'}: ${obligation.title}`, body: `${contract.title}\nDue: ${due}\nOpen your My Work page to update progress or attach evidence.`, status: 'QUEUED', createdAt: new Date().toISOString(), entityId: obligation.entityId, recordId: contract.id });
    }
  }
  for (const vendor of await vendorStore.vendors()) for (const followUp of vendor.followUps) {
    if (followUp.status === 'COMPLETED' || !followUp.owner.includes('@')) continue;
    const days = Math.round((Date.parse(`${followUp.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (!(days < 0 || [90, 60, 30, 14, 7, 0].includes(days))) continue;
    planned.push({ id: crypto.randomUUID(), key: `vendor:${followUp.id}:${today}`, to: followUp.owner, subject: `${days < 0 ? 'Overdue' : 'Upcoming'}: ${followUp.title}`, body: `${vendor.legalName}\nDue: ${followUp.dueDate}\nOpen your My Work page to follow up.`, status: 'QUEUED', createdAt: new Date().toISOString(), entityId: vendor.entityId || '', recordId: vendor.id });
  }
  for (const asset of await assetStore.assets()) for (const action of asset.actions || []) {
    if (action.status !== 'OPEN' || !action.ownerEmail) continue;
    const due = action.dueDate;
    const days = due ? Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : undefined;
    if (!(days !== undefined && (days < 0 || [90, 60, 30, 14, 7, 0].includes(days)) || action.dueHours !== undefined && assetActionStatus(asset, action, today) !== 'OPEN')) continue;
    planned.push({ id: crypto.randomUUID(), key: `asset:${action.id}:${today}`, to: action.ownerEmail, subject: `${days !== undefined && days < 0 ? 'Overdue' : 'Upcoming'}: ${action.title}`, body: `${asset.name}\nDue: ${due || `${action.dueHours} operating hours`}\nOpen My Work to report progress.`, status: 'QUEUED', createdAt: new Date().toISOString(), entityId: asset.entityId, recordId: asset.id });
  }
  return writeState(state => { const keys = new Set(state.outbox.map(item => item.key)); for (const item of planned) if (!keys.has(item.key)) { state.outbox.push(item); keys.add(item.key); } return planned.length; });
};

export function registerWorkRoutes(app: Express) {
  app.get('/api/my-work', async (request, response) => {
    await syncVendorAgreementStatus();
    const user = currentUser(request)!;
    const contracts = await contractStore.contracts();
    const vendors = await vendorStore.vendors();
    const assets = await assetStore.assets();
    const tasks = [
      ...contracts.flatMap(contract => contract.obligations.filter(obligation => owns(user, obligation)).map(obligation => ({ type: 'CONTRACT', id: obligation.id, recordId: contract.id, recordName: contract.title, entityId: obligation.entityId, title: obligation.title, dueDate: obligation.nextDueDate || obligation.dueDate, status: obligation.status, progressNote: obligation.progressNote || '', evidenceFileIds: obligation.evidenceFileIds || [], ownerEmail: obligation.ownerEmail, actionKind: obligation.actionKind }))),
      ...contracts.flatMap(contract => (contract.paymentMilestones || []).filter(payment => ownsPayment(user, payment)).map(payment => ({ type: 'PAYMENT', id: payment.id, recordId: contract.id, recordName: contract.title, entityId: payment.entityId, title: `${payment.title} · ${payment.direction} ${payment.currency} ${payment.amount}`, dueDate: payment.dueDate, status: payment.status === 'SETTLED' ? payment.reconciliationStatus === 'RECONCILED' ? 'RECONCILED' : 'RECONCILIATION_PENDING' : paymentStatus(payment), progressNote: payment.progressNote || '', evidenceFileIds: payment.evidenceFileIds || [], ownerEmail: payment.ownerEmail, actionKind: 'STANDARD' }))),
      ...vendors.filter(vendor => canReadEntity(user, vendor.entityId || '')).flatMap(vendor => vendor.followUps.filter(item => ownsVendor(user, vendor, item)).map(item => ({ type: 'VENDOR', id: item.id, recordId: vendor.id, recordName: vendor.legalName, entityId: vendor.entityId, title: item.title, dueDate: item.dueDate, status: item.status, progressNote: item.progressNote || '', evidenceFileIds: item.evidenceFileIds || [], ownerEmail: item.owner, actionKind: 'STANDARD' }))),
      ...assets.filter(asset => canReadEntity(user, asset.entityId)).flatMap(asset => (asset.actions || []).filter(item => ownsAsset(user, asset, item)).map(item => ({ type: 'ASSET', id: item.id, recordId: asset.id, recordName: asset.name, entityId: asset.entityId, title: item.title, dueDate: item.dueDate, dueHours: item.dueHours, status: assetActionStatus(asset, item), progressNote: item.progressNote || '', evidenceFileIds: item.evidenceFileIds || [], ownerEmail: item.ownerEmail, actionKind: item.kind }))),
    ];
    response.json(tasks.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))));
  });
  app.post('/api/my-work/assets/:assetId/actions/:actionId/progress', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.assetId);
    const action = asset?.actions?.find(item => item.id === request.params.actionId);
    if (!asset || !action || !ownsAsset(user, asset, action)) return response.status(404).json({ error: 'Task not found.' });
    action.progressNote = String(request.body.note || '').trim().slice(0, 4000); action.progressActor = user.name; action.progressUpdatedAt = new Date().toISOString();
    response.json(await assetStore.updateAsset(asset.id, { actions: asset.actions }, user.name));
  });
  app.post('/api/my-work/assets/:assetId/actions/:actionId/evidence', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.assetId);
    const action = asset?.actions?.find(item => item.id === request.params.actionId);
    if (!asset || !action || !ownsAsset(user, asset, action)) return response.status(404).json({ error: 'Task not found.' });
    const mimeType = String(request.body.mimeType || ''); const fileName = path.basename(String(request.body.fileName || 'evidence'));
    const data = Buffer.from(String(request.body.data || ''), 'base64');
    if (!allowed.has(mimeType) || !data.length || data.length > 10 * 1024 * 1024) return response.status(400).json({ error: 'Upload a PDF, Word, image or text file up to 10 MB.' });
    const id = crypto.randomUUID(); await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, id), data, { flag: 'wx', mode: 0o600 });
    const evidence: Evidence = { id, assetId: asset.id, actionId: action.id, entityId: asset.entityId, fileName, mimeType, size: data.length, uploadedBy: user.name, uploadedAt: new Date().toISOString() };
    await writeState(state => { state.evidence.push(evidence); });
    action.evidenceFileIds = [...(action.evidenceFileIds || []), id];
    await assetStore.updateAsset(asset.id, { actions: asset.actions }, user.name);
    response.status(201).json(evidence);
  });
  app.post('/api/my-work/assets/:assetId/actions/:actionId/complete', async (request, response) => {
    const user = currentUser(request)!; const asset = await assetStore.asset(request.params.assetId);
    const action = asset?.actions?.find(item => item.id === request.params.actionId);
    if (!asset || !action || !ownsAsset(user, asset, action)) return response.status(404).json({ error: 'Task not found.' });
    try { response.json(await assetStore.completeAction(asset.id, action.id, 'COMPLETED', String(request.body.note || ''), user.name, request.body.nextDueDate || undefined, request.body.nextDueHours === undefined || request.body.nextDueHours === '' ? undefined : Number(request.body.nextDueHours))); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to complete asset action.' }); }
  });
  app.post('/api/my-work/contracts/:contractId/payments/:paymentId/progress', async (request, response) => {
    const user = currentUser(request)!; const contract = await contractStore.contract(request.params.contractId);
    const payment = contract?.paymentMilestones?.find(item => item.id === request.params.paymentId);
    if (!contract || !payment || !ownsPayment(user, payment)) return response.status(404).json({ error: 'Task not found.' });
    payment.progressNote = String(request.body.note || '').trim().slice(0, 4000);
    payment.progressActor = user.name; payment.progressUpdatedAt = new Date().toISOString();
    contract.auditTrail.unshift({ id: crypto.randomUUID(), type: 'PAYMENT_PROGRESS', actor: user.name, summary: `${payment.title}: progress updated`, createdAt: payment.progressUpdatedAt });
    response.json(await contractStore.saveContract(contract));
  });
  app.post('/api/my-work/contracts/:contractId/payments/:paymentId/evidence', async (request, response) => {
    const user = currentUser(request)!; const contract = await contractStore.contract(request.params.contractId);
    const payment = contract?.paymentMilestones?.find(item => item.id === request.params.paymentId);
    if (!contract || !payment || !ownsPayment(user, payment)) return response.status(404).json({ error: 'Task not found.' });
    const mimeType = String(request.body.mimeType || ''); const fileName = path.basename(String(request.body.fileName || 'evidence'));
    const data = Buffer.from(String(request.body.data || ''), 'base64');
    if (!allowed.has(mimeType) || !data.length || data.length > 10 * 1024 * 1024) return response.status(400).json({ error: 'Upload a PDF, Word, image or text file up to 10 MB.' });
    const id = crypto.randomUUID(); await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, id), data, { flag: 'wx', mode: 0o600 });
    const evidence: Evidence = { id, contractId: contract.id, paymentId: payment.id, entityId: payment.entityId, fileName, mimeType, size: data.length, uploadedBy: user.name, uploadedAt: new Date().toISOString() };
    await writeState(state => { state.evidence.push(evidence); });
    payment.evidenceFileIds = [...(payment.evidenceFileIds || []), id];
    contract.auditTrail.unshift({ id: crypto.randomUUID(), type: 'PAYMENT_EVIDENCE', actor: user.name, summary: `${fileName} attached to ${payment.title}`, createdAt: evidence.uploadedAt });
    await contractStore.saveContract(contract); response.status(201).json(evidence);
  });
  app.post('/api/my-work/contracts/:contractId/payments/:paymentId/settle', async (request, response) => {
    const user = currentUser(request)!; const contract = await contractStore.contract(request.params.contractId);
    const payment = contract?.paymentMilestones?.find(item => item.id === request.params.paymentId);
    if (!contract || !payment || !ownsPayment(user, payment)) return response.status(404).json({ error: 'Task not found.' });
    if (['SETTLED', 'WAIVED'].includes(payment.status)) return response.status(409).json({ error: 'A payment decision was already recorded.' });
    const note = String(request.body.note || '').trim();
    if (!note && !payment.evidenceFileIds?.length) return response.status(400).json({ error: 'Add settlement evidence or a note before marking settled.' });
    payment.status = 'SETTLED'; payment.settlementEvidence = note || `Evidence files: ${payment.evidenceFileIds!.join(', ')}`;
    payment.settledAt = new Date().toISOString(); payment.updatedAt = payment.settledAt; payment.reconciliationStatus = 'PENDING';
    contract.auditTrail.unshift({ id: crypto.randomUUID(), type: 'PAYMENT_SETTLED', actor: user.name, summary: `${payment.title} marked settled by owner; manual reconciliation pending.`, createdAt: payment.settledAt });
    response.json(await contractStore.saveContract(contract));
  });
  app.post('/api/my-work/contracts/:contractId/obligations/:obligationId/progress', async (request, response) => {
    const user = currentUser(request)!;
    const contract = await contractStore.contract(request.params.contractId);
    const obligation = contract?.obligations.find(item => item.id === request.params.obligationId);
    if (!contract || !obligation || !owns(user, obligation)) return response.status(404).json({ error: 'Task not found.' });
    obligation.progressNote = String(request.body.note || '').trim().slice(0, 4000);
    obligation.progressActor = user.name;
    obligation.progressUpdatedAt = new Date().toISOString();
    contract.auditTrail.unshift({ id: crypto.randomUUID(), type: 'OBLIGATION_PROGRESS', actor: user.name, summary: `${obligation.title}: progress updated`, createdAt: obligation.progressUpdatedAt });
    response.json(await contractStore.saveContract(contract));
  });
  app.post('/api/my-work/contracts/:contractId/obligations/:obligationId/evidence', async (request, response) => {
    const user = currentUser(request)!;
    const contract = await contractStore.contract(request.params.contractId);
    const obligation = contract?.obligations.find(item => item.id === request.params.obligationId);
    if (!contract || !obligation || !owns(user, obligation)) return response.status(404).json({ error: 'Task not found.' });
    const mimeType = String(request.body.mimeType || '');
    const fileName = path.basename(String(request.body.fileName || 'evidence'));
    const data = Buffer.from(String(request.body.data || ''), 'base64');
    if (!allowed.has(mimeType) || !data.length || data.length > 10 * 1024 * 1024) return response.status(400).json({ error: 'Upload a PDF, Word, image or text file up to 10 MB.' });
    const id = crypto.randomUUID();
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, id), data, { flag: 'wx', mode: 0o600 });
    const evidence: Evidence = { id, contractId: contract.id, obligationId: obligation.id, entityId: obligation.entityId, fileName, mimeType, size: data.length, uploadedBy: user.name, uploadedAt: new Date().toISOString() };
    await writeState(state => { state.evidence.push(evidence); });
    obligation.evidenceFileIds = [...(obligation.evidenceFileIds || []), id];
    contract.auditTrail.unshift({ id: crypto.randomUUID(), type: 'OBLIGATION_EVIDENCE', actor: user.name, summary: `${fileName} attached to ${obligation.title}`, createdAt: evidence.uploadedAt });
    await contractStore.saveContract(contract);
    response.status(201).json(evidence);
  });
  app.post('/api/my-work/vendors/:vendorId/follow-ups/:followUpId/progress', async (request, response) => {
    const user = currentUser(request)!;
    const vendor = await vendorStore.vendor(request.params.vendorId);
    const followUp = vendor?.followUps.find(item => item.id === request.params.followUpId);
    if (!vendor || !followUp || !ownsVendor(user, vendor, followUp)) return response.status(404).json({ error: 'Task not found.' });
    followUp.progressNote = String(request.body.note || '').trim().slice(0, 4000);
    followUp.progressActor = user.name;
    followUp.progressUpdatedAt = new Date().toISOString();
    vendor.auditTrail.unshift({ id: crypto.randomUUID(), type: 'VENDOR_FOLLOW_UP_PROGRESS', actor: user.name, summary: `${followUp.title}: progress updated`, createdAt: followUp.progressUpdatedAt });
    response.json(await vendorStore.saveVendor(vendor));
  });
  app.post('/api/my-work/vendors/:vendorId/follow-ups/:followUpId/evidence', async (request, response) => {
    const user = currentUser(request)!;
    const vendor = await vendorStore.vendor(request.params.vendorId);
    const followUp = vendor?.followUps.find(item => item.id === request.params.followUpId);
    if (!vendor || !followUp || !ownsVendor(user, vendor, followUp)) return response.status(404).json({ error: 'Task not found.' });
    const mimeType = String(request.body.mimeType || '');
    const fileName = path.basename(String(request.body.fileName || 'evidence'));
    const data = Buffer.from(String(request.body.data || ''), 'base64');
    if (!allowed.has(mimeType) || !data.length || data.length > 10 * 1024 * 1024) return response.status(400).json({ error: 'Upload a PDF, Word, image or text file up to 10 MB.' });
    const id = crypto.randomUUID();
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, id), data, { flag: 'wx', mode: 0o600 });
    const evidence: Evidence = { id, vendorId: vendor.id, followUpId: followUp.id, entityId: vendor.entityId || '', fileName, mimeType, size: data.length, uploadedBy: user.name, uploadedAt: new Date().toISOString() };
    await writeState(state => { state.evidence.push(evidence); });
    followUp.evidenceFileIds = [...(followUp.evidenceFileIds || []), id];
    vendor.auditTrail.unshift({ id: crypto.randomUUID(), type: 'VENDOR_FOLLOW_UP_EVIDENCE', actor: user.name, summary: `${fileName} attached to ${followUp.title}`, createdAt: evidence.uploadedAt });
    await vendorStore.saveVendor(vendor);
    response.status(201).json(evidence);
  });
  app.get('/api/my-work/evidence/:id', async (request, response) => {
    const evidence = (await readState()).evidence.find(item => item.id === request.params.id);
    if (!evidence) return response.status(404).json({ error: 'Evidence not found.' });
    if (evidence.assetId) {
      const asset = await assetStore.asset(evidence.assetId);
      const action = asset?.actions?.find(item => item.id === evidence.actionId && item.evidenceFileIds?.includes(evidence.id));
      if (!asset || !action || !ownsAsset(currentUser(request)!, asset, action)) return response.status(404).json({ error: 'Evidence not found.' });
    } else if (evidence.vendorId) {
      const vendor = await vendorStore.vendor(evidence.vendorId);
      const followUp = vendor?.followUps.find(item => item.id === evidence.followUpId && item.evidenceFileIds?.includes(evidence.id));
      if (!vendor || !followUp || !ownsVendor(currentUser(request)!, vendor, followUp)) return response.status(404).json({ error: 'Evidence not found.' });
    } else if (evidence.paymentId) {
      const contract = await contractStore.contract(evidence.contractId || '');
      const payment = contract?.paymentMilestones?.find(item => item.id === evidence.paymentId && item.evidenceFileIds?.includes(evidence.id));
      if (!contract || !payment || !ownsPayment(currentUser(request)!, payment)) return response.status(404).json({ error: 'Evidence not found.' });
    } else {
      const contract = await contractStore.contract(evidence.contractId || '');
      const obligation = contract?.obligations.find(item => item.id === evidence.obligationId && item.evidenceFileIds?.includes(evidence.id));
      if (!contract || !obligation || !owns(currentUser(request)!, obligation)) return response.status(404).json({ error: 'Evidence not found.' });
    }
    response.type(evidence.mimeType).setHeader('Content-Disposition', `attachment; filename="${evidence.fileName.replace(/["\r\n]/g, '')}"`).send(await fs.readFile(path.join(root, evidence.id)));
  });
  app.get('/api/work-outbox', requireGroupAdmin, async (_request, response) => { await generateReminderOutbox(); response.json((await readState()).outbox); });
}
