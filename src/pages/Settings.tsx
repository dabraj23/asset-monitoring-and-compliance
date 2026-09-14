import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth, type SignedInUser } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';

type KeyStatus = { configured: boolean; success?: boolean; source?: 'LOCAL_FILE' | 'ENVIRONMENT' | 'NONE'; model?: string; lastTestedAt?: string; latencyMs?: number; message?: string };
const roles: SignedInUser['role'][] = ['GROUP_ADMIN', 'EXECUTIVE', 'ENTITY_ADMIN', 'OWNER'];
const request = async <T,>(url: string, method = 'GET', body?: unknown): Promise<T> => {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed');
  return data as T;
};

export function Settings() {
  const { user } = useAuth();
  const { entities } = useEntity();
  const [key, setKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ configured: false });
  const [users, setUsers] = useState<SignedInUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OWNER' as SignedInUser['role'], entityIds: [] as string[] });
  const admin = user?.role === 'GROUP_ADMIN';
  const refreshUsers = () => { if (admin) request<SignedInUser[]>('/api/users').then(setUsers).catch(error => toast.error(error.message)); };
  const refreshKeyStatus = () => request<KeyStatus>('/api/settings/api-key/status').then(setKeyStatus);
  useEffect(() => { refreshKeyStatus().catch(() => undefined); }, []);
  useEffect(refreshUsers, [admin]);
  const handle = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Request failed'); } finally { setBusy(false); } };
  const testKey = () => handle(async () => { try { await request<KeyStatus>('/api/settings/api-key/test', 'POST', key ? { apiKey: key } : {}); toast.success('Gemini connection verified'); } finally { await refreshKeyStatus(); } });
  const saveKey = () => handle(async () => { await request('/api/settings/api-key', 'POST', { apiKey: key }); setKey(''); await refreshKeyStatus(); toast.success('Key saved. You can now test it without re-entering it.'); });
  const createUser = () => handle(async () => { await request('/api/users', 'POST', form); setForm({ name: '', email: '', password: '', role: 'OWNER', entityIds: [] }); refreshUsers(); toast.success('Account created'); });
  const updateUser = (id: string, body: Partial<SignedInUser>) => handle(async () => { await request(`/api/users/${id}`, 'PATCH', body); refreshUsers(); toast.success('Account updated'); });

  return <div className="mx-auto max-w-6xl space-y-7 p-5 lg:p-8">
    <div><h1 className="text-2xl font-bold text-slate-900">Settings</h1><p className="mt-1 text-sm text-slate-500">Signed in as {user?.name} ({user?.email}). Changes here are saved on the server.</p></div>
    {admin && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
      <h2 className="text-lg font-bold">AI connection</h2><p className="mt-1 text-sm text-slate-500">Save a Gemini key, then test the saved key at any time. For this laptop pilot it is stored in a gitignored local server file and never returned to the browser. A cloud deployment must use an approved secret vault.</p>
      <div className="mt-5 flex flex-wrap gap-3"><input type="password" aria-label="Gemini API key" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Gemini API key" className="min-w-64 flex-1 rounded-lg border border-slate-300 px-4 py-2" /><button disabled={busy || key.trim().length < 20} onClick={saveKey} className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save key</button><button disabled={busy || (!key && !keyStatus.configured)} onClick={testKey} className="rounded-lg border border-indigo-200 px-4 py-2 font-semibold text-indigo-700 disabled:opacity-50">{key ? 'Test entered key' : 'Test saved key'}</button></div>
      <div role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${keyStatus.success === false ? 'bg-rose-50 text-rose-800' : keyStatus.success ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>{keyStatus.configured ? (keyStatus.source === 'LOCAL_FILE' ? 'Saved on this laptop' : 'Configured from server environment') : 'Not configured'} · {keyStatus.model || 'gemini-2.5-flash'}{keyStatus.lastTestedAt && ` · Tested ${new Date(keyStatus.lastTestedAt).toLocaleString()}`}{keyStatus.latencyMs !== undefined && ` · ${keyStatus.latencyMs} ms`}{keyStatus.message && ` · ${keyStatus.message}`}</div>
    </section>}
    {admin && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
      <h2 className="text-lg font-bold">Staff accounts and entity access</h2><p className="mt-1 text-sm text-slate-500">Entity admins and owners see assigned entities only. Executives see group reporting but cannot change records.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><input aria-label="Staff name" placeholder="Name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input aria-label="Staff email" type="email" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input aria-label="Initial password" type="password" placeholder="Initial password (12+ characters)" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><select aria-label="Staff role" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as SignedInUser['role'] })} className="rounded-lg border border-slate-300 px-3 py-2">{roles.map(role => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></div>
      <div className="mt-4"><div className="text-sm font-semibold">Permitted entities</div><div className="mt-2 flex flex-wrap gap-3">{entities.map(entity => <label key={entity.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.entityIds.includes(entity.id)} onChange={event => setForm({ ...form, entityIds: event.target.checked ? [...form.entityIds, entity.id] : form.entityIds.filter(id => id !== entity.id) })} />{entity.displayName}</label>)}</div></div>
      <button disabled={busy || !form.email || !form.password} onClick={createUser} className="mt-5 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Create account</button>
      <div className="mt-8 space-y-3 border-t border-slate-200 pt-5"><h3 className="font-bold">Existing accounts</h3>{users.map(account => <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><div className="font-semibold">{account.name} <span className="text-xs text-slate-500">{account.role.replaceAll('_', ' ')}</span></div><div className="text-sm text-slate-500">{account.email} · {account.entityIds.map(id => entities.find(entity => entity.id === id)?.displayName || id).join(', ') || 'Group scope'}</div></div><div className="flex gap-2"><button disabled={busy} onClick={() => { const name = window.prompt('Account name', account.name); if (name?.trim()) updateUser(account.id, { name }); }} className="rounded-lg border px-3 py-1.5 text-sm">Edit name</button><button disabled={busy || account.id === user?.id} onClick={() => updateUser(account.id, { active: !account.active })} className="rounded-lg border px-3 py-1.5 text-sm">{account.active ? 'Deactivate' : 'Activate'}</button></div></div>)}</div>
    </section>}
    {!admin && <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Ask a group administrator to change account access or AI configuration.</div>}
  </div>;
}
