import mongoose from 'mongoose';
import { roomCodeFor, type Role } from '@spacebasic/shared';
import { env } from '../config/env';
import { hashPassword } from '../core/security/password';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { FloorModel, HostelModel, RoomModel } from '../modules/hostel/hostel.models';
import { UserModel } from '../modules/users/user.model';

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
  if (await InstitutionModel.exists({ slug: 'presidency-university' })) {
    console.log('seed: demo institution already exists (use `npm run seed -- --reset` to start over)');
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
  console.log(`seed: created "${inst.name}", hostel West (3 floors, ${roomIds.size} rooms), ${DEV_USERS.length} users`);
}

export function printDevUsers(): void {
  console.log('\nFAKE development users (password sign-in; OTP codes print in this console):');
  for (const u of DEV_USERS) console.log(`  ${u.role.padEnd(18)} ${u.email.padEnd(28)} ${u.password.padEnd(14)} ${u.phone}`);
  console.log('');
}
