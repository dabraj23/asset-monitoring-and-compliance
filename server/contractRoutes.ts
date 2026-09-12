import type { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { GoogleGenAI } from '@google/genai';
import type {
  Contract,
  ContractClause,
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
  buildContractDashboard,
  calculateNoticeDeadline,
  completeObligation,
  createObligationFromClause,
  deriveOwners,
  evaluateContractAgainstPlaybook,
  refreshObligationStatus,
  resolveEntity,
  validateActivation,
} from './contractEngine.ts';
import { contractStore } from './contractStore.ts';

const actor = 'Admin User';
const maxFileSize = 15 * 1024 * 1024;
const allowedMimeTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg',
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
    obligation?: { title?: string; action?: string; dueDate?: string; recurrence?: string; evidenceRequired?: string; blocking?: boolean };
  }>;
}

const extractContractWithAI = async (contract: Contract, document: ContractDocument): Promise<ExtractedContract | undefined> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;
  try {
    const file = await fs.readFile(contractStore.absoluteUploadPath(document.storagePath));
    const configuration = await contractStore.configuration();
    const entities = await contractStore.entities();
    const context = entities.map(entity => `${entity.legalName} | registration ${entity.registrationNumber} | aliases ${entity.aliases.join(', ')} | activities ${entity.principalActivities.join(', ')}`).join('\n');
    const playbook = configuration.playbookRules.filter(rule => rule.active).map(rule => `${rule.clauseType} (${rule.risk}): ${rule.preferredPosition}; flag: ${rule.redFlagTerms.join(', ') || 'material deviation'}`).join('\n');
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a contract-intelligence analyst. Read the complete contract and return JSON only. Do not invent missing facts. Dates must be YYYY-MM-DD. Preserve concise exact clause language and a page/clause citation.
Known group entities:\n${context}
Contract review playbook:\n${playbook}
Return this shape:
{"title":"","contractType":"one of ${configuration.contractTypes.join(', ')}","contractNumber":"","ourPartyName":"","ourPartyRegistrationNumber":"","counterpartyName":"","counterpartyRegistrationNumber":"","purpose":"","effectiveDate":"","expiryDate":"","noticePeriodDays":0,"autoRenewal":false,"value":0,"currency":"MYR","clauses":[{"clauseNumber":"","heading":"","clauseType":"one of ${configuration.clauseTypes.join(', ')}","sourceText":"","sourceReference":"page and clause","risk":"LOW|MEDIUM|HIGH|CRITICAL","deviation":"why non-standard or blank","responsibleParty":"OUR_COMPANY|COUNTERPARTY|BOTH","confidence":0.0,"material":true,"obligation":{"title":"","action":"specific action to monitor","dueDate":"YYYY-MM-DD or blank","recurrence":"ONCE|MONTHLY|QUARTERLY|ANNUALLY|ON_EVENT","evidenceRequired":"","blocking":true}}]}
Extract operative obligations, payment dates, deliverables, renewals, notice periods, termination rights, licences, insurance, reporting, service levels, audit rights and regulatory commitments. Separate each monitorable action.`;
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: document.mimeType, data: file.toString('base64') } }] }],
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

const mergeExtraction = async (contract: Contract, extraction: ExtractedContract) => {
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
      id: crypto.randomUUID(), clauseNumber: String(item.clauseNumber || ''), heading: String(item.heading || item.clauseType || 'Extracted clause'),
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
      }));
    }
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
    contract.status = 'PROCESSING';
    await contractStore.saveContract(contract);

    job = await updateJob(job, 'ENTITY_RESOLUTION', 25, 'Resolving the contracting entity against the corporate structure.');
    const documents = contract.documents.filter(document => job!.documentIds.includes(document.id));
    let extractedCount = 0;
    job = await updateJob(job, 'EXTRACTING_CLAUSES', 40, 'Reading clauses, dates, commercial terms and commitments.');
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];
      const extraction = await extractContractWithAI(contract, document);
      if (extraction) {
        await mergeExtraction(contract, extraction);
        extractedCount += 1;
        contract.documents = contract.documents.map(item => item.id === document.id ? { ...item, extractionStatus: 'COMPLETED' } : item);
      } else {
        contract.documents = contract.documents.map(item => item.id === document.id ? { ...item, extractionStatus: 'REVIEW_REQUIRED' } : item);
      }
      job = await updateJob(job, 'EXTRACTING_CLAUSES', 40 + Math.round(((index + 1) / documents.length) * 35), `Processed ${index + 1} of ${documents.length} document(s).`);
    }

    job = await updateJob(job, 'GENERATING_OBLIGATIONS', 82, 'Assigning clauses and obligations to entities and monitoring owners.');
    contract.obligations = contract.obligations.map(obligation => refreshObligationStatus(obligation));
    contract.reviewIssues = evaluateContractAgainstPlaybook(contract, configuration);
    contract.activationGaps = validateActivation(contract);
    if (!contract.primaryEntityId) contract.status = 'ENTITY_REVIEW';
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
      contract.status = 'ENTITY_REVIEW'; contract.activationGaps = ['Background processing failed. Review the source file and captured metadata.'];
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
  if (!inputs.length || inputs.length > 20) throw new Error('Upload between 1 and 20 files.');
  const ids: string[] = [];
  for (const input of inputs) {
    const data = Buffer.from(input.data || '', 'base64');
    if (!data.length || data.length > maxFileSize) throw new Error(`${input.fileName}: file must be between 1 byte and 15 MB.`);
    if (!allowedMimeTypes.has(input.mimeType)) throw new Error(`${input.fileName}: unsupported file type.`);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (contract.documents.some(document => document.sha256 === sha256)) continue;
    const id = crypto.randomUUID();
    const storagePath = await contractStore.saveUpload(contract.id, id, input.fileName, data);
    contract.documents.push({
      id, fileName: input.fileName, mimeType: input.mimeType, size: data.length, sha256,
      version: contract.documents.length + 1, documentType: input.documentType || 'SIGNED_CONTRACT',
      authoritative: input.authoritative ?? true, signed: input.signed ?? true, uploadedAt: now(), extractionStatus: 'QUEUED', storagePath,
    });
    ids.push(id);
  }
  if (!ids.length) throw new Error('Every selected file is already attached to this contract.');
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
      if (input.parentId && !entities.some(entity => entity.id === input.parentId)) throw new Error('Select a valid parent entity.');
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
      const editable = ['legalName', 'displayName', 'parentId', 'entityType', 'registrationNumber', 'jurisdiction', 'registeredAddress', 'effectiveFrom', 'effectiveTo', 'active'] as const;
      for (const key of editable) if (request.body[key] !== undefined) (entity as any)[key] = request.body[key];
      for (const key of ['aliases', 'principalActivities', 'businessUnits', 'sites'] as const) if (request.body[key] !== undefined) entity[key] = list(request.body[key]);
      if (Array.isArray(request.body.roleAssignments)) entity.roleAssignments = request.body.roleAssignments.map((item: any) => ({ ...item, id: item.id || crypto.randomUUID() }));
      entity.updatedAt = now();
      response.json(await contractStore.saveEntity(entity));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/contract-config', async (_request, response) => response.json(await contractStore.configuration()));
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

  app.post('/api/contracts/:id/documents', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
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
      const documentIds = contract.documents.map(document => document.id);
      contract.documents = contract.documents.map(document => ({ ...document, extractionStatus: 'QUEUED' }));
      contract.status = 'PROCESSING'; contract.auditTrail.unshift(audit('CONTRACT_REPROCESS_QUEUED', 'Contract intelligence was queued again.')); contract.updatedAt = now();
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
      Object.assign(obligation, request.body, { id: obligation.id, updatedAt: now() });
      const updated = refreshObligationStatus(obligation);
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
      const obligation = contract.obligations.find(item => item.id === request.params.obligationId);
      if (!obligation) return response.status(404).json({ error: 'Obligation not found.' });
      const updated = completeObligation(obligation, String(request.body.evidence || ''));
      contract.obligations = contract.obligations.map(item => item.id === updated.id ? updated : item);
      contract.auditTrail.unshift(audit('OBLIGATION_COMPLETED', `${updated.title}: evidence recorded.`)); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/draft-versions', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT') throw new Error('Only new-contract drafts can be edited.');
      const content = requiredString(request.body.content, 'Draft content');
      contract.draftContent = content;
      contract.draftVersions.push({ id: crypto.randomUUID(), version: contract.draftVersions.length + 1, content, author: actor, changeSummary: String(request.body.changeSummary || 'Draft edited'), createdAt: now() });
      contract.status = 'DRAFT'; contract.updatedAt = now();
      contract.auditTrail.unshift(audit('DRAFT_VERSION_SAVED', `Draft version ${contract.draftVersions.length} saved.`));
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/ai-draft', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      if (contract.source !== 'NEW_DRAFT') throw new Error('AI drafting is only available for new contracts.');
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
      if (contract.source !== 'NEW_DRAFT' || !contract.draftContent) throw new Error('A saved draft is required.');
      contract.status = 'LEGAL_REVIEW';
      contract.approvals.push({ id: crypto.randomUUID(), stage: 'Legal Review', role: 'Legal', actor, decision: 'SUBMITTED', notes: String(request.body.notes || ''), createdAt: now() });
      contract.auditTrail.unshift(audit('LEGAL_REVIEW_REQUESTED', 'Draft submitted into the controlled legal review workflow.')); contract.updatedAt = now();
      response.json(await contractStore.saveContract(contract));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/contracts/:id/approval', async (request, response) => {
    try {
      const contract = await contractStore.contract(request.params.id);
      if (!contract) return response.status(404).json({ error: 'Contract not found.' });
      const decision = String(request.body.decision || '') as 'APPROVED' | 'REJECTED' | 'RETURNED';
      if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision)) throw new Error('Select a valid decision.');
      contract.approvals.push({ id: crypto.randomUUID(), stage: String(request.body.stage || 'Legal Review'), role: String(request.body.role || 'Legal'), actor, decision, notes: String(request.body.notes || ''), createdAt: now() });
      contract.status = decision === 'APPROVED' ? 'APPROVED' : decision === 'RETURNED' ? 'DRAFT' : 'CLOSED';
      contract.auditTrail.unshift(audit('APPROVAL_DECISION', `${decision} by ${actor}.`)); contract.updatedAt = now();
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
