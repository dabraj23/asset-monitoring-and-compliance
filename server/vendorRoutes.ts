import type { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { GoogleGenAI } from '@google/genai';
import type {
  CreateVendorInput,
  EmailOutboxItem,
  ExternalVerification,
  ExtractedField,
  Vendor,
  VendorConfiguration,
  VendorDocument,
  VendorFileInput,
  VendorNotification,
  VendorPerformanceAssessment,
  VendorRule,
  VerificationJob,
} from '../src/vendorTypes.ts';
import { vendorDocumentTypes } from '../src/vendorTypes.ts';
import {
  buildRecommendationSummary,
  createRestrictedVerification,
  deriveRecommendation,
  evaluateVendor,
  externalSourceFor,
  getActiveRules,
  ruleAppliesToVendor,
} from './vendorEngine.ts';
import { vendorStore } from './vendorStore.ts';

const demoActor = 'Admin User';
const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);
const maxFileSize = 10 * 1024 * 1024;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const addYear = (date: string) => {
  const value = new Date(`${date}T00:00:00`);
  value.setFullYear(value.getFullYear() + 1);
  return value.toISOString().slice(0, 10);
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const maskIdentity = (value: string) => value ? `••••••${value.replace(/\s+/g, '').slice(-4)}` : '';
const hashIdentity = (value: string) => value ? createHash('sha256').update(value.replace(/\s+/g, '').toUpperCase()).digest('hex') : '';
const documentField = (document: VendorDocument, key: string) => document.extractedFields.find(field => field.key === key)?.value || '';

const audit = (type: string, summary: string) => ({
  id: crypto.randomUUID(),
  type,
  actor: demoActor,
  summary,
  createdAt: new Date().toISOString(),
});

const parseJsonResponse = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
};

const classifyDocument = (fileName: string) => {
  const name = fileName.toLowerCase();
  const matches: Array<[string[], string]> = [
    [['green', 'personnel'], 'CIDB_GREEN_CARD'],
    [['cidb', 'contractor'], 'CIDB_CONTRACTOR_REGISTRATION'],
    [['skkp', 'competency'], 'CIDB_COMPETENCY_CERTIFICATE'],
    [['crane', 'scaffold', 'boiler', 'dosh operator'], 'DOSH_OPERATOR_CERTIFICATE'],
    [['dosh company', 'competent company'], 'DOSH_COMPETENT_COMPANY'],
    [['hirarc'], 'HIRARC'],
    [['osh policy', 'safety policy'], 'OSH_POLICY'],
    [['training'], 'SAFETY_TRAINING_RECORDS'],
    [['incident'], 'INCIDENT_RECORDS'],
    [['tobtab', 'motac'], 'MOTAC_TOBTAB_LICENSE'],
    [['ctos'], 'CTOS_REPORT'],
    [['abac', 'anti bribery'], 'ABAC_DECLARATION'],
    [['agreement', 'contract'], 'VENDOR_AGREEMENT'],
    [['insurance', 'policy'], 'INSURANCE_CERTIFICATE'],
    [['bank'], 'BANK_VERIFICATION'],
    [['tender'], 'TENDER_COMPLIANCE'],
    [['conflict'], 'CONFLICT_OF_INTEREST'],
    [['cash in transit', 'cit'], 'CIT_RECORDS'],
    [['fire certificate'], 'FIRE_CERTIFICATE'],
    [['spka'], 'SPKA_RECORD'],
    [['energy', 'suruhanjaya tenaga'], 'ENERGY_LICENSE'],
    [['gas'], 'GAS_LICENSE'],
    [['ppm'], 'PPM_LICENSE'],
    [['food premise'], 'FOOD_PREMISE_LICENSE'],
    [['food handler'], 'FOOD_HANDLER_CERTIFICATE'],
  ];
  return matches.find(([terms]) => terms.some(term => name.includes(term)))?.[1] || 'OTHER';
};

