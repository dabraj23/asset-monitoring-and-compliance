import { AlertTriangle, ArrowRight, FileSpreadsheet, Loader2, PackagePlus, Truck, UserRoundCheck } from 'lucide-react';
import { Asset } from '../types';
import { computeAssetStatus } from '../utils/compliance';
import { AssetList } from './AssetList';

interface AssetRegisterStartProps {
  assets: Asset[];
  isLoading: boolean;
  onAddAsset: () => void;
  onBulkUpload: () => void;
  onSelectAsset: (asset: Asset) => void;
}

export function AssetRegisterStart({ assets, isLoading, onAddAsset, onBulkUpload, onSelectAsset }: AssetRegisterStartProps) {
  if (isLoading) {
    return <div className="flex min-h-80 items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading asset register…</div>;
  }

  if (!assets.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="grid gap-8 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 px-6 py-10 text-white lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-12">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">Asset register setup</div>
            <h2 className="mt-3 max-w-xl text-3xl font-bold leading-tight">Start with one asset or bring your complete register.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-blue-100">Register vehicles, machinery, crates and equipment together. Capture their identifiers, current driver or custodian, compliance dates and next maintenance information from the beginning.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onAddAsset} className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-950 hover:bg-yellow-300">
                <PackagePlus className="h-5 w-5" /> Add first asset
              </button>
              <button type="button" onClick={onBulkUpload} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20">
                <FileSpreadsheet className="h-5 w-5" /> Upload asset list
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm">
            <div className="text-sm font-bold">Your setup path</div>
            <ol className="mt-5 space-y-4">
              {[
                ['1', 'Register assets', 'Add one record or validate a bulk CSV.'],
                ['2', 'Confirm drivers', 'Capture licence details and current allocations.'],
                ['3', 'Track obligations', 'Monitor road tax, insurance and maintenance.'],
              ].map(([number, title, description]) => (
                <li key={number} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-950">{number}</span>
                  <div><div className="text-sm font-bold">{title}</div><div className="mt-0.5 text-xs leading-5 text-blue-100">{description}</div></div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="grid gap-0 border-t border-gray-100 sm:grid-cols-3">
          {[
            ['One register', 'Vehicles, machinery, crates and equipment'],
            ['Allocation history', 'Driver and custodian accountability'],
            ['Compliance ready', 'Documents and due dates in one record'],
          ].map(([title, description], index) => (
            <div key={title} className={`px-6 py-5 ${index ? 'border-t border-gray-100 sm:border-l sm:border-t-0' : ''}`}>
              <div className="text-sm font-bold text-gray-900">{title}</div>
              <div className="mt-1 text-sm text-gray-500">{description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const vehicles = assets.filter(asset => asset.category === 'LIGHT_VEHICLE' || asset.category === 'COMMERCIAL_VEHICLE').length;
  const unassignedVehicles = assets.filter(asset => (asset.category === 'LIGHT_VEHICLE' || asset.category === 'COMMERCIAL_VEHICLE') && !asset.assignedDrivers.length).length;
  const actionRequired = assets.filter(asset => ['WARNING', 'NON_COMPLIANT'].includes(computeAssetStatus(asset))).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total assets', value: assets.length, context: 'Across all asset types', icon: Truck, color: 'text-blue-700 bg-blue-50' },
          { label: 'Vehicles', value: vehicles, context: 'Light and commercial', icon: Truck, color: 'text-indigo-700 bg-indigo-50' },
          { label: 'Unassigned vehicles', value: unassignedVehicles, context: 'Driver allocation needed', icon: UserRoundCheck, color: 'text-orange-700 bg-orange-50' },
          { label: 'Action required', value: actionRequired, context: 'Compliance or maintenance', icon: AlertTriangle, color: 'text-red-700 bg-red-50' },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div><div className="text-sm text-gray-500">{item.label}</div><div className="mt-1 text-2xl font-bold text-gray-950">{item.value}</div><div className="mt-1 text-xs text-gray-400">{item.context}</div></div>
            <div className={`rounded-lg p-3 ${item.color}`}><item.icon className="h-5 w-5" /></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="font-bold text-blue-950">Continue building the register</div><div className="mt-1 text-sm text-blue-700">Add another record or import a validated batch.</div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBulkUpload} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50"><FileSpreadsheet className="h-4 w-4" /> Bulk upload</button>
          <button type="button" onClick={onAddAsset} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white hover:bg-blue-900">Add asset <ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>

      <AssetList assets={assets} onSelectAsset={onSelectAsset} />
    </div>
  );
}
