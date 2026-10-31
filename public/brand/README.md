Official sign-in logos for the buttons on /login and /signup, one file per provider:

- `google.svg` — from Google's Sign in with Google branding kit
  (https://developers.google.com/identity/branding-guidelines → signin-assets.zip):
  `Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Pill, Platform=Android+Web.svg`,
  renamed, otherwise unchanged (sha256 01485c12…0ac325). Shown at 24 px.

Use the files exactly as the provider supplies them; their guidelines don't allow
redrawing or recolouring. A missing file just hides the icon (src/pages/Auth.tsx).
