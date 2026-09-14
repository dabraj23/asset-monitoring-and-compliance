import { ChangeEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVendors } from '../context/VendorContext';
import { CreateVendorInput } from '../vendorTypes';
import { useEntity } from '../context/EntityContext';

interface Props { open: boolean; onClose: () => void; }
interface Preview { line: number; input?: CreateVendorInput; errors: string[]; }

const headers = ['legal_name', 'registration_number', 'vendor_category', 'services', 'activity_tags', 'contact_name', 'email', 'phone', 'address'];
const rows = [
  ['ABC Engineering Sdn Bhd', '202601234567', 'contractor-engineer', 'Civil works|Crane operation', 'CONSTRUCTION_WORK|SITE_ACCESS', 'Amin Rahman', 'amin@example.com', '0123456789', 'Kuala Lumpur'],
  ['Travel Services Sdn Bhd', '202609876543', 'ticketing-agency', 'Ticketing', 'TICKETING', 'Sara Lim', 'sara@example.com', '0198765432', 'Selangor'],
];
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
const parseCsv = (text: string) => {
  const output: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) output.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) output.push(row); return output;
};

export function BulkVendorImportModal({ open, onClose }: Props) {
  const { configuration, vendors, createVendors } = useVendors();
  const { entities, selectedEntityId } = useEntity();
  const [importEntityId, setImportEntityId] = useState(selectedEntityId);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setPreview([]); setFileName(''); setError(''); setSaving(false); setImportEntityId(selectedEntityId); } }, [open, selectedEntityId]);
  if (!open || !configuration) return null;

  const download = () => {
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'vendor-import-template.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setFileName(file.name); setError('');
    try {
      const data = parseCsv(await file.text());
      if (data.length < 2) throw new Error('The CSV must contain a header and at least one vendor.');
      const fileHeaders = data[0].map(value => value.replace(/^\uFEFF/, '').toLowerCase());
      const missing = ['legal_name', 'registration_number', 'vendor_category'].filter(value => !fileHeaders.includes(value));
      if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
      if (!importEntityId) throw new Error('Select the entity for this import first.');
      const known = new Set(vendors.filter(vendor => vendor.entityId === importEntityId).map(vendor => vendor.registrationNumber.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const seen = new Set<string>();
      setPreview(data.slice(1).map((values, index) => {
        const record = Object.fromEntries(fileHeaders.map((header, cellIndex) => [header, values[cellIndex] || '']));
        const category = configuration.categories.find(item => item.id === record.vendor_category || item.name.toLowerCase() === record.vendor_category.toLowerCase());
        const identifier = record.registration_number.toLowerCase().replace(/[^a-z0-9]/g, '');
        const errors: string[] = [];
        if (!record.legal_name) errors.push('Missing legal name');
        if (!identifier) errors.push('Missing registration number');
        if (!category) errors.push('Unknown category');
        if (known.has(identifier)) errors.push('Registration already exists');
        if (seen.has(identifier)) errors.push('Duplicate in file');
        seen.add(identifier);
        const input = category && !errors.length ? {
          entityId: importEntityId, legalName: record.legal_name, registrationNumber: record.registration_number, categoryId: category.id,
          services: (record.services || '').split('|').map((value: string) => value.trim()).filter(Boolean),
          activityTags: (record.activity_tags || '').split('|').map((value: string) => value.trim()).filter(Boolean),
          contactName: record.contact_name || '', email: record.email || '', phone: record.phone || '', address: record.address || '', personnel: [],
        } : undefined;
        return { line: index + 2, input, errors };
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to read CSV.'); setPreview([]); }
  };

  const issues = preview.filter(row => row.errors.length);
  const importRows = async () => {
    if (issues.length || !preview.length) return;
    setSaving(true);
    try { const created = await createVendors(preview.flatMap(row => row.input ? [row.input] : [])); toast.success(`${created.length} vendors imported`); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to import vendors.'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" role="dialog" aria-modal="true">
    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <div className="flex justify-between border-b px-6 py-4"><div><div className="text-xs font-bold uppercase tracking-widest text-blue-600">Vendor register</div><h2 className="mt-1 text-xl font-bold">Bulk import vendors</h2></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-gray-400" /></button></div>
      <div className="overflow-y-auto p-6"><label className="mb-5 block text-sm font-semibold">Responsible legal entity<select className="mt-1 w-full rounded-lg border p-2.5" value={importEntityId} onChange={event => { setImportEntityId(event.target.value); setPreview([]); }}><option value="">Select entity</option>{entities.filter(entity => entity.active).map(entity => <option key={entity.id} value={entity.id}>{entity.legalName}</option>)}</select></label>{!preview.length ? <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl bg-blue-950 p-6 text-white"><FileSpreadsheet className="h-8 w-8 text-yellow-400" /><h3 className="mt-5 text-lg font-bold">Prepare the vendor master file</h3><p className="mt-2 text-sm text-blue-100">Import up to 500 vendors. Services and activity tags use a vertical bar separator.</p><button onClick={download} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-blue-950"><Download className="h-4 w-4" />Download CSV template</button></div><label className="flex min-h-60 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50"><Upload className="h-8 w-8 text-blue-700" /><span className="mt-3 font-bold">Choose vendor CSV</span><input type="file" accept=".csv,text/csv" className="hidden" onChange={read} /></label></div> : <div><div className={`flex gap-3 rounded-xl p-4 ${issues.length ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{issues.length ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}<div className="text-sm font-bold">{issues.length ? `${issues.length} row(s) require correction.` : `${preview.length} vendor(s) ready to import.`}</div></div><div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Registration</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Validation</th></tr></thead><tbody className="divide-y">{preview.map(row => <tr key={row.line}><td className="px-4 py-3">{row.line}</td><td className="px-4 py-3 font-bold">{row.input?.legalName || 'Invalid row'}</td><td className="px-4 py-3">{row.input?.registrationNumber || '—'}</td><td className="px-4 py-3">{configuration.categories.find(item => item.id === row.input?.categoryId)?.name || '—'}</td><td className={`px-4 py-3 font-medium ${row.errors.length ? 'text-red-700' : 'text-green-700'}`}>{row.errors.join('; ') || 'Ready'}</td></tr>)}</tbody></table></div><button onClick={() => setPreview([])} className="mt-3 text-sm font-bold text-blue-700">Choose another file</button></div>}{error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}</div>
      <div className="flex justify-between border-t px-6 py-4"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button><button onClick={importRows} disabled={!preview.length || !!issues.length || saving} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Importing…' : `Import ${preview.length || ''} vendors`}</button></div>
    </div>
  </div>;
}
