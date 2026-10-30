# Painel de Bordo V242 — Capturas por viagem e 3D limpo

## Alterações principais

### 1) Capturas organizadas em pastas de viagem
- A aba **Capturas** agora segue o mesmo padrão visual da aba **Largadas**.
- Cada viagem aparece em sua própria pasta.
- A viagem em andamento fica destacada e aberta automaticamente.
- Cada pasta mostra:
  - quantidade de capturas;
  - período das capturas;
  - totais por categoria (**Corvina**, **Mistura** e **Descarte**);
  - tabela completa com data, largada, espécie, categoria, condição, peso, observação e ações.

### 2) Espécies capturadas no mês divididas por categoria
- Foi criada uma seção de resumo mensal na aba **Capturas**.
- A seção mostra o mês atual com três blocos:
  - **Corvina**;
  - **Mistura**;
  - **Descarte**.
- Em cada bloco são listadas as espécies registradas naquele mês e o total em kg por espécie.

### 3) Viewer 3D limpo nas Espécies
- O componente 3D das espécies foi simplificado para exibir **somente o peixe 3D**.
- Removidos do bloco 3D:
  - cabeçalho;
  - moldura visual;
  - créditos e textos extras.
- O embed foi ajustado para usar visual limpo, transparente e sem interface aparente do Sketchfab, servindo como padrão para futuros modelos 3D.

## Observações técnicas
- O agrupamento das capturas por viagem usa a relação da captura com a largada (`fishingSetId`) e, a partir dela, identifica a viagem correspondente.
- As categorias da captura continuam respeitando a lógica atual do painel:
  - padrão = **Corvina**;
  - `MIXTURE` = **Mistura**;
  - `DISCARD` = **Descarte**.
- O resumo mensal considera o mês atual com base na data da captura (`caughtAt`).
