import { useEffect } from 'react';
import { useApp } from '../lib/app';
import { ensureFonts, FONTS } from '../lib/fonts';
import { Sheet } from './Sheet';

export function DisplaySettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, prefs, setPrefs, resetPrefs } = useApp();

  useEffect(() => {
    if (open) ensureFonts(FONTS.map((f) => f.family));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={t('settings')}>
      <div className="form">
        <div className="sample" style={{ fontFamily: `'${prefs.font}'`, fontSize: prefs.fontSize, lineHeight: prefs.lineHeight }}>
          {t('sample')}
        </div>

        <fieldset>
          <legend>{t('font')}</legend>
          <div className="font-grid">
            {FONTS.map((f) => (
              <button
                type="button"
                key={f.family}
                className={`font-opt${prefs.font === f.family ? ' on' : ''}`}
                style={{ fontFamily: `'${f.family}'` }}
                onClick={() => setPrefs({ font: f.family })}
              >
                <span className="font-big">אבג Abc</span>
                <small>{f.label[prefs.uiLang]}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          {t('fontSize')} · {prefs.fontSize}px
          <input type="range" min={14} max={28} step={1} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />
        </label>

        <label>
          {t('lineHeight')} · {prefs.lineHeight.toFixed(2)}
          <input type="range" min={1.3} max={2.2} step={0.05} value={prefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: Number(e.target.value) })} />
        </label>

        <fieldset>
          <legend>{t('theme')}</legend>
          <div className="seg">
            {(['auto', 'light', 'dark'] as const).map((th) => (
              <button type="button" key={th} className={prefs.theme === th ? 'on' : ''} onClick={() => setPrefs({ theme: th })}>
                {t(th === 'auto' ? 'themeAuto' : th === 'light' ? 'themeLight' : 'themeDark')}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('uiLanguage')}</legend>
          <div className="seg">
            <button type="button" className={prefs.uiLang === 'he' ? 'on' : ''} onClick={() => setPrefs({ uiLang: 'he' })}>
              עברית
            </button>
            <button type="button" className={prefs.uiLang === 'en' ? 'on' : ''} onClick={() => setPrefs({ uiLang: 'en' })}>
              English
            </button>
          </div>
        </fieldset>

        <div className="row end">
          <button type="button" className="btn ghost" onClick={resetPrefs}>
            {t('reset')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
