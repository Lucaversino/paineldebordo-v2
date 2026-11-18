# V285 - Botões Premium Aceternity

- Verificados: `components.json` shadcn/ui, Tailwind v4.2.1, TypeScript v5.9.3.
- Instalado no package.json: `motion`, dependência do componente Aceternity. Na instalação normal do deploy (`npm install`) será resolvido.
- Criados `components/ui/stateful-button.tsx` e `components/stateful-button-demo.tsx`.
- Botões de download NOAA GRIB1 e GRIBZIP usam estado de processamento, sucesso e falha real. O comportamento da exportação permanece o mesmo.
- Aparência arredondada e feedback visual aplicados aos botões do painel via CSS, sem reestruturar os handlers e sem modificar controles de mapa.
- Testar instalação, build e funcionamento real dos downloads em ambiente com rede e dependências, além de revisar telas desktop/mobile.
