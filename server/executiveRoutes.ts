import type { Express } from 'express';
import { assetStore } from './assetStore.ts';
import { contractStore } from './contractStore.ts';
import { vendorStore } from './vendorStore.ts';
import { syncVendorAgreementStatus } from './vendorRoutes.ts';
import { currentUser } from './platformAuth.ts';
import { computeAssetStatus } from '../src/utils/compliance.ts';
import { assetActionStatus } from './assetActions.ts';

export function registerExecutiveRoutes(app: Express) {
  app.get('/api/executive/record/:module/:id', async (request, response) => {
    const user = currentUser(request)!;
    if (!['EXECUTIVE', 'GROUP_ADMIN'].includes(user.role)) return response.status(403).json({ error: 'Group reporting access required.' });
    const id = request.params.id;
    if (request.params.module === 'CONTRACT') {
      const item = await contractStore.contract(id); if (!item) return response.status(404).json({ error: 'Record not found.' });
      return response.json({ id, module: 'CONTRACT', title: item.title, entityId: item.primaryEntityId, status: item.status, activity: item.principalActivity, site: item.siteOrProject, ownerAssigned: Boolean(item.owners.contractOwnerEmail), evidence: item.documents.map((document, index) => ({ label: `Document ${index + 1}`, type: document.documentType, status: document.extractionStatus, uploadedAt: document.uploadedAt })), actions: [...item.obligations.map(obligation => ({ title: obligation.title, status: obligation.status, dueDate: obligation.nextDueDate || obligation.dueDate, ownerAssigned: Boolean(obligation.ownerEmail) })), ...(item.paymentMilestones || []).map(payment => ({ title: `${payment.direction}: ${payment.title}`, status: payment.status === 'SETTLED' && payment.reconciliationStatus !== 'RECONCILED' ? 'RECONCILIATION_PENDING' : payment.status, dueDate: payment.dueDate, ownerAssigned: Boolean(payment.ownerEmail) }))] });
    }
    if (request.params.module === 'VENDOR') {
      await syncVendorAgreementStatus();
      const item = await vendorStore.vendor(id); if (!item || !item.entityId) return response.status(404).json({ error: 'Record not found.' });
      return response.json({ id, module: 'VENDOR', title: item.legalName, entityId: item.entityId, status: item.onboardingStatus, agreementStatus: item.requirementResults.find(result => result.ruleId === 'agreement')?.status || 'NOT_APPLICABLE', activity: item.categoryName, site: '', ownerAssigned: item.followUps.some(task => Boolean(task.owner)), evidence: item.documents.map((document, index) => ({ label: `Document ${index + 1}`, type: document.documentType, status: document.extractionStatus, uploadedAt: document.uploadedAt })), actions: item.followUps.map(task => ({ title: task.title, status: task.status, dueDate: task.dueDate, ownerAssigned: Boolean(task.owner) })) });
    }
    if (request.params.module === 'ASSET') {
      const item = await assetStore.asset(id); if (!item) return response.status(404).json({ error: 'Record not found.' });
      return response.json({ id, module: 'ASSET', title: item.registrationNumber, entityId: item.entityId, status: computeAssetStatus(item), activity: item.category.replaceAll('_', ' '), site: item.location?.name || '', ownerAssigned: Boolean(item.picEmail), evidence: Object.entries(item.documents || {}).filter(([, value]) => Boolean(value)).map(([type, value], index) => ({ label: `Document ${index + 1}`, type, status: value?.status, uploadedAt: '' })), actions: (item.actions || []).map(action => ({ title: action.title, status: assetActionStatus(item, action), dueDate: action.dueDate, dueHours: action.dueHours, ownerAssigned: Boolean(action.ownerEmail) })) });
    }
    return response.status(400).json({ error: 'Unsupported module.' });
  });
  app.get('/api/executive/overview', async (request, response) => {
    const user = currentUser(request)!;
    if (!['EXECUTIVE', 'GROUP_ADMIN'].includes(user.role)) return response.status(403).json({ error: 'Group reporting access required.' });
    await syncVendorAgreementStatus();
    const [entities, contracts, vendors, assets] = await Promise.all([contractStore.entities(), contractStore.contracts(), vendorStore.vendors(), assetStore.assets()]);
    const records = [
      ...contracts.map(item => ({ id: item.id, module: 'CONTRACT', entityId: item.primaryEntityId, title: item.title, activity: item.principalActivity || 'Unclassified', site: item.siteOrProject || 'Group-wide', status: item.status, dueDate: item.expiryDate || '', ownerAssigned: Boolean(item.owners.contractOwnerEmail), associatedEntityIds: item.coveredEntityIds.filter(id => id !== item.primaryEntityId) })),
      ...vendors.filter(item => item.entityId).map(item => ({ id: item.id, module: 'VENDOR', entityId: item.entityId!, title: item.legalName, activity: item.categoryName || 'Unclassified', site: 'Group-wide', status: item.onboardingStatus, agreementStatus: item.requirementResults.find(result => result.ruleId === 'agreement')?.status || 'NOT_APPLICABLE', dueDate: '', ownerAssigned: item.followUps.some(task => Boolean(task.owner)), associatedEntityIds: [] as string[] })),
      ...assets.map(item => ({ id: item.id, module: 'ASSET', entityId: item.entityId, title: item.registrationNumber, activity: item.category.replaceAll('_', ' '), site: item.location?.name || 'Unassigned site', status: computeAssetStatus(item), dueDate: (item.actions || []).filter(action => action.status === 'OPEN' && action.dueDate).map(action => action.dueDate!).sort()[0] || '', ownerAssigned: Boolean(item.picEmail), associatedEntityIds: [] as string[] })),
    ].filter(item => entities.some(entity => entity.id === item.entityId));
    response.json({ entities: entities.map(entity => ({ id: entity.id, parentId: entity.parentId, name: entity.displayName, activities: entity.principalActivities, sites: entity.sites })), records, totals: { contracts: contracts.length, vendors: vendors.filter(item => item.entityId).length, assets: assets.length } });
  });
}
