import { Camera, Check, ImageUp, Trash2, Undo2, Wand2 } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Possession } from '../../lib/types';
import { usePt } from './strings';

/**
 * An item's photo: shown large when there is one, with Take a photo, Choose a file, Remove background (with Undo)
 * and Remove; plus the "remove backgrounds automatically" setting.
 */
export function PhotoSheet({
  item,
  busy,
  onClose,
  onCamera,
  onChoose,
  onRemove,
  onCutOut,
  cutting,
  onUndo,
  autoCutOut,
  onAutoCutOut,
}: {
  item: Possession | null;
  busy: boolean;
  onClose: () => void;
  onCamera: () => void;
  onChoose: () => void;
  onRemove: () => void;
  onCutOut: () => void;
  /** What background removal is doing right now (shown on its button), or null. */
  cutting: string | null;
  /** Restores the photo from before the last background removal, when there is one. */
  onUndo?: () => void;
  autoCutOut: boolean;
  onAutoCutOut: (on: boolean) => void;
}) {
  const pt = usePt();
  const has = !!item?.image_url;
  const working = busy || !!cutting;
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.title || pt('photo')}>
      {has ? (
        <div className="ps-photo-box">
          <img className="ps-photo" src={item!.image_url!} alt={item!.title} />
          {cutting && (
            <div className="ps-working" role="status">
              <Wand2 size={18} /> {cutting}
            </div>
          )}
        </div>
      ) : (
        <p className="muted ps-none">{pt('photoNone')}</p>
      )}
      <div className="ps-photo-actions">
        {/* Once there's a photo, Done is the main action and taking another becomes secondary. */}
        <button type="button" className={`btn ${has ? 'ghost' : 'primary'}`} onClick={onCamera} disabled={working}>
          <Camera size={18} /> {busy ? pt('uploading') : pt('takePhoto')}
        </button>
        <button type="button" className="btn ghost" onClick={onChoose} disabled={working}>
          <ImageUp size={18} /> {has ? pt('replacePhoto') : pt('choosePhoto')}
        </button>
        {has && (
          <button type="button" className="btn ghost" onClick={onCutOut} disabled={working}>
            <Wand2 size={18} /> {pt('bgRemove')}
          </button>
        )}
        {onUndo && !cutting && (
          <button type="button" className="btn ghost" onClick={onUndo} disabled={working}>
            <Undo2 size={18} /> {pt('bgUndo')}
          </button>
        )}
        {has && (
          <button type="button" className="btn ghost danger" onClick={onRemove} disabled={working}>
            <Trash2 size={18} /> {pt('removePhoto')}
          </button>
        )}
      </div>
      {has && (
        <button type="button" className="btn primary block ps-done" onClick={onClose} disabled={working}>
          <Check size={18} /> {pt('photoDone')}
        </button>
      )}
      <label className="check ps-auto">
        <input type="checkbox" checked={autoCutOut} onChange={(e) => onAutoCutOut(e.target.checked)} />
        <span>
          {pt('bgAuto')}
          <small className="muted"> {pt('bgNote')}</small>
        </span>
      </label>
    </Sheet>
  );
}
