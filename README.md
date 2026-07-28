# NutriGYM

Dois módulos em um app só, instalado como **NutriGYM**: **appGYM** (força e corrida na escala 24h/72h) e **NutriLogic** (análise nutricional e diário alimentar). Uma tela inicial pergunta para onde ir.

Sem build, sem backend obrigatório, sem CDN. HTML/CSS/JS puro, feito para GitHub Pages e para rodar da tela de início do iPhone.

## Publicar

Suba na **mesma pasta** do repositório:

```
index.html          ← o app (os dois módulos)
app-icon-180.png    ← ícone da tela de início (iOS)
app-icon-512.png    ← favicon / PWA
app-icon-1024.png   ← reserva (lojas, divulgação)
```

Os arquivos de build (`merge.py`, `make_icon.py`, `appgym-redesign.css`, os dois originais) podem ir junto no repositório — não atrapalham o Pages e mantêm o projeto reconstruível.

Depois: **Settings → Pages → Deploy from a branch**, branch e pasta raiz. Fica em `https://seu-usuario.github.io/nome-do-repo/`.

**Não teste por `file://`** — o `localStorage` fica instável assim. Use a URL publicada ou `python3 -m http.server`.

### Tela de início (iPhone)

Safari → compartilhar → **Adicionar à Tela de Início**. O atalho se chama **NutriGYM**.

Se já havia um atalho antigo, **apague e adicione de novo** — o iOS guarda ícone e nome em cache e não atualiza sozinho.

## Identidade visual

O NutriLogic é a linguagem da casa. O **appGYM foi redesenhado por completo** para falar a mesma língua — não é uma conversão de cores, é o CSS reescrito seguindo as mesmas decisões:

| Decisão | Valor |
|---|---|
| Cards | `--r-lg` 22px, padding 16px, sombra dupla |
| Botões | 48px de altura, raio 14px, peso 650 |
| Cabeçalho | eyebrow em caixa alta (.14em) + h1 em SF Pro Rounded |
| Números | fonte display com `tabular-nums` |
| Medidas | monoespaçada a `.82em` |
| Campos | 48px, raio 13px, anel de foco `accent-soft` |
| Sheet | raio 26px + grabber de 38×5 |
| Nav inferior | `--nav-h` 64px com `backdrop-filter` |
| Toast | `ink` sobre `bg`, raio 15px |

O appGYM não tem mais tokens de cor próprios: usa `--accent`, `--surface`, `--citrine` etc. do NutriLogic. Por isso o botão de sol/lua no topo do NutriLogic troca o tema **dos dois**. O seletor de tema que existia dentro do appGYM foi removido — um app, um controle.

## Como a fusão funciona

Os dois continuam sendo programas independentes, lado a lado:

| | NutriLogic | appGYM |
|---|---|---|
| Chaves no navegador | `nutrilog_*` | `pplh_state_v1` |
| Namespace JS | `window.NutriLogApp` (IIFE) | globais próprias |
| Navegação | abas internas | rotas por hash |
| Backup | Ajustes do NutriLogic | Ajustes do appGYM |

A casca acrescenta a tela inicial (`#/inicio`), a barra de troca no topo de cada módulo e o roteamento: `#/inicio` e `#/dieta` são dela, qualquer outra rota é do appGYM. Todo o CSS do appGYM vive sob `#mod-treino` — os dois apps compartilhavam 20 nomes de classe e sem isso um quebraria o outro.

### Barra de troca

Fica **fora** dos dois módulos, de propósito. Quando morava dentro, o reset `#mod-treino *{margin:0;padding:0}` do appGYM vencia `.switchbar` na especificidade (tem `#id`) e zerava padding e centralização — a barra vazava para fora da tela só no appGYM. O reset também era redundante: o NutriLogic já aplica `*{margin:0;padding:0}` globalmente.

O padding usa longhand com fallback em vez do shorthand `padding:calc(env(...)) 16px 8px`. No shorthand, se o navegador não parsear o `calc(env())`, perde junto o padding lateral — a mesma classe de falha.

### Ícone

