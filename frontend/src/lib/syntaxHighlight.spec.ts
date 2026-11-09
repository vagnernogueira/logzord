import { describe, expect, it } from 'vitest'
import { syntaxHighlight } from './syntaxHighlight'

describe('syntaxHighlight', () => {
  it('escapa HTML do conteúdo e mantém os realces', () => {
    const html = syntaxHighlight(`[ERROR] ORA-00942 <img src=x onerror="alert('x')"> & fim`)

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; fim')
    expect(html).toContain('<span class="lz-level lz-level--error">[ERROR]</span>')
    expect(html).toContain('<span class="lz-level lz-level--ora">ORA-00942</span>')
  })
})
