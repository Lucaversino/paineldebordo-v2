# ALTERAÇÕES V257 - EDIÇÃO COMPLETA DAS CAPTURAS

## Objetivo
Unificar a edição das capturas para que o usuário sempre trabalhe na tela completa da largada, mesmo quando existir apenas um único registro.

## O que foi alterado
- O botão **Editar captura** na tabela de Largadas agora sempre abre o modal completo da largada.
- O botão **Editar** na aba Capturas tenta abrir a captura dentro do modal completo da largada correspondente.
- O botão **Editar peso** dentro do modal completo não abre mais uma tela isolada; agora ele exibe o formulário de edição no próprio modal completo.
- A edição preserva totais por espécie, registros individuais, botão de adicionar captura e calculadora.
- Ao salvar a edição, o modal da largada permanece aberto e os dados são recarregados.
- Mantido fallback para modal simples apenas se a captura não tiver largada vinculada.

## Resultado esperado
- Mesmo que a largada tenha apenas uma captura, ao editar o usuário verá a tela completa.
- A experiência fica padronizada em desktop e mobile.
