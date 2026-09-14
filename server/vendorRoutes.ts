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
  VendorPerformanceEvent,
  VendorRiskCase,
  VendorIntakeCase,
  VendorRule,
  VendorSiteMobilisation,
  VerificationJob,
} from '../src/vendorTypes.ts';
import { vendorDocumentTypes } from '../src/vendorTypes.ts';
import { canReadEntity, canWriteEntity, currentUser } from './platformAuth.ts';
import { workflowStore } from './workflowStore.ts';
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
import { contractStore } from './contractStore.ts';
import { eligibleVendorContracts, evaluateVendorAgreement, isAgreementRule } from './vendorAgreement.ts';
import { verifyDoshRecord } from './doshConnector.ts';
import { extractOfficeText } from './officeText.ts';
import { parseOwnershipEntries } from './vendorOwnership.ts';
import { checklistFor } from '../src/vendorChecklist.ts';
import { assessSiteReadiness } from './vendorSite.ts';
import { assetStore } from './assetStore.ts';

const demoActor = 'Admin User';
const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
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
const hashIdentity = (value: string) => value ? createHash('sha256').update(value.replace(/[^a-z0-9]/gi, '').toUpperCase()).digest('hex') : '';
const documentField = (document: VendorDocument, key: string) => document.extractedFields.find(field => field.key === key)?.value || '';

const workflowRequirementResults = async (vendor: Vendor, version?: number): Promise<import('../src/vendorTypes.ts').RequirementResult[]> => {
  const instruction = await workflowStore.resolve({ module: 'VENDOR', phase: 'VALIDATE', entityId: vendor.entityId, categoryId: vendor.categoryId, version });
  if (!instruction?.requiredDocumentTypes.length) return [];
  const definitions = await workflowStore.documents('VENDOR', version);
  return instruction.requiredDocumentTypes.map(type => {
    const evidence = vendor.documents.filter(document => document.documentType === type && !document.subjectId);
    const definition = definitions.find(item => item.code === type && (!item.categoryIds.length || item.categoryIds.includes(vendor.categoryId)) && (!item.entityIds.length || item.entityIds.includes(vendor.entityId || '')));
    const requiredFields = definition?.fields.length ? definition.fields : instruction.requiredFields;
    const matched = evidence.find(document => requiredFields.every(field => document.extractedFields.some(value => value.key === field && value.value && value.confidence >= 0.7)));
    const expiry = matched ? documentField(matched, 'expiryDate') : '';
    const status: import('../src/vendorTypes.ts').VendorCheckStatus = !evidence.length ? 'PENDING_EVIDENCE' : !matched ? 'REVIEW_REQUIRED' : expiry && expiry < today() ? 'FAILED' : 'PASSED';
    return { id: `workflow:${type}`, ruleId: instruction.id, ruleName: `Configured ${type.replaceAll('_', ' ')} evidence`, requestedDocumentType: type, scope: 'COMPANY' as const, subjectName: vendor.legalName, blocking: instruction.blocking, status, reason: !evidence.length ? `Request ${type.replaceAll('_', ' ').toLowerCase()} evidence.` : !matched ? `Check extracted fields: ${requiredFields.join(', ')}.` : status === 'FAILED' ? 'Document has expired.' : 'Configured evidence present and extracted fields confirmed.', evidenceIds: evidence.map(item => item.id), verificationIds: [], expiresAt: expiry || undefined };
  });
};

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
    [['shareholder', 'shareholding', 'register of members'], 'SHAREHOLDER_REGISTER'],
    [['beneficial owner', 'beneficial ownership'], 'BENEFICIAL_OWNERSHIP_DECLARATION'],
    [['ssm', 'company profile'], 'SSM_PROFILE'],
    [['green', 'personnel'], 'CIDB_GREEN_CARD'],
    [['cidb', 'contractor'], 'CIDB_CONTRACTOR_REGISTRATION'],
    [['skkp', 'competency'], 'CIDB_COMPETENCY_CERTIFICATE'],
    [['crane', 'scaffold', 'boiler', 'dosh operator'], 'DOSH_OPERATOR_CERTIFICATE'],
    [['dosh company', 'competent company'], 'DOSH_COMPETENT_COMPANY'],
    [['hirarc'], 'HIRARC'],
    [['osh policy', 'safety policy'], 'OSH_POLICY'],
    [['training'], 'SAFETY_TRAINING_RECORDS'],
    [['induction'], 'SITE_INDUCTION'],
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

