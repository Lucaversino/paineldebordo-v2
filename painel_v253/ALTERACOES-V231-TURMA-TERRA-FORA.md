# V231 — Turma por fora / terra com chefe central

## Mudança principal
A página **Posição** deixou de usar uma lista única genérica e passou a trabalhar com a lógica operacional informada pelo usuário:

- **Chefe da turma** no centro
- **Turma de fora (Leste)** em uma lista separada
- **Turma de terra (Oeste)** em outra lista separada

## Ajustes aplicados
- Campo próprio para o **chefe / referência central**.
- Quantidade separada de barcos para:
  - turma de fora (leste)
  - turma de terra (oeste)
- Duas listas distintas de mestres.
- Ordem das distâncias a partir do chefe:
  - 0,25 MN
  - 0,50 MN
  - 0,75 MN
  - etc.
- Tabela final com faixas nomeadas como:
  - **Oeste / terra**
  - **Chefe / referência**
  - **Leste / fora**
- Compartilhamento e GPX com identificação da faixa.
- Compatibilidade de carregamento com turmas salvas da versão anterior.

## Arquivos alterados
- `components/PositionPage.tsx`
- `app/globals.css`

## Observação
Não foi possível executar o build local completo neste ambiente porque as dependências de runtime do Next.js não estavam instaladas (`next: not found`).
