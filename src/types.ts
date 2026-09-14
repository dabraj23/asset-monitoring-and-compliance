export type DocumentStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
export type AssetStatus = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'MAINTENANCE';
export type AssetCategory =
  | 'COMMERCIAL_VEHICLE'
  | 'LIGHT_VEHICLE'
  | 'HEAVY_MACHINERY'
  | 'WAREHOUSE_EQUIPMENT'
  | 'MOBILE_SITE_EQUIPMENT'
  | 'CRATE'
  | 'PROPERTY'
  | 'OTHER';

export type AssetActionKind = 'PMA' | 'CERTIFICATE_OF_FITNESS' | 'PUSPAKOM' | 'MACHINERY_INSPECTION' | 'PROPERTY_INSURANCE' | 'PROPERTY_UTILITY' | 'MAINTENANCE' | 'TRAFFIC_SUMMONS' | 'ACCIDENT' | 'OTHER';
export interface AssetAction {
  id: string;
  kind: AssetActionKind;
  title: string;
  description: string;
  dueDate?: string;
  dueHours?: number;
  amount?: number;
  certificateNumber?: string;
  ownerName: string;
  ownerEmail: string;
  status: 'OPEN' | 'COMPLETED' | 'WAIVED';
  predecessorId?: string;
  sourceFileId?: string;
  progressNote?: string;
  progressActor?: string;
  progressUpdatedAt?: string;
  evidenceFileIds?: string[];
  completionNote?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Driver {
  id: string;
  entityId?: string;
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
  sourceFileId?: string;
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
  sourceFileId?: string;
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
  sourceFileId?: string;
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
  entityId?: string;
  name: string;
  registrationNumber: string;
  category: AssetCategory;
  department?: string;
  picName?: string;
  picEmail?: string;
  currentOperatingHours?: number;
  actions?: AssetAction[];
  evidenceDocuments?: Array<{ id: string; code: string; title: string; values: Record<string, string>; expiryDate?: string; sourceFileId: string; sourceReference: string; supersededBy?: string; recordedAt: string }>;
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
    nextServiceHours?: number;
    records: MaintenanceRecord[];
  };
  computedStatus?: AssetStatus;
}
