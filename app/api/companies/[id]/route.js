import { NextResponse } from 'next/server';
import { getCompany, saveCompany, addEvent, addLearning } from '@/lib/store';
import { resumeCompany } from '@/lib/pipeline';
import { sendEmail } from '@/lib/send';
import { editRate } from '@/lib/ui';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Human-gate actions on one company.
export async function POST(req, { params }) {
  const id = Number(params.id);
  const body = await req.json();
  const company = await getCompany(id);
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const at = new Date().toISOString();
  const log = (entry) => (company.trail = [...(company.trail || []), { stage: 'review', at, by: 'reviewer', ...entry }]);

  try {
    switch (body.action) {
      case 'resume': {
        let contact = null;
        if (body.contact?.email) {
          const c = body.contact;
          if (!c.first_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) throw new Error('Contact needs a first name and a valid email.');
          contact = { first_name: c.first_name.trim(), last_name: (c.last_name || '').trim(), title: (c.title || '').trim(), email: c.email.trim() };
        }
        await addEvent({ kind: contact ? 'contact_provided' : 'override_qualify', company_id: id, company: company.name, actor: 'reviewer' });
        const saved = await resumeCompany(id, { contact });
        return NextResponse.json({ status: saved.status, reason: saved.status_reason });
      }
      case 'drop': {
        log({ key: 'override', name: 'Dropped by reviewer', result: 'fail', note: body.note || null });
        company.status = 'dropped';
        company.status_reason = `dropped by reviewer${body.note ? `: ${body.note}` : ''}`;
        await saveCompany(company);
        await addEvent({ kind: 'override_drop', company_id: id, company: company.name, actor: 'reviewer', note: body.note || null });
        return NextResponse.json({ status: 'dropped' });
      }
      case 'save': {
        if (!company.draft) throw new Error('No draft to save.');
        company.draft = { ...company.draft, subject: body.subject, body: body.body };
        await saveCompany(company);
        return NextResponse.json({ ok: true });
      }
      case 'send': {
        if (!company.draft || !company.contact) throw new Error('No draft to send.');
        const subject = String(body.subject || company.draft.subject);
        const text = String(body.body || company.draft.body);
        const sent = await sendEmail({ subject, body: text, contact: company.contact, company });
        const rate = editRate(company.draft.original?.body, text);
        company.draft = { ...company.draft, subject, body: text };
        company.sent = { ...sent, auto: false, subject, body: text, edit_rate: rate };
        company.status = 'sent';
        company.status_reason = null;
        log({ key: 'send', name: 'Sent by reviewer', result: 'pass', note: `edit rate ${Math.round(rate * 100)}%${body.learning ? ` · lesson: ${body.learning}` : ''}` });
        await saveCompany(company);
        await addEvent({ kind: 'draft_sent', company_id: id, company: company.name, actor: 'reviewer', note: `edit rate ${Math.round(rate * 100)}%` });
        if (body.learning && String(body.learning).trim()) {
          await addLearning(String(body.learning).trim());
          await addEvent({ kind: 'learning_added', company_id: id, company: company.name, actor: 'reviewer', note: String(body.learning).trim().slice(0, 80) });
        }
        return NextResponse.json({ status: 'sent', edit_rate: rate });
      }
      case 'discard': {
        log({ key: 'override', name: 'Draft discarded', result: 'fail', note: body.note || null });
        company.status = 'dropped';
        company.status_reason = `draft discarded by reviewer${body.note ? `: ${body.note}` : ''}`;
        await saveCompany(company);
        await addEvent({ kind: 'draft_discarded', company_id: id, company: company.name, actor: 'reviewer', note: body.note || null });
        if (body.learning && String(body.learning).trim()) await addLearning(String(body.learning).trim());
        return NextResponse.json({ status: 'dropped' });
      }
      case 'to_review': {
        log({ key: 'override', name: 'Sent back to review', result: 'unknown', note: body.note || 'reviewer disagreed with the drop' });
        company.status = 'review';
        company.status_reason = `reopened by reviewer (was: ${company.status_reason || 'dropped'})`;
        if (company.qualification) company.qualification = { ...company.qualification, verdict: 'review' };
        await saveCompany(company);
        await addEvent({ kind: 'override_reopen', company_id: id, company: company.name, actor: 'reviewer' });
        return NextResponse.json({ status: 'review' });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
