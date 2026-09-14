import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
  role: 'GROUP_ADMIN' | 'EXECUTIVE' | 'ENTITY_ADMIN' | 'OWNER';
  entityIds: string[];
  active: boolean;
}

interface AuthContextValue {
  user: SignedInUser | null;
  loading: boolean;
  setupRequired: boolean;
  login(email: string, password: string): Promise<void>;
  bootstrap(input: { token: string; name: string; email: string; password: string }): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const parse = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    Promise.all([fetch('/api/auth/me').then(response => response.ok ? response.json() : null), fetch('/api/auth/status').then(response => response.json())])
      .then(([current, status]) => { setUser(current); setSetupRequired(!!status.setupRequired); })
      .catch(() => { setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    setUser(await parse(await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })));
  };
  const bootstrap = async (input: { token: string; name: string; email: string; password: string }) => {
    setUser(await parse(await fetch('/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })));
    setSetupRequired(false);
  };
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, setupRequired, login, bootstrap, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
};
