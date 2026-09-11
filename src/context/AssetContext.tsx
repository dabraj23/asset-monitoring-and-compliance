import React, { createContext, useContext, useState, useEffect } from 'react';
import { Asset } from '../types';
import { assetRepository } from '../data/assetRepository';

interface AssetContextType {
  assets: Asset[];
  isLoading: boolean;
  createAsset: (asset: Asset) => Promise<Asset>;
  createAssets: (assets: Asset[]) => Promise<Asset[]>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
}

const AssetContext = createContext<AssetContextType | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    assetRepository.list()
      .then(setAssets)
      .finally(() => setIsLoading(false));
  }, []);

  const createAsset = async (asset: Asset) => {
    const created = await assetRepository.create(asset);
    setAssets(current => [...current, created]);
    return created;
  };

  const createAssets = async (newAssets: Asset[]) => {
    const created = await assetRepository.createMany(newAssets);
    setAssets(current => [...current, ...created]);
    return created;
  };

  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    const updated = await assetRepository.update(id, updates);
    setAssets(current => current.map(asset => asset.id === id ? updated : asset));
  };

  return (
    <AssetContext.Provider value={{ assets, isLoading, createAsset, createAssets, updateAsset }}>
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
