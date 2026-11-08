import { describe, expect, it } from 'vitest';
import type { FaqItem, SupportContact } from '@spacebasic/shared';
import { contactActions, groupFaqs } from './supportText';

const faq = (id: string, category: FaqItem['category']): FaqItem => ({ id, question: `Q${id}`, answer: 'A', category, order: 0, published: true });
const contact = (phone: string | null, email: string | null): SupportContact => ({ id: '1', group: 'hostel_office', label: 'Office', phone, email, hours: null, order: 1 });

describe('support text', () => {
  it('groups FAQs in category display order and skips empty categories', () => {
    const groups = groupFaqs([faq('1', 'signing_in'), faq('2', 'leave'), faq('3', 'leave'), faq('4', 'other')]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id).join('')])).toEqual([['Leave', '23'], ['Signing in', '1'], ['Other', '4']]);
    expect(groupFaqs([])).toEqual([]);
  });
  it('builds tel: and mailto: links with the phone shown as +91 98765 43210', () => {
    expect(contactActions(contact('+919000000101', 'west.office@example.com'))).toEqual([
      { kind: 'phone', href: 'tel:+919000000101', text: '+91 90000 00101' },
      { kind: 'email', href: 'mailto:west.office@example.com', text: 'west.office@example.com' },
    ]);
    expect(contactActions(contact(null, 'a@b.co')).map((a) => a.kind)).toEqual(['email']);
    expect(contactActions(contact('+447700900123', null))[0]?.text).toBe('+447700900123');
  });
});
