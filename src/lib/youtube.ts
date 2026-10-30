/**
 * Upload a recorded video straight from the browser to the signed-in user's YouTube channel.
 * Uses Google Identity Services (token flow, no backend) + the YouTube Data API resumable upload.
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth "Web application" client whose authorized JavaScript
 * origins include the blog's URL). See README → "YouTube uploads".
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export const youtubeEnabled = !!CLIENT_ID;

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string }) => void;
      }): { requestAccessToken(o?: { prompt?: string }): void };
    };
  };
}

let gisLoaded: Promise<GoogleOAuth> | null = null;
let cachedToken: { token: string; expires: number } | null = null;

function loadGis(): Promise<GoogleOAuth> {
  gisLoaded ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: GoogleOAuth }).google);
    s.onerror = () => {
      gisLoaded = null;
      reject(new Error('youtube/load'));
    };
    document.head.append(s);
  });
  return gisLoaded;
}

/** Opens Google's consent popup (must be called from a click). Cached for ~50 minutes. */
async function getToken(): Promise<string> {
  if (!CLIENT_ID) throw new Error('youtube/not-configured');
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'youtube/denied'));
        cachedToken = { token: r.access_token, expires: Date.now() + 50 * 60_000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(`youtube/${e.type}`)),
    });
    client.requestAccessToken();
  });
}

/** Warm up the Google script so the consent popup opens synchronously on click (iOS blocks late popups). */
export function preloadYouTube() {
  if (CLIENT_ID) loadGis().catch(() => {});
}

export async function uploadToYouTube(
  blob: Blob,
  meta: { title: string; description: string; privacy: YouTubePrivacy },
  onProgress: (fraction: number) => void,
): Promise<string> {
  const token = await getToken();
  const type = blob.type || 'video/webm';
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(blob.size),
    },
    body: JSON.stringify({
      snippet: { title: meta.title.slice(0, 100) || 'Video', description: meta.description.slice(0, 5000), categoryId: '22' },
      status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) throw new Error(`youtube/${init.status}: ${await init.text()}`);
  const uploadUrl = init.headers.get('Location');
  if (!uploadUrl) throw new Error('youtube/no-upload-url');

  // XHR (not fetch) so we can report upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const id = (JSON.parse(xhr.responseText) as { id?: string }).id;
        if (id) resolve(id);
        else reject(new Error('youtube/no-id'));
      } else reject(new Error(`youtube/${xhr.status}: ${xhr.responseText.slice(0, 300)}`));
    };
    xhr.onerror = () => reject(new Error('youtube/network'));
    xhr.send(blob);
  });
}
