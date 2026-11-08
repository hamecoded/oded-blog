import { useEffect, useRef, useState } from 'react';
import { Camera, SwitchCamera } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { usePt } from './strings';

/**
 * Takes a photo with the computer's camera (getUserMedia): a live preview and a shutter button. Phones don't come
 * here: they open their own camera app through a file input with `capture` (see App.tsx), which is better there.
 */
export function CameraSheet({
  open,
  onClose,
  onShot,
}: {
  open: boolean;
  onClose: () => void;
  onShot: (file: File) => void;
}) {
  const pt = usePt();
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [cameras, setCameras] = useState(0);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError(pt('camUnavailable')));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setError('');
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameras(devices.filter((d) => d.kind === 'videoinput').length);
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? pt('camDenied') : pt('camUnavailable'));
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => blob && onShot(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })),
      'image/jpeg',
      0.9,
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={pt('takePhoto')}>
      {error ? (
        <p className="error cam-error">{error}</p>
      ) : (
        <div className="cam">
          <video ref={video} className="cam-view" playsInline muted aria-label={pt('camPreview')} />
          {!ready && <p className="muted cam-wait">{pt('camStarting')}</p>}
        </div>
      )}
      <div className="cam-actions">
        {cameras > 1 && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            aria-label={pt('camSwitch')}
          >
            <SwitchCamera size={18} />
          </button>
        )}
        <button type="button" className="btn primary cam-shutter" onClick={shoot} disabled={!ready || !!error}>
          <Camera size={20} /> {pt('camShoot')}
        </button>
      </div>
    </Sheet>
  );
}
