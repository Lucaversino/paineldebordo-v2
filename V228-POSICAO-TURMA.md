# V228 — Página Posição (primeira versão experimental)

## Disponível nesta versão
- Página **Posição** no menu abaixo de Meus créditos, inicialmente desativada.
- Admin: botão de ligar/desligar em **Admin — AIS, IA e Créditos**. Estado salvo em `billing_settings` (chave `POSITION_PAGE_ENABLED`). Requer banco e sessão autenticada.
- Posição de referência: duas pontas no formato do projeto, GG°MMMM (centésimos de minuto), sul/oeste.
- Rumo verdadeiro de referência e espaçamento entre faixas em **milhas náuticas**, de 0,01 a 20 MN.
- Geração de pontas deslocadas perpendicularmente ao rumo de referência usando deslocamento esférico WGS84 aproximado.
- Turma de 1 a 60 barcos, nome do mestre para cada faixa, barco central e faixas A/B.
- Indicação de distância e rumo efetivo entre as duas pontas. Alerta quando a diferença do rumo informado supera 2 graus.
- Exportação GPX para TimeZero (rotas por embarcação), GPX individual e PDF geral, compartilhamento/cópia da posição individual.
- Salvar/abrir/excluir turmas **no navegador local** (`localStorage`). Não há sincronização entre usuários ou aparelhos nesta versão.

## Atenção operacional
O cálculo não é garantia de separação entre redes nem substitui carta, GPS/plotter ou navegação oficial. Não estima a curvatura real das redes, abatimento por corrente, profundidade, abertura, aproximação ou colisões. Confirmar coordenadas, afastamentos e orientação com o chefe da turma, comparar com TimeZero e testar em terra antes de uso real.

## Questões pendentes para futura validação
- Definir se `25 décimos` na operação equivale a **2,5 MN**, 2,5 minutos de latitude ou outra unidade.
- Confirmar orientação de ponta sul/norte por convenção de rede, o que varia com o rumo.
- Configurar uma referência/chefe de turma com índice flexível; atualmente a referência é o barco central da lista.
- Persistência segura no Supabase, compartilhar turmas entre usuários e controle por proprietário.
- Revisar GPX importado no TimeZero V4 real; GPX é suportado oficialmente, mas não foi efetuado teste de integração.

## Arquivos principais
- `components/PositionPage.tsx`
- `lib/positionGeometry.ts`
- `app/api/position-feature/route.ts`
- `components/AdminBillingPage.tsx`
- `app/page.tsx`
- `app/globals.css`

Não houve instalação de novas dependências ou alteração de tabelas.
