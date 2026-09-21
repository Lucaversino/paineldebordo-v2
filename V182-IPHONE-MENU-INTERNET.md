# V182 — iPhone menu + cabeçalho + Internet

- Corrige o botão do menu lateral no iPhone/PWA com área de toque maior e drawer acima de todos os overlays.
- Respeita `safe-area-inset-top` para o cabeçalho não ficar escondido sob notch/Dynamic Island/status bar.
- Sidebar usa `100dvh`, rolagem própria no iOS e safe areas superior/inferior.
- Adiciona fundo de bloqueio ao abrir o menu para evitar toques no conteúdo por trás.
- A barra **Internet hoje / Starlink** aparece no Dashboard mesmo sem viagem criada, inclusive enquanto os dados da viagem carregam ou se a API do dashboard falhar.
- Nenhuma alteração em AIS, GPS, previsão, créditos ou pagamentos.
