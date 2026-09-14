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
    if (entities.length && !['GROUP_ADMIN', 'EXECUTIVE'].includes(user?.role || '') && !entities.some(item => item.id === selectedEntityId)) {
      setSelectedEntityIdState(entities[0].id);
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
