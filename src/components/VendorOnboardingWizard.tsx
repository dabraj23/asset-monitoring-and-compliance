import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, FileSearch, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVendors } from '../context/VendorContext';
import { CreateVendorInput, Vendor, vendorActivityOptions, vendorPersonnelRoles } from '../vendorTypes';

interface VendorOnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: Vendor) => void;
}

const steps = ['Vendor profile', 'Applicability', 'Personnel', 'Documents', 'Review'];
const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';
const emptyInput = (): CreateVendorInput => ({
  legalName: '', registrationNumber: '', categoryId: '', services: [], activityTags: [],
  contactName: '', email: '', phone: '', address: '', personnel: [],
});

export function VendorOnboardingWizard({ open, onClose, onCreated }: VendorOnboardingWizardProps) {
  const { configuration, createVendor, uploadDocuments } = useVendors();
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<CreateVendorInput>(emptyInput);
  const [serviceText, setServiceText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0); setInput(emptyInput()); setServiceText(''); setFiles([]); setError(''); setSaving(false);
  }, [open]);

  if (!open || !configuration) return null;

  const update = <K extends keyof CreateVendorInput>(key: K, value: CreateVendorInput[K]) => {
    setInput(current => ({ ...current, [key]: value }));
    setError('');
  };

  const validate = () => {
    if (step === 0 && (!input.legalName.trim() || !input.registrationNumber.trim() || !input.categoryId)) return 'Vendor name, registration number and category are required.';
    if (step === 1 && !input.services.length && !input.activityTags.length) return 'Add at least one service or work activity.';
    if (step === 2 && input.activityTags.includes('SITE_ACCESS') && !input.personnel.length) return 'Add the personnel who will enter construction sites.';
    if (step === 2 && input.personnel.some(person => !person.name.trim() || !person.role.trim())) return 'Every personnel record needs a name and role.';
    if (step === 2 && input.activityTags.includes('SITE_ACCESS') && input.personnel.some(person => !person.identityNumber.trim())) return 'MyKad or passport number is required for each site worker so CIDB verification can be prepared.';
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

  const addPerson = () => update('personnel', [...input.personnel, { name: '', role: 'GENERAL_WORKER', identityNumber: '', siteAssignment: '' }]);
  const updatePerson = (index: number, key: keyof CreateVendorInput['personnel'][number], value: string) => update('personnel', input.personnel.map((person, personIndex) => personIndex === index ? { ...person, [key]: value } : person));
  const removePerson = (index: number) => update('personnel', input.personnel.filter((_, personIndex) => personIndex !== index));

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const vendor = await createVendor(input);
      if (files.length) await uploadDocuments(vendor.id, files.map(file => ({ file })));
      toast.success(files.length ? 'Vendor created; background verification started' : 'Vendor draft created');
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
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Legal company name *</span><input className={fieldClass} value={input.legalName} onChange={event => update('legalName', event.target.value)} /></label>
              <label><span className={labelClass}>Registration number *</span><input className={fieldClass} value={input.registrationNumber} onChange={event => update('registrationNumber', event.target.value)} /></label>
              <label><span className={labelClass}>Vendor category *</span><select className={fieldClass} value={input.categoryId} onChange={event => update('categoryId', event.target.value)}><option value="">Select category</option>{configuration.categories.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span className={labelClass}>Contact person</span><input className={fieldClass} value={input.contactName} onChange={event => update('contactName', event.target.value)} /></label>
              <label><span className={labelClass}>Email</span><input type="email" className={fieldClass} value={input.email} onChange={event => update('email', event.target.value)} /></label>
              <label><span className={labelClass}>Phone</span><input className={fieldClass} value={input.phone} onChange={event => update('phone', event.target.value)} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Registered address</span><textarea rows={2} className={fieldClass} value={input.address} onChange={event => update('address', event.target.value)} /></label>
            </div>
          </div>}

          {step === 1 && <div>
            <h3 className="text-lg font-bold">What will this vendor do?</h3><p className="mt-1 text-sm text-gray-500">These answers activate company and personnel compliance rules.</p>
            <label className="mt-5 block"><span className={labelClass}>Services or work scopes</span><input className={fieldClass} value={serviceText} onChange={event => { setServiceText(event.target.value); update('services', event.target.value.split(',').map(value => value.trim()).filter(Boolean)); }} placeholder="e.g. Civil works, crane operation, electrical maintenance" /><span className="mt-1 block text-xs text-gray-400">Separate multiple services with commas.</span></label>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{vendorActivityOptions.map(activity => <label key={activity.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${input.activityTags.includes(activity.value) ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}><input type="checkbox" checked={input.activityTags.includes(activity.value)} onChange={() => toggleActivity(activity.value)} className="mt-1 h-4 w-4" /><span className="text-sm font-medium text-gray-800">{activity.label}</span></label>)}</div>
          </div>}

          {step === 2 && <div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Personnel and competencies</h3><p className="mt-1 text-sm text-gray-500">Add people who require CIDB or DOSH checks. Identity values are masked after submission.</p></div><button type="button" onClick={addPerson} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800"><Plus className="h-4 w-4" />Add person</button></div>
            {!input.personnel.length && <button type="button" onClick={addPerson} className="mt-6 flex min-h-40 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-500"><Users className="h-7 w-7" /><span className="mt-2 text-sm font-bold">No personnel added</span><span className="mt-1 text-xs">Add workers or operators when individual verification applies.</span></button>}
            <div className="mt-5 space-y-4">{input.personnel.map((person, index) => <div key={index} className="rounded-xl border border-gray-200 p-4"><div className="flex justify-between"><div className="font-bold text-gray-900">Person {index + 1}</div><button type="button" onClick={() => removePerson(index)} className="text-red-500" aria-label={`Remove person ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Full name *</span><input required className={fieldClass} value={person.name} onChange={event => updatePerson(index, 'name', event.target.value)} /></label><label><span className={labelClass}>Role *</span><select className={fieldClass} value={person.role} onChange={event => updatePerson(index, 'role', event.target.value)}>{vendorPersonnelRoles.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select></label><label><span className={labelClass}>MyKad / passport number</span><input className={fieldClass} value={person.identityNumber} onChange={event => updatePerson(index, 'identityNumber', event.target.value)} /></label><label><span className={labelClass}>Site / project assignment</span><input className={fieldClass} value={person.siteAssignment} onChange={event => updatePerson(index, 'siteAssignment', event.target.value)} /></label></div></div>)}</div>
          </div>}

          {step === 3 && <div>
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><FileSearch className="h-6 w-6" /></span><div><h3 className="text-lg font-bold">Upload unstructured evidence</h3><p className="text-sm text-gray-500">AI will classify files, extract fields and apply the active rules in the background.</p></div></div>
            <label className="mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center hover:border-blue-400 hover:bg-blue-50"><Upload className="h-8 w-8 text-blue-700" /><span className="mt-4 font-bold text-gray-900">Choose documents</span><span className="mt-1 max-w-md text-sm text-gray-500">PDF, PNG, JPG, DOCX, XLSX, CSV or text; up to 10 MB each and 20 files per batch.</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt" className="hidden" onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
            {!!files.length && <div className="mt-4 rounded-xl border border-gray-200"><div className="border-b border-gray-100 px-4 py-3 text-sm font-bold">{files.length} file(s) selected</div>{files.map(file => <div key={`${file.name}-${file.size}`} className="flex justify-between border-b border-gray-50 px-4 py-2 text-sm last:border-0"><span className="truncate text-gray-700">{file.name}</span><span className="ml-4 shrink-0 text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>}
          </div>}

          {step === 4 && <div><h3 className="text-lg font-bold">Review and start onboarding</h3><p className="mt-1 text-sm text-gray-500">The vendor will use requirement pack version {configuration.activeVersion}.</p><dl className="mt-6 grid gap-5 rounded-xl border border-gray-200 p-5 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-gray-400">Vendor</dt><dd className="mt-1 font-bold">{input.legalName}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Registration</dt><dd className="mt-1 font-bold">{input.registrationNumber}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Category</dt><dd className="mt-1">{configuration.categories.find(item => item.id === input.categoryId)?.name}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Personnel</dt><dd className="mt-1">{input.personnel.length}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Activities</dt><dd className="mt-1">{input.activityTags.length || 'None'}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-400">Documents</dt><dd className="mt-1">{files.length}</dd></div></dl><div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">AI and public-source findings support the review. Admin User remains responsible for the final onboarding decision.</div></div>}
          {error && <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 sm:px-7"><button type="button" onClick={step === 0 ? onClose : () => { setStep(current => current - 1); setError(''); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700">{step > 0 && <ArrowLeft className="h-4 w-4" />}{step ? 'Back' : 'Cancel'}</button>{step < steps.length - 1 ? <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white">Continue <ArrowRight className="h-4 w-4" /></button> : <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Check className="h-4 w-4" />{saving ? 'Starting…' : 'Start onboarding'}</button>}</div>
      </div>
    </div>
  );
}
