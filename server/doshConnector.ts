import { createHash } from 'crypto';
import type { ExternalVerification, Vendor, VendorDocument, VendorRule } from '../src/vendorTypes.ts';

const defaultApiBase = 'https://data-mykkp.dosh.gov.my/api-dashboard/api/semakan';
const personnelSearchUrl = 'https://mykkp.dosh.gov.my/myKKP/#/home/semakan-oyk';
const companySearchUrl = 'https://mykkp.dosh.gov.my/myKKP/#/home/semakan-fyk';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface DoshPersonRecord {
  nama?: string;
  noDaftar?: string;
  ttamat?: string;
  individuID?: string;
  description?: string;
  negeriMajikan?: string;
}

interface DoshCompanyRecord {
  namaFYK?: string;
  noDaftarTK?: string;
  noDaftarFYK?: string;
  tlulus?: string;
  ttamat?: string;
  JenisFYK?: string;
  kodNegeriFYK?: string;
  negeriTK?: string;
}

interface DoshResponse<T> {
  status_code?: string | number;
  status?: string;
  records?: number;
  return_set_01_data?: T[];
}

interface VerifyDoshInput {
  vendor: Vendor;
  rule: VendorRule;
  subjectId?: string;
  fetchImpl?: FetchLike;
  apiBase?: string;
}

const normalize = (value = '') => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeDate = (value = '') => value ? value.slice(0, 10) : '';
const field = (document: VendorDocument | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const value = document?.extractedFields.find(item => item.key === key)?.value?.trim();
    if (value) return value;
  }
  return '';
};
const hashIdentityValue = (value: string) => createHash('sha256').update(value.toUpperCase()).digest('hex');
const identityHashCandidates = (value = '') => {
  const compact = value.replace(/[^a-z0-9]/gi, '');
  if (!compact) return [];
  const candidates = new Set([hashIdentityValue(compact), hashIdentityValue(value.replace(/\s+/g, ''))]);
  if (/^\d{12}$/.test(compact)) candidates.add(hashIdentityValue(`${compact.slice(0, 6)}-${compact.slice(6, 8)}-${compact.slice(8)}`));
  return [...candidates];
};
const daysUntil = (date: string) => {
  const target = new Date(`${normalizeDate(date)}T00:00:00`);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - current.getTime()) / 86_400_000);
};

const personCategoryCodes = (person: Vendor['personnel'][number]) => {
  const roles = new Set([person.role, ...(person.complianceRoles || [])]);
  const codes: string[] = [];
  if (roles.has('CRANE_OPERATOR')) codes.push('OYKOKren');
  if (roles.has('SCAFFOLD_OPERATOR')) codes.push('OYKPP');
  if (roles.has('BOILER_OPERATOR')) codes.push('OYKJStim', 'OYKDES');
  if (codes.length) return [...new Set(codes)];
  return ['ALL'];
};

const apiRequest = async <T>(path: string, body: Record<string, unknown>, fetchImpl: FetchLike, apiBase: string): Promise<T[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(`${apiBase.replace(/\/$/, '')}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DOSH returned HTTP ${response.status}.`);
    const data = await response.json() as DoshResponse<T>;
    if (String(data.status_code) !== '200' || data.status !== 'success' || !Array.isArray(data.return_set_01_data)) {
      throw new Error('DOSH returned an unexpected response.');
    }
    return data.return_set_01_data;
  } finally {
    clearTimeout(timeout);
  }
};

const baseResult = (rule: VendorRule, subjectId: string | undefined, sourceUrl: string): Omit<ExternalVerification, 'status' | 'matchStatus' | 'summary'> => ({
  id: crypto.randomUUID(),
  ruleId: rule.id,
  subjectId,
  connector: rule.connector,
  authority: 'Department of Occupational Safety and Health (DOSH) / MyKKP',
  sourceUrl,
  checkedAt: new Date().toISOString(),
  citations: [{ title: 'DOSH MyKKP public verification directory', url: sourceUrl }],
});

const unavailable = (rule: VendorRule, subjectId: string | undefined, sourceUrl: string, error: unknown): ExternalVerification => ({
  ...baseResult(rule, subjectId, sourceUrl),
  status: 'UNAVAILABLE',
  matchStatus: 'UNAVAILABLE',
  summary: 'The live DOSH registry could not be reached. Approval remains blocked pending a retry or manual verification.',
  limitation: error instanceof Error ? error.message : 'DOSH public registry request failed.',
});

