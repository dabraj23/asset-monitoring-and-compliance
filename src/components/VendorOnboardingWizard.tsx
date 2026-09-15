import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, FileSearch, FileSpreadsheet, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVendors } from '../context/VendorContext';
import { CreateVendorInput, Vendor, VendorChecklistPreview, VendorIntakeCase, vendorActivityOptions, vendorPersonnelRoles } from '../vendorTypes';
import { useEntity } from '../context/EntityContext';

interface VendorOnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: Vendor) => void;
}

const steps = ['Vendor profile', 'Applicability', 'Personnel', 'Documents', 'Review'];
const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';
const doshRoles = ['CRANE_OPERATOR', 'SCAFFOLD_OPERATOR', 'BOILER_OPERATOR'] as const;
const doshRoleLabels: Record<(typeof doshRoles)[number], string> = { CRANE_OPERATOR: 'Crane operator', SCAFFOLD_OPERATOR: 'Scaffold operator', BOILER_OPERATOR: 'Boiler / pressure equipment operator' };
const parseCsv = (text: string) => {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = '';
    } else value += character;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
};
const parseYesNo = (value = '') => value.trim() ? ['yes', 'y', 'true', '1', 'required'].includes(value.trim().toLowerCase()) : undefined;

function ChecklistPreviewPanel({ checklist, intakeCase }: { checklist?: VendorChecklistPreview; intakeCase?: VendorIntakeCase }) {
  if (!checklist) return null;
  return <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4"><div className="flex flex-wrap justify-between gap-2"><div className="font-bold text-blue-950">Initial onboarding checklist · rule pack v{checklist.ruleVersion}</div><div className="text-xs text-blue-700">{checklist.items.filter(item => item.source === 'UPLOAD').length} evidence request(s)</div></div><p className="mt-1 text-xs text-blue-800">Generated from the selected category. It updates as work activities and named personnel are confirmed. Missing items remain pending—not failed.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{checklist.items.map(item => { const received = !!item.documentType && intakeCase?.documents.some(document => document.documentType === item.documentType && document.status !== 'QUEUED'); return <div key={item.id} className="rounded-lg border border-blue-100 bg-white p-3 text-xs"><div className="flex justify-between gap-2"><strong>{item.name}{item.subjectName ? ` · ${item.subjectName}` : ''}</strong><span className={received ? 'font-bold text-green-700' : 'font-bold text-blue-700'}>{item.source === 'CONTRACT' ? 'Link contract' : item.source === 'SYSTEM' ? 'System check' : received ? 'Received' : 'Request'}</span></div><div className="mt-1 text-gray-500">{item.documentType?.replaceAll('_', ' ') || (item.source === 'CONTRACT' ? 'Verified from Contract Management' : 'No document upload required')}{item.blocking ? ' · Required' : ' · Optional'}</div></div>; })}</div></div>;
}
const emptyInput = (): CreateVendorInput => ({
  legalName: '', registrationNumber: '', categoryId: '', services: [], activityTags: [],
  contactName: '', email: '', phone: '', address: '', personnel: [],
  taxProfile: { tin: '', msic: '', businessActivity: '', sstNumber: '', tourismTaxNumber: '' },
});

