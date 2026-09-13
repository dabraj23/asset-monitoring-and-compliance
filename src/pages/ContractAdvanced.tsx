import { useState } from 'react';
import { toast } from 'sonner';
import { useContracts } from '../context/ContractContext';
import type { Contract, ContractClause, ContractDocument, ContractObligation, ContractTemplate } from '../contractTypes';

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500';
const label = 'mb-1 block text-xs font-bold uppercase text-slate-500';
const lifecycleTypes: ContractDocument['documentType'][] = ['AMENDMENT', 'ADDENDUM', 'RENEWAL', 'SCHEDULE'];
const folders: Array<[string, ContractDocument['documentType'][]]> = [
  ['01 · Signed agreement', ['SIGNED_CONTRACT']],
  ['02 · Changes and renewals', lifecycleTypes],
  ['03 · Drafts', ['DRAFT']],
  ['04 · Supporting evidence', ['SUPPORTING_DOCUMENT']],
];

export function ManualClauseForm({ contract }: { contract: Contract }) {
  const { createClause, configuration } = useContracts();
  const [form, setForm] = useState({ clauseNumber: '', heading: '', clauseType: 'Other', sourceText: '', sourceReference: '', risk: 'MEDIUM' as ContractClause['risk'] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await createClause(contract.id, form);
      setForm({ clauseNumber: '', heading: '', clauseType: 'Other', sourceText: '', sourceReference: '', risk: 'MEDIUM' });
      toast.success('Manual clause captured and audited.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add clause.'); }
    finally { setBusy(false); }
  };
  return <details className="rounded-xl border border-dashed border-blue-200 p-4">
    <summary className="cursor-pointer text-sm font-bold text-blue-800">Add a clause manually when AI cannot read the file</summary>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label><span className={label}>Clause number</span><input className={field} value={form.clauseNumber} onChange={event => setForm({ ...form, clauseNumber: event.target.value })} /></label>
      <label><span className={label}>Heading *</span><input className={field} value={form.heading} onChange={event => setForm({ ...form, heading: event.target.value })} /></label>
      <label><span className={label}>Clause type</span><select className={field} value={form.clauseType} onChange={event => setForm({ ...form, clauseType: event.target.value })}>{[...new Set([...(configuration?.clauseTypes || []), 'Other'])].map(type => <option key={type}>{type}</option>)}</select></label>
      <label><span className={label}>Risk</span><select className={field} value={form.risk} onChange={event => setForm({ ...form, risk: event.target.value as ContractClause['risk'] })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
      <label className="sm:col-span-2"><span className={label}>Exact source text *</span><textarea rows={3} className={field} value={form.sourceText} onChange={event => setForm({ ...form, sourceText: event.target.value })} /></label>
      <label className="sm:col-span-2"><span className={label}>Page / source reference</span><input className={field} value={form.sourceReference} onChange={event => setForm({ ...form, sourceReference: event.target.value })} placeholder="Page 6, clause 12" /></label>
    </div>
    <button disabled={busy || !form.heading.trim() || !form.sourceText.trim()} onClick={save} className="mt-3 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save reviewed clause</button>
  </details>;
}

export function NewObligationForm({ contract }: { contract: Contract }) {
  const { createObligation, entities } = useContracts();
  const [form, setForm] = useState<Partial<ContractObligation>>({ title: '', action: '', entityId: contract.primaryEntityId, recurrence: 'ONCE', evidenceRequired: '', actionKind: 'STANDARD', triggerOffsetDays: 0 });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await createObligation(contract.id, form);
      setForm({ title: '', action: '', entityId: contract.primaryEntityId, recurrence: 'ONCE', evidenceRequired: '', actionKind: 'STANDARD', triggerOffsetDays: 0 });
      toast.success('Obligation added to the chain.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add obligation.'); }
    finally { setBusy(false); }
  };
  return <details className="rounded-xl border border-dashed border-blue-200 p-4">
    <summary className="cursor-pointer text-sm font-bold text-blue-800">Add an obligation or successor step</summary>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className={label}>Action title *</span><input className={field} value={form.title || ''} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label className="sm:col-span-2"><span className={label}>Required action *</span><textarea rows={2} className={field} value={form.action || ''} onChange={event => setForm({ ...form, action: event.target.value })} /></label>
      <label><span className={label}>Legal entity</span><select className={field} value={form.entityId || ''} onChange={event => setForm({ ...form, entityId: event.target.value })}>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.legalName}</option>)}</select></label>
      <label><span className={label}>Clause</span><select className={field} value={form.clauseId || ''} onChange={event => setForm({ ...form, clauseId: event.target.value || undefined })}><option value="">No clause link</option>{contract.clauses.map(clause => <option key={clause.id} value={clause.id}>{clause.clauseNumber} · {clause.heading}</option>)}</select></label>
      <label><span className={label}>Predecessor (optional)</span><select className={field} value={form.predecessorId || ''} onChange={event => setForm({ ...form, predecessorId: event.target.value || undefined })}><option value="">Starts immediately</option>{contract.obligations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label><span className={label}>{form.predecessorId ? 'Days after predecessor completes' : 'Due date'}</span><input className={field} type={form.predecessorId ? 'number' : 'date'} min={form.predecessorId ? 0 : undefined} value={form.predecessorId ? form.triggerOffsetDays || 0 : form.dueDate || ''} onChange={event => setForm(form.predecessorId ? { ...form, triggerOffsetDays: Number(event.target.value) } : { ...form, dueDate: event.target.value })} /></label>
      <label><span className={label}>Action kind</span><select className={field} value={form.actionKind || 'STANDARD'} onChange={event => setForm({ ...form, actionKind: event.target.value as ContractObligation['actionKind'] })}><option value="STANDARD">Standard follow-up</option><option value="UPLOAD_ADDENDUM">Upload accepted addendum</option><option value="UPLOAD_RENEWAL">Upload accepted renewal</option></select></label>
      <label><span className={label}>Evidence required</span><input className={field} value={form.evidenceRequired || ''} onChange={event => setForm({ ...form, evidenceRequired: event.target.value })} /></label>
      <label><span className={label}>Accountable owner</span><input className={field} value={form.ownerName || ''} onChange={event => setForm({ ...form, ownerName: event.target.value })} /></label>
      <label><span className={label}>Owner email</span><input type="email" className={field} value={form.ownerEmail || ''} onChange={event => setForm({ ...form, ownerEmail: event.target.value })} /></label>
      <label><span className={label}>Monitoring owner</span><input className={field} value={form.monitoringOwnerName || ''} onChange={event => setForm({ ...form, monitoringOwnerName: event.target.value })} /></label>
      <label><span className={label}>Monitoring email</span><input type="email" className={field} value={form.monitoringOwnerEmail || ''} onChange={event => setForm({ ...form, monitoringOwnerEmail: event.target.value })} /></label>
    </div>
    <button disabled={busy || !form.title?.trim() || !form.action?.trim()} onClick={save} className="mt-3 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create obligation</button>
  </details>;
}