const finishMatch = (
  rule: VendorRule,
  subjectId: string | undefined,
  sourceUrl: string,
  officialName: string,
  registrationNumber: string,
  scope: string,
  validFrom: string,
  validUntil: string,
  evidenceExpiry: string,
): ExternalVerification => {
  const common = {
    ...baseResult(rule, subjectId, sourceUrl),
    matchStatus: 'MATCH' as const,
    officialName,
    registrationNumber,
    scope,
    validFrom: normalizeDate(validFrom) || undefined,
    validUntil: normalizeDate(validUntil) || undefined,
  };
  if (!validUntil) {
    return { ...common, status: 'REVIEW_REQUIRED', matchStatus: 'REVIEW_REQUIRED', summary: 'The DOSH record matched, but the public result did not include a validity end date.', limitation: 'A reviewer must confirm current validity in MyKKP.' };
  }
  if (evidenceExpiry && normalizeDate(evidenceExpiry) !== normalizeDate(validUntil)) {
    return { ...common, status: 'FAILED', summary: `The DOSH record matched, but its official expiry (${normalizeDate(validUntil)}) conflicts with the uploaded evidence (${normalizeDate(evidenceExpiry)}).` };
  }
  const remaining = daysUntil(validUntil);
  if (remaining < 0) return { ...common, status: 'FAILED', summary: `The DOSH registration matched but expired on ${normalizeDate(validUntil)}.` };
  if (remaining <= rule.expiryWarningDays) return { ...common, status: 'WARNING', summary: `The DOSH registration matched and is valid, but expires in ${remaining} day(s) on ${normalizeDate(validUntil)}.` };
  return { ...common, status: 'PASSED', summary: `Live DOSH verification matched the official name, registration, competency scope and validity through ${normalizeDate(validUntil)}.` };
};

const verifyPerson = async ({ vendor, rule, subjectId, fetchImpl, apiBase }: Required<Pick<VerifyDoshInput, 'vendor' | 'rule' | 'fetchImpl' | 'apiBase'>> & Pick<VerifyDoshInput, 'subjectId'>): Promise<ExternalVerification> => {
  const sourceUrl = personnelSearchUrl;
  const person = vendor.personnel.find(item => item.id === subjectId);
  const evidence = vendor.documents.find(document => document.documentType === rule.documentType && document.subjectId === subjectId);
  if (!person) return unavailable(rule, subjectId, sourceUrl, new Error('The personnel record no longer exists.'));

  const evidenceName = field(evidence, 'personName');
  const certificateNumber = field(evidence, 'certificateNumber', 'registrationNumber') || person.doshRegistrationNumber || '';
  const expectedScope = field(evidence, 'competencyScope') || person.competencyScope || '';
  const evidenceExpiry = field(evidence, 'expiryDate');
  if (evidenceName && normalize(evidenceName) !== normalize(person.name)) {
    return { ...baseResult(rule, subjectId, sourceUrl), status: 'FAILED', matchStatus: 'NO_MATCH', summary: 'The person name extracted from the DOSH certificate does not match the assigned personnel record.' };
  }

  try {
    const records = (await Promise.all(personCategoryCodes(person).map(jenisOYK => apiRequest<DoshPersonRecord>(
      'get_semakan_oyk',
      { jenisOYK, kategori: certificateNumber ? 'noDaftar' : 'nama', search: certificateNumber || person.name, page: 1, rows: 50 },
      fetchImpl,
      apiBase,
    )))).flat();
    const unique = [...new Map(records.map(record => [`${normalize(record.noDaftar)}:${normalize(record.nama)}`, record])).values()];
    const evidenceMatches = unique.filter(record => normalize(record.nama) === normalize(person.name)
      && (!certificateNumber || normalize(record.noDaftar) === normalize(certificateNumber)));
    const identityMatches = person.identityHash
      ? evidenceMatches.filter(record => identityHashCandidates(record.individuID).includes(person.identityHash))
      : evidenceMatches;

    if (!identityMatches.length) {
      const reason = evidenceMatches.length && person.identityHash
        ? 'A DOSH registration matched the supplied name and certificate number, but the official identity did not match the personnel record.'
        : 'No exact DOSH record matched the supplied person name, certificate number and required competency category.';
      return { ...baseResult(rule, subjectId, sourceUrl), status: 'FAILED', matchStatus: 'NO_MATCH', summary: reason };
    }
    if (identityMatches.length > 1) {
      return { ...baseResult(rule, subjectId, sourceUrl), status: 'REVIEW_REQUIRED', matchStatus: 'MULTIPLE', summary: 'Multiple exact DOSH competency records matched. A reviewer must select the applicable registration.', limitation: 'The public registry returned more than one exact candidate.' };
    }
    const match = identityMatches[0];
    if (expectedScope && match.description && !normalize(match.description).includes(normalize(expectedScope)) && !normalize(expectedScope).includes(normalize(match.description))) {
      return {
        ...baseResult(rule, subjectId, sourceUrl), status: 'FAILED', matchStatus: 'NO_MATCH', officialName: match.nama,
        registrationNumber: match.noDaftar, scope: match.description, validUntil: normalizeDate(match.ttamat),
        summary: `The DOSH record matched the person, but the official competency scope (${match.description}) does not match the declared scope (${expectedScope}).`,
      };
    }
    return finishMatch(rule, subjectId, sourceUrl, match.nama || person.name, match.noDaftar || certificateNumber, match.description || '', '', match.ttamat || '', evidenceExpiry);
  } catch (error) {
    return unavailable(rule, subjectId, sourceUrl, error);
  }
};

