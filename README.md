# Watch Try-On com iluminação metálica + oclusão do pulso

Estrutura para Vercel, mantendo a página de produto e o try-on separados.

## Arquivos principais

- `index.html` — página mock de produto
- `watch-tryon.html` — try-on do relógio no pulso
- `js/watch-tryon.js` — tracking MediaPipe + Three.js + iluminação melhorada + occlusão
- `assets/models/relogio-tryon.glb` — relógio visível usado no try-on
- `assets/models/relogio-occlusion.glb` — mesh invisível que escreve só no depth buffer para ocultar partes do relógio atrás do pulso
- `assets/hdr/glasshouse_interior_4k_blur_exp_sat.hdr` — HDR para reflexos metálicos

## O que foi alterado

A lógica de tracking da versão nova foi mantida. Foi adicionada a oclusão da versão antiga:

1. carrega `./assets/models/relogio-occlusion.glb`
2. aplica material depth-only (`colorWrite=false`, `depthWrite=true`, `depthTest=true`)
3. adiciona o occluder como filho de `modelRoot`
4. aplica o mesmo deslocamento de centralização do relógio visível, para manter o alinhamento

## Importante

O arquivo `relogio-occlusion.glb` precisa ter o mesmo pivot/orientação do relógio. Se a oclusão aparecer deslocada, o ajuste deve ser feito no GLB de oclusão ou no offset dentro de `loadWatchOccluder()`.

## Deploy no Vercel

- Framework Preset: Other
- Sem build command
- Sem output directory
