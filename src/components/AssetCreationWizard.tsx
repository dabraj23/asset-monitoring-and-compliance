import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Asset, AssetCategory } from '../types';
import {
  AssetDraft,
  buildAsset,
  categoryLabel,
  emptyAssetDraft,
  identifierLabel,
  isVehicleCategory,
} from '../data/assetDrafts';

interface AssetCreationWizardProps {
  open: boolean;
  onClose: () => void;
  onCreate: (asset: Asset) => Promise<Asset>;
}

const steps = ['Asset type', 'Identity & allocation', 'Compliance & maintenance', 'Review'];

const categories: Array<{ value: AssetCategory; label: string; description: string }> = [
  { value: 'LIGHT_VEHICLE', label: 'Light vehicle', description: 'Cars, vans and pickups' },
  { value: 'COMMERCIAL_VEHICLE', label: 'Commercial vehicle', description: 'Lorries, trucks and buses' },
  { value: 'HEAVY_MACHINERY', label: 'Heavy machinery', description: 'Excavators and mobile plant' },
  { value: 'WAREHOUSE_EQUIPMENT', label: 'Warehouse equipment', description: 'Forklifts and handling equipment' },
  { value: 'MOBILE_SITE_EQUIPMENT', label: 'Mobile site equipment', description: 'Generators and portable equipment' },
  { value: 'CRATE', label: 'Crate / container', description: 'Reusable crates and containers' },
  { value: 'PROPERTY', label: 'Property / site', description: 'Buildings and real estate requiring monitoring' },
  { value: 'OTHER', label: 'Other asset', description: 'Any other tracked asset' },
];

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';