const verifyCompany = async ({ vendor, rule, fetchImpl, apiBase }: Required<Pick<VerifyDoshInput, 'vendor' | 'rule' | 'fetchImpl' | 'apiBase'>>): Promise<ExternalVerification> => {
  const sourceUrl = companySearchUrl;
  const evidence = vendor.documents.find(document => document.documentType === rule.documentType && !document.subjectId);
  const evidenceName = field(evidence, 'companyName');
  const registrationNumber = field(evidence, 'registrationNumber', 'certificateNumber');
  const evidenceExpiry = field(evidence, 'expiryDate');
  if (evidenceName && normalize(evidenceName) !== normalize(vendor.legalName)) {
    return { ...baseResult(rule, undefined, sourceUrl), status: 'FAILED', matchStatus: 'NO_MATCH', summary: 'The company name extracted from the DOSH certificate does not match the vendor profile.' };
  }

  try {
    const records = await apiRequest<DoshCompanyRecord>('get_semakan_fyk', {
      kodNegeri: '00',
      kategori: registrationNumber ? 'noDaftarFYK' : 'namaFYK',
      search: registrationNumber || vendor.legalName,
      page: 1,
      rows: 50,
      semakanJenisFYKID: '1',
    }, fetchImpl, apiBase);
    const matches = records.filter(record => normalize(record.namaFYK) === normalize(vendor.legalName)
      && (!registrationNumber || normalize(record.noDaftarFYK) === normalize(registrationNumber)));
    if (!matches.length) {
      return { ...baseResult(rule, undefined, sourceUrl), status: 'FAILED', matchStatus: 'NO_MATCH', summary: 'No exact DOSH competent-company record matched the supplied company name and FYK registration number.' };
    }
    if (matches.length > 1 && !registrationNumber) {
      return { ...baseResult(rule, undefined, sourceUrl), status: 'REVIEW_REQUIRED', matchStatus: 'MULTIPLE', summary: 'The company has multiple DOSH FYK registrations. Add the certificate number so the applicable scope can be confirmed.', limitation: 'More than one live company registration matched by name.' };
    }
    const match = matches[0];
    return finishMatch(rule, undefined, sourceUrl, match.namaFYK || vendor.legalName, match.noDaftarFYK || registrationNumber, match.JenisFYK || '', match.tlulus || '', match.ttamat || '', evidenceExpiry);
  } catch (error) {
    return unavailable(rule, undefined, sourceUrl, error);
  }
};

export const verifyDoshRecord = async ({ vendor, rule, subjectId, fetchImpl = fetch, apiBase = process.env.DOSH_PUBLIC_API_BASE || defaultApiBase }: VerifyDoshInput): Promise<ExternalVerification> => {
  if (rule.connector === 'DOSH_PERSONNEL') return verifyPerson({ vendor, rule, subjectId, fetchImpl, apiBase });
  if (rule.connector === 'DOSH_COMPANY') return verifyCompany({ vendor, rule, fetchImpl, apiBase });
  throw new Error(`Unsupported DOSH connector: ${rule.connector}`);
};
