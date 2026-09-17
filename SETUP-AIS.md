# Configuração do AIS — v56

A aba **AIS** usa a API gratuita de streaming do **AISStream.io**.

## 1. Criar a chave

1. Entre em `https://aisstream.io/`.
2. Crie/entre na conta e gere uma API key na área **Account**.
3. Copie a chave.

## 2. Configurar na Vercel

No projeto `paineldebordo`:

**Settings → Environment Variables → Add Environment Variable**

- Type: `Secret`
- Key: `AISSTREAM_API_KEY`
- Value: sua chave do AISStream
- Environment: `Production` (e Preview/Development, se quiser)

Salve e faça **Redeploy**.

## 3. Como funciona

O navegador **não recebe a chave AIS**. A página abre um WebSocket para `/api/ais-stream`; a Function da Vercel autentica a sessão do Painel e conecta no AISStream pelo servidor. Quando o mapa muda de área, o sistema atualiza a bounding box da assinatura AIS.

A Vercel pode encerrar conexões WebSocket ao atingir o limite da Function; a página reconecta automaticamente e volta a assinar a área atual.

## Recursos da página AIS

- carta oceânica Esri/GEBCO + sinais OpenSeaMap;
- mapa alternativo OpenStreetMap;
- posições AIS ao vivo;
- nome/MMSI;
- velocidade (kn), rumo e proa;
- status de navegação;
- busca e filtros;
- lista dos barcos mais próximos do centro do mapa;
- +/− zoom e atualização da área;
- geolocalização do celular, quando autorizada;
- marcador da posição GPS;
- painel de detalhes ao selecionar uma embarcação.

> AIS pode ter atraso, falhas de cobertura e embarcações sem transmissão. Não use como única referência de navegação ou anticolisão.
