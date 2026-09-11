import { Asset, AssetStatus, AssetCategory } from '../types';
import { calculateDaysRemaining, computeAssetStatus } from '../utils/compliance';
import { Eye, MapPin, Search, Filter } from 'lucide-react';
import { useState } from 'react';

interface AssetListProps {
  assets: Asset[];
  onSelectAsset: (asset: Asset) => void;
}

export function AssetList({ assets, onSelectAsset }: AssetListProps) {
  const [filterCategory, setFilterCategory] = useState<AssetCategory | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAssets = assets.filter(asset => {
    const matchesCategory = filterCategory === 'ALL' || asset.category === filterCategory;
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          asset.registrationNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStatusBadge = (status: AssetStatus) => {
    switch (status) {
      case 'COMPLIANT':
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">Compliant</span>;
      case 'WARNING':
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Warning</span>;
      case 'NON_COMPLIANT':
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">Non-Compliant</span>;
      case 'MAINTENANCE':
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">Maintenance</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">Unknown</span>;
    }
  };

  const DateCell = ({ date, label }: { date?: string, label: string }) => {
    if (!date) return <span className="text-xs text-gray-400">N/A</span>;
    
    const days = calculateDaysRemaining(date);
    let colorClass = "text-gray-600";
    if (days < 0) colorClass = "text-red-600 font-bold";
    else if (days < 30) colorClass = "text-orange-600 font-medium";

    return (
      <div className="flex flex-col">
        <span className={`text-xs ${colorClass}`}>{new Date(date).toLocaleDateString()}</span>
        <span className="text-[10px] text-gray-400">{days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search by Name, Reg No..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00529B]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <Filter className="w-4 h-4 text-gray-500" />
          <select 
            className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#00529B] focus:border-[#00529B] block p-2"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
          >
            <option value="ALL">All Categories</option>
            <option value="COMMERCIAL_VEHICLE">Commercial Vehicles</option>
            <option value="LIGHT_VEHICLE">Light Vehicles</option>
            <option value="HEAVY_MACHINERY">Heavy Machinery</option>
            <option value="WAREHOUSE_EQUIPMENT">Warehouse Equipment</option>
            <option value="MOBILE_SITE_EQUIPMENT">Mobile Site Equipment</option>
            <option value="CRATE">Crates / Containers</option>
            <option value="OTHER">Other Assets</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                <th className="p-4">Asset</th>
                <th className="p-4">Category</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4">Road Tax / PMA</th>
                <th className="p-4">Insurance</th>
                <th className="p-4">Next Service</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {asset.image ? (
                        <img src={asset.image} alt={asset.name} className="w-10 h-10 rounded object-cover bg-gray-200" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-sm font-bold text-blue-700" aria-hidden="true">
                          {asset.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{asset.name}</div>
                        <div className="text-xs text-gray-500">{asset.registrationNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                      {asset.category.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <MapPin className={`w-3 h-3 ${asset.location.status === 'UNVERIFIED' ? 'text-[#C5A017]' : 'text-gray-400'}`} />
                      <span className="truncate max-w-[150px]" title={asset.location.name}>{asset.location.name}</span>
                    </div>
                    {asset.location.status === 'UNVERIFIED' && (
                      <span className="text-[10px] text-[#C5A017] font-bold ml-4">Unverified</span>
                    )}
                  </td>
                  <td className="p-4">
                    {getStatusBadge(computeAssetStatus(asset))}
                  </td>
                  <td className="p-4">
                    <DateCell date={asset.documents.roadTax?.expiryDate || asset.documents.inspection?.expiryDate} label="Doc" />
                  </td>
                  <td className="p-4">
                    <DateCell date={asset.documents.insurance?.expiryDate} label="Insurance" />
                  </td>
                  <td className="p-4">
                    <DateCell date={asset.maintenance.nextServiceDate} label="Service" />
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => onSelectAsset(asset)}
                      className="p-2 text-gray-400 hover:text-[#00529B] hover:bg-blue-50 rounded-full transition-all"
                      title="View Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredAssets.length && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-sm text-gray-500">No assets match this search or category.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
