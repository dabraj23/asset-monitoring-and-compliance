import React, { createContext, useContext, useState, useEffect } from 'react';
import { Asset } from '../types';
import { assetRepository } from '../data/assetRepository';
import { useEntity } from './EntityContext';

interface AssetContextType {
  assets: Asset[];
  isLoading: boolean;
  createAsset: (asset: Asset) => Promise<Asset>;
  createAssets: (assets: Asset[]) => Promise<Asset[]>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  refreshAssets: () => Promise<void>;
}

const AssetContext = createContext<AssetContextType | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const { selectedEntityId } = useEntity();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAssets = async () => { const result = await assetRepository.list(); setAssets(result); };
  useEffect(() => { refreshAssets().finally(() => setIsLoading(false)); }, []);

  const createAsset = async (asset: Asset) => {
    if (!asset.entityId && !selectedEntityId) throw new Error('Choose an entity in the sidebar before registering an asset.');
    const created = await assetRepository.create({ ...asset, entityId: asset.entityId || selectedEntityId });
    setAssets(current => [...current, created]);
    return created;
  };

  const createAssets = async (newAssets: Asset[]) => {
    if (newAssets.some(asset => !asset.entityId && !selectedEntityId)) throw new Error('Choose an entity in the sidebar before importing assets.');
    const created = await assetRepository.createMany(newAssets.map(asset => ({ ...asset, entityId: asset.entityId || selectedEntityId })));
    setAssets(current => [...current, ...created]);
    return created;
  };

  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    const updated = await assetRepository.update(id, updates);
    setAssets(current => current.map(asset => asset.id === id ? updated : asset));
  };

  return (
    <AssetContext.Provider value={{ assets: selectedEntityId ? assets.filter(asset => asset.entityId === selectedEntityId) : assets, isLoading, createAsset, createAssets, updateAsset, refreshAssets }}>
      {children}
    </AssetContext.Provider>
  );
}

export function useAssets() {
  const context = useContext(AssetContext);
  if (context === undefined) {
    throw new Error('useAssets must be used within an AssetProvider');
  }
  return context;
}
