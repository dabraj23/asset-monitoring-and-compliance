import { Asset, DocumentStatus, AssetStatus } from '../types';

export const parseDateOnly = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const getTodayDateOnly = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const getDocumentStatus = (expiryDate: string, todayDate?: Date): DocumentStatus => {
  const today = todayDate || getTodayDateOnly();
  const expiry = parseDateOnly(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= 30) return 'EXPIRING_SOON';
  return 'VALID';
};

export const calculateDaysRemaining = (expiryDate: string, todayDate?: Date) => {
  const today = todayDate || getTodayDateOnly();
  const expiry = parseDateOnly(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const computeAssetStatus = (asset: Partial<Asset>, todayDate?: Date): AssetStatus => {
  let hasExpired = false;
  let hasExpiringSoon = false;
  let isMaintenance = false;

  const docs = Object.values(asset.documents || {});
  for (const doc of docs) {
    if (doc?.status === 'EXPIRED') hasExpired = true;
    if (doc?.status === 'EXPIRING_SOON') hasExpiringSoon = true;
  }

  for (const driver of asset.assignedDrivers || []) {
    const status = getDocumentStatus(driver.licenseExpiry, todayDate);
    if (status === 'EXPIRED') hasExpired = true;
    if (status === 'EXPIRING_SOON') hasExpiringSoon = true;
  }

  if (asset.maintenance) {
    const pendingRecords = asset.maintenance.records?.some(r => r.status === 'PENDING');
    if (pendingRecords) {
      isMaintenance = true;
    } else if (asset.maintenance.nextServiceDate) {
      const daysToService = calculateDaysRemaining(asset.maintenance.nextServiceDate, todayDate);
      if (daysToService < 0) {
        hasExpired = true; // Overdue service is considered non-compliant
      } else if (daysToService <= 14) {
        hasExpiringSoon = true; // Service due soon
      }
    }
  }

  const today = todayDate || getTodayDateOnly();
  for (const action of asset.actions || []) {
    if (action.status !== 'OPEN') continue;
    if (action.dueDate && parseDateOnly(action.dueDate) < today || action.dueHours !== undefined && (asset.currentOperatingHours || 0) >= action.dueHours) hasExpired = true;
    else if (action.dueDate && calculateDaysRemaining(action.dueDate, today) <= 30 || action.dueHours !== undefined && action.dueHours - (asset.currentOperatingHours || 0) <= 50) hasExpiringSoon = true;
  }

  if (hasExpired) return 'NON_COMPLIANT';
  if (isMaintenance) return 'MAINTENANCE';
  if (hasExpiringSoon) return 'WARNING';
  return 'COMPLIANT';
};
