# Snake

Um jogo Snake moderno rodando no browser, com renderização suave, efeitos visuais, suporte a mobile e ranking local.

**[Jogar agora →](https://arthurrio.github.io/snake/)**

---

## Funcionalidades

- Movimento interpolado com easing (smoothstep) para animação fluida
- Partículas e textos flutuantes ao comer a maçã
- Sistema de combo: coma maçãs rapidamente para multiplicar os pontos
- Flash de morte animado ao colidir
- Seletor de velocidade (10 níveis)
- Ranking Top 5 persistido no `localStorage`
- Controles por teclado, swipe, D-pad na tela e gamepad
- Layout responsivo para mobile e desktop

---

## Estrutura do projeto

```
snake/
├── index.html   # Estrutura HTML da página
├── style.css    # Estilos e layout responsivo
├── main.js      # Thread principal: input, HUD, ranking
└── worker.js    # Web Worker: lógica do jogo e renderização
```

---

## Como funciona

### Arquitetura de threads

O jogo usa duas threads separadas para garantir performance máxima:

```
Thread principal (main.js)          Web Worker (worker.js)
─────────────────────────           ──────────────────────
Captura input (teclado,             Lógica do jogo (tick)
  swipe, D-pad, gamepad)    ──→     Renderização no canvas
Atualiza o HUD              ←──     Envia mensagens: hud, end
Controla o ranking
```

A cada frame do `requestAnimationFrame`, a thread principal envia o timestamp e a direção atual para o Worker. O Worker decide quando executar um tick do jogo com base no acumulador de tempo.

### Web Worker + OffscreenCanvas

O canvas é transferido para o Worker via `transferControlToOffscreen()`, permitindo que toda a renderização ocorra fora da thread principal. Isso garante que o jogo continue rodando sem travar mesmo se a thread principal estiver ocupada.

```js
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
```

### Loop de jogo

O jogo separa **lógica** de **renderização**:

- **Lógica (tick):** roda em intervalos fixos configuráveis (ex: 120ms no nível 5). Um acumulador de tempo garante que ticks atrasados sejam recuperados sem pular frames.
- **Renderização (rAF):** roda a ~60fps. Entre dois ticks, as posições da cobra são interpoladas com easing smoothstep (`3t² - 2t³`), dando movimento orgânico ao invés de robótico.

```
Tick 0          Tick 1          Tick 2
  |─────────────|─────────────|
  |──rAF──rAF──rAF──rAF──rAF──|
       t=0.3  t=0.6  t=0.9
```

### Interpolação de movimento

A cada frame de renderização, `t ∈ [0, 1)` representa o progresso entre o tick anterior e o próximo. A posição visual de cada segmento é calculada interpolando entre `prevSnake` e `snake` com smoothstep:

```js
const s = t * t * (3 - 2 * t); // smoothstep
const rx = (prev.x + (seg.x - prev.x) * s) * CELL + pad;
```

A cauda "fantasma" (último segmento do tick anterior) também é desenhada com opacidade decrescente para um efeito de deslizamento natural.

### Sistema de combo

Comer maçãs com menos de 3 segundos de intervalo entre elas encadeia um combo. O multiplicador cresce a cada maçã consecutiva, aumentando os pontos e o tamanho do texto flutuante.

```
1ª maçã: +1 ponto
2ª maçã (< 3s): +2 pontos  (x2)
3ª maçã (< 3s): +3 pontos  (x3)
...
```

### Efeitos visuais

**Partículas:** ao comer uma maçã, 14 partículas são emitidas em ângulos distribuídos uniformemente com velocidade aleatória. Cada partícula tem gravidade, decaimento de vida e desaparece gradualmente.

**Textos flutuantes:** o score ganho aparece na posição da maçã e sobe suavemente até desaparecer.

**Flash de morte:** ao colidir, a cobra pisca entre vermelho e vermelho escuro usando uma onda senoidal por 700ms antes de exibir o game over.

### Controles

| Dispositivo | Controle |
|---|---|
| Teclado | Setas ou WASD |
| Mobile | Swipe no canvas ou D-pad na tela |
| Gamepad | D-pad ou analógico esquerdo |

### Ranking local

As 5 melhores pontuações são salvas no `localStorage` do browser no formato:

```json
[
  { "score": 42, "length": 15, "date": "09/03/2026" },
  { "score": 30, "length": 11, "date": "08/03/2026" }
]
```

A pontuação recém-feita é destacada em verde no ranking ao final de cada partida.

---

## Tecnologias

- HTML5 Canvas (OffscreenCanvas)
- Web Workers
- localStorage
- Gamepad API
- Vanilla JS — sem frameworks ou dependências
