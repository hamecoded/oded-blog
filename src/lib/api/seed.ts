import type { PostDraft, Profile } from '../types';

export const SEED_AUTHOR: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  display_name: 'צוות הבלוג',
  username: 'team',
  role: 'admin',
  created_at: new Date(0).toISOString(),
};

function art(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="980" cy="140" r="220" fill="#fff" fill-opacity=".12"/><circle cx="160" cy="560" r="180" fill="#fff" fill-opacity=".1"/>
<text x="600" y="345" font-family="Heebo, Arial, sans-serif" font-size="88" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const fig = (src: string, align: string, width: number, caption: string) =>
  `<figure data-type="figure" data-align="${align}" data-width="${width}" class="media align-${align}"${
    align === 'full' || align === 'hero' ? '' : ` style="width:${width}%"`
  }><img src="${src}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;

const math = (latex: string) =>
  `<span data-type="math" data-latex="${latex.replace(/"/g, '&quot;')}" dir="ltr">${latex}</span>`;

export function seedPosts(): (PostDraft & { slug: string })[] {
  return [
    {
      slug: 'ברוכים-הבאים',
      title: 'ברוכים הבאים לבלוג',
      excerpt: '',
      lang: 'he',
      status: 'published',
      visibility: 'public',
      allowed_users: [],
      allowed_groups: [],
      tags: ['ברוכים הבאים', 'מדריך'],
      cover_url: art('ברוכים הבאים', '#4f46e5', '#db2777'),
      content_html: `
<p dir="rtl">זהו פוסט לדוגמה שמציג את יכולות העורך. הבלוג תומך <strong>בעברית ובאנגלית</strong>, בכיווניות מימין לשמאל, ובשילוב שתי השפות in the same paragraph.</p>
<h2 dir="rtl">מה אפשר לעשות כאן?</h2>
<ul dir="rtl"><li><p dir="rtl">לכתוב טקסט עשיר עם <em>הדגשות</em>, <u>קו תחתון</u> ו<mark>סימון</mark>.</p></li><li><p dir="rtl">להוסיף תמונות ווידאו – בקישור או בהעלאה – ולבחור יישור.</p></li><li><p dir="rtl">לשלב נוסחאות בתוך השורה, למשל משפט פיתגורס ${math('a^2+b^2=c^2')} או ${math('\\frac{1}{n}\\sum_{i=1}^{n} x_i')}.</p></li></ul>
${fig(art('תמונה ממורכזת', '#0ea5e9', '#22c55e'), 'center', 75, 'תמונה ממורכזת ברוחב 75%')}
<p dir="rtl" style="text-align: center">פסקה ממורכזת. סמנו קטע טקסט כדי להוסיף הערה – מבקרים ומגיבים יכולים לדון על כל משפט.</p>
<blockquote dir="rtl"><p dir="rtl">„הכתיבה היא הציור של הקול.“ – וולטר</p></blockquote>`,
    },
    {
      slug: 'writing-in-two-directions',
      title: 'Writing in two directions',
      excerpt: '',
      lang: 'en',
      status: 'published',
      visibility: 'public',
      allowed_users: [],
      allowed_groups: [],
      tags: ['guide', 'rtl'],
      cover_url: null,
      content_html: `
${fig(art('LTR ⇄ RTL', '#f59e0b', '#ef4444'), 'inline-end', 40, 'Float image: text wraps around it')}
<p dir="ltr">Every paragraph keeps its own direction. English flows left-to-right while <span dir="rtl">עברית זורמת מימין לשמאל</span>, and the editor detects the direction automatically as you type.</p>
<p dir="ltr">Images can float beside text, sit centered, stretch full width or act as a title banner. Videos from YouTube, Vimeo or TikTok, or uploaded MP4 files, are responsive too.</p>
<h2 dir="ltr">Math, inline</h2>
<p dir="ltr">Euler's identity ${math('e^{i\\pi}+1=0')} renders with KaTeX and is stored as LaTeX source, so it stays readable offline.</p>
<p dir="ltr" style="text-align: justify">Use the floating button in the corner to change fonts, text size, theme and language, to search, or to export posts as PDF, HTML or Markdown.</p>`,
    },
    {
      slug: 'מכתב-בכתב-יד',
      title: 'מכתב בכתב יד',
      excerpt: 'דוגמה לפוסט עם גופן בסגנון כתב יד.',
      lang: 'he',
      status: 'published',
      visibility: 'public',
      allowed_users: [],
      allowed_groups: [],
      tags: ['גופנים', 'מדריך'],
      cover_url: null,
      content_html: `
<p dir="rtl"><span style="font-family: 'Playpen Sans Hebrew'; font-size: 22px">שלום חברים יקרים,</span></p>
<p dir="rtl"><span style="font-family: 'Playpen Sans Hebrew'">את הפסקה הזו כתבתי בגופן בסגנון כתב יד. בעורך אפשר לבחור גופן וגודל לכל קטע טקסט, ובתצוגה כל קורא יכול לבחור את גופן הקריאה הנוח לו.</span></p>
<p dir="rtl" style="text-align: left"><span style="font-family: 'Amatic SC'; font-size: 28px">בברכה, הצוות</span></p>`,
    },
  ];
}
