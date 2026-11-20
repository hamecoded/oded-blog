import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useApp } from '../../lib/app';
import { copyText } from '../../lib/errorReport';
import { useTt } from './strings';

/**
 * A small clipboard button that copies an item's title (a task, an event, an event item or tip).
 * The icon turns into a tick for a moment, and a toast says it's copied.
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const tt = useTt();
  const { toast } = useApp();
  const [done, setDone] = useState(false);
  const empty = !text.trim();
  return (
    <button
      type="button"
      className={`icon-btn sm todo-copy${done ? ' is-done' : ''}${className ? ` ${className}` : ''}`}
      disabled={empty}
      aria-label={tt('copyTitle')}
      data-tip={tt('copyTitle')}
      onClick={async () => {
        if (empty) return;
        const ok = await copyText(text.trim());
        toast(tt(ok ? 'titleCopied' : 'copyFailed'));
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
    </button>
  );
}
