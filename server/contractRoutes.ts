import type { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import type {
  Contract,
  ContractClause,
  ContractChangeProposal,
  ContractConfiguration,
  ContractDocument,
  ContractFileInput,
  ContractJob,
  ContractObligation,
  CorporateEntity,
  CreateContractInput,
  CreateCorporateEntityInput,
} from '../src/contractTypes.ts';
import {
  applyTemplateContext,
  applicableApprovalStages,
  buildContractDashboard,
  calculateNoticeDeadline,
  completeObligation,
  createObligationFromClause,
  deriveOwners,
  evaluateContractAgainstPlaybook,
  nextApprovalStage,
  refreshObligationStatus,
  releaseDependentObligations,
  resolveEntity,
  validateActivation,
  validateObligationDependency,
} from './contractEngine.ts';
import { contractStore } from './contractStore.ts';

const actor = 'Admin User';
const maxFileSize = 15 * 1024 * 1024;
const maxBatchFiles = 25;
const allowedMimeTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
]);
const terminalJobStages = ['COMPLETED', 'PARTIAL', 'FAILED'];
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const requiredString = (value: unknown, label: string) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};
const list = (value: unknown) => Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : String(value || '').split(',').map(item => item.trim()).filter(Boolean);
const audit = (type: string, summary: string) => ({ id: crypto.randomUUID(), type, actor, summary, createdAt: now() });
const sendError = (response: Response, error: unknown) => response.status(400).json({ error: error instanceof Error ? error.message : 'The request could not be completed.' });
const contractNumber = (count: number) => `CTR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'contract';
const changeDocumentTypes = new Set(['AMENDMENT', 'ADDENDUM', 'RENEWAL', 'SCHEDULE']);
const documentTypes = new Set(['SIGNED_CONTRACT', 'DRAFT', 'AMENDMENT', 'ADDENDUM', 'RENEWAL', 'SCHEDULE', 'SUPPORTING_DOCUMENT']);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));

const validateEntityParent = (entities: CorporateEntity[], entityId: string | undefined, parentId: string | undefined) => {
  if (!parentId) return;
  if (entityId === parentId) throw new Error('An entity cannot be its own parent.');
  let current = entities.find(entity => entity.id === parentId);
  if (!current) throw new Error('Select a valid parent entity.');
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id) || current.id === entityId) throw new Error('This parent selection would create a circular corporate structure.');
    visited.add(current.id);
    current = entities.find(entity => entity.id === current?.parentId);
  }
};

const emptyOwners = () => ({
  contractOwnerName: '', contractOwnerEmail: '', monitoringOwnerName: '', monitoringOwnerEmail: '',
  legalOwnerName: '', legalOwnerEmail: '', renewalOwnerName: '', renewalOwnerEmail: '',
});

const parseJsonResponse = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(source || '{}');
};

const createContractRecord = async (input: CreateContractInput, source: Contract['source']): Promise<Contract> => {
  const entities = await contractStore.entities();
  const primary = entities.find(entity => entity.id === input.primaryEntityId);
  if (input.primaryEntityId && !primary) throw new Error('Select a valid contracting entity.');
  const contracts = await contractStore.contracts();
  if (['STATEMENT_OF_WORK', 'AMENDMENT', 'RENEWAL'].includes(input.familyType || '') && !input.parentContractId) throw new Error('Select the parent contract for this family member.');
  if (input.parentContractId && !contracts.some(item => item.id === input.parentContractId)) throw new Error('Select a valid parent contract.');
  const timestamp = now();
  return {
    id: crypto.randomUUID(), contractNumber: contractNumber(contracts.length),
    title: requiredString(input.title, 'Contract title'), contractType: String(input.contractType || 'Other'), source,
    status: source === 'NEW_DRAFT' ? 'DRAFT' : 'UPLOADED', primaryEntityId: input.primaryEntityId || '',
    coveredEntityIds: input.coveredEntityIds?.length ? input.coveredEntityIds : input.primaryEntityId ? [input.primaryEntityId] : [],
    businessUnit: String(input.businessUnit || ''), principalActivity: String(input.principalActivity || ''), siteOrProject: String(input.siteOrProject || ''),
    counterpartyName: String(input.counterpartyName || ''), counterpartyRegistrationNumber: String(input.counterpartyRegistrationNumber || ''), vendorId: input.vendorId,
    purpose: String(input.purpose || ''), value: Number(input.value || 0), currency: String(input.currency || 'MYR'),
    effectiveDate: input.effectiveDate, expiryDate: input.expiryDate, noticePeriodDays: Number(input.noticePeriodDays || 0) || undefined,
    noticeDeadline: calculateNoticeDeadline(input.expiryDate, input.noticePeriodDays), autoRenewal: Boolean(input.autoRenewal),
    owners: primary ? deriveOwners(entities, primary.id, input.principalActivity) : emptyOwners(),
    documents: [], clauses: [], obligations: [], approvals: [], draftContent: '', draftVersions: [], templateId: input.templateId,
    parentContractId: input.parentContractId, familyType: input.familyType || 'STANDALONE', activationGaps: [],
    reviewIssues: [], auditTrail: [audit(source === 'NEW_DRAFT' ? 'CONTRACT_REQUEST_CREATED' : 'SMART_FILE_CREATED', source === 'NEW_DRAFT' ? 'New contract request opened.' : 'Signed contract intake opened.')],
    createdAt: timestamp, updatedAt: timestamp,
  };
};

interface ExtractedContract {
  documentType?: ContractDocument['documentType'];
  documentTypeConfidence?: number;
  summary?: string;
  warnings?: string[];
  title?: string;
  contractType?: string;
  contractNumber?: string;
  ourPartyName?: string;
  ourPartyRegistrationNumber?: string;
  counterpartyName?: string;
  counterpartyRegistrationNumber?: string;
  purpose?: string;
  effectiveDate?: string;
  expiryDate?: string;
  noticePeriodDays?: number;
  autoRenewal?: boolean;
  value?: number;
  currency?: string;
  clauses?: Array<{
    clauseNumber?: string; heading?: string; clauseType?: string; sourceText?: string; sourceReference?: string;
    risk?: string; deviation?: string; responsibleParty?: string; confidence?: number; material?: boolean;
    obligation?: { title?: string; action?: string; dueDate?: string; recurrence?: string; evidenceRequired?: string; blocking?: boolean; dependsOnClauseNumber?: string; triggerOffsetDays?: number; actionKind?: ContractObligation['actionKind'] };
  }>;
}

const extractContractWithAI = async (contract: Contract, document: ContractDocument): Promise<ExtractedContract | undefined> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;
  try {
    const file = await fs.readFile(contractStore.absoluteUploadPath(document.storagePath));
    const wordText = document.mimeType === 'application/msword'
      ? await new WordExtractor().extract(file).then(extracted => [
        extracted.getBody(), extracted.getFootnotes(), extracted.getEndnotes(),
        extracted.getHeaders(), extracted.getFooters(), extracted.getTextboxes(),
      ].filter(Boolean).join('\n\n').trim())
      : document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? (await mammoth.extractRawText({ buffer: file })).value.trim()
        : undefined;
    if (wordText !== undefined && (!wordText || wordText.length > 500_000)) return undefined;
    const configuration = await contractStore.configuration();
    const entities = await contractStore.entities();
    const context = entities.map(entity => `${entity.legalName} | registration ${entity.registrationNumber} | aliases ${entity.aliases.join(', ')} | activities ${entity.principalActivities.join(', ')}`).join('\n');
    const playbook = configuration.playbookRules.filter(rule => rule.active).map(rule => `${rule.clauseType} (${rule.risk}): ${rule.preferredPosition}; flag: ${rule.redFlagTerms.join(', ') || 'material deviation'}`).join('\n');
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a contract-intelligence analyst. Read the complete ${document.documentType.toLowerCase()} and return JSON only. Do not invent missing facts. Dates must be YYYY-MM-DD. Preserve concise exact clause language and a page/clause citation. ${changeDocumentTypes.has(document.documentType) ? 'This is a proposed change to an existing contract. Extract only terms that this document changes or adds. Never assume it supersedes the whole contract.' : ''}
Known group entities:\n${context}
Contract review playbook:\n${playbook}
Return this shape:
{"documentType":"SIGNED_CONTRACT|DRAFT|AMENDMENT|ADDENDUM|RENEWAL|SCHEDULE|SUPPORTING_DOCUMENT","documentTypeConfidence":0.0,"summary":"concise change or contract summary","warnings":["ambiguities or missing documents"],"title":"","contractType":"one of ${configuration.contractTypes.join(', ')}","contractNumber":"","ourPartyName":"","ourPartyRegistrationNumber":"","counterpartyName":"","counterpartyRegistrationNumber":"","purpose":"","effectiveDate":"","expiryDate":"","noticePeriodDays":0,"autoRenewal":false,"value":0,"currency":"MYR","clauses":[{"clauseNumber":"","heading":"","clauseType":"one of ${configuration.clauseTypes.join(', ')}","sourceText":"","sourceReference":"page and clause","risk":"LOW|MEDIUM|HIGH|CRITICAL","deviation":"why non-standard or blank","responsibleParty":"OUR_COMPANY|COUNTERPARTY|BOTH","confidence":0.0,"material":true,"obligation":{"title":"","action":"specific action to monitor","dueDate":"YYYY-MM-DD or blank","recurrence":"ONCE|MONTHLY|QUARTERLY|ANNUALLY|ON_EVENT","evidenceRequired":"","blocking":true,"dependsOnClauseNumber":"earlier clause number, only if explicit dependency","triggerOffsetDays":0,"actionKind":"STANDARD|UPLOAD_ADDENDUM|UPLOAD_RENEWAL"}}]}
Extract operative obligations, payment dates, deliverables, renewals, notice periods, termination rights, licences, insurance, reporting, service levels, audit rights and regulatory commitments. Separate each monitorable action. Capture explicit predecessor/successor obligations and completion-triggered deadlines. If an addendum or renewal must be signed or uploaded, make that a distinct obligation. Put uncertainty in warnings; do not invent dependencies.`;
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: wordText === undefined
        ? [{ text: prompt }, { inlineData: { mimeType: document.mimeType, data: file.toString('base64') } }]
        : [{ text: `${prompt}\nThis Word document was converted to plain text. Cite clause headings and the file name when page numbers are unavailable.\n\nDocument: ${document.fileName}\n${wordText}` }] }],
      config: { responseMimeType: 'application/json' },
    });
    return parseJsonResponse(response.text || '{}') as ExtractedContract;
  } catch (error: any) {
    console.warn('Contract extraction needs review:', error?.message || error);
    return undefined;
  }
};

