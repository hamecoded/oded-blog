import { ExternalLink, FileText, Link2, Mail, Phone, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../lib/app';
import { contactProblem, contactUrl, internationalDigits, prettyPhone, type Contact, type ContactKind } from '../lib/contact';
import { WhatsAppIcon } from './Social';

const KINDS: { kind: ContactKind; icon: ReactNode }[] = [
  { kind: 'whatsapp', icon: <WhatsAppIcon size={18} /> },
  { kind: 'email', icon: <Mail size={18} /> },
  { kind: 'phone', icon: <Phone size={18} /> },
  { kind: 'link', icon: <Link2 size={18} /> },
  { kind: 'page', icon: <FileText size={18} /> },
  { kind: 'none', icon: <X size={18} /> },
];

/**
 * The landing page's call to action as a kind of contact (WhatsApp, email, phone, web link, a page of the site)
 * plus plain fields; the link itself (https://wa.me/…, mailto:…) is built from them and previewed.
 * A fieldset, not a <label>: a label passes taps on its text to the first button inside it.
 */
export function ContactField({ contact, onChange }: { contact: Contact; onChange: (c: Contact) => void }) {
  const { t } = useApp();
  const set = (patch: Partial<Contact>) => onChange({ ...contact, ...patch });
  const url = contactUrl(contact);
  const problem = contactProblem(contact);
  // The link with its %-codes turned back into letters, so a Hebrew message or subject is readable here.
  const shown = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();
  const phoneDigits = contact.kind === 'whatsapp' || contact.kind === 'phone' ? internationalDigits(contact.value) : '';

  const field = (label: string, input: ReactNode, help?: ReactNode) => (
    <div className="field">
      <span>{label}</span>
      {input}
      {help}
    </div>
  );

  return (
    <fieldset className="contact-field">
      <legend>{t('tg_contact')}</legend>
      <div className="contact-kinds" role="radiogroup" aria-label={t('tg_contact')}>
        {KINDS.map(({ kind, icon }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={contact.kind === kind}
            className={`contact-kind k-${kind}${contact.kind === kind ? ' on' : ''}`}
            // Switching kinds starts the fields fresh, except a number kept between WhatsApp and a phone call.
            onClick={() =>
              onChange({
                kind,
                value: (kind === 'whatsapp' || kind === 'phone') && (contact.kind === 'whatsapp' || contact.kind === 'phone') ? contact.value : '',
                extra: '',
              })
            }
          >
            {icon}
            <span>{t(`tg_contact_${kind}`)}</span>
          </button>
        ))}
      </div>

      {(contact.kind === 'whatsapp' || contact.kind === 'phone') &&
        field(
          t('tg_contactPhone'),
          <input
            enterKeyHint="next"
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contact.value}
            placeholder="054-1234567"
            onChange={(e) => set({ value: e.target.value })}
            onBlur={() => phoneDigits && set({ value: prettyPhone(phoneDigits) })}
          />,
          <small className="hint">{t('tg_contactPhoneHelp')}</small>,
        )}
      {contact.kind === 'whatsapp' &&
        field(
          t('tg_contactWaText'),
          <textarea dir="auto" rows={2} value={contact.extra} placeholder={t('tg_contactWaTextPh')} onChange={(e) => set({ extra: e.target.value })} />,
          <small className="hint">{t('tg_contactWaTextHelp')}</small>,
        )}
      {contact.kind === 'email' && (
        <>
          {field(
            t('tg_contactEmail'),
            <input enterKeyHint="next" dir="ltr" type="email" inputMode="email" autoComplete="email" value={contact.value} placeholder="name@example.com" onChange={(e) => set({ value: e.target.value })} />,
          )}
          {field(t('tg_contactSubject'), <input enterKeyHint="next" dir="auto" value={contact.extra} onChange={(e) => set({ extra: e.target.value })} />)}
        </>
      )}
      {contact.kind === 'link' &&
        field(t('tg_contactLink'), <input enterKeyHint="next" dir="ltr" type="url" inputMode="url" value={contact.value} placeholder="https://…" onChange={(e) => set({ value: e.target.value })} />)}
      {contact.kind === 'page' &&
        field(
          t('tg_contactPage'),
          <input enterKeyHint="next" dir="ltr" value={contact.value} placeholder="posts" onChange={(e) => set({ value: e.target.value })} />,
          <small className="hint">{t('tg_contactPageHelp')}</small>,
        )}

      {problem ? (
        <small className="hint error">{t(problem)}</small>
      ) : contact.kind === 'none' ? (
        <small className="hint">{t('tg_contactNoneHelp')}</small>
      ) : url ? (
        <small className="hint contact-preview">
          {t('tg_contactPreview')}{' '}
          <code dir="ltr">{shown.length > 90 ? `${shown.slice(0, 89)}…` : shown}</code>
          {contact.kind !== 'page' && (
            <a href={url} target={/^https?:/.test(url) ? '_blank' : undefined} rel="noopener noreferrer">
              {t('tg_contactTry')} <ExternalLink size={12} className="inline-ico" />
            </a>
          )}
        </small>
      ) : null}
    </fieldset>
  );
}
