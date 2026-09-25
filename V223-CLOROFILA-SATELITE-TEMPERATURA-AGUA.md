# V223 — Clorofila atual por satélite + temperatura da água

Alterações desta edição foram mantidas restritas ao pedido, preservando a V222.

## 1. Clorofila ATUAL / satélite

- Criado um endpoint independente para a leitura atual por **Copernicus Marine Ocean Colour NRT**, produto de observação por satélite multissensor e não o modelo de previsão.
- Dataset atual: `cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D` (`CHL`).
- O sistema procura a observação válida mais recente dentro de uma janela operacional recente e mantém a data real em **Observado**.
- O mesmo produto alimenta o pequeno grid do mapa de clorofila atual.
- **NOAA CoastWatch / VIIRS continua como fallback**. O fallback também foi reforçado para procurar as últimas observações válidas quando a célula do último dia estiver vazia por nuvens ou atraso de processamento.
- Nenhuma leitura prevista é apresentada como se fosse observação atual.

## 2. Previsão de clorofila

- **NÃO ALTERADA.**
- O endpoint `api/copernicus-chlorophyll.py`, o dataset de previsão NEMO/PISCES e a montagem dos 7 dias foram preservados.

## 3. Cards da previsão semanal

- A temperatura da superfície do mar já recebida da fonte marítima continua sendo usada.
- O rótulo foi deixado explícito como **TEMP. ÁGUA** e **superfície do mar**.

## 4. Versão / PWA

- `package.json`: `223.0.0`.
- Cache do service worker atualizado para `painel-bordo-v223-clorofila-satelite`.
- Nova função Python registrada no `vercel.json` com o mesmo tempo máximo do endpoint Copernicus já existente.

## Preservado

AIS, créditos, viagens, largadas, capturas, espécies, histórico, relatórios, navegação, login, previsão meteorológica, ondas, correntes, maré e a **previsão de clorofila existente** não foram redesenhados nem removidos nesta edição.
