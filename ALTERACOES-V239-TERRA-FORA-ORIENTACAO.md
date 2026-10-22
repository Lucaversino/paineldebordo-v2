# V239 — Correção da orientação Terra/Fora

- Corrigida a direção dos deslocamentos transversais em função do rumo geográfico da referência.
- Em rumos ao sul (ex.: 225° magnéticos), a direção do afastamento de fora/leste era invertida.
- Agora o slot positivo fica geograficamente a leste e o negativo a oeste, inclusive com apenas uma ponta.
- O chefe continua na posição original e os espaçamentos permanecem 0,25 MN por barco.
- Exportação GPX de marcas e rotas usa as mesmas coordenadas corrigidas da tabela.
- Para rumos muito próximos de Leste/Oeste puro (90° e 270° verdadeiros), a geração com múltiplos barcos bloqueia uma classificação ambígua, evitando chamar de leste/oeste um afastamento Norte/Sul.

## Testes
Geometria compilada com TypeScript e testada em Node para rumos verdadeiros aproximados 208,54°, 33,22°, 135° e 315°, com 0,25 MN entre as faixas: todos passaram. Build integrado do Next.js não executado.
