import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Asset } from '../types';
import { AssetDraft, buildAsset, categoryLabel, emptyAssetDraft, isVehicleCategory, parseAssetCategory } from '../data/assetDrafts';

interface BulkAssetImportModalProps {
  open: boolean;
  existingIdentifiers: string[];
  onClose: () => void;
  onImport: (assets: Asset[]) => Promise<Asset[]>;
}

interface PreviewRow {
  line: number;
  name: string;
  identifier: string;
  type: string;
  driver: string;
  asset?: Asset;
  errors: string[];
}

const templateHeaders = [
  'asset_type',
  'asset_name',
  'identifier',
  'location',
  'brand',
  'model',
  'year',
  'ownership',
  'current_driver',
  'driver_license_no',
  'driver_license_class',
  'driver_license_expiry',
  'road_tax_expiry',
  'insurance_expiry',
  'inspection_expiry',
  'next_service_date',
  'current_odometer',
];

const templateRows = [
  ['vehicle', 'Toyota Hilux', 'VAB1234', 'Kepong HQ', 'Toyota', 'Hilux', '2024', 'OWNED', 'Amin Rahman', 'D1234567', 'D', '2028-06-30', '2027-03-31', '2027-03-31', '', '2026-12-15', '42500'],
  ['machinery', 'Kobelco Excavator', 'EXC-9001', 'Penang Site', 'Kobelco', 'SK200', '2023', 'LEASED', '', '', '', '', '', '', '2027-01-20', '2026-11-10', '1820'],
  ['crate', 'Reusable Crate 20', 'CRT-0020', 'Main Warehouse', '', 'Stackable 600L', '2025', 'OWNED', '', '', '', '', '', '', '2027-04-01', '2027-04-01', '0'],
];

const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
};

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const draftFromRecord = (record: Record<string, string>): AssetDraft => ({
  ...emptyAssetDraft(),
  category: parseAssetCategory(record.asset_type || ''),
  name: record.asset_name || '',
  identifier: record.identifier || '',
  location: record.location || '',
  brand: record.brand || '',
  model: record.model || '',
  year: record.year || '',
  ownership: ['OWNED', 'LEASED', 'RENTED'].includes((record.ownership || '').toUpperCase())
    ? (record.ownership.toUpperCase() as Asset['ownership'])
    : 'OWNED',
  driverName: record.current_driver || '',
  driverLicenseNumber: record.driver_license_no || '',
  driverLicenseClass: record.driver_license_class || '',
  driverLicenseExpiry: record.driver_license_expiry || '',
  roadTaxExpiry: record.road_tax_expiry || '',
  insuranceExpiry: record.insurance_expiry || '',
  inspectionExpiry: record.inspection_expiry || '',
  nextServiceDate: record.next_service_date || '',
  currentOdometer: record.current_odometer || '',
});

const dateFields: Array<[keyof AssetDraft, string]> = [
  ['driverLicenseExpiry', 'driver licence expiry'],
  ['roadTaxExpiry', 'road tax expiry'],
  ['insuranceExpiry', 'insurance expiry'],
  ['inspectionExpiry', 'inspection expiry'],
  ['nextServiceDate', 'next service date'],
];

