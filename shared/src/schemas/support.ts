import { z } from 'zod';
import { emailSchema, objectIdSchema, phoneSchema } from './common';

// Support / Help (docs/schemas.md §1.10, docs/api.md "Support"). The Help screen shows a "Contact us" card
// (hostel office and SpaceBasic contacts) and "Common questions" (FAQ). Admins manage both through the API.

export const SUPPORT_CONTACT_GROUPS = ['hostel_office', 'spacebasic'] as const;
export type SupportContactGroup = (typeof SUPPORT_CONTACT_GROUPS)[number];

/** In display order. The Help card's subtitle reads "Leave, tickets, announcements and signing in". */
export const FAQ_CATEGORIES = ['leave', 'tickets', 'announcements', 'signing_in', 'other'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

/** Upper bounds that keep the unpaginated lists small. */
export const MAX_CONTACTS_PER_GROUP = 20;
export const MAX_FAQS = 200;

export interface SupportContact {
  id: string;
  group: SupportContactGroup;
  label: string;
  /** E.164 */
  phone: string | null;
  email: string | null;
  hours: string | null;
  order: number;
}

/** GET /support/contacts */
export interface SupportContacts {
  hostelOffice: SupportContact[];
  spacebasic: SupportContact[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  order: number;
  /** Always true for readers; managers can list drafts with ?includeUnpublished=true. */
  published: boolean;
}

const orderSchema = z.number({ error: 'Enter a position' }).int().min(0).max(999);
const labelSchema = z.string({ error: 'Enter a label' }).trim().min(1, { error: 'Enter a label' }).max(80, { error: 'Use at most 80 characters' });
const hoursSchema = z.string().trim().min(1, { error: 'Enter the hours, or leave them out' }).max(80, { error: 'Use at most 80 characters' });
const questionSchema = z.string({ error: 'Enter the question' }).trim().min(1, { error: 'Enter the question' }).max(200, { error: 'Use at most 200 characters' });
const answerSchema = z.string({ error: 'Enter the answer' }).trim().min(1, { error: 'Enter the answer' }).max(4000, { error: 'Use at most 4000 characters' });

export const supportIdParamsSchema = z.object({ id: objectIdSchema });

export const createContactBodySchema = z
  .object({
    group: z.enum(SUPPORT_CONTACT_GROUPS, { error: 'Choose hostel_office or spacebasic' }),
    label: labelSchema,
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    hours: hoursSchema.optional(),
    order: orderSchema.optional(),
  })
  .refine((v) => v.phone !== undefined || v.email !== undefined, { path: ['phone'], error: 'Add a phone number or an email address' });
export type CreateContactBody = z.input<typeof createContactBodySchema>;

/** null clears an optional field. The service checks that a phone or an email is still left. */
export const updateContactBodySchema = z
  .object({
    group: z.enum(SUPPORT_CONTACT_GROUPS, { error: 'Choose hostel_office or spacebasic' }).optional(),
    label: labelSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    hours: hoursSchema.nullable().optional(),
    order: orderSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { path: ['_'], error: 'Nothing to change' });
export type UpdateContactBody = z.input<typeof updateContactBodySchema>;

export const listFaqsQuerySchema = z.object({
  category: z.enum(FAQ_CATEGORIES, { error: 'Unknown category' }).optional(),
  includeUnpublished: z.enum(['true', 'false'], { error: 'Use true or false' }).optional().transform((v) => v === 'true'),
});

export const createFaqBodySchema = z.object({
  question: questionSchema,
  answer: answerSchema,
  category: z.enum(FAQ_CATEGORIES, { error: 'Unknown category' }),
  order: orderSchema.optional(),
  published: z.boolean().default(true),
});
export type CreateFaqBody = z.input<typeof createFaqBodySchema>;

export const updateFaqBodySchema = z
  .object({
    question: questionSchema.optional(),
    answer: answerSchema.optional(),
    category: z.enum(FAQ_CATEGORIES, { error: 'Unknown category' }).optional(),
    order: orderSchema.optional(),
    published: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { path: ['_'], error: 'Nothing to change' });
export type UpdateFaqBody = z.input<typeof updateFaqBodySchema>;
