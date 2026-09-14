import type { Asset, AssetAction, AssetActionKind } from '../src/types.ts';

export const assetActionKinds: AssetActionKind[] = ['PMA', 'CERTIFICATE_OF_FITNESS', 'PUSPAKOM', 'MACHINERY_INSPECTION', 'PROPERTY_INSURANCE', 'PROPERTY_UTILITY', 'MAINTENANCE', 'TRAFFIC_SUMMONS', 'ACCIDENT', 'OTHER'];

export const assetActionStatus = (asset: Asset, action: AssetAction, today = new Date().toISOString().slice(0, 10)) => {
  if (action.status !== 'OPEN') return action.status;
  if (action.dueDate && action.dueDate < today || action.dueHours !== undefined && (asset.currentOperatingHours || 0) >= action.dueHours) return 'OVERDUE' as const;
  const warningDate = new Date(`${today}T00:00:00Z`); warningDate.setUTCDate(warningDate.getUTCDate() + 30);
  if (action.dueDate && action.dueDate <= warningDate.toISOString().slice(0, 10) || action.dueHours !== undefined && action.dueHours - (asset.currentOperatingHours || 0) <= 50) return 'DUE_SOON' as const;
  return 'OPEN' as const;
};

export const validateAssetAction = (input: Partial<AssetAction>) => {
  if (!assetActionKinds.includes(input.kind as AssetActionKind)) throw new Error('Choose a valid asset action type.');
  if (!String(input.title || '').trim()) throw new Error('Action title is required.');
  if (input.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`)))) throw new Error('Enter a valid due date.');
  if (input.dueHours !== undefined && (!Number.isFinite(input.dueHours) || input.dueHours < 0)) throw new Error('Operating-hour threshold must be non-negative.');
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0)) throw new Error('Amount must be non-negative.');
};