const updateJob = async (job: ContractJob, stage: ContractJob['stage'], progress: number, message: string) => {
  const updated = { ...job, stage, progress, message, updatedAt: now() };
  await contractStore.saveJob(updated);
  return updated;
};

const changeProposal = (extraction: ExtractedContract, document: ContractDocument): ContractChangeProposal => ({
  summary: String(extraction.summary || `Review changes proposed by ${document.fileName}`),
  title: extraction.title || undefined,
  effectiveDate: extraction.effectiveDate || document.effectiveDate || undefined,
  expiryDate: extraction.expiryDate || undefined,
  noticePeriodDays: Number(extraction.noticePeriodDays || 0) || undefined,
  autoRenewal: extraction.autoRenewal,
  value: Number(extraction.value || 0) || undefined,
  currency: extraction.currency || undefined,
  warnings: Array.isArray(extraction.warnings) ? extraction.warnings.map(String) : [],
  clauses: (extraction.clauses || []).filter(item => item.sourceText || item.heading).map(item => ({
    clauseNumber: String(item.clauseNumber || ''), heading: String(item.heading || 'Changed term'),
    clauseType: String(item.clauseType || 'Other'), sourceText: String(item.sourceText || ''),
    sourceReference: String(item.sourceReference || document.fileName),
    risk: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(item.risk)) ? item.risk as ContractClause['risk'] : 'MEDIUM',
    responsibleParty: ['OUR_COMPANY', 'COUNTERPARTY', 'BOTH'].includes(String(item.responsibleParty)) ? item.responsibleParty as ContractClause['responsibleParty'] : 'BOTH',
    material: item.material !== false,
    obligation: item.obligation ? {
      title: item.obligation.title, action: item.obligation.action, dueDate: item.obligation.dueDate || undefined,
      recurrence: ['ONCE', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ON_EVENT'].includes(String(item.obligation.recurrence)) ? item.obligation.recurrence as ContractObligation['recurrence'] : 'ON_EVENT',
      evidenceRequired: item.obligation.evidenceRequired, blocking: item.obligation.blocking,
      triggerOffsetDays: item.obligation.triggerOffsetDays,
      dependsOnClauseNumber: item.obligation.dependsOnClauseNumber,
      actionKind: ['STANDARD', 'UPLOAD_ADDENDUM', 'UPLOAD_RENEWAL'].includes(String(item.obligation.actionKind)) ? item.obligation.actionKind : 'STANDARD',
    } : undefined,
  })),
});

