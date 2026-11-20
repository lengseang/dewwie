import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Terminal font is bundled (previously loaded from Google Fonts, so offline it fell back to system fonts).
// Inter is not bundled: <body class="font-sans"> (Tailwind utility) overrides the base `font-family: Inter`,
// so the UI has always rendered the system sans-serif.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
