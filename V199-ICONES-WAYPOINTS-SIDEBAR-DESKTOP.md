# V199 — Ícones de Waypoints + Scroll Desktop

- Corrige waypoints oficiais no AIS quando aparecia somente o nome.
- Caveira, Pedra/Laje, Parcel e Naufrágio agora usam SVG inline autocontido, evitando falhas de arquivo/cache.
- Ícones redesenhados como pins 96x96 com margem interna e ponta ancorada na coordenada.
- Camada oficial não usa declutter para nunca esconder o símbolo por colisão com texto.
- Z-index elevado para manter os waypoints acima de carta/batimetria.
- Sidebar ganha rolagem vertical e scrollbar apenas no desktop (>= 901px).
- Regras mobile V182/V183/V184 de Android/iPhone não foram alteradas.
- Cache PWA atualizado para V199.
- Arquivos SVG/PNG de referência também incluídos em `/public/icons/official-waypoints/v199/`.
