// Parsing de LOG_CHUNK e guardas de offset da navegação (Play/Rewind/Fast Forward), sem Vue nem DOM.

const utf8 = new TextEncoder()
const utf8Decoder = new TextDecoder()

export function byteLength(value: string): number {
  return utf8.encode(value).length
}

// Remove os primeiros `bytes` bytes do texto (o trecho que já foi recebido).
export function dropLeadingBytes(value: string, bytes: number): string {
  return bytes > 0 ? utf8Decoder.decode(utf8.encode(value).slice(bytes)) : value
}

// Mantém só os primeiros `bytes` bytes do texto.
export function takeLeadingBytes(value: string, bytes: number): string {
  return utf8Decoder.decode(utf8.encode(value).slice(0, bytes))
}

export interface ParsedLine {
  content: string
  offset: number
}

// Separa o texto em linhas completas com o byte final de cada uma; o resto sem '\n' volta como pending.
// dropFirst descarta a primeira linha, parcial quando a leitura começa no meio dela (Rewind/FF).
export function splitLines(text: string, textStart: number, dropFirst = false) {
  const parts = text.split('\n')
  const pending = parts.pop() ?? ''
  const lines: ParsedLine[] = []
  let lineEndOffset = textStart
  parts.forEach((line, index) => {
    lineEndOffset += byteLength(line) + 1
    if (dropFirst && index === 0) return
    if (!line.trim()) return
    lines.push({ content: line, offset: lineEndOffset })
  })
  return { lines, pending }
}

export type NavigationState =
  | { kind: 'live' }
  // Rewind: lê [start, end) e pausa; end é o início do buffer atual.
  | { kind: 'rewind', start: number, end: number, text: string }
  // Fast Forward antes de o servidor revelar se saltou ou continuou do offset atual.
  | { kind: 'fastForward' }
  // Fast Forward com salto: acumula a cauda até o STREAM_END e só então substitui o buffer.
  | { kind: 'fastForwardJump', start: number, end: number, text: string }

export interface StreamCursor {
  // Byte do arquivo onde começa o próximo conteúdo inédito; null descarta chunks (pausado).
  // Chunks de streams anteriores ainda em voo trazem bytes reais do arquivo: sobreposição é recortada, lacuna é descartada.
  expectedOffset: number | null
  navigation: NavigationState
}

export type ChunkEffect =
  // Chunk descartado ou apenas acumulado no estado de navegação.
  | { kind: 'none' }
  // O Rewind alcançou o início do buffer: a página está completa em navigation.text.
  | { kind: 'finishRewind' }
  // Texto inédito do stream ao vivo, já sem a sobreposição.
  | { kind: 'append', text: string }

const NONE: ChunkEffect = { kind: 'none' }

// Aplica as guardas de offset a um LOG_CHUNK que termina no byte `end` e devolve o novo cursor e o que fazer com ele.
export function routeChunk(cursor: StreamCursor, content: string, end: number): { cursor: StreamCursor, effect: ChunkEffect } {
  const { expectedOffset, navigation } = cursor
  if (expectedOffset === null) return { cursor, effect: NONE }
  const start = end - byteLength(content)

  if (navigation.kind === 'fastForwardJump') {
    if (start > navigation.end || end <= navigation.end) return { cursor, effect: NONE }
    return {
      cursor: {
        expectedOffset,
        navigation: { ...navigation, text: navigation.text + dropLeadingBytes(content, navigation.end - start), end },
      },
      effect: NONE,
    }
  }

  if (end <= expectedOffset) return { cursor, effect: NONE }
  if (start > expectedOffset) {
    // Lacuna só é legítima no Fast Forward: o servidor pulou para a cauda do arquivo.
    if (navigation.kind === 'fastForward') {
      return { cursor: { expectedOffset, navigation: { kind: 'fastForwardJump', start, end, text: content } }, effect: NONE }
    }
    return { cursor, effect: NONE }
  }

  const text = dropLeadingBytes(content, expectedOffset - start)

  if (navigation.kind === 'rewind') {
    const rewind = { ...navigation, text: navigation.text + text }
    return {
      cursor: { expectedOffset: end, navigation: rewind },
      effect: end >= rewind.end ? { kind: 'finishRewind' } : NONE,
    }
  }

  // Continuação do offset atual: o Fast Forward sem salto vira um Play comum.
  return { cursor: { expectedOffset: end, navigation: { kind: 'live' } }, effect: { kind: 'append', text } }
}
