function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// O resultado vai para v-html: escapar o conteúdo do log antes de injetar os spans de realce (#21).
export function syntaxHighlight(content: string): string {
  return escapeHtml(content)
    .replace(/\[ERROR\]/g, '<span class="lz-level lz-level--error">[ERROR]</span>')
    .replace(/\[WARN\]/g, '<span class="lz-level lz-level--warn">[WARN]</span>')
    .replace(/\[INFO\]/g, '<span class="lz-level lz-level--info">[INFO]</span>')
    .replace(/(ORA-\d+)/g, '<span class="lz-level lz-level--ora">$1</span>')
}
