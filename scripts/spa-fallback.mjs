// Static hosts without rewrite rules (GitHub Pages) serve 404.html for deep links
// like /posts/my-post — make it the app shell so client-side routing takes over.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
