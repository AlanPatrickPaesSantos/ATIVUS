// Test setup global — roda antes de cada arquivo de teste (vitest setupFiles).
// O fetch do Node (undici) exige sua própria implementação de File ao
// interpretar FormData; jsdom fornece uma implementação incompatível.
import { File as NodeFile } from 'node:buffer'

Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: NodeFile })
//
// No jsdom, clicar num `<a href="blob:...">` (download gerado pelo
// ReportsPage.exportReport) dispara o aviso "Not implemented: navigation to
// another Document" — o jsdom não implementa navegação de documentos e o
// download real não acontece no ambiente de teste.
//
// Solução: tornar o click de âncoras um noop no ambiente de teste. O teste de
// Reports (`ReportsPage.test.tsx`) já mocka explicitamente o click para
// capturar o nome do arquivo; os demais testes apenas não querem navegar.

HTMLAnchorElement.prototype.click = function click() {
  // noop — jsdom não navega; evita "Not implemented: navigation to another Document"
}

export {}