export function BulkAssetImportModal({ open, existingIdentifiers, onClose, onImport }: BulkAssetImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setFileName('');
      setPreview([]);
      setFileError('');
      setIsImporting(false);
    }
  }, [open]);

  if (!open) return null;

  const downloadTemplate = () => {
    const csv = [templateHeaders, ...templateRows]
      .map(row => row.map(escapeCsvCell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'asset-register-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileError('');

    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV must contain a header row and at least one asset.');

      const headers = rows[0].map(header => header.replace(/^\uFEFF/, '').trim().toLowerCase());
      const missingHeaders = ['asset_type', 'asset_name', 'identifier', 'location', 'next_service_date']
        .filter(header => !headers.includes(header));
      if (missingHeaders.length) throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);

      const known = new Set(existingIdentifiers.map(value => value.trim().toLowerCase()));
      const seenInFile = new Set<string>();
      const nextPreview = rows.slice(1).map((values, rowIndex): PreviewRow => {
        const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
        const draft = draftFromRecord(record);
        const errors: string[] = [];
        const identifier = draft.identifier.trim().toLowerCase();

        if (!draft.category) errors.push('Unknown asset type');
        if (!draft.name.trim()) errors.push('Missing asset name');
        if (!identifier) errors.push('Missing identifier');
        if (!draft.location.trim()) errors.push('Missing location');
        if (!draft.nextServiceDate) errors.push('Missing next service date');
        if (isVehicleCategory(draft.category) && (!draft.roadTaxExpiry || !draft.insuranceExpiry)) {
          errors.push('Vehicle road tax and insurance dates are required');
        }
        if (identifier && known.has(identifier)) errors.push('Identifier already exists');
        if (identifier && seenInFile.has(identifier)) errors.push('Duplicate identifier in file');
        if (identifier) seenInFile.add(identifier);
        if (record.ownership && !['OWNED', 'LEASED', 'RENTED'].includes(record.ownership.toUpperCase())) {
          errors.push('Ownership must be OWNED, LEASED or RENTED');
        }
        if (draft.year && (!/^\d{4}$/.test(draft.year) || Number(draft.year) < 1950 || Number(draft.year) > 2100)) {
          errors.push('Invalid year');
        }
        if (draft.currentOdometer && (!/^\d+(\.\d+)?$/.test(draft.currentOdometer) || Number(draft.currentOdometer) < 0)) {
          errors.push('Invalid odometer or usage reading');
        }
        if (draft.driverName && (!draft.driverLicenseNumber || !draft.driverLicenseExpiry)) {
          errors.push('Driver licence details incomplete');
        }

        for (const [field, label] of dateFields) {
          const value = draft[field];
          if (typeof value === 'string' && value && !isIsoDate(value)) errors.push(`Invalid ${label}`);
        }

        let asset: Asset | undefined;
        if (!errors.length) {
          try {
            asset = buildAsset(draft);
          } catch (caught) {
            errors.push(caught instanceof Error ? caught.message : 'Invalid asset data');
          }
        }

        return {
          line: rowIndex + 2,
          name: draft.name || 'Unnamed asset',
          identifier: draft.identifier || '—',
          type: categoryLabel(draft.category),
          driver: draft.driverName || 'Unassigned',
          asset,
          errors,
        };
      });

      setPreview(nextPreview);
    } catch (caught) {
      setPreview([]);
      setFileError(caught instanceof Error ? caught.message : 'Unable to read this CSV file.');
    }
  };

  const validAssets = preview.flatMap(row => row.asset ? [row.asset] : []);
  const issueCount = preview.filter(row => row.errors.length > 0).length;

  const importAssets = async () => {
    if (!validAssets.length || issueCount) return;
    setIsImporting(true);
    setFileError('');
    try {
      const imported = await onImport(validAssets);
      toast.success(`${imported.length} asset${imported.length === 1 ? '' : 's'} imported`);
      onClose();
    } catch (caught) {
      setFileError(caught instanceof Error ? caught.message : 'Unable to import these assets.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Asset register</div>
            <h2 id="bulk-import-title" className="mt-1 text-xl font-bold text-gray-950">Bulk upload assets</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close bulk upload">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          {!preview.length ? (
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl bg-blue-950 p-6 text-white">
                <FileSpreadsheet className="h-8 w-8 text-yellow-400" />
                <h3 className="mt-5 text-lg font-bold">Prepare your asset file</h3>
                <p className="mt-2 text-sm leading-6 text-blue-100">Use one CSV for vehicles, machinery, crates and other assets. Current-driver and compliance columns are included.</p>
                <button type="button" onClick={downloadTemplate} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-blue-950 hover:bg-blue-50">
                  <Download className="h-4 w-4" /> Download CSV template
                </button>
              </div>

              <div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center transition hover:border-blue-500 hover:bg-blue-50">
                  <span className="rounded-full bg-white p-4 text-blue-700 shadow-sm"><Upload className="h-7 w-7" /></span>
                  <span className="mt-4 font-bold text-gray-900">Choose a completed CSV file</span>
                  <span className="mt-1 text-sm text-gray-500">The file is validated locally before anything is imported.</span>
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-950">Import preview</h3>
                  <p className="mt-1 text-sm text-gray-500">{fileName} · {preview.length} row{preview.length === 1 ? '' : 's'}</p>
                </div>
                <button type="button" onClick={() => { setPreview([]); setFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">Choose another file</button>
              </div>

              <div className={`mt-5 flex items-start gap-3 rounded-xl px-4 py-3 ${issueCount ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                {issueCount ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
                <div className="text-sm font-medium">{issueCount ? `${issueCount} row${issueCount === 1 ? '' : 's'} must be corrected before import.` : `All ${validAssets.length} assets are ready to import.`}</div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Identifier</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Current driver</th><th className="px-4 py-3">Validation</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map(row => (
                      <tr key={row.line}>
                        <td className="px-4 py-3 text-gray-500">{row.line}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 font-mono text-gray-700">{row.identifier}</td>
                        <td className="px-4 py-3 text-gray-600">{row.type}</td>
                        <td className="px-4 py-3 text-gray-600">{row.driver}</td>
                        <td className="px-4 py-3">
                          {row.errors.length ? <span className="font-medium text-red-700">{row.errors.join('; ')}</span> : <span className="font-medium text-green-700">Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {fileError && <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{fileError}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={importAssets} disabled={!preview.length || issueCount > 0 || isImporting} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" /> {isImporting ? 'Importing…' : `Import ${validAssets.length || ''} asset${validAssets.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
