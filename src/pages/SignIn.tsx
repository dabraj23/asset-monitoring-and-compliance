import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SignIn() {
  const { setupRequired, login, bootstrap } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { if (setupRequired) await bootstrap({ name, email, password, token }); else await login(email, password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-950 to-indigo-900 p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-9">
      <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-800"><ShieldCheck className="h-6 w-6" /></span><div><div className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Secure workspace</div><h1 className="text-2xl font-black text-blue-950">{setupRequired ? 'Set up group admin' : 'Sign in'}</h1></div></div>
      {setupRequired && <><p className="mb-5 text-sm text-slate-600">Use the one-time setup token printed in the server terminal. Create the first group administrator account.</p><label className="mb-4 block text-sm font-semibold">Setup token<input className="mt-1 w-full rounded-lg border p-3 font-normal" required value={token} onChange={event => setToken(event.target.value)} /></label><label className="mb-4 block text-sm font-semibold">Name<input className="mt-1 w-full rounded-lg border p-3 font-normal" required value={name} onChange={event => setName(event.target.value)} /></label></>}
      <label className="mb-4 block text-sm font-semibold">Email<input type="email" className="mt-1 w-full rounded-lg border p-3 font-normal" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="mb-5 block text-sm font-semibold">Password<input type="password" className="mt-1 w-full rounded-lg border p-3 font-normal" minLength={setupRequired ? 12 : undefined} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <button disabled={busy} className="w-full rounded-lg bg-blue-800 p-3 font-bold text-white disabled:opacity-50">{busy ? 'Please wait…' : setupRequired ? 'Create group admin' : 'Sign in'}</button>
    </form>
  </main>;
}
