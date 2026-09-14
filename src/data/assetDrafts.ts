import { Asset, AssetCategory, Document } from '../types';
import { computeAssetStatus, getDocumentStatus } from '../utils/compliance';

export interface AssetDraft {
  category: AssetCategory | '';
  name: string;
  identifier: string;
  location: string;
  brand: string;
  model: string;
  year: string;
  ownership: Asset['ownership'];
  driverName: string;
  driverLicenseNumber: string;
  driverLicenseClass: string;
  driverLicenseExpiry: string;
  roadTaxExpiry: string;
  insuranceExpiry: string;
  inspectionExpiry: string;
  nextServiceDate: string;
  currentOdometer: string;
}

export const emptyAssetDraft = (): AssetDraft => ({
  category: '',
  name: '',
  identifier: '',
  location: '',
  brand: '',
  model: '',
  year: '',
  ownership: 'OWNED',
  driverName: '',
  driverLicenseNumber: '',
  driverLicenseClass: '',
  driverLicenseExpiry: '',
  roadTaxExpiry: '',
  insuranceExpiry: '',
  inspectionExpiry: '',
  nextServiceDate: '',
  currentOdometer: '',
});

export const isVehicleCategory = (category: AssetCategory | '') =>
  category === 'COMMERCIAL_VEHICLE' || category === 'LIGHT_VEHICLE';

export const identifierLabel = (category: AssetCategory | '') => {
  if (isVehicleCategory(category)) return 'Number plate';
  if (category === 'CRATE') return 'Crate ID / barcode';
  if (category === 'HEAVY_MACHINERY' || category === 'WAREHOUSE_EQUIPMENT' || category === 'MOBILE_SITE_EQUIPMENT') {
    return 'Asset tag / serial number';
  }
  return 'Asset ID';
};

export const categoryLabel = (category: AssetCategory | '') =>
  category ? category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, value => value.toUpperCase()) : 'Not selected';

const createDocument = (type: string, expiryDate: string): Document | undefined => {
  if (!expiryDate) return undefined;
  return {
    id: crypto.randomUUID(),
    type,
    expiryDate,
    status: getDocumentStatus(expiryDate),
  };
};

export const buildAsset = (draft: AssetDraft): Asset => {
  if (!draft.category) throw new Error('Asset type is required');

  const now = new Date().toISOString();
  const assignedDriver = draft.driverName.trim()
    ? {
        id: crypto.randomUUID(),
        name: draft.driverName.trim(),
        licenseNumber: draft.driverLicenseNumber.trim(),
        licenseType: draft.driverLicenseClass.trim(),
        licenseExpiry: draft.driverLicenseExpiry,
        phone: '',
        status: 'ACTIVE' as const,
        image: '',
      }
    : undefined;
  const asset: Asset = {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    registrationNumber: draft.identifier.trim().toUpperCase(),
    category: draft.category,
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    year: Number(draft.year) || new Date().getFullYear(),
    ownership: draft.ownership,
    purchaseDate: '',
    purchaseCost: 0,
    image: '',
    location: {
      siteId: draft.location.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: draft.location.trim(),
      type: 'SITE',
      coordinates: { lat: 0, lng: 0 },
      lastUpdated: now,
      status: 'UNVERIFIED',
    },
    assignedDrivers: assignedDriver ? [assignedDriver] : [],
    allocationHistory: assignedDriver
      ? [{
          id: crypto.randomUUID(),
          driverId: assignedDriver.id,
          driverName: assignedDriver.name,
          licenseNumber: assignedDriver.licenseNumber,
          assignedFrom: now.slice(0, 10),
          status: 'ACTIVE',
        }]
      : [],
    claims: [],
    documents: {
      roadTax: createDocument('ROAD_TAX', draft.roadTaxExpiry),
      insurance: createDocument('INSURANCE', draft.insuranceExpiry),
      inspection: createDocument('INSPECTION', draft.inspectionExpiry),
    },
    maintenance: {
      lastServiceDate: '',
      nextServiceDate: draft.nextServiceDate,
      lastOdometer: Number(draft.currentOdometer) || 0,
      records: [],
    },
  };

  return { ...asset, computedStatus: computeAssetStatus(asset) };
};

const categoryAliases: Record<string, AssetCategory> = {
  vehicle: 'LIGHT_VEHICLE',
  'light vehicle': 'LIGHT_VEHICLE',
  light_vehicle: 'LIGHT_VEHICLE',
  commercial: 'COMMERCIAL_VEHICLE',
  'commercial vehicle': 'COMMERCIAL_VEHICLE',
  commercial_vehicle: 'COMMERCIAL_VEHICLE',
  machinery: 'HEAVY_MACHINERY',
  'heavy machinery': 'HEAVY_MACHINERY',
  heavy_machinery: 'HEAVY_MACHINERY',
  'warehouse equipment': 'WAREHOUSE_EQUIPMENT',
  warehouse_equipment: 'WAREHOUSE_EQUIPMENT',
  'mobile equipment': 'MOBILE_SITE_EQUIPMENT',
  mobile_site_equipment: 'MOBILE_SITE_EQUIPMENT',
  crate: 'CRATE',
  other: 'OTHER',
  property: 'PROPERTY',
  building: 'PROPERTY',
  real_estate: 'PROPERTY',
};

export const parseAssetCategory = (value: string): AssetCategory | '' =>
  categoryAliases[value.trim().toLowerCase()] || '';
