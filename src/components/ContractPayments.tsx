import { useState } from 'react';
import { toast } from 'sonner';
import type { Contract, ContractPaymentMilestone } from '../contractTypes';
import { useContracts } from '../context/ContractContext';

const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
const blank = (contract: Contract): Partial<ContractPaymentMilestone> => ({
  entityId: contract.primaryEntityId, title: '', direction: 'PAYABLE', amount: 0, currency: contract.currency || 'MYR',
  dueDate: '', ownerName: contract.owners.monitoringOwnerName, ownerEmail: contract.owners.monitoringOwnerEmail,
});

export function ContractPayments({ contract }: { contract: Contract }) {
  const { entities, createPayment, updatePayment, decidePayment, reconcilePayment } = useContracts();
  const [form, setForm] = useState<Partial<ContractPaymentMilestone>>(blank(contract));
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const save = async () => {
    setBusy(true);
    try {
      if (editingId) await updatePayment(contract.id, editingId, form);
      else await createPayment(contract.id, form);
      toast.success(editingId ? 'Payment milestone updated.' : 'Payment milestone added.');
      setEditingId(undefined); setForm(blank(contract));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save payment.'); }
    finally { setBusy(false); }
  };
  const decision = async (payment: ContractPaymentMilestone, value: 'SETTLED' | 'WAIVED') => {
    if (!notes[payment.id]?.trim()) return toast.error(value === 'SETTLED' ? 'Enter settlement evidence.' : 'Enter a waiver rationale.');
    setBusy(true);
    try { await decidePayment(contract.id, payment.id, value, notes[payment.id]); toast.success(`Payment ${value.toLowerCase()}.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to record payment decision.'); }
    finally { setBusy(false); }
  };
  const reconcile = async (payment: ContractPaymentMilestone) => {
    if (!references[payment.id]?.trim() || !notes[payment.id]?.trim()) return toast.error('Enter a bank/ledger reference and reconciliation note.');
    setBusy(true);
    try { await reconcilePayment(contract.id, payment.id, references[payment.id], notes[payment.id]); toast.success('Manual reconciliation recorded.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to reconcile payment.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <p className="text-sm text-slate-500">Track contractual amounts and due dates here. Settlement and manual reconciliation are separate audited decisions; no ERP status is inferred.</p>
    <div className="space-y-3">{(contract.paymentMilestones || []).map(payment => {
      const due = payment.status === 'OPEN' && payment.dueDate < new Date().toISOString().slice(0, 10) ? 'OVERDUE' : payment.status;
      return <div key={payment.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-blue-950">{payment.title}</div><div className="mt-1 text-xs text-slate-500">{payment.direction} · {payment.currency} {payment.amount.toLocaleString()} · due {payment.dueDate} · {payment.ownerName}</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{due}</span>{!['SETTLED', 'WAIVED'].includes(payment.status) && <button onClick={() => { setEditingId(payment.id); setForm(payment); }} className="text-xs font-bold text-blue-700">Edit</button>}</div></div>
        {payment.status === 'SETTLED' ? <div className="mt-3 text-xs text-emerald-700">Settlement: {payment.settlementEvidence} · {payment.reconciliationStatus === 'RECONCILED' ? `Reconciled to ${payment.reconciliationReference}` : 'Manual reconciliation pending'}</div> : payment.status === 'WAIVED' ? <div className="mt-3 text-xs text-amber-700">Waived: {payment.settlementEvidence}</div> : null}
        {!['WAIVED'].includes(payment.status) && payment.reconciliationStatus !== 'RECONCILED' && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
          {payment.status === 'SETTLED' && <input className={field} value={references[payment.id] || ''} onChange={event => setReferences(current => ({ ...current, [payment.id]: event.target.value }))} placeholder="Bank or ledger reference" />}
          <input className={field} value={notes[payment.id] || ''} onChange={event => setNotes(current => ({ ...current, [payment.id]: event.target.value }))} placeholder={payment.status === 'SETTLED' ? 'Reconciliation note' : 'Settlement evidence or waiver rationale'} />
          <div className="flex gap-2">{payment.status === 'SETTLED' ? <button disabled={busy} onClick={() => reconcile(payment)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Reconcile</button> : <><button disabled={busy} onClick={() => decision(payment, 'SETTLED')} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white">Settle</button><button disabled={busy} onClick={() => decision(payment, 'WAIVED')} className="rounded-lg border px-3 py-2 text-xs font-bold">Waive</button></>}</div>
        </div>}
      </div>;
    })}{!contract.paymentMilestones?.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No structured payment milestones yet.</div>}</div>
    <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4"><h3 className="mb-3 font-bold text-blue-950">{editingId ? 'Edit milestone' : 'Add payment milestone'}</h3><div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="text-xs font-bold">Milestone</span><input className={field} value={form.title || ''} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="e.g. Progress claim 2" /></label>
      <label><span className="text-xs font-bold">Direction</span><select className={field} value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as ContractPaymentMilestone['direction'] })}><option value="PAYABLE">Payable</option><option value="RECEIVABLE">Receivable</option></select></label>
      <label><span className="text-xs font-bold">Responsible entity</span><select className={field} value={form.entityId} disabled={!!editingId} onChange={event => setForm({ ...form, entityId: event.target.value })}>{entities.filter(entity => [contract.primaryEntityId, ...contract.coveredEntityIds].includes(entity.id)).map(entity => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></label>
      <label><span className="text-xs font-bold">Amount</span><input type="number" min="0.01" step="0.01" className={field} value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} /></label>
      <label><span className="text-xs font-bold">Due date</span><input type="date" className={field} value={form.dueDate || ''} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></label>
      <label><span className="text-xs font-bold">Owner name</span><input className={field} value={form.ownerName || ''} onChange={event => setForm({ ...form, ownerName: event.target.value })} /></label>
      <label><span className="text-xs font-bold">Owner email</span><input type="email" className={field} value={form.ownerEmail || ''} onChange={event => setForm({ ...form, ownerEmail: event.target.value })} /></label>
      <label><span className="text-xs font-bold">Invoice reference</span><input className={field} value={form.invoiceReference || ''} onChange={event => setForm({ ...form, invoiceReference: event.target.value })} /></label>
      <label><span className="text-xs font-bold">Source clause</span><select className={field} value={form.sourceClauseId || ''} disabled={!!editingId} onChange={event => setForm({ ...form, sourceClauseId: event.target.value || undefined })}><option value="">Manual milestone</option>{contract.clauses.map(clause => <option key={clause.id} value={clause.id}>{clause.clauseNumber} · {clause.heading}</option>)}</select></label>
    </div><div className="mt-3 flex justify-end gap-2">{editingId && <button onClick={() => { setEditingId(undefined); setForm(blank(contract)); }} className="px-3 py-2 text-xs font-bold">Cancel edit</button>}<button disabled={busy} onClick={save} className="rounded-lg bg-blue-800 px-4 py-2 text-xs font-bold text-white">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add milestone'}</button></div></div>
  </div>;
}
