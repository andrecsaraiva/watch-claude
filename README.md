# Watch Try-On — correção de escala

## O que estava errado (e foi corrigido)

Seu try-on de relógio estava bem feito — MediaPipe Hands, base
ortonormal, suavização, tudo certo na arquitetura. O problema era
calibração, não estrutura.

**Bug: o relógio aparecia pequeno.** O código mediu o modelo 3D e usou
a "dimensão do meio" do bounding box como referência de escala
(modelRefSize). Mas o relogio.glb inclui a PULSEIRA esticada — o modelo
inteiro mede 7,8 x 12,1 x 8,6 cm. A "dimensão do meio" pegava ~8,6 cm
(comprimento de pulseira), não a largura da caixa do relógio (~4 cm).

Como a escala é calculada como (largura do pulso em px / modelRefSize),
um modelRefSize duas vezes maior que o real fazia o relógio sair com
menos da metade do tamanho.

**Correção:** agora o código usa a MENOR dimensão do bounding box como
largura da caixa (a pulseira infla as outras duas). Isso corrige a
escala — e, como a ancoragem depende dela, melhora o tracking junto.

## Ajuste fino (se precisar)

No watch-tryon.js, dentro de loadWatchModel, existe:

    const CASE_WIDTH_OVERRIDE = null;

Se a detecção automática não acertar a largura da caixa, defina aqui o
valor real em METROS. Ex.: relógio de 40 mm -> CASE_WIDTH_OVERRIDE = 0.040.
O log na tela mostra a largura detectada ("case width") — use-o de guia.

O slider de escala na interface continua funcionando para ajuste fino
ao vivo.

## IMPORTANTE — sobre o arquivo do modelo

Seu código aponta para 'relogio-tryon.glb'. Você enviou 'relogio.glb'.
Assumi que são o mesmo modelo e renomeei a cópia para relogio-tryon.glb.
Se forem modelos diferentes, use o correto e mantenha esse nome.

## IMPORTANTE — sobre a pulseira

O modelo inclui a pulseira ESTICADA (reta, 12 cm). Uma pulseira reta não
abraça o pulso curvado — em alguns ângulos ela vai atravessar o braço ou
flutuar. Para o vídeo de pitch, grave de ângulos que disfarçam isso.

Para um resultado realmente bom, o ideal é um GLB só da CAIXA do relógio
(sem pulseira, ou com a pulseira já curvada). Try-on de relógio de
qualidade usa só a caixa — a "pulseira" desaparece atrás do braço
naturalmente. Se conseguir esse modelo, me envie que eu recalibro.

## Estrutura dos arquivos no repositório

    css/watch-tryon.css
    js/watch-tryon.js
    assets/models/relogio-tryon.glb
    assets/hdr/glasshouse_interior_4k_blur_exp_sat.hdr   (o HDR que voce ja usa)
    watch-tryon.html  (na raiz)

Mantenha a mesma estrutura de pastas que seu projeto já usava — só
substitua o watch-tryon.js pelo corrigido.
