const path = require('node:path');

/**
 * Electron Builder configuration for the Stina desktop app.
 * - Assumes renderer build output in apps/desktop/dist (vite build)
 * - Assumes main/preload output in apps/desktop/dist-electron (vite-plugin-electron/simple)
 * - Copies icon assets so resolveAppIcon() finds PNGs at resources/assets/icons
 */
module.exports = {
  appId: 'com.einord.stina',
  productName: 'Stina',
  directories: {
    output: 'dist-electron-builder',
    buildResources: 'apps/desktop/assets',
  },
  files: [
    'apps/desktop/dist/**',
    'apps/desktop/dist-electron/**',
    'apps/desktop/package.json',
  ],
  extraMetadata: {
    main: 'apps/desktop/dist-electron/main.js',
  },
  extraResources: [
    {
      from: 'apps/desktop/assets/icons',
      to: 'assets/icons',
    },
  ],
  mac: {
    category: 'public.app-category.productivity',
    icon: path.join('apps/desktop/assets/icons/stina-icon.icns'),
    target: ['dmg', 'zip'],
    artifactName: 'Stina-${version}-mac.${ext}',
  },
  win: {
    icon: path.join('apps/desktop/assets/icons/stina-icon.ico'),
    target: ['nsis', 'zip'],
    artifactName: 'Stina-${version}-win.${ext}',
  },
  linux: {
    category: 'Utility',
    icon: 'apps/desktop/assets/icons',
    target: ['AppImage', 'tar.gz'],
    artifactName: 'Stina-${version}-linux.${ext}',
  },
};