const extractDocumentWithAI = async (vendor: Vendor, document: VendorDocument, workflowVersion?: number): Promise<Pick<VendorDocument, 'documentType' | 'extractionStatus' | 'extractedFields' | 'ownershipEntries'>> => {
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
    const instruction = await workflowStore.resolve({ module: 'VENDOR', phase: 'EXTRACT', entityId: vendor.entityId, categoryId: vendor.categoryId, version: workflowVersion });
    const allowedTypes = [...new Set([...vendorDocumentTypes, ...(await workflowStore.documents('VENDOR', workflowVersion)).map(item => item.code)])];
    const prompt = `You extract vendor compliance evidence for Malaysia. Administrator reading instructions: ${instruction?.prompt || ''}. Return JSON only with this shape:
{"documentType":"one of ${allowedTypes.join(', ')}","fields":[{"key":"companyName|personName|registrationNumber|address|phone|email|tin|msic|businessActivity|sstNumber|tourismTaxNumber|certificateNumber|licenseNumber|grade|competencyScope|licenseScope|policyNumber|accountLastFour|issueDate|expiryDate","label":"human label","value":"exact value","confidence":0.0,"sourceReference":"page or section"}],"ownershipEntries":[{"holderName":"exact shareholder or beneficial-owner name","ownershipType":"DIRECT|BENEFICIAL","shareClass":"class if shown","sharesHeld":null,"totalShares":null,"percentage":null,"asOfDate":"YYYY-MM-DD or blank","sourceReference":"page/table/section showing the holding","confidence":0.0}]}
Vendor profile: ${vendor.legalName}; registration number: ${vendor.registrationNumber}.
Use registrationNumber for the vendor's business/company registration. Use certificateNumber for DOSH, CIDB competency or FYK certificate/registry numbers.
Extract ownership entries only when this source explicitly states a holder's shares or percentage. A director list, company name, or paid-up capital alone does not establish ownership. Include every evidenced holder; leave percentage null unless stated or both shares held and a same-class total are visible. Do not invent missing values. Dates must be YYYY-MM-DD.`;
    const officeText = await extractOfficeText(fileBuffer, document.mimeType);
    if (officeText !== undefined && !officeText.trim()) throw new Error('The document contains no readable text.');
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }, officeText !== undefined ? { text: officeText } : { inlineData: { mimeType: document.mimeType, data: fileBuffer.toString('base64') } }] }],
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
      documentType: allowedTypes.includes(parsed.documentType) ? parsed.documentType : document.documentType,
      extractionStatus: extractedFields.length || parseOwnershipEntries(parsed.ownershipEntries).length ? 'COMPLETED' : 'REVIEW_REQUIRED',
      extractedFields,
      ownershipEntries: parseOwnershipEntries(parsed.ownershipEntries),
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
  if (rule.connector === 'DOSH_PERSONNEL' || rule.connector === 'DOSH_COMPANY') {
    return verifyDoshRecord({ vendor, rule, subjectId });
  }
  if (['CIDB_PERSONNEL', 'CTOS', 'BANK_VERIFICATION'].includes(rule.connector)) {
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
        ...existing,
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

const agreementResults = (vendor: Vendor, rules: VendorRule[], contracts: Awaited<ReturnType<typeof contractStore.contracts>>) =>
  rules.filter(rule => isAgreementRule(rule) && ruleAppliesToVendor(rule, vendor))
    .map(rule => evaluateVendorAgreement(vendor, contracts, rule));

const projectAgreement = (vendor: Vendor, rules: VendorRule[], contracts: Awaited<ReturnType<typeof contractStore.contracts>>): Vendor => {
  const results = [...vendor.requirementResults.filter(result => !rules.some(rule => isAgreementRule(rule) && rule.id === result.ruleId) && result.ruleId !== 'agreement'), ...agreementResults(vendor, rules, contracts)];
  const recommendation = deriveRecommendation(results);
  const pendingProfileReview = vendor.recommendation === 'NEEDS_REVIEW' && vendor.recommendationSummary.startsWith('Vendor profile changed;');
  return {
    ...vendor, requirementResults: results,
    recommendation: pendingProfileReview ? 'NEEDS_REVIEW' : recommendation,
    recommendationSummary: pendingProfileReview ? vendor.recommendationSummary : buildRecommendationSummary(results, recommendation),
  };
};

const openBlockingRisks = (vendor: Vendor) => (vendor.riskCases || []).filter(item => item.status === 'OPEN' && ['HIGH', 'CRITICAL'].includes(item.severity));
const projectRisk = (vendor: Vendor): Vendor => {
  const blocking = openBlockingRisks(vendor);
  return blocking.length ? { ...vendor, recommendation: 'NEEDS_REVIEW', recommendationSummary: `${blocking.length} open high-severity risk case(s) require a documented human decision. ${vendor.recommendationSummary}` } : vendor;
};

const projectCurrentRequirements = async (vendor: Vendor, configuration: VendorConfiguration, contracts: Awaited<ReturnType<typeof contractStore.contracts>>): Promise<Vendor> => {
  const rules = getActiveRules(configuration, vendor.ruleVersion);
  // Previously approved cases retain their human decision and pinned review results;
  // a changed rule pack creates a reassessment task instead of silently revoking site access.
  if (['APPROVED', 'CONDITIONALLY_APPROVED'].includes(vendor.onboardingStatus)) return withSiteReadiness(projectRisk(projectAgreement(vendor, rules, contracts)));
  const results = [...evaluateVendor(vendor, rules), ...agreementResults(vendor, rules, contracts), ...await workflowRequirementResults(vendor, vendor.workflowVersion)];
  const pendingProfileReview = vendor.recommendation === 'NEEDS_REVIEW' && vendor.recommendationSummary.startsWith('Vendor profile changed;');
  const recommendation = pendingProfileReview ? 'NEEDS_REVIEW' as const : deriveRecommendation(results);
  const onboardingStatus = recommendation === 'AWAITING_EVIDENCE' && ['DRAFT', 'DOCUMENTS_PENDING', 'REVIEW_REQUIRED'].includes(vendor.onboardingStatus)
    ? 'DOCUMENTS_PENDING' as const : vendor.onboardingStatus;
  return withSiteReadiness(projectRisk({ ...vendor, requirementResults: results, recommendation, recommendationSummary: pendingProfileReview ? vendor.recommendationSummary : buildRecommendationSummary(results, recommendation), onboardingStatus }));
};

const withSiteReadiness = (vendor: Vendor) => ({ ...vendor, siteMobilisations: (vendor.siteMobilisations || []).map(site => {
  const readiness = assessSiteReadiness(vendor, site);
  return { ...site, readinessStatus: readiness.status, readinessReasons: readiness.reasons };
}) });

const liveVendor = async (vendor: Vendor, configuration?: VendorConfiguration) => {
  const resolvedConfiguration = configuration || await vendorStore.configuration();
  return projectCurrentRequirements(vendor, resolvedConfiguration, await contractStore.contracts());
};

/** Reassess the contract-owned requirement without silently changing a human approval. */
const reassessVendorAgreements = async () => {
  const configuration = await vendorStore.configuration();
  const contracts = await contractStore.contracts();
  const running = new Set((await vendorStore.jobs()).filter(job => !['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage)).map(job => job.vendorId));
  for (const vendor of await vendorStore.vendors()) {
    if (running.has(vendor.id)) continue;
    const rules = getActiveRules(configuration, vendor.ruleVersion);
    const agreementRuleIds = new Set(rules.filter(isAgreementRule).map(rule => rule.id));
    const prior = vendor.requirementResults.filter(result => result.ruleId === 'agreement' || agreementRuleIds.has(result.ruleId));
    const projected = projectRisk(projectAgreement(vendor, rules, contracts));
    const next = projected.requirementResults.filter(result => result.ruleId === 'agreement' || agreementRuleIds.has(result.ruleId));
    if (JSON.stringify(prior) === JSON.stringify(next)) continue;
    vendor.requirementResults = projected.requirementResults;
    vendor.recommendation = projected.recommendation;
    vendor.recommendationSummary = projected.recommendationSummary;
    const agreementFollowUps = refreshFollowUps(vendor, rules).filter(item => item.ruleId && agreementRuleIds.has(item.ruleId));
    const stillOpen = new Set(agreementFollowUps.filter(item => item.status !== 'COMPLETED').map(item => item.id));
    const resolved = vendor.followUps.filter(item => item.ruleId && agreementRuleIds.has(item.ruleId) && item.status !== 'COMPLETED' && !stillOpen.has(item.id))
      .map(item => ({ ...item, status: 'COMPLETED' as const, progressNote: item.progressNote || 'Agreement requirement resolved from the Contract Management record.' }));
    vendor.followUps = [...vendor.followUps.filter(item => !item.ruleId || !agreementRuleIds.has(item.ruleId)), ...agreementFollowUps, ...resolved];
    vendor.auditTrail.unshift(audit('VENDOR_AGREEMENT_REASSESSED', next.map(item => `${item.ruleName}: ${item.status}`).join('; ') || 'Agreement rule no longer applies.'));
    vendor.updatedAt = new Date().toISOString();
    await vendorStore.saveVendor(vendor);
  }
};
let agreementSync: Promise<void> | undefined;
export const syncVendorAgreementStatus = () => {
  if (!agreementSync) agreementSync = reassessVendorAgreements().finally(() => { agreementSync = undefined; });
  return agreementSync;
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
      const extraction = await extractDocumentWithAI(vendor, { ...current, extractionStatus: 'EXTRACTING' }, job.workflowVersion);
      vendor.documents = vendor.documents.map(document => document.id === current.id ? { ...document, ...extraction } : document);
      job = await updateJob(job, 'EXTRACTING', 15 + Math.round(((index + 1) / Math.max(requestedDocuments.length, 1)) * 30), `Processed ${index + 1} of ${requestedDocuments.length} document(s).`);
    }

    job = await updateJob(job, 'APPLYING_RULES', 50, 'Applying the active requirement pack.');
    vendor.requirementResults = [...evaluateVendor(vendor, rules), ...agreementResults(vendor, rules, await contractStore.contracts()), ...await workflowRequirementResults(vendor, job.workflowVersion)];

    job = await updateJob(job, 'CHECKING_EXTERNAL_SOURCES', 65, 'Checking permitted official and public sources.');
    const applicableExternalRules = rules.filter(rule => ruleAppliesToVendor(rule, vendor) && rule.connector !== 'DOCUMENT_ONLY' && !isAgreementRule(rule));
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
    vendor.requirementResults = [...evaluateVendor(vendor, rules), ...agreementResults(vendor, rules, await contractStore.contracts()), ...await workflowRequirementResults(vendor, job.workflowVersion)];
    vendor.recommendation = deriveRecommendation(vendor.requirementResults);
    vendor.recommendationSummary = buildRecommendationSummary(vendor.requirementResults, vendor.recommendation);
    vendor.followUps = refreshFollowUps(vendor, rules);
    vendor.onboardingStatus = vendor.recommendation === 'RECOMMEND_APPROVE' ? 'IN_APPROVAL' : vendor.recommendation === 'AWAITING_EVIDENCE' ? 'DOCUMENTS_PENDING' : 'REVIEW_REQUIRED';
    vendor.workflowVersion = job.workflowVersion;
    vendor.updatedAt = new Date().toISOString();
    vendor.auditTrail.unshift(audit('VERIFICATION_COMPLETED', vendor.recommendationSummary));
    const latest = await vendorStore.vendor(vendor.id);
    if (latest) {
      vendor.personnel = latest.personnel;
      vendor.siteMobilisations = latest.siteMobilisations || [];
      vendor.documents = latest.documents.map(document => vendor.documents.find(item => item.id === document.id && job!.documentIds.includes(item.id)) || document);
      vendor.followUps = vendor.followUps.map(item => {
        const current = latest.followUps.find(existing => existing.id === item.id);
        return current ? { ...item, status: current.status === 'COMPLETED' ? 'COMPLETED' as const : item.status, progressNote: current.progressNote, progressActor: current.progressActor, progressUpdatedAt: current.progressUpdatedAt, evidenceFileIds: current.evidenceFileIds } : item;
      });
      vendor.auditTrail = [...latest.auditTrail.filter(event => !vendor.auditTrail.some(item => item.id === event.id)), ...vendor.auditTrail];
    }
    await vendorStore.saveVendor(vendor);
    const partial = vendor.requirementResults.some(result => ['PENDING_EVIDENCE', 'REVIEW_REQUIRED', 'UNAVAILABLE'].includes(result.status));
    await updateJob(job, partial ? 'PARTIAL' : 'COMPLETED', 100, partial ? 'Verification completed with review tasks.' : 'Verification completed.');
  } catch (error: any) {
    await vendorStore.saveJob({ ...job, stage: 'FAILED', progress: 100, message: 'Verification failed.', error: error?.message || 'Unknown error', updatedAt: new Date().toISOString() });
  }
};

const vendorJobChains = new Map<string, Promise<void>>();
const scheduleVerificationJob = (id: string, vendorId: string) => {
  const previous = vendorJobChains.get(vendorId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => processVerificationJob(id));
  vendorJobChains.set(vendorId, next);
  void next.finally(() => { if (vendorJobChains.get(vendorId) === next) vendorJobChains.delete(vendorId); });
};
const startVerificationJob = async (vendorId: string, documentIds: string[] = []) => {
  const job: VerificationJob = {
    id: crypto.randomUUID(), vendorId, workflowVersion: await workflowStore.version(), stage: 'QUEUED', progress: 0,
    message: 'Verification queued.', documentIds, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await vendorStore.saveJob(job);
  scheduleVerificationJob(job.id, vendorId);
  return job;
};

const prefillVendorDocument = async (entityId: string, input: VendorFileInput, workflowVersion?: number) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Configure and test the Gemini key first. Original files can still be submitted for manual review.');
  const data = Buffer.from(input?.data || '', 'base64');
  if (!data.length || data.length > maxFileSize || !allowedMimeTypes.has(input?.mimeType)) throw new Error('Choose a supported file up to 10 MB.');
  const configuration = await vendorStore.configuration();
  const instruction = await workflowStore.resolve({ module: 'VENDOR', phase: 'EXTRACT', entityId, version: workflowVersion });
  const classification = await workflowStore.resolve({ module: 'VENDOR', phase: 'CLASSIFY', entityId, version: workflowVersion });
  const prompt = `Read this vendor onboarding document for Malaysia. Administrator classification instructions: ${classification?.prompt || ''}. Administrator extraction instructions: ${instruction?.prompt || ''}. Return JSON only: {"documentType":"one of ${vendorDocumentTypes.join(', ')}","legalName":"","registrationNumber":"","categoryName":"","services":[],"contactName":"","email":"","phone":"","address":"","tin":"","msic":"","businessActivity":"","sstNumber":"","tourismTaxNumber":"","confidence":0.0,"sourceReference":"page/section"}. Choose categoryName only from ${configuration.categories.filter(item => item.active).map(item => item.name).join(', ')}. Extract only values actually visible in the source. A director list or paid-up capital alone is not proof of ownership. Missing fields must be empty. Never invent identity or registration numbers.`;
  const officeText = await extractOfficeText(data, input.mimeType);
  if (officeText !== undefined && !officeText.trim()) throw new Error('The document contains no readable text.');
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: prompt }, officeText !== undefined ? { text: officeText } : { inlineData: { mimeType: input.mimeType, data: input.data } }];
  const result = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json' } });
  return parseJsonResponse(result.text || '{}');
};

