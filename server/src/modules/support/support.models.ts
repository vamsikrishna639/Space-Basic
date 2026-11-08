import { Schema, model, type Types } from 'mongoose';
import { FAQ_CATEGORIES, SUPPORT_CONTACT_GROUPS, type FaqCategory, type SupportContactGroup } from '@spacebasic/shared';
import { tenantScope } from '../../core/db/tenant';

// docs/schemas.md §1.10. Both tenant-scoped: each institution has its own contacts and FAQ.

export interface SupportContactDoc {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  group: SupportContactGroup;
  label: string;
  phone: string | null;
  email: string | null;
  hours: string | null;
  order: number;
}

const contactSchema = new Schema<SupportContactDoc>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    group: { type: String, enum: SUPPORT_CONTACT_GROUPS, required: true },
    label: { type: String, required: true, maxlength: 80 },
    phone: { type: String, default: null, match: /^\+[1-9]\d{7,14}$/ },
    email: { type: String, default: null, maxlength: 254 },
    hours: { type: String, default: null, maxlength: 80 },
    order: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, versionKey: false },
);
contactSchema.index({ institutionId: 1, group: 1, order: 1 });
contactSchema.plugin(tenantScope);

export const SupportContactModel = model<SupportContactDoc>('SupportContact', contactSchema, 'support_contacts');

export interface FaqDoc {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  question: string;
  answer: string;
  category: FaqCategory;
  order: number;
  published: boolean;
}

const faqSchema = new Schema<FaqDoc>(
  {
    institutionId: { type: Schema.Types.ObjectId, required: true },
    question: { type: String, required: true, maxlength: 200 },
    answer: { type: String, required: true, maxlength: 4000 },
    category: { type: String, enum: FAQ_CATEGORIES, required: true },
    order: { type: Number, required: true, min: 0 },
    published: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, versionKey: false },
);
faqSchema.index({ institutionId: 1, published: 1, category: 1, order: 1 });
faqSchema.plugin(tenantScope);

export const FaqModel = model<FaqDoc>('Faq', faqSchema, 'faqs');