export function ObligationChainCard({ contract, obligation }: { contract: Contract; obligation: ContractObligation }) {
  const { entities, updateObligation, confirmObligation, completeObligation } = useContracts();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(obligation);
  const [evidence, setEvidence] = useState('');
  const [linkedDocumentId, setLinkedDocumentId] = useState(obligation.linkedDocumentId || '');
  const [busy, setBusy] = useState(false);
  const predecessor = contract.obligations.find(item => item.id === obligation.predecessorId);
  const successors = contract.obligations.filter(item => item.predecessorId === obligation.id);
  const requiredDocumentType = obligation.actionKind === 'UPLOAD_RENEWAL' ? 'RENEWAL' : 'ADDENDUM';
  const evidenceDocuments = contract.documents.filter(item => item.documentType === requiredDocumentType && item.changeReviewStatus === 'ACCEPTED');
  const act = async (callback: () => Promise<unknown>, message: string) => { setBusy(true); try { await callback(); toast.success(message); setEditing(false); } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); } finally { setBusy(false); } };
  return <div className="rounded-xl border border-slate-100 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-blue-950">{obligation.title}</div><div className="mt-1 text-xs text-slate-500">{entities.find(item => item.id === obligation.entityId)?.legalName || 'Entity needs mapping'} · {obligation.actionKind.replaceAll('_', ' ')}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{obligation.status}</span></div>
    <p className="mt-3 text-sm text-slate-600">{obligation.action}</p>
    <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3"><div><span className="text-slate-400">Accountable</span><div className="font-bold">{obligation.ownerName || 'Unassigned'}</div></div><div><span className="text-slate-400">Monitoring owner</span><div className="font-bold">{obligation.monitoringOwnerName || 'Unassigned'}</div></div><div><span className="text-slate-400">Due date</span><div className="font-bold">{obligation.nextDueDate || obligation.dueDate || (predecessor ? 'After predecessor completes' : 'On event')}</div></div></div>
    {(predecessor || successors.length > 0) && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900">{predecessor && <div>Triggered by: <b>{predecessor.title}</b> when completed + {obligation.triggerOffsetDays} day(s)</div>}{successors.map(item => <div key={item.id}>Next: <b>{item.title}</b> · {item.status}</div>)}</div>}
    {obligation.status === 'DRAFT' && <button disabled={busy} onClick={() => act(() => confirmObligation(contract.id, obligation.id), 'Obligation confirmed for monitoring.')} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Confirm for monitoring</button>}
    {!['DRAFT', 'WAITING', 'COMPLETED', 'WAIVED'].includes(obligation.status) && <div className="mt-3 space-y-2 border-t pt-3"><div className="text-xs font-bold text-slate-500">Record completion · {obligation.evidenceRequired}</div>{obligation.actionKind !== 'STANDARD' && <select className={field} value={linkedDocumentId} onChange={event => setLinkedDocumentId(event.target.value)}><option value="">Select accepted {requiredDocumentType.toLowerCase()} document</option>{evidenceDocuments.map(item => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select>}<div className="flex flex-col gap-2 sm:flex-row"><input className={field} value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Evidence, completion note or link" /><button disabled={busy || !evidence.trim() || (obligation.actionKind !== 'STANDARD' && !linkedDocumentId)} onClick={() => act(() => completeObligation(contract.id, obligation.id, evidence, linkedDocumentId || undefined), 'Obligation completed; any successor step is now due.')} className="shrink-0 rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Complete obligation</button></div></div>}
    {obligation.completionEvidence && <div className="mt-2 text-xs text-emerald-700">Last evidence: {obligation.completionEvidence}</div>}
    <div className="mt-3 flex justify-end"><button onClick={() => { setForm(obligation); setEditing(!editing); }} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{editing ? 'Close editor' : 'Edit mapping, timing and chain'}</button></div>
    {editing && <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2"><label className="sm:col-span-2"><span className={label}>Title</span><input className={field} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label className="sm:col-span-2"><span className={label}>Action</span><textarea rows={2} className={field} value={form.action} onChange={event => setForm({ ...form, action: event.target.value })} /></label><label><span className={label}>Legal entity</span><select className={field} value={form.entityId} onChange={event => setForm({ ...form, entityId: event.target.value })}>{entities.map(item => <option key={item.id} value={item.id}>{item.legalName}</option>)}</select></label><label><span className={label}>Predecessor</span><select className={field} value={form.predecessorId || ''} onChange={event => setForm({ ...form, predecessorId: event.target.value || undefined })}><option value="">None</option>{contract.obligations.filter(item => item.id !== obligation.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span className={label}>Days after predecessor</span><input className={field} type="number" min="0" value={form.triggerOffsetDays} onChange={event => setForm({ ...form, triggerOffsetDays: Number(event.target.value) })} /></label><label><span className={label}>Due date</span><input className={field} type="date" value={form.nextDueDate || form.dueDate || ''} onChange={event => setForm({ ...form, dueDate: event.target.value, nextDueDate: undefined })} /></label><label><span className={label}>Action kind</span><select className={field} value={form.actionKind} onChange={event => setForm({ ...form, actionKind: event.target.value as ContractObligation['actionKind'] })}><option value="STANDARD">Standard</option><option value="UPLOAD_ADDENDUM">Upload accepted addendum</option><option value="UPLOAD_RENEWAL">Upload accepted renewal</option></select></label><label><span className={label}>Recurrence</span><select className={field} value={form.recurrence || 'ON_EVENT'} onChange={event => setForm({ ...form, recurrence: event.target.value as ContractObligation['recurrence'] })}><option>ONCE</option><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUALLY</option><option>ON_EVENT</option></select></label><label><span className={label}>Owner name</span><input className={field} value={form.ownerName} onChange={event => setForm({ ...form, ownerName: event.target.value })} /></label><label><span className={label}>Owner email</span><input className={field} value={form.ownerEmail} onChange={event => setForm({ ...form, ownerEmail: event.target.value })} /></label><label><span className={label}>Monitoring owner</span><input className={field} value={form.monitoringOwnerName} onChange={event => setForm({ ...form, monitoringOwnerName: event.target.value })} /></label><label><span className={label}>Monitoring email</span><input className={field} value={form.monitoringOwnerEmail} onChange={event => setForm({ ...form, monitoringOwnerEmail: event.target.value })} /></label><label className="sm:col-span-2"><span className={label}>Evidence required</span><input className={field} value={form.evidenceRequired} onChange={event => setForm({ ...form, evidenceRequired: event.target.value })} /></label><button disabled={busy} onClick={() => act(() => updateObligation(contract.id, obligation.id, form), 'Obligation chain updated.')} className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white">Save changes</button></div>}
  </div>;
}

export function SmartDocumentRepository({ contract }: { contract: Contract }) {
  const { uploadDocuments, updateDocument, reviewDocumentChange, signOffManualDocumentReview, reprocessContract, contracts } = useContracts();
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [documentType, setDocumentType] = useState<ContractDocument['documentType']>('SUPPORTING_DOCUMENT');
  const [signed, setSigned] = useState(false);
  const [relatedDocumentId, setRelatedDocumentId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const act = async (callback: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await callback(); toast.success(message); } catch (error) { toast.error(error instanceof Error ? error.message : 'Document action failed.'); }
    finally { setBusy(false); }
  };
  const upload = () => act(async () => {
    if (files.length > 25) throw new Error('Choose no more than 25 files per upload.');
    setUploadProgress('Preparing files…');
    try {
      await uploadDocuments(contract.id, files.map(file => ({ file, documentType, relatedDocumentId: relatedDocumentId || undefined, effectiveDate: effectiveDate || undefined, signed, authoritative: documentType === 'SIGNED_CONTRACT' })), (processed, total) => setUploadProgress(`Uploaded ${processed} of ${total} files`));
      setFiles([]); setRelatedDocumentId(''); setEffectiveDate('');
    } finally { setUploadProgress(''); }
  }, 'Original files preserved; background review queued.');
  const family = contracts.filter(item => item.id === contract.parentContractId || item.parentContractId === contract.id);
  return <div className="space-y-5">
    {family.length > 0 && <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"><div className="text-xs font-bold uppercase text-blue-700">Related contract family</div><div className="mt-2 space-y-1">{family.map(item => <div key={item.id} className="text-sm text-blue-950">{item.contractNumber} · {item.title} · {item.familyType}</div>)}</div></section>}
    <div className="flex justify-end"><button disabled={busy} onClick={() => act(() => reprocessContract(contract.id), 'Pending documents queued again.')} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Retry pending AI analysis</button></div>
    {folders.map(([name, types]) => {
      const items = contract.documents.filter(document => types.includes(document.documentType));
      return <section key={name} className="rounded-xl border border-slate-100 p-4"><div className="font-bold text-blue-950">{name} <span className="text-xs text-slate-400">({items.length})</span></div>
        <div className="mt-3 space-y-3">{items.map(document => <div key={document.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-bold text-slate-900">{document.fileName}</div><div className="mt-1 text-xs text-slate-500">v{document.version} · {document.documentType} · {document.signed ? 'signed' : 'unsigned'} · AI {document.extractionStatus} · {document.authoritative ? 'authoritative' : 'not authoritative'}</div>{document.suggestedDocumentType && document.suggestedDocumentType !== document.documentType && <div className="mt-1 text-xs font-bold text-amber-700">AI suggests {document.suggestedDocumentType} ({Math.round((document.classificationConfidence || 0) * 100)}%). Confirm classification before relying on extraction. {!document.classificationConfirmed && <button disabled={busy} onClick={() => act(() => updateDocument(contract.id, document.id, { classificationConfirmed: true }), 'Document classification confirmed.')} className="ml-2 underline">Confirm chosen type</button>}</div>}{document.relatedDocumentId && <div className="mt-1 text-xs text-slate-500">Related to: {contract.documents.find(item => item.id === document.relatedDocumentId)?.fileName || 'Earlier document'}</div>}</div><div className="flex gap-2">{document.changeReviewStatus === 'PENDING' && <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Change review pending</span>}{!document.storagePath.startsWith('seed/') && <a href={`/api/contracts/${contract.id}/documents/${document.id}/download`} className="rounded bg-white px-2 py-1 text-xs font-bold text-blue-800">Download</a>}</div></div>
          {document.changeReviewStatus === 'PENDING' && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="text-sm font-bold text-amber-900">Proposed change · human approval required</div><p className="mt-1 text-xs text-amber-800">{document.proposedChanges?.summary || 'AI could not extract a proposal. Review the original document manually, then record your decision.'}</p>{document.proposedChanges && <div className="mt-2 text-xs text-amber-800">{document.proposedChanges.clauses.length} proposed clauses · new expiry {document.proposedChanges.expiryDate || 'not specified'} · notice {document.proposedChanges.noticePeriodDays ?? 'not specified'} days</div>}{document.proposedChanges?.warnings.map((warning, index) => <div key={index} className="mt-1 text-xs text-red-700">⚠ {warning}</div>)}<label className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-900"><input type="checkbox" checked={document.signed} disabled={busy} onChange={event => act(() => updateDocument(contract.id, document.id, { signed: event.target.checked }), 'Signature status updated.')} />Signed / executed copy confirmed</label><input className={`${field} mt-3`} value={rationales[document.id] || ''} onChange={event => setRationales({ ...rationales, [document.id]: event.target.value })} placeholder="Decision rationale and comparison with current agreement" /><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy || !document.signed || !rationales[document.id]?.trim()} onClick={() => act(() => reviewDocumentChange(contract.id, document.id, 'ACCEPTED', rationales[document.id]), 'Change accepted; new clauses and obligations still need confirmation.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Accept change</button><button disabled={busy || !rationales[document.id]?.trim()} onClick={() => act(() => reviewDocumentChange(contract.id, document.id, 'REJECTED', rationales[document.id]), 'Change rejected and audited.')} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Reject</button></div></div>}
          {document.changeReviewStatus === 'ACCEPTED' && <div className="mt-2 text-xs font-bold text-emerald-700">Accepted lifecycle document</div>}
          {document.changeReviewStatus === 'REJECTED' && <div className="mt-2 text-xs font-bold text-red-700">Rejected lifecycle document · retained for audit</div>}
          {document.extractionStatus === 'REVIEW_REQUIRED' && !lifecycleTypes.includes(document.documentType) && <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3"><div className="text-sm font-bold text-purple-900">AI extraction unavailable · manual fallback</div><p className="mt-1 text-xs text-purple-800">Capture clauses and obligations in their tabs, review the original, then record sign-off.</p><input className={`${field} mt-2`} value={rationales[document.id] || ''} onChange={event => setRationales({ ...rationales, [document.id]: event.target.value })} placeholder="Manual review evidence and page references" /><button disabled={busy || !rationales[document.id]?.trim()} onClick={() => act(() => signOffManualDocumentReview(contract.id, document.id, rationales[document.id]), 'Manual document review recorded.')} className="mt-2 rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Sign off manual review</button></div>}
          {!lifecycleTypes.includes(document.documentType) && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-slate-500">Classification<select className="ml-2 rounded-lg border border-slate-200 bg-white p-1.5 text-xs" value={document.documentType} disabled={busy} onChange={event => act(() => updateDocument(contract.id, document.id, { documentType: event.target.value as ContractDocument['documentType'] }), 'Document classification updated.')}>{[...folders.flatMap(([, group]) => group)].map(type => <option key={type}>{type}</option>)}</select></label><label className="text-xs text-slate-500"><input type="checkbox" checked={document.signed} disabled={busy} onChange={event => act(() => updateDocument(contract.id, document.id, { signed: event.target.checked }), 'Signature status updated.')} /> Signed</label></div>}
        </div>)}{!items.length && <div className="text-sm text-slate-400">No files in this folder.</div>}</div>
      </section>;
    })}
    <section className="rounded-xl border border-dashed border-blue-200 bg-blue-50/20 p-4">
      <div className="font-bold text-blue-950">Add to this contract family</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span className={label}>Document type</span><select className={field} value={documentType} onChange={event => setDocumentType(event.target.value as ContractDocument['documentType'])}>{[...folders.flatMap(([, group]) => group)].map(type => <option key={type}>{type}</option>)}</select></label>
        <label><span className={label}>Related agreement / version</span><select className={field} value={relatedDocumentId} onChange={event => setRelatedDocumentId(event.target.value)}><option value="">Use current signed agreement</option>{contract.documents.map(item => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select></label>
        <label><span className={label}>Effective date (if known)</span><input type="date" className={field} value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></label>
        <label><span className={label}>Original files</span><input type="file" multiple className={field} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv,.txt" onChange={event => { const selected = Array.from(event.target.files || []); if (selected.length > 25) { setFiles([]); toast.error('Choose no more than 25 files per upload.'); } else setFiles(selected); }} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signed} onChange={event => setSigned(event.target.checked)} />This is the signed / executed copy</label>
      </div>
      <p className="mt-2 text-xs text-slate-500">PDF and Word (.doc/.docx) supported · {files.length} of 25 files selected · 15 MB per file</p>
      {uploadProgress && <p className="mt-2 text-xs font-bold text-blue-700" role="status">{uploadProgress}</p>}
      <button disabled={busy || !files.length} onClick={upload} className="mt-3 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Upload and analyse in background</button>
      <p className="mt-2 text-xs text-slate-500">Amendments, addenda, renewals and schedules never change live terms before acceptance.</p>
    </section>
  </div>;
}

export function DraftHistory({ contract }: { contract: Contract }) {
  const { restoreDraft } = useContracts();
  const [busy, setBusy] = useState(false);
  return <div className="space-y-3"><a className="inline-block rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800" href={`/api/contracts/${contract.id}/draft/download`}>Download editable Word-compatible draft</a><div className="text-xs font-bold uppercase text-slate-500">Saved version history</div>{[...contract.draftVersions].reverse().map(version => <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"><div><div className="text-sm font-bold">v{version.version} · {version.changeSummary}</div><div className="text-xs text-slate-500">{version.author} · {new Date(version.createdAt).toLocaleString()}</div></div><button disabled={busy || contract.status !== 'DRAFT'} onClick={async () => { setBusy(true); try { await restoreDraft(contract.id, version.id); toast.success(`Version ${version.version} restored as a new version.`); } catch (error) { toast.error(error instanceof Error ? error.message : 'Restore failed.'); } finally { setBusy(false); } }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Restore as new version</button></div>)}</div>;
}

export function TemplateManager() {
  const { configuration, createTemplate, updateTemplate } = useContracts();
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<Partial<ContractTemplate>>({ name: '', contractType: configuration?.contractTypes[0] || 'Other', description: '', content: '', approved: false, requiredClauseTypes: [] });
  const [busy, setBusy] = useState(false);
  const select = (id: string) => { setSelectedId(id); const item = configuration?.templates.find(template => template.id === id); if (item) setForm(item); else setForm({ name: '', contractType: configuration?.contractTypes[0] || 'Other', description: '', content: '', approved: false, requiredClauseTypes: [] }); };
  const save = async () => { setBusy(true); try { if (selectedId) await updateTemplate(selectedId, form); else await createTemplate(form); toast.success('Template saved with a new configuration version.'); select(''); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save template.'); } finally { setBusy(false); } };
  return <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-bold text-blue-950">Template editor</h2><p className="mt-1 text-xs text-slate-500">Approved templates can pre-fill new contracts with subsidiary and company context.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className={label}>Edit existing / create new</span><select className={field} value={selectedId} onChange={event => select(event.target.value)}><option value="">New template</option>{configuration?.templates.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label><label><span className={label}>Contract type</span><select className={field} value={form.contractType || ''} onChange={event => setForm({ ...form, contractType: event.target.value })}>{configuration?.contractTypes.map(type => <option key={type}>{type}</option>)}</select></label><label><span className={label}>Template name *</span><input className={field} value={form.name || ''} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label><span className={label}>Description</span><input className={field} value={form.description || ''} onChange={event => setForm({ ...form, description: event.target.value })} /></label><label className="sm:col-span-2"><span className={label}>Editable template content *</span><textarea rows={12} className={`${field} font-mono`} value={form.content || ''} onChange={event => setForm({ ...form, content: event.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.approved} onChange={event => setForm({ ...form, approved: event.target.checked })} />Approved for use in new requests</label></div><button disabled={busy || !form.name?.trim() || !form.content?.trim()} onClick={save} className="mt-3 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save template version</button></section>;
}
