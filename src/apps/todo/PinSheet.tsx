import { useEffect, useState } from 'react';
import { Delete, KeyRound, LockKeyhole, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet } from '../../components/Sheet';
import { signedInWithin } from '../../lib/util';
import { useTt } from './strings';

export type PinMode = 'set' | 'unlock';

/** Minutes after a fresh sign-in during which a forgotten PIN may be replaced. */
const RESET_WINDOW = 15;

/**
 * The To-do PIN: a 4-digit keypad, game style (four slots that fill, a shake on a wrong code).
 * - 'set': choose a PIN, then type it again; `onSet` gets it.
 * - 'unlock': `onCheck` says whether the PIN is right; "Forgot it?" lets a user who signed in within the last
 *   15 minutes choose a new one (else it explains how: sign out and in again).
 * Digits come from the on-screen keys or the keyboard.
 */
export function PinSheet({
  mode,
  onCheck,
  onSet,
  onClose,
}: {
  mode: PinMode;
  onCheck: (pin: string) => Promise<boolean>;
  onSet: (pin: string) => void;
  onClose: () => void;
}) {
  const tt = useTt();
  const [step, setStep] = useState<'enter' | 'new' | 'again' | 'forgot'>(mode === 'set' ? 'new' : 'enter');
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState('');
  const [wrong, setWrong] = useState(0);
  const [busy, setBusy] = useState(false);

  const fail = () => {
    setWrong((w) => w + 1);
    setDigits('');
  };
  const done = async (pin: string) => {
    if (step === 'enter') {
      setBusy(true);
      const ok = await onCheck(pin);
      setBusy(false);
      if (!ok) fail();
    } else if (step === 'new') {
      setFirst(pin);
      setDigits('');
      setStep('again');
    } else if (step === 'again') {
      if (pin === first) onSet(pin);
      else {
        setFirst('');
        setStep('new');
        fail();
      }
    }
  };
  const press = (d: string) => {
    if (busy || step === 'forgot') return;
    if (d === 'back') return setDigits((x) => x.slice(0, -1));
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    if (next.length === 4) void done(next);
  };
  // Typing on a keyboard works too.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const title = step === 'enter' ? tt('pinUnlock') : step === 'forgot' ? tt('pinForgot') : step === 'again' ? tt('pinAgain') : tt('pinNew');
  const hint =
    step === 'enter' ? tt('pinUnlockHint') : step === 'again' ? tt('pinAgainHint') : step === 'new' ? tt(mode === 'set' ? 'pinNewHint' : 'pinResetHint') : '';

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="todo-pin">
        <span className="todo-pin-badge" aria-hidden>
          {step === 'enter' ? <LockKeyhole size={30} /> : <KeyRound size={30} />}
        </span>
        {step === 'forgot' ? (
          signedInWithin(RESET_WINDOW) ? null : (
            <>
              <p className="todo-pin-hint">{tt('pinForgotHow', { n: RESET_WINDOW })}</p>
              <Link to="/logout" className="btn primary">
                <LogOut size={16} aria-hidden /> {tt('pinSignOut')}
              </Link>
              <button type="button" className="btn ghost sm" onClick={() => setStep('enter')}>
                {tt('pinBack')}
              </button>
            </>
          )
        ) : (
          <>
            <p className="todo-pin-hint">{hint}</p>
            <div key={wrong} className={`todo-pin-slots${wrong ? ' is-wrong' : ''}`} aria-live="polite" aria-label={tt('pinFilled', { n: digits.length })}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i < digits.length ? 'on' : undefined} />
              ))}
            </div>
            {wrong > 0 && <p className="todo-pin-wrong">{step === 'new' ? tt('pinMismatch') : tt('pinWrong')}</p>}
            <div className="todo-pin-keys" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k, i) =>
                k === '' ? (
                  <span key={i} />
                ) : (
                  <button key={i} type="button" className={k === 'back' ? 'is-back' : undefined} onClick={() => press(k)} aria-label={k === 'back' ? tt('pinErase') : k}>
                    {k === 'back' ? <Delete size={22} aria-hidden /> : k}
                  </button>
                ),
              )}
            </div>
            {step === 'enter' && (
              <button
                type="button"
                className="btn ghost sm todo-pin-forgot"
                onClick={() => {
                  setDigits('');
                  setWrong(0);
                  // Signed in just now: choose a new PIN straight away; otherwise explain how.
                  setStep(signedInWithin(RESET_WINDOW) ? 'new' : 'forgot');
                }}
              >
                {tt('pinForgot')}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
