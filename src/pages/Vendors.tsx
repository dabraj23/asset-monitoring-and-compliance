import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Bell, Building2, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FileSearch,
  FileText, Gauge, GitBranch, Inbox, Link2, Loader2, Plus, Search, ShieldAlert, ShieldCheck, Upload, Users, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { BulkVendorImportModal } from '../components/BulkVendorImportModal';
import { VendorOnboardingWizard } from '../components/VendorOnboardingWizard';
import { VendorRuleBuilder } from '../components/VendorRuleBuilder';
import { useAssets } from '../context/AssetContext';
import { useVendors } from '../context/VendorContext';
import { ExternalVerification, RequirementResult, Vendor, VendorCheckStatus, VendorDocument, vendorDocumentTypes } from '../vendorTypes';

type View = 'dashboard' | 'register' | 'followups' | 'expiries' | 'performance' | 'rules';
const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const checkStyles: Record<VendorCheckStatus, string> = {
  PASSED: 'bg-green-50 text-green-700', WARNING: 'bg-amber-50 text-amber-700', FAILED: 'bg-red-50 text-red-700',
  REVIEW_REQUIRED: 'bg-purple-50 text-purple-700', UNAVAILABLE: 'bg-gray-100 text-gray-600',
};
const onboardingStyles: Record<string, string> = {
  APPROVED: 'bg-green-50 text-green-700', CONDITIONALLY_APPROVED: 'bg-amber-50 text-amber-700', REJECTED: 'bg-red-50 text-red-700',
  BLACKLISTED: 'bg-red-100 text-red-800', SUSPENDED: 'bg-red-50 text-red-700', VERIFYING: 'bg-blue-50 text-blue-700',
  IN_APPROVAL: 'bg-indigo-50 text-indigo-700', REVIEW_REQUIRED: 'bg-purple-50 text-purple-700', DOCUMENTS_PENDING: 'bg-gray-100 text-gray-700', DRAFT: 'bg-gray-100 text-gray-700',
};
const cleanLabel = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
const displayDate = (value?: string) => value ? value.split('-').reverse().join('/') : '—';

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${checkStyles[status as VendorCheckStatus] || onboardingStyles[status] || 'bg-gray-100 text-gray-700'}`}>{cleanLabel(status)}</span>;
}

function DocumentEvidenceCard({ vendorId, document }: { vendorId: string; document: VendorDocument }) {
  const { updateDocumentFields } = useVendors();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(document.extractedFields.map(field => ({ key: field.key, value: field.value })));
  useEffect(() => setFields(document.extractedFields.map(field => ({ key: field.key, value: field.value }))), [document]);
  const save = async () => {
    try { await updateDocumentFields(vendorId, document.id, fields); toast.success('Extracted evidence updated'); setEditing(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save extracted evidence'); }
  };
  return <div className="rounded-xl border border-gray-100 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-bold text-gray-900">{document.fileName}</div><div className="mt-1 text-xs text-gray-500">{cleanLabel(document.documentType)} · {(document.size / 1024 / 1024).toFixed(1)} MB{document.subjectName ? ` · ${document.subjectName}` : ''}</div></div><StatusBadge status={document.extractionStatus === 'COMPLETED' ? 'PASSED' : document.extractionStatus === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED'} /></div>
    {!!document.extractedFields.length && <div className="mt-4 grid gap-3 sm:grid-cols-2">{document.extractedFields.map((field, index) => <label key={`${field.key}-${index}`} className="text-xs text-gray-500"><span className="flex justify-between"><span>{field.label}</span><span>{Math.round(field.confidence * 100)}%</span></span>{editing ? <input className={`${fieldClass} mt-1`} value={fields[index]?.value || ''} onChange={event => setFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /> : <div className="mt-1 font-medium text-gray-900">{field.value || '—'} <span className="block text-[10px] font-normal text-gray-400">{field.sourceReference}</span></div>}</label>)}</div>}
    {!!document.extractedFields.length && <div className="mt-4 flex justify-end gap-2">{editing ? <><button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500">Cancel</button><button onClick={save} className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-bold text-white">Save corrections</button></> : <button onClick={() => setEditing(true)} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-bold text-blue-800">Review extracted fields</button>}</div>}
  </div>;
}

function RequirementRow({ result }: { result: RequirementResult }) {
  const Icon = result.status === 'PASSED' ? CheckCircle2 : result.status === 'FAILED' ? XCircle : result.status === 'WARNING' ? AlertTriangle : Clock3;
  return <div className="flex items-start gap-3 rounded-xl border border-gray-100 p-4"><Icon className={`mt-0.5 h-5 w-5 shrink-0 ${result.status === 'PASSED' ? 'text-green-600' : result.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold text-gray-900">{result.ruleName}</div><StatusBadge status={result.status} /></div><div className="mt-1 text-sm text-gray-500">{result.subjectName} · {result.scope === 'PERSON' ? 'Person-level' : 'Company-level'}{result.blocking ? ' · Blocking' : ''}</div><div className="mt-2 text-sm text-gray-700">{result.reason}</div>{result.expiresAt && <div className="mt-1 text-xs text-gray-500">Valid until {displayDate(result.expiresAt)}</div>}</div></div>;
}

