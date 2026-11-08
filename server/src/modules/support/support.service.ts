import type { Types } from 'mongoose';
import {
  FAQ_CATEGORIES, MAX_CONTACTS_PER_GROUP, MAX_FAQS,
  type FaqItem, type SupportContact, type SupportContacts,
  type createContactBodySchema, type createFaqBodySchema, type listFaqsQuerySchema,
  type updateContactBodySchema, type updateFaqBodySchema,
} from '@spacebasic/shared';
import type { z } from 'zod';
import { errors } from '../../core/http/errors';
import { audit } from '../../core/audit/audit';
import { FaqModel, SupportContactModel, type FaqDoc, type SupportContactDoc } from './support.models';

// Support / Help (docs/api.md "Support"). Reads for every signed-in role; writes for support:manage (admins).
// Everything is scoped by the caller's institutionId: another institution's contact or FAQ is a plain 404.

type Ctx = Express.AuthContext;
interface Meta { requestId?: string }

function toContact(c: SupportContactDoc): SupportContact {
  return { id: String(c._id), group: c.group, label: c.label, phone: c.phone ?? null, email: c.email ?? null, hours: c.hours ?? null, order: c.order };
}

function toFaq(f: FaqDoc): FaqItem {
  return { id: String(f._id), question: f.question, answer: f.answer, category: f.category, order: f.order, published: f.published };
}

const categoryRank = (c: FaqDoc['category']) => FAQ_CATEGORIES.indexOf(c);

// ---------------------------------------------------------------------------------------------------------
// contacts

export async function listContacts(ctx: Ctx): Promise<SupportContacts> {
  const rows = await SupportContactModel.find({ institutionId: ctx.institutionId }).sort({ order: 1, _id: 1 }).lean();
  const all = rows.map(toContact);
  return { hostelOffice: all.filter((c) => c.group === 'hostel_office'), spacebasic: all.filter((c) => c.group === 'spacebasic') };
}

/** New entries go to the end of their group or category unless a position is given. */
const after = (last: { order: number } | null) => (last ? last.order + 1 : 1);

async function assertGroupHasRoom(institutionId: Types.ObjectId, group: SupportContactDoc['group']) {
  if ((await SupportContactModel.countDocuments({ institutionId, group })) >= MAX_CONTACTS_PER_GROUP) {
    throw errors.conflict(`A group can have at most ${MAX_CONTACTS_PER_GROUP} contacts.`, { group: `At most ${MAX_CONTACTS_PER_GROUP} contacts` });
  }
}

export async function createContact(ctx: Ctx, body: z.output<typeof createContactBodySchema>, meta: Meta): Promise<SupportContact> {
  const { institutionId } = ctx;
  await assertGroupHasRoom(institutionId, body.group);
  const order = body.order ?? (after(await SupportContactModel.findOne({ institutionId, group: body.group }, { order: 1 }).sort({ order: -1 }).lean()));
  const doc = await SupportContactModel.create({
    institutionId, group: body.group, label: body.label, phone: body.phone ?? null, email: body.email ?? null, hours: body.hours ?? null, order,
  });
  await audit({ institutionId, actorId: ctx.userId, action: 'support.contact_create', targetType: 'support_contact', targetId: doc._id, meta: { group: doc.group }, requestId: meta.requestId });
  return toContact(doc.toObject());
}

export async function updateContact(ctx: Ctx, id: string, body: z.output<typeof updateContactBodySchema>, meta: Meta): Promise<SupportContact> {
  const { institutionId } = ctx;
  const doc = await SupportContactModel.findOne({ institutionId, _id: id });
  if (!doc) throw errors.notFound('There is no such contact.');
  const changed: string[] = [];
  if (body.group !== undefined && body.group !== doc.group) {
    await assertGroupHasRoom(institutionId, body.group);
    // Moving to another group without a position: go to the end of that group.
    if (body.order === undefined) {
      doc.order = after(await SupportContactModel.findOne({ institutionId, group: body.group }, { order: 1 }).sort({ order: -1 }).lean());
      changed.push('order');
    }
  }
  for (const key of ['group', 'label', 'phone', 'email', 'hours', 'order'] as const) {
    const v = body[key];
    if (v === undefined || v === doc[key]) continue;
    doc.set(key, v);
    changed.push(key);
  }
  if (!doc.phone && !doc.email) throw errors.validation({ phone: 'Add a phone number or an email address' });
  if (changed.length) {
    await doc.save();
    await audit({ institutionId, actorId: ctx.userId, action: 'support.contact_update', targetType: 'support_contact', targetId: doc._id, meta: { changed }, requestId: meta.requestId });
  }
  return toContact(doc.toObject());
}

