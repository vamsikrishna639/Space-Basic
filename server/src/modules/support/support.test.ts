import request from 'supertest';
import type { Express } from 'express';
import type { Types } from 'mongoose';
import { MAX_CONTACTS_PER_GROUP, MAX_FAQS, type Role } from '@spacebasic/shared';
import { createApp } from '../../app';
import { useTestDb } from '../../test/db';
import { CONSENT, makeInstitution, makeUser } from '../../test/factory';
import { AuditModel } from '../../core/audit/audit';
import { InstitutionModel } from '../institutions/institution.model';
import { UserModel } from '../users/user.model';
import { seedDevData, seedDevSupport } from '../../scripts/seed-data';
import { FaqModel, SupportContactModel } from './support.models';

useTestDb();

let app: Express;
beforeEach(() => { app = createApp(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function signIn(institutionId: Types.ObjectId, role: Role = 'student') {
  const email = `${role}${++seq}@example.com`;
  await makeUser(institutionId, { email, roles: [role] });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123', consent: CONSENT });
  return res.body.accessToken as string;
}

async function contact(institutionId: Types.ObjectId, o: Partial<{ group: 'hostel_office' | 'spacebasic'; label: string; order: number; phone: string | null; email: string | null }> = {}) {
  return SupportContactModel.create({ institutionId, group: o.group ?? 'hostel_office', label: o.label ?? 'Office', phone: o.phone === undefined ? '+919000000101' : o.phone, email: o.email ?? null, order: o.order ?? 1 });
}

async function faq(institutionId: Types.ObjectId, o: Partial<{ category: 'leave' | 'tickets' | 'announcements' | 'signing_in' | 'other'; question: string; order: number; published: boolean }> = {}) {
  return FaqModel.create({ institutionId, category: o.category ?? 'leave', question: o.question ?? 'Q?', answer: 'A.', order: o.order ?? 1, published: o.published ?? true });
}

describe('GET /support/contacts', () => {
  it('groups contacts by hostel office and SpaceBasic, in order, for every role', async () => {
    const inst = await makeInstitution();
    await contact(inst._id, { label: 'Reception', order: 2, phone: '+919000000102' });
    await contact(inst._id, { label: 'Warden office', order: 1, email: 'office@example.com' });
    await contact(inst._id, { group: 'spacebasic', label: 'SpaceBasic support', phone: null, email: 'support@spacebasic.example' });
    for (const role of ['student', 'warden', 'institution_admin'] as const) {
      const res = await request(app).get('/api/v1/support/contacts').set(auth(await signIn(inst._id, role)));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        hostelOffice: [
          { id: expect.any(String), group: 'hostel_office', label: 'Warden office', phone: '+919000000101', email: 'office@example.com', hours: null, order: 1 },
          { id: expect.any(String), group: 'hostel_office', label: 'Reception', phone: '+919000000102', email: null, hours: null, order: 2 },
        ],
        spacebasic: [
          { id: expect.any(String), group: 'spacebasic', label: 'SpaceBasic support', phone: null, email: 'support@spacebasic.example', hours: null, order: 1 },
        ],
      });
    }
    expect((await request(app).get('/api/v1/support/contacts')).status).toBe(401);
  });

  it("never shows another institution's contacts", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    await contact(b._id, { label: 'B office' });
    const res = await request(app).get('/api/v1/support/contacts').set(auth(await signIn(a._id)));
    expect(res.body).toEqual({ hostelOffice: [], spacebasic: [] });
  });
});