Seta ascendente em degradê sobre o verde da marca. Gerado por `make_icon.py`, com geometria e cores extraídas por amostragem da referência — não é uma reprodução "no olho": a silhueta bate com IoU 0,79 e o erro médio de cor é 7,8/255.

Saída em **quadrado cheio, sem cantos arredondados**: o iOS aplica a própria máscara. Ícone já arredondado ficaria com borda dupla.

```bash
python3 make_icon.py     # regenera os três tamanhos
```

### Toast do NutriLogic

O toast é markup fixo na página e se escondia apenas com `transform:translateY(140%)`. Vazio ele tem ~46px, então descia ~64px — menos que os ~76px+ que o separam do fundo (`--nav-h` + 12 + safe-area). Sobrava uma barra clara vazia parada sobre o menu.

A fusão acrescenta `#mod-dieta .toast:not(.show){visibility:hidden;opacity:0}`, preservando a animação de entrada. **Esse comportamento também existe no NutriLogic original** — não foi a fusão que introduziu.

### Reconstruir

O `index.html` é **gerado**. Se mexer em qualquer módulo, rode o build em vez de editar o arquivo mesclado:

```bash
python3 merge.py     # lê appgym-original.html + nutrilogic-original.html
                     #   + appgym-redesign.css  →  index.html
```

Mexer direto no `index.html` funciona até a próxima geração descartar tudo.

## Worker (backend opcional)

O app roda 100% sem backend. Ligar o `worker.js` (Cloudflare) acrescenta duas coisas:

| Rota | O que faz |
|---|---|
| `POST /api/nutrition/analyze-image` | Análise de foto por IA — contrato que o NutriLogic já espera |
| `GET/PUT/DELETE /api/sync/:module` | Backup entre aparelhos (`nutrilogic` ou `appgym`) |
| `GET /api/health` | Diz o que está configurado |

```bash
npm i -g wrangler
wrangler kv namespace create SYNC        # cole o id no wrangler.toml
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SYNC_TOKEN           # senha do seu backup
wrangler deploy
```

Depois, no app: **NutriLogic → Ajustes → endpoint de IA** → `https://SEU-WORKER.workers.dev`.

Detalhes que valem saber:
- O Worker **normaliza** a resposta da IA antes de devolver. O NutriLogic valida de novo do lado dele. Um deslize do modelo vira erro claro, não dado errado no diário.
- O `PUT` de sync guarda a versão anterior em `:prev` antes de sobrescrever.
- Troque `ALLOWED_ORIGIN` de `*` para o seu domínio depois de publicar.
- A rota de sync existe e funciona, **mas o app ainda não a chama** — o backup continua manual, por JSON. É o gancho pronto para quando você quiser ligar.

## Dados e privacidade

Tudo fica **só neste navegador**. Trocar de aparelho, trocar de navegador, aba anônima ou limpar dados do site **apaga o histórico**.

Cada módulo tem backup próprio, em Ajustes. **Faça os dois** — um não inclui o outro.

## Limitações conhecidas

- Fotos de execução dos exercícios ainda são placeholders no appGYM.
- Incremento de carga é por categoria de exercício, não por exercício individual.
- Modo Férias: não dá para editar datas/nível de um bloco ativo (cancele e recrie); sem histórico navegável de sessões puladas.
- Unidades fixas em kg/cm.
- Testado por simulação de DOM (jsdom/Node): 33 verificações de fusão/redesign + 18 funcionais + 17 de layout + 8 do toast. **Não testado em Safari/iPhone real.**
- O jsdom **não resolve `env()`** (safe-area), então nenhum teste automatizado cobre de fato o comportamento das áreas seguras. Foi justamente aí que apareceu o bug da barra de troca vazando para fora da tela. Layout que depende de `env()` só se confirma no aparelho.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app publicado (gerado) |
| `merge.py` | Build da fusão |
| `appgym-redesign.css` | Redesign do appGYM na linguagem do NutriLogic |
| `appgym-original.html` | Módulo appGYM original |
| `nutrilogic-original.html` | Módulo NutriLogic original |
| `worker.js` / `wrangler.toml` | Backend opcional |
| `app-icon-*.png` | Ícones da tela de início |
