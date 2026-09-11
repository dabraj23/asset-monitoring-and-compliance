import { useEffect } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const fleetData = [
  { name: 'Mitsubishi Fuso Canter', reg: 'WA2445B', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Non-Compliant', roadTax: '2026-08-24', insurance: '2026-08-24', nextService: '2026-07-05' },
  { name: 'Hino 300 Series', reg: 'BGF6517', category: 'COMMERCIAL_VEHICLE', location: 'Kepong HQ', status: 'Non-Compliant', roadTax: '2026-03-10', insurance: '2026-03-10', nextService: '2026-06-01' },
  { name: 'Toyota Hiace', reg: 'VBH7712', category: 'LIGHT_VEHICLE', location: 'Johor Bahru Branch', status: 'Non-Compliant', roadTax: '2025-12-20', insurance: '2026-12-20', nextService: '2025-12-01' },
  { name: 'Nissan Navara', reg: 'WC1234X', category: 'LIGHT_VEHICLE', location: 'Penang Site', status: 'Compliant', roadTax: '2026-11-15', insurance: '2026-11-15', nextService: '2026-08-01' },
  { name: 'Kobelco Excavator', reg: 'EXC-8892', category: 'HEAVY_MACHINERY', location: 'Penang Site', status: 'Warning', roadTax: '2026-05-20', insurance: '2026-05-20', nextService: '2026-04-15' },
  { name: 'Toyota Forklift', reg: 'FL-2021', category: 'WAREHOUSE_EQUIPMENT', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-09-01', insurance: null, nextService: '2026-05-10' },
  { name: 'Mobile Generator Set', reg: 'GEN-500KVA', category: 'MOBILE_SITE_EQUIPMENT', location: 'Kepong HQ', status: 'Compliant', roadTax: '2027-02-20', insurance: null, nextService: '2026-08-20' },
  { name: 'Toyota Hilux', reg: 'WA1000X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WB1001X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WC1002X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WD1003X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WE1004X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WF1005X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WG1006X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WH1007X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WI1008X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WJ1009X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WK1010X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WL1011X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WM1012X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WN1013X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WO1014X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WP1015X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WQ1016X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WR1017X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WS1018X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WT1019X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WU1020X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WV1021X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Toyota Hilux', reg: 'WW1022X', category: 'LIGHT_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
  { name: 'Hino 500 Series', reg: 'WX1023X', category: 'COMMERCIAL_VEHICLE', location: 'Gopeng Distribution Center', status: 'Compliant', roadTax: '2026-12-31', insurance: '2026-12-31', nextService: '2026-07-01' },
];

export function DataSeeder() {
  useEffect(() => {
    const seedData = async () => {
      console.log('Seeding data... fleetData length:', fleetData.length);
      for (const item of fleetData) {
        try {
          const assetRef = doc(collection(db, 'assets'), item.reg);
          await setDoc(assetRef, {
            name: item.name,
            registrationNumber: item.reg,
            category: item.category,
            computedStatus: item.status,
            location: { name: item.location },
            documents: {
              roadTax: { expiryDate: item.roadTax, status: 'VALID' },
              insurance: item.insurance ? { expiryDate: item.insurance, status: 'VALID' } : null,
              inspection: { expiryDate: item.roadTax, status: 'VALID' }
            },
            maintenance: {
              nextServiceDate: item.nextService,
              lastServiceDate: '2026-01-01',
              lastOdometer: 50000,
              records: []
            },
            image: `https://picsum.photos/seed/${item.reg}/200/200`,
            assignedDrivers: []
          });
          console.log(`Seeded ${item.reg}`);
        } catch (error) {
          console.error(`Failed to seed ${item.reg}:`, error);
        }
      }
      console.log('Data seeded successfully');
    };
    seedData();
  }, []);
  return null;
}
