import { useEffect, useState } from 'react';
import { GitBranch, Plus, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';
import type { DocumentDefinition, WorkflowInstruction, WorkflowModule, WorkflowPhase, WorkflowState } from '../workflowTypes';

const modules: WorkflowModule[] = ['CONTRACT', 'VENDOR', 'ASSET', 'COMPLIANCE'];
const phases: WorkflowPhase[] = ['CLASSIFY', 'EXTRACT', 'MATCH', 'VALIDATE', 'VERIFY', 'ROUTE', 'MONITOR'];
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600';
const split = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
const request = async (url: string, method = 'GET', body?: unknown) => {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

export function WorkflowStudio() {
  const { user } = useAuth();
  const { entities } = useEntity();
  const [params] = useSearchParams();
  const requested = params.get('module') as WorkflowModule | null;
  const studioModule: WorkflowModule = requested && modules.includes(requested) ? requested : 'CONTRACT';
  const allowedModules: WorkflowModule[] = studioModule === 'ASSET' ? ['ASSET', 'DRIVER'] : [studioModule];
  const [state, setState] = useState<WorkflowState | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [module, setModule] = useState<WorkflowModule>(studioModule);
  const [phase, setPhase] = useState<WorkflowPhase>('EXTRACT');
  const [entityId, setEntityId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [documents, setDocuments] = useState('');
  const [fields, setFields] = useState('');
  const [blocking, setBlocking] = useState(true);
  const [instructionActive, setInstructionActive] = useState(true);
  const [sampleText, setSampleText] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [impact, setImpact] = useState<{ nextVersion: number; changedInstructionIds: string[]; changedDocumentIds: string[]; duplicateInstructionScopes: string[]; affectedContracts: number; affectedVendors: number; affectedAssets: number } | null>(null);
  const [docModule, setDocModule] = useState<WorkflowModule>(studioModule);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [docCode, setDocCode] = useState('');
  const [docLabel, setDocLabel] = useState('');
  const [docFields, setDocFields] = useState('');
  const [docCategories, setDocCategories] = useState('');
  const [docEntityIds, setDocEntityIds] = useState<string[]>([]);
  const [docActive, setDocActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setState(await request('/api/workflow-config'));
  useEffect(() => { if (user?.role === 'GROUP_ADMIN') void refresh(); }, [user?.role]);
  useEffect(() => { setSelectedId(''); setModule(studioModule); setDocModule(studioModule); setPrompt(''); setDocuments(''); setFields(''); setInstructionActive(true); setTestOutput(''); setImpact(null); setSelectedDocId(''); setDocCode(''); setDocLabel(''); setDocFields(''); setDocCategories(''); setDocEntityIds([]); setDocActive(true); }, [studioModule]);
  if (user?.role !== 'GROUP_ADMIN') return <div className="p-8 text-sm text-slate-600">Only group administrators can edit and publish workflow configuration.</div>;

  const choose = (item: WorkflowInstruction) => { if (!allowedModules.includes(item.module)) return; setSelectedId(item.id); setModule(item.module); setDocModule(item.module); setPhase(item.phase); setEntityId(item.entityId); setCategoryId(item.categoryId); setPrompt(item.prompt); setDocuments(item.requiredDocumentTypes.join(', ')); setFields(item.requiredFields.join(', ')); setBlocking(item.blocking); setInstructionActive(item.active); setTestOutput(''); };
  const clear = () => { setSelectedId(''); setModule(studioModule); setPhase('EXTRACT'); setEntityId(''); setCategoryId(''); setPrompt(''); setDocuments(''); setFields(''); setBlocking(true); setInstructionActive(true); setTestOutput(''); };
  const chooseDocument = (item: DocumentDefinition) => { if (!allowedModules.includes(item.module)) return; setSelectedDocId(item.id); setDocModule(item.module); setDocCode(item.code); setDocLabel(item.label); setDocFields(item.fields.join(', ')); setDocCategories(item.categoryIds.join(', ')); setDocEntityIds(item.entityIds); setDocActive(item.active); };
  const clearDocument = () => { setSelectedDocId(''); setDocModule(studioModule); setDocCode(''); setDocLabel(''); setDocFields(''); setDocCategories(''); setDocEntityIds([]); setDocActive(true); };
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); try { await action(); toast.success(success); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); } finally { setBusy(false); } };
  const save = () => run(async () => { if (!allowedModules.includes(module)) throw new Error('Choose a phase within this module.'); const id = selectedId || crypto.randomUUID(); await request('/api/workflow-config/instructions', 'POST', { id, module, phase, entityId, categoryId, prompt, requiredDocumentTypes: split(documents), requiredFields: split(fields), blocking, active: instructionActive }); setSelectedId(id); setImpact(null); }, 'Draft instruction saved.');
  const saveDocument = () => run(async () => { if (!allowedModules.includes(docModule)) throw new Error('Choose a document type within this module.'); const id = selectedDocId || crypto.randomUUID(); await request('/api/workflow-config/document-types', 'POST', { id, module: docModule, code: docCode.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), label: docLabel, fields: split(docFields), categoryIds: split(docCategories), entityIds: docEntityIds, active: docActive }); setSelectedDocId(id); setImpact(null); }, 'Draft document type saved.');
  const test = () => run(async () => { if (!selectedId) throw new Error('Save this prompt first.'); const result = await request('/api/workflow-config/test', 'POST', { instructionId: selectedId, sampleText }); setTestOutput(result.output); }, 'Prompt test completed.');
  const moduleHistory = state?.history.filter((pack, index, history) => index === 0 || JSON.stringify(pack.instructions.filter(item => allowedModules.includes(item.module))) !== JSON.stringify(history[index - 1].instructions.filter(item => allowedModules.includes(item.module))) || JSON.stringify(pack.documents.filter(item => allowedModules.includes(item.module))) !== JSON.stringify(history[index - 1].documents.filter(item => allowedModules.includes(item.module)))) || [];
  return <div className="mx-auto max-w-[1500px] space-y-6 p-5 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{studioModule === 'ASSET' ? 'Asset and driver' : studioModule.toLowerCase()} administration</div><h1 className="mt-2 text-3xl font-black text-blue-950">{studioModule === 'ASSET' ? 'Asset' : studioModule.charAt(0) + studioModule.slice(1).toLowerCase()} Prompt Studio</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Configure this module’s evidence reading by phase, entity and category. Prompts structure evidence; explicit rules control compliance decisions.</p></div><div className="rounded-xl bg-blue-950 px-5 py-3 text-white"><div className="text-xs text-blue-200">Shared published pack</div><div className="text-2xl font-black">v{state?.activeVersion || '—'}</div></div></div>
    {studioModule === 'COMPLIANCE' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Compliance prompt configuration is available, but the current site-checklist screen is still a legacy local workflow. Do not treat these prompts as automated enterprise compliance checks until its server-side intake and review jobs are connected.</div>}
    <div className="grid gap-6 xl:grid-cols-[300px_1fr]"><section className="rounded-xl border bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-bold">Phase instructions</h2><button onClick={clear} className="rounded-lg bg-blue-50 p-2 text-blue-800" title="New instruction" aria-label="New phase instruction"><Plus className="h-4 w-4" /></button></div><div className="mt-4 max-h-[580px] space-y-2 overflow-y-auto">{state?.draft.instructions.filter(item => allowedModules.includes(item.module)).map(item => <button key={item.id} onClick={() => choose(item)} className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><div className="text-sm font-bold">{item.module} · {item.phase}{!item.active ? ' · Inactive' : ''}</div><div className="mt-1 text-xs text-slate-500">{item.entityId ? entities.find(entity => entity.id === item.entityId)?.displayName || item.entityId : 'Group default'}{item.categoryId ? ` · ${item.categoryId}` : ''}</div><div className="mt-2 line-clamp-2 text-xs text-slate-600">{item.prompt}</div></button>)}</div></section>
    <section className="rounded-xl border bg-white p-5">
      <div className="flex items-center gap-2 font-bold text-blue-950"><GitBranch className="h-5 w-5" />{selectedId ? 'Edit draft phase' : 'Create phase override'}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {allowedModules.length > 1 && <label className="text-xs font-bold">Area<select className={`${input} mt-1`} value={module} onChange={event => setModule(event.target.value as WorkflowModule)}>{allowedModules.map(value => <option key={value}>{value}</option>)}</select></label>}
        <label className="text-xs font-bold">Processing phase<select className={`${input} mt-1`} value={phase} onChange={event => setPhase(event.target.value as WorkflowPhase)}>{phases.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-bold">Entity override<select className={`${input} mt-1`} value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">All entities</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.legalName}</option>)}</select></label>
        <label className="text-xs font-bold">Category override<input className={`${input} mt-1`} value={categoryId} onChange={event => setCategoryId(event.target.value)} placeholder="Blank = all categories" /></label>
        <label className="sm:col-span-2 text-xs font-bold">AI reading instructions<textarea className={`${input} mt-1 min-h-40`} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="What should the AI identify, read and cite?" /></label>
        <label className="text-xs font-bold">Required document codes<input className={`${input} mt-1`} value={documents} onChange={event => setDocuments(event.target.value)} placeholder="Comma-separated codes" /></label>
        <label className="text-xs font-bold">Required extracted fields<input className={`${input} mt-1`} value={fields} onChange={event => setFields(event.target.value)} placeholder="Comma-separated field names" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocking} onChange={event => setBlocking(event.target.checked)} />Blocking when evidence is missing</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={instructionActive} onChange={event => setInstructionActive(event.target.checked)} />Active instruction</label>
      </div>
      <button disabled={busy || !prompt.trim()} onClick={save} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />Save draft</button>
      <div className="mt-6 border-t pt-5"><div className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4" />Try against sample text</div><textarea className={`${input} mt-3 min-h-24`} value={sampleText} onChange={event => setSampleText(event.target.value)} placeholder="Paste a short synthetic or redacted document excerpt" /><button onClick={test} disabled={busy || !sampleText.trim()} className="mt-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-40">Run prompt test</button>{testOutput && <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs whitespace-pre-wrap text-white">{testOutput}</pre>}</div>
    </section></div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-blue-950">Document types</h2><button onClick={clearDocument} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">New type</button></div>
        <p className="mt-1 text-xs text-slate-500">Create or edit the evidence types this module should recognise.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {allowedModules.length > 1 && <label className="text-xs font-bold">Area<select className={`${input} mt-1`} value={docModule} onChange={event => setDocModule(event.target.value as WorkflowModule)}>{allowedModules.map(value => <option key={value}>{value}</option>)}</select></label>}
          <input className={input} value={docCode} onChange={event => setDocCode(event.target.value)} placeholder="DOCUMENT_CODE" />
          <input className={input} value={docLabel} onChange={event => setDocLabel(event.target.value)} placeholder="Display name" />
          <input className={input} value={docFields} onChange={event => setDocFields(event.target.value)} placeholder="Fields, comma separated" />
          <input className={input} value={docCategories} onChange={event => setDocCategories(event.target.value)} placeholder="Category IDs (blank = all)" />
        </div>
        <div className="mt-3 text-xs font-bold text-slate-700">Applicable entities · none means all</div>
        <div className="mt-2 flex flex-wrap gap-2">{entities.map(entity => <label key={entity.id} className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs"><input type="checkbox" checked={docEntityIds.includes(entity.id)} onChange={event => setDocEntityIds(current => event.target.checked ? [...current, entity.id] : current.filter(id => id !== entity.id))} />{entity.displayName}</label>)}</div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={docActive} onChange={event => setDocActive(event.target.checked)} />Active document type</label>
        <button onClick={saveDocument} disabled={busy || !docCode || !docLabel} className="mt-3 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-40">{selectedDocId ? 'Save changes to draft' : 'Add to draft'}</button>
        <div className="mt-4 max-h-48 overflow-y-auto text-xs text-slate-600">{state?.draft.documents.filter(item => allowedModules.includes(item.module)).map(item => <button key={item.id} onClick={() => chooseDocument(item)} className={`block w-full border-t py-2 text-left hover:text-blue-800 ${selectedDocId === item.id ? 'font-bold text-blue-800' : ''}`}><span className="font-bold">{item.code}</span> · {item.label} · {item.module}{!item.active ? ' · Inactive' : ''}</button>)}</div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="flex items-center gap-2 font-bold text-blue-950"><ShieldCheck className="h-5 w-5" />Publish and history</h2>
        <p className="mt-1 text-xs text-slate-500">Publish only this module. Previous jobs retain their original shared pack version.</p>
        <button disabled={busy} onClick={() => run(async () => setImpact(await request(`/api/workflow-config/impact?module=${studioModule}`)), 'Impact preview ready.')} className="mt-4 rounded-lg border px-4 py-2 text-sm font-bold">Preview impact</button>
        {impact && <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <div>{impact.changedInstructionIds.length} instruction(s), {impact.changedDocumentIds.length} document type(s) changed.</div>
          {impact.duplicateInstructionScopes.length > 0 && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><div className="font-bold">Publishing blocked: duplicate active instruction scopes</div>{impact.duplicateInstructionScopes.map(scope => <div key={scope}>{scope}</div>)}<div className="mt-1">Edit the existing instruction or deactivate the duplicate draft, then preview again.</div></div>}
          {(studioModule === 'CONTRACT' || studioModule === 'VENDOR') && <div className="mt-1 text-xs">Potentially affected: {impact.affectedContracts} contracts and {impact.affectedVendors} vendors. Existing approvals remain intact; vendor reassessment tasks are generated where applicable.</div>}
          {studioModule === 'ASSET' && <div className="mt-1 text-xs">Potentially affected: {impact.affectedAssets} assets. Publishing creates an owner reassessment action for each affected record.</div>}{studioModule === 'COMPLIANCE' && <div className="mt-1 text-xs">Compliance record reassessment is not yet connected; publishing changes future AI jobs only.</div>}
          <button disabled={busy || impact.duplicateInstructionScopes.length > 0 || !(impact.changedInstructionIds.length || impact.changedDocumentIds.length)} onClick={() => run(async () => { await request('/api/workflow-config/publish', 'POST', { module: studioModule }); setImpact(null); }, 'This module’s new workflow version was published.')} className="mt-3 rounded-lg bg-blue-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Publish v{impact.nextVersion}</button>
        </div>}
        <div className="mt-4 max-h-44 space-y-2 overflow-y-auto">{moduleHistory.slice().reverse().map(pack => <div key={pack.version} className="flex items-center justify-between rounded-lg border p-2 text-xs"><span>v{pack.version} · {new Date(pack.publishedAt).toLocaleString()}</span>{pack.version !== state?.activeVersion && <button disabled={busy} onClick={() => run(async () => { await request(`/api/workflow-config/rollback/${pack.version}`, 'POST', { module: studioModule }); setImpact(null); }, `This module’s version ${pack.version} was restored as a new shared pack version.`)} className="font-bold text-blue-800">Restore</button>}</div>)}</div>
      </section>
    </div>
  </div>;
}
