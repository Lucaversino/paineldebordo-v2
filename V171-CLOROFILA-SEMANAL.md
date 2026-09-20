> **SUPERADA PELA V172:** a integração paga via Amentum foi removida. A versão atual consulta diretamente o Copernicus Marine.

# V171 — Clorofila semanal em Ventos e Mar

- Open-Meteo Weather/Marine ampliado para 7 dias.
- Novo bloco de 7 cards diários com vento, onda, temperatura e clorofila-a.
- Clorofila atual continua usando NOAA CoastWatch / VIIRS.
- A previsão de clorofila dos próximos dias usa Copernicus Marine / NEMO através da Amentum Ocean API.
- Configure no ambiente do servidor/Vercel: `AMENTUM_OCEAN_API_KEY`.
- Sem a chave, o painel não inventa valores futuros: mostra somente o valor observado disponível para hoje e informa que a previsão semanal está indisponível.
- Nenhuma função de AIS, GPS, créditos, pagamentos, rotas ou ícones foi alterada.