const activeIntakes = new Set<string>();
const processVendorIntake = async (id: string) => {
  if (activeIntakes.has(id)) return;
  activeIntakes.add(id);
  try {
    let intake = await vendorStore.intake(id);
    if (!intake || intake.stage !== 'QUEUED') return;
    intake.stage = 'EXTRACTING'; intake.progress = 0; intake.message = 'Reading uploaded vendor documents.'; intake.updatedAt = new Date().toISOString();
    await vendorStore.saveIntake(intake);
    const configuration = await vendorStore.configuration();
    const proposed: Partial<CreateVendorInput> = { ...intake.proposed, taxProfile: { tin: '', msic: '', businessActivity: '', sstNumber: '', tourismTaxNumber: '', ...intake.proposed.taxProfile } };
    const conflicts = [...intake.conflicts];
    for (const [index, document] of intake.documents.entries()) {
      if (document.status !== 'QUEUED') continue;
      try {
        const data = await vendorStore.readIntakeUpload(id, document.id);
        const result = await prefillVendorDocument(intake.entityId, { fileName: document.fileName, mimeType: document.mimeType, data: data.toString('base64') }, intake.workflowVersion);
        document.documentType = String(result.documentType || classifyDocument(document.fileName));
        document.sourceReference = String(result.sourceReference || document.fileName);
        document.confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
        document.status = document.confidence >= 0.7 ? 'EXTRACTED' : 'REVIEW_REQUIRED';
        if (document.status === 'REVIEW_REQUIRED') conflicts.push(`${document.fileName}: low-confidence reading; check the original before accepting values.`);
        const merge = (key: 'legalName' | 'registrationNumber' | 'contactName' | 'email' | 'phone' | 'address', value: unknown) => {
          const text = String(value || '').trim(); if (!text) return;
          const prior = String(proposed[key] || '').trim();
          if (prior && prior.toLowerCase() !== text.toLowerCase()) conflicts.push(`${key}: ${document.fileName} conflicts with another document (${document.sourceReference}).`);
          else if (document.status === 'EXTRACTED') proposed[key] = text;
        };
        for (const key of ['legalName', 'registrationNumber', 'contactName', 'email', 'phone', 'address'] as const) merge(key, result[key]);
        for (const key of ['tin', 'msic', 'businessActivity', 'sstNumber', 'tourismTaxNumber'] as const) {
          const text = String(result[key] || '').trim(); if (!text) continue;
          const prior = String(proposed.taxProfile?.[key] || '').trim();
          if (prior && prior.toLowerCase() !== text.toLowerCase()) conflicts.push(`${key}: ${document.fileName} conflicts with another document (${document.sourceReference}).`);
          else if (document.status === 'EXTRACTED') proposed.taxProfile = { ...proposed.taxProfile!, [key]: text };
        }
        const category = configuration.categories.find(item => item.active && item.name.toLowerCase() === String(result.categoryName || '').toLowerCase());
        if (category && document.status === 'EXTRACTED' && !proposed.categoryId) proposed.categoryId = category.id;
        if (Array.isArray(result.services) && document.status === 'EXTRACTED') proposed.services = [...new Set([...(proposed.services || []), ...result.services.map(String).filter(Boolean)])];
      } catch (error) { document.status = 'REVIEW_REQUIRED'; document.error = error instanceof Error ? error.message : 'AI reading unavailable.'; conflicts.push(`${document.fileName}: ${document.error}`); }
      intake.proposed = proposed; intake.conflicts = [...new Set(conflicts)]; intake.progress = Math.round((index + 1) / intake.documents.length * 100); intake.message = `Read ${index + 1} of ${intake.documents.length} file(s).`; intake.updatedAt = new Date().toISOString();
      intake = await vendorStore.saveIntake(intake);
    }
    intake.stage = intake.documents.every(item => item.status === 'EXTRACTED') && !intake.conflicts.length ? 'READY_FOR_REVIEW' : 'PARTIAL';
    intake.progress = 100; intake.message = intake.stage === 'READY_FOR_REVIEW' ? 'Proposed profile is ready for human confirmation.' : 'Originals retained; one or more files or values need manual review.';
    intake.updatedAt = new Date().toISOString(); await vendorStore.saveIntake(intake);
  } catch (error) {
    const intake = await vendorStore.intake(id);
    if (intake) { intake.stage = 'FAILED'; intake.message = error instanceof Error ? error.message : 'Intake failed.'; intake.updatedAt = new Date().toISOString(); await vendorStore.saveIntake(intake); }
  } finally { activeIntakes.delete(id); }
};
const scheduleVendorIntake = (id: string) => setTimeout(() => void processVendorIntake(id), 20);

