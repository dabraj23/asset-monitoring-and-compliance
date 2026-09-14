import { useMemo, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { useContracts } from '../context/ContractContext';

interface Hit { id: string; contractId: string; contractTitle: string; kind: 'Clause' | 'Obligation' | 'Document'; title: string; excerpt: string; source: string; documentId?: string; status?: string }

/** Searches only entity-authorised contract records already returned by the API. */
export function ContractKnowledgeSearch({ openContract }: { openContract: (id: string) => void }) {
  const { contracts } = useContracts();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const hits = useMemo(() => {
    if (needle.length < 2) return [];
    const items: Hit[] = [];
    for (const contract of contracts) {
      for (const clause of contract.clauses.filter(item => !item.supersededByClauseId && item.reviewStatus !== 'REJECTED')) {
        const source = contract.documents.find(document => document.id === clause.sourceDocumentId);
        const haystack = `${clause.heading} ${clause.clauseNumber} ${clause.clauseType} ${clause.sourceText} ${clause.sourceReference}`.toLocaleLowerCase();
        if (haystack.includes(needle)) items.push({ id: clause.id, contractId: contract.id, contractTitle: contract.title, kind: 'Clause', title: `${clause.clauseNumber || 'Unnumbered'} · ${clause.heading}`, excerpt: clause.sourceText, source: clause.sourceReference || source?.fileName || 'Source reference pending', documentId: source?.id, status: clause.reviewStatus });
      }
      for (const obligation of contract.obligations) {
        if (`${obligation.title} ${obligation.action} ${obligation.evidenceRequired}`.toLocaleLowerCase().includes(needle)) {
          const clause = contract.clauses.find(item => item.id === obligation.clauseId);
          items.push({ id: obligation.id, contractId: contract.id, contractTitle: contract.title, kind: 'Obligation', title: obligation.title, excerpt: obligation.action, source: clause?.sourceReference || 'Manual obligation', documentId: clause?.sourceDocumentId, status: obligation.status });
        }
      }
      for (const document of contract.documents) {
        if (`${document.fileName} ${document.documentType}`.toLocaleLowerCase().includes(needle)) items.push({ id: document.id, contractId: contract.id, contractTitle: contract.title, kind: 'Document', title: document.fileName, excerpt: document.documentType.replaceAll('_', ' '), source: `Uploaded ${document.uploadedAt.slice(0, 10)}`, documentId: document.id, status: document.extractionStatus });
      }
    }
    return items.slice(0, 50);
  }, [contracts, needle]);
  return <section className="mb-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2 font-bold text-blue-950"><FileSearch className="h-5 w-5 text-blue-700" />Search contract knowledge</div>
    <p className="mt-1 text-xs text-slate-500">Searches current extracted clauses, obligations and filenames in contracts you are permitted to see. Check review status and open the source before relying on AI-extracted text.</p>
    <input aria-label="Search contract clauses and obligations" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a term, commitment, clause or document" />
    {needle.length >= 2 && <div className="mt-3 space-y-2" role="status">{hits.map(hit => <div key={`${hit.contractId}-${hit.kind}-${hit.id}`} className="rounded-xl border border-slate-100 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><button className="text-left font-bold text-blue-800 underline" onClick={() => openContract(hit.contractId)}>{hit.title}</button><span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{hit.kind} · {hit.status?.replaceAll('_', ' ')}</span></div><div className="mt-1 text-xs text-slate-500">{hit.contractTitle} · {hit.source}</div><div className="mt-2 line-clamp-3 text-slate-700">{hit.excerpt}</div>{hit.documentId && <a className="mt-2 inline-block text-xs font-bold text-blue-700 underline" href={`/api/contracts/${hit.contractId}/documents/${hit.documentId}/download`}>Download source file</a>}</div>)}{!hits.length && <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No matching extracted contract knowledge. Try a different term or inspect the original files.</div>}{hits.length === 50 && <div className="text-xs text-slate-500">Showing the first 50 matches; narrow your search for more precise results.</div>}</div>}
  </section>;
}
