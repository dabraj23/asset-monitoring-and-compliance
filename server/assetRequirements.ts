import type { Asset } from '../src/types.ts';
import type { WorkflowInstruction } from './workflowStore.ts';
import { assetActionStatus } from './assetActions.ts';

export interface AssetRequirementResult { code: string; status: 'PASSED' | 'WARNING' | 'FAILED' | 'REVIEW_REQUIRED'; reason: string; dueDate?: string; sourceFileId?: string; ruleVersion: number }

export const evaluateAssetRequirements = (asset: Asset, instruction: WorkflowInstruction & { version?: number } | undefined): AssetRequirementResult[] => {
  if (!instruction) return [];
  const today = new Date().toISOString().slice(0, 10);
  return instruction.requiredDocumentTypes.map(code => {
    const legacy = code === 'ROAD_TAX' ? asset.documents.roadTax : code === 'INSURANCE' ? asset.documents.insurance : code === 'INSPECTION' ? asset.documents.inspection : undefined;
    if (legacy) {
      const status = legacy.expiryDate < today ? 'FAILED' : legacy.expiryDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) ? 'WARNING' : legacy.sourceFileId ? 'PASSED' : 'REVIEW_REQUIRED';
      return { code, status, reason: legacy.sourceFileId ? 'Accepted asset evidence on record.' : 'Manual date record; upload and review evidence.', dueDate: legacy.expiryDate, sourceFileId: legacy.sourceFileId, ruleVersion: instruction.version || 1 };
    }
    const configuredEvidence = (asset.evidenceDocuments || []).filter(item => item.code === code && !item.supersededBy).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    if (configuredEvidence) {
      const expiry = configuredEvidence.expiryDate;
      const status = expiry && expiry < today ? 'FAILED' : expiry && expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) ? 'WARNING' : configuredEvidence.sourceFileId ? 'PASSED' : 'REVIEW_REQUIRED';
      return { code, status, reason: configuredEvidence.sourceFileId ? 'Accepted configured document evidence on record.' : 'Source evidence must be reviewed.', dueDate: expiry, sourceFileId: configuredEvidence.sourceFileId, ruleVersion: instruction.version || 1 };
    }
    const action = (asset.actions || []).find(item => item.kind === code && item.status === 'OPEN');
    if (action) {
      const status = assetActionStatus(asset, action, today);
      return { code, status: status === 'OVERDUE' ? 'FAILED' : status === 'DUE_SOON' ? 'WARNING' : action.sourceFileId ? 'PASSED' : 'REVIEW_REQUIRED', reason: action.sourceFileId ? 'Accepted asset evidence on record.' : 'Manual action only; upload and review source evidence.', dueDate: action.dueDate, sourceFileId: action.sourceFileId, ruleVersion: instruction.version || 1 };
    }
    return { code, status: instruction.blocking ? 'FAILED' : 'WARNING', reason: 'Required evidence is missing for this asset category and entity.', ruleVersion: instruction.version || 1 };
  });
};
