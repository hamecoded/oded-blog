import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { ADMIN_EMAIL } from '../lib/util';
import { usePageTitle } from './usePageTitle';

// Keep in step with what the app really stores (supabase/schema.sql, AppProvider.tsx, sanitize.ts, fonts.ts).
// Google's sign-in setup links here (Google Auth Platform → Branding → privacy policy link). A Meta app would
// link to /privacy and /privacy#delete (privacy policy / data deletion instructions) if Facebook sign-in returns.
// The text is long-form, so each language is a block here rather than dictionary entries in i18n.ts.
const UPDATED = '2026-11-08';
// 2026-11-08: Cloudflare Turnstile on sign-up/sign-in; sign-ups with machine-made names are held for review.

const mail = (
  <a href={`mailto:${ADMIN_EMAIL}`} dir="ltr">
    {ADMIN_EMAIL}
  </a>
);

function English() {
  return (
    <>
      <p>
        oded.me is a personal blog run by Oded. This page explains what the blog stores about you and why. Questions or
        requests: {mail}.
      </p>
      <h2>Reading the blog</h2>
      <p>
        You can read public posts without an account. The blog has no advertising, no analytics and no tracking cookies.
        The hosting service may keep standard server logs, such as IP addresses, to deliver the site.
      </p>
      <p>
        Some parts load from other services, which see your IP address and follow their own privacy policies: fonts from
        Google Fonts, and videos or audio embedded in posts from YouTube, Spotify, SoundCloud, Mixcloud or Archive.org.
      </p>
      <h2>Your account</h2>
      <p>When you sign up, the blog stores:</p>
      <ul>
        <li>your email address, display name and username;</li>
        <li>your role (for example reader or commenter) and any role you request;</li>
        <li>when you signed up and last signed in.</li>
      </ul>
      <p>
        To keep automated sign-ups out, the sign-up and sign-in forms may run Cloudflare Turnstile, a check that you're
        a person: Cloudflare sees your IP address and browser details for that check, under its own privacy policy. A
        new account whose name looks machine-made waits for the manager's approval before it can be used.
      </p>
      <p>
        If you sign up with email, your password is stored only in hashed form. If you sign in with Google, the blog
        receives your name, email address and profile picture from Google. It never receives your Google password, does
        not see your contacts, and never posts anything on your behalf.
      </p>
      <h2>What you add</h2>
      <p>
        Comments, likes and role requests are stored with your account, and so are posts and groups if you write for the
        blog.
      </p>
      <p>
        Some pages of the site let you comment or like without an account. There, the name you type is shown publicly
        next to your comment, and your browser keeps that name and a random code, so your like counts once and you can
        take it back. Only a scrambled form of that code is stored on the server. To have such a comment removed, email{' '}
        {mail}.
      </p>
      <p>
        Signed-in users can keep a private list of things they own in the Possessions app, including spreadsheets they
        import and photos they add. Only you can see your list; not other users and not the blog's manager. Photos are
        stored at a long, random web address that isn't listed anywhere, but anyone who has that exact address can open
        the photo.
      </p>
      <h2>Who can see it</h2>
      <p>
        Your display name and username appear next to your comments and posts. Your email address is visible only to the
        blog's manager. Your information is never sold or shared for marketing.
      </p>
      <h2>Where it is kept</h2>
      <p>
        Accounts, posts, comments and uploads are stored with Supabase, which provides the blog's database and sign-in.
        Your browser keeps your display settings (language, font, theme) and your sign-in session in local storage on your
        device.
      </p>
      <h2 id="delete">Deleting your data</h2>
      <p>
        To delete your account, email {mail}. Deleting it removes your account, comments, likes, role requests and possessions list. Posts
        you wrote stay on the blog under the manager's name unless you ask for them to be removed too.
      </p>
      <h2>Changes</h2>
      <p>If this page changes, the date below changes with it.</p>
    </>
  );
}

