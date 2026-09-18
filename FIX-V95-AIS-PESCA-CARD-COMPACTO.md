# V95 — AIS pesca em laranja + card compacto

- Embarcações identificadas como pesca passam a usar marcador laranja no mapa.
- A identificação considera tipo AIS de pesca quando disponível e status navegacional "Em pesca".
- A camada AISStream passa a ouvir também dados estáticos para aproveitar o tipo de embarcação quando recebido.
- VesselAPI repassa o tipo da embarcação quando o provedor disponibiliza esse campo.
- Ao tocar em um barco no mapa, abre um card compacto e legível sobre a carta.
- O card mostra posição no formato operacional `25º 4565 S / 46º 3545 W`, data e hora da posição, velocidade em MN/h, rumo e fonte.
- Mantidas todas as buscas, créditos e fallbacks existentes.
