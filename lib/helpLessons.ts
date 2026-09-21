export type HelpLesson = { id: string; title: string; category: string; target: string; intro: string; steps: string[]; tip: string; visual: string };
export const helpLessons: HelpLesson[] = [
  {
    "id": "primeiros-passos",
    "title": "Comece por aqui",
    "category": "Começar",
    "target": "Embarcações",
    "intro": "O painel é o caderno da pescaria: primeiro o barco, depois a viagem e, dentro dela, cada largada.",
    "steps": [
      "Abra Embarcações e toque em Nova embarcação. Preencha os dados e salve.",
      "Abra Viagem atual e toque em Nova viagem. Escolha o barco, informe saída, porto e meta em kg.",
      "Deixe a viagem como Em andamento. Volte ao Dashboard para registrar o trabalho.",
      "Depois de salvar, confira se o nome do barco e da viagem estão certos."
    ],
    "tip": "Exemplo: a viagem é a pasta grande; as largadas são as folhas dentro dela. Cada viagem guarda suas próprias capturas.",
    "visual": "viagem"
  },
  {
    "id": "dashboard",
    "title": "Entenda a tela inicial",
    "category": "Começar",
    "target": "Dashboard",
    "intro": "Dashboard quer dizer resumo. É a tela para acompanhar como está a viagem.",
    "steps": [
      "Confira no alto qual viagem está em andamento.",
      "Leia separadamente os totais de corvina, mistura e descarte. Descarte não é peixe levado para venda.",
      "Compare o peso registrado com a meta. A barra mostra o avanço; ela não prevê quanto será pescado.",
      "Use os atalhos de largada e captura para anotar o serviço. Confira o gráfico e a lista depois de salvar."
    ],
    "tip": "Não existe viagem em andamento? Cadastre o barco e inicie uma viagem primeiro.",
    "visual": "dashboard"
  },
  {
    "id": "largadas",
    "title": "Anote uma largada",
    "category": "Pescaria",
    "target": "Largadas",
    "intro": "Largada é cada operação da rede dentro da viagem.",
    "steps": [
      "No Dashboard, abra o formulário de largada.",
      "Preencha data, horários, metros de rede e posições de início e fim.",
      "Confira os números antes de salvar. Aguarde a confirmação.",
      "Na aba Largadas, abra a pasta da viagem. Use Editar para corrigir um registro e confira o resultado."
    ],
    "tip": "Não registre a mesma operação duas vezes ao tocar novamente enquanto está salvando.",
    "visual": "viagem"
  },
  {
    "id": "capturas",
    "title": "Corvina, mistura e descarte",
    "category": "Pescaria",
    "target": "Capturas",
    "intro": "Cada peso precisa ficar ligado à largada certa.",
    "steps": [
      "Selecione a largada na qual o peixe foi capturado.",
      "Use a captura principal para corvina; use Mistura para outras espécies aproveitadas.",
      "Use Descarte para o peixe descartado. Escolha a espécie, informe o peso em kg e marque se estava vivo ou morto.",
      "Abra Capturas para conferir, editar ou excluir um lançamento incorreto."
    ],
    "tip": "Exemplo fictício: 600 kg de corvina + 40 kg de mistura. Os 10 kg de descarte ficam identificados separadamente.",
    "visual": "capturas"
  },
  {
    "id": "especies",
    "title": "Cadastre as espécies",
    "category": "Pescaria",
    "target": "Espécies",
    "intro": "A lista de espécies evita nomes diferentes para o mesmo peixe.",
    "steps": [
      "Abra Espécies e procure o nome antes de cadastrar.",
      "Se já existir, selecione essa espécie ao lançar a captura.",
      "Se faltar, toque em Nova espécie, preencha e salve.",
      "Use a edição para corrigir o nome e confira antes de excluir."
    ],
    "tip": "Use sempre o mesmo cadastro: assim o relatório reúne os pesos da mesma espécie.",
    "visual": ""
  },
  {
    "id": "historico",
    "title": "Finalize e confira a viagem",
    "category": "Pescaria",
    "target": "Histórico",
    "intro": "Quando a viagem termina, ela continua disponível no histórico.",
    "steps": [
      "Na Viagem atual, confira largadas e capturas.",
      "Toque em Finalizar viagem e revise os dados solicitados.",
      "Abra Histórico para consultar a viagem, seus totais e relatórios.",
      "Se houver diferença no desembarque, confira os lançamentos em Capturas e corrija os registros necessários."
    ],
    "tip": "Editar capturas muda os totais. Guarde um relatório antes de fazer correções.",
    "visual": ""
  },
  {
    "id": "comparar",
    "title": "Compare suas viagens",
    "category": "Pescaria",
    "target": "Comparar viagens",
    "intro": "Compare resultados para aprender com o que já aconteceu.",
    "steps": [
      "Finalize as viagens que deseja analisar. O painel organiza automaticamente as viagens finalizadas em pastas por ano, como 2026, 2027 e 2028.",
      "Abra Comparar viagens e toque na pasta do ano. Dentro dela aparecem somente as viagens finalizadas daquele ano.",
      "Em uma viagem, toque em Abrir relatório completo para ver produção, espécies, descarte Vivo/Morto, posições, região trabalhada e meteorologia histórica das largadas.",
      "Na mesma pasta, use Relatório anual para consolidar todas as viagens daquele ano ou Compartilhar PDF anual para gerar o arquivo completo."
    ],
    "tip": "O relatório anual soma apenas viagens finalizadas. Os registros continuam separados dentro de cada viagem.",
    "visual": ""
  },
  {
    "id": "relatorio-anual",
    "title": "Veja o resultado do ano inteiro",
    "category": "Pescaria",
    "target": "Comparar viagens",
    "intro": "A pasta do ano funciona como um arquivo: cada viagem continua separada e o relatório anual consolida os totais.",
    "steps": [
      "Abra Comparar viagens e toque no ano desejado, por exemplo 2026.",
      "Toque em Abrir relatório anual para ver viagens, dias de pesca, largadas, captura, espécies, médias e descartes Vivo/Morto.",
      "Confira Regiões trabalhadas no ano e o resumo meteorológico. Eles usam posições e dados ambientais já salvos nas largadas.",
      "Use PDF anual para baixar ou Compartilhar PDF anual para enviar o consolidado. Somente viagens finalizadas entram na conta."
    ],
    "tip": "Se uma viagem ainda estiver Em andamento, ela não entra no relatório anual até ser finalizada.",
    "visual": ""
  },
  {
    "id": "posicao",
    "title": "Localização e GPS sem confusão",
    "category": "Mar e clima",
    "target": "Ventos e Mar",
    "intro": "O GPS informa onde o celular está. Uma posição digitada pode ser outro local de consulta.",
    "steps": [
      "Ative a localização do aparelho e permita o acesso no navegador.",
      "No Dashboard, toque em MINHA LOCALIZAÇÃO ATUAL para abrir Ventos e Mar e consultar a previsão pelo GPS. Também é possível digitar outra posição em Ventos e Mar.",
      "Confira latitude S e longitude W. O painel mantém o padrão 25°4719 e 48°0296. Digite os números: o símbolo ° aparece automaticamente. Você pode apagar e digitar novamente.",
      "Toque em Atualizar e confira a posição no resultado e no mapa ambiental. O padrão com ° e os zeros deve permanecer."
    ],
    "tip": "25°4719 significa 25 graus e 47,19 minutos. 48°0296 significa 48 graus e 02,96 minutos. O zero faz parte da posição.",
    "visual": "posicao"
  },
  {
    "id": "previsao",
    "title": "Leia vento, ondas e maré",
    "category": "Mar e clima",
    "target": "Ventos e Mar",
    "intro": "Escolha o local e depois o dia e a hora que interessam.",
    "steps": [
      "Confira a posição consultada e atualize os dados.",
      "Leia vento e rajadas: rajada é um aumento temporário da força do vento.",
      "Confira altura, período e direção das ondas. Veja também temperatura e correntes, com as unidades de cada card.",
      "Abra os dias da semana e os horários. A previsão muda: consulte novamente perto da saída."
    ],
    "tip": "A seta e a legenda de cada camada explicam a direção. Não confunda vento, deslocamento da água e rumo do barco.",
    "visual": ""
  },
  {
    "id": "clorofila",
    "title": "Clorofila: por que os valores mudam?",
    "category": "Mar e clima",
    "target": "Ventos e Mar",
    "intro": "Clorofila é um pigmento do fitoplâncton, organismos pequenos da água. O painel recebe dados de satélite e de modelo; não mede clorofila a bordo.",
    "steps": [
      "No card do satélite, confira a data em Observado. É uma estimativa da superfície na observação disponível, não uma câmera ao vivo.",
      "Nos cards da semana, confira o dia previsto. O Copernicus calcula a evolução da clorofila em uma grade de áreas do oceano.",
      "Compare o mesmo local, as datas e a unidade mg/m³. Uma mancha pequena pode aparecer forte no satélite e suavizada no modelo.",
      "Use o satélite para examinar o padrão observado e a previsão para acompanhar a tendência. Cruze com temperatura, correntes e seu histórico de pesca."
    ],
    "tip": "A previsão pode ser menor OU maior. Nenhuma das fontes é infalível. Mais clorofila não garante corvina nem melhor captura.",
    "visual": "clorofila"
  },
  {
    "id": "mapa",
    "title": "Leia as cores do mapa ambiental",
    "category": "Mar e clima",
    "target": "Ventos e Mar",
    "intro": "Cor é uma forma de mostrar o valor de uma camada. Primeiro veja qual camada está ligada.",
    "steps": [
      "Abra o mapa em Ventos e Mar e selecione Vento ou Clorofila.",
      "Confira a posição central e a data da informação.",
      "Leia os números da legenda: não compare só a cor entre mapas com escalas diferentes.",
      "Aproxime a região e compare com os cards da mesma posição. Se faltar dado, não interprete como valor zero."
    ],
    "tip": "Nuvens, idade da observação e limitações perto da costa podem afetar o satélite. Diferença muito grande merece conferir fonte, data e posição.",
    "visual": "clorofila"
  },
  {
    "id": "ais",
    "title": "Encontre barcos no AIS",
    "category": "AIS e navegação",
    "target": "AIS",
    "intro": "AIS mostra informações transmitidas por embarcações e recebidas pelas fontes disponíveis.",
    "steps": [
      "Abra AIS. Arraste o mapa e aproxime com dois dedos; no computador, use o mouse.",
      "Use a busca FREE no cabeçalho para consultar as fontes gratuitas.",
      "Toque no barco para ler nome, posição e horário da informação.",
      "Use a busca PREMIUM separada quando precisar dessa consulta. Leia o custo antes de confirmar."
    ],
    "tip": "Um barco pode não aparecer por falta de cobertura ou transmissão. Posição antiga não é a posição atual garantida.",
    "visual": "ais"
  },
  {
    "id": "premium",
    "title": "Premium, 50 km e barcos salvos",
    "category": "AIS e navegação",
    "target": "AIS",
    "intro": "As consultas pagas e gratuitas ficam separadas.",
    "steps": [
      "Confira o saldo em Meus créditos.",
      "No AIS, abra a busca Premium para consultar uma embarcação ou 50 km para consultar uma área.",
      "Na busca por área, confira o centro escolhido no mapa e o custo informado.",
      "Abra Barcos salvos, Resultados 50 km ou Histórico AIS para revisar consultas. Atualizar pode consumir novos créditos: confira antes."
    ],
    "tip": "O raio de 50 km pertence ao centro selecionado. Não presuma que ele acompanha o barco automaticamente.",
    "visual": ""
  },
  {
    "id": "waypoints",
    "title": "Salve um ponto e use Ir para",
    "category": "AIS e navegação",
    "target": "AIS",
    "intro": "Waypoint é um ponto guardado no mapa, como uma marca de pesca.",
    "steps": [
      "Selecione o local no mapa e abra a opção de salvar waypoint.",
      "Dê um nome fácil de lembrar e confira latitude e longitude. Escolha o símbolo e salve.",
      "Abra Waypoints e selecione o ponto salvo. Revise os dados e use Ir para.",
      "Com o GPS autorizado, acompanhe distância, rumo e tempo estimado. Encerre a navegação quando terminar."
    ],
    "tip": "A linha liga posições; ela não desvia automaticamente de terra, pedras ou áreas rasas.",
    "visual": "ais"
  },
  {
    "id": "rotas",
    "title": "Monte e salve uma rota",
    "category": "AIS e navegação",
    "target": "AIS",
    "intro": "Rota é uma sequência de pontos: primeiro 1, depois 2, depois 3.",
    "steps": [
      "No AIS, toque em ROTA.",
      "Toque no mapa, na ordem desejada, para adicionar os pontos. No computador, clique com o mouse.",
      "Confira a sequência, dê um nome e toque em SALVAR ROTA.",
      "Em MINHAS ROTAS, abra a rota e use INICIAR ROTA. Confira o próximo ponto durante a navegação."
    ],
    "tip": "Revise cada trecho. A rota criada por toques não é uma rota automaticamente verificada para navegação.",
    "visual": "rota"
  },
  {
    "id": "navegar",
    "title": "Régua, orientação e XTE",
    "category": "AIS e navegação",
    "target": "AIS",
    "intro": "Estas ferramentas ajudam a entender distância e desvio no mapa.",
    "steps": [
      "Ative a régua e marque o início e o destino. Confira a distância e a unidade indicada.",
      "NORTE UP mantém o norte para cima; SUL UP mantém o sul para cima.",
      "RUMO UP usa a direção de movimento; PROA UP depende da orientação disponível. Parado ou com GPS fraco, a direção pode ficar instável.",
      "Durante a navegação, XTE indica o afastamento lateral da linha planejada. Confira também velocidade e distância restante."
    ],
    "tip": "MN significa milha náutica: 1 MN = 1,852 km. Tempo de chegada é uma estimativa que varia com a velocidade.",
    "visual": ""
  },
  {
    "id": "relatorios",
    "title": "Gere PDF e compartilhe",
    "category": "Relatórios e conta",
    "target": "Relatórios",
    "intro": "O relatório reúne os registros da viagem para conferir em terra ou enviar.",
    "steps": [
      "Abra Relatórios e selecione a viagem, ou use PDF da viagem em Viagem atual.",
      "Em Comparar viagens, abra a pasta do ano e use Abrir relatório completo para consultar também região trabalhada, descarte Vivo/Morto e meteorologia histórica.",
      "Use PDF completo/ PDF + previsão para incluir os dados ambientais que já foram salvos por largada. O relatório histórico não precisa consultar novamente a previsão para montar esses dados.",
      "Para o ano inteiro, abra Relatório anual e use PDF anual ou Compartilhar PDF anual. Se o navegador não compartilhar arquivos, o painel baixa o PDF para anexar manualmente."
    ],
    "tip": "Abra o arquivo antes de enviar e confira nome do barco, viagem, datas, totais, Vivo/Morto e ano selecionado.",
    "visual": ""
  },
  {
    "id": "fishia",
    "title": "Converse com a FISH IA",
    "category": "Relatórios e conta",
    "target": "Dashboard",
    "intro": "A FISH IA ajuda a interpretar informações e responder perguntas em linguagem simples.",
    "steps": [
      "Abra o botão da FISH IA no painel.",
      "Explique sua dúvida e informe local, data e espécie quando forem relevantes.",
      "Pergunte uma coisa por vez. Exemplo: “Como comparar vento e clorofila nesta posição?”",
      "Confira a resposta com os dados e horários do painel. Observe qualquer custo informado."
    ],
    "tip": "A IA pode errar. Ela não garante pesca e não substitui o julgamento do mestre.",
    "visual": ""
  },
  {
    "id": "creditos",
    "title": "Saldo e compra de créditos",
    "category": "Relatórios e conta",
    "target": "Meus créditos",
    "intro": "Créditos são usados nas funções que informam cobrança.",
    "steps": [
      "Abra Meus créditos e confira o saldo.",
      "Escolha a opção de compra e revise valor e quantidade mostrados.",
      "Siga o pagamento na tela e aguarde a confirmação.",
      "Se não atualizar, confira o status antes de pagar novamente. Guarde o comprovante."
    ],
    "tip": "Consulte sempre o preço na tela: o tutorial não fixa valores de cobrança.",
    "visual": ""
  },
  {
    "id": "backup",
    "title": "Importe um backup antigo",
    "category": "Relatórios e conta",
    "target": "Configurações",
    "intro": "O importador traz registros de um arquivo JSON compatível para a conta atual.",
    "steps": [
      "Abra Configurações e localize Importar backup JSON.",
      "Toque em Selecionar backup JSON e escolha seu arquivo. Baixar modelo JSON baixa apenas um exemplo, não seus dados.",
      "Confira a prévia e os avisos. Verifique se está na conta correta antes de importar.",
      "Leia os avisos da importação e confira os registros depois da conclusão."
    ],
    "tip": "PDF é para leitura. O JSON é o arquivo usado para backup e importação.",
    "visual": ""
  },
  {
    "id": "instalar",
    "title": "Instale no celular",
    "category": "Relatórios e conta",
    "target": "Dashboard",
    "intro": "O painel pode ter um atalho na tela inicial do aparelho.",
    "steps": [
      "Entre no endereço do painel pelo navegador e faça login.",
      "No Android, use a opção de instalar disponível no painel ou no menu do navegador.",
      "No iPhone, abra pelo Safari, toque em Compartilhar e em Adicionar à Tela de Início.",
      "Abra pelo novo ícone. Se a opção não aparecer, confirme se o navegador oferece instalação."
    ],
    "tip": "Instalar não elimina a necessidade de internet para consultar previsões, AIS e pagamentos.",
    "visual": ""
  },
  {
    "id": "internet",
    "title": "Internet, sincronização e consumo",
    "category": "Relatórios e conta",
    "target": "Dashboard",
    "intro": "Com sinal fraco, confira se um registro já foi enviado antes de repeti-lo.",
    "steps": [
      "Observe se o painel mostra online, offline ou registros pendentes.",
      "Ao voltar o sinal, mantenha o painel aberto e confira a sincronização.",
      "Depois, revise a lista de largadas e capturas. Nem toda ferramenta funciona offline.",
      "No indicador de consumo, veja a estimativa do painel. Compare o consumo total com o aplicativo da sua internet."
    ],
    "tip": "O medidor do painel não representa necessariamente todo o uso da Starlink nem de outros aparelhos.",
    "visual": ""
  },
  {
    "id": "problemas",
    "title": "Algo não funcionou?",
    "category": "Relatórios e conta",
    "target": "Dashboard",
    "intro": "Comece pelos passos simples e preserve seus registros.",
    "steps": [
      "GPS não funciona? Confira localização do aparelho e permissão do site. Tente em um local com melhor recepção.",
      "Previsão vazia? Confira internet, posição e data. Sem dado não significa zero.",
      "Barco não aparece? Confira a área, fonte e horário da última posição AIS.",
      "Registro não apareceu? Confira a viagem selecionada e se há sincronização pendente. Anote a mensagem de erro e tire uma foto da tela."
    ],
    "tip": "Antes de limpar dados do navegador ou sair da conta, sincronize os registros pendentes e guarde seus relatórios.",
    "visual": ""
  }
];
