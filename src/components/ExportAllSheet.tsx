import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileArchive, FileJson, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { downloadJsonBackup, downloadZip } from '../lib/export';
import type { TagGroup } from '../lib/types';
import { pickText } from '../lib/util';
import { Sheet } from './Sheet';

/** Admin-only exports of every post, or (with `group`) of every post in one tag group. */
export function ExportAllSheet({ open, onClose, group }: { open: boolean; onClose: () => void; group?: TagGroup | null }) {
  const { t, prefs, toast } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  // A tag group's export holds every published post carrying one of its tags (any audience: it's the admin's copy).
  const load = () => api.listPosts(group ? { limit: 10000, anyTags: group.tags } : { limit: 10000 });
  const name = group ? pickText(group.config.name, prefs.uiLang) || group.slug : t('siteName');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      toast(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={group ? `${t('tg_export')} · ${name}` : t('exportAll')}>
      <div className="menu-list">
        <button type="button" disabled={busy} onClick={() => (onClose(), nav(group ? `/posts/print?group=${encodeURIComponent(group.slug)}` : '/posts/print'))}>
          <FileText /> {t('exportAllPdf')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => downloadZip(await load(), prefs.uiLang, name, group?.slug))}
        >
          <FileArchive /> {busy ? t('preparing') : t('exportAllZip')}
        </button>
        <button type="button" disabled={busy} onClick={() => run(async () => downloadJsonBackup(await load(), group?.slug))}>
          <FileJson /> {t('exportJson')}
        </button>
      </div>
      <p className="hint">{t('pdfHint')}</p>
    </Sheet>
  );
}