const extractDocumentWithAI = async (vendor: Vendor, document: VendorDocument): Promise<Pick<VendorDocument, 'documentType' | 'extractionStatus' | 'extractedFields'>> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      documentType: document.documentType === 'OTHER' ? classifyDocument(document.fileName) : document.documentType,
      extractionStatus: 'REVIEW_REQUIRED',
      extractedFields: [{ key: 'companyName', label: 'Company name', value: vendor.legalName, confidence: 0.55, sourceReference: 'Vendor profile fallback' }],
    };
  }

  try {
    const fileBuffer = await fs.readFile(vendorStore.absoluteUploadPath(document.storagePath));
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You extract vendor compliance evidence for Malaysia. Return JSON only with this shape:
{"documentType":"one of ${vendorDocumentTypes.join(', ')}","fields":[{"key":"companyName|personName|registrationNumber|certificateNumber|licenseNumber|grade|competencyScope|licenseScope|policyNumber|accountLastFour|issueDate|expiryDate","label":"human label","value":"exact value","confidence":0.0,"sourceReference":"page or section"}]}
Vendor profile: ${vendor.legalName}; registration number: ${vendor.registrationNumber}.
Do not invent missing values. Dates must be YYYY-MM-DD.`;
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: document.mimeType, data: fileBuffer.toString('base64') } }] }],
      config: { responseMimeType: 'application/json' },
    });
    const parsed = parseJsonResponse(response.text || '{}');
    const extractedFields: ExtractedField[] = Array.isArray(parsed.fields)
      ? parsed.fields.filter((field: any) => field?.key && field?.value).map((field: any) => ({
          key: String(field.key),
          label: String(field.label || field.key),
          value: String(field.value),
          confidence: Math.max(0, Math.min(1, Number(field.confidence) || 0)),
          sourceReference: String(field.sourceReference || 'Document'),
        }))
      : [];
    return {
      documentType: vendorDocumentTypes.includes(parsed.documentType) ? parsed.documentType : document.documentType,
      extractionStatus: extractedFields.length ? 'COMPLETED' : 'REVIEW_REQUIRED',
      extractedFields,
    };
  } catch (error: any) {
    return {
      documentType: document.documentType === 'OTHER' ? classifyDocument(document.fileName) : document.documentType,
      extractionStatus: 'REVIEW_REQUIRED',
      extractedFields: [{ key: 'companyName', label: 'Company name', value: vendor.legalName, confidence: 0.5, sourceReference: `AI processing fallback: ${error?.message || 'unavailable'}` }],
    };
  }
};

const runGroundedVerification = async (vendor: Vendor, rule: VendorRule, subjectId?: string): Promise<ExternalVerification> => {
  if (['CIDB_PERSONNEL', 'DOSH_PERSONNEL', 'DOSH_COMPANY', 'CTOS', 'BANK_VERIFICATION'].includes(rule.connector)) {
    return createRestrictedVerification(vendor, rule, subjectId);
  }
  const source = externalSourceFor(rule.connector);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      id: crypto.randomUUID(), ruleId: rule.id, subjectId, connector: rule.connector,
      status: 'UNAVAILABLE', matchStatus: 'UNAVAILABLE', authority: source.authority, sourceUrl: source.url,
      checkedAt: new Date().toISOString(), summary: 'Automated search is unavailable because the Gemini API key is not configured.',
      citations: source.url ? [{ title: source.authority, url: source.url }] : [], limitation: 'GEMINI_API_KEY is not configured.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const query = rule.connector === 'LEGAL_SEARCH'
      ? `Search current authoritative Malaysian sources for material legal proceedings, regulatory enforcement, sanctions, blacklist records or adverse findings concerning ${vendor.legalName}, registration ${vendor.registrationNumber}. Distinguish confirmed matches from similar names.`
      : `Verify ${vendor.legalName}, registration ${vendor.registrationNumber}, against ${source.authority}. Search the official source first and identify the exact registration or licence, scope and validity.`;
    const response: any = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: `${query}\nReturn a short evidence-based finding. Do not claim a match unless the registration number is exact.`,
      config: { tools: [{ googleSearch: {} }] },
    } as any);
    const metadata = response.candidates?.[0]?.groundingMetadata;
    const citations = (metadata?.groundingChunks || []).flatMap((chunk: any) => chunk?.web?.uri
      ? [{ title: String(chunk.web.title || new URL(chunk.web.uri).hostname), url: String(chunk.web.uri) }]
      : []);
    const text = String(response.text || '').trim();
    const exactIdentifierFound = text && normalize(text).includes(normalize(vendor.registrationNumber));
    const adverse = /confirmed|convicted|charged|sanction|blacklist|enforcement action/i.test(text);
    const status = rule.connector === 'LEGAL_SEARCH'
      ? (adverse ? 'REVIEW_REQUIRED' : citations.length ? 'PASSED' : 'REVIEW_REQUIRED')
      : (exactIdentifierFound && citations.length ? 'PASSED' : 'REVIEW_REQUIRED');
    return {
      id: crypto.randomUUID(), ruleId: rule.id, subjectId, connector: rule.connector,
      status, matchStatus: status === 'PASSED' ? 'MATCH' : 'REVIEW_REQUIRED', authority: source.authority,
      sourceUrl: source.url || citations[0]?.url || '', checkedAt: new Date().toISOString(),
      summary: text || 'The search returned no usable evidence.', citations: citations.slice(0, 8),
      limitation: status === 'REVIEW_REQUIRED' ? 'The automated result requires human confirmation.' : undefined,
    };
  } catch (error: any) {
    return {
      id: crypto.randomUUID(), ruleId: rule.id, subjectId, connector: rule.connector,
      status: 'UNAVAILABLE', matchStatus: 'UNAVAILABLE', authority: source.authority, sourceUrl: source.url,
      checkedAt: new Date().toISOString(), summary: 'The external source could not be checked.',
      citations: source.url ? [{ title: source.authority, url: source.url }] : [], limitation: error?.message || 'External check failed.',
    };
  }
};

const updateJob = async (job: VerificationJob, stage: VerificationJob['stage'], progress: number, message: string) => {
  const next = { ...job, stage, progress, message, updatedAt: new Date().toISOString() };
  await vendorStore.saveJob(next);
  return next;
};

const refreshFollowUps = (vendor: Vendor, rules: VendorRule[]) => {
  const existingCompleted = vendor.followUps.filter(item => item.status === 'COMPLETED');
  const open = vendor.requirementResults
    .filter(result => result.status !== 'PASSED')
    .map(result => {
      const rule = rules.find(item => item.id === result.ruleId);
      const verification = vendor.verifications.find(item => item.ruleId === result.ruleId && item.subjectId === result.subjectId);
      const existing = vendor.followUps.find(item => item.ruleId === result.ruleId && item.subjectId === result.subjectId && item.status !== 'COMPLETED');
      const dueDate = existing?.dueDate || addDays(today(), rule?.followUpSlaDays || 7);
      return {
        id: existing?.id || crypto.randomUUID(),
        title: `${result.ruleName}: ${result.subjectName}`,
        description: result.reason,
        dueDate,
        owner: rule?.escalationOwner || 'Compliance / Risk',
        status: dueDate < today() ? 'OVERDUE' as const : 'OPEN' as const,
        ruleId: result.ruleId,
        subjectId: result.subjectId,
        sourceUrl: verification?.sourceUrl,
      };
    });
  return [...open, ...existingCompleted].slice(0, 250);
};

const processVerificationJob = async (jobId: string) => {
  let job = await vendorStore.job(jobId);
  if (!job) return;
  try {
    let vendor = await vendorStore.vendor(job.vendorId);
    if (!vendor) throw new Error('Vendor not found');
    const configuration = await vendorStore.configuration();
    const rules = getActiveRules(configuration, vendor.ruleVersion);

    job = await updateJob(job, 'EXTRACTING', 15, 'Classifying and extracting uploaded evidence.');
    const requestedDocuments = vendor.documents.filter(document => job!.documentIds.includes(document.id));
    for (let index = 0; index < requestedDocuments.length; index += 1) {
      const current = requestedDocuments[index];
      const extraction = await extractDocumentWithAI(vendor, { ...current, extractionStatus: 'EXTRACTING' });
      vendor.documents = vendor.documents.map(document => document.id === current.id ? { ...document, ...extraction } : document);
      job = await updateJob(job, 'EXTRACTING', 15 + Math.round(((index + 1) / Math.max(requestedDocuments.length, 1)) * 30), `Processed ${index + 1} of ${requestedDocuments.length} document(s).`);
    }

    job = await updateJob(job, 'APPLYING_RULES', 50, 'Applying the active requirement pack.');
    vendor.requirementResults = evaluateVendor(vendor, rules);

    job = await updateJob(job, 'CHECKING_EXTERNAL_SOURCES', 65, 'Checking permitted official and public sources.');
    const applicableExternalRules = rules.filter(rule => ruleAppliesToVendor(rule, vendor) && rule.connector !== 'DOCUMENT_ONLY');
    const verifications: ExternalVerification[] = [];
    for (const currentRule of applicableExternalRules) {
      const targets = currentRule.scope === 'PERSON'
        ? vendor.personnel.filter(person => !currentRule.personnelRolesAny.length || currentRule.personnelRolesAny.includes(person.role))
        : [{ id: undefined, name: vendor.legalName }];
      for (const target of targets) {
        const hasEvidence = currentRule.connector === 'LEGAL_SEARCH' || vendor.documents.some(document => document.documentType === currentRule.documentType && (currentRule.scope === 'COMPANY' ? !document.subjectId : document.subjectId === target.id));
        if (hasEvidence) verifications.push(await runGroundedVerification(vendor, currentRule, target.id));
      }
    }
    vendor.verifications = verifications;
    vendor.requirementResults = evaluateVendor(vendor, rules);
    vendor.recommendation = deriveRecommendation(vendor.requirementResults);
    vendor.recommendationSummary = buildRecommendationSummary(vendor.requirementResults, vendor.recommendation);
    vendor.followUps = refreshFollowUps(vendor, rules);
    vendor.onboardingStatus = vendor.recommendation === 'RECOMMEND_APPROVE' ? 'IN_APPROVAL' : 'REVIEW_REQUIRED';
    vendor.updatedAt = new Date().toISOString();
    vendor.auditTrail.unshift(audit('VERIFICATION_COMPLETED', vendor.recommendationSummary));
    await vendorStore.saveVendor(vendor);
    const partial = vendor.requirementResults.some(result => ['REVIEW_REQUIRED', 'UNAVAILABLE'].includes(result.status));
    await updateJob(job, partial ? 'PARTIAL' : 'COMPLETED', 100, partial ? 'Verification completed with review tasks.' : 'Verification completed.');
  } catch (error: any) {
    await vendorStore.saveJob({ ...job, stage: 'FAILED', progress: 100, message: 'Verification failed.', error: error?.message || 'Unknown error', updatedAt: new Date().toISOString() });
  }
};

const startVerificationJob = async (vendorId: string, documentIds: string[] = []) => {
  const job: VerificationJob = {
    id: crypto.randomUUID(), vendorId, stage: 'QUEUED', progress: 0,
    message: 'Verification queued.', documentIds, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await vendorStore.saveJob(job);
  setTimeout(() => void processVerificationJob(job.id), 50);
  return job;
};

const createVendor = async (input: CreateVendorInput, configuration: VendorConfiguration): Promise<Vendor> => {
  const category = configuration.categories.find(item => item.id === input.categoryId && item.active);
  if (!category) throw new Error('Select a valid vendor category.');
  if (!input.legalName?.trim() || !input.registrationNumber?.trim()) throw new Error('Vendor name and registration number are required.');
  const now = new Date().toISOString();
  const vendor: Vendor = {
    id: crypto.randomUUID(), legalName: input.legalName.trim(), registrationNumber: input.registrationNumber.trim().toUpperCase(),
    categoryId: category.id, categoryName: category.name, services: (input.services || []).filter(Boolean), activityTags: input.activityTags || [],
    contactName: input.contactName?.trim() || '', email: input.email?.trim() || '', phone: input.phone?.trim() || '', address: input.address?.trim() || '',
    onboardingStatus: 'DOCUMENTS_PENDING', recommendation: 'NEEDS_REVIEW', recommendationSummary: 'Upload the applicable evidence to begin verification.',
    ruleVersion: configuration.activeVersion, currentApprovalStage: 0,
    personnel: (input.personnel || []).filter(person => person.name?.trim()).map(person => ({
      id: crypto.randomUUID(), name: person.name.trim(), role: person.role || 'OTHER', identityMasked: maskIdentity(person.identityNumber || ''),
      identityHash: hashIdentity(person.identityNumber || ''), siteAssignment: person.siteAssignment?.trim() || '', status: 'ACTIVE',
    })),
    documents: [], verifications: [], requirementResults: [], followUps: [], approvals: [], entityLinks: [], performanceAssessments: [],
    auditTrail: [audit('VENDOR_CREATED', `Vendor onboarding created using requirement pack version ${configuration.activeVersion}.`)],
    createdAt: now, updatedAt: now,
  };
  const rules = getActiveRules(configuration, vendor.ruleVersion);
  vendor.requirementResults = evaluateVendor(vendor, rules);
  vendor.recommendation = deriveRecommendation(vendor.requirementResults);
  vendor.recommendationSummary = buildRecommendationSummary(vendor.requirementResults, vendor.recommendation);
  vendor.followUps = refreshFollowUps(vendor, rules);
  return vendor;
};

const refreshNotifications = async (vendors: Vendor[]) => {
  const existing = await vendorStore.notifications();
  const outbox = await vendorStore.outbox();
  const notifications = [...existing];
  const emailOutbox = [...outbox];
  const current = today();
  const reminderDays = new Set([90, 60, 30, 14, 7, 0]);
  const addNotification = (vendor: Vendor, notification: VendorNotification) => {
    if (notifications.some(item => item.id === notification.id)) return;
    notifications.unshift(notification);
    if (vendor.email) emailOutbox.unshift({
      id: notification.id, vendorId: vendor.id, to: vendor.email, subject: notification.title,
      body: `${vendor.legalName}: ${notification.message}`, status: 'PENDING_DEMO', createdAt: notification.createdAt,
    });
  };
  for (const vendor of vendors) {
    for (const document of vendor.documents) {
      const expiryDate = documentField(document, 'expiryDate');
      if (!expiryDate) continue;
      const days = Math.ceil((new Date(`${expiryDate}T00:00:00`).getTime() - new Date(`${current}T00:00:00`).getTime()) / 86_400_000);
      if (!reminderDays.has(days) && days >= 0) continue;
      const key = `expiry:${document.id}:${days < 0 ? current : days}`;
      addNotification(vendor, {
        id: key, vendorId: vendor.id, vendorName: vendor.legalName, title: `${document.documentType.replace(/_/g, ' ')} ${days < 0 ? 'overdue' : 'expiring'}`,
        message: days < 0 ? `Expired ${Math.abs(days)} day(s) ago.` : days === 0 ? 'Expires today.' : `Expires in ${days} days.`,
        dueDate: expiryDate, severity: days <= 7 ? 'CRITICAL' : 'WARNING', read: false, createdAt: new Date().toISOString(),
      });
    }
    for (const followUp of vendor.followUps.filter(item => item.status !== 'COMPLETED' && item.dueDate <= current)) {
      addNotification(vendor, {
        id: `followup:${followUp.id}:${current}`, vendorId: vendor.id, vendorName: vendor.legalName,
        title: 'Vendor follow-up overdue', message: `${followUp.title} was due on ${followUp.dueDate}.`,
        dueDate: followUp.dueDate, severity: 'CRITICAL', read: false, createdAt: new Date().toISOString(),
      });
    }
    if (['APPROVED', 'CONDITIONALLY_APPROVED'].includes(vendor.onboardingStatus)) {
      const nextReview = vendor.performanceAssessments[0]?.nextReviewDate || current;
      if (nextReview <= addDays(current, 30)) addNotification(vendor, {
        id: `performance:${vendor.id}:${nextReview}:${current}`, vendorId: vendor.id, vendorName: vendor.legalName,
        title: 'Annual vendor performance review',
        message: nextReview < current ? `Performance review is overdue from ${nextReview}.` : nextReview === current ? 'Performance review is due today.' : `Performance review is due on ${nextReview}.`,
        dueDate: nextReview, severity: nextReview <= current ? 'CRITICAL' : 'WARNING', read: false, createdAt: new Date().toISOString(),
      });
    }
  }
  await Promise.all([vendorStore.saveNotifications(notifications.slice(0, 500)), vendorStore.saveOutbox(emailOutbox.slice(0, 500))]);
  return { notifications, outbox: emailOutbox };
};

const sendError = (response: Response, error: any, status = 400) => response.status(status).json({ error: error?.message || 'Request failed.' });

const buildRuleImpactPreview = (configuration: VendorConfiguration, vendors: Vendor[]) => {
  const published = getActiveRules(configuration);
  const oldById = new Map(published.map(rule => [rule.id, JSON.stringify(rule)]));
  const draftById = new Map(configuration.draftRules.map(rule => [rule.id, JSON.stringify(rule)]));
  const changedRuleIds = [...new Set([...oldById.keys(), ...draftById.keys()])]
    .filter(id => oldById.get(id) !== draftById.get(id));
  const changedRules = [...published, ...configuration.draftRules].filter((rule, index, collection) =>
    changedRuleIds.includes(rule.id) && collection.findIndex(candidate => candidate.id === rule.id) === index);
  const affectedVendors = vendors
    .filter(vendor => ['APPROVED', 'CONDITIONALLY_APPROVED'].includes(vendor.onboardingStatus))
    .filter(vendor => changedRules.some(rule => ruleAppliesToVendor(rule, vendor)))
    .map(vendor => ({ id: vendor.id, legalName: vendor.legalName, onboardingStatus: vendor.onboardingStatus }));
  return { nextVersion: configuration.activeVersion + 1, changedRuleIds, affectedVendors };
};

export const registerVendorRoutes = async (app: Express) => {
  await vendorStore.init();

  app.get('/api/vendor-config', async (_request, response) => response.json(await vendorStore.configuration()));

  app.post('/api/vendor-config/categories', async (request, response) => {
    try {
      const configuration = await vendorStore.configuration();
      const name = String(request.body.name || '').trim();
      if (!name) throw new Error('Category name is required.');
      let id = slug(name);
      if (configuration.categories.some(item => item.id === id)) id = `${id}-${Date.now()}`;
      configuration.categories.push({ id, name, description: String(request.body.description || '').trim(), active: true });
      response.status(201).json(await vendorStore.saveConfiguration(configuration));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendor-config/rules', async (request, response) => {
    try {
      const configuration = await vendorStore.configuration();
      const candidate = request.body as Partial<VendorRule>;
      if (!candidate.name?.trim() || !candidate.documentType || !candidate.scope) throw new Error('Rule name, scope and document type are required.');
      const newRule: VendorRule = {
        id: crypto.randomUUID(), name: candidate.name.trim(), description: candidate.description?.trim() || candidate.name.trim(),
        regulatorySource: candidate.regulatorySource?.trim() || 'Organisation-defined requirement', scope: candidate.scope,
        categoryIds: candidate.categoryIds || [], activityTagsAny: candidate.activityTagsAny || [], personnelRolesAny: candidate.personnelRolesAny || [],
        documentType: candidate.documentType, requiredFields: candidate.requiredFields || ['companyName', 'expiryDate'],
        connector: candidate.connector || 'DOCUMENT_ONLY', blocking: candidate.blocking !== false,
        expiryWarningDays: Number(candidate.expiryWarningDays) || 60, followUpSlaDays: Number(candidate.followUpSlaDays) || 7,
        escalationOwner: candidate.escalationOwner?.trim() || 'Compliance / Risk',
        steps: candidate.steps?.length ? candidate.steps : ['DOCUMENT_CLASSIFICATION', 'STRUCTURED_EXTRACTION', 'IDENTITY_MATCH', 'EXPIRY_CHECK', 'MANUAL_FALLBACK', 'RECOMMENDATION'], active: true,
      };
      configuration.draftRules.push(newRule);
      response.status(201).json(await vendorStore.saveConfiguration(configuration));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/vendor-config/impact-preview', async (_request, response) => {
    const configuration = await vendorStore.configuration();
    response.json(buildRuleImpactPreview(configuration, await vendorStore.vendors()));
  });

  app.post('/api/vendor-config/publish', async (_request, response) => {
    try {
      const configuration = await vendorStore.configuration();
      const vendors = await vendorStore.vendors();
      const impact = buildRuleImpactPreview(configuration, vendors);
      const version = configuration.activeVersion + 1;
      configuration.activeVersion = version;
      configuration.publishedVersions.push({ version, publishedAt: new Date().toISOString(), rules: structuredClone(configuration.draftRules) });
      await vendorStore.saveConfiguration(configuration);
      for (const vendor of vendors.filter(item => impact.affectedVendors.some(affected => affected.id === item.id))) {
        vendor.followUps.unshift({ id: crypto.randomUUID(), title: `Assess rule pack version ${version}`, description: 'A changed rule pack may affect this vendor.', dueDate: addDays(today(), 14), owner: 'Compliance / Risk', status: 'OPEN' });
        vendor.auditTrail.unshift(audit('RULE_IMPACT_IDENTIFIED', `Rule pack version ${version} published; reassessment was requested.`));
        vendor.updatedAt = new Date().toISOString();
        await vendorStore.saveVendor(vendor);
      }
      response.json(configuration);
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/vendors', async (_request, response) => response.json(await vendorStore.vendors()));
  app.get('/api/vendors/:id', async (request, response) => {
    const vendor = await vendorStore.vendor(request.params.id);
    if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
    response.json(vendor);
  });

  app.post('/api/vendors', async (request, response) => {
    try {
      const vendors = await vendorStore.vendors();
      if (vendors.some(item => normalize(item.registrationNumber) === normalize(request.body.registrationNumber || ''))) throw new Error('A vendor with this registration number already exists.');
      const vendor = await createVendor(request.body, await vendorStore.configuration());
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors-bulk', async (request, response) => {
    try {
      const inputs = Array.isArray(request.body.vendors) ? request.body.vendors as CreateVendorInput[] : [];
      if (!inputs.length || inputs.length > 500) throw new Error('Provide between 1 and 500 vendor rows.');
      const configuration = await vendorStore.configuration();
      const existing = await vendorStore.vendors();
      const seen = new Set(existing.map(item => normalize(item.registrationNumber)));
      const created: Vendor[] = [];
      for (const input of inputs) {
        const identifier = normalize(input.registrationNumber || '');
        if (!identifier || seen.has(identifier)) throw new Error(`Duplicate or missing registration number: ${input.registrationNumber || 'blank'}`);
        seen.add(identifier);
        created.push(await createVendor(input, configuration));
      }
      await vendorStore.saveVendors([...existing, ...created]);
      response.status(201).json(created);
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/documents', async (request: Request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const files = Array.isArray(request.body.files) ? request.body.files as VendorFileInput[] : [];
      if (!files.length || files.length > 20) throw new Error('Upload between 1 and 20 files.');
      const documentIds: string[] = [];
      for (const input of files) {
        const data = Buffer.from(input.data || '', 'base64');
        if (!data.length || data.length > maxFileSize) throw new Error(`${input.fileName}: file must be between 1 byte and 10 MB.`);
        if (!allowedMimeTypes.has(input.mimeType)) throw new Error(`${input.fileName}: unsupported file type.`);
        const hash = createHash('sha256').update(data).digest('hex');
        if (vendor.documents.some(document => document.sha256 === hash)) continue;
        const id = crypto.randomUUID();
        const subject = vendor.personnel.find(person => person.id === input.subjectId);
        const storagePath = await vendorStore.saveUpload(vendor.id, id, input.fileName, data);
        vendor.documents.push({
          id, fileName: input.fileName, mimeType: input.mimeType, size: data.length, sha256: hash,
          documentType: input.declaredType && vendorDocumentTypes.includes(input.declaredType as any) ? input.declaredType : classifyDocument(input.fileName),
          subjectId: subject?.id, subjectName: subject?.name, uploadedAt: new Date().toISOString(), extractionStatus: 'QUEUED', extractedFields: [], storagePath,
        });
        documentIds.push(id);
      }
      if (!documentIds.length) throw new Error('Every selected file is already attached to this vendor.');
      vendor.onboardingStatus = 'VERIFYING';
      vendor.auditTrail.unshift(audit('DOCUMENTS_UPLOADED', `${documentIds.length} document(s) uploaded for background verification.`));
      vendor.updatedAt = new Date().toISOString();
      await vendorStore.saveVendor(vendor);
      response.status(202).json(await startVerificationJob(vendor.id, documentIds));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/run-checks', async (request, response) => {
    const vendor = await vendorStore.vendor(request.params.id);
    if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
    vendor.onboardingStatus = 'VERIFYING';
    vendor.updatedAt = new Date().toISOString();
    await vendorStore.saveVendor(vendor);
    response.status(202).json(await startVerificationJob(vendor.id));
  });

  app.patch('/api/vendors/:id/documents/:documentId/fields', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const document = vendor.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      const fields = Array.isArray(request.body.fields) ? request.body.fields as Array<{ key: string; value: string }> : [];
      document.extractedFields = document.extractedFields.map(field => {
        const correction = fields.find(item => item.key === field.key);
        return correction ? { ...field, value: String(correction.value), confidence: 1, corrected: true } : field;
      });
      document.extractionStatus = 'COMPLETED';
      vendor.auditTrail.unshift(audit('EXTRACTION_CORRECTED', `Extracted values corrected for ${document.fileName}.`));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/verification-jobs/:id', async (request, response) => {
    const job = await vendorStore.job(request.params.id);
    if (!job) return response.status(404).json({ error: 'Verification job not found.' });
    response.json(job);
  });

  app.post('/api/vendors/:id/verifications/:verificationId/manual-result', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const verification = vendor.verifications.find(item => item.id === request.params.verificationId);
      if (!verification) return response.status(404).json({ error: 'Verification record not found.' });
      const status = String(request.body.status || '') as 'PASSED' | 'WARNING' | 'FAILED';
      const notes = String(request.body.notes || '').trim();
      if (!['PASSED', 'WARNING', 'FAILED'].includes(status)) throw new Error('Select a valid manual result.');
      if (!notes) throw new Error('Reviewer notes are required.');
      verification.status = status;
      verification.matchStatus = status === 'FAILED' ? 'NO_MATCH' : 'MATCH';
      verification.officialName = String(request.body.officialName || '').trim() || verification.officialName;
      verification.registrationNumber = String(request.body.registrationNumber || '').trim() || verification.registrationNumber;
      verification.scope = String(request.body.scope || '').trim() || verification.scope;
      verification.validUntil = String(request.body.validUntil || '').trim() || verification.validUntil;
      verification.summary = notes;
      verification.checkedAt = new Date().toISOString();
      verification.limitation = `Manual result recorded by ${demoActor}.`;
      const evidenceUrl = String(request.body.evidenceUrl || '').trim();
      if (evidenceUrl) {
        try { new URL(evidenceUrl); verification.citations.push({ title: 'Reviewer evidence', url: evidenceUrl }); }
        catch { throw new Error('Evidence URL must be a valid URL.'); }
      }
      const configuration = await vendorStore.configuration();
      const rules = getActiveRules(configuration, vendor.ruleVersion);
      vendor.requirementResults = evaluateVendor(vendor, rules);
      vendor.recommendation = deriveRecommendation(vendor.requirementResults);
      vendor.recommendationSummary = buildRecommendationSummary(vendor.requirementResults, vendor.recommendation);
      vendor.followUps = refreshFollowUps(vendor, rules);
      if (!['SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus)) vendor.onboardingStatus = vendor.recommendation === 'RECOMMEND_APPROVE' ? 'IN_APPROVAL' : 'REVIEW_REQUIRED';
      vendor.auditTrail.unshift(audit('MANUAL_VERIFICATION_RECORDED', `${verification.authority}: ${status}. ${notes}`));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/follow-ups/:followUpId/complete', async (request, response) => {
    const vendor = await vendorStore.vendor(request.params.id);
    if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
    vendor.followUps = vendor.followUps.map(item => item.id === request.params.followUpId ? { ...item, status: 'COMPLETED' } : item);
    vendor.auditTrail.unshift(audit('FOLLOW_UP_COMPLETED', 'A compliance follow-up was completed.'));
    vendor.updatedAt = new Date().toISOString();
    response.json(await vendorStore.saveVendor(vendor));
  });

  app.post('/api/vendors/:id/entity-links', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const entityType = String(request.body.entityType || '');
      const relationship = String(request.body.relationship || '');
      const personnelId = String(request.body.personnelId || '');
      if (!['ASSET', 'LOCATION'].includes(entityType) || !request.body.entityId || !request.body.entityName) throw new Error('Select a valid asset or location.');
      if (!['OPERATOR', 'MAINTENANCE_PROVIDER', 'INSTALLER', 'INSPECTOR', 'SUPPLIER', 'LICENCE_HOLDER'].includes(relationship)) throw new Error('Select a valid vendor relationship.');
      const person = personnelId ? vendor.personnel.find(item => item.id === personnelId) : undefined;
      if (relationship === 'OPERATOR') {
        if (!person) throw new Error('Select the qualified operator who will be assigned to this asset.');
        const competencyResults = vendor.requirementResults.filter(result => result.subjectId === person.id && result.blocking);
        if (!competencyResults.length) throw new Error('This person has no configured competency workflow. Add the applicable personnel role and run checks first.');
        if (competencyResults.some(result => ['FAILED', 'REVIEW_REQUIRED', 'UNAVAILABLE'].includes(result.status))) {
          throw new Error('This operator cannot be assigned while a mandatory competency check is failed, unavailable or awaiting review.');
        }
      }
      vendor.entityLinks = vendor.entityLinks || [];
      if (!vendor.entityLinks.some(link => link.entityType === entityType && link.entityId === request.body.entityId && link.relationship === relationship)) {
        vendor.entityLinks.push({ id: crypto.randomUUID(), entityType, entityId: String(request.body.entityId), entityName: String(request.body.entityName), relationship, personnelId: person?.id, personnelName: person?.name, createdAt: new Date().toISOString() } as any);
      }
      vendor.auditTrail.unshift(audit('ENTITY_LINKED', `${request.body.entityName} linked as ${relationship}.`));
      vendor.updatedAt = new Date().toISOString();
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/approval', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const configuration = await vendorStore.configuration();
      const decision = String(request.body.decision || '') as 'APPROVED' | 'CONDITIONAL' | 'REJECTED';
      if (!['APPROVED', 'CONDITIONAL', 'REJECTED'].includes(decision)) throw new Error('Select a valid decision.');
      if (decision === 'APPROVED' && vendor.recommendation !== 'RECOMMEND_APPROVE') throw new Error('Resolve blocking checks before approving this vendor.');
      const stage = configuration.approvalStages[Math.min(vendor.currentApprovalStage, configuration.approvalStages.length - 1)];
      vendor.approvals.push({ id: crypto.randomUUID(), stageId: stage.id, stageName: stage.name, requiredRole: stage.requiredRole, actor: demoActor, decision, notes: String(request.body.notes || ''), createdAt: new Date().toISOString() });
      if (decision === 'REJECTED') vendor.onboardingStatus = 'REJECTED';
      else if (decision === 'CONDITIONAL') vendor.onboardingStatus = 'CONDITIONALLY_APPROVED';
      else if (vendor.currentApprovalStage >= configuration.approvalStages.length - 1) vendor.onboardingStatus = 'APPROVED';
      else { vendor.currentApprovalStage += 1; vendor.onboardingStatus = 'IN_APPROVAL'; }
      vendor.auditTrail.unshift(audit('APPROVAL_RECORDED', `${stage.name}: ${decision}.`));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/lifecycle', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const status = String(request.body.status || '') as 'SUSPENDED' | 'BLACKLISTED' | 'APPROVED';
      const reason = String(request.body.reason || '').trim();
      if (!['SUSPENDED', 'BLACKLISTED', 'APPROVED'].includes(status)) throw new Error('Select a valid lifecycle action.');
      if (!reason) throw new Error('A reason is required for lifecycle actions.');
      if (status === 'APPROVED' && !['SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus)) throw new Error('Only a suspended or blacklisted vendor can be reinstated.');
      if (status === 'APPROVED' && vendor.recommendation !== 'RECOMMEND_APPROVE') throw new Error('Resolve blocking checks before reinstating this vendor.');
      vendor.onboardingStatus = status;
      vendor.auditTrail.unshift(audit(status === 'APPROVED' ? 'VENDOR_REINSTATED' : `VENDOR_${status}`, reason));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/performance', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const keys = ['quality', 'delivery', 'cost', 'service', 'safety', 'compliance'] as const;
      const scores = request.body.scores || {};
      const weights = request.body.weights || {};
      const totalWeight = keys.reduce((total, key) => total + Number(weights[key] || 0), 0);
      if (Math.round(totalWeight) !== 100) throw new Error('Performance weights must total 100%.');
      if (keys.some(key => Number(scores[key]) < 0 || Number(scores[key]) > 100)) throw new Error('Scores must be between 0 and 100.');
      const weightedScore = keys.reduce((total, key) => total + Number(scores[key]) * Number(weights[key]) / 100, 0);
      const assessment: VendorPerformanceAssessment = {
        id: crypto.randomUUID(), period: String(request.body.period || new Date().getFullYear()), scores, weights,
        weightedScore: Math.round(weightedScore * 10) / 10, reviewer: demoActor, comments: String(request.body.comments || ''),
        reviewedAt: today(), nextReviewDate: addYear(today()),
      };
      vendor.performanceAssessments.unshift(assessment);
      vendor.auditTrail.unshift(audit('PERFORMANCE_REVIEWED', `Annual performance score recorded: ${assessment.weightedScore}.`));
      vendor.updatedAt = new Date().toISOString();
      await vendorStore.saveVendor(vendor);
      response.status(201).json(assessment);
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/vendor-dashboard', async (_request, response) => {
    const vendors = await vendorStore.vendors();
    const { notifications, outbox } = await refreshNotifications(vendors);
    const expiringSoon = vendors.filter(vendor => vendor.requirementResults.some(result => result.status === 'WARNING')).length;
    const annualReviewsDue = vendors.filter(vendor => ['APPROVED', 'CONDITIONALLY_APPROVED'].includes(vendor.onboardingStatus) && (() => {
      const next = vendor.performanceAssessments[0]?.nextReviewDate;
      return !next || next <= addDays(today(), 30);
    })()).length;
    response.json({
      totalVendors: vendors.length,
      onboarding: vendors.filter(vendor => ['DRAFT', 'DOCUMENTS_PENDING', 'VERIFYING', 'IN_APPROVAL'].includes(vendor.onboardingStatus)).length,
      approved: vendors.filter(vendor => ['APPROVED', 'CONDITIONALLY_APPROVED'].includes(vendor.onboardingStatus)).length,
      reviewRequired: vendors.filter(vendor => vendor.onboardingStatus === 'REVIEW_REQUIRED').length,
      nonCompliant: vendors.filter(vendor => vendor.requirementResults.some(result => result.status === 'FAILED' && result.blocking)).length,
      expiringSoon,
      overdueActions: vendors.reduce((total, vendor) => total + vendor.followUps.filter(item => item.status === 'OVERDUE').length, 0),
      annualReviewsDue,
      notifications: notifications.slice(0, 20), outbox: outbox.slice(0, 20),
    });
  });

  app.get('/api/vendor-notifications', async (_request, response) => response.json(await vendorStore.notifications()));
  app.get('/api/vendor-email-outbox', async (_request, response) => response.json(await vendorStore.outbox()));

  for (const job of (await vendorStore.jobs()).filter(item => item.stage === 'QUEUED')) setTimeout(() => void processVerificationJob(job.id), 100);
};
