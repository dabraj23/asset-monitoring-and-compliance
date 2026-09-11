import { Asset, AssetCategory, Driver, MaintenanceRecord } from '../types';
import { getDocumentStatus, computeAssetStatus } from '../utils/compliance';

// Helper to create a document
const createDoc = (type: any, expiryDate: string, provider?: string, policy?: string) => {
  const expiry = new Date(expiryDate);
  const lastRenewed = new Date(expiry);
  lastRenewed.setFullYear(lastRenewed.getFullYear() - 1);
  const lastRenewedStr = lastRenewed.toISOString().split('T')[0];

  return {
    id: Math.random().toString(36).substr(2, 9),
    type,
    expiryDate,
    status: getDocumentStatus(expiryDate),
    provider,
    policyNumber: policy,
    lastRenewedDate: lastRenewedStr,
    lastRenewedBy: 'System Admin'
  };
};

// Mock Drivers
const drivers: Driver[] = [
  {
    id: 'DRV-001',
    name: 'Ahmad bin Ali',
    licenseNumber: '800101-14-1234',
    licenseType: 'GDL',
    licenseExpiry: '2026-12-31',
    phone: '+6012-3456789',
    status: 'ACTIVE',
    image: 'https://randomuser.me/api/portraits/men/1.jpg'
  },
  {
    id: 'DRV-002',
    name: 'Muthu a/l Raju',
    licenseNumber: '850505-10-5678',
    licenseType: 'E',
    licenseExpiry: '2026-03-25', // Expiring soon (within 30 days of 2026-03-06)
    phone: '+6013-9876543',
    status: 'ACTIVE',
    image: 'https://randomuser.me/api/portraits/men/3.jpg'
  },
  {
    id: 'DRV-003',
    name: 'Chong Wei Meng',
    licenseNumber: '900202-07-9988',
    licenseType: 'H',
    licenseExpiry: '2026-06-20',
    phone: '+6019-1122334',
    status: 'ACTIVE',
    image: 'https://randomuser.me/api/portraits/men/5.jpg'
  },
  {
    id: 'DRV-004',
    name: 'Siti Aminah',
    licenseNumber: '920808-14-5566',
    licenseType: 'D',
    licenseExpiry: '2025-12-01', // Expired
    phone: '+6017-7788990',
    status: 'INACTIVE',
    image: 'https://randomuser.me/api/portraits/women/2.jpg'
  }
];

const createMaintenanceHistory = (assetId: string): MaintenanceRecord[] => [
  {
    id: `M-${assetId}-1`,
    date: '2025-12-01',
    type: 'PREVENTIVE',
    description: 'Regular Service (Oil, Filter, Inspection)',
    cost: 450,
    status: 'COMPLETED',
    odometer: 40000,
    nextDueDate: '2026-06-01'
  },
  {
    id: `M-${assetId}-2`,
    date: '2025-06-01',
    type: 'PREVENTIVE',
    description: 'Major Service (Timing Belt, Brakes)',
    cost: 1200,
    status: 'COMPLETED',
    odometer: 30000
  },
  {
    id: `M-${assetId}-3`,
    date: '2025-03-15',
    type: 'CORRECTIVE',
    description: 'Battery Replacement',
    cost: 350,
    status: 'COMPLETED',
    odometer: 28500
  }
];

