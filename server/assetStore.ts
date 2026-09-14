import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Asset, AssetAction, Driver } from '../src/types.ts';
import { validateAssetAction } from './assetActions.ts';

export interface AssetEvent { id: string; assetId: string; entityId: string; type: string; description: string; actor: string; at: string; sourceFile?: string }
export interface StoredAsset extends Asset { entityId: string; updatedAt: string }
export interface StoredDriver extends Driver { entityId: string; updatedAt: string }
type State = { assets: StoredAsset[]; drivers: StoredDriver[]; events: AssetEvent[] };
const root = process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform');
const file = path.join(root, 'assets.json');

class AssetStore {
  private state: State | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  async init() {
    if (this.state) return;
    await fs.mkdir(root, { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(file, 'utf8')) as State; }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error; this.state = { assets: [], drivers: [], events: [] }; }
    this.state.assets ||= []; this.state.drivers ||= []; this.state.events ||= [];
  }
  private async mutate<T>(operation: (state: State) => T): Promise<T> {
    await this.init();
    const pending = this.queue.then(async () => {
      const result = operation(this.state!);
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
      await fs.rename(temp, file);
      return structuredClone(result);
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  async assets() { await this.init(); return structuredClone(this.state!.assets); }
  async asset(id: string) { return (await this.assets()).find(item => item.id === id); }
  async drivers() { await this.init(); return structuredClone(this.state!.drivers); }
  async driver(id: string) { return (await this.drivers()).find(item => item.id === id); }
  async events(assetId?: string) { await this.init(); return structuredClone(this.state!.events.filter(item => !assetId || item.assetId === assetId)); }
  async createAsset(input: Asset & { entityId: string }, actor: string) {
    return this.mutate(state => {
      if (state.assets.some(item => item.entityId === input.entityId && item.registrationNumber.toLowerCase() === input.registrationNumber.toLowerCase())) throw new Error('Asset identifier already exists in this entity.');
      const asset: StoredAsset = { ...input, actions: input.actions || [], evidenceDocuments: input.evidenceDocuments || [], id: input.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
      for (const driver of asset.assignedDrivers || []) {
        if (state.drivers.some(item => item.id === driver.id && item.entityId !== asset.entityId)) throw new Error('Driver identity belongs to another entity.');
        if (!state.drivers.some(item => item.id === driver.id)) state.drivers.push({ ...driver, entityId: asset.entityId, updatedAt: asset.updatedAt });
      }
      state.assets.push(asset);
      state.events.unshift({ id: crypto.randomUUID(), assetId: asset.id, entityId: asset.entityId, type: 'CREATED', description: `Asset ${asset.registrationNumber} created`, actor, at: asset.updatedAt });
      return asset;
    });
  }
  async updateAsset(id: string, updates: Partial<Asset>, actor: string) {
    return this.mutate(state => {
      const index = state.assets.findIndex(item => item.id === id);
      if (index < 0) throw new Error('Asset not found.');
      const before = state.assets[index];
      const asset: StoredAsset = { ...before, ...updates, id: before.id, entityId: before.entityId, updatedAt: new Date().toISOString() };
      state.assets[index] = asset;
      state.events.unshift({ id: crypto.randomUUID(), assetId: id, entityId: asset.entityId, type: 'UPDATED', description: `Updated ${Object.keys(updates).join(', ')}`, actor, at: asset.updatedAt });
      return asset;
    });
  }
  async saveDriver(input: Driver & { entityId: string }, actor: string) {
    return this.mutate(state => {
      const index = state.drivers.findIndex(item => item.id === input.id);
      const driver: StoredDriver = { ...input, updatedAt: new Date().toISOString() };
      if (index < 0) state.drivers.push(driver); else state.drivers[index] = driver;
      state.events.unshift({ id: crypto.randomUUID(), assetId: '', entityId: driver.entityId, type: index < 0 ? 'DRIVER_CREATED' : 'DRIVER_UPDATED', description: `Driver ${driver.name} ${index < 0 ? 'created' : 'updated'}`, actor, at: driver.updatedAt });
      return driver;
    });
  }
  async assignDriver(assetId: string, driverId: string, date: string, reason: string, actor: string) {
    return this.mutate(state => {
      const asset = state.assets.find(item => item.id === assetId);
      const driver = state.drivers.find(item => item.id === driverId);
      if (!asset || !driver || asset.entityId !== driver.entityId) throw new Error('Asset and driver must belong to the same entity.');
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A valid assignment date is required.');
      if (driver.status !== 'ACTIVE' || (driver.licenseExpiry && driver.licenseExpiry < date)) throw new Error('Driver licence is expired or driver is inactive.');
      for (const other of state.assets) {
        if (other.id !== asset.id && other.assignedDrivers.some(item => item.id === driver.id)) throw new Error('Driver is already assigned to another vehicle.');
      }
      asset.allocationHistory = (asset.allocationHistory || []).map(record => record.status === 'ACTIVE' ? { ...record, assignedTo: date, status: 'ENDED' } : record);
      asset.allocationHistory.unshift({ id: crypto.randomUUID(), driverId: driver.id, driverName: driver.name, licenseNumber: driver.licenseNumber, assignedFrom: date, reason, status: 'ACTIVE' });
      asset.assignedDrivers = [driver]; asset.updatedAt = new Date().toISOString();
      state.events.unshift({ id: crypto.randomUUID(), assetId, entityId: asset.entityId, type: 'DRIVER_ASSIGNED', description: `${driver.name} assigned from ${date}`, actor, at: asset.updatedAt });
      return asset;
    });
  }

  async createAction(assetId: string, input: Partial<AssetAction>, actor: string, renewPrior = false) {
    validateAssetAction(input);
    return this.mutate(state => {
      const asset = state.assets.find(item => item.id === assetId);
      if (!asset) throw new Error('Asset not found.');
      asset.actions ||= [];
      if (input.sourceFileId && asset.actions.some(item => item.sourceFileId === input.sourceFileId)) throw new Error('This document already created an asset action.');
      const timestamp = new Date().toISOString();
      const prior = renewPrior ? asset.actions.find(item => item.kind === input.kind && item.status === 'OPEN') : undefined;
      if (prior) { prior.status = 'COMPLETED'; prior.completedAt = timestamp; prior.completionNote = 'Renewed by accepted document evidence.'; prior.updatedAt = timestamp; }
      const action: AssetAction = { id: crypto.randomUUID(), kind: input.kind!, title: String(input.title).trim(), description: String(input.description || ''), dueDate: input.dueDate || undefined, dueHours: input.dueHours, amount: input.amount, certificateNumber: input.certificateNumber, ownerName: String(input.ownerName || asset.picName || ''), ownerEmail: String(input.ownerEmail || asset.picEmail || ''), status: 'OPEN', predecessorId: prior?.id, sourceFileId: input.sourceFileId, createdAt: timestamp, updatedAt: timestamp };
      asset.actions.unshift(action); asset.updatedAt = timestamp;
      state.events.unshift({ id: crypto.randomUUID(), assetId, entityId: asset.entityId, type: prior ? 'ACTION_RENEWED' : 'ACTION_CREATED', description: `${action.kind}: ${action.title}${prior ? ' (prior event closed)' : ''}`, actor, at: timestamp, sourceFile: input.sourceFileId });
      return asset;
    });
  }
  async updateAction(assetId: string, actionId: string, input: Partial<AssetAction>, actor: string) {
    return this.mutate(state => {
      const asset = state.assets.find(item => item.id === assetId);
      const action = asset?.actions?.find(item => item.id === actionId);
      if (!asset || !action) throw new Error('Asset action not found.');
      if (action.status !== 'OPEN') throw new Error('Completed actions cannot be changed. Create a successor instead.');
      const updated = { ...action };
      for (const key of ['kind', 'title', 'description', 'dueDate', 'dueHours', 'amount', 'certificateNumber', 'ownerName', 'ownerEmail'] as const) if (input[key] !== undefined) (updated as any)[key] = input[key];
      validateAssetAction(updated);
      Object.assign(action, updated, { updatedAt: new Date().toISOString() }); asset.updatedAt = action.updatedAt;
      state.events.unshift({ id: crypto.randomUUID(), assetId, entityId: asset.entityId, type: 'ACTION_UPDATED', description: `${action.kind}: ${action.title} updated`, actor, at: action.updatedAt });
      return asset;
    });
  }
  async completeAction(assetId: string, actionId: string, decision: 'COMPLETED' | 'WAIVED', note: string, actor: string, nextDueDate?: string, nextDueHours?: number) {
    if (!note.trim()) throw new Error('Completion evidence or waiver rationale is required.');
    if (nextDueDate || nextDueHours !== undefined) validateAssetAction({ kind: 'MAINTENANCE', title: 'Next cycle', dueDate: nextDueDate, dueHours: nextDueHours });
    return this.mutate(state => {
      const asset = state.assets.find(item => item.id === assetId);
      const action = asset?.actions?.find(item => item.id === actionId);
      if (!asset || !action) throw new Error('Asset action not found.');
      if (action.status !== 'OPEN') throw new Error('This asset action is already closed.');
      if (decision === 'WAIVED' && (nextDueDate || nextDueHours !== undefined)) throw new Error('A waived action cannot schedule a successor.');
      const timestamp = new Date().toISOString();
      action.status = decision; action.completionNote = note.trim(); action.completedAt = timestamp; action.updatedAt = timestamp;
      if (decision === 'COMPLETED' && (nextDueDate || nextDueHours !== undefined)) asset.actions!.unshift({ ...action, id: crypto.randomUUID(), predecessorId: action.id, dueDate: nextDueDate, dueHours: nextDueHours, status: 'OPEN', completionNote: undefined, completedAt: undefined, evidenceFileIds: [], sourceFileId: undefined, createdAt: timestamp, updatedAt: timestamp });
      asset.updatedAt = timestamp;
      state.events.unshift({ id: crypto.randomUUID(), assetId, entityId: asset.entityId, type: `ACTION_${decision}`, description: `${action.kind}: ${action.title} ${decision.toLowerCase()}${nextDueDate || nextDueHours !== undefined ? '; next cycle created' : ''}`, actor, at: timestamp });
      return asset;
    });
  }
}
export const assetStore = new AssetStore();
