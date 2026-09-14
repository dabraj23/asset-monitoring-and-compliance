import type { Asset } from '../types';
import { computeAssetStatus } from '../utils/compliance';

export interface AssetRepository {
  list(): Promise<Asset[]>;
  create(asset: Asset): Promise<Asset>;
  createMany(assets: Asset[]): Promise<Asset[]>;
  update(id: string, updates: Partial<Asset>): Promise<Asset>;
}

const parse = async <T,>(response: Response): Promise<T> => {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Asset request failed.');
  return result as T;
};
const normalize = (asset: Asset): Asset => ({ ...asset, assignedDrivers: asset.assignedDrivers || [], allocationHistory: asset.allocationHistory || [], claims: asset.claims || [], computedStatus: computeAssetStatus(asset) });
class ServerAssetRepository implements AssetRepository {
  async list() { return (await parse<Asset[]>(await fetch('/api/assets'))).map(normalize); }
  async create(asset: Asset) { return normalize(await parse<Asset>(await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asset) }))); }
  async createMany(assets: Asset[]) { return (await parse<Asset[]>(await fetch('/api/assets/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assets }) }))).map(normalize); }
  async update(id: string, updates: Partial<Asset>) { return normalize(await parse<Asset>(await fetch(`/api/assets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }))); }
}
export const assetRepository: AssetRepository = new ServerAssetRepository();
export const readLegacyBrowserAssets = (): Asset[] => { try { const value = JSON.parse(localStorage.getItem('asset-monitor.assets.v1') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
