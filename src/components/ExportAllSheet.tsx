import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileArchive, FileJson, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { downloadJsonBackup, downloadZip } from '../lib/export';
import { Sheet } from './Sheet';

export function ExportAllSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, prefs, toast } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

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
    <Sheet open={open} onClose={onClose} title={t('exportAll')}>
      <div className="menu-list">
        <button type="button" disabled={busy} onClick={() => (onClose(), nav('/posts/print'))}>
          <FileText /> {t('exportAllPdf')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => downloadZip(await api.listPosts({ limit: 10000 }), prefs.uiLang, t('siteName')))}
        >
          <FileArchive /> {busy ? t('preparing') : t('exportAllZip')}
        </button>
        <button type="button" disabled={busy} onClick={() => run(async () => downloadJsonBackup(await api.listPosts({ limit: 10000 })))}>
          <FileJson /> {t('exportJson')}
        </button>
      </div>
      <p className="hint">{t('pdfHint')}</p>
    </Sheet>
  );
}
