import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CorporateEntity } from '../contractTypes';
import { useAuth } from './AuthContext';

interface EntityContextValue {
  entities: CorporateEntity[];
  selectedEntityId: string;
  setSelectedEntityId(value: string): void;
  refresh(): Promise<void>;
}
const EntityContext = createContext<EntityContextValue | null>(null);

export function EntityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entities, setEntities] = useState<CorporateEntity[]>([]);
  const [selectedEntityId, setSelectedEntityIdState] = useState(sessionStorage.getItem('selectedEntityId') || '');
  const refresh = async () => {
    const response = await fetch('/api/corporate-entities');
    if (response.ok) setEntities(await response.json());
  };
  useEffect(() => { void refresh(); }, [user?.id]);
  useEffect(() => {
    const activeEntities = entities.filter(item => item.active);
    if (selectedEntityId && !activeEntities.some(item => item.id === selectedEntityId)) {
      const fallback = ['GROUP_ADMIN', 'EXECUTIVE'].includes(user?.role || '') ? '' : activeEntities[0]?.id || '';
      sessionStorage.setItem('selectedEntityId', fallback);
      setSelectedEntityIdState(fallback);
    } else if (activeEntities.length && !['GROUP_ADMIN', 'EXECUTIVE'].includes(user?.role || '') && !selectedEntityId) {
      sessionStorage.setItem('selectedEntityId', activeEntities[0].id);
      setSelectedEntityIdState(activeEntities[0].id);
    }
  }, [entities, selectedEntityId, user?.role]);
  const setSelectedEntityId = (value: string) => { sessionStorage.setItem('selectedEntityId', value); setSelectedEntityIdState(value); };
  return <EntityContext.Provider value={{ entities, selectedEntityId, setSelectedEntityId, refresh }}>{children}</EntityContext.Provider>;
}
export const useEntity = () => {
  const value = useContext(EntityContext);
  if (!value) throw new Error('EntityProvider missing');
  return value;
};
