import { initI18n } from '@stina/i18n';
import { createApp } from 'vue';

import App from './App.vue';
import './styles/index.css';

// Initialize language from settings before mounting the app
(async () => {
  try {
    const savedLang = await window.stina.settings.getLanguage();
    if (savedLang) {
      initI18n(savedLang);
    } else {
      // No saved preference, auto-detect and save
      initI18n();
      const { getLang } = await import('@stina/i18n');
      const detectedLang = getLang();
      await window.stina.settings.setLanguage(detectedLang);
    }
  } catch (err) {
    console.warn('[renderer] Failed to load language setting:', err);
    initI18n(); // Fallback to auto-detection
  }

  const root = document.documentElement;
  const isMac = /mac/i.test(navigator.platform);
  if (isMac) {
    root.classList.add('platform-mac');
    root.style.setProperty('--titlebar-inset', '40px');
  } else {
    root.style.setProperty('--titlebar-inset', '0px');
  }

  createApp(App).mount('#app');
})();
