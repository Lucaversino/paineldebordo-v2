# V227 — Correção visual dos dropdowns

## Problema corrigido
Nos campos `select`, principalmente dentro dos modais, algumas listas nativas do navegador exibiam:
- fundo branco
- texto branco

Isso causava baixa legibilidade ao abrir opções como seleção de largada, espécies e outros cadastros.

## Correção aplicada
- Ajuste da cor dos itens `option` e `optgroup`.
- Garantia de contraste legível na lista aberta do `select`.
- Preservação do item selecionado com destaque visual.

## Arquivo alterado
- `app/globals.css`