describe('managing contacts', () => {
  it('admins create a contact; the phone is stored as E.164 and it goes to the end of its group', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    await contact(inst._id, { order: 4 });
    const res = await request(app).post('/api/v1/support/contacts').set(auth(admin))
      .send({ group: 'hostel_office', label: '  Night desk ', phone: '98765 43210', email: 'Night.Desk@Example.com', hours: 'Open 24 hours' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), group: 'hostel_office', label: 'Night desk', phone: '+919876543210', email: 'night.desk@example.com', hours: 'Open 24 hours', order: 5 });
    expect(await AuditModel.countDocuments({ institutionId: inst._id, action: 'support.contact_create' })).toBe(1);
    // the first one in an empty group starts at 1
    const first = await request(app).post('/api/v1/support/contacts').set(auth(admin)).send({ group: 'spacebasic', label: 'Help desk', email: 'help@example.com' });
    expect(first.body.order).toBe(1);
  });

  it('rejects a contact without a phone or email, and other bad input', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const post = (body: object) => request(app).post('/api/v1/support/contacts').set(auth(admin)).send(body);
    const none = await post({ group: 'hostel_office', label: 'Office' });
    expect(none.status).toBe(400);
    expect(none.body.error.fields).toEqual({ phone: 'Add a phone number or an email address' });
    expect((await post({ group: 'hostel_office', label: 'Office', phone: '12345' })).body.error.fields).toHaveProperty('phone');
    expect((await post({ group: 'hostel_office', label: 'Office', email: 'not-an-email' })).body.error.fields).toHaveProperty('email');
    expect((await post({ group: 'canteen', label: 'Office', email: 'a@example.com' })).body.error.fields).toHaveProperty('group');
    expect((await post({ group: 'hostel_office', label: 'x'.repeat(81), email: 'a@example.com' })).body.error.fields).toHaveProperty('label');
    expect(await SupportContactModel.countDocuments({ institutionId: inst._id })).toBe(0);
  });

  it('caps each group', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    for (let i = 1; i <= MAX_CONTACTS_PER_GROUP; i++) await contact(inst._id, { order: i });
    const res = await request(app).post('/api/v1/support/contacts').set(auth(admin)).send({ group: 'hostel_office', label: 'One more', email: 'a@example.com' });
    expect(res.status).toBe(409);
    // the other group still has room
    expect((await request(app).post('/api/v1/support/contacts').set(auth(admin)).send({ group: 'spacebasic', label: 'Help', email: 'a@example.com' })).status).toBe(201);
  });

  it('PATCH changes fields, can clear one, but never leaves a contact unreachable', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const c = await contact(inst._id, { email: 'office@example.com' });
    const patch = (body: object) => request(app).patch(`/api/v1/support/contacts/${c._id}`).set(auth(admin)).send(body);

    const ok = await patch({ label: 'Warden office', phone: null, hours: 'Mon–Sat, 9 AM – 6 PM' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ label: 'Warden office', phone: null, email: 'office@example.com', hours: 'Mon–Sat, 9 AM – 6 PM' });

    const unreachable = await patch({ email: null });
    expect(unreachable.status).toBe(400);
    expect(unreachable.body.error.fields).toEqual({ phone: 'Add a phone number or an email address' });
    expect((await SupportContactModel.findOne({ institutionId: inst._id, _id: c._id }).lean())?.email).toBe('office@example.com');

    expect((await patch({})).status).toBe(400);
    // moving to another group puts it at the end of that group
    await contact(inst._id, { group: 'spacebasic', label: 'Help desk', order: 3 });
    expect((await patch({ group: 'spacebasic' })).body).toMatchObject({ group: 'spacebasic', order: 4 });
    expect((await patch({ group: 'hostel_office', order: 9 })).body).toMatchObject({ group: 'hostel_office', order: 9 });
    const audits = await AuditModel.find({ institutionId: inst._id, action: 'support.contact_update' }).sort({ at: 1 }).lean();
    expect(audits.map((a) => a.meta?.changed)).toEqual([['label', 'phone', 'hours'], ['order', 'group'], ['group', 'order']]);
  });

  it('DELETE removes a contact; a second delete is 404', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const c = await contact(inst._id);
    expect((await request(app).delete(`/api/v1/support/contacts/${c._id}`).set(auth(admin))).status).toBe(204);
    expect((await request(app).delete(`/api/v1/support/contacts/${c._id}`).set(auth(admin))).status).toBe(404);
    expect(await AuditModel.countDocuments({ institutionId: inst._id, action: 'support.contact_delete' })).toBe(1);
    expect((await request(app).delete('/api/v1/support/contacts/not-an-id').set(auth(admin))).status).toBe(400);
  });

  it('students and wardens cannot write (403)', async () => {
    const inst = await makeInstitution();
    const c = await contact(inst._id);
    for (const role of ['student', 'warden'] as const) {
      const t = await signIn(inst._id, role);
      expect((await request(app).post('/api/v1/support/contacts').set(auth(t)).send({ group: 'hostel_office', label: 'X', email: 'x@example.com' })).status).toBe(403);
      expect((await request(app).patch(`/api/v1/support/contacts/${c._id}`).set(auth(t)).send({ label: 'X' })).status).toBe(403);
      expect((await request(app).delete(`/api/v1/support/contacts/${c._id}`).set(auth(t))).status).toBe(403);
    }
    expect((await SupportContactModel.findOne({ institutionId: inst._id, _id: c._id }).lean())?.label).toBe('Office');
  });

  it("an admin gets 404 for another institution's contact, which stays unchanged", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    const admin = await signIn(a._id, 'institution_admin');
    const theirs = await contact(b._id, { label: 'B office' });
    expect((await request(app).patch(`/api/v1/support/contacts/${theirs._id}`).set(auth(admin)).send({ label: 'Mine now' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/support/contacts/${theirs._id}`).set(auth(admin))).status).toBe(404);
    expect((await SupportContactModel.findOne({ institutionId: b._id, _id: theirs._id }).lean())?.label).toBe('B office');
  });
});

describe('GET /support/faqs', () => {
  it('shows published questions only, in category display order then position', async () => {
    const inst = await makeInstitution();
    await faq(inst._id, { category: 'signing_in', question: 'S1' });
    await faq(inst._id, { category: 'leave', question: 'L2', order: 2 });
    await faq(inst._id, { category: 'tickets', question: 'T1' });
    await faq(inst._id, { category: 'leave', question: 'L1', order: 1 });
    await faq(inst._id, { category: 'other', question: 'Draft', published: false });
    const student = await signIn(inst._id);
    const res = await request(app).get('/api/v1/support/faqs').set(auth(student));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.map((f: { question: string }) => f.question)).toEqual(['L1', 'L2', 'T1', 'S1']);
    expect(res.body[0]).toEqual({ id: expect.any(String), question: 'L1', answer: 'A.', category: 'leave', order: 1, published: true });

    const leave = await request(app).get('/api/v1/support/faqs?category=leave').set(auth(student));
    expect(leave.body.map((f: { question: string }) => f.question)).toEqual(['L1', 'L2']);
    expect((await request(app).get('/api/v1/support/faqs?category=mess').set(auth(student))).status).toBe(400);
  });

  it('drafts are listed only for managers', async () => {
    const inst = await makeInstitution();
    await faq(inst._id, { question: 'Live' });
    await faq(inst._id, { question: 'Draft', order: 2, published: false });
    for (const role of ['student', 'warden'] as const) {
      expect((await request(app).get('/api/v1/support/faqs?includeUnpublished=true').set(auth(await signIn(inst._id, role)))).status).toBe(403);
    }
    const admin = await signIn(inst._id, 'institution_admin');
    const all = await request(app).get('/api/v1/support/faqs?includeUnpublished=true').set(auth(admin));
    expect(all.body.map((f: { question: string; published: boolean }) => [f.question, f.published])).toEqual([['Live', true], ['Draft', false]]);
    expect((await request(app).get('/api/v1/support/faqs').set(auth(admin))).body).toHaveLength(1);
    expect((await request(app).get('/api/v1/support/faqs?includeUnpublished=yes').set(auth(admin))).status).toBe(400);
  });

  it("never shows another institution's questions", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    await faq(b._id, { question: 'B only' });
    expect((await request(app).get('/api/v1/support/faqs').set(auth(await signIn(a._id)))).body).toEqual([]);
  });
});

describe('managing FAQs', () => {
  it('create, unpublish (hidden from students), edit and delete', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const student = await signIn(inst._id);
    const created = await request(app).post('/api/v1/support/faqs').set(auth(admin))
      .send({ question: ' How do I apply for leave? ', answer: 'Open Leave Manager.', category: 'leave' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), question: 'How do I apply for leave?', answer: 'Open Leave Manager.', category: 'leave', order: 1, published: true });
    const id = created.body.id as string;
    const studentSees = async () => (await request(app).get('/api/v1/support/faqs').set(auth(student))).body.length;
    expect(await studentSees()).toBe(1);

    expect((await request(app).patch(`/api/v1/support/faqs/${id}`).set(auth(admin)).send({ published: false })).body.published).toBe(false);
    expect(await studentSees()).toBe(0);
    const edited = await request(app).patch(`/api/v1/support/faqs/${id}`).set(auth(admin)).send({ answer: 'Tap "Apply for leave".', category: 'other', published: true });
    expect(edited.body).toMatchObject({ answer: 'Tap "Apply for leave".', category: 'other', order: 1, published: true });
    expect((await request(app).patch(`/api/v1/support/faqs/${id}`).set(auth(admin)).send({})).status).toBe(400);

    expect((await request(app).delete(`/api/v1/support/faqs/${id}`).set(auth(admin))).status).toBe(204);
    expect((await request(app).delete(`/api/v1/support/faqs/${id}`).set(auth(admin))).status).toBe(404);
    const actions = (await AuditModel.find({ institutionId: inst._id, action: /^support\.faq_/ }).sort({ at: 1 }).lean()).map((a) => a.action);
    expect(actions).toEqual(['support.faq_create', 'support.faq_update', 'support.faq_update', 'support.faq_delete']);
  });

  it('validates the body and the length limits', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    const post = (body: object) => request(app).post('/api/v1/support/faqs').set(auth(admin)).send(body);
    expect((await post({ question: 'Q?', answer: 'A.' })).body.error.fields).toHaveProperty('category');
    expect((await post({ question: 'x'.repeat(201), answer: 'A.', category: 'leave' })).body.error.fields).toHaveProperty('question');
    expect((await post({ question: 'Q?', answer: 'x'.repeat(4001), category: 'leave' })).body.error.fields).toHaveProperty('answer');
    expect((await post({ question: 'Q?', answer: '   ', category: 'leave' })).body.error.fields).toHaveProperty('answer');
    expect((await post({ question: 'Q?', answer: 'x'.repeat(4000), category: 'leave' })).status).toBe(201);
  });

  it('caps the number of questions per institution', async () => {
    const inst = await makeInstitution();
    const admin = await signIn(inst._id, 'institution_admin');
    await FaqModel.insertMany(Array.from({ length: MAX_FAQS }, (_, i) => ({ institutionId: inst._id, question: `Q${i}`, answer: 'A.', category: 'other', order: i + 1, published: true })));
    expect((await request(app).post('/api/v1/support/faqs').set(auth(admin)).send({ question: 'Q?', answer: 'A.', category: 'leave' })).status).toBe(409);
  });

  it("students and wardens cannot write; another institution's question is 404", async () => {
    const a = await makeInstitution('A University');
    const b = await makeInstitution('B University');
    const mine = await faq(a._id);
    for (const role of ['student', 'warden'] as const) {
      const t = await signIn(a._id, role);
      expect((await request(app).post('/api/v1/support/faqs').set(auth(t)).send({ question: 'Q?', answer: 'A.', category: 'leave' })).status).toBe(403);
      expect((await request(app).patch(`/api/v1/support/faqs/${mine._id}`).set(auth(t)).send({ published: false })).status).toBe(403);
      expect((await request(app).delete(`/api/v1/support/faqs/${mine._id}`).set(auth(t))).status).toBe(403);
    }
    const theirs = await faq(b._id, { question: 'B only' });
    const admin = await signIn(a._id, 'institution_admin');
    expect((await request(app).patch(`/api/v1/support/faqs/${theirs._id}`).set(auth(admin)).send({ published: false })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/support/faqs/${theirs._id}`).set(auth(admin))).status).toBe(404);
    expect((await FaqModel.findOne({ institutionId: b._id, _id: theirs._id }).lean())?.published).toBe(true);
  });
});

