import type { NextFunction, Request, Response } from 'express';
import { contractStore } from './contractStore.ts';
import { vendorStore } from './vendorStore.ts';
import { canReadEntity, canWriteEntity, currentUser } from './platformAuth.ts';

const denied = (response: Response) => response.status(403).json({ error: 'This action is outside your permitted entity or role.' });
const hidden = (response: Response) => response.status(404).json({ error: 'Record not found.' });
const canReadContract = (user: NonNullable<ReturnType<typeof currentUser>>, contract: Awaited<ReturnType<typeof contractStore.contract>>) => !!contract && (canReadEntity(user, contract.primaryEntityId) || contract.coveredEntityIds?.some(id => canReadEntity(user, id)));

/** Runs before the legacy route modules so downloads, jobs and direct IDs cannot bypass entity scope. */
export const entityAccess = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: 'Sign in required.' });
    const pathname = request.originalUrl.split('?')[0];
    const changing = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (user.role === 'EXECUTIVE' && changing) return denied(response);
    if (user.role === 'EXECUTIVE' && !/^\/api\/(?:executive(?:\/|$)|corporate-entities$|settings\/api-key\/status$)/.test(pathname)) return denied(response);

    if (changing && (/^\/api\/(?:corporate-entities|vendor-config|contract-config|workflow-config|settings\/api-key)/.test(pathname))) {
      if (user.role !== 'GROUP_ADMIN') return denied(response);
    }
    if (pathname === '/api/vendor-email-outbox' && user.role !== 'GROUP_ADMIN') return denied(response);

    const contractJobId = pathname.match(/^\/api\/contract-jobs\/([^/]+)$/)?.[1];
    if (contractJobId) {
      const job = await contractStore.job(contractJobId);
      if (!job) return hidden(response);
      const contract = await contractStore.contract(job.contractId);
      if (!canReadContract(user, contract)) return hidden(response);
    }
    const vendorJobId = pathname.match(/^\/api\/verification-jobs\/([^/]+)$/)?.[1];
    if (vendorJobId) {
      const job = await vendorStore.job(vendorJobId);
      if (!job) return hidden(response);
      const vendor = await vendorStore.vendor(job.vendorId);
      if (!vendor || !canReadEntity(user, vendor.entityId || '')) return hidden(response);
    }

    const contractId = pathname.match(/^\/api\/contracts\/([^/]+)/)?.[1];
    if (contractId && !['smart-files', 'drafts'].includes(contractId)) {
      const contract = await contractStore.contract(contractId);
      if (!canReadContract(user, contract)) return hidden(response);
      if (changing) {
        const obligationId = pathname.match(/\/obligations\/([^/]+)/)?.[1];
        const obligationEntity = obligationId ? contract.obligations.find(item => item.id === obligationId)?.entityId : undefined;
        const ownerCompletion = user.role === 'OWNER' && pathname.endsWith('/complete') && obligationId && contract.obligations.some(item => item.id === obligationId && item.ownerEmail.toLowerCase() === user.email && canReadEntity(user, item.entityId));
        if (!ownerCompletion && !canWriteEntity(user, obligationEntity || contract.primaryEntityId)) return denied(response);
      }
    }
    const vendorId = pathname.match(/^\/api\/vendors\/([^/]+)/)?.[1];
    if (vendorId && vendorId !== 'preflight') {
      const vendor = await vendorStore.vendor(vendorId);
      if (!vendor || !canReadEntity(user, vendor.entityId || '')) return hidden(response);
      const followUpId = pathname.match(/\/follow-ups\/([^/]+)\/complete$/)?.[1];
      const ownerCompletion = user.role === 'OWNER' && followUpId && vendor.followUps.some(item => item.id === followUpId && item.owner.toLowerCase() === user.email);
      if (changing && !ownerCompletion && !canWriteEntity(user, vendor.entityId || '')) return denied(response);
    }

    if (changing && (pathname === '/api/contracts/smart-files' || pathname === '/api/contracts/smart-files/start' || pathname === '/api/contracts/drafts')) {
      const entityId = String(request.body?.contract?.primaryEntityId || request.body?.primaryEntityId || '');
      if (!canWriteEntity(user, entityId)) return denied(response);
      const covered = request.body?.contract?.coveredEntityIds || request.body?.coveredEntityIds || [];
      if (!Array.isArray(covered) || covered.some((id: unknown) => !canWriteEntity(user, String(id)))) return denied(response);
    }
    if (changing && pathname === '/api/vendors') {
      if (!canWriteEntity(user, String(request.body?.entityId || ''))) return denied(response);
    }
    if (changing && pathname === '/api/vendors-bulk') {
      const rows = Array.isArray(request.body?.vendors) ? request.body.vendors : [];
      if (!rows.length || rows.some((item: any) => !canWriteEntity(user, String(item.entityId || '')))) return denied(response);
    }
    next();
  } catch (error) { next(error); }
};