function ExternalVerificationCard({ vendorId, check }: { vendorId: string; check: ExternalVerification }) {
  const { recordManualVerification } = useVendors();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ status: 'PASSED' as 'PASSED' | 'WARNING' | 'FAILED', officialName: check.officialName || '', registrationNumber: check.registrationNumber || '', scope: check.scope || '', validUntil: check.validUntil || '', evidenceUrl: '', notes: '' });
  const submit = async () => {
    setSaving(true);
    try { await recordManualVerification(vendorId, check.id, form); toast.success('Official manual result recorded'); setOpen(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to record the manual result'); }
    finally { setSaving(false); }
  };
  return <div className="rounded-xl border border-gray-100 p-4">
    <div className="flex flex-wrap justify-between gap-2"><div className="font-bold">{cleanLabel(check.connector)}</div><StatusBadge status={check.status} /></div>
    <p className="mt-2 text-sm leading-6 text-gray-600">{check.summary}</p>
    <div className="mt-2 text-xs text-gray-400">{check.authority} · Checked {new Date(check.checkedAt).toLocaleString()}</div>
    <div className="mt-2 flex flex-wrap gap-2">{check.citations.map(citation => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{citation.title}</a>)}</div>
    {check.limitation && <div className="mt-2 text-xs font-medium text-amber-700">Limitation: {check.limitation}</div>}
    {['REVIEW_REQUIRED', 'UNAVAILABLE'].includes(check.status) && <button onClick={() => setOpen(value => !value)} className="mt-3 rounded-lg bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700">Record official manual result</button>}
    {open && <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
      <select className={fieldClass} value={form.status} onChange={event => setForm({...form, status: event.target.value as typeof form.status})}><option value="PASSED">Passed</option><option value="WARNING">Warning</option><option value="FAILED">Failed</option></select>
      <input className={fieldClass} value={form.officialName} onChange={event => setForm({...form, officialName: event.target.value})} placeholder="Official registered name" />
      <input className={fieldClass} value={form.registrationNumber} onChange={event => setForm({...form, registrationNumber: event.target.value})} placeholder="Registration / certificate number" />
      <input className={fieldClass} value={form.scope} onChange={event => setForm({...form, scope: event.target.value})} placeholder="Grade / category / competency scope" />
      <label className="text-xs text-gray-600">Valid until<input type="date" className={`${fieldClass} mt-1`} value={form.validUntil} onChange={event => setForm({...form, validUntil: event.target.value})} /></label>
      <input type="url" className={fieldClass} value={form.evidenceUrl} onChange={event => setForm({...form, evidenceUrl: event.target.value})} placeholder="Evidence URL (optional)" />
      <textarea className={`${fieldClass} sm:col-span-2`} rows={2} value={form.notes} onChange={event => setForm({...form, notes: event.target.value})} placeholder="Reviewer findings and evidence notes *" />
      <div className="flex justify-end gap-2 sm:col-span-2"><button onClick={() => setOpen(false)} className="px-3 py-2 text-xs font-bold text-gray-500">Cancel</button><button onClick={submit} disabled={saving || !form.notes.trim()} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save result'}</button></div>
    </div>}
  </div>;
}

function PerformanceForm({ vendor }: { vendor: Vendor }) {
  const { recordPerformance } = useVendors();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState('');
  const keys = ['quality', 'delivery', 'cost', 'service', 'safety', 'compliance'] as const;
  const [scores, setScores] = useState<Record<typeof keys[number], number>>({ quality: 80, delivery: 80, cost: 80, service: 80, safety: 80, compliance: 80 });
  const weights: Record<typeof keys[number], number> = { quality: 20, delivery: 20, cost: 15, service: 15, safety: 15, compliance: 15 };
  const submit = async () => {
    setSaving(true);
    try { await recordPerformance(vendor.id, { period: String(new Date().getFullYear()), scores, weights, comments }); toast.success('Annual performance review recorded'); setOpen(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save performance review'); }
    finally { setSaving(false); }
  };
  return <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-bold text-blue-950"><Gauge className="h-5 w-5" />Performance</div><button onClick={() => setOpen(value => !value)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Record annual review</button></div>{vendor.performanceAssessments[0] ? <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 p-4"><div><div className="text-sm font-bold">Latest score</div><div className="mt-1 text-xs text-gray-500">Period {vendor.performanceAssessments[0].period} · Next {displayDate(vendor.performanceAssessments[0].nextReviewDate)}</div></div><div className="text-3xl font-bold text-blue-800">{vendor.performanceAssessments[0].weightedScore}</div></div> : <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-gray-500">No annual review has been recorded.</div>}{open && <div className="mt-4 space-y-3 border-t pt-4"><div className="grid gap-3 sm:grid-cols-2">{keys.map(key => <label key={key} className="text-xs font-medium text-gray-600">{cleanLabel(key)} · weight {weights[key]}%<input type="number" min="0" max="100" className={`${fieldClass} mt-1`} value={scores[key]} onChange={event => setScores(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><textarea className={fieldClass} rows={2} value={comments} onChange={event => setComments(event.target.value)} placeholder="Reviewer comments" /><div className="flex justify-end"><button onClick={submit} disabled={saving} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save weighted review'}</button></div></div>}</div>;
}

function VendorDetail({ vendor, onBack }: { vendor: Vendor; onBack: () => void }) {
  const { configuration, jobs, uploadDocuments, runChecks, completeFollowUp, submitApproval, setLifecycleStatus, linkEntity } = useVendors();
  const { assets } = useAssets();
  const [fileList, setFileList] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState('OTHER');
  const [subjectId, setSubjectId] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [assetId, setAssetId] = useState('');
  const [relationship, setRelationship] = useState('MAINTENANCE_PROVIDER');
  const [operatorId, setOperatorId] = useState('');
  const [busy, setBusy] = useState(false);
  const activeJob = jobs.find(job => job.vendorId === vendor.id && !['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage));
  const nextStage = configuration?.approvalStages[vendor.currentApprovalStage];

  const upload = async () => {
    if (!fileList.length) return;
    setBusy(true);
    try { await uploadDocuments(vendor.id, fileList.map(file => ({ file, declaredType: documentType, subjectId: subjectId || undefined }))); toast.success('Background document verification started'); setFileList([]); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); try { await runChecks(vendor.id); toast.success('Compliance verification queued'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to start checks'); } finally { setBusy(false); }
  };
  const decide = async (decision: 'APPROVED' | 'CONDITIONAL' | 'REJECTED') => {
    setBusy(true); try { await submitApproval(vendor.id, decision, approvalNotes); toast.success('Approval decision recorded'); setApprovalNotes(''); } catch (error) { toast.error(error instanceof Error ? error.message : 'Decision could not be recorded'); } finally { setBusy(false); }
  };
  const changeLifecycle = async (status: 'SUSPENDED' | 'BLACKLISTED' | 'APPROVED') => {
    if (!lifecycleReason.trim()) return toast.error('Enter a reason for this lifecycle action');
    setBusy(true);
    try { await setLifecycleStatus(vendor.id, status, lifecycleReason); toast.success(status === 'APPROVED' ? 'Vendor reinstated' : `Vendor ${status.toLowerCase()}`); setLifecycleReason(''); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Lifecycle action could not be recorded'); }
    finally { setBusy(false); }
  };
  const addLink = async () => {
    const asset = assets.find(item => item.id === assetId); if (!asset) return;
    setBusy(true); try { await linkEntity(vendor.id, { entityType: 'ASSET', entityId: asset.id, entityName: `${asset.name} (${asset.registrationNumber})`, relationship, personnelId: relationship === 'OPERATOR' ? operatorId : undefined }); toast.success('Asset linked to vendor'); setAssetId(''); setOperatorId(''); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to link asset'); } finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><button onClick={onBack} className="mt-1 rounded-full p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-800"><ArrowLeft className="h-5 w-5" /></button><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-blue-950">{vendor.legalName}</h1><StatusBadge status={vendor.onboardingStatus} /></div><div className="mt-1 text-sm text-gray-500">{vendor.registrationNumber} · {vendor.categoryName} · Rule pack v{vendor.ruleVersion}</div></div></div><button onClick={verify} disabled={busy || !!activeJob} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Run compliance checks</button></div>
    {activeJob && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="flex justify-between text-sm"><span className="font-bold text-blue-900">{cleanLabel(activeJob.stage)}</span><span className="text-blue-700">{activeJob.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-700 transition-all" style={{ width: `${activeJob.progress}%` }} /></div><div className="mt-2 text-xs text-blue-700">{activeJob.message}</div></div>}

    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-gray-400">AI-assisted outcome</div><div className="mt-2 text-xl font-bold text-blue-950">{cleanLabel(vendor.recommendation)}</div></div><StatusBadge status={vendor.recommendation === 'RECOMMEND_APPROVE' ? 'PASSED' : vendor.recommendation === 'RECOMMEND_REJECT' ? 'FAILED' : 'REVIEW_REQUIRED'} /></div><p className="mt-3 text-sm leading-6 text-gray-600">{vendor.recommendationSummary}</p><div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">AI findings support the review. Admin User remains responsible for the final decision.</div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><ClipboardCheck className="h-5 w-5" />Applicable requirements</div><div className="mt-4 space-y-3">{vendor.requirementResults.map(result => <RequirementRow key={result.id} result={result} />)}{!vendor.requirementResults.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">Run the rule engine to calculate requirements.</div>}</div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><FileSearch className="h-5 w-5" />Documents and extracted evidence</div><div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-3"><select className={fieldClass} value={documentType} onChange={event => setDocumentType(event.target.value)}>{vendorDocumentTypes.map(type => <option key={type} value={type}>{cleanLabel(type)}</option>)}</select><select className={fieldClass} value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Company evidence</option>{vendor.personnel.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-bold text-blue-800"><Upload className="h-4 w-4" />{fileList.length ? `${fileList.length} selected` : 'Choose files'}<input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt" onChange={event => setFileList(Array.from(event.target.files || []))} /></label><button onClick={upload} disabled={!fileList.length || busy} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-start-3">Upload and verify</button></div><div className="mt-4 space-y-3">{vendor.documents.map(document => <DocumentEvidenceCard key={document.id} vendorId={vendor.id} document={document} />)}{!vendor.documents.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">No supporting documents uploaded.</div>}</div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><ShieldAlert className="h-5 w-5" />External verification</div><div className="mt-4 space-y-3">{vendor.verifications.map(check => <ExternalVerificationCard key={check.id} vendorId={vendor.id} check={check} />)}{!vendor.verifications.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">External checks have not run.</div>}</div></section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Building2 className="h-5 w-5" />Vendor profile</div><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-gray-400">Contact</dt><dd className="font-medium">{vendor.contactName || 'Not recorded'}</dd></div><div><dt className="text-gray-400">Email</dt><dd className="font-medium">{vendor.email || 'Not recorded'}</dd></div><div><dt className="text-gray-400">Services</dt><dd className="font-medium">{vendor.services.join(', ') || 'Not recorded'}</dd></div><div><dt className="text-gray-400">Activities</dt><dd className="mt-1 flex flex-wrap gap-1">{vendor.activityTags.map(tag => <span key={tag} className="rounded bg-gray-100 px-2 py-1 text-xs">{cleanLabel(tag)}</span>)}</dd></div></dl></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Users className="h-5 w-5" />Personnel compliance</div><div className="mt-4 space-y-3">{vendor.personnel.map(person => { const results = vendor.requirementResults.filter(result => result.subjectId === person.id); return <div key={person.id} className="rounded-xl border border-gray-100 p-3"><div className="flex justify-between"><div><div className="text-sm font-bold">{person.name}</div><div className="text-xs text-gray-500">{cleanLabel(person.role)} · {person.identityMasked || 'ID not supplied'}</div></div><StatusBadge status={results.some(item => item.status === 'FAILED') ? 'FAILED' : results.every(item => item.status === 'PASSED') && results.length ? 'PASSED' : 'REVIEW_REQUIRED'} /></div><div className="mt-2 text-xs text-gray-500">{results.length} applicable requirement(s)</div></div>})}{!vendor.personnel.length && <div className="text-sm text-gray-500">No personnel supplied.</div>}</div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Link2 className="h-5 w-5" />Linked assets</div><div className="mt-4 space-y-2">{(vendor.entityLinks || []).map(link => <div key={link.id} className="rounded-lg bg-gray-50 p-3"><div className="text-sm font-bold">{link.entityName}</div><div className="text-xs text-gray-500">{cleanLabel(link.relationship)}{link.personnelName ? ` · ${link.personnelName}` : ''}</div></div>)}{!(vendor.entityLinks || []).length && <div className="text-sm text-gray-500">No assets linked.</div>}</div><div className="mt-4 space-y-2 border-t pt-4"><select className={fieldClass} value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">Select Asset Management record</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} ({asset.registrationNumber})</option>)}</select><select className={fieldClass} value={relationship} onChange={event => { setRelationship(event.target.value); if (event.target.value !== 'OPERATOR') setOperatorId(''); }}><option value="OPERATOR">Operator</option><option value="MAINTENANCE_PROVIDER">Maintenance provider</option><option value="INSTALLER">Installer</option><option value="INSPECTOR">Inspector</option><option value="SUPPLIER">Supplier</option><option value="LICENCE_HOLDER">Licence holder</option></select>{relationship === 'OPERATOR' && <select className={fieldClass} value={operatorId} onChange={event => setOperatorId(event.target.value)}><option value="">Select qualified operator</option>{vendor.personnel.map(person => <option key={person.id} value={person.id}>{person.name} · {cleanLabel(person.role)}</option>)}</select>}<button onClick={addLink} disabled={!assetId || busy || (relationship === 'OPERATOR' && !operatorId)} className="w-full rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-50">Link asset</button></div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Clock3 className="h-5 w-5" />Follow-up actions</div><div className="mt-4 space-y-3">{vendor.followUps.filter(item => item.status !== 'COMPLETED').slice(0, 8).map(item => <div key={item.id} className="rounded-xl border border-gray-100 p-3"><div className="text-sm font-bold">{item.title}</div><div className="mt-1 text-xs text-gray-500">Due {displayDate(item.dueDate)} · {item.owner}</div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-bold text-blue-700">Open official source</a>}<button onClick={() => completeFollowUp(vendor.id, item.id)} className="mt-2 text-xs font-bold text-green-700">Mark completed</button></div>)}{!vendor.followUps.some(item => item.status !== 'COMPLETED') && <div className="text-sm text-gray-500">No open follow-ups.</div>}</div></section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><GitBranch className="h-5 w-5" />Approval workflow</div>{nextStage && !['APPROVED', 'CONDITIONALLY_APPROVED', 'REJECTED', 'SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus) && <div className="mt-4"><div className="text-sm font-bold">Stage {vendor.currentApprovalStage + 1}: {nextStage.name}</div><div className="mt-1 text-xs text-gray-500">Required role: {nextStage.requiredRole} · Acting as Admin User</div><textarea className={`${fieldClass} mt-3`} rows={2} value={approvalNotes} onChange={event => setApprovalNotes(event.target.value)} placeholder="Decision notes" /><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => decide('REJECTED')} disabled={busy} className="rounded-lg bg-red-50 px-2 py-2 text-xs font-bold text-red-700">Reject</button><button onClick={() => decide('CONDITIONAL')} disabled={busy} className="rounded-lg bg-amber-50 px-2 py-2 text-xs font-bold text-amber-700">Conditional</button><button onClick={() => decide('APPROVED')} disabled={busy || vendor.recommendation !== 'RECOMMEND_APPROVE'} className="rounded-lg bg-green-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-40">Approve</button></div></div>}<div className="mt-4 space-y-2">{vendor.approvals.map(event => <div key={event.id} className="border-t pt-3 text-xs"><div className="font-bold">{event.stageName}: {event.decision}</div><div className="mt-1 text-gray-500">{event.actor} · {new Date(event.createdAt).toLocaleString()}</div></div>)}</div></section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="font-bold text-blue-950">Lifecycle controls</div><p className="mt-1 text-xs text-gray-500">Every suspension, blacklist or reinstatement is added to the audit trail.</p><textarea className={`${fieldClass} mt-3`} rows={2} value={lifecycleReason} onChange={event => setLifecycleReason(event.target.value)} placeholder="Required reason" /><div className="mt-3 grid grid-cols-2 gap-2">{['SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus) ? <button onClick={() => changeLifecycle('APPROVED')} disabled={busy || vendor.recommendation !== 'RECOMMEND_APPROVE'} className="col-span-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700 disabled:opacity-40">Reinstate vendor</button> : <><button onClick={() => changeLifecycle('SUSPENDED')} disabled={busy} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Suspend</button><button onClick={() => changeLifecycle('BLACKLISTED')} disabled={busy} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Blacklist</button></>}</div></section>
        <PerformanceForm vendor={vendor} />
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="font-bold text-blue-950">Audit trail</div><div className="mt-4 space-y-3">{vendor.auditTrail.slice(0, 10).map(event => <div key={event.id} className="border-l-2 border-blue-100 pl-3"><div className="text-xs font-bold">{cleanLabel(event.type)}</div><div className="mt-1 text-xs text-gray-500">{event.summary}</div><div className="mt-1 text-[10px] text-gray-400">{event.actor} · {new Date(event.createdAt).toLocaleString()}</div></div>)}</div></section>
      </aside>
    </div>
  </div>;
}

export function Vendors() {
  const { vendors, dashboard, isLoading, completeFollowUp } = useVendors();
  const [view, setView] = useState<View>('dashboard');
  const [search, setSearch] = useState('');
  const [wizard, setWizard] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = vendors.find(vendor => vendor.id === selectedId);
  const filtered = vendors.filter(vendor => `${vendor.legalName} ${vendor.registrationNumber} ${vendor.categoryName}`.toLowerCase().includes(search.toLowerCase()));
  const openFollowUps = useMemo(() => vendors.flatMap(vendor => vendor.followUps.filter(item => item.status !== 'COMPLETED').map(item => ({ vendor, item }))), [vendors]);
  const expiries = useMemo(() => vendors.flatMap(vendor => vendor.documents.flatMap(document => { const expiry = document.extractedFields.find(field => field.key === 'expiryDate')?.value; return expiry ? [{ vendor, document, expiry }] : []; })).sort((a, b) => a.expiry.localeCompare(b.expiry)), [vendors]);

  if (selected) return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><VendorDetail vendor={selected} onBack={() => setSelectedId(null)} /></div>;
  const tabs: Array<[View, string]> = [['dashboard', 'Dashboard'], ['register', 'Vendor Register'], ['followups', 'Follow-ups'], ['expiries', 'Expiries'], ['performance', 'Performance'], ['rules', 'Rule Configuration']];

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-blue-950">Vendor Management</h1><p className="mt-1 text-sm text-gray-500">AI-assisted onboarding, company and personnel compliance, approvals and lifecycle monitoring.</p></div><div className="flex gap-2"><button onClick={() => setBulk(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700"><Upload className="h-4 w-4" />Bulk import</button><button onClick={() => setWizard(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Start onboarding</button></div></div>
    <div className="overflow-x-auto border-b border-gray-200"><nav className="flex min-w-max gap-1">{tabs.map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`border-b-2 px-4 py-3 text-sm font-bold ${view === id ? 'border-blue-800 text-blue-900' : 'border-transparent text-gray-500'}`}>{label}</button>)}</nav></div>

    {isLoading ? <div className="flex min-h-80 items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading vendor management…</div> : <>
      {view === 'dashboard' && <div className="space-y-6">{!vendors.length ? <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-8 text-white shadow-sm lg:p-10"><div className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">Vendor compliance workspace</div><h2 className="mt-3 max-w-2xl text-3xl font-bold">Turn unstructured vendor evidence into a controlled onboarding decision.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-blue-100">Start with a vendor profile or bulk master file. The system determines CIDB, DOSH, OSHA and commercial requirements from the declared work and personnel roles.</p><button onClick={() => setWizard(true)} className="mt-7 inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-950"><Plus className="h-5 w-5" />Onboard first vendor</button></div> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
        ['Total vendors', dashboard?.totalVendors || 0, Building2, 'bg-blue-50 text-blue-700'], ['In onboarding', dashboard?.onboarding || 0, Clock3, 'bg-indigo-50 text-indigo-700'], ['Review required', dashboard?.reviewRequired || 0, ShieldAlert, 'bg-purple-50 text-purple-700'], ['Non-compliant', dashboard?.nonCompliant || 0, AlertTriangle, 'bg-red-50 text-red-700'],
      ] as Array<[string, number, LucideIcon, string]>).map(([label, value, Icon, color]) => <div key={label} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div><div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div></div><div className={`rounded-xl p-3 ${color}`}><Icon className="h-5 w-5" /></div></div>)}</div><div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="font-bold text-blue-950">Recent vendors</div><button onClick={() => setView('register')} className="text-sm font-bold text-blue-700">View register</button></div><div className="mt-4 divide-y">{vendors.slice(0, 6).map(vendor => <button key={vendor.id} onClick={() => setSelectedId(vendor.id)} className="flex w-full items-center justify-between gap-3 py-4 text-left"><div><div className="font-bold">{vendor.legalName}</div><div className="mt-1 text-xs text-gray-500">{vendor.categoryName} · {vendor.registrationNumber}</div></div><div className="flex items-center gap-2"><StatusBadge status={vendor.onboardingStatus} /><ChevronRight className="h-4 w-4 text-gray-300" /></div></button>)}</div></section><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Bell className="h-5 w-5" />Expiry notifications</div><div className="mt-4 space-y-3">{dashboard?.notifications.slice(0, 6).map(item => <div key={item.id} className="rounded-lg bg-gray-50 p-3"><div className="text-sm font-bold">{item.vendorName}</div><div className="mt-1 text-xs text-gray-600">{item.title}: {item.message}</div></div>)}{!dashboard?.notifications.length && <div className="text-sm text-gray-500">No expiry alerts today.</div>}</div><div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="text-gray-500">Demo email outbox</span><span className="font-bold text-blue-800">{dashboard?.outbox.length || 0}</span></div></section></div></>}</div>}

      {view === 'register' && <section className="rounded-xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-bold text-blue-950">Vendor Register</h2><p className="mt-1 text-sm text-gray-500">{vendors.length} vendor record(s)</p></div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input className="rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vendors" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Recommendation</th><th className="px-5 py-3">Personnel</th><th className="px-5 py-3">Open actions</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y">{filtered.map(vendor => <tr key={vendor.id}><td className="px-5 py-4"><div className="font-bold">{vendor.legalName}</div><div className="text-xs text-gray-500">{vendor.registrationNumber}</div></td><td className="px-5 py-4">{vendor.categoryName}</td><td className="px-5 py-4"><StatusBadge status={vendor.onboardingStatus} /></td><td className="px-5 py-4 text-xs font-medium">{cleanLabel(vendor.recommendation)}</td><td className="px-5 py-4">{vendor.personnel.length}</td><td className="px-5 py-4">{vendor.followUps.filter(item => item.status !== 'COMPLETED').length}</td><td className="px-5 py-4"><button onClick={() => setSelectedId(vendor.id)} className="font-bold text-blue-700">Open</button></td></tr>)}</tbody></table></div></section>}

      {view === 'followups' && <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Clock3 className="h-5 w-5" />Pending follow-up actions</div><div className="mt-4 space-y-3">{openFollowUps.map(({ vendor, item }) => <div key={`${vendor.id}-${item.id}`} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><button onClick={() => setSelectedId(vendor.id)} className="font-bold text-blue-900">{vendor.legalName}</button><div className="mt-1 text-sm font-medium">{item.title}</div><div className="mt-1 text-xs text-gray-500">Due {displayDate(item.dueDate)} · {item.owner}</div></div><div className="flex gap-2">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-bold text-blue-700">Official source</a>}<button onClick={() => completeFollowUp(vendor.id, item.id)} className="rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700">Complete</button></div></div>)}{!openFollowUps.length && <div className="py-10 text-center text-gray-500">No pending follow-up actions.</div>}</div></section>}

      {view === 'expiries' && <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Bell className="h-5 w-5" />Document and licence expiries</div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Expiry</th></tr></thead><tbody className="divide-y">{expiries.map(item => <tr key={item.document.id}><td className="px-4 py-4"><button onClick={() => setSelectedId(item.vendor.id)} className="font-bold text-blue-800">{item.vendor.legalName}</button></td><td className="px-4 py-4">{cleanLabel(item.document.documentType)}</td><td className="px-4 py-4">{item.document.subjectName || 'Company'}</td><td className="px-4 py-4 font-bold">{displayDate(item.expiry)}</td></tr>)}</tbody></table>{!expiries.length && <div className="py-10 text-center text-gray-500">No extracted expiry dates yet.</div>}</div></section>}

      {view === 'performance' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vendors.map(vendor => <button key={vendor.id} onClick={() => setSelectedId(vendor.id)} className="rounded-xl border border-gray-100 bg-white p-5 text-left shadow-sm"><div className="flex justify-between"><div className="font-bold">{vendor.legalName}</div><Gauge className="h-5 w-5 text-blue-700" /></div>{vendor.performanceAssessments[0] ? <><div className="mt-4 text-3xl font-bold text-blue-800">{vendor.performanceAssessments[0].weightedScore}</div><div className="mt-1 text-xs text-gray-500">Next review {displayDate(vendor.performanceAssessments[0].nextReviewDate)}</div></> : <div className="mt-4 text-sm text-amber-700">Annual performance review required</div>}</button>)}</div>}
      {view === 'rules' && <VendorRuleBuilder />}
    </>}

    <VendorOnboardingWizard open={wizard} onClose={() => setWizard(false)} onCreated={vendor => setSelectedId(vendor.id)} />
    <BulkVendorImportModal open={bulk} onClose={() => setBulk(false)} />
  </div>;
}
