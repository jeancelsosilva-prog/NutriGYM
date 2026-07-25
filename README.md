# Ficha PPL Híbrida

Ficha de treino mobile-first para um programa híbrido Push/Pull/Legs + corrida, sincronizado com uma escala de plantão 24h/72h. Arquivo único (`index.html`), sem build, sem backend — HTML/CSS/JS puro, pensado para rodar no GitHub Pages e salvar tudo no navegador.

## Publicar

1. Suba `ficha-ppl-hibrida.html` para um repositório no GitHub (pode renomear para `index.html` ou apontar o Pages para ele diretamente).
2. No repositório: **Settings → Pages → Deploy from a branch**, escolha a branch e a pasta raiz.
3. O site fica em `https://seu-usuario.github.io/nome-do-repo/`.

**Importante:** não abra o arquivo direto no navegador (`file://`) para testar — o `localStorage` fica instável nesse modo em vários navegadores (o Firefox bloqueia, o Chrome isola por caminho de arquivo). Teste sempre publicado ou rodando num servidor local (`python3 -m http.server`, por exemplo).

## O que tem dentro

- **Ciclo 24x72** — a tela Hoje calcula automaticamente plantão / pós-plantão / folga plena / última folga a partir de uma data-âncora, com correção manual a qualquer momento (trocas de escala, missões).
- **Push, Pull, Legs A/B e Core** — fichas completas com séries, RIR, cronômetro de descanso resistente a segundo plano, substituição de equipamento, edição/exclusão de séries.
- **Progressão dupla** — considera RIR, técnica e desconforto; isoladores e compostos aumentam carga e voltam ao piso da faixa; dead bug/bird dog progridem por dificuldade, não por repetições infinitas; deload reduz carga a ~70% arredondado pelo incremento real de cada categoria.
- **Mesociclo de 10 ciclos** (adaptação → desenvolvimento → deload → reavaliação) — avança pela sua adesão real (Push+Legs+Pull concluídos), não pelo calendário.
- **Corrida** — motor próprio com 3 corridas a cada 8 dias (1 de qualidade + 2 Zona 2), formatos selecionáveis de qualidade (intervalado/tempo/fartlek), corridas adiadas viram pendência real na tela Hoje.
- **Modo Férias** — mesociclo de manutenção alternativo (níveis Normal/Relaxado/Viagem) com fila PPL flexível que nunca pula grupo por calendário, pausa o mesociclo 24x72 e reancora a escala ao encerrar.
- **Evolução, medidas, biblioteca de exercícios, backup/restauração** (JSON, com validação e migração de versão).

## Dados e privacidade

Tudo fica salvo **só neste navegador**, em `localStorage` (`pplh_state_v1`). Nada é enviado para servidor nenhum. Trocar de aparelho, trocar de navegador, usar aba anônima ou limpar dados do site **apaga o histórico**. Faça backup em Ajustes → Backup regularmente, principalmente antes de qualquer uma dessas mudanças.

## Limitações conhecidas

- Fotos de execução dos exercícios ainda são placeholders — sem forma segura de gerar isso automaticamente com precisão de forma.
- Incremento de carga é por categoria de exercício (barra livre / máquina / isolador / perna / core), não configurável por exercício individual.
- Modo Férias: não dá para editar datas/nível de um bloco já ativo (só cancelar e recriar); não tem histórico navegável de sessões puladas/adiadas; nível Viagem oferece corrida opcional mas não infere automaticamente o próximo grupo a cada passo além do "continuar fila atual" na ativação.
- Unidades fixas em kg/cm (sem alternativa imperial).
- Sem teste manual em dispositivo Safari/iPhone real — só testado via simulação de DOM (jsdom/Node).

## Histórico de versões

| Versão | Destaques |
|---|---|
| App v1.0 · Dados v1 | Lançamento: ciclo 24x72, Push/Pull/Legs/Core, progressão dupla, backup/restauração, biblioteca de exercícios |
| Dados v2 | Confiabilidade (overlays, edição de séries), RIR/técnica/desconforto na progressão, mesociclo desacoplado do calendário, 5 categorias de incremento, corrida em 3 sessões/8 dias com formatos selecionáveis, validação e migração de backup |
| App v1.1 · Dados v3 | Modo Férias completo (fila PPL flexível, 3 níveis, pausa de mesociclo, reancoragem obrigatória, relatório persistente) |

## Para quem for mexer no código

Arquivo único, roteamento por hash (`#/hoje`, `#/treino/:id`, `#/ferias/...` etc.), sem dependências externas. O `<script>` está organizado em blocos comentados: dados dos exercícios, storage/migração, motor do ciclo, motor de progressão, motor da sessão, motor de férias, telas, handlers globais. Antes de qualquer alteração, vale rodar `node --check` no JS extraído do `<script>` e, se possível, montar um teste rápido com `jsdom` simulando o fluxo alterado — foi assim que este projeto foi validado a cada mudança.
