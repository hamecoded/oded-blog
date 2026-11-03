// The call-to-action link of a tag group's landing page, as a kind of contact plus its fields.
// Stored in tag_groups.config.cta_url as an ordinary link (https://wa.me/…, mailto:…, tel:…, https://…, or a
// page of the site), so nothing about storage changes; the admin sheet edits it through these fields.

export type ContactKind = 'whatsapp' | 'email' | 'phone' | 'link' | 'page' | 'none';

export interface Contact {
  kind: ContactKind;
  /** whatsapp / phone: the number as typed. email: the address. link: the URL. page: the site path. */
  value: string;
  /** whatsapp: the ready-made message. email: the subject. */
  extra: string;
}

/**
 * Digits for wa.me / tel: in international form. "+972 54-123-4567", "00972541234567" and the Israeli local
 * "054-1234567" (a leading 0 is taken as Israel, +972) all give "972541234567".
 */
export function internationalDigits(phone: string): string {
  const t = phone.trim();
  const digits = t.replace(/\D/g, '');
  if (!digits) return '';
  if (t.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/** A readable form of an international number: "972541234567" → "+972 54 123 4567". */
export function prettyPhone(digits: string): string {
  if (!digits) return '';
  // Israeli: mobiles have 9 digits after 972 (54 123 4567), landlines 8 (3 555 1234).
  const m = digits.match(/^972(\d{2})(\d{3})(\d{4})$/) ?? digits.match(/^972(\d)(\d{3})(\d{4})$/);
  return m ? `+972 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactUrl(c: Contact): string {
  const v = c.value.trim();
  const extra = c.extra.trim();
  switch (c.kind) {
    case 'whatsapp': {
      const n = internationalDigits(v);
      return n ? `https://wa.me/${n}${extra ? `?text=${encodeURIComponent(extra)}` : ''}` : '';
    }
    case 'email':
      return v ? `mailto:${v}${extra ? `?subject=${encodeURIComponent(extra)}` : ''}` : '';
    case 'phone': {
      const n = internationalDigits(v);
      return n ? `tel:+${n}` : '';
    }
    case 'link':
      return v ? (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`) : '';
    case 'page':
      return v;
    default:
      return '';
  }
}

/** Reads a stored link back into a kind and fields (the inverse of contactUrl). */
export function parseContact(url: string): Contact {
  const u = (url ?? '').trim();
  if (!u) return { kind: 'none', value: '', extra: '' };
  const wa = u.match(/^https?:\/\/(?:wa\.me\/(\d+)|(?:api|web)\.whatsapp\.com\/send\/?\?(?:.*&)?phone=(\d+))/i);
  if (wa) {
    const text = new URLSearchParams(u.split('?')[1] ?? '').get('text') ?? '';
    return { kind: 'whatsapp', value: prettyPhone(wa[1] ?? wa[2]), extra: text };
  }
  if (/^mailto:/i.test(u)) {
    const [addr, query = ''] = u.slice(7).split('?');
    return { kind: 'email', value: decodeURIComponent(addr), extra: new URLSearchParams(query).get('subject') ?? '' };
  }
  if (/^tel:/i.test(u)) return { kind: 'phone', value: prettyPhone(internationalDigits(u.slice(4))), extra: '' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return { kind: 'link', value: u, extra: '' };
  return { kind: 'page', value: u, extra: '' };
}

/** Which kind a stored link is (for the landing button's icon). */
export function contactKind(url: string): ContactKind {
  return parseContact(url).kind;
}

/** A problem with the fields, as an i18n key, or null when the link will work. */
export function contactProblem(c: Contact): 'tg_contactBadPhone' | 'tg_contactBadEmail' | 'tg_contactBadLink' | null {
  const v = c.value.trim();
  if (!v || c.kind === 'none' || c.kind === 'page') return null;
  if (c.kind === 'whatsapp' || c.kind === 'phone') return internationalDigits(v).length < 8 ? 'tg_contactBadPhone' : null;
  if (c.kind === 'email') return EMAIL_RE.test(v) ? null : 'tg_contactBadEmail';
  if (c.kind === 'link') {
    try {
      new URL(contactUrl(c));
      return null;
    } catch {
      return 'tg_contactBadLink';
    }
  }
  return null;
}

/** Button text used when the admin picks a contact kind and hasn't written one (and on the page if it's empty). */
export const DEFAULT_CTA_LABEL: Partial<Record<ContactKind, { he: string; en: string }>> = {
  whatsapp: { he: 'דברו איתי בוואטסאפ', en: 'Message me on WhatsApp' },
  email: { he: 'כתבו לי', en: 'Email me' },
  phone: { he: 'התקשרו אליי', en: 'Call me' },
};