const assets: Partial<Asset>[] = [
  {
    id: 'LSH-001',
    name: 'Mitsubishi Fuso Canter',
    registrationNumber: 'WA2445B',
    category: 'COMMERCIAL_VEHICLE',
    brand: 'Mitsubishi',
    model: 'Fuso TF',
    year: 2019,
    ownership: 'OWNED',
    purchaseDate: '2019-03-21',
    purchaseCost: 125000,
    image: 'https://picsum.photos/seed/truck1/400/300',
    location: {
      siteId: 'LOC-001',
      name: 'Gopeng Distribution Center',
      type: 'WAREHOUSE',
      coordinates: { lat: 4.4705, lng: 101.1678 },
      lastUpdated: '2026-03-06T08:00:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [drivers[0], drivers[1]],
    documents: {
      roadTax: createDoc('ROAD_TAX', '2026-08-24'),
      insurance: createDoc('INSURANCE', '2026-08-24', 'Zurich Takaful', 'P123456'),
      inspection: createDoc('PUSPAKOM_INSPECTION', '2026-08-24')
    },
    maintenance: {
      lastServiceDate: '2026-01-05',
      nextServiceDate: '2026-07-05',
      lastOdometer: 45000,
      nextServiceOdometer: 50000,
      records: createMaintenanceHistory('LSH-001')
    }
  },
  {
    id: 'LSH-002',
    name: 'Hino 300 Series',
    registrationNumber: 'BGF6517',
    category: 'COMMERCIAL_VEHICLE',
    brand: 'Hino',
    model: 'XZC730',
    year: 2020,
    ownership: 'OWNED',
    purchaseDate: '2020-05-15',
    purchaseCost: 130000,
    image: 'https://picsum.photos/seed/truck2/400/300',
    location: {
      siteId: 'LOC-002',
      name: 'Kepong HQ',
      type: 'HQ',
      coordinates: { lat: 3.2175, lng: 101.6376 },
      lastUpdated: '2026-03-06T08:15:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [drivers[1]],
    documents: {
      roadTax: createDoc('ROAD_TAX', '2026-03-10'), // Expiring soon
      insurance: createDoc('INSURANCE', '2026-03-10', 'Allianz', 'A987654'),
      inspection: createDoc('PUSPAKOM_INSPECTION', '2026-03-10')
    },
    maintenance: {
      lastServiceDate: '2025-12-01',
      nextServiceDate: '2026-06-01',
      lastOdometer: 62000,
      nextServiceOdometer: 67000,
      records: createMaintenanceHistory('LSH-002')
    }
  },
  {
    id: 'LSH-003',
    name: 'Toyota Hiace',
    registrationNumber: 'VBH7712',
    category: 'LIGHT_VEHICLE',
    brand: 'Toyota',
    model: 'Hiace Panel Van',
    year: 2021,
    ownership: 'LEASED',
    purchaseDate: '2021-01-10',
    purchaseCost: 110000,
    image: 'https://picsum.photos/seed/van1/400/300',
    location: {
      siteId: 'LOC-003',
      name: 'Johor Bahru Branch',
      type: 'BRANCH',
      coordinates: { lat: 1.4927, lng: 103.7414 },
      lastUpdated: '2026-03-05T18:30:00Z',
      status: 'UNVERIFIED'
    },
    assignedDrivers: [drivers[3]], // Has expired license
    documents: {
      roadTax: createDoc('ROAD_TAX', '2025-12-20'), // Expired
      insurance: createDoc('INSURANCE', '2026-12-20', 'Etiqa', 'E456789'),
      inspection: createDoc('PUSPAKOM_INSPECTION', '2026-01-15') // Expired
    },
    maintenance: {
      lastServiceDate: '2025-06-01',
      nextServiceDate: '2025-12-01', // Overdue
      lastOdometer: 80000,
      nextServiceOdometer: 85000,
      records: createMaintenanceHistory('LSH-003')
    }
  },
  {
    id: 'LSH-004',
    name: 'Nissan Navara',
    registrationNumber: 'WC1234X',
    category: 'LIGHT_VEHICLE',
    brand: 'Nissan',
    model: 'Navara Pro-4X',
    year: 2022,
    ownership: 'OWNED',
    purchaseDate: '2022-06-01',
    purchaseCost: 120000,
    image: 'https://picsum.photos/seed/pickup1/400/300',
    location: {
      siteId: 'LOC-004',
      name: 'Penang Site',
      type: 'SITE',
      coordinates: { lat: 5.4141, lng: 100.3288 },
      lastUpdated: '2026-03-06T09:00:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [],
    documents: {
      roadTax: createDoc('ROAD_TAX', '2026-11-15'),
      insurance: createDoc('INSURANCE', '2026-11-15', 'Tokio Marine', 'TM112233'),
      inspection: createDoc('PUSPAKOM_INSPECTION', '2026-11-15')
    },
    maintenance: {
      lastServiceDate: '2026-02-01',
      nextServiceDate: '2026-08-01',
      lastOdometer: 30000,
      nextServiceOdometer: 35000,
      records: createMaintenanceHistory('LSH-004')
    }
  },
  {
    id: 'LSH-005',
    name: 'Kobelco Excavator',
    registrationNumber: 'EXC-8892',
    category: 'HEAVY_MACHINERY',
    brand: 'Kobelco',
    model: 'SK200',
    year: 2018,
    ownership: 'OWNED',
    purchaseDate: '2018-04-12',
    purchaseCost: 350000,
    image: 'https://picsum.photos/seed/excavator/400/300',
    location: {
      siteId: 'LOC-004',
      name: 'Penang Site',
      type: 'SITE',
      coordinates: { lat: 5.4141, lng: 100.3288 },
      lastUpdated: '2026-03-06T09:00:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [drivers[2]],
    documents: {
      inspection: createDoc('PMA_CERT', '2026-05-20'),
      insurance: createDoc('INSURANCE', '2026-05-20', 'Allianz', 'CAR-998877')
    },
    maintenance: {
      lastServiceDate: '2026-01-15',
      nextServiceDate: '2026-04-15',
      lastOdometer: 4200, // Hours
      nextServiceOdometer: 4450,
      records: createMaintenanceHistory('LSH-005')
    }
  },
  {
    id: 'LSH-006',
    name: 'Toyota Forklift',
    registrationNumber: 'FL-2021',
    category: 'WAREHOUSE_EQUIPMENT',
    brand: 'Toyota',
    model: '8FD25',
    year: 2021,
    ownership: 'RENTED',
    purchaseDate: '2021-08-01',
    purchaseCost: 0, // Rented
    image: 'https://picsum.photos/seed/forklift/400/300',
    location: {
      siteId: 'LOC-001',
      name: 'Gopeng Distribution Center',
      type: 'WAREHOUSE',
      coordinates: { lat: 4.4705, lng: 101.1678 },
      lastUpdated: '2026-03-06T08:00:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [],
    documents: {
      inspection: createDoc('PMA_CERT', '2026-09-01')
    },
    maintenance: {
      lastServiceDate: '2026-02-10',
      nextServiceDate: '2026-05-10',
      records: createMaintenanceHistory('LSH-006')
    }
  },
// ... existing assets ...
  {
    id: 'LSH-007',
    name: 'Mobile Generator Set',
    registrationNumber: 'GEN-500KVA',
    category: 'MOBILE_SITE_EQUIPMENT',
    brand: 'Cummins',
    model: 'C500D5',
    year: 2023,
    ownership: 'OWNED',
    purchaseDate: '2023-02-20',
    purchaseCost: 85000,
    image: 'https://picsum.photos/seed/generator/400/300',
    location: {
      siteId: 'LOC-002',
      name: 'Kepong HQ',
      type: 'HQ',
      coordinates: { lat: 3.2175, lng: 101.6376 },
      lastUpdated: '2026-03-06T08:15:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [],
    documents: {
      // Generators might not have road tax/PMA but have safety certs
      inspection: createDoc('PMA_CERT', '2027-02-20')
    },
    maintenance: {
      lastServiceDate: '2026-02-20',
      nextServiceDate: '2026-08-20',
      records: createMaintenanceHistory('LSH-007')
    }
  }
];

// Generate additional assets to reach 23 total
const additionalAssets: Partial<Asset>[] = Array.from({ length: 16 }).map((_, index) => {
  const idNum = index + 8;
  const isEven = idNum % 2 === 0;
  return {
    id: `LSH-${idNum.toString().padStart(3, '0')}`,
    name: isEven ? 'Toyota Hilux' : 'Hino 500 Series',
    registrationNumber: `W${String.fromCharCode(65 + index)}${1000 + index}X`,
    category: isEven ? 'LIGHT_VEHICLE' : 'COMMERCIAL_VEHICLE',
    brand: isEven ? 'Toyota' : 'Hino',
    model: isEven ? 'Hilux' : '500 Series',
    year: 2022,
    ownership: 'OWNED',
    purchaseDate: '2022-01-15',
    purchaseCost: isEven ? 110000 : 180000,
    image: `https://picsum.photos/seed/fleet${idNum}/400/300`,
    location: {
      siteId: 'LOC-001',
      name: 'Gopeng Distribution Center',
      type: 'WAREHOUSE',
      coordinates: { lat: 4.4705, lng: 101.1678 },
      lastUpdated: '2026-03-06T08:00:00Z',
      status: 'VERIFIED'
    },
    assignedDrivers: [],
    documents: {
      roadTax: createDoc('ROAD_TAX', '2026-12-31'),
      insurance: createDoc('INSURANCE', '2026-12-31', 'Etiqa', `POL-${idNum}`),
      inspection: createDoc('PUSPAKOM_INSPECTION', '2026-12-31')
    },
    maintenance: {
      lastServiceDate: '2026-01-01',
      nextServiceDate: '2026-07-01',
      lastOdometer: 10000,
      nextServiceOdometer: 15000,
      records: []
    }
  };
});

const allAssets = [...assets, ...additionalAssets];

// Compute status for all assets
export const MOCK_ASSETS: Asset[] = allAssets.map(a => ({
  ...a,
  computedStatus: computeAssetStatus(a)
})) as Asset[];