export const createVendor = async (input: CreateVendorInput, configuration: VendorConfiguration): Promise<Vendor> => {
  const category = configuration.categories.find(item => item.id === input.categoryId && item.active);
  if (!category) throw new Error('Select a valid vendor category.');
  if (!input.legalName?.trim() || !input.registrationNumber?.trim()) throw new Error('Vendor name and registration number are required.');
  const now = new Date().toISOString();
  const vendor: Vendor = {
    id: crypto.randomUUID(), entityId: input.entityId || '', legalName: input.legalName.trim(), registrationNumber: input.registrationNumber.trim().toUpperCase(),
    categoryId: category.id, categoryName: category.name, services: (input.services || []).filter(Boolean), activityTags: input.activityTags || [],
    contactName: input.contactName?.trim() || '', email: input.email?.trim() || '', phone: input.phone?.trim() || '', address: input.address?.trim() || '',
    taxProfile: { tin: String(input.taxProfile?.tin || '').trim(), msic: String(input.taxProfile?.msic || '').trim(), businessActivity: String(input.taxProfile?.businessActivity || '').trim(), sstNumber: String(input.taxProfile?.sstNumber || '').trim(), tourismTaxNumber: String(input.taxProfile?.tourismTaxNumber || '').trim() },
    onboardingStatus: 'DOCUMENTS_PENDING', recommendation: 'AWAITING_EVIDENCE', recommendationSummary: 'Upload the applicable evidence to begin verification.',
    ruleVersion: configuration.activeVersion, workflowVersion: await workflowStore.version(), currentApprovalStage: 0,
    personnel: (input.personnel || []).filter(person => person.name?.trim()).map(person => ({
      id: crypto.randomUUID(), name: person.name.trim(), role: person.role || 'OTHER', identityMasked: maskIdentity(person.identityNumber || ''),
      identityHash: hashIdentity(person.identityNumber || ''), siteAssignment: person.siteAssignment?.trim() || '', status: 'ACTIVE',
    })),
    documents: [], verifications: [], requirementResults: [], followUps: [], approvals: [], entityLinks: [], performanceAssessments: [], performanceEvents: [], siteMobilisations: [],
    auditTrail: [audit('VENDOR_CREATED', `Vendor onboarding created using requirement pack version ${configuration.activeVersion}.`)],
    createdAt: now, updatedAt: now,
  };
  const rules = getActiveRules(configuration, vendor.ruleVersion);
  vendor.requirementResults = [...evaluateVendor(vendor, rules), ...agreementResults(vendor, rules, await contractStore.contracts()), ...await workflowRequirementResults(vendor, vendor.workflowVersion)];
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
  for (const intake of (await vendorStore.intakes()).filter(item => item.stage === 'QUEUED')) scheduleVendorIntake(intake.id);

  app.post('/api/vendors/preflight', async (request, response) => {
    const entityId = String(request.body.entityId || '');
    if (!canWriteEntity(currentUser(request)!, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    try {
      const parsed = await prefillVendorDocument(entityId, request.body.file as VendorFileInput);
      response.json({ ...parsed, sourceFile: request.body.file.fileName, provisional: true });
    } catch (error) { response.status(422).json({ error: `AI could not prefill ${String(request.body.file?.fileName || 'this file')}. ${error instanceof Error ? error.message : 'Review manually.'}` }); }
  });

  app.get('/api/vendor-intakes', async (request, response) => {
    response.json((await vendorStore.intakes()).filter(item => canWriteEntity(currentUser(request)!, item.entityId)));
  });
  app.post('/api/vendor-intakes', async (request, response) => {
    const entityId = String(request.body.entityId || ''); const user = currentUser(request)!;
    if (!canWriteEntity(user, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    const timestamp = new Date().toISOString();
    const intake: VendorIntakeCase = { id: crypto.randomUUID(), entityId, stage: 'UPLOADING', progress: 0, message: 'Upload up to 25 documents, then start background reading.', documents: [], proposed: { entityId, services: [], activityTags: [], personnel: [] }, conflicts: [], workflowVersion: await workflowStore.version(), createdBy: user.name, createdAt: timestamp, updatedAt: timestamp };
    response.status(201).json(await vendorStore.saveIntake(intake));
  });
  app.get('/api/vendor-intakes/:id', async (request, response) => {
    const intake = await vendorStore.intake(request.params.id);
    if (!intake || !canWriteEntity(currentUser(request)!, intake.entityId)) return response.status(404).json({ error: 'Intake not found.' });
    response.json(intake);
  });
  app.post('/api/vendor-intakes/:id/files', async (request, response) => {
    try {
      const intake = await vendorStore.intake(request.params.id);
      if (!intake) return response.status(404).json({ error: 'Intake not found.' });
      if (!canWriteEntity(currentUser(request)!, intake.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
      if (intake.stage !== 'UPLOADING' || intake.documents.length >= 25) throw new Error('This intake is no longer accepting files or has reached 25 files.');
      const input = request.body.file as VendorFileInput; const data = Buffer.from(String(input?.data || ''), 'base64');
      if (!data.length || data.length > maxFileSize || !allowedMimeTypes.has(input?.mimeType)) throw new Error('Choose PDF, Word, spreadsheet, photo, CSV or text up to 10 MB.');
      const sha256 = createHash('sha256').update(data).digest('hex');
      if (intake.documents.some(item => item.sha256 === sha256)) throw new Error('This document is already in the intake.');
      const document = { id: crypto.randomUUID(), fileName: String(input.fileName || 'document').replace(/[/\\]/g, '_'), mimeType: input.mimeType, size: data.length, sha256, documentType: classifyDocument(String(input.fileName || '')), sourceReference: '', confidence: 0, status: 'QUEUED' as const };
      await vendorStore.saveIntakeUpload(intake.id, document.id, data);
      intake.documents.push(document); intake.updatedAt = new Date().toISOString();
      response.status(201).json(await vendorStore.saveIntake(intake));
    } catch (error) { sendError(response, error); }
  });
  app.get('/api/vendor-intakes/:id/files/:documentId', async (request, response) => {
    const intake = await vendorStore.intake(request.params.id);
    if (!intake || !canWriteEntity(currentUser(request)!, intake.entityId)) return response.status(404).json({ error: 'Intake not found.' });
    const document = intake.documents.find(item => item.id === request.params.documentId);
    if (!document) return response.status(404).json({ error: 'Document not found.' });
    response.type(document.mimeType).setHeader('Content-Disposition', `attachment; filename="${document.fileName.replace(/["\r\n]/g, '')}"`).send(await vendorStore.readIntakeUpload(intake.id, document.id));
  });
  app.post('/api/vendor-intakes/:id/process', async (request, response) => {
    try {
      const intake = await vendorStore.intake(request.params.id);
      if (!intake) return response.status(404).json({ error: 'Intake not found.' });
      if (!canWriteEntity(currentUser(request)!, intake.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
      if (intake.stage !== 'UPLOADING' || !intake.documents.length) throw new Error('Upload at least one file before processing.');
      intake.stage = 'QUEUED'; intake.message = 'Queued for background document reading.'; intake.updatedAt = new Date().toISOString();
      await vendorStore.saveIntake(intake); scheduleVendorIntake(intake.id); response.status(202).json(intake);
    } catch (error) { sendError(response, error); }
  });
  app.post('/api/vendor-intakes/:id/commit', async (request, response) => {
    try {
      const intake = await vendorStore.intake(request.params.id);
      if (!intake) return response.status(404).json({ error: 'Intake not found.' });
      if (!canWriteEntity(currentUser(request)!, intake.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
      if (!['READY_FOR_REVIEW', 'PARTIAL'].includes(intake.stage)) throw new Error('Wait for background reading before confirming this intake.');
      const input = request.body as CreateVendorInput;
      if (input.entityId !== intake.entityId) throw new Error('The confirmed vendor entity must match the intake entity.');
      const vendors = await vendorStore.vendors();
      if (vendors.some(item => item.entityId === intake.entityId && normalize(item.registrationNumber) === normalize(input.registrationNumber || ''))) throw new Error('A vendor with this registration number already exists for this entity.');
      const vendor = await createVendor(input, await vendorStore.configuration());
      const documentIds: string[] = [];
      const allowedTypes = new Set([...vendorDocumentTypes, ...(await workflowStore.documents('VENDOR', intake.workflowVersion)).map(item => item.code)]);
      for (const source of intake.documents) {
        const data = await vendorStore.readIntakeUpload(intake.id, source.id);
        const documentId = crypto.randomUUID();
        const storagePath = await vendorStore.saveUpload(vendor.id, documentId, source.fileName, data);
        vendor.documents.push({ id: documentId, fileName: source.fileName, mimeType: source.mimeType, size: source.size, sha256: source.sha256, documentType: allowedTypes.has(source.documentType) ? source.documentType : classifyDocument(source.fileName), uploadedAt: new Date().toISOString(), extractionStatus: 'QUEUED', extractedFields: [], storagePath });
        documentIds.push(documentId);
      }
      vendor.onboardingStatus = 'VERIFYING'; vendor.auditTrail.unshift({ ...audit('VENDOR_INTAKE_COMMITTED', `${intake.documents.length} source document(s) transferred from reviewed intake ${intake.id}; conflicts: ${intake.conflicts.length}.`), actor: currentUser(request)!.name });
      await vendorStore.saveVendor(vendor);
      intake.stage = 'COMMITTED'; intake.vendorId = vendor.id; intake.progress = 100; intake.message = 'Confirmed vendor created; background verification queued.'; intake.updatedAt = new Date().toISOString(); await vendorStore.saveIntake(intake);
      const job = await startVerificationJob(vendor.id, documentIds);
      response.status(201).json({ vendor, job });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendor-checklist-preview', async (request, response) => {
    const entityId = String(request.body.entityId || '');
    if (!entityId || !canReadEntity(currentUser(request)!, entityId)) return response.status(403).json({ error: 'Entity access denied.' });
    const configuration = await vendorStore.configuration();
    const categoryId = String(request.body.categoryId || '');
    const activityTags = Array.isArray(request.body.activityTags) ? request.body.activityTags.map(String) : [];
    const personnel = Array.isArray(request.body.personnel) ? request.body.personnel.filter((item: any) => item && typeof item === 'object').map((item: any) => ({ name: String(item.name || ''), role: String(item.role || '') })) : [];
    const rules = checklistFor(getActiveRules(configuration), { categoryId, activityTags, personnelRoles: personnel.map((item: { role: string }) => item.role) });
    const items: import('../src/vendorTypes.ts').VendorChecklistItem[] = rules.flatMap(rule => {
      const source = isAgreementRule(rule) ? 'CONTRACT' as const : rule.connector === 'LEGAL_SEARCH' ? 'SYSTEM' as const : 'UPLOAD' as const;
      const documentType = source === 'UPLOAD' ? rule.documentType : undefined;
      if (rule.scope === 'COMPANY') return [{ id: rule.id, name: rule.name, documentType, source, scope: rule.scope, blocking: rule.blocking }];
      const targets = rule.personnelRolesAny.length ? personnel.filter((item: { role: string }) => rule.personnelRolesAny.includes(item.role)) : personnel;
      return targets.length ? targets.map((person: { name: string }, index: number) => ({ id: `${rule.id}:${index}`, name: rule.name, documentType, source, scope: rule.scope, subjectName: person.name, blocking: rule.blocking }))
        : [{ id: `${rule.id}:roster`, name: rule.name, documentType, source, scope: rule.scope, subjectName: 'Personnel roster', blocking: rule.blocking }];
    });
    const instruction = await workflowStore.resolve({ module: 'VENDOR', phase: 'VALIDATE', entityId, categoryId });
    for (const type of instruction?.requiredDocumentTypes || []) if (!items.some(item => item.documentType === type)) items.push({ id: `workflow:${type}`, name: `Configured ${type.replaceAll('_', ' ')} evidence`, documentType: type, source: 'UPLOAD', scope: 'COMPANY', blocking: instruction!.blocking });
    response.json({ ruleVersion: configuration.activeVersion, workflowVersion: await workflowStore.version(), items });
  });

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
  app.patch('/api/vendor-config/categories/:id', async (request, response) => {
    try { const configuration = await vendorStore.configuration(); const category = configuration.categories.find(item => item.id === request.params.id); if (!category) return response.status(404).json({ error: 'Category not found.' });
      if (request.body.name !== undefined) { const name = String(request.body.name).trim(); if (!name) throw new Error('Category name is required.'); category.name = name; }
      if (request.body.description !== undefined) category.description = String(request.body.description).trim();
      if (request.body.active !== undefined) category.active = Boolean(request.body.active);
      response.json(await vendorStore.saveConfiguration(configuration));
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
        steps: candidate.steps?.length ? candidate.steps : ['DOCUMENT_CLASSIFICATION', 'STRUCTURED_EXTRACTION', 'IDENTITY_MATCH', 'EXPIRY_CHECK', 'MANUAL_FALLBACK', 'RECOMMENDATION'], active: candidate.active !== false,
      };
      configuration.draftRules.push(newRule);
      response.status(201).json(await vendorStore.saveConfiguration(configuration));
    } catch (error) { sendError(response, error); }
  });
  app.patch('/api/vendor-config/rules/:id', async (request, response) => {
    try { const configuration = await vendorStore.configuration(); const rule = configuration.draftRules.find(item => item.id === request.params.id); if (!rule) return response.status(404).json({ error: 'Draft rule not found.' });
      const fields: Array<keyof VendorRule> = ['name', 'description', 'regulatorySource', 'scope', 'categoryIds', 'activityTagsAny', 'personnelRolesAny', 'documentType', 'requiredFields', 'connector', 'blocking', 'expiryWarningDays', 'followUpSlaDays', 'escalationOwner', 'steps', 'active'];
      for (const field of fields) if (request.body[field] !== undefined) (rule as any)[field] = request.body[field];
      if (!rule.name.trim() || !rule.documentType || !rule.steps.length) throw new Error('Rule name, document and workflow steps are required.');
      response.json(await vendorStore.saveConfiguration(configuration));
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

  app.get('/api/vendors', async (request, response) => {
    await syncVendorAgreementStatus();
    const configuration = await vendorStore.configuration();
    const contracts = await contractStore.contracts();
    response.json(await Promise.all((await vendorStore.vendors()).filter(vendor => canReadEntity(currentUser(request)!, vendor.entityId || '') && (!request.query.entityId || vendor.entityId === request.query.entityId))
      .map(vendor => projectCurrentRequirements(vendor, configuration, contracts))));
  });
  app.get('/api/vendors/:id', async (request, response) => {
    const vendor = await vendorStore.vendor(request.params.id);
    if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
    response.json(await liveVendor(vendor));
  });

  app.patch('/api/vendors/:id/agreement', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const contractId = String(request.body.contractId || '').trim();
      if (contractId && !eligibleVendorContracts(vendor, await contractStore.contracts()).some(contract => contract.id === contractId)) {
        throw new Error('Select a Contract Management agreement linked to this vendor and entity.');
      }
      vendor.agreementContractId = contractId || undefined;
      const configuration = await vendorStore.configuration();
      const projected = await liveVendor(vendor, configuration);
      vendor.requirementResults = projected.requirementResults;
      vendor.recommendation = projected.recommendation;
      vendor.recommendationSummary = projected.recommendationSummary;
      vendor.followUps = refreshFollowUps(vendor, getActiveRules(configuration, vendor.ruleVersion));
      vendor.auditTrail.unshift(audit('VENDOR_AGREEMENT_SELECTED', contractId ? `Governing agreement ${contractId} selected.` : 'Governing agreement selection cleared.'));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors', async (request, response) => {
    try {
      const vendors = await vendorStore.vendors();
      if (vendors.some(item => item.entityId === String(request.body.entityId || '') && normalize(item.registrationNumber) === normalize(request.body.registrationNumber || ''))) throw new Error('A vendor with this registration number already exists for this entity.');
      const vendor = await createVendor(request.body, await vendorStore.configuration());
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });
  app.patch('/api/vendors/:id', async (request, response) => {
    try { const vendor = await vendorStore.vendor(request.params.id); if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const fields: Array<keyof Vendor> = ['legalName', 'registrationNumber', 'categoryId', 'services', 'activityTags', 'contactName', 'email', 'phone', 'address'];
      for (const field of fields) if (request.body[field] !== undefined) (vendor as any)[field] = request.body[field];
      if (request.body.taxProfile !== undefined) vendor.taxProfile = { tin: String(request.body.taxProfile?.tin || '').trim(), msic: String(request.body.taxProfile?.msic || '').trim(), businessActivity: String(request.body.taxProfile?.businessActivity || '').trim(), sstNumber: String(request.body.taxProfile?.sstNumber || '').trim(), tourismTaxNumber: String(request.body.taxProfile?.tourismTaxNumber || '').trim() };
      const configuration = await vendorStore.configuration(); const category = configuration.categories.find(item => item.id === vendor.categoryId && item.active); if (!category) throw new Error('Choose an active vendor category.');
      vendor.categoryName = category.name; vendor.recommendation = 'NEEDS_REVIEW'; vendor.recommendationSummary = 'Vendor profile changed; re-run verification before approval.';
      vendor.auditTrail.unshift(audit('VENDOR_UPDATED', `Profile updated by ${currentUser(request)!.name}; verification is required.`)); vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/personnel', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const user = currentUser(request)!;
      if (!canWriteEntity(user, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const name = String(request.body.name || '').trim();
      const role = String(request.body.role || '').trim();
      if (!name || !role) throw new Error('Worker name and role are required.');
      const person = { id: crypto.randomUUID(), name, role, identityMasked: maskIdentity(String(request.body.identityNumber || '')), identityHash: hashIdentity(String(request.body.identityNumber || '')), siteAssignment: String(request.body.siteAssignment || '').trim(), status: 'ACTIVE' as const };
      vendor.personnel.push(person);
      vendor.auditTrail.unshift({ ...audit('PERSONNEL_ADDED', `${name} added to the vendor roster. Site mobilisation requires reassessment.`), actor: user.name });
      vendor.updatedAt = new Date().toISOString();
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/vendors/:id/personnel/:personId', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const user = currentUser(request)!;
      if (!canWriteEntity(user, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const person = vendor.personnel.find(item => item.id === request.params.personId);
      if (!person) return response.status(404).json({ error: 'Worker not found.' });
      for (const field of ['name', 'role', 'siteAssignment'] as const) if (request.body[field] !== undefined) person[field] = String(request.body[field]).trim();
      if (request.body.status !== undefined) {
        if (!['ACTIVE', 'INACTIVE'].includes(request.body.status)) throw new Error('Select a valid worker status.');
        person.status = request.body.status;
      }
      if (request.body.identityNumber) { person.identityMasked = maskIdentity(String(request.body.identityNumber)); person.identityHash = hashIdentity(String(request.body.identityNumber)); }
      if (!person.name || !person.role) throw new Error('Worker name and role are required.');
      vendor.requirementResults = vendor.requirementResults.filter(result => result.subjectId !== person.id);
      vendor.auditTrail.unshift({ ...audit('PERSONNEL_UPDATED', `${person.name} changed; prior competency results no longer qualify for site approval.`), actor: user.name });
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/site-mobilisations', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const user = currentUser(request)!;
      if (!canWriteEntity(user, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const entity = await contractStore.entity(vendor.entityId || '');
      const siteName = String(request.body.siteName || '').trim();
      if (!siteName || !entity?.sites.some(site => site.toLowerCase() === siteName.toLowerCase())) throw new Error('Select a site configured for this entity.');
      if (vendor.siteMobilisations?.some(site => site.siteName.toLowerCase() === siteName.toLowerCase())) throw new Error('This vendor already has a mobilisation case for the site. Edit its roster instead.');
      const personnelIds = Array.isArray(request.body.personnelIds) ? [...new Set(request.body.personnelIds.map(String))] as string[] : [];
      if (personnelIds.some(id => !vendor.personnel.some(person => person.id === id))) throw new Error('The roster contains an unknown worker.');
      const timestamp = new Date().toISOString();
      const site: VendorSiteMobilisation = { id: crypto.randomUUID(), entityId: vendor.entityId || '', siteName, personnelIds, inductionDocumentIds: {}, decision: 'PENDING', createdAt: timestamp, updatedAt: timestamp };
      vendor.siteMobilisations ||= []; vendor.siteMobilisations.push(site);
      vendor.auditTrail.unshift({ ...audit('SITE_MOBILISATION_CREATED', `${siteName} case created with ${personnelIds.length} named worker(s).`), actor: user.name });
      vendor.updatedAt = timestamp;
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/vendors/:id/site-mobilisations/:siteId', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const site = vendor.siteMobilisations?.find(item => item.id === request.params.siteId);
      if (!site) return response.status(404).json({ error: 'Site mobilisation not found.' });
      const user = currentUser(request)!;
      if (!canWriteEntity(user, site.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
      if (request.body.personnelIds !== undefined) {
        if (!Array.isArray(request.body.personnelIds)) throw new Error('Select a named worker roster.');
        const ids = [...new Set(request.body.personnelIds.map(String))] as string[];
        if (ids.some(id => !vendor.personnel.some(person => person.id === id))) throw new Error('The roster contains an unknown worker.');
        site.personnelIds = ids;
      }
      if (request.body.inductionDocumentIds !== undefined) {
        if (!request.body.inductionDocumentIds || typeof request.body.inductionDocumentIds !== 'object' || Array.isArray(request.body.inductionDocumentIds)) throw new Error('Provide induction evidence per named worker.');
        site.inductionDocumentIds = Object.fromEntries(Object.entries(request.body.inductionDocumentIds).filter(([personId, documentId]) => site.personnelIds.includes(personId) && vendor.documents.some(document => document.id === documentId && document.subjectId === personId && document.documentType === 'SITE_INDUCTION')).map(([personId, documentId]) => [personId, String(documentId)]));
      }
      site.decision = 'PENDING'; site.approvedRosterIds = undefined; site.decisionNotes = undefined; site.decidedAt = undefined; site.updatedAt = new Date().toISOString(); vendor.updatedAt = site.updatedAt;
      vendor.auditTrail.unshift({ ...audit('SITE_MOBILISATION_UPDATED', `${site.siteName} roster or induction evidence changed; approval must be repeated.`), actor: user.name });
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/site-mobilisations/:siteId/decision', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const site = vendor.siteMobilisations?.find(item => item.id === request.params.siteId);
      if (!site) return response.status(404).json({ error: 'Site mobilisation not found.' });
      const user = currentUser(request)!;
      if (!canWriteEntity(user, site.entityId)) return response.status(403).json({ error: 'Entity access denied.' });
      const decision = String(request.body.decision);
      const notes = String(request.body.notes || '').trim();
      if (!['APPROVED', 'REJECTED'].includes(decision) || !notes) throw new Error('Choose a decision and enter reviewer notes.');
      const projected = await liveVendor(vendor);
      const readiness = assessSiteReadiness(projected, site);
      if (decision === 'APPROVED' && readiness.status !== 'READY_FOR_APPROVAL') throw new Error(`Site approval blocked: ${readiness.reasons.join(' ') || 'A prior approval is already recorded.'}`);
      site.decision = decision as 'APPROVED' | 'REJECTED'; site.decisionNotes = notes; site.decisionActor = user.name; site.decidedAt = new Date().toISOString(); site.updatedAt = site.decidedAt;
      site.approvedRosterIds = decision === 'APPROVED' ? [...site.personnelIds] : undefined;
      vendor.auditTrail.unshift({ ...audit('SITE_MOBILISATION_DECIDED', `${site.siteName}: ${decision} for ${site.personnelIds.length} named worker(s). ${notes}`), actor: user.name });
      vendor.updatedAt = site.updatedAt;
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors-bulk', async (request, response) => {
    try {
      const inputs = Array.isArray(request.body.vendors) ? request.body.vendors as CreateVendorInput[] : [];
      if (!inputs.length || inputs.length > 500) throw new Error('Provide between 1 and 500 vendor rows.');
      const configuration = await vendorStore.configuration();
      const existing = await vendorStore.vendors();
      const seen = new Set(existing.map(item => `${item.entityId || ''}:${normalize(item.registrationNumber)}`));
      const created: Vendor[] = [];
      for (const input of inputs) {
        const identifier = normalize(input.registrationNumber || '');
        const key = `${input.entityId || ''}:${identifier}`;
        if (!identifier || seen.has(key)) throw new Error(`Duplicate or missing registration number: ${input.registrationNumber || 'blank'}`);
        seen.add(key);
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
      if (!files.length || files.length > 25) throw new Error('Upload between 1 and 25 files.');
      const allowedDocumentTypes = new Set([...vendorDocumentTypes, ...(await workflowStore.documents('VENDOR')).map(item => item.code)]);
      const prepared = files.map(input => ({ input, data: Buffer.from(input.data || '', 'base64') }));
      for (const { input, data } of prepared) {
        if (!data.length || data.length > maxFileSize) throw new Error(`${input.fileName}: file must be between 1 byte and 10 MB.`);
        if (!allowedMimeTypes.has(input.mimeType)) throw new Error(`${input.fileName}: unsupported file type.`);
      }
      const documentIds: string[] = [];
      for (const { input, data } of prepared) {
        const hash = createHash('sha256').update(data).digest('hex');
        if (vendor.documents.some(document => document.sha256 === hash)) continue;
        const id = crypto.randomUUID();
        const subject = vendor.personnel.find(person => person.id === input.subjectId);
        const storagePath = await vendorStore.saveUpload(vendor.id, id, input.fileName, data);
        vendor.documents.push({
          id, fileName: input.fileName, mimeType: input.mimeType, size: data.length, sha256: hash,
          documentType: input.declaredType && allowedDocumentTypes.has(input.declaredType) ? input.declaredType : classifyDocument(input.fileName),
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

  app.get('/api/vendors/:id/documents/:documentId/download', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor || !canReadEntity(currentUser(request)!, vendor.entityId || '')) return response.status(404).json({ error: 'Vendor not found.' });
      const document = vendor.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      response.download(vendorStore.absoluteUploadPath(document.storagePath), document.fileName);
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/vendors/:id/documents/:documentId/preview', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor || !canReadEntity(currentUser(request)!, vendor.entityId || '')) return response.status(404).json({ error: 'Vendor not found.' });
      const document = vendor.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      const data = await fs.readFile(vendorStore.absoluteUploadPath(document.storagePath));
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Content-Disposition', 'inline');
      response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      const pdf = document.mimeType === 'application/pdf' && data.subarray(0, 5).toString() === '%PDF-';
      const png = document.mimeType === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = document.mimeType === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8;
      if (pdf || png || jpeg) return response.type(document.mimeType).send(data);
      const text = await extractOfficeText(data, document.mimeType);
      if (text === undefined) return response.status(415).type('text/plain').send('Inline preview is unavailable for this file. Download the original to inspect it.');
      return response.type('text/plain; charset=utf-8').send(text || 'No readable text was found in this document. Download the original to inspect it.');
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/vendors/:id/documents/:documentId/fields', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor || !canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(404).json({ error: 'Vendor not found.' });
      const document = vendor.documents.find(item => item.id === request.params.documentId);
      if (!document) return response.status(404).json({ error: 'Document not found.' });
      const fields = Array.isArray(request.body.fields) ? request.body.fields as Array<{ key: string; value: string }> : [];
      document.extractedFields = document.extractedFields.map(field => {
        const correction = fields.find(item => item.key === field.key);
        return correction ? { ...field, value: String(correction.value), confidence: 1, corrected: true } : field;
      });
      if (request.body.ownershipEntries !== undefined) {
        if (!Array.isArray(request.body.ownershipEntries)) throw new Error('Ownership entries must be a list.');
        document.ownershipEntries = parseOwnershipEntries(request.body.ownershipEntries).map(entry => ({ ...entry, corrected: true }));
      }
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
      vendor.requirementResults = [...evaluateVendor(vendor, rules), ...agreementResults(vendor, rules, await contractStore.contracts()), ...vendor.requirementResults.filter(result => result.id.startsWith('workflow:'))];
      vendor.recommendation = deriveRecommendation(vendor.requirementResults);
      vendor.recommendationSummary = buildRecommendationSummary(vendor.requirementResults, vendor.recommendation);
      vendor.followUps = refreshFollowUps(vendor, rules);
      if (!['SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus)) vendor.onboardingStatus = vendor.recommendation === 'RECOMMEND_APPROVE' ? 'IN_APPROVAL' : vendor.recommendation === 'AWAITING_EVIDENCE' ? 'DOCUMENTS_PENDING' : 'REVIEW_REQUIRED';
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
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      if (entityType === 'ASSET') {
        const asset = await assetStore.asset(String(request.body.entityId));
        if (!asset || asset.entityId !== vendor.entityId) throw new Error('Linked asset must exist in the same legal entity as this vendor.');
      }
      const person = personnelId ? vendor.personnel.find(item => item.id === personnelId) : undefined;
      if (relationship === 'OPERATOR') {
        if (!person || person.status !== 'ACTIVE') throw new Error('Select an active qualified operator who will be assigned to this asset.');
        const competencyResults = vendor.requirementResults.filter(result => result.subjectId === person.id && result.blocking);
        if (!competencyResults.length) throw new Error('This person has no configured competency workflow. Add the applicable personnel role and run checks first.');
        if (competencyResults.some(result => !['PASSED', 'WARNING'].includes(result.status) || !!result.expiresAt && result.expiresAt < today())) {
          throw new Error('This operator cannot be assigned while a mandatory competency check is failed, expired, unavailable or awaiting review.');
        }
      }
      vendor.entityLinks = vendor.entityLinks || [];
      const existing = vendor.entityLinks.find(link => link.entityType === entityType && link.entityId === request.body.entityId && link.relationship === relationship);
      if (existing) { existing.personnelId = person?.id; existing.personnelName = person?.name; existing.entityName = String(request.body.entityName); }
      else vendor.entityLinks.push({ id: crypto.randomUUID(), entityType: entityType as 'ASSET' | 'LOCATION', entityId: String(request.body.entityId), entityName: String(request.body.entityName), relationship: relationship as Vendor['entityLinks'][number]['relationship'], personnelId: person?.id, personnelName: person?.name, createdAt: new Date().toISOString() });
      vendor.auditTrail.unshift({ ...audit(existing ? 'ENTITY_LINK_UPDATED' : 'ENTITY_LINKED', `${request.body.entityName} linked as ${relationship}${person ? ` with ${person.name}` : ''}.`), actor: currentUser(request)!.name });
      vendor.updatedAt = new Date().toISOString();
      response.status(201).json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/risk-cases', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const category = String(request.body.category || '') as VendorRiskCase['category'];
      const severity = String(request.body.severity || '') as VendorRiskCase['severity'];
      const title = String(request.body.title || '').trim(); const findings = String(request.body.findings || '').trim();
      const sourceVerificationIds = Array.isArray(request.body.sourceVerificationIds) ? request.body.sourceVerificationIds.map(String) as string[] : [];
      const sourceDocumentIds = Array.isArray(request.body.sourceDocumentIds) ? request.body.sourceDocumentIds.map(String) as string[] : [];
      const sourceEventIds = Array.isArray(request.body.sourceEventIds) ? request.body.sourceEventIds.map(String) as string[] : [];
      if (!['LEGAL_ADVERSE', 'FINANCIAL', 'CONFLICT_OF_INTEREST', 'SAFETY', 'INSURANCE', 'BLACKLIST', 'OTHER'].includes(category) || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) || !title || !findings) throw new Error('Category, severity, title and findings are required.');
      if (!sourceVerificationIds.length && !sourceDocumentIds.length && !sourceEventIds.length) throw new Error('Link at least one verification, uploaded document or measured event to the risk case.');
      if (sourceVerificationIds.some(id => !vendor.verifications.some(item => item.id === id)) || sourceDocumentIds.some(id => !vendor.documents.some(item => item.id === id)) || sourceEventIds.some(id => !(vendor.performanceEvents || []).some(item => item.id === id))) throw new Error('Every source must belong to this vendor.');
      const dueDate = String(request.body.dueDate || addDays(today(), 14));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) throw new Error('Enter a valid follow-up date.');
      const actor = currentUser(request)!; const timestamp = new Date().toISOString();
      const riskCase: VendorRiskCase = { id: crypto.randomUUID(), category, severity, title, findings, sourceVerificationIds, sourceDocumentIds, sourceEventIds, ownerEmail: String(request.body.ownerEmail || actor.email).trim().toLowerCase(), dueDate, status: 'OPEN', createdBy: actor.name, createdAt: timestamp, updatedAt: timestamp };
      vendor.riskCases = [riskCase, ...(vendor.riskCases || [])];
      vendor.followUps.push({ id: crypto.randomUUID(), riskCaseId: riskCase.id, title: `Resolve risk: ${title}`, description: findings, dueDate, owner: riskCase.ownerEmail, status: 'OPEN' });
      vendor.auditTrail.unshift({ ...audit('RISK_CASE_OPENED', `${severity} ${category}: ${title}; sources ${sourceVerificationIds.length + sourceDocumentIds.length + sourceEventIds.length}.`), actor: actor.name });
      vendor.updatedAt = timestamp;
      await vendorStore.saveVendor(vendor);
      response.status(201).json(riskCase);
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/risk-cases/:caseId/decision', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const riskCase = (vendor.riskCases || []).find(item => item.id === request.params.caseId);
      if (!riskCase) return response.status(404).json({ error: 'Risk case not found.' });
      if (riskCase.status !== 'OPEN') throw new Error('This risk case already has a decision.');
      const decision = String(request.body.decision || '') as 'MITIGATED' | 'DISMISSED';
      const reason = String(request.body.reason || '').trim();
      if (!['MITIGATED', 'DISMISSED'].includes(decision) || !reason) throw new Error('Choose mitigation or dismissal and record the evidence-based rationale.');
      const actor = currentUser(request)!; riskCase.status = decision; riskCase.decisionReason = reason; riskCase.decidedBy = actor.name; riskCase.decidedAt = new Date().toISOString(); riskCase.updatedAt = riskCase.decidedAt;
      for (const followUp of vendor.followUps.filter(item => item.riskCaseId === riskCase.id && item.status !== 'COMPLETED')) { followUp.status = 'COMPLETED'; followUp.progressNote = reason; followUp.progressActor = actor.name; followUp.progressUpdatedAt = riskCase.decidedAt; }
      vendor.auditTrail.unshift({ ...audit('RISK_CASE_DECIDED', `${decision}: ${riskCase.title}. ${reason}`), actor: actor.name });
      vendor.updatedAt = riskCase.decidedAt;
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/approval', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      const configuration = await vendorStore.configuration();
      const projected = await liveVendor(vendor, configuration);
      vendor.requirementResults = projected.requirementResults;
      vendor.recommendation = projected.recommendation;
      vendor.recommendationSummary = projected.recommendationSummary;
      const decision = String(request.body.decision || '') as 'APPROVED' | 'CONDITIONAL' | 'REJECTED';
      if (!['APPROVED', 'CONDITIONAL', 'REJECTED'].includes(decision)) throw new Error('Select a valid decision.');
      if (decision === 'APPROVED' && (vendor.recommendation !== 'RECOMMEND_APPROVE' || openBlockingRisks(vendor).length)) throw new Error('Resolve blocking checks and high-severity risk cases before approving this vendor.');
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
      const projected = await liveVendor(vendor);
      vendor.requirementResults = projected.requirementResults;
      vendor.recommendation = projected.recommendation;
      vendor.recommendationSummary = projected.recommendationSummary;
      const status = String(request.body.status || '') as 'SUSPENDED' | 'BLACKLISTED' | 'APPROVED';
      const reason = String(request.body.reason || '').trim();
      if (!['SUSPENDED', 'BLACKLISTED', 'APPROVED'].includes(status)) throw new Error('Select a valid lifecycle action.');
      if (!reason) throw new Error('A reason is required for lifecycle actions.');
      if (status === 'APPROVED' && !['SUSPENDED', 'BLACKLISTED'].includes(vendor.onboardingStatus)) throw new Error('Only a suspended or blacklisted vendor can be reinstated.');
      if (status === 'APPROVED' && (vendor.recommendation !== 'RECOMMEND_APPROVE' || openBlockingRisks(vendor).length)) throw new Error('Resolve blocking checks and high-severity risk cases before reinstating this vendor.');
      vendor.onboardingStatus = status;
      vendor.auditTrail.unshift(audit(status === 'APPROVED' ? 'VENDOR_REINSTATED' : `VENDOR_${status}`, reason));
      vendor.updatedAt = new Date().toISOString();
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/performance-events', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const metric = String(request.body.metric);
      const kind = String(request.body.kind);
      if (!['quality', 'delivery', 'cost', 'service', 'safety', 'compliance'].includes(metric) || !['KPI', 'INCIDENT', 'COMPLAINT', 'CORRECTIVE_ACTION'].includes(kind)) throw new Error('Select a metric and event type.');
      const title = String(request.body.title || '').trim(); const occurredOn = String(request.body.occurredOn || '');
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(Date.parse(`${occurredOn}T00:00:00Z`))) throw new Error('Event title and date are required.');
      const documentIds = Array.isArray(request.body.documentIds) ? [...new Set(request.body.documentIds.map(String))] as string[] : [];
      if (documentIds.some(id => !vendor.documents.some(document => document.id === id))) throw new Error('Evidence document must belong to this vendor.');
      const observedValue = request.body.observedValue === '' || request.body.observedValue === undefined ? undefined : Number(request.body.observedValue);
      const targetValue = request.body.targetValue === '' || request.body.targetValue === undefined ? undefined : Number(request.body.targetValue);
      if (observedValue !== undefined && !Number.isFinite(observedValue) || targetValue !== undefined && !Number.isFinite(targetValue)) throw new Error('Measured values must be numbers.');
      const notes = String(request.body.notes || '').trim();
      if (!notes && !documentIds.length) throw new Error('Add a measured-source note or attach a supporting vendor document.');
      const timestamp = new Date().toISOString();
      const event: VendorPerformanceEvent = { id: crypto.randomUUID(), metric: metric as VendorPerformanceEvent['metric'], kind: kind as VendorPerformanceEvent['kind'], title, occurredOn, siteName: String(request.body.siteName || '').trim(), observedValue, targetValue, unit: String(request.body.unit || '').trim(), notes, documentIds, status: 'OPEN', createdBy: currentUser(request)!.name, createdAt: timestamp, updatedAt: timestamp };
      vendor.performanceEvents ||= []; vendor.performanceEvents.unshift(event);
      vendor.auditTrail.unshift({ ...audit('PERFORMANCE_EVENT_RECORDED', `${event.kind}: ${event.title} (${event.metric})`), actor: currentUser(request)!.name });
      vendor.updatedAt = timestamp; await vendorStore.saveVendor(vendor); response.status(201).json(event);
    } catch (error) { sendError(response, error); }
  });

  app.patch('/api/vendors/:id/performance-events/:eventId', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const event = vendor.performanceEvents?.find(item => item.id === request.params.eventId);
      if (!event) return response.status(404).json({ error: 'Performance event not found.' });
      if (request.body.metric !== undefined) { if (!['quality', 'delivery', 'cost', 'service', 'safety', 'compliance'].includes(request.body.metric)) throw new Error('Invalid metric.'); event.metric = request.body.metric; }
      if (request.body.kind !== undefined) { if (!['KPI', 'INCIDENT', 'COMPLAINT', 'CORRECTIVE_ACTION'].includes(request.body.kind)) throw new Error('Invalid event type.'); event.kind = request.body.kind; }
      if (request.body.title !== undefined) { const title = String(request.body.title).trim(); if (!title) throw new Error('Title is required.'); event.title = title; }
      if (request.body.occurredOn !== undefined) { const date = String(request.body.occurredOn); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Valid event date required.'); event.occurredOn = date; }
      for (const field of ['observedValue', 'targetValue'] as const) if (request.body[field] !== undefined) { const value = request.body[field] === '' || request.body[field] === null ? undefined : Number(request.body[field]); if (value !== undefined && !Number.isFinite(value)) throw new Error('Measured values must be numbers.'); event[field] = value; }
      if (request.body.unit !== undefined) event.unit = String(request.body.unit).trim();
      if (request.body.siteName !== undefined) event.siteName = String(request.body.siteName).trim();
      if (request.body.notes !== undefined) event.notes = String(request.body.notes).trim();
      if (request.body.resolution !== undefined) { event.resolution = String(request.body.resolution).trim(); if (!event.resolution) throw new Error('Resolution note is required.'); event.status = 'RESOLVED'; }
      if (request.body.documentIds !== undefined) {
        if (!Array.isArray(request.body.documentIds)) throw new Error('Document IDs must be a list.');
        const ids = [...new Set(request.body.documentIds.map(String))] as string[];
        if (ids.some(id => !vendor.documents.some(document => document.id === id))) throw new Error('Evidence document must belong to this vendor.');
        event.documentIds = ids;
      }
      if (!event.notes && !event.documentIds.length) throw new Error('Keep a measured-source note or supporting document on the event.');
      event.updatedAt = new Date().toISOString(); vendor.updatedAt = event.updatedAt;
      vendor.auditTrail.unshift({ ...audit('PERFORMANCE_EVENT_UPDATED', `${event.title}: evidence or resolution updated.`), actor: currentUser(request)!.name });
      response.json(await vendorStore.saveVendor(vendor));
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/vendors/:id/performance', async (request, response) => {
    try {
      const vendor = await vendorStore.vendor(request.params.id);
      if (!vendor) return response.status(404).json({ error: 'Vendor not found.' });
      if (!canWriteEntity(currentUser(request)!, vendor.entityId || '')) return response.status(403).json({ error: 'Entity access denied.' });
      const keys = ['quality', 'delivery', 'cost', 'service', 'safety', 'compliance'] as const;
      const scores = request.body.scores || {};
      const weights = request.body.weights || {};
      const totalWeight = keys.reduce((total, key) => total + Number(weights[key] || 0), 0);
      if (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 100) > 0.001 || keys.some(key => !Number.isFinite(Number(weights[key])) || Number(weights[key]) < 0)) throw new Error('Performance weights must be valid and total 100%.');
      if (keys.some(key => !Number.isFinite(Number(scores[key])) || Number(scores[key]) < 0 || Number(scores[key]) > 100)) throw new Error('Scores must be between 0 and 100.');
      const eventIds = Array.isArray(request.body.eventIds) ? [...new Set(request.body.eventIds.map(String))] as string[] : [];
      const events = eventIds.map(id => vendor.performanceEvents?.find(item => item.id === id));
      if (!eventIds.length || events.some(item => !item)) throw new Error('Select at least one recorded KPI or incident as the review basis.');
      const weightedScore = keys.reduce((total, key) => total + Number(scores[key]) * Number(weights[key]) / 100, 0);
      const assessment: VendorPerformanceAssessment = {
        id: crypto.randomUUID(), period: String(request.body.period || new Date().getFullYear()), scores, weights,
        weightedScore: Math.round(weightedScore * 10) / 10, reviewer: currentUser(request)!.name, comments: String(request.body.comments || ''),
        eventIds, eventSnapshot: events.map(item => ({ id: item!.id, metric: item!.metric, kind: item!.kind, title: item!.title, occurredOn: item!.occurredOn, observedValue: item!.observedValue, targetValue: item!.targetValue, unit: item!.unit, notes: item!.notes, documentIds: [...item!.documentIds] })),
        reviewedAt: today(), nextReviewDate: addYear(today()),
      };
      vendor.performanceAssessments.unshift(assessment);
      vendor.auditTrail.unshift(audit('PERFORMANCE_REVIEWED', `Annual performance score recorded: ${assessment.weightedScore}.`));
      vendor.updatedAt = new Date().toISOString();
      await vendorStore.saveVendor(vendor);
      response.status(201).json(assessment);
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/vendor-dashboard', async (request, response) => {
    await syncVendorAgreementStatus();
    const configuration = await vendorStore.configuration();
    const contracts = await contractStore.contracts();
    const allVendors = await Promise.all((await vendorStore.vendors()).map(vendor => projectCurrentRequirements(vendor, configuration, contracts)));
    const { notifications, outbox } = await refreshNotifications(allVendors);
    const vendors = allVendors.filter(vendor => canReadEntity(currentUser(request)!, vendor.entityId || '') && (!request.query.entityId || vendor.entityId === request.query.entityId));
    const visibleIds = new Set(vendors.map(vendor => vendor.id));
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
      highRisk: vendors.filter(vendor => openBlockingRisks(vendor).length > 0).length,
      expiringSoon,
      overdueActions: vendors.reduce((total, vendor) => total + vendor.followUps.filter(item => item.status === 'OVERDUE').length, 0),
      annualReviewsDue,
      sitesReady: vendors.reduce((total, vendor) => total + (vendor.siteMobilisations || []).filter(site => site.readinessStatus === 'APPROVED').length, 0),
      sitesBlocked: vendors.reduce((total, vendor) => total + (vendor.siteMobilisations || []).filter(site => site.readinessStatus === 'BLOCKED').length, 0),
      notifications: notifications.filter(item => visibleIds.has(item.vendorId)).slice(0, 20), outbox: currentUser(request)?.role === 'GROUP_ADMIN' ? outbox.filter(item => visibleIds.has(item.vendorId)).slice(0, 20) : [],
    });
  });

  app.get('/api/vendor-notifications', async (request, response) => {
    const visibleIds = new Set((await vendorStore.vendors()).filter(vendor => canReadEntity(currentUser(request)!, vendor.entityId || '')).map(vendor => vendor.id));
    response.json((await vendorStore.notifications()).filter(item => visibleIds.has(item.vendorId)));
  });
  app.get('/api/vendor-email-outbox', async (_request, response) => response.json(await vendorStore.outbox()));

  for (const job of (await vendorStore.jobs()).filter(item => !['COMPLETED', 'PARTIAL', 'FAILED'].includes(item.stage)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) scheduleVerificationJob(job.id, job.vendorId);
};
