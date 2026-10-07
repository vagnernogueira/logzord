// Compressão nativa do browser (CompressionStream), sem dependência extra.
export async function gzipBlob(blob: Blob): Promise<Blob> {
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'))
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' })
}
