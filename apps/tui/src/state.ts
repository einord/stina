import type { Interaction } from '@stina/chat';
import type { ViewKey } from './status.js';
import type { ThemeKey } from './theme.js';

type State = {
  themeKey: ThemeKey;
  view: ViewKey;
  menuVisible: boolean;
  todosVisible: boolean;
  calendarVisible: boolean;
  chatAutoScroll: boolean;
  warningMessage: string | null;
  isDebugMode: boolean;
  interactions: Interaction[];
  streamBuffers: Map<string, string>;
  navViewKeys: string[];
};

const state: State = {
  themeKey: 'light',
  view: 'chat',
  menuVisible: false,
  todosVisible: false,
  calendarVisible: false,
  chatAutoScroll: true,
  warningMessage: null,
  isDebugMode: false,
  interactions: [],
  streamBuffers: new Map<string, string>(),
  navViewKeys: [],
};

export function getState(): State {
  return state;
}

export function setThemeKey(next: ThemeKey) {
  state.themeKey = next;
}

export function setView(next: ViewKey) {
  state.view = next;
}

export function setMenuVisible(visible: boolean) {
  state.menuVisible = visible;
}

export function setTodosVisible(visible: boolean) {
  state.todosVisible = visible;
}

export function setCalendarVisible(visible: boolean) {
  state.calendarVisible = visible;
}

export function setChatAutoScroll(enabled: boolean) {
  state.chatAutoScroll = enabled;
}

export function setWarningMessage(message: string | null) {
  state.warningMessage = message;
}

export function setDebugMode(enabled: boolean) {
  state.isDebugMode = enabled;
}

export function setInteractions(list: Interaction[]) {
  state.interactions = list;
}

export function setNavViewKeys(keys: string[]) {
  state.navViewKeys = keys;
}

export function getNavViewKeys(): string[] {
  return state.navViewKeys;
}