export async function deleteContact(ctx: Ctx, id: string, meta: Meta): Promise<void> {
  const { institutionId } = ctx;
  const deleted = await SupportContactModel.findOneAndDelete({ institutionId, _id: id }).lean();
  if (!deleted) throw errors.notFound('There is no such contact.');
  await audit({ institutionId, actorId: ctx.userId, action: 'support.contact_delete', targetType: 'support_contact', targetId: deleted._id, meta: { group: deleted.group, label: deleted.label }, requestId: meta.requestId });
}

// ---------------------------------------------------------------------------------------------------------
// FAQ

/** Readers get published entries only; drafts need support:manage (checked in the route). */
export async function listFaqs(ctx: Ctx, q: z.output<typeof listFaqsQuerySchema>): Promise<FaqItem[]> {
  const filter: Record<string, unknown> = { institutionId: ctx.institutionId };
  if (!q.includeUnpublished) filter.published = true;
  if (q.category) filter.category = q.category;
  const rows = await FaqModel.find(filter).sort({ order: 1, _id: 1 }).limit(MAX_FAQS).lean();
  // Category display order (leave, tickets, announcements, signing in, other), then each entry's position.
  // Array.prototype.sort is stable, so the database order holds inside a category.
  return rows.sort((a, b) => categoryRank(a.category) - categoryRank(b.category)).map(toFaq);
}

export async function createFaq(ctx: Ctx, body: z.output<typeof createFaqBodySchema>, meta: Meta): Promise<FaqItem> {
  const { institutionId } = ctx;
  if ((await FaqModel.countDocuments({ institutionId })) >= MAX_FAQS) {
    throw errors.conflict(`An institution can have at most ${MAX_FAQS} questions.`);
  }
  const order = body.order ?? (after(await FaqModel.findOne({ institutionId, category: body.category }, { order: 1 }).sort({ order: -1 }).lean()));
  const doc = await FaqModel.create({ institutionId, question: body.question, answer: body.answer, category: body.category, order, published: body.published });
  await audit({ institutionId, actorId: ctx.userId, action: 'support.faq_create', targetType: 'faq', targetId: doc._id, meta: { category: doc.category, published: doc.published }, requestId: meta.requestId });
  return toFaq(doc.toObject());
}

export async function updateFaq(ctx: Ctx, id: string, body: z.output<typeof updateFaqBodySchema>, meta: Meta): Promise<FaqItem> {
  const { institutionId } = ctx;
  const doc = await FaqModel.findOne({ institutionId, _id: id });
  if (!doc) throw errors.notFound('There is no such question.');
  const changed: string[] = [];
  if (body.category !== undefined && body.category !== doc.category && body.order === undefined) {
    doc.order = after(await FaqModel.findOne({ institutionId, category: body.category }, { order: 1 }).sort({ order: -1 }).lean());
    changed.push('order');
  }
  for (const key of ['question', 'answer', 'category', 'order', 'published'] as const) {
    const v = body[key];
    if (v === undefined || v === doc[key]) continue;
    doc.set(key, v);
    changed.push(key);
  }
  if (changed.length) {
    await doc.save();
    await audit({ institutionId, actorId: ctx.userId, action: 'support.faq_update', targetType: 'faq', targetId: doc._id, meta: { changed }, requestId: meta.requestId });
  }
  return toFaq(doc.toObject());
}

export async function deleteFaq(ctx: Ctx, id: string, meta: Meta): Promise<void> {
  const { institutionId } = ctx;
  const deleted = await FaqModel.findOneAndDelete({ institutionId, _id: id }).lean();
  if (!deleted) throw errors.notFound('There is no such question.');
  await audit({ institutionId, actorId: ctx.userId, action: 'support.faq_delete', targetType: 'faq', targetId: deleted._id, meta: { category: deleted.category }, requestId: meta.requestId });
}
