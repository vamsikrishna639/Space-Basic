// Create the institution and its FIRST REAL ADMIN in a database that has no seed data (production).
//
//   npm run create-admin -w server -- [--layout] [--logo <file.png>]
//
// The database comes from MONGODB_URI in this terminal's environment only (never a file in the repo, never the
// command line). Everything else is asked: institution name and time zone, the admin's name, email, optional
// mobile number and password (typed hidden, twice). Nothing fake is created.
//   --layout       also create block "West" with the PLACEHOLDER floors CF101–200, CS201–300, CT301–400, 3 beds a
//                  room (decisions.md 2026-11-07: fake until the real ranges are confirmed). Only when the
//                  institution has no hostel yet.
//   --logo <file>  the institution logo shown on Home (PNG, JPEG or WebP, at most 1 MB; used as-is).
// Run it again with another email to add a second admin. An existing institution (same name) is reused.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { AVATAR_MAX_BYTES, createUserBodySchema, IMAGE_CONTENT_TYPES, type ImageContentType } from '@spacebasic/shared';
import { connectDb } from '../core/db/connect';
import { audit } from '../core/audit/audit';
import { hashPassword } from '../core/security/password';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { setLogo } from '../modules/institutions/institutions.service';
import { HostelModel } from '../modules/hostel/hostel.models';
import { UserModel } from '../modules/users/user.model';
import { createPlaceholderLayout } from './seed-data';
import { ask, askHidden, maskUri } from './prompt';

const SIGNATURES: [ImageContentType, number[]][] = [['image/png', [0x89, 0x50, 0x4e, 0x47]], ['image/jpeg', [0xff, 0xd8, 0xff]], ['image/webp', [0x52, 0x49, 0x46, 0x46]]];

function readLogo(file: string): { data: Buffer; contentType: ImageContentType } {
  const data = fs.readFileSync(path.resolve(file));
  if (data.length > AVATAR_MAX_BYTES) throw new Error('The logo is larger than 1 MB');
  const type = SIGNATURES.find(([, sig]) => sig.every((b, i) => data[i] === b))?.[0];
  if (!type || !IMAGE_CONTENT_TYPES.includes(type)) throw new Error('The logo must be a PNG, JPEG or WebP file');
  return { data, contentType: type };
}

const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Set MONGODB_URI in this terminal first (see README, "Deployment" > "First admin").');
  const args = process.argv.slice(2);
  const logoIndex = args.indexOf('--logo');
  const logo = logoIndex > -1 ? readLogo(args[logoIndex + 1] ?? '') : null;
  const withLayout = args.includes('--layout');

  console.log(`create-admin: database ${maskUri(uri)}`);
  await connectDb(uri);

  // ---- institution ----
  const name = await ask('Institution name', 'Presidency University');
  const slug = slugOf(name);
  if (slug.length < 2) throw new Error('Give the institution a name of at least 2 letters or digits');
  let inst = await InstitutionModel.findOne({ slug });
  if (inst) {
    console.log(`create-admin: using the existing institution "${inst.name}"`);
  } else {
    const timezone = await ask('Time zone', 'Asia/Kolkata');
    if (!validTimezone(timezone)) throw new Error(`Unknown time zone "${timezone}" (use an IANA name such as Asia/Kolkata)`);
    inst = await InstitutionModel.create({ name, slug, timezone });
    console.log(`create-admin: created the institution "${inst.name}"`);
  }
  const institutionId = inst._id;

  // ---- the admin ----
  const fullName = await ask('Admin full name');
  const email = await ask('Admin email');
  const phone = await ask('Admin mobile number (optional, press Enter to skip)');
  const password = await askHidden('Password (at least 8 characters, typed hidden)');
  const again = await askHidden('Password again');
  if (password !== again) throw new Error("The two passwords don't match. Nothing was created.");

  const parsed = createUserBodySchema.safeParse({ fullName, email, phone, roles: ['institution_admin'], password });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${String(i.path[0] ?? '')}: ${i.message}`).join('\n');
    throw new Error(`Please check:\n${issues}\nNothing was created.`);
  }
  const body = parsed.data;
  if (!body.password) throw new Error('A password is required for the first admin. Nothing was created.');
  for (const [field, value] of [['email', body.email], ['phone', body.phone]] as const) {
    if (value && (await UserModel.exists({ [field]: value }).setOptions({ unscoped: 'create-admin: global uniqueness of email/phone' }))) {
      throw new Error(`That ${field === 'email' ? 'email' : 'mobile number'} is already in use. Nothing was created.`);
    }
  }
  const admin = await UserModel.create({
    institutionId, fullName: body.fullName, email: body.email, phone: body.phone,
    passwordHash: await hashPassword(body.password), roles: ['institution_admin'],
  });
  await audit({ institutionId, actorId: null, action: 'user.create', targetType: 'user', targetId: admin._id, meta: { roles: admin.roles, via: 'create-admin' } });
  console.log(`create-admin: created the admin ${admin.email ?? admin.phone}`);

  // ---- optional: logo and the placeholder layout ----
  if (logo) {
    await setLogo(institutionId, logo, { actorId: null });
    console.log('create-admin: institution logo uploaded');
  }
  if (withLayout) {
    if (await HostelModel.exists({ institutionId })) {
      console.log('create-admin: the institution already has a hostel; layout left unchanged');
    } else {
      const rooms = await createPlaceholderLayout(institutionId);
      console.log(`create-admin: created block West with ${rooms} rooms (PLACEHOLDER ranges; change them when the real ones are known)`);
    }
  }
  console.log('create-admin: done. Sign in on the app with that email and password.');
}

main()
  .then(() => mongoose.disconnect().then(() => process.exit(0)))
  .catch((err) => {
    console.error('create-admin failed:', err instanceof Error ? err.message : err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
