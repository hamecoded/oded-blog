/**
 * Background removal for item photos, in the browser, with IMG.LY's background-removal library (AGPL-3.0; see
 * README "Licences"). Loaded only when someone asks for it (App.tsx imports this file lazily), because the
 * library and its model are large: the model and the AI runtime (about 100 MB) download from IMG.LY's server on
 * first use and the browser caches them after that. Model "isnet_fp16" (the library's "medium"): the quantized
 * "isnet_quint8" (half the download) left stray bits of busy backgrounds in testing.
 * VITE_BG_REMOVAL_PATH can point at a self-hosted copy of @imgly/background-removal-data's dist folder.
 */
import { removeBackground } from '@imgly/background-removal';

export type CutOutProgress = { phase: 'download'; fraction: number } | { phase: 'working' };

export async function cutOut(src: Blob | string, onProgress: (p: CutOutProgress) => void): Promise<File> {
  const downloads = new Map<string, [number, number]>();
  const publicPath = import.meta.env.VITE_BG_REMOVAL_PATH as string | undefined;
  const blob = await removeBackground(src, {
    ...(publicPath ? { publicPath: new URL(publicPath, location.href).href } : {}),
    model: 'isnet_fp16',
    // WebP keeps the transparency and stays small; browsers that can't write WebP fall back to PNG.
    output: { format: 'image/webp', quality: 0.8 },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith('fetch:')) {
        downloads.set(key, [current, total]);
        let done = 0;
        let all = 0;
        downloads.forEach(([c, t]) => {
          done += c;
          all += t;
        });
        onProgress({ phase: 'download', fraction: all ? done / all : 0 });
      } else onProgress({ phase: 'working' });
    },
  });
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return new File([blob], `cutout.${type === 'image/webp' ? 'webp' : 'png'}`, { type });
}
