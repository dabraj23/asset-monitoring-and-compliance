import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Driver } from '../types';
import { useAssets } from '../context/AssetContext';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';

const empty = { name: '', licenseNumber: '', licenseType: '', licenseExpiry: '', phone: '', status: 'ACTIVE' as const, image: '' };
const call = async (url: string, method = 'GET', body?: unknown) => { const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed'); return result; };
export function Drivers() {
  const { user } = useAuth();
  const { selectedEntityId, entities } = useEntity();
  const { assets } = useAssets();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [draft, setDraft] = useState<Partial<Driver>>(empty);
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => call('/api/drivers').then(setDrivers).catch(error => toast.error(error.message));
  useEffect(() => { void refresh(); }, []);
  const visible = selectedEntityId ? drivers.filter(driver => driver.entityId === selectedEntityId) : drivers;
  const entityId = draft.entityId || selectedEntityId;
  const save = async () => {
    if (!entityId) return toast.error('Choose the responsible entity first.');
    setBusy(true);
    try { await call(editingId ? `/api/drivers/${editingId}` : '/api/drivers', editingId ? 'PATCH' : 'POST', { ...draft, entityId }); await refresh(); setEditingId(''); setDraft(empty); toast.success('Driver saved'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save driver'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-7xl space-y-6 p-5 lg:p-8"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-indigo-700">People and allocation</div><h1 className="mt-1 text-2xl font-bold text-slate-900">Driver Register</h1><p className="mt-1 text-sm text-slate-500">Drivers are managed separately from vehicles. Ground administrators can maintain licences and assign a registered driver to a vehicle.</p></div>
    {user?.role !== 'EXECUTIVE' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{editingId ? 'Edit driver' : 'Register a driver'}</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input aria-label="Driver name" placeholder="Name" value={draft.name || ''} onChange={event => setDraft({ ...draft, name: event.target.value })} className="rounded-lg border px-3 py-2" /><input aria-label="Licence number" placeholder="Licence number" value={draft.licenseNumber || ''} onChange={event => setDraft({ ...draft, licenseNumber: event.target.value })} className="rounded-lg border px-3 py-2" /><input aria-label="Licence class" placeholder="Licence class" value={draft.licenseType || ''} onChange={event => setDraft({ ...draft, licenseType: event.target.value })} className="rounded-lg border px-3 py-2" /><label className="text-xs text-slate-500">Licence expiry<input aria-label="Licence expiry" type="date" value={draft.licenseExpiry || ''} onChange={event => setDraft({ ...draft, licenseExpiry: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label><input aria-label="Phone" placeholder="Phone" value={draft.phone || ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} className="rounded-lg border px-3 py-2" /><select aria-label="Driver status" value={draft.status || 'ACTIVE'} onChange={event => setDraft({ ...draft, status: event.target.value as Driver['status'] })} className="rounded-lg border px-3 py-2"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>{user?.role === 'GROUP_ADMIN' && <select aria-label="Driver entity" value={entityId || ''} onChange={event => setDraft({ ...draft, entityId: event.target.value })} className="rounded-lg border px-3 py-2"><option value="">Select entity</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select>}</div><div className="mt-4 flex gap-2"><button disabled={busy || !draft.name || !entityId} onClick={save} className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save driver</button>{editingId && <button onClick={() => { setEditingId(''); setDraft(empty); }} className="rounded-lg border px-4 py-2">Cancel</button>}</div></section>}
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[820px] w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Driver', 'Entity', 'Licence', 'Expiry', 'Status', 'Assigned vehicle', ''].map(item => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody>{visible.map(driver => { const vehicle = assets.find(asset => asset.assignedDrivers.some(item => item.id === driver.id)); return <tr key={driver.id} className="border-b"><td className="px-4 py-3 font-semibold">{driver.name}</td><td className="px-4 py-3">{entities.find(item => item.id === driver.entityId)?.displayName || 'Unassigned'}</td><td className="px-4 py-3">{driver.licenseType} · {driver.licenseNumber}</td><td className="px-4 py-3">{driver.licenseExpiry || 'Missing'}</td><td className="px-4 py-3">{driver.status}</td><td className="px-4 py-3">{vehicle?.registrationNumber || 'Not assigned'}</td><td className="px-4 py-3">{user?.role !== 'EXECUTIVE' && <button onClick={() => { setEditingId(driver.id); setDraft(driver); }} className="font-semibold text-indigo-700">Edit</button>}</td></tr>; })}</tbody></table>{!visible.length && <div className="p-8 text-center text-slate-500">No drivers registered for this view.</div>}</section>
  </div>;
}
