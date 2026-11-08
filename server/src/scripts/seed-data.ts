import mongoose from 'mongoose';
import { roomCodeFor, type FaqCategory, type NotificationType, type Role, type SupportContactGroup } from '@spacebasic/shared';
import { env } from '../config/env';
import { hashPassword } from '../core/security/password';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { FloorModel, HostelModel, RoomModel } from '../modules/hostel/hostel.models';
import { UserModel } from '../modules/users/user.model';
import { NotificationModel } from '../modules/notifications/notification.model';
import { createNotification } from '../modules/notifications/notifications.service';
import { FaqModel, SupportContactModel } from '../modules/support/support.models';

/**
 * DEVELOPMENT SEED: FAKE data only (docs/schemas.md §3). Refuses to run in production.
 * The passwords below are throwaway local-development credentials, printed at every checkpoint.
 */
export const DEV_USERS: { role: Role; fullName: string; email: string; phone: string; password: string; roomCode?: string }[] = [
  { role: 'student', fullName: 'Arjun Kumar Rao', email: 'arjun.rao@example.com', phone: '+919000000001', password: 'Student@2026', roomCode: 'CS240' },
  { role: 'warden', fullName: 'Meera Nair', email: 'meera.nair@example.com', phone: '+919000000002', password: 'Warden@2026' },
  { role: 'institution_admin', fullName: 'Rahul Verma', email: 'rahul.verma@example.com', phone: '+919000000003', password: 'Admin@2026' },
  { role: 'super_admin', fullName: 'Space Basic Admin', email: 'admin@spacebasic.example', phone: '+919000000004', password: 'Super@2026' },
];

// Placeholder hostel layout (decisions.md: fake until the user confirms the real ranges).
const FLOORS = [
  { code: 'CF', name: 'First floor', order: 1, roomNumberMin: 101, roomNumberMax: 200 },
  { code: 'CS', name: 'Second floor', order: 2, roomNumberMin: 201, roomNumberMax: 300 },
  { code: 'CT', name: 'Third floor', order: 3, roomNumberMin: 301, roomNumberMax: 400 },
];

export async function seedDevData(opts: { reset?: boolean } = {}): Promise<void> {
  if (env.isProd) throw new Error('Refusing to seed: NODE_ENV=production');
  if (opts.reset) await mongoose.connection.dropDatabase();
  const existing = await InstitutionModel.findOne({ slug: 'presidency-university' }, { _id: 1 }).lean();
  if (existing) {
    const added = await seedDevNotifications(existing._id);
    const support = await seedDevSupport(existing._id);
    const topUps = [
      added ? `sample notifications for ${added} user(s)` : '',
      support.contacts ? `${support.contacts} support contacts` : '',
      support.faqs ? `${support.faqs} FAQs` : '',
    ].filter(Boolean);
    console.log(`seed: demo institution already exists${topUps.length ? `; added ${topUps.join(', ')}` : ''} (use \`npm run seed -- --reset\` to start over)`);
    return;
  }

  const inst = await InstitutionModel.create({ name: 'Presidency University', slug: 'presidency-university', timezone: 'Asia/Kolkata' });
  const institutionId = inst._id;
  const hostel = await HostelModel.create({ institutionId, name: 'West', code: 'W', order: 1 });
  const roomIds = new Map<string, mongoose.Types.ObjectId>();
  for (const f of FLOORS) {
    const floor = await FloorModel.create({ institutionId, hostelId: hostel._id, bedsPerRoom: 3, ...f });
    const rooms = [];
    for (let n = f.roomNumberMin; n <= f.roomNumberMax; n++) {
      rooms.push({ institutionId, hostelId: hostel._id, floorId: floor._id, number: n, code: roomCodeFor(f.code, n), beds: 3 });
    }
    for (const r of await RoomModel.insertMany(rooms)) roomIds.set(r.code, r._id);
  }
  for (const u of DEV_USERS) {
    await UserModel.create({
      institutionId,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      passwordHash: await hashPassword(u.password),
      roles: [u.role],
      roomId: u.roomCode ? roomIds.get(u.roomCode) : null,
    });
  }
  await seedDevNotifications(institutionId);
  await seedDevSupport(institutionId);
  console.log(`seed: created "${inst.name}", hostel West (3 floors, ${roomIds.size} rooms), ${DEV_USERS.length} users, sample notifications, support contacts and FAQs`);
}

/**
 * FAKE sample notifications of every Phase 1 type (SPEC.md Phase 1 scope: only "Attendance Marked" is created
 * by the system; the leave and announcement ones exist as dev samples until those modules are built).
 * Added only for dev users who have none yet, so re-running the seed is safe. Returns how many users got them.
 */
