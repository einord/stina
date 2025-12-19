import type blessed from 'blessed';

import type { ViewKey } from './status.js';
import type { UILayout } from './layout.js';

type KeybindingDeps = {
  screen: blessed.Widgets.Screen;
  input: blessed.Widgets.TextboxElement;
  layout: UILayout;
  getView: () => ViewKey;
  setView: (view: ViewKey) => void;
  toggleMenu: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  isMenuVisible: () => boolean;
  toggleTodos: () => void;
  toggleCalendar: () => void;
  applyThemeToggle: () => void;
  scrollChat: (delta: number) => void;
  pageSize: () => number;
};

export function registerKeybindings(deps: KeybindingDeps) {
  const {
    screen,
    input,
    layout,
    getView,
    setView,
    toggleMenu,
    openMenu,
    closeMenu,
    isMenuVisible,
    toggleTodos,
    toggleCalendar,
    applyThemeToggle,
    scrollChat,
    pageSize,
  } = deps;

  screen.key(['C-c'], () => process.exit(0));

  screen.key(['escape'], () => {
    toggleMenu();
  });

  screen.key(['q'], () => {
    if (isMenuVisible()) process.exit(0);
  });

  screen.key(['c'], () => {
    setView('chat');
    closeMenu();
  });

  screen.key(['x'], () => {
    setView('tools');
    closeMenu();
  });

  screen.key(['s'], () => {
    setView('settings');
    closeMenu();
  });

  screen.key(['t'], () => {
    toggleTodos();
  });

  screen.key(['k'], () => {
    toggleCalendar();
  });

  input.key(['escape'], () => {
    input.cancel();
    openMenu();
  });

  screen.key(['T'], () => applyThemeToggle());

  const pageUp = () => scrollChat(-pageSize());
  const pageDown = () => scrollChat(pageSize());

  screen.key(['pageup'], pageUp);
  screen.key(['pagedown'], pageDown);

  input.key(['pageup'], pageUp);
  input.key(['pagedown'], pageDown);
}
