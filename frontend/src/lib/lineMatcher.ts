export type FilterMode = 'substring' | 'regex'

export interface LineMatcher {
  matches: (line: string) => boolean
  // Mensagem do SyntaxError quando a regex é inválida; null caso contrário.
  error: string | null
}

const matchAll = () => true
const matchNone = () => false

// Fonte única do critério de filtro: a tela (filteredLogs) e o Quadro (recordLine) usam o mesmo matcher.
// Ambos os modos são case-sensitive; regex inválida não casa nada, para o Quadro conter só o que a tela mostra.
export function makeLineMatcher(text: string, mode: FilterMode): LineMatcher {
  if (!text) return { matches: matchAll, error: null }
  if (mode === 'substring') return { matches: line => line.includes(text), error: null }
  try {
    const regex = new RegExp(text)
    return { matches: line => regex.test(line), error: null }
  } catch (err) {
    return { matches: matchNone, error: (err as Error).message }
  }
}
