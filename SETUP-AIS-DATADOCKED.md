# AIS Data Docked — configuração da v59

A v59 usa a API REST da **Data Docked** para buscar embarcações por área diretamente no mapa AIS.

## 1. Variável na Vercel

No projeto `paineldebordo` abra:

**Settings → Environment Variables → Add Environment Variable**

Crie:

```text
DATADOCKED_API_KEY
```

Cole no valor a chave mostrada em **Data Docked → Minha chave de API**.

Use o tipo **Secret** e marque **Production**. Se usar Preview, marque Preview também.

Depois faça **Redeploy**.

## 2. Como funciona no painel

A chave nunca é enviada ao navegador. O painel chama `/api/ais` no servidor da Vercel e somente o servidor adiciona o header `x-api-key` para a Data Docked.

A tela AIS permite:

- localizar pelo GPS do celular;
- mover o mapa para qualquer região;
- escolher raio de 10 km, 25 km ou 50 km;
- tocar em **Buscar barcos**;
- mostrar nome, MMSI, tipo, velocidade, rumo e proa;
- filtrar barcos em movimento ou parados;
- usar Carta Raster DHN/CHM, Oceano ou mapa comum.

## 3. Atenção aos créditos

O endpoint **Vessels by Area** custa **10 créditos por consulta**. A conta gratuita mostrada no painel Data Docked começa com 20 créditos, portanto não existe atualização automática contínua na v59: a consulta é manual para evitar gastar créditos sem perceber.

O endpoint de saldo é gratuito e o painel mostra os créditos restantes no topo.

## 4. Cobertura

O endpoint de área da Data Docked está documentado atualmente como **AIS terrestre**, com raio máximo de 50 km. Em mar aberto pode haver poucos ou nenhum barco se não houver cobertura terrestre para a área consultada.