const mergeExtraction = async (contract: Contract, extraction: ExtractedContract, document: ContractDocument) => {
  const entities = await contractStore.entities();
  contract.title = extraction.title || contract.title;
  contract.contractType = extraction.contractType || contract.contractType;
  contract.contractNumber = extraction.contractNumber || contract.contractNumber;
  contract.counterpartyName = extraction.counterpartyName || contract.counterpartyName;
  contract.counterpartyRegistrationNumber = extraction.counterpartyRegistrationNumber || contract.counterpartyRegistrationNumber;
  contract.purpose = extraction.purpose || contract.purpose;
  contract.effectiveDate = extraction.effectiveDate || contract.effectiveDate;
  contract.expiryDate = extraction.expiryDate || contract.expiryDate;
  contract.noticePeriodDays = Number(extraction.noticePeriodDays || contract.noticePeriodDays || 0) || undefined;
  contract.noticeDeadline = calculateNoticeDeadline(contract.expiryDate, contract.noticePeriodDays);
  contract.autoRenewal = extraction.autoRenewal ?? contract.autoRenewal;
  contract.value = Number(extraction.value || contract.value || 0);
  contract.currency = extraction.currency || contract.currency;

  const resolution = resolveEntity(entities, { legalName: extraction.ourPartyName, registrationNumber: extraction.ourPartyRegistrationNumber });
  if (!contract.primaryEntityId && resolution && resolution.confidence >= 0.9) {
    contract.primaryEntityId = resolution.entityId;
    contract.coveredEntityIds = [resolution.entityId];
    contract.owners = deriveOwners(entities, resolution.entityId, contract.principalActivity);
    contract.auditTrail.unshift(audit('ENTITY_AI_MATCHED', `${resolution.reason} Confidence ${Math.round(resolution.confidence * 100)}%.`));
  }

  for (const item of extraction.clauses || []) {
    if (!item.sourceText && !item.heading) continue;
    const clause: ContractClause = {
      id: crypto.randomUUID(), sourceDocumentId: document.id, clauseNumber: String(item.clauseNumber || ''), heading: String(item.heading || item.clauseType || 'Extracted clause'),
      clauseType: String(item.clauseType || 'Other'), sourceText: String(item.sourceText || ''), sourceReference: String(item.sourceReference || 'Document'),
      risk: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(item.risk)) ? item.risk as ContractClause['risk'] : 'MEDIUM',
      deviation: String(item.deviation || ''), applicableEntityIds: contract.primaryEntityId ? [contract.primaryEntityId] : [],
      responsibleParty: ['OUR_COMPANY', 'COUNTERPARTY', 'BOTH'].includes(String(item.responsibleParty)) ? item.responsibleParty as ContractClause['responsibleParty'] : 'BOTH',
      confidence: Math.max(0, Math.min(1, Number(item.confidence || 0))), reviewStatus: 'AI_EXTRACTED', material: item.material !== false,
    };
    const duplicate = contract.clauses.some(existing => normalize(`${existing.clauseNumber}${existing.sourceText}`) === normalize(`${clause.clauseNumber}${clause.sourceText}`));
    if (duplicate) continue;
    contract.clauses.push(clause);
    if (item.obligation) {
      contract.obligations.push(createObligationFromClause(clause, contract, entities, {
        title: item.obligation.title, action: item.obligation.action, dueDate: item.obligation.dueDate || undefined,
        nextDueDate: item.obligation.recurrence && !['ONCE', 'ON_EVENT'].includes(item.obligation.recurrence) ? item.obligation.dueDate || undefined : undefined,
        recurrence: ['ONCE', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ON_EVENT'].includes(String(item.obligation.recurrence)) ? item.obligation.recurrence as ContractObligation['recurrence'] : 'ON_EVENT',
        evidenceRequired: item.obligation.evidenceRequired, blocking: item.obligation.blocking,
        actionKind: ['STANDARD', 'UPLOAD_ADDENDUM', 'UPLOAD_RENEWAL'].includes(String(item.obligation.actionKind)) ? item.obligation.actionKind : 'STANDARD',
      }));
    }
  }
  for (const item of extraction.clauses || []) {
    const dependencyNumber = item.obligation?.dependsOnClauseNumber;
    if (!dependencyNumber) continue;
    const successorClause = contract.clauses.find(clause => clause.sourceDocumentId === document.id && clause.clauseNumber === item.clauseNumber);
    const predecessorClause = contract.clauses.find(clause => clause.clauseNumber === dependencyNumber);
    const successor = contract.obligations.find(obligation => obligation.clauseId === successorClause?.id);
    const predecessor = contract.obligations.find(obligation => obligation.clauseId === predecessorClause?.id);
    if (!successor || !predecessor) continue;
    validateObligationDependency(contract.obligations, successor.id, predecessor.id);
    successor.predecessorId = predecessor.id;
    successor.trigger = 'ON_PREDECESSOR_COMPLETION';
    successor.triggerOffsetDays = Math.max(0, Number(item.obligation?.triggerOffsetDays || 0));
    successor.status = predecessor.status === 'COMPLETED' ? 'OPEN' : 'WAITING';
  }
};

