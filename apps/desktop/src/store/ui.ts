import { defineStore } from "pinia";

type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
}

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("pro-assist-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const useUiStore = defineStore("ui", {
  state: (): UiState => ({
    theme: getInitialTheme(),
    commandPaletteOpen: false
  }),
  actions: {
    toggleTheme() {
      this.theme = this.theme === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pro-assist-theme", this.theme);
        document.documentElement.dataset.theme = this.theme;
      }
    },
    setCommandPalette(open: boolean) {
      this.commandPaletteOpen = open;
    }
  }
});