export async function seedDevNotifications(institutionId: mongoose.Types.ObjectId): Promise<number> {
  const day = 24 * 3600 * 1000;
  const at = (daysAgo: number, h: number, m: number) => {
    const d = new Date(Date.now() - daysAgo * day);
    d.setHours(h, m, 0, 0);
    return d;
  };
  // Spread over yesterday and the two days before (never in the future, whatever time the seed runs);
  // the two from three days ago are already read.
  const samples: { type: NotificationType; at: Date; read: boolean; body: string }[] = [
    { type: 'attendance_marked', at: at(1, 19, 24), read: false, body: 'Your attendance for tonight was recorded at the West block.' },
    { type: 'announcement_new', at: at(1, 18, 5), read: false, body: 'Hostel day is on Saturday. Details are on the notice board.' },
    { type: 'leave_approved', at: at(2, 16, 40), read: false, body: 'Your leave from 28 Oct to 30 Oct was approved.' },
    { type: 'leave_partially_approved', at: at(2, 11, 12), read: false, body: 'Your warden approved your leave. It now needs the office.' },
    { type: 'attendance_marked', at: at(3, 21, 2), read: true, body: 'Your attendance for tonight was recorded at the West block.' },
    { type: 'leave_submitted', at: at(3, 9, 30), read: true, body: 'Your leave request was sent for approval.' },
  ];
  let users = 0;
  for (const u of DEV_USERS) {
    const user = await UserModel.findOne({ institutionId, email: u.email }, { _id: 1 }).lean();
    if (!user || (await NotificationModel.exists({ institutionId, userId: user._id }))) continue;
    for (const s of samples) {
      const n = await createNotification({ institutionId, userId: user._id, type: s.type, body: s.body, createdAt: s.at });
      if (s.read) await NotificationModel.updateOne({ institutionId, _id: n.id }, { $set: { readAt: s.at } });
    }
    users++;
  }
  return users;
}

/**
 * FAKE Help-screen content: hostel office and SpaceBasic contacts, and a few FAQs per category (one of them an
 * unpublished draft, which students never see). Each part is added only when the institution has none yet.
 */
export async function seedDevSupport(institutionId: mongoose.Types.ObjectId): Promise<{ contacts: number; faqs: number }> {
  const contacts: { group: SupportContactGroup; label: string; phone: string | null; email: string | null; hours: string | null }[] = [
    { group: 'hostel_office', label: 'West block warden office', phone: '+919000000101', email: 'west.office@example.com', hours: 'Mon–Sat, 9 AM – 6 PM' },
    { group: 'hostel_office', label: 'Hostel reception', phone: '+919000000102', email: null, hours: 'Open 24 hours' },
    { group: 'spacebasic', label: 'SpaceBasic support', phone: null, email: 'support@spacebasic.example', hours: 'Mon–Fri, 10 AM – 6 PM' },
  ];
  const faqs: { category: FaqCategory; question: string; answer: string; published?: boolean }[] = [
    { category: 'leave', question: 'How do I apply for leave?', answer: 'Open Leave Manager from Home, or tap "Apply for leave" under Quick Actions, and fill in your dates and reason.' },
    { category: 'leave', question: 'Who approves my leave?', answer: 'Your warden approves it first, and then the hostel office. You get a notification at each step.' },
    { category: 'tickets', question: 'How do I report a problem in my room?', answer: 'Raise a ticket from Home with a short description. The hostel office will update you as it is fixed.' },
    { category: 'announcements', question: 'Where can I see hostel announcements?', answer: 'Open Announcements from Home. New announcements also appear in Notifications.' },
    { category: 'signing_in', question: 'I forgot my password. What do I do?', answer: 'On the sign-in screen, tap "Forgot password?" and follow the steps. You can also ask for a one-time code by email.' },
    { category: 'signing_in', question: 'Why can I not sign up myself?', answer: 'Your college registers every resident. If you cannot sign in, contact your hostel office.' },
    { category: 'other', question: 'When is the mess menu updated?', answer: 'Draft answer, not published yet.', published: false },
  ];
  let addedContacts = 0;
  let addedFaqs = 0;
  if (!(await SupportContactModel.exists({ institutionId }))) {
    const order = { hostel_office: 0, spacebasic: 0 };
    await SupportContactModel.insertMany(contacts.map((c) => ({ institutionId, ...c, order: ++order[c.group] })));
    addedContacts = contacts.length;
  }
  if (!(await FaqModel.exists({ institutionId }))) {
    const order: Partial<Record<FaqCategory, number>> = {};
    await FaqModel.insertMany(faqs.map((f) => ({ institutionId, ...f, published: f.published ?? true, order: (order[f.category] = (order[f.category] ?? 0) + 1) })));
    addedFaqs = faqs.length;
  }
  return { contacts: addedContacts, faqs: addedFaqs };
}

export function printDevUsers(): void {
  console.log('\nFAKE development users (password sign-in; OTP codes print in this console):');
  for (const u of DEV_USERS) console.log(`  ${u.role.padEnd(18)} ${u.email.padEnd(28)} ${u.password.padEnd(14)} ${u.phone}`);
  console.log('');
}
