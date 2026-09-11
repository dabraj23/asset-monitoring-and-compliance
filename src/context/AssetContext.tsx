import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { Asset } from '../types';

interface AssetContextType {
  assets: Asset[];
  updateAsset: (id: string, updates: Partial<Asset>) => void;
}

const AssetContext = createContext<AssetContextType | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setIsAuthReady(true);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    console.log('AssetContext: Attaching snapshot listener (no auth check)');
    const unsubscribe = onSnapshot(collection(db, 'assets'), (snapshot) => {
      console.log('AssetContext: Snapshot received, docs count:', snapshot.docs.length);
      const newAssets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      console.log('AssetContext: Assets loaded:', newAssets.length);
      setAssets(newAssets);
    }, (error) => {
      console.error('AssetContext: Snapshot error', error);
    });
    return () => unsubscribe();
  }, []);

  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    try {
      const assetRef = doc(db, 'assets', id);
      await updateDoc(assetRef, updates);
    } catch (error) {
      console.error('Failed to update asset in Firestore', error);
    }
  };

  return (
    <AssetContext.Provider value={{ assets, updateAsset }}>
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
