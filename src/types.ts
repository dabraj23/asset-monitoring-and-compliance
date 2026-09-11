export type DocumentStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
export type AssetStatus = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'MAINTENANCE';
export type AssetCategory =
  | 'COMMERCIAL_VEHICLE'
  | 'LIGHT_VEHICLE'
  | 'HEAVY_MACHINERY'
  | 'WAREHOUSE_EQUIPMENT'
  | 'MOBILE_SITE_EQUIPMENT'
  | 'CRATE'
  | 'OTHER';

export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  image: string;
}

export interface DriverAllocationRecord {
  id: string;
  driverId: string;
  driverName: string;
  licenseNumber: string;
  assignedFrom: string;
  assignedTo?: string;
  reason?: string;
  status: 'ACTIVE' | 'ENDED';
}

export interface ClaimRecord {
  id: string;
  claimNumber: string;
  incidentDate: string;
  description: string;
  amount: number;
  insurer: string;
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SETTLED';
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'PREVENTIVE' | 'CORRECTIVE';
  description: string;
  cost: number;
  status: 'COMPLETED' | 'PENDING';
  odometer?: number;
  nextDueDate?: string;
  attachmentName?: string;
}

export interface Document {
  id: string;
  type: string;
  startDate?: string;
  expiryDate: string;
  status: DocumentStatus;
  provider?: string;
  policyNumber?: string;
  attachmentName?: string;
  lastRenewedDate?: string;
  lastRenewedBy?: string;
}

export interface Location {
  siteId: string;
  name: string;
  type: string;
  coordinates: { lat: number; lng: number };
  lastUpdated: string;
  status: 'VERIFIED' | 'UNVERIFIED';
}

export interface Asset {
  id: string;
  name: string;
  registrationNumber: string;
  category: AssetCategory;
  brand: string;
  model: string;
  year: number;
  ownership: 'OWNED' | 'LEASED' | 'RENTED';
  purchaseDate: string;
  purchaseCost: number;
  image: string;
  location: Location;
  assignedDrivers: Driver[];
  allocationHistory?: DriverAllocationRecord[];
  claims?: ClaimRecord[];
  documents: {
    roadTax?: Document;
    insurance?: Document;
    inspection?: Document;
  };
  maintenance: {
    lastServiceDate: string;
    nextServiceDate: string;
    lastOdometer?: number;
    nextServiceOdometer?: number;
    records: MaintenanceRecord[];
  };
  computedStatus?: AssetStatus;
}
