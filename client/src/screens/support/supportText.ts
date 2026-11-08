import { FAQ_CATEGORIES, displayPhone, type FaqCategory, type FaqItem, type SupportContact } from '@spacebasic/shared';

/** Section labels, in the API's display order (upper-cased by CSS, like Home's section labels). */
export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  leave: 'Leave',
  tickets: 'Tickets',
  announcements: 'Announcements',
  signing_in: 'Signing in',
  other: 'Other',
};

/** FAQs grouped by category, empty categories left out; the API already sorts by category order, then `order`. */
export function groupFaqs(items: FaqItem[]): { category: FaqCategory; label: string; items: FaqItem[] }[] {
  return FAQ_CATEGORIES
    .map((category) => ({ category, label: FAQ_CATEGORY_LABELS[category], items: items.filter((f) => f.category === category) }))
    .filter((g) => g.items.length > 0);
}

/** tel: and mailto: links for a contact, with the phone shown as "+91 98765 43210". */
export function contactActions(c: SupportContact): { kind: 'phone' | 'email'; href: string; text: string }[] {
  const out: { kind: 'phone' | 'email'; href: string; text: string }[] = [];
  if (c.phone) out.push({ kind: 'phone', href: `tel:${c.phone}`, text: displayPhone(c.phone) });
  if (c.email) out.push({ kind: 'email', href: `mailto:${c.email}`, text: c.email });
  return out;
}
