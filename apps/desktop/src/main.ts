import { createApp } from 'vue';

import App from './App.vue';
import './styles/index.css';

const root = document.documentElement;
const isMac = /mac/i.test(navigator.platform);
if (isMac) {
  root.classList.add('platform-mac');
  root.style.setProperty('--titlebar-inset', '40px');
} else {
  root.style.setProperty('--titlebar-inset', '0px');
}

createApp(App).mount('#app');
