import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Circle, RefreshCw, Square, SwitchCamera, Upload } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { preloadYouTube, uploadToYouTube, youtubeEnabled, type YouTubePrivacy } from '../lib/youtube';

export type RecordKind = 'video' | 'audio';

export interface RecordedMedia {
  kind: RecordKind;
  /** 'youtube' → src is an embed URL; 'blog' → src is a file URL in blog storage. */
  dest: 'youtube' | 'blog';
  src: string;
  caption: string;
}

const MIME: Record<RecordKind, string[]> = {
  // mp4 first: plays everywhere incl. iPhone; Chrome/Firefox fall back to WebM.
  video: ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  audio: ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'],
};

function pickMime(kind: RecordKind): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME[kind].find((m) => MediaRecorder.isTypeSupported?.(m));
}

function extFor(type: string): string {
  if (type.includes('mp4')) return type.startsWith('audio') ? 'm4a' : 'mp4';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('quicktime')) return 'mov';
  return 'webm';
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

/**
 * Record a video blog (camera + mic) or an audio clip in the browser.
 * Video can go to YouTube or the blog's storage; audio goes to the blog's storage.
 */
export function RecorderSheet({
  kind,
  open,
  defaultTitle,
  onClose,
  onDone,
}: {
  kind: RecordKind;
  open: boolean;
  defaultTitle: string;
  onClose: () => void;
  onDone: (m: RecordedMedia) => void;
}) {
  const { t, toast } = useApp();
  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [dest, setDest] = useState<'youtube' | 'blog'>(kind === 'video' && youtubeEnabled ? 'youtube' : 'blog');
  const [privacy, setPrivacy] = useState<YouTubePrivacy>('unlisted');
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const live = useRef<HTMLVideoElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number>(0);

  const stopStream = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((tr) => tr.stop());
      return null;
    });
  }, []);

  const startStream = useCallback(
    async (face = facing) => {
      setErr('');
      try {
        const s = await navigator.mediaDevices.getUserMedia(
          kind === 'video'
            ? { video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } }
            : { audio: { echoCancellation: true, noiseSuppression: true } },
        );
        setStream((old) => {
          old?.getTracks().forEach((tr) => tr.stop());
          return s;
        });
      } catch {
        setErr(t('rec_denied'));
      }
    },
    [facing, kind, t],
  );

  // Reset and open the camera/mic when the sheet opens; release them when it closes.
  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    setBlob(null);
    setBlobUrl('');
    setElapsed(0);
    setProgress(null);
    setTitle(defaultTitle);
    setDescription('');
    if (kind === 'video') preloadYouTube();
    if (supported) startStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (live.current && stream && kind === 'video') live.current.srcObject = stream;
  }, [stream, kind, blob]);

  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  // Simple input level meter so you can see the mic is picking you up.
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      meter.current?.style.setProperty('--level', String(level));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close();
    };
  }, [stream]);

  function start() {
    if (!stream) return;
    const mimeType = pickMime(kind);
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const b = new Blob(chunks.current, { type: rec.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') });
      setBlob(b);
      setBlobUrl(URL.createObjectURL(b));
    };
    rec.start(1000);
    recorder.current = rec;
    setRecording(true);
    setElapsed(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
  }

  function stop() {
    recorder.current?.stop();
    clearInterval(timer.current);
    setRecording(false);
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    setBlob(f);
    setBlobUrl(URL.createObjectURL(f));
  }

  async function upload() {
    if (!blob) return;
    setErr('');
    setProgress(0);
    try {
      if (kind === 'video' && dest === 'youtube') {
        const id = await uploadToYouTube(blob, { title, description, privacy }, setProgress);
        onDone({ kind, dest, src: `https://www.youtube-nocookie.com/embed/${id}`, caption: title });
      } else {
        const name = blob instanceof File ? blob.name : `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extFor(blob.type)}`;
        const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type });
        const src = await api.uploadMedia(file);
        onDone({ kind, dest: 'blog', src, caption: title });
      }
      stopStream();
      onClose();
    } catch (e) {
      setErr(errorText(e, t));
      setProgress(null);
    }
  }

  const uploading = progress !== null;

  return (
    <Sheet open={open} onClose={() => !uploading && onClose()} title={kind === 'video' ? t('rec_video') : t('rec_audio')} wide>
      <div className="form recorder">
        {kind === 'video' ? (
          <div className="rec-stage">
            {blob ? (
              <video src={blobUrl} controls playsInline className="rec-video" />
            ) : (
              <video ref={live} autoPlay muted playsInline className={`rec-video${facing === 'user' ? ' mirror' : ''}`} />
            )}
            {recording && (
              <span className="rec-badge">
                <Circle size={10} fill="currentColor" /> {fmt(elapsed)}
              </span>
            )}
            {!blob && !recording && stream && (
              <button
                type="button"
                className="icon-btn on-image rec-flip"
                aria-label={t('rec_flip')}
                onClick={() => {
                  const next = facing === 'user' ? 'environment' : 'user';
                  setFacing(next);
                  startStream(next);
                }}
              >
                <SwitchCamera size={18} />
              </button>
            )}
          </div>
        ) : (
          <div className="rec-audio">
            {blob ? (
              <audio src={blobUrl} controls className="rec-audio-player" />
            ) : (
              <>
                <div className={`rec-mic${recording ? ' live' : ''}`} ref={meter} />
                <span className="rec-time">{fmt(elapsed)}</span>
              </>
            )}
          </div>
        )}

        {!supported && <p className="notice warn">{t('rec_unsupported')}</p>}
        {err && <p className="error">{err}</p>}

        <div className="row wrap center-row">
          {!blob && supported && (
            recording ? (
              <button type="button" className="btn danger-fill" onClick={stop}>
                <Square size={16} fill="currentColor" /> {t('rec_stop')} · {fmt(elapsed)}
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={!stream} onClick={start}>
                <Circle size={16} fill="currentColor" /> {t('rec_start')}
              </button>
            )
          )}
          {blob && !uploading && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setBlob(null);
                setBlobUrl('');
                setElapsed(0);
                if (!stream && supported) startStream();
              }}
            >
              <RefreshCw size={16} /> {t('rec_again')}
            </button>
          )}
          {!recording && !blob && (
            <label className="btn ghost file-btn">
              <Camera size={16} /> {supported ? t('rec_useRecorder') : t('rec_useCamera')}
              <input
                type="file"
                accept={kind === 'video' ? 'video/*' : 'audio/*'}
                {...{ capture: kind === 'video' ? 'user' : true }}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {blob && (
          <>
            <label>
              {t('rec_title')}
              <input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {kind === 'video' && (
              <>
                <fieldset>
                  <legend>{t('rec_dest')}</legend>
                  <div className="seg">
                    <button type="button" className={dest === 'youtube' ? 'on' : ''} disabled={!youtubeEnabled} onClick={() => setDest('youtube')}>
                      {t('rec_youtube')}
                    </button>
                    <button type="button" className={dest === 'blog' ? 'on' : ''} onClick={() => setDest('blog')}>
                      {t('rec_blog')}
                    </button>
                  </div>
                  {!youtubeEnabled && <p className="hint">{t('rec_noYoutube')}</p>}
                </fieldset>
                {dest === 'youtube' && (
                  <>
                    <label>
                      {t('rec_desc')}
                      <textarea dir="auto" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </label>
                    <fieldset>
                      <legend>{t('rec_ytPrivacy')}</legend>
                      <div className="seg">
                        {(['public', 'unlisted', 'private'] as const).map((p) => (
                          <button type="button" key={p} className={privacy === p ? 'on' : ''} onClick={() => setPrivacy(p)}>
                            {t(`yt_${p}`)}
                          </button>
                        ))}
                      </div>
                      <p className="hint">{t('rec_ytNote')}</p>
                    </fieldset>
                  </>
                )}
              </>
            )}
            {uploading && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
            )}
            <div className="row end">
              <button type="button" className="btn primary" disabled={uploading} onClick={() => upload().catch((e) => toast(errorText(e, t)))}>
                <Upload size={16} /> {uploading ? `${t('rec_uploading')} ${Math.round((progress ?? 0) * 100)}%` : t('rec_upload')}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
