/**
 * Na versão publicada, `console.log`, `console.info` e `console.debug` não
 * fazem nada. Eram mais de 400 linhas no log só na abertura (uma por canal
 * registrado no guia), cada uma atravessando a ponte para o lado nativo para
 * ninguém ler. `console.warn` e `console.error` continuam: são eles que contam
 * um problema. Importado primeiro, antes de qualquer outro módulo do app.
 */
if (!__DEV__) {
  const nada = () => {};
  console.log = nada;
  console.info = nada;
  console.debug = nada;
}

export {};
