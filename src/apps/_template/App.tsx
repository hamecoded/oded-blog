import { useApp } from '../../lib/app';

/** The app itself. The page around it (top bar, back link, title) comes from src/pages/Apps.tsx. */
export default function App() {
  const { prefs } = useApp();
  return <p dir="auto">{prefs.uiLang === 'he' ? 'שלום מהאפליקציה החדשה.' : 'Hello from the new app.'}</p>;
}