export function VendorOnboardingWizard({ open, onClose, onCreated }: VendorOnboardingWizardProps) {
  const { configuration, createVendor } = useVendors();
  const { entities, selectedEntityId } = useEntity();
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<CreateVendorInput>(emptyInput);
  const [serviceText, setServiceText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillProgress, setPrefillProgress] = useState({ done: 0, total: 0 });
  const [prefillNotes, setPrefillNotes] = useState<string[]>([]);
  const [intakeCase, setIntakeCase] = useState<VendorIntakeCase>();
  const [savedCases, setSavedCases] = useState<VendorIntakeCase[]>([]);
  const [checklist, setChecklist] = useState<VendorChecklistPreview>();
  const [showRosterImport, setShowRosterImport] = useState(false);
  const [rosterText, setRosterText] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(0); setInput({ ...emptyInput(), entityId: selectedEntityId }); setServiceText(''); setFiles([]); setError(''); setSaving(false); setPrefillNotes([]); setPrefillProgress({ done: 0, total: 0 }); setIntakeCase(undefined); setShowRosterImport(false); setRosterText('');
    fetch('/api/vendor-intakes').then(async response => response.ok ? response.json() as Promise<VendorIntakeCase[]> : []).then(cases => setSavedCases(cases.filter(item => item.stage !== 'COMMITTED'))).catch(() => setSavedCases([]));
  }, [open, selectedEntityId]);

  useEffect(() => {
    if (!open || !input.entityId || !input.categoryId) { setChecklist(undefined); return; }
    const controller = new AbortController();
    fetch('/api/vendor-checklist-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ entityId: input.entityId, categoryId: input.categoryId, activityTags: input.activityTags, personnel: input.personnel }) })
      .then(async response => { if (!response.ok) throw new Error('Checklist unavailable'); return response.json() as Promise<VendorChecklistPreview>; })
      .then(setChecklist).catch(() => { if (!controller.signal.aborted) setChecklist(undefined); });
    return () => controller.abort();
  }, [open, input.entityId, input.categoryId, input.activityTags, input.personnel]);

  if (!open || !configuration) return null;

  const update = <K extends keyof CreateVendorInput>(key: K, value: CreateVendorInput[K]) => {
    setInput(current => ({ ...current, [key]: value }));
    setError('');
  };

  const validate = () => {
    if (step === 0 && (!input.entityId || !input.legalName.trim() || !input.registrationNumber.trim() || !input.categoryId)) return 'Select an entity and provide vendor name, registration number and category.';
    if (step === 1 && !input.services.length && !input.activityTags.length) return 'Add at least one service or work activity.';
    if (step === 2 && input.activityTags.includes('SITE_ACCESS') && !input.personnel.length) return 'Add the personnel who will enter construction sites.';
    if (step === 2 && input.personnel.some(person => !person.name.trim() || !person.role.trim())) return 'Every personnel record needs a name and role.';
    if (step === 2 && input.personnel.some(person => person.cidbCheckRequired === undefined || person.doshCheckRequired === undefined)) return 'Answer the CIDB and DOSH applicability questions for every person.';
    if (step === 2 && input.personnel.some(person => (person.cidbCheckRequired || person.doshCheckRequired) && !person.identityNumber.trim())) return 'MyKad or passport number is required for every person selected for CIDB or DOSH checking.';
    if (step === 2 && input.personnel.some(person => person.doshCheckRequired && !doshRoles.some(role => person.role === role || person.complianceRoles?.includes(role)))) return 'Select at least one DOSH competency type for every person requiring a DOSH check.';
    return '';
  };

  const next = () => {
    const message = validate();
    if (message) return setError(message);
    setStep(current => Math.min(current + 1, steps.length - 1));
  };

  const toggleActivity = (value: string) => update('activityTags', input.activityTags.includes(value)
    ? input.activityTags.filter(item => item !== value)
    : [...input.activityTags, value]);

  const addPerson = () => update('personnel', [...input.personnel, { name: '', role: 'GENERAL_WORKER', identityNumber: '', siteAssignment: '', complianceRoles: [], cidbCheckRequired: undefined, doshCheckRequired: undefined, cidbRegistrationNumber: '', doshRegistrationNumber: '', competencyScope: '' }]);
  const updatePerson = (index: number, key: keyof CreateVendorInput['personnel'][number], value: string | boolean | string[] | undefined) => update('personnel', input.personnel.map((person, personIndex) => personIndex === index ? { ...person, [key]: value } : person));
  const removePerson = (index: number) => update('personnel', input.personnel.filter((_, personIndex) => personIndex !== index));
  const toggleComplianceRole = (index: number, role: string) => {
    const current = input.personnel[index].complianceRoles || [];
    updatePerson(index, 'complianceRoles', current.includes(role) ? current.filter(item => item !== role) : [...current, role]);
  };
  const importRoster = () => {
    const rows = parseCsv(rosterText);
    if (!rows.length) return toast.error('Paste a staff list or choose a CSV file first.');
    const normalized = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const hasHeader = normalized.some(value => ['name', 'fullname', 'role', 'identitynumber', 'mykadpassport', 'cidbrequired', 'doshrequired'].includes(value));
    const header = hasHeader ? normalized : [];
    const column = (row: string[], names: string[], fallback: number) => {
      const index = header.findIndex(value => names.includes(value)); return row[index >= 0 ? index : fallback] || '';
    };
    const records = (hasHeader ? rows.slice(1) : rows).map(row => {
      const roleValue = column(row, ['role', 'jobrole'], 1).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      const role = vendorPersonnelRoles.includes(roleValue as (typeof vendorPersonnelRoles)[number]) ? roleValue : 'OTHER';
      const complianceRoles = column(row, ['complianceroles', 'doshcompetencytype'], 6).split(/[|;]/).map(value => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')).filter(value => doshRoles.includes(value as (typeof doshRoles)[number]));
      return {
        name: column(row, ['name', 'fullname'], 0), role, identityNumber: column(row, ['identitynumber', 'mykadpassport', 'mykad', 'passport'], 2), siteAssignment: column(row, ['site', 'siteassignment', 'project'], 3),
        cidbCheckRequired: parseYesNo(column(row, ['cidbrequired', 'checkcidb'], 4)), doshCheckRequired: parseYesNo(column(row, ['doshrequired', 'checkdosh'], 5)), complianceRoles,
        cidbRegistrationNumber: column(row, ['cidbregistrationnumber', 'cidbnumber'], 7), doshRegistrationNumber: column(row, ['doshregistrationnumber', 'doshnumber'], 8), competencyScope: column(row, ['competencyscope', 'grade'], 9),
      };
    }).filter(person => person.name);
    if (!records.length) return toast.error('No staff names were found in the list.');
    update('personnel', [...input.personnel, ...records]); setRosterText(''); setShowRosterImport(false); toast.success(`${records.length} staff record(s) added. Review the CIDB and DOSH answers before continuing.`);
  };
  const readRosterFile = async (file?: File) => { if (!file) return; setRosterText(await file.text()); setShowRosterImport(true); };
  const chooseFiles = (selected: File[]) => { const combined = [...files, ...selected].filter((file, index, all) => all.findIndex(item => item.name === file.name && item.size === file.size) === index); if (combined.length + (intakeCase?.stage === 'UPLOADING' ? intakeCase.documents.length : 0) > 25) return toast.error('Select no more than 25 files.'); setFiles(combined); if (intakeCase?.stage !== 'UPLOADING') setIntakeCase(undefined); setPrefillNotes([]); };
  const applyIntake = (item: VendorIntakeCase) => {
    setIntakeCase(item); setFiles([]);
    setInput(current => ({ ...current, ...Object.fromEntries(Object.entries(item.proposed).filter(([, value]) => value !== undefined)), entityId: item.entityId, taxProfile: { ...current.taxProfile!, ...item.proposed.taxProfile }, personnel: current.personnel, activityTags: current.activityTags }));
    setServiceText(item.proposed.services?.join(', ') || '');
    setPrefillNotes([...item.conflicts, ...item.documents.map(document => `${document.fileName}: ${document.documentType.replaceAll('_', ' ')} · ${document.status}${document.sourceReference ? ` · ${document.sourceReference}` : ''}`)]);
  };
  const resumeIntake = async (id: string) => {
    try { const response = await fetch(`/api/vendor-intakes/${id}`); const item = await response.json() as VendorIntakeCase; if (!response.ok) throw new Error('The saved intake could not be loaded.'); applyIntake(item); toast.success('Saved intake restored.'); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Unable to restore intake.'); }
  };
  const prefill = async () => {
    if (!input.entityId || !files.length && !(intakeCase?.stage === 'UPLOADING' && intakeCase.documents.length)) return toast.error('Choose a responsible entity and at least one document first.');
    setPrefilling(true); setPrefillProgress({ done: 0, total: files.length + (intakeCase?.stage === 'UPLOADING' ? intakeCase.documents.length : 0) });
    try {
      const call = async <T,>(url: string, body?: unknown): Promise<T> => { const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Vendor intake request failed.'); return result as T; };
      const created = intakeCase?.stage === 'UPLOADING' && intakeCase.entityId === input.entityId ? intakeCase : await call<VendorIntakeCase>('/api/vendor-intakes', { entityId: input.entityId });
      setIntakeCase(created);
      for (const [index, file] of files.entries()) {
        if (created.documents.some(document => document.fileName === file.name && document.size === file.size)) { setPrefillProgress({ done: index + 1 + created.documents.length, total: files.length + created.documents.length }); continue; }
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} exceeds 10 MB.`);
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(file); });
        const mimeType = file.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
        await call<VendorIntakeCase>(`/api/vendor-intakes/${created.id}/files`, { file: { fileName: file.name, mimeType, data } });
        setPrefillProgress({ done: index + 1 + created.documents.length, total: files.length + created.documents.length });
      }
      await call<VendorIntakeCase>(`/api/vendor-intakes/${created.id}/process`, {});
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const state = await call<VendorIntakeCase>(`/api/vendor-intakes/${created.id}`);
        setIntakeCase(state); setPrefillProgress({ done: Math.round(state.progress / 100 * state.documents.length), total: state.documents.length });
        if (['READY_FOR_REVIEW', 'PARTIAL', 'FAILED'].includes(state.stage)) { applyIntake(state); toast.success('Background intake finished. Confirm proposed values and review exceptions.'); return; }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      toast.warning('Reading continues in the background. Reopen this intake case later.');
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Document prefill failed'); }
    finally { setPrefilling(false); }
  };

  const submit = async () => {
    setSaving(true); setError('');
    try {
      if (files.length && !intakeCase) throw new Error('Run background document prefill before submitting these files. This preserves the originals and makes the case recoverable.');
      let vendor: Vendor;
      if (intakeCase) {
        const response = await fetch(`/api/vendor-intakes/${intakeCase.id}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to confirm vendor intake.');
        vendor = result.vendor; toast.success('Vendor created; persisted background verification started.');
      } else { vendor = await createVendor(input); toast.success('Vendor draft created'); }
      onCreated(vendor);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create this vendor.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="vendor-wizard-title">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
          <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Vendor onboarding</div><h2 id="vendor-wizard-title" className="mt-1 text-xl font-bold text-gray-950">Start a vendor review</h2></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close vendor onboarding"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-gray-100 px-5 py-4 sm:px-7">
          <ol className="grid grid-cols-5 gap-2">{steps.map((label, index) => <li key={label} className="min-w-0"><div className={`h-1.5 rounded-full ${index <= step ? 'bg-blue-700' : 'bg-gray-200'}`} /><div className={`mt-2 truncate text-xs font-medium ${index === step ? 'text-blue-700' : 'text-gray-400'}`}>{index + 1}. {label}</div></li>)}</ol>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          {step === 0 && <div>
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Building2 className="h-6 w-6" /></span><div><h3 className="text-lg font-bold">Vendor profile</h3><p className="text-sm text-gray-500">Capture the legal identity used for document and registry matching.</p></div></div>
            <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="font-bold text-indigo-900">Start with documents</div>
              <p className="mt-1 text-xs text-indigo-700">Select the responsible legal entity, then upload an SSM profile, e-Invoice details, licences or other evidence. Originals and reading progress are saved before the vendor record is created.</p>
              <label className="mt-3 block max-w-xl"><span className={labelClass}>Responsible legal entity *</span><select className={fieldClass} value={input.entityId || ''} onChange={event => { update('entityId', event.target.value); setIntakeCase(undefined); }}><option value="">Select entity before document intake</option>{entities.filter(entity => entity.active).map(entity => <option key={entity.id} value={entity.id}>{entity.legalName}</option>)}</select></label>
              <div className="mt-3 flex flex-wrap gap-2"><label className="cursor-pointer rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700">{files.length ? `${files.length} file(s) selected` : 'Choose files'}<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.csv,.txt" className="hidden" onChange={event => chooseFiles(Array.from(event.target.files || []))} /></label><button disabled={prefilling || !input.entityId || !files.length && !(intakeCase?.stage === 'UPLOADING' && intakeCase.documents.length)} onClick={prefill} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{prefilling ? `Processing ${prefillProgress.done} of ${prefillProgress.total}…` : `Stage and read ${files.length || intakeCase?.documents.length || 'selected'} files`}</button></div>
              {prefilling && <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full bg-indigo-700 transition-all" style={{ width: `${Math.round(prefillProgress.done / Math.max(prefillProgress.total, 1) * 100)}%` }} /></div>}
              {intakeCase && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-indigo-800">Saved intake {intakeCase.id.slice(0, 8)} · {intakeCase.stage.replaceAll('_', ' ')} · {intakeCase.documents.length} file(s)<button onClick={() => void resumeIntake(intakeCase.id)} className="rounded border border-indigo-200 bg-white px-2 py-1">Refresh case</button></div>}
              <p className="mt-2 text-xs text-indigo-700">Background reading continues if this screen closes. Low-confidence or unavailable AI results stay in manual review; no value is silently verified.</p>
              {savedCases.filter(item => item.entityId === input.entityId && !['COMMITTED', 'FAILED'].includes(item.stage)).length > 0 && <div className="mt-3 border-t border-indigo-200 pt-3"><div className="text-xs font-bold text-indigo-900">Resume saved intake</div><div className="mt-2 flex flex-wrap gap-2">{savedCases.filter(item => item.entityId === input.entityId && !['COMMITTED', 'FAILED'].includes(item.stage)).map(item => <button key={item.id} onClick={() => void resumeIntake(item.id)} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700">{item.id.slice(0, 8)} · {item.stage.replaceAll('_', ' ')} · {item.documents.length} files</button>)}</div></div>}
              {prefillNotes.length > 0 && <div className="mt-3 space-y-1 text-xs text-amber-800">{prefillNotes.map((note, index) => <div key={index}>{note}</div>)}</div>}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Legal company name *</span><input className={fieldClass} value={input.legalName} onChange={event => update('legalName', event.target.value)} /></label>
              <label><span className={labelClass}>Registration number *</span><input className={fieldClass} value={input.registrationNumber} onChange={event => update('registrationNumber', event.target.value)} /></label>
              <label><span className={labelClass}>Vendor category *</span><select className={fieldClass} value={input.categoryId} onChange={event => update('categoryId', event.target.value)}><option value="">Select category</option>{configuration.categories.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span className={labelClass}>Contact person</span><input className={fieldClass} value={input.contactName} onChange={event => update('contactName', event.target.value)} /></label>
              <label><span className={labelClass}>Email</span><input type="email" className={fieldClass} value={input.email} onChange={event => update('email', event.target.value)} /></label>
              <label><span className={labelClass}>Phone</span><input className={fieldClass} value={input.phone} onChange={event => update('phone', event.target.value)} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Registered address</span><textarea rows={2} className={fieldClass} value={input.address} onChange={event => update('address', event.target.value)} /></label>
            </div>
            <ChecklistPreviewPanel checklist={checklist} intakeCase={intakeCase} />
            <div className="mt-6 rounded-xl border border-gray-200 p-4"><div className="font-bold text-blue-950">e-Invoice supplier details</div><p className="mt-1 text-xs text-gray-500">We request the data needed for Malaysian e-Invoice supplier records. An SSM profile, MyInvois taxpayer profile or existing invoice may supply it; no single supporting document is mandatory by default. SST and tourism-tax numbers apply only where registered.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{(['tin', 'msic', 'businessActivity', 'sstNumber', 'tourismTaxNumber'] as const).map(key => <label key={key}><span className={labelClass}>{({ tin: 'LHDNM TIN', msic: 'MSIC code', businessActivity: 'Business activity', sstNumber: 'SST registration (if applicable)', tourismTaxNumber: 'Tourism tax registration (if applicable)' })[key]}</span><input className={fieldClass} value={input.taxProfile?.[key] || ''} onChange={event => update('taxProfile', { ...input.taxProfile!, [key]: event.target.value })} /></label>)}</div></div>
          </div>}

          {step === 1 && <div>
            <h3 className="text-lg font-bold">What will this vendor do?</h3><p className="mt-1 text-sm text-gray-500">These answers activate company and personnel compliance rules.</p>
            <label className="mt-5 block"><span className={labelClass}>Services or work scopes</span><input className={fieldClass} value={serviceText} onChange={event => { setServiceText(event.target.value); update('services', event.target.value.split(',').map(value => value.trim()).filter(Boolean)); }} placeholder="e.g. Civil works, crane operation, electrical maintenance" /><span className="mt-1 block text-xs text-gray-400">Separate multiple services with commas.</span></label>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{vendorActivityOptions.map(activity => <label key={activity.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${input.activityTags.includes(activity.value) ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}><input type="checkbox" checked={input.activityTags.includes(activity.value)} onChange={() => toggleActivity(activity.value)} className="mt-1 h-4 w-4" /><span className="text-sm font-medium text-gray-800">{activity.label}</span></label>)}</div>
          </div>}

          {step === 2 && <div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Personnel and competencies</h3><p className="mt-1 text-sm text-gray-500">Build the staff roster, then answer exactly which CIDB and DOSH checks apply to each person. Identity values are masked after submission.</p></div><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-800"><FileSpreadsheet className="h-4 w-4" />Import CSV<input type="file" accept=".csv,.txt" className="hidden" onChange={event => void readRosterFile(event.target.files?.[0])} /></label><button type="button" onClick={() => setShowRosterImport(current => !current)} className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-800"><Users className="h-4 w-4" />Paste staff list</button><button type="button" onClick={addPerson} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800"><Plus className="h-4 w-4" />Add person</button></div></div>
            {showRosterImport && <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div className="font-bold text-indigo-950">Bulk staff roster</div><p className="mt-1 text-xs leading-5 text-indigo-700">Paste one name per line, or CSV columns: <strong>name, role, mykad_passport, site, cidb_required, dosh_required, compliance_roles, cidb_number, dosh_number, competency_scope</strong>. Use a pipe between multiple compliance roles.</p><textarea rows={6} className={`${fieldClass} mt-3 font-mono text-xs`} value={rosterText} onChange={event => setRosterText(event.target.value)} placeholder={'name,role,mykad_passport,site,cidb_required,dosh_required,compliance_roles\nAli Bin Ahmad,GENERAL_WORKER,900101101234,Site A,yes,no,\nSiti Binti Omar,CRANE_OPERATOR,920202105678,Site A,yes,yes,CRANE_OPERATOR'} /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowRosterImport(false)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700">Cancel</button><button type="button" onClick={importRoster} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-bold text-white">Add roster rows</button></div></div>}
            {!input.personnel.length && <button type="button" onClick={addPerson} className="mt-6 flex min-h-40 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-500"><Users className="h-7 w-7" /><span className="mt-2 text-sm font-bold">No personnel added</span><span className="mt-1 text-xs">Add workers or operators when individual verification applies.</span></button>}
            <div className="mt-5 space-y-4">{input.personnel.map((person, index) => <div key={index} className="rounded-xl border border-gray-200 p-4"><div className="flex justify-between"><div><div className="font-bold text-gray-900">{person.name || `Person ${index + 1}`}</div><div className="mt-1 text-xs text-gray-500">The answers below determine the checklist; an uploaded certificate never decides applicability by itself.</div></div><button type="button" onClick={() => removePerson(index)} className="text-red-500" aria-label={`Remove person ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Full name *</span><input required className={fieldClass} value={person.name} onChange={event => updatePerson(index, 'name', event.target.value)} /></label><label><span className={labelClass}>Primary work role *</span><select className={fieldClass} value={person.role} onChange={event => updatePerson(index, 'role', event.target.value)}>{vendorPersonnelRoles.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select></label><label><span className={labelClass}>MyKad / passport number</span><input className={fieldClass} value={person.identityNumber} onChange={event => updatePerson(index, 'identityNumber', event.target.value)} placeholder="Required when CIDB or DOSH = Yes" /></label><label><span className={labelClass}>Site / project assignment</span><input className={fieldClass} value={person.siteAssignment} onChange={event => updatePerson(index, 'siteAssignment', event.target.value)} /></label></div><div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"><label><span className={labelClass}>Will this person enter a construction site / require CIDB checking? *</span><select className={fieldClass} value={person.cidbCheckRequired === undefined ? '' : person.cidbCheckRequired ? 'yes' : 'no'} onChange={event => updatePerson(index, 'cidbCheckRequired', event.target.value ? event.target.value === 'yes' : undefined)}><option value="">Select Yes or No</option><option value="yes">Yes — check CIDB personnel registration</option><option value="no">No — CIDB personnel check not applicable</option></select></label>{person.cidbCheckRequired && <label className="mt-3 block"><span className={labelClass}>CIDB personnel registration number (if known)</span><input className={fieldClass} value={person.cidbRegistrationNumber || ''} onChange={event => updatePerson(index, 'cidbRegistrationNumber', event.target.value)} placeholder="AI may extract this from the Green Card" /></label>}</div><div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4"><label><span className={labelClass}>Does this person perform DOSH-regulated operator work? *</span><select className={fieldClass} value={person.doshCheckRequired === undefined ? '' : person.doshCheckRequired ? 'yes' : 'no'} onChange={event => updatePerson(index, 'doshCheckRequired', event.target.value ? event.target.value === 'yes' : undefined)}><option value="">Select Yes or No</option><option value="yes">Yes — verify DOSH competency</option><option value="no">No — DOSH personnel check not applicable</option></select></label>{person.doshCheckRequired && <><div className="mt-3"><span className={labelClass}>DOSH competency type *</span><div className="space-y-2">{doshRoles.map(role => <label key={role} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={person.role === role || person.complianceRoles?.includes(role) || false} onChange={() => toggleComplianceRole(index, role)} disabled={person.role === role} />{doshRoleLabels[role]}{person.role === role ? ' (primary role)' : ''}</label>)}</div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>DOSH registration number</span><input className={fieldClass} value={person.doshRegistrationNumber || ''} onChange={event => updatePerson(index, 'doshRegistrationNumber', event.target.value)} placeholder="If known" /></label><label><span className={labelClass}>Expected scope / grade</span><input className={fieldClass} value={person.competencyScope || ''} onChange={event => updatePerson(index, 'competencyScope', event.target.value)} placeholder="e.g. Tower crane / Grade 1" /></label></div></>}</div></div></div>)}</div>
            {!!input.personnel.length && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700"><strong>How matching works:</strong> the system maps the selected competency rules to each named worker, hashes the MyKad/passport value, and compares the name, identity, declared registration number, competency type/scope and validity against uploaded evidence and the permitted official check. A missing document stays pending; a mismatch is the only condition that fails.</div>}
          </div>}

          {step === 3 && <div>
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><FileSearch className="h-6 w-6" /></span><div><h3 className="text-lg font-bold">Upload unstructured evidence</h3><p className="text-sm text-gray-500">AI will classify files, extract fields and apply the active rules in the background.</p></div></div>
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><strong>{checklist?.items.length || 0} applicable check(s)</strong> are ready for evidence mapping. The checklist was shown on page 1 and refined using your applicability and personnel answers.</div>
            <label className="mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center hover:border-blue-400 hover:bg-blue-50"><Upload className="h-8 w-8 text-blue-700" /><span className="mt-4 font-bold text-gray-900">Add more documents</span><span className="mt-1 max-w-md text-sm text-gray-500">PDF, PNG, JPG, DOC/DOCX, XLSX, CSV or text; up to 10 MB each and 25 files per batch.</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.csv,.txt" className="hidden" onChange={event => chooseFiles(Array.from(event.target.files || []))} /></label>
            {!!(files.length || intakeCase?.documents.length) && <div className="mt-4 rounded-xl border border-gray-200"><div className="border-b border-gray-100 px-4 py-3 text-sm font-bold">{intakeCase?.documents.length || files.length} file(s) {intakeCase ? 'saved on server' : 'selected but not yet staged'}</div>{intakeCase ? intakeCase.documents.map(document => <div key={document.id} className="flex justify-between border-b border-gray-50 px-4 py-2 text-sm last:border-0"><a className="truncate text-indigo-700 underline" href={`/api/vendor-intakes/${intakeCase.id}/files/${document.id}`}>{document.fileName}</a><span className="ml-4 shrink-0 text-gray-400">{document.status.replaceAll('_', ' ')}</span></div>) : files.map(file => <div key={`${file.name}-${file.size}`} className="flex justify-between border-b border-gray-50 px-4 py-2 text-sm last:border-0"><span className="truncate text-gray-700">{file.name}</span><span className="ml-4 shrink-0 text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>}
          </div>}

          {step === 4 && <div><h3 className="text-lg font-bold">Review and start onboarding</h3><p className="mt-1 text-sm text-gray-500">The vendor will use requirement pack version {configuration.activeVersion}.</p><dl className="mt-6 grid gap-5 rounded-xl border border-gray-200 p-5 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-gray-400">Vendor</dt><dd className="mt-1 font-bold">{input.legalName}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Registration</dt><dd className="mt-1 font-bold">{input.registrationNumber}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Category</dt><dd className="mt-1">{configuration.categories.find(item => item.id === input.categoryId)?.name}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Personnel</dt><dd className="mt-1">{input.personnel.length}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Activities</dt><dd className="mt-1">{input.activityTags.length || 'None'}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Documents</dt><dd className="mt-1">{intakeCase?.documents.length || files.length}</dd></div></dl>{intakeCase && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Intake {intakeCase.stage.replaceAll('_', ' ')} · {intakeCase.conflicts.length} exception(s). Review each proposed value against the saved originals before confirming.</div>}<div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">AI and public-source findings support the review. A human remains responsible for the final onboarding decision.</div></div>}
          {error && <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 sm:px-7"><button type="button" onClick={step === 0 ? onClose : () => { setStep(current => current - 1); setError(''); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700">{step > 0 && <ArrowLeft className="h-4 w-4" />}{step ? 'Back' : 'Cancel'}</button>{step < steps.length - 1 ? <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white">Continue <ArrowRight className="h-4 w-4" /></button> : <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Check className="h-4 w-4" />{saving ? 'Starting…' : 'Start onboarding'}</button>}</div>
      </div>
    </div>
  );
}
