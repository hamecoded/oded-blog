import type { TodoContact } from '../../lib/types';

/** Escapes a vCard text value (backslash, comma, semicolon, line breaks). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/**
 * A contact as a vCard 3.0, the format phones import: name (last and first apart), mobile phone, email, the note,
 * and `title` as the job title (the event it belongs to, so it's clear later where the person came from).
 */
export function vCard(c: TodoContact, title?: string): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(c.last)};${esc(c.first)};;;`, `FN:${esc(c.name || c.phone || c.email)}`];
  if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone.replace(/[^\d+*#]/g, '')}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (title) lines.push(`TITLE:${esc(title)}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Hands the contact to the phone's Contacts app. On phones that can share files (iPhone, Android) the share sheet
 * opens with the card, which offers to add it to Contacts; elsewhere the .vcf file downloads, and opening it does
 * the same. Returns false when the user closed the share sheet.
 */
export async function saveToContacts(c: TodoContact, title?: string): Promise<boolean> {
  const name = (c.name || c.phone || 'contact').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'contact';
  const file = new File([vCard(c, title)], `${name}.vcf`, { type: 'text/vcard' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: c.name });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Sharing refused (e.g. not allowed here): fall back to the download below.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  // Some browsers drop a non-Latin download name (and the .vcf with it); the name inside the card is what counts.
  a.download = /^[\x20-\x7e]+$/.test(file.name) ? file.name : 'contact.vcf';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
