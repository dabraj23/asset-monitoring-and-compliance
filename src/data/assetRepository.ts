import { Asset } from '../types';
import { computeAssetStatus } from '../utils/compliance';

export interface AssetRepository {
  list(): Promise<Asset[]>;
  create(asset: Asset): Promise<Asset>;
  createMany(assets: Asset[]): Promise<Asset[]>;
  update(id: string, updates: Partial<Asset>): Promise<Asset>;
}

const STORAGE_KEY = 'asset-monitor.assets.v1';

const normalizeAsset = (asset: Asset): Asset => ({
  ...asset,
  assignedDrivers: asset.assignedDrivers || [],
  allocationHistory: asset.allocationHistory || [],
  claims: asset.claims || [],
  computedStatus: computeAssetStatus(asset),
});

const readAssets = (): Asset[] => {
  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(normalizeAsset) : [];
  } catch {
    return [];
  }
};

const writeAssets = (assets: Asset[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
};

const assertUniqueIdentifiers = (newAssets: Asset[], existingAssets: Asset[]) => {
  const identifiers = new Set(
    existingAssets.map(asset => asset.registrationNumber.trim().toLowerCase()),
  );

  for (const asset of newAssets) {
    const identifier = asset.registrationNumber.trim().toLowerCase();
    if (identifiers.has(identifier)) {
      throw new Error(`Asset identifier ${asset.registrationNumber} already exists`);
    }
    identifiers.add(identifier);
  }
};

class LocalAssetRepository implements AssetRepository {
  async list() {
    return readAssets();
  }

  async create(asset: Asset) {
    const existing = readAssets();
    assertUniqueIdentifiers([asset], existing);
    const normalized = normalizeAsset(asset);
    writeAssets([...existing, normalized]);
    return normalized;
  }

  async createMany(assets: Asset[]) {
    const existing = readAssets();
    assertUniqueIdentifiers(assets, existing);
    const normalized = assets.map(normalizeAsset);
    writeAssets([...existing, ...normalized]);
    return normalized;
  }

  async update(id: string, updates: Partial<Asset>) {
    const existing = readAssets();
    const index = existing.findIndex(asset => asset.id === id);
    if (index < 0) throw new Error('Asset not found');

    const updated = normalizeAsset({ ...existing[index], ...updates });
    const next = [...existing];
    next[index] = updated;
    writeAssets(next);
    return updated;
  }
}

// The UI depends on this interface, not on a database SDK. A future API,
// PostgreSQL, or Firebase adapter can replace this implementation.
export const assetRepository: AssetRepository = new LocalAssetRepository();