const processContractJob = async (jobId: string) => {
  let job = await contractStore.job(jobId);
  if (!job) return;
  try {
    let contract = await contractStore.contract(job.contractId);
    if (!contract) throw new Error('Contract not found.');
    const configuration = await contractStore.configuration();
    job = await updateJob(job, 'CLASSIFYING', 10, 'Classifying the uploaded contract bundle.');
    const priorStatus = contract.status;
    if (!['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status)) contract.status = 'PROCESSING';
    await contractStore.saveContract(contract);

    job = await updateJob(job, 'ENTITY_RESOLUTION', 25, 'Resolving the contracting entity against the corporate structure.');
    const documents = contract.documents.filter(document => job!.documentIds.includes(document.id));
    let extractedCount = 0;
    job = await updateJob(job, 'EXTRACTING_CLAUSES', 40, 'Reading clauses, dates, commercial terms and commitments.');
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];
      const extraction = await extractContractWithAI(contract, document);
      if (extraction) {
        if (extraction.documentType && documentTypes.has(extraction.documentType)) {
          document.suggestedDocumentType = extraction.documentType;
          document.classificationConfidence = Math.max(0, Math.min(1, Number(extraction.documentTypeConfidence || 0)));
        }
        const conflictingClassification = document.suggestedDocumentType && document.suggestedDocumentType !== document.documentType && (document.classificationConfidence || 0) >= 0.8 && !document.classificationConfirmed;
        if (conflictingClassification) {
          document.extractionStatus = 'REVIEW_REQUIRED';
        } else if (changeDocumentTypes.has(document.documentType)) {
          document.proposedChanges = changeProposal(extraction, document);
          document.changeReviewStatus = 'PENDING';
        } else if (document.documentType === 'SIGNED_CONTRACT' || document.documentType === 'DRAFT') {
          await mergeExtraction(contract, extraction, document);
        }
        if (!conflictingClassification) { extractedCount += 1; document.extractionStatus = 'COMPLETED'; }
      } else {
        document.extractionStatus = 'REVIEW_REQUIRED';
      }
      job = await updateJob(job, 'EXTRACTING_CLAUSES', 40 + Math.round(((index + 1) / documents.length) * 35), `Processed ${index + 1} of ${documents.length} document(s).`);
    }

    job = await updateJob(job, 'GENERATING_OBLIGATIONS', 82, 'Assigning clauses and obligations to entities and monitoring owners.');
    contract.obligations = contract.obligations.map(obligation => refreshObligationStatus(obligation));
    contract.reviewIssues = evaluateContractAgainstPlaybook(contract, configuration);
    contract.activationGaps = validateActivation(contract);
    if (['ACTIVE', 'RENEWAL_REVIEW'].includes(priorStatus)) contract.status = contract.documents.some(document => document.documentType === 'RENEWAL' && document.changeReviewStatus === 'PENDING') ? 'RENEWAL_REVIEW' : 'ACTIVE';
    else if (!contract.primaryEntityId) contract.status = 'ENTITY_REVIEW';
    else if (contract.clauses.some(clause => clause.reviewStatus !== 'CONFIRMED')) contract.status = 'CLAUSE_REVIEW';
    else if (contract.obligations.some(obligation => !obligation.ownerEmail || !obligation.monitoringOwnerEmail)) contract.status = 'OWNER_ASSIGNMENT';
    else contract.status = 'READY_TO_ACTIVATE';
    contract.auditTrail.unshift(audit('CONTRACT_INTELLIGENCE_PROCESSED', extractedCount
      ? `${contract.clauses.length} clauses and ${contract.obligations.length} obligations extracted for human review.`
      : 'The original files were preserved, but automated extraction was unavailable; human review is required.'));
    contract.updatedAt = now();
    await contractStore.saveContract(contract);
    const finalStage = extractedCount === documents.length ? 'COMPLETED' : 'PARTIAL';
    await updateJob(job, finalStage, 100, finalStage === 'COMPLETED' ? 'Contract intelligence is ready for review.' : 'Files are preserved; one or more documents require manual review.');
  } catch (error: any) {
    await contractStore.saveJob({ ...job, stage: 'FAILED', progress: 100, message: 'Contract processing failed.', error: error?.message || 'Unknown error', updatedAt: now() });
    const contract = await contractStore.contract(job.contractId);
    if (contract) {
      if (!['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status)) contract.status = 'ENTITY_REVIEW';
      contract.activationGaps = ['Background processing failed. Review the source file and captured metadata.'];
      contract.auditTrail.unshift(audit('CONTRACT_PROCESSING_FAILED', error?.message || 'Unknown error')); contract.updatedAt = now();
      await contractStore.saveContract(contract);
    }
  }
};

const startJob = async (contractId: string, documentIds: string[]) => {
  const job: ContractJob = { id: crypto.randomUUID(), contractId, documentIds, stage: 'QUEUED', progress: 0, message: 'Contract intelligence job queued.', createdAt: now(), updatedAt: now() };
  await contractStore.saveJob(job);
  setTimeout(() => void processContractJob(job.id), 50);
  return job;
};

const addDocuments = async (contract: Contract, inputs: ContractFileInput[]) => {
  if (!inputs.length || inputs.length > maxBatchFiles) throw new Error(`Upload between 1 and ${maxBatchFiles} files.`);
  const ids: string[] = [];
  for (const input of inputs) {
    const documentType = input.documentType || 'SIGNED_CONTRACT';
    if (!documentTypes.has(documentType)) throw new Error(`${input.fileName}: select a valid document type.`);
    if (input.relatedDocumentId && !contract.documents.some(document => document.id === input.relatedDocumentId)) throw new Error(`${input.fileName}: the related document must belong to this contract.`);
    if (input.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) throw new Error(`${input.fileName}: use YYYY-MM-DD for the effective date.`);
    const data = Buffer.from(input.data || '', 'base64');
    if (!data.length || data.length > maxFileSize) throw new Error(`${input.fileName}: file must be between 1 byte and 15 MB.`);
    if (!allowedMimeTypes.has(input.mimeType)) throw new Error(`${input.fileName}: unsupported file type.`);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (contract.documents.some(document => document.sha256 === sha256)) continue;
    const id = crypto.randomUUID();
    const storagePath = await contractStore.saveUpload(contract.id, id, input.fileName, data);
    contract.documents.push({
      id, fileName: input.fileName, mimeType: input.mimeType, size: data.length, sha256,
      version: contract.documents.length + 1, documentType,
      relatedDocumentId: input.relatedDocumentId || (changeDocumentTypes.has(documentType) ? contract.documents.find(document => document.documentType === 'SIGNED_CONTRACT' && document.authoritative)?.id : undefined),
      effectiveDate: input.effectiveDate || undefined,
      changeReviewStatus: changeDocumentTypes.has(documentType) ? 'PENDING' : 'NOT_APPLICABLE',
      authoritative: changeDocumentTypes.has(documentType) ? false : input.authoritative ?? documentType === 'SIGNED_CONTRACT',
      signed: input.signed ?? documentType === 'SIGNED_CONTRACT', uploadedAt: now(), extractionStatus: 'QUEUED', storagePath,
    });
    ids.push(id);
  }
  if (!ids.length) throw new Error('Every selected file is already attached to this contract.');
  if (contract.status === 'ACTIVE' && contract.documents.some(document => ids.includes(document.id) && document.documentType === 'RENEWAL')) contract.status = 'RENEWAL_REVIEW';
  contract.activationGaps = validateActivation(contract);
  contract.auditTrail.unshift(audit('DOCUMENTS_UPLOADED', `${ids.length} document(s) preserved and queued for contract intelligence.`));
  contract.updatedAt = now();
  await contractStore.saveContract(contract);
  return ids;
};

export const registerContractRoutes = async (app: Express) => {
  await contractStore.init();

  app.get('/api/corporate-entities', async (_request, response) => response.json(await contractStore.entities()));
  app.post('/api/corporate-entities', async (request, response) => {
    try {
      const input = request.body as CreateCorporateEntityInput;
      const entities = await contractStore.entities();
      validateEntityParent(entities, undefined, input.parentId);
      const registrationNumber = requiredString(input.registrationNumber, 'Registration number');
      if (entities.some(entity => normalize(entity.registrationNumber) === normalize(registrationNumber))) throw new Error('An entity with this registration number already exists.');
      const timestamp = now();
      const entity: CorporateEntity = {
        id: crypto.randomUUID(), parentId: input.parentId || undefined, legalName: requiredString(input.legalName, 'Legal name'),
        displayName: String(input.displayName || input.legalName).trim(), entityType: input.entityType || 'SUBSIDIARY', registrationNumber,
        jurisdiction: String(input.jurisdiction || 'Malaysia'), registeredAddress: String(input.registeredAddress || ''), aliases: list(input.aliases),
        principalActivities: list(input.principalActivities), businessUnits: list(input.businessUnits), sites: list(input.sites),
        effectiveFrom: String(input.effectiveFrom || today()), active: true,
        roleAssignments: (input.roleAssignments || []).filter(item => item.name && item.role).map(item => ({ ...item, id: crypto.randomUUID(), email: String(item.email || '') })),
        createdAt: timestamp, updatedAt: timestamp,
      };
      response.status(201).json(await contractStore.saveEntity(entity));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/corporate-entities/:id', async (request, response) => {
    try {
      const entity = await contractStore.entity(request.params.id);
      if (!entity) return response.status(404).json({ error: 'Entity not found.' });
      const entities = await contractStore.entities();
      const nextParentId = request.body.parentId !== undefined ? String(request.body.parentId || '') || undefined : entity.parentId;
      validateEntityParent(entities, entity.id, nextParentId);
      const nextRegistration = request.body.registrationNumber !== undefined ? requiredString(request.body.registrationNumber, 'Registration number') : entity.registrationNumber;
      if (entities.some(item => item.id !== entity.id && normalize(item.registrationNumber) === normalize(nextRegistration))) throw new Error('Another entity already uses this registration number.');
      const editable = ['legalName', 'displayName', 'parentId', 'entityType', 'registrationNumber', 'jurisdiction', 'registeredAddress', 'effectiveFrom', 'effectiveTo', 'active'] as const;
      for (const key of editable) if (request.body[key] !== undefined) (entity as any)[key] = request.body[key];
      for (const key of ['aliases', 'principalActivities', 'businessUnits', 'sites'] as const) if (request.body[key] !== undefined) entity[key] = list(request.body[key]);
      if (Array.isArray(request.body.roleAssignments)) entity.roleAssignments = request.body.roleAssignments.map((item: any) => ({ ...item, id: item.id || crypto.randomUUID() }));
      entity.updatedAt = now();
      response.json(await contractStore.saveEntity(entity));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/contract-config', async (_request, response) => response.json(await contractStore.configuration()));
  app.post('/api/contract-config/templates', async (request, response) => {
    try {
      const configuration = await contractStore.configuration();
      const name = requiredString(request.body.name, 'Template name');
      if (configuration.templates.some(item => normalize(item.name) === normalize(name))) throw new Error('A template with this name already exists.');
      const template = {
        id: crypto.randomUUID(), name, contractType: requiredString(request.body.contractType, 'Contract type'),
        description: String(request.body.description || ''), content: requiredString(request.body.content, 'Template content'),
        requiredClauseTypes: list(request.body.requiredClauseTypes), approved: Boolean(request.body.approved), version: 1, updatedAt: now(),
      };
      configuration.templates.push(template); response.status(201).json(await contractStore.saveConfiguration(configuration));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/contract-config/templates/:templateId', async (request, response) => {
    try {
      const configuration = await contractStore.configuration();
      const template = configuration.templates.find(item => item.id === request.params.templateId);
      if (!template) return response.status(404).json({ error: 'Template not found.' });
      const contentChanged = request.body.content !== undefined && String(request.body.content) !== template.content;
      for (const key of ['name', 'contractType', 'description', 'content', 'approved'] as const) if (request.body[key] !== undefined) (template as any)[key] = request.body[key];
      if (request.body.requiredClauseTypes !== undefined) template.requiredClauseTypes = list(request.body.requiredClauseTypes);
      if (!String(template.name).trim() || !String(template.content).trim()) throw new Error('Template name and content are required.');
      if (contentChanged) template.version += 1;
      template.updatedAt = now(); response.json(await contractStore.saveConfiguration(configuration));
    } catch (error) { sendError(response, error); }
  });
  app.post('/api/contract-config/playbook-rules', async (request, response) => {
    try {
      const configuration = await contractStore.configuration();
      const rule = {
        id: crypto.randomUUID(), name: requiredString(request.body.name, 'Rule name'), clauseType: requiredString(request.body.clauseType, 'Clause type'),
        applicableContractTypes: list(request.body.applicableContractTypes), entityIds: list(request.body.entityIds), principalActivities: list(request.body.principalActivities),
        required: Boolean(request.body.required), preferredPosition: requiredString(request.body.preferredPosition, 'Preferred position'), redFlagTerms: list(request.body.redFlagTerms),
        risk: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(request.body.risk)) ? request.body.risk : 'HIGH', ownerRole: String(request.body.ownerRole || 'Legal'),
        active: request.body.active !== false, createdAt: now(), updatedAt: now(),
      } as ContractConfiguration['playbookRules'][number];
      configuration.playbookRules.push(rule); configuration.playbookVersion += 1;
      await contractStore.saveConfiguration(configuration);
      const affectedContracts: string[] = [];
      for (const contract of await contractStore.contracts()) {
        const before = (contract.reviewIssues || []).filter(issue => issue.status === 'OPEN').length;
        contract.reviewIssues = evaluateContractAgainstPlaybook(contract, configuration);
        contract.activationGaps = validateActivation(contract);
        const after = contract.reviewIssues.filter(issue => issue.status === 'OPEN').length;
        if (after > before) {
          affectedContracts.push(contract.id);
          contract.auditTrail.unshift(audit('PLAYBOOK_IMPACT_IDENTIFIED', `Playbook v${configuration.playbookVersion} introduced ${after - before} review issue(s); existing approval was not silently revoked.`));
          contract.updatedAt = now(); await contractStore.saveContract(contract);
        }
      }
      response.status(201).json({ configuration, affectedContracts });
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/contract-config/playbook-rules/:ruleId', async (request, response) => {
    try {
      const configuration = await contractStore.configuration();
      const rule = configuration.playbookRules.find(item => item.id === request.params.ruleId);
      if (!rule) return response.status(404).json({ error: 'Playbook rule not found.' });
      const fields = ['name', 'clauseType', 'applicableContractTypes', 'entityIds', 'principalActivities', 'required', 'preferredPosition', 'redFlagTerms', 'risk', 'ownerRole', 'active'] as const;
      for (const key of fields) if (request.body[key] !== undefined) (rule as any)[key] = ['applicableContractTypes', 'entityIds', 'principalActivities', 'redFlagTerms'].includes(key) ? list(request.body[key]) : request.body[key];
      rule.updatedAt = now(); configuration.playbookVersion += 1; await contractStore.saveConfiguration(configuration);
      response.json(configuration);
    } catch (error) { sendError(response, error); }
  });
  app.get('/api/contracts', async (_request, response) => response.json(await contractStore.contracts()));
  app.get('/api/contracts/:id', async (request, response) => {
    const contract = await contractStore.contract(request.params.id);
    if (!contract) return response.status(404).json({ error: 'Contract not found.' });
    response.json(contract);
  });
  app.get('/api/contract-jobs/:id', async (request, response) => {
    const job = await contractStore.job(request.params.id);
    if (!job) return response.status(404).json({ error: 'Contract job not found.' });
    response.json(job);
  });

  app.post('/api/contracts/smart-files', async (request: Request, response) => {
    try {
      const input = request.body.contract as CreateContractInput;
      const files = Array.isArray(request.body.files) ? request.body.files as ContractFileInput[] : [];
      const contract = await createContractRecord({ ...input, title: input?.title || files[0]?.fileName || 'Uploaded contract' }, 'SIGNED_UPLOAD');
      await contractStore.saveContract(contract);
      const documentIds = await addDocuments(contract, files);
      const job = await startJob(contract.id, documentIds);
      response.status(202).json({ contract: await contractStore.contract(contract.id), job });
    } catch (error) { sendError(response, error); }
  });

  // Stage each file separately so a 25-file batch never exceeds the JSON request limit.
  app.post('/api/contracts/smart-files/start', async (request: Request, response) => {
    try {
      const file = request.body?.file as ContractFileInput;
      if (!file) throw new Error('Choose a signed contract file.');
      const input = request.body.contract as CreateContractInput;
      const contract = await createContractRecord({ ...input, title: input?.title || file.fileName || 'Uploaded contract' }, 'SIGNED_UPLOAD');
      const [documentId] = await addDocuments(contract, [file]);
      response.status(201).json({ contract: await contractStore.contract(contract.id), documentId });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/documents/stage', async (request: Request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if ((await contractStore.jobs()).some(job => job.contractId === contract.id && !terminalJobStages.includes(job.stage))) return response.status(409).json({ error: 'Wait for the current contract-intelligence job before uploading more files.' });
      if (contract.documents.filter(document => document.extractionStatus === 'QUEUED').length >= maxBatchFiles) throw new Error(`Process the current ${maxBatchFiles} files before staging more.`);
      const file = request.body?.file as ContractFileInput;
      if (!file) throw new Error('Choose a contract file.');
      const [documentId] = await addDocuments(contract, [file]);
      response.status(201).json({ documentId });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/documents/process', async (request: Request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if ((await contractStore.jobs()).some(job => job.contractId === contract.id && !terminalJobStages.includes(job.stage))) return response.status(409).json({ error: 'Contract intelligence is already running.' });
      const documentIds: string[] = Array.isArray(request.body?.documentIds) ? request.body.documentIds : [];
      if (!documentIds.length || documentIds.length > maxBatchFiles || new Set(documentIds).size !== documentIds.length) throw new Error(`Select between 1 and ${maxBatchFiles} distinct uploaded files.`);
      if (documentIds.some(id => !contract.documents.some(document => document.id === id && document.extractionStatus === 'QUEUED'))) throw new Error('Each selected file must be staged on this contract and awaiting analysis.');
      response.status(202).json(await startJob(contract.id, documentIds));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/documents', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if ((await contractStore.jobs()).some(job => job.contractId === contract.id && !terminalJobStages.includes(job.stage))) return response.status(409).json({ error: 'Wait for the current contract-intelligence job before uploading more files.' });
      const documentIds = await addDocuments(contract, Array.isArray(request.body.files) ? request.body.files : []);
      response.status(202).json(await startJob(contract.id, documentIds));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/reprocess', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (!contract.documents.length) throw new Error('Upload a contract document before running intelligence.');
      const activeJobs = (await contractStore.jobs()).filter(job => job.contractId === contract.id && !terminalJobStages.includes(job.stage));
      if (activeJobs.length) return response.status(409).json({ error: 'Contract intelligence is already running.' });
      const documentIds = contract.documents.filter(document => document.changeReviewStatus === 'PENDING' || document.extractionStatus === 'REVIEW_REQUIRED' || (document.extractionStatus !== 'COMPLETED' && document.changeReviewStatus !== 'ACCEPTED')).map(document => document.id);
      if (!documentIds.length) throw new Error('No pending or review-required documents need reprocessing. Accepted amendments and renewals are preserved.');
      contract.documents = contract.documents.map(document => documentIds.includes(document.id) ? { ...document, extractionStatus: 'QUEUED' } : document);
      if (!['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status)) contract.status = 'PROCESSING';
      contract.auditTrail.unshift(audit('CONTRACT_REPROCESS_QUEUED', 'Pending contract documents were queued again.')); contract.updatedAt = now();
      await contractStore.saveContract(contract);
      response.status(202).json(await startJob(contract.id, documentIds));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/contracts/:id/documents/:documentId/download', async (request, response) => {
    const contract = await contractStore.contract(request.params.id);
    const document = contract?.documents.find(item => item.id === request.params.documentId);
    if (!contract || !document || document.storagePath.startsWith('seed/')) return response.status(404).json({ error: 'Document file is not available.' });
    response.download(contractStore.absoluteUploadPath(document.storagePath), document.fileName);
  });

  app.patch('/api/contracts/:id/documents/:documentId', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const document = contract.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      if (request.body.documentType !== undefined) {
        if (!documentTypes.has(String(request.body.documentType))) throw new Error('Select a valid document type.');
        if (document.changeReviewStatus === 'ACCEPTED') throw new Error('An accepted lifecycle document cannot be reclassified. Upload a corrective version instead.');
        document.documentType = request.body.documentType;
        document.changeReviewStatus = changeDocumentTypes.has(document.documentType) ? 'PENDING' : 'NOT_APPLICABLE';
        document.classificationConfirmed = true;
      }
      if (request.body.classificationConfirmed !== undefined) document.classificationConfirmed = Boolean(request.body.classificationConfirmed);
      if (request.body.relatedDocumentId !== undefined) {
        if (request.body.relatedDocumentId && !contract.documents.some(item => item.id === request.body.relatedDocumentId && item.id !== document.id)) throw new Error('Select a related document in this contract.');
        document.relatedDocumentId = request.body.relatedDocumentId || undefined;
      }
      if (request.body.effectiveDate !== undefined) document.effectiveDate = String(request.body.effectiveDate || '') || undefined;
      if (request.body.signed !== undefined) document.signed = Boolean(request.body.signed);
      if (request.body.authoritative !== undefined) {
        if (changeDocumentTypes.has(document.documentType) && document.changeReviewStatus !== 'ACCEPTED' && request.body.authoritative) throw new Error('Review the proposed change before making it authoritative.');
        document.authoritative = Boolean(request.body.authoritative);
        if (document.authoritative && !changeDocumentTypes.has(document.documentType)) contract.documents.forEach(item => { if (item.id !== document.id && !changeDocumentTypes.has(item.documentType)) item.authoritative = false; });
      }
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('DOCUMENT_CLASSIFICATION_REVIEWED', `${document.fileName} classified as ${document.documentType}${document.authoritative ? ' and marked authoritative' : ''}.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/documents/:documentId/change-review', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const document = contract.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      if (!changeDocumentTypes.has(document.documentType) || document.changeReviewStatus !== 'PENDING') throw new Error('This document has no pending lifecycle change to review.');
      if (['QUEUED', 'EXTRACTING'].includes(document.extractionStatus)) throw new Error('Wait for background document analysis before making a lifecycle decision.');
      const decision = String(request.body.decision || '');
      const rationale = requiredString(request.body.rationale, 'Review rationale');
      if (!['ACCEPTED', 'REJECTED'].includes(decision)) throw new Error('Select an accept or reject decision.');
      if (decision === 'ACCEPTED') {
        if (!document.signed) throw new Error('Confirm the lifecycle document is signed before accepting it.');
        const proposal = document.proposedChanges;
        if (proposal) {
          if (proposal.expiryDate) contract.expiryDate = proposal.expiryDate;
          if (proposal.effectiveDate) contract.effectiveDate = proposal.effectiveDate;
          if (proposal.noticePeriodDays !== undefined) contract.noticePeriodDays = proposal.noticePeriodDays;
          if (proposal.autoRenewal !== undefined) contract.autoRenewal = proposal.autoRenewal;
          if (proposal.value !== undefined) contract.value = proposal.value;
          if (proposal.currency) contract.currency = proposal.currency;
          contract.noticeDeadline = calculateNoticeDeadline(contract.expiryDate, contract.noticePeriodDays);
          const entities = await contractStore.entities();
          for (const item of proposal.clauses) {
            const clause: ContractClause = {
              ...item, id: crypto.randomUUID(), sourceDocumentId: document.id, deviation: '',
              applicableEntityIds: contract.primaryEntityId ? [contract.primaryEntityId] : [], confidence: 1,
              reviewStatus: 'AI_EXTRACTED',
            };
            delete (clause as ContractClause & { obligation?: unknown }).obligation;
            contract.clauses.push(clause);
            if (item.obligation) contract.obligations.push(createObligationFromClause(clause, contract, entities, { ...item.obligation, status: 'DRAFT' }));
          }
          for (const item of proposal.clauses) {
            const predecessorNumber = item.obligation?.dependsOnClauseNumber;
            if (!predecessorNumber) continue;
            const successorClause = contract.clauses.find(clause => clause.sourceDocumentId === document.id && clause.clauseNumber === item.clauseNumber);
            const predecessorClause = contract.clauses.find(clause => clause.clauseNumber === predecessorNumber);
            const successor = contract.obligations.find(obligation => obligation.clauseId === successorClause?.id);
            const predecessor = contract.obligations.find(obligation => obligation.clauseId === predecessorClause?.id);
            if (!successor || !predecessor) continue;
            validateObligationDependency(contract.obligations, successor.id, predecessor.id);
            successor.predecessorId = predecessor.id;
            successor.trigger = 'ON_PREDECESSOR_COMPLETION';
            successor.triggerOffsetDays = Math.max(0, Number(item.obligation?.triggerOffsetDays || 0));
          }
        }
        document.authoritative = true;
        document.changeReviewStatus = 'ACCEPTED';
        document.classificationConfirmed = true;
        if (document.extractionStatus === 'REVIEW_REQUIRED') document.extractionStatus = 'COMPLETED';
        contract.auditTrail.unshift(audit('LIFECYCLE_CHANGE_ACCEPTED', `${document.fileName} accepted by ${actor}. ${rationale} New clauses and obligations remain subject to human confirmation.`));
      } else {
        document.authoritative = false;
        document.changeReviewStatus = 'REJECTED';
        contract.auditTrail.unshift(audit('LIFECYCLE_CHANGE_REJECTED', `${document.fileName} rejected by ${actor}. ${rationale}`));
      }
      if (contract.status === 'RENEWAL_REVIEW' && !contract.documents.some(item => item.changeReviewStatus === 'PENDING' && item.documentType === 'RENEWAL')) contract.status = 'ACTIVE';
      contract.reviewIssues = evaluateContractAgainstPlaybook(contract, await contractStore.configuration());
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/documents/:documentId/manual-review', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const document = contract.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      if (changeDocumentTypes.has(document.documentType)) throw new Error('Use the lifecycle change-review decision for this document.');
      if (document.extractionStatus !== 'REVIEW_REQUIRED') throw new Error('Only review-required documents need manual extraction sign-off.');
      const rationale = requiredString(request.body.rationale, 'Manual review evidence');
      if (document.documentType === 'SIGNED_CONTRACT' && !contract.clauses.some(clause => clause.reviewStatus === 'CONFIRMED')) throw new Error('Capture and confirm at least one operative clause before signing off the manual review.');
      document.extractionStatus = 'COMPLETED';
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('DOCUMENT_MANUALLY_REVIEWED', `${document.fileName} manually reviewed by ${actor}. ${rationale}`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/drafts', async (request, response) => {
    try {
      const input = request.body as CreateContractInput;
      const contract = await createContractRecord(input, 'NEW_DRAFT');
      const configuration = await contractStore.configuration();
      const entities = await contractStore.entities();
      const template = configuration.templates.find(item => item.id === input.templateId && item.approved);
      if (!template) throw new Error('Select an approved template.');
      contract.draftContent = applyTemplateContext(template.content, contract, entities.find(entity => entity.id === contract.primaryEntityId));
      contract.draftVersions.push({ id: crypto.randomUUID(), version: 1, content: contract.draftContent, author: actor, changeSummary: `Created from ${template.name} v${template.version}`, createdAt: now() });
      contract.activationGaps = validateActivation(contract);
      response.status(201).json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/contracts/:id', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const entityBefore = contract.primaryEntityId;
      const fields = ['title', 'contractType', 'primaryEntityId', 'coveredEntityIds', 'businessUnit', 'principalActivity', 'siteOrProject', 'counterpartyName', 'counterpartyRegistrationNumber', 'vendorId', 'purpose', 'value', 'currency', 'effectiveDate', 'expiryDate', 'noticePeriodDays', 'autoRenewal', 'familyType', 'parentContractId'] as const;
      for (const key of fields) if (request.body[key] !== undefined) (contract as any)[key] = request.body[key];
      if (request.body.owners) contract.owners = { ...contract.owners, ...request.body.owners };
      if (contract.primaryEntityId !== entityBefore) contract.owners = deriveOwners(await contractStore.entities(), contract.primaryEntityId, contract.principalActivity);
      contract.noticeDeadline = calculateNoticeDeadline(contract.expiryDate, contract.noticePeriodDays);
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('CONTRACT_METADATA_UPDATED', 'Entity, commercial metadata or ownership was updated.'));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/contracts/:id/clauses/:clauseId', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const clause = contract.clauses.find(item => item.id === request.params.clauseId);
      if (!clause) return response.status(404).json({ error: 'Clause not found.' });
      Object.assign(clause, request.body, { id: clause.id });
      contract.reviewIssues = evaluateContractAgainstPlaybook(contract, await contractStore.configuration());
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('CLAUSE_REVIEWED', `${clause.clauseNumber || 'Clause'} ${clause.heading}: ${clause.reviewStatus}.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/clauses', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const clause: ContractClause = {
        id: crypto.randomUUID(), clauseNumber: String(request.body.clauseNumber || ''), heading: requiredString(request.body.heading, 'Clause heading'),
        clauseType: String(request.body.clauseType || 'Other'), sourceText: requiredString(request.body.sourceText, 'Clause text'), sourceReference: String(request.body.sourceReference || 'Manual review'),
        risk: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(request.body.risk)) ? request.body.risk : 'MEDIUM', deviation: String(request.body.deviation || ''),
        applicableEntityIds: list(request.body.applicableEntityIds).length ? list(request.body.applicableEntityIds) : contract.primaryEntityId ? [contract.primaryEntityId] : [],
        responsibleParty: ['OUR_COMPANY', 'COUNTERPARTY', 'BOTH'].includes(String(request.body.responsibleParty)) ? request.body.responsibleParty : 'BOTH',
        confidence: 1, reviewStatus: 'CONFIRMED', material: request.body.material !== false,
      };
      contract.clauses.push(clause); contract.reviewIssues = evaluateContractAgainstPlaybook(contract, await contractStore.configuration()); contract.activationGaps = validateActivation(contract);
      contract.auditTrail.unshift(audit('CLAUSE_MANUALLY_CAPTURED', `${clause.clauseNumber || 'Clause'} ${clause.heading} added by reviewer.`)); contract.updatedAt = now();
      await contractStore.saveContract(contract); response.status(201).json(clause);
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/review-issues/:issueId/resolve', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const issue = contract.reviewIssues.find(item => item.id === request.params.issueId);
      if (!issue) return response.status(404).json({ error: 'Review issue not found.' });
      const decision = String(request.body.decision || '') as 'ACCEPTED' | 'RESOLVED';
      const resolution = requiredString(request.body.resolution, 'Resolution or approval rationale');
      if (!['ACCEPTED', 'RESOLVED'].includes(decision)) throw new Error('Select a valid review decision.');
      issue.status = decision; issue.resolution = resolution; issue.resolvedAt = now();
      contract.activationGaps = validateActivation(contract); contract.auditTrail.unshift(audit('PLAYBOOK_ISSUE_DECIDED', `${issue.title}: ${decision}. ${resolution}`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/obligations', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const entities = await contractStore.entities();
      const clause = contract.clauses.find(item => item.id === request.body.clauseId) || { id: '', clauseNumber: '', heading: request.body.title || 'Manual obligation', clauseType: 'Other', sourceText: request.body.action || '', sourceReference: 'Manual entry', risk: 'MEDIUM', deviation: '', applicableEntityIds: [request.body.entityId || contract.primaryEntityId], responsibleParty: request.body.responsibleParty || 'BOTH', confidence: 1, reviewStatus: 'CONFIRMED', material: Boolean(request.body.blocking) } as ContractClause;
      const obligation = createObligationFromClause(clause, contract, entities, request.body);
      validateObligationDependency(contract.obligations, obligation.id, obligation.predecessorId);
      if (obligation.predecessorId && contract.obligations.find(item => item.id === obligation.predecessorId)?.status === 'COMPLETED') {
        const released = releaseDependentObligations([...contract.obligations, obligation], obligation.predecessorId, contract.obligations.find(item => item.id === obligation.predecessorId)!.completedAt || now());
        Object.assign(obligation, released.obligations.find(item => item.id === obligation.id));
      }
      contract.obligations.push(obligation); contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('OBLIGATION_CREATED', `${obligation.title} assigned to ${obligation.ownerName || 'unassigned owner'}.`));
      await contractStore.saveContract(contract);
      response.status(201).json(obligation);
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/contracts/:id/obligations/:obligationId', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const obligation = contract.obligations.find(item => item.id === request.params.obligationId);
      if (!obligation) return response.status(404).json({ error: 'Obligation not found.' });
      const fields = ['title', 'action', 'entityId', 'responsibleParty', 'ownerName', 'ownerEmail', 'monitoringOwnerName', 'monitoringOwnerEmail', 'escalationOwnerName', 'dueDate', 'nextDueDate', 'recurrence', 'alertDays', 'evidenceRequired', 'blocking', 'predecessorId', 'triggerOffsetDays', 'actionKind', 'linkedDocumentId'] as const;
      for (const key of fields) if (request.body[key] !== undefined) (obligation as any)[key] = request.body[key];
      validateObligationDependency(contract.obligations, obligation.id, obligation.predecessorId);
      if (obligation.linkedDocumentId && !contract.documents.some(item => item.id === obligation.linkedDocumentId)) throw new Error('The linked evidence document must belong to this contract.');
      obligation.trigger = obligation.predecessorId ? 'ON_PREDECESSOR_COMPLETION' : 'IMMEDIATE';
      if (obligation.status !== 'DRAFT' && !['COMPLETED', 'WAIVED'].includes(obligation.status)) obligation.status = obligation.predecessorId ? 'WAITING' : 'OPEN';
      obligation.updatedAt = now();
      let updated = refreshObligationStatus(obligation);
      const predecessor = contract.obligations.find(item => item.id === updated.predecessorId);
      if (predecessor?.status === 'COMPLETED' && updated.status === 'WAITING') updated = releaseDependentObligations([updated], predecessor.id, predecessor.completedAt || now()).obligations[0];
      contract.obligations = contract.obligations.map(item => item.id === updated.id ? updated : item);
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('OBLIGATION_UPDATED', `${updated.title} ownership or monitoring details updated.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/obligations/:obligationId/complete', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (!['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status)) throw new Error('Activate contract monitoring before completing obligations.');
      const obligation = contract.obligations.find(item => item.id === request.params.obligationId);
      if (!obligation) return response.status(404).json({ error: 'Obligation not found.' });
      const linkedDocumentId = String(request.body.linkedDocumentId || obligation.linkedDocumentId || '');
      if (obligation.actionKind !== 'STANDARD') {
        const document = contract.documents.find(item => item.id === linkedDocumentId);
        const requiredType = obligation.actionKind === 'UPLOAD_RENEWAL' ? 'RENEWAL' : 'ADDENDUM';
        if (!document || document.documentType !== requiredType || document.changeReviewStatus !== 'ACCEPTED') throw new Error(`Attach an accepted ${requiredType.toLowerCase()} document before completing this obligation.`);
        obligation.linkedDocumentId = linkedDocumentId;
      }
      const updated = completeObligation(obligation, String(request.body.evidence || ''));
      contract.obligations = contract.obligations.map(item => item.id === updated.id ? updated : item);
      const released = releaseDependentObligations(contract.obligations, updated.id, updated.completedAt || now());
      contract.obligations = released.obligations;
      contract.auditTrail.unshift(audit('OBLIGATION_COMPLETED', `${updated.title}: evidence recorded.${released.releasedIds.length ? ` ${released.releasedIds.length} successor obligation(s) activated.` : ''}`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/obligations/:obligationId/confirm', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const obligation = contract.obligations.find(item => item.id === request.params.obligationId);
      if (!obligation) return response.status(404).json({ error: 'Obligation not found.' });
      if (obligation.status !== 'DRAFT') throw new Error('Only draft obligations require confirmation.');
      if (!obligation.ownerEmail || !obligation.monitoringOwnerEmail) throw new Error('Assign accountable and monitoring owners before confirming.');
      validateObligationDependency(contract.obligations, obligation.id, obligation.predecessorId);
      obligation.status = obligation.predecessorId && contract.obligations.find(item => item.id === obligation.predecessorId)?.status !== 'COMPLETED' ? 'WAITING' : 'OPEN';
      Object.assign(obligation, refreshObligationStatus(obligation));
      contract.activationGaps = validateActivation(contract); contract.updatedAt = now();
      contract.auditTrail.unshift(audit('OBLIGATION_CONFIRMED', `${obligation.title} confirmed for monitoring by ${actor}.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/draft-versions', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT') throw new Error('Only new-contract drafts can be edited.');
      if (contract.status !== 'DRAFT') throw new Error('Return the contract to drafting before editing a submitted or approved version.');
      const content = requiredString(request.body.content, 'Draft content');
      contract.draftContent = content;
      contract.draftVersions.push({ id: crypto.randomUUID(), version: contract.draftVersions.length + 1, content, author: actor, changeSummary: String(request.body.changeSummary || 'Draft edited'), createdAt: now() });
      contract.status = 'DRAFT'; contract.updatedAt = now();
      contract.auditTrail.unshift(audit('DRAFT_VERSION_SAVED', `Draft version ${contract.draftVersions.length} saved.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/draft-versions/:versionId/restore', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.status !== 'DRAFT') throw new Error('Return the contract to drafting before restoring a version.');
      const sourceVersion = contract.draftVersions.find(item => item.id === request.params.versionId);
      if (!sourceVersion) return response.status(404).json({ error: 'Draft version not found.' });
      contract.draftContent = sourceVersion.content; contract.status = 'DRAFT';
      contract.draftVersions.push({ id: crypto.randomUUID(), version: contract.draftVersions.length + 1, content: sourceVersion.content, author: actor, changeSummary: `Restored version ${sourceVersion.version}`, createdAt: now() });
      contract.auditTrail.unshift(audit('DRAFT_VERSION_RESTORED', `Version ${sourceVersion.version} restored as version ${contract.draftVersions.length}.`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/contracts/:id/draft/download', async (request, response) => {
    const contract = await contractStore.contract(request.params.id);
    if (!contract || !contract.draftContent) return response.status(404).json({ error: 'Draft content is not available.' });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(contract.title)}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:48px;white-space:pre-wrap}h1{font-size:20px}</style></head><body><h1>${escapeHtml(contract.title)}</h1>${escapeHtml(contract.draftContent)}</body></html>`;
    response.setHeader('Content-Type', 'application/msword; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${safeFileName(contract.contractNumber)}-draft-v${contract.draftVersions.length}.doc"`);
    response.send(html);
  });

  app.post('/api/contracts/:id/ai-draft', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT' || contract.status !== 'DRAFT') throw new Error('AI drafting is only available while a new contract is in drafting.');
      const instruction = requiredString(request.body.instruction, 'Drafting instruction');
      const entity = await contractStore.entity(contract.primaryEntityId);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Configure the Gemini API key in Settings to use AI drafting. The approved template remains editable without AI.');
      const ai = new GoogleGenAI({ apiKey });
      const responseAI = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: `You are assisting legal counsel, not replacing legal review. Revise the contract draft based only on the instruction and company context. Preserve clause numbering and return the complete revised contract as plain text. Flag unresolved information in square brackets.\nCompany: ${entity?.legalName}, registration ${entity?.registrationNumber}, jurisdiction ${entity?.jurisdiction}, activities ${entity?.principalActivities.join(', ')}.\nCounterparty: ${contract.counterpartyName}.\nInstruction: ${instruction}\n\nCurrent draft:\n${contract.draftContent}`,
      });
      contract.draftContent = String(responseAI.text || contract.draftContent);
      contract.draftVersions.push({ id: crypto.randomUUID(), version: contract.draftVersions.length + 1, content: contract.draftContent, author: 'AI Drafting Assistant', changeSummary: instruction, createdAt: now() });
      contract.auditTrail.unshift(audit('AI_DRAFT_GENERATED', `AI-assisted revision saved as version ${contract.draftVersions.length}; legal review remains required.`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/submit-review', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT' || !contract.draftContent || contract.status !== 'DRAFT') throw new Error('A saved editable draft is required before review submission.');
      const stages = applicableApprovalStages(contract, await contractStore.configuration());
      if (!stages.length) throw new Error('Configure at least one approval stage before submission.');
      contract.status = 'APPROVAL_PENDING';
      contract.approvals.push({ id: crypto.randomUUID(), stage: stages[0].name, role: stages[0].role, actor, decision: 'SUBMITTED', notes: String(request.body.notes || ''), createdAt: now() });
      contract.auditTrail.unshift(audit('LEGAL_REVIEW_REQUESTED', 'Draft submitted into the controlled legal review workflow.')); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/approval', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT' || !['LEGAL_REVIEW', 'APPROVAL_PENDING'].includes(contract.status)) throw new Error('This contract is not awaiting an approval decision.');
      const decision = String(request.body.decision || '') as 'APPROVED' | 'REJECTED' | 'RETURNED';
      if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision)) throw new Error('Select a valid decision.');
      const configuration = await contractStore.configuration();
      const stage = nextApprovalStage(contract, configuration);
      if (!stage) throw new Error('No pending approval stage remains.');
      const notes = String(request.body.notes || '');
      if (decision !== 'APPROVED' && !notes.trim()) throw new Error('A reason is required for rejection or return.');
      contract.approvals.push({ id: crypto.randomUUID(), stage: stage.name, role: stage.role, actor, decision, notes, createdAt: now() });
      contract.status = decision === 'APPROVED' ? nextApprovalStage(contract, configuration) ? 'APPROVAL_PENDING' : 'APPROVED' : decision === 'RETURNED' ? 'DRAFT' : 'CLOSED';
      contract.auditTrail.unshift(audit('APPROVAL_DECISION', `${stage.name}: ${decision} by ${actor}.${notes ? ` ${notes}` : ''}`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/execute', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source === 'NEW_DRAFT' && contract.status !== 'APPROVED') throw new Error('The contract must be approved before execution.');
      if (!contract.documents.some(document => document.signed && document.authoritative)) throw new Error('Upload the authoritative signed contract before marking it executed.');
      contract.status = 'EXECUTED'; contract.auditTrail.unshift(audit('CONTRACT_EXECUTED', 'Authoritative signed version recorded.')); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/activate', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      contract.activationGaps = validateActivation(contract);
      if (contract.activationGaps.length) throw new Error(`Activation blocked: ${contract.activationGaps.join(' ')}`);
      contract.status = 'ACTIVE'; contract.obligations = contract.obligations.map(obligation => refreshObligationStatus({ ...obligation, status: obligation.status === 'DRAFT' ? 'OPEN' : obligation.status }));
      contract.auditTrail.unshift(audit('CONTRACT_ACTIVATED', 'Clause intelligence and obligation monitoring activated.')); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/contract-dashboard', async (_request, response) => {
    const dashboard = buildContractDashboard(await contractStore.contracts(), await contractStore.configuration());
    await Promise.all([contractStore.saveNotifications(dashboard.notifications), contractStore.saveOutbox(dashboard.outbox)]);
    response.json(dashboard);
  });

  for (const job of (await contractStore.jobs()).filter(item => item.stage === 'QUEUED' || !terminalJobStages.includes(item.stage))) {
    setTimeout(() => void processContractJob(job.id), 100);
  }
};