export function AssetCreationWizard({ open, onClose, onCreate }: AssetCreationWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AssetDraft>(emptyAssetDraft);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setDraft(emptyAssetDraft());
      setError('');
      setIsSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const updateDraft = <K extends keyof AssetDraft>(field: K, value: AssetDraft[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
    setError('');
  };

  const validateStep = () => {
    if (step === 0 && !draft.category) return 'Choose an asset type to continue.';
    if (step === 1) {
      if (!draft.name.trim()) return 'Enter an asset name.';
      if (!draft.identifier.trim()) return `Enter the ${identifierLabel(draft.category).toLowerCase()}.`;
      if (!draft.location.trim()) return 'Enter the current location.';
      if (draft.driverName.trim() && (!draft.driverLicenseNumber.trim() || !draft.driverLicenseExpiry)) {
        return 'Add the current driver’s licence number and expiry date.';
      }
    }
    if (step === 2) {
      if (!draft.nextServiceDate) return 'Enter the next maintenance or inspection date.';
      if (isVehicleCategory(draft.category) && (!draft.roadTaxExpiry || !draft.insuranceExpiry)) {
        return 'Road tax and insurance expiry dates are required for vehicles.';
      }
    }
    return '';
  };

  const moveNext = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setStep(current => Math.min(current + 1, steps.length - 1));
  };

  const saveAsset = async () => {
    setIsSaving(true);
    setError('');
    try {
      await onCreate(buildAsset(draft));
      toast.success('Asset added to the register');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create this asset.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="asset-wizard-title">
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Asset register</div>
            <h2 id="asset-wizard-title" className="mt-1 text-xl font-bold text-gray-950">Add an asset</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close asset wizard">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-4 sm:px-7">
          <ol className="grid grid-cols-4 gap-2" aria-label="Asset creation progress">
            {steps.map((label, index) => (
              <li key={label} className="min-w-0">
                <div className={`h-1.5 rounded-full ${index <= step ? 'bg-blue-700' : 'bg-gray-200'}`} />
                <div className={`mt-2 truncate text-xs font-medium ${index === step ? 'text-blue-700' : 'text-gray-400'}`}>{index + 1}. {label}</div>
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          {step === 0 && (
            <div>
              <h3 className="text-lg font-bold text-gray-950">What are you registering?</h3>
              <p className="mt-1 text-sm text-gray-500">The next steps adapt to the type of asset you choose.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map(category => (
                  <button
                    key={category.value}
                    type="button"
                    onClick={() => updateDraft('category', category.value)}
                    className={`rounded-xl border p-4 text-left transition ${draft.category === category.value ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                    aria-pressed={draft.category === category.value}
                  >
                    <span className="block font-bold text-gray-900">{category.label}</span>
                    <span className="mt-1 block text-sm text-gray-500">{category.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-7">
              <div>
                <h3 className="text-lg font-bold text-gray-950">Identify and allocate the asset</h3>
                <p className="mt-1 text-sm text-gray-500">Start with its primary identifier, then capture its current location and responsible person.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>Asset name *</span>
                  <input className={inputClass} value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="e.g. Toyota Hilux" />
                </label>
                <label>
                  <span className={labelClass}>{identifierLabel(draft.category)} *</span>
                  <input className={inputClass} value={draft.identifier} onChange={event => updateDraft('identifier', event.target.value)} placeholder={isVehicleCategory(draft.category) ? 'e.g. VAB 1234' : 'Enter a unique identifier'} />
                </label>
                <label>
                  <span className={labelClass}>Location *</span>
                  <input className={inputClass} value={draft.location} onChange={event => updateDraft('location', event.target.value)} placeholder="e.g. Gopeng Distribution Centre" />
                </label>
                <label>
                  <span className={labelClass}>Ownership</span>
                  <select className={inputClass} value={draft.ownership} onChange={event => updateDraft('ownership', event.target.value as Asset['ownership'])}>
                    <option value="OWNED">Owned</option>
                    <option value="LEASED">Leased</option>
                    <option value="RENTED">Rented</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Brand / manufacturer</span>
                  <input className={inputClass} value={draft.brand} onChange={event => updateDraft('brand', event.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Model</span>
                  <input className={inputClass} value={draft.model} onChange={event => updateDraft('model', event.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Year</span>
                  <input className={inputClass} type="number" min="1950" max="2100" value={draft.year} onChange={event => updateDraft('year', event.target.value)} />
                </label>
              </div>

              {isVehicleCategory(draft.category) && (
                <div className="rounded-xl bg-gray-50 p-4 sm:p-5">
                  <div className="font-bold text-gray-900">Current driver</div>
                  <p className="mt-1 text-sm text-gray-500">Leave this section blank if the vehicle is currently unassigned.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className={labelClass}>Driver name</span>
                      <input className={inputClass} value={draft.driverName} onChange={event => updateDraft('driverName', event.target.value)} />
                    </label>
                    <label>
                      <span className={labelClass}>Licence number</span>
                      <input className={inputClass} value={draft.driverLicenseNumber} onChange={event => updateDraft('driverLicenseNumber', event.target.value)} />
                    </label>
                    <label>
                      <span className={labelClass}>Licence class</span>
                      <input className={inputClass} value={draft.driverLicenseClass} onChange={event => updateDraft('driverLicenseClass', event.target.value)} placeholder="e.g. D, E" />
                    </label>
                    <label>
                      <span className={labelClass}>Licence expiry</span>
                      <input className={inputClass} type="date" value={draft.driverLicenseExpiry} onChange={event => updateDraft('driverLicenseExpiry', event.target.value)} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-7">
              <div>
                <h3 className="text-lg font-bold text-gray-950">Compliance and maintenance</h3>
                <p className="mt-1 text-sm text-gray-500">These dates drive renewal and maintenance alerts.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {isVehicleCategory(draft.category) && (
                  <>
                    <label>
                      <span className={labelClass}>Road tax expiry *</span>
                      <input className={inputClass} type="date" value={draft.roadTaxExpiry} onChange={event => updateDraft('roadTaxExpiry', event.target.value)} />
                    </label>
                    <label>
                      <span className={labelClass}>Insurance expiry *</span>
                      <input className={inputClass} type="date" value={draft.insuranceExpiry} onChange={event => updateDraft('insuranceExpiry', event.target.value)} />
                    </label>
                  </>
                )}
                <label>
                  <span className={labelClass}>{isVehicleCategory(draft.category) ? 'Inspection / PUSPAKOM expiry' : 'Inspection / certification expiry'}</span>
                  <input className={inputClass} type="date" value={draft.inspectionExpiry} onChange={event => updateDraft('inspectionExpiry', event.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Next maintenance / inspection *</span>
                  <input className={inputClass} type="date" value={draft.nextServiceDate} onChange={event => updateDraft('nextServiceDate', event.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>{isVehicleCategory(draft.category) ? 'Current odometer (km)' : 'Current meter / usage reading'}</span>
                  <input className={inputClass} type="number" min="0" value={draft.currentOdometer} onChange={event => updateDraft('currentOdometer', event.target.value)} />
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-lg font-bold text-gray-950">Review the asset record</h3>
              <p className="mt-1 text-sm text-gray-500">You can update costs, claims and documents from the asset record after creation.</p>
              <dl className="mt-6 grid gap-x-8 gap-y-5 rounded-xl border border-gray-200 p-5 sm:grid-cols-2">
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Asset type</dt><dd className="mt-1 font-medium text-gray-900">{categoryLabel(draft.category)}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">{identifierLabel(draft.category)}</dt><dd className="mt-1 font-medium text-gray-900">{draft.identifier.toUpperCase()}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Asset</dt><dd className="mt-1 font-medium text-gray-900">{draft.name}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Location</dt><dd className="mt-1 font-medium text-gray-900">{draft.location}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Current driver</dt><dd className="mt-1 font-medium text-gray-900">{draft.driverName || 'Unassigned'}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Next maintenance</dt><dd className="mt-1 font-medium text-gray-900">{draft.nextServiceDate}</dd></div>
                {isVehicleCategory(draft.category) && (
                  <>
                    <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Road tax expiry</dt><dd className="mt-1 font-medium text-gray-900">{draft.roadTaxExpiry}</dd></div>
                    <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Insurance expiry</dt><dd className="mt-1 font-medium text-gray-900">{draft.insuranceExpiry}</dd></div>
                  </>
                )}
              </dl>
            </div>
          )}

          {error && <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 sm:px-7">
          <button type="button" onClick={step === 0 ? onClose : () => { setStep(current => current - 1); setError(''); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
            {step > 0 && <ArrowLeft className="h-4 w-4" />}
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={moveNext} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-900">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={saveAsset} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60">
              <Check className="h-4 w-4" /> {isSaving ? 'Creating…' : 'Create asset'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
