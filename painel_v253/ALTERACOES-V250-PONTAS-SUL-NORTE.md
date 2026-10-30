# V250 — Ponta Sul / Ponta Norte

- Cadastro e edição de largadas: substituídos os títulos “Posição inicial” e “Posição final” por “PONTA SUL” e “PONTA NORTE”, respectivamente.
- Bordas, fundos e tipografia destacam as duas seções no desktop e celular.
- Tabela de largadas, relatório completo, PDF da viagem e PDF meteorológico: rótulos atualizados.
- Mantidos os nomes técnicos `startLatitude`, `startLongitude`, `endLatitude` e `endLongitude`, sem alterar a estrutura de dados, cálculos ou lógica de salvamento.

**Atenção:** os novos nomes são etiquetas fixas. A aplicação não confere se a latitude do primeiro ponto está realmente mais ao sul do segundo. Caso a rede seja lançada no sentido inverso, deve-se informar cada coordenada na ponta geográfica correspondente.
