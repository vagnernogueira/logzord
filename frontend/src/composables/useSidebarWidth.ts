import { ref, watch } from 'vue'

export const SIDEBAR_WIDTH_STORAGE_KEY = 'logzord-sidebar-width'

// Largura da sidebar arrastada pelo sash do vsshellcode (vsshellcode#20).
// undefined = padrão do CSS da casca (duplo clique no sash volta a ele).
function initialWidth(): number | undefined {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (saved > 0) return saved
  } catch {
    // storage indisponível: largura padrão
  }
  return undefined
}

export function useSidebarWidth() {
  const width = ref<number | undefined>(initialWidth())
  watch(width, (value) => {
    try {
      if (value === undefined) localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY)
      else localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(value))
    } catch {
      // largura só não persiste
    }
  })
  return width
}