function Hebrew() {
  return (
    <>
      <p>
        oded.me הוא בלוג אישי שמנהל עודד. בעמוד הזה מוסבר מה הבלוג שומר עליכם ולמה. לשאלות ובקשות: {mail}.
      </p>
      <h2>קריאה בבלוג</h2>
      <p>
        אפשר לקרוא פוסטים ציבוריים בלי חשבון. אין בבלוג פרסומות, אין כלי ניתוח ואין עוגיות מעקב. שירות האחסון עשוי לשמור
        יומני שרת רגילים, כמו כתובות IP, כדי להגיש את האתר.
      </p>
      <p>
        חלקים מסוימים נטענים משירותים אחרים, שרואים את כתובת ה-IP שלכם ופועלים לפי מדיניות הפרטיות שלהם: גופנים מ-Google
        Fonts, וסרטונים או קטעי שמע שמוטמעים בפוסטים מ-YouTube,‏ Spotify,‏ SoundCloud,‏ Mixcloud או Archive.org.
      </p>
      <h2>החשבון שלכם</h2>
      <p>כשנרשמים, הבלוג שומר:</p>
      <ul>
        <li>כתובת אימייל, שם תצוגה ושם משתמש;</li>
        <li>התפקיד שלכם (למשל קורא או מגיב) וכל תפקיד שביקשתם;</li>
        <li>מתי נרשמתם ומתי התחברתם לאחרונה.</li>
      </ul>
      <p>
        כדי למנוע הרשמות אוטומטיות, טופסי ההרשמה והכניסה עשויים להפעיל את Cloudflare Turnstile, בדיקה שאתם בני אדם:
        Cloudflare רואה לשם כך את כתובת ה-IP ופרטי הדפדפן, לפי מדיניות הפרטיות שלו. חשבון חדש ששמו נראה כאילו נוצר
        במכונה ממתין לאישור המנהל לפני שאפשר להשתמש בו.
      </p>
      <p>
        בהרשמה עם אימייל, הסיסמה נשמרת רק בצורה מוצפנת (hash). בכניסה עם Google, הבלוג מקבל מ-Google את השם,
        כתובת האימייל ותמונת הפרופיל שלכם. הוא לא מקבל את הסיסמה שלכם שם, לא רואה את אנשי הקשר שלכם ואף פעם לא מפרסם דבר
        בשמכם.
      </p>
      <h2>מה שאתם מוסיפים</h2>
      <p>תגובות, לייקים ובקשות תפקיד נשמרים עם החשבון שלכם, וכך גם פוסטים וקבוצות אם אתם כותבים בבלוג.</p>
      <p>
        בחלק מעמודי האתר אפשר להגיב או לסמן לייק בלי חשבון. שם, השם שאתם כותבים מוצג לכולם ליד התגובה, והדפדפן שלכם שומר
        את השם הזה וקוד אקראי, כדי שהלייק ייספר פעם אחת ותוכלו לבטל אותו. בשרת נשמרת רק צורה מוצפנת של הקוד. כדי להסיר
        תגובה כזאת, כתבו אל {mail}.
      </p>
      <p>
        משתמשים מחוברים יכולים לנהל באפליקציית "רכוש" רשימה פרטית של דברים שבבעלותם, כולל גיליונות שהם מייבאים ותמונות
        שהם מוסיפים. רק אתם רואים את הרשימה שלכם: לא משתמשים אחרים ולא מנהל הבלוג. התמונות נשמרות בכתובת אינטרנט ארוכה
        ואקראית שלא מופיעה בשום מקום, אבל מי שיש לו את הכתובת המדויקת יכול לפתוח את התמונה.
      </p>
      <h2>מי רואה מה</h2>
      <p>
        שם התצוגה ושם המשתמש שלכם מופיעים ליד התגובות והפוסטים שלכם. כתובת האימייל גלויה רק למנהל הבלוג. המידע שלכם לא
        נמכר ולא מועבר לשיווק.
      </p>
      <h2>איפה המידע נשמר</h2>
      <p>
        חשבונות, פוסטים, תגובות וקבצים שהועלו נשמרים ב-Supabase, שמספק לבלוג את מסד הנתונים ואת מערכת הכניסה. הדפדפן שלכם
        שומר במכשיר את הגדרות התצוגה (שפה, גופן, ערכת צבעים) ואת חיבור הכניסה שלכם.
      </p>
      <h2 id="delete">מחיקת המידע</h2>
      <p>
        כדי למחוק את החשבון, כתבו אל {mail}. המחיקה מסירה את החשבון, התגובות, הלייקים, בקשות התפקיד ורשימת הרכוש. פוסטים שכתבתם נשארים
        בבלוג בשם המנהל, אלא אם תבקשו להסיר גם אותם.
      </p>
      <h2>שינויים</h2>
      <p>אם העמוד הזה ישתנה, התאריך למטה ישתנה איתו.</p>
    </>
  );
}

/** /privacy — what the blog stores. Shown in the interface language. */
export function PrivacyPage() {
  const { t, prefs } = useApp();
  usePageTitle(t('privacy'));
  const he = prefs.uiLang === 'he';
  return (
    <article className="privacy prose" dir={he ? 'rtl' : 'ltr'} lang={prefs.uiLang}>
      <h1>{t('privacy')}</h1>
      {he ? <Hebrew /> : <English />}
      <p className="muted">
        {t('lastUpdated')} <time dateTime={UPDATED}>{UPDATED}</time>
      </p>
      <p>
        <Link to="/">{t('backHome')}</Link>
      </p>
    </article>
  );
}