describe('module gate', () => {
  it('answers 404 when the institution has the support module switched off', async () => {
    const inst = await makeInstitution();
    const student = await signIn(inst._id);
    await InstitutionModel.updateOne({ _id: inst._id }, { $pull: { enabledModules: 'support' } });
    expect((await request(app).get('/api/v1/support/contacts').set(auth(student))).status).toBe(404);
    expect((await request(app).get('/api/v1/support/faqs').set(auth(student))).status).toBe(404);
  });
});

describe('dev seed', () => {
  it('adds fake contacts and FAQs (one draft) once', async () => {
    await seedDevData();
    const inst = await InstitutionModel.findOne({ slug: 'presidency-university' }).lean();
    const student = await UserModel.findOne({ institutionId: inst!._id, email: 'arjun.rao@example.com' }).lean();
    expect(student).not.toBeNull();
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'arjun.rao@example.com', password: 'Student@2026', consent: CONSENT });
    const t = login.body.accessToken as string;
    const contacts = (await request(app).get('/api/v1/support/contacts').set(auth(t))).body;
    expect(contacts.hostelOffice.map((c: { label: string }) => c.label)).toEqual(['West block warden office', 'Hostel reception']);
    expect(contacts.spacebasic).toHaveLength(1);
    const faqs = (await request(app).get('/api/v1/support/faqs').set(auth(t))).body as { category: string }[];
    expect(faqs).toHaveLength(6);
    expect([...new Set(faqs.map((f) => f.category))]).toEqual(['leave', 'tickets', 'announcements', 'signing_in']);
    expect(await FaqModel.countDocuments({ institutionId: inst!._id, published: false })).toBe(1);
    expect(await seedDevSupport(inst!._id)).toEqual({ contacts: 0, faqs: 0 });
  });
});
