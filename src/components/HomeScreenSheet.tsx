import { useState, type CSSProperties } from 'react';
import { CheckCircle2, Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { useApp } from '../lib/app';
import { pickText } from '../lib/util';
import type { AppEntry } from '../apps/types';
import { canPromptInstall, homeFiles, homePlatform, isStandalone, promptInstall } from '../apps/homeScreen';
import { Sheet } from './Sheet';

/**
 * How to put an app on the phone's home screen. A web page can't add itself (only the browser's own Share menu can),
 * so this shows the steps for the browser in hand (Safari's Share is at the bottom, Chrome's at the top on iPhone),
 * or the browser's install prompt where it offers one (Chrome on Android and computers). The page behind it is the
 * app's own (loaded fresh at /apps/<id>), so what gets added is the app at its own address, with its own icon.
 */
export function HomeScreenSheet({ app, onClose }: { app: AppEntry; onClose: () => void }) {
  const { t, prefs, toast } = useApp();
  const name = pickText(app.name, prefs.uiLang);
  const platform = homePlatform();
  const [canInstall] = useState(canPromptInstall);
  const address = `${location.host}${import.meta.env.BASE_URL}apps/${app.id}`;
  const style = app.colors ? ({ '--app-c1': app.colors[0], '--app-c2': app.colors[1] } as CSSProperties) : undefined;

  const steps: { icon: typeof Share; text: string }[] =
    platform === 'ios-safari'
      ? [
          { icon: Share, text: t('homeIosSafari1') },
          { icon: SquarePlus, text: t('homeIos2') },
          { icon: CheckCircle2, text: t('homeIos3', { name }) },
        ]
      : platform === 'ios-chrome'
        ? [
            { icon: Share, text: t('homeIosChrome1') },
            { icon: SquarePlus, text: t('homeIos2') },
            { icon: CheckCircle2, text: t('homeIos3', { name }) },
          ]
        : platform === 'ios-other'
          ? [
              { icon: Share, text: t('homeIosOther1') },
              { icon: SquarePlus, text: t('homeIos2') },
              { icon: CheckCircle2, text: t('homeIos3', { name }) },
            ]
          : platform === 'android'
            ? [
                { icon: EllipsisVertical, text: t('homeAndroid1') },
                { icon: SquarePlus, text: t('homeAndroid2') },
              ]
            : [{ icon: Download, text: t('homeDesktop') }];

  return (
    <Sheet open onClose={onClose} title={t('homeTitle')}>
      <div className="home-sheet">
        <div className="home-sheet-app">
          <img className="home-sheet-icon" src={`${homeFiles(app.id)}icon-180.png`} alt="" style={style} />
          <div>
            <strong dir="auto">{name}</strong>
            <span className="muted home-sheet-url" dir="ltr">
              {address}
            </span>
          </div>
        </div>
        {isStandalone() ? (
          <p className="notice">{t('homeAlready')}</p>
        ) : (
          <>
            {canInstall && (
              <button
                type="button"
                className="btn primary block"
                onClick={async () => {
                  if (await promptInstall()) {
                    toast(t('homeInstalled', { name }));
                    onClose();
                  }
                }}
              >
                <Download size={18} aria-hidden /> {t('homeInstall')}
              </button>
            )}
            <ol className="home-steps">
              {steps.map((s, i) => (
                <li key={i}>
                  <span className="home-step-icon" aria-hidden>
                    <s.icon size={18} />
                  </span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
            <p className="hint">{t('homeWhy')}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
