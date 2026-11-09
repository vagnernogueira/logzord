import { ref, watch } from 'vue'

export type Theme = 'dark' | 'light'
export const THEME_STORAGE_KEY = 'logzord-theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // storage indisponível: segue o sistema
  }
  // matchMedia ausente (jsdom): cai no default escuro da casca.
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const theme = ref<Theme>(initialTheme())
watch(theme, (value) => document.documentElement.setAttribute('data-theme', value), { immediate: true })

export function useTheme() {
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.value)
    } catch {
      // preferência só não persiste
    }
  }
  return { theme, toggleTheme }
}
