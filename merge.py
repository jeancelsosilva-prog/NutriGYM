import re, sys

NUTRI = 'nutrilogic-original.html'  # módulo NutriLogic original
TREINO = 'appgym-original.html'   # módulo appGYM original
OUT   = 'index.html'

nutri = open(NUTRI, encoding='utf-8').read()
treino = open(TREINO, encoding='utf-8').read()

# ----------------------------------------------------------------- extract
def split_block(src, tag):
    i = src.index('<' + tag + '>')
    j = src.index('</' + tag + '>')
    return src[i + len(tag) + 2:j]

n_style  = split_block(nutri, 'style')
n_script = split_block(nutri, 'script')
n_head   = nutri[nutri.index('<head>') + 6: nutri.index('<style>')]
n_body   = nutri[nutri.index('<body>') + 6: nutri.index('<script>')]

t_style  = split_block(treino, 'style')
t_script = split_block(treino, 'script')

# ------------------------------------------------- rename training tokens
# Every --custom-prop inside the training module is its own; prefix with t-
# so it can be defined in terms of the nutrition palette without recursion.
tokens = sorted(set(re.findall(r'--[a-z0-9]+(?:-[a-z0-9]+)*', t_style)), key=len, reverse=True)
def rename_tokens(text):
    for tk in tokens:
        text = re.sub(r'(?<![\w-])' + re.escape(tk) + r'(?![\w-])', '--t-' + tk[2:], text)
    return text

t_style  = rename_tokens(t_style)
t_script = rename_tokens(t_script)   # inline style="...var(--x)..." strings in JS

# ------------------------------------------------- scope training CSS
SCOPE = '#mod-treino'

def scope_selector(sel):
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p:
            continue
        if p.startswith('@') or p.startswith('%') or re.match(r'^\d', p):
            out.append(p); continue
        if p in (':root',):
            out.append(SCOPE); continue
        if p.startswith('html') or p.startswith('body'):
            # host page owns html/body; keep only the module-safe remainder
            out.append(SCOPE); continue
        if p.startswith('::selection'):
            out.append(SCOPE + ' ::selection'); continue
        if p.startswith('[data-theme'):
            # theme variants: keep the attribute on the ancestor, scope the rest
            m = re.match(r'^(\[data-theme="[^"]+"\])\s*(.*)$', p)
            if m:
                rest = m.group(2).strip()
                out.append(m.group(1) + ' ' + SCOPE + (' ' + rest if rest else ''))
                continue
        if p.startswith('*'):
            out.append(SCOPE + ', ' + SCOPE + ' *'); continue
        out.append(SCOPE + ' ' + p)
    return ', '.join(out)

def scope_css(css):
    res, i, n = [], 0, len(css)
    while i < n:
        # comments
        if css.startswith('/*', i):
            j = css.find('*/', i + 2)
            j = n if j < 0 else j + 2
            res.append(css[i:j]); i = j; continue
        if css[i] in ' \n\r\t':
            res.append(css[i]); i += 1; continue
        # rule head up to { or ;
        j = i
        while j < n and css[j] not in '{;':
            j += 1
        if j >= n:
            res.append(css[i:]); break
        head = css[i:j]
        if css[j] == ';':                      # at-statement (@import etc.)
            res.append(head + ';'); i = j + 1; continue
        # find matching close brace
        depth, k = 1, j + 1
        while k < n and depth:
            if css.startswith('/*', k):
                e = css.find('*/', k + 2); k = n if e < 0 else e + 2; continue
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        h = head.strip()
        if h.startswith('@keyframes') or h.startswith('@-webkit-keyframes'):
            res.append(head + '{' + body + '}')           # keyframe names don't collide
        elif h.startswith('@media') or h.startswith('@supports'):
            res.append(head + '{' + scope_css(body) + '}')  # scope inner rules
        else:
            res.append(scope_selector(head) + '{' + body + '}')
        i = k
    return ''.join(res)

# O CSS original do treino é descartado: o appGYM foi redesenhado do zero
# na linguagem do NutriLogic (ver appgym-redesign.css, ao lado deste script).
t_style = open('appgym-redesign.css', encoding='utf-8').read()

# --------------------------------- repaint: training tokens -> nutrition palette
PALETTE = ""   # o redesign já fala os tokens do NutriLogic nativamente


# ------------------------------------------------- rebrand
for _a, _b in [('Ficha PPL Híbrida', 'appGYM'), ('Ficha PPL', 'appGYM')]:
    t_script = t_script.replace(_a, _b)
# NutriLog -> NutriLogic no texto visível, preservando window.NutriLogApp
# e as chaves nutrilog_* (minúsculas, não casam com o padrão).
n_script = re.sub(r'NutriLog(?!App)(?!ic)', 'NutriLogic', n_script)
n_body   = re.sub(r'NutriLog(?!App)(?!ic)', 'NutriLogic', n_body)

# ------------------------------------------------- patch training JS
# 1) render() must stand down while another module owns the screen
t_script = t_script.replace(
    "function render(){\n  if(state.onboarded) syncVacationLifecycle();",
    "function render(){\n  if(typeof SHELL!=='undefined' && SHELL.active!=='treino') return;\n  if(state.onboarded) syncVacationLifecycle();",
    1)
assert "SHELL.active!=='treino'" in t_script, 'render guard not applied'

# 2) theme is owned by the host app now — one toggle, not two
old_theme_field = """<div class="field"><label>Tema</label>
          <div class="segmented">
            <button class="${st.theme==='dark'?'active':''}" data-action="set-theme" data-theme="dark">Escuro</button>
            <button class="${st.theme==='light'?'active':''}" data-action="set-theme" data-theme="light">Claro</button>
          </div>
        </div>"""
new_theme_field = """<p class="readonly-note">O tema claro/escuro é o do aplicativo inteiro — use o botão de sol/lua no topo da tela Hoje do NutriLogic.</p>"""
assert old_theme_field in t_script, 'theme field not found'
t_script = t_script.replace(old_theme_field, new_theme_field, 1)

# applyTheme must no longer fight the host for the data-theme attribute
old_apply = """function applyTheme(theme){
  state.settings.theme=theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveState(true);
}"""
new_apply = """function applyTheme(theme){
  // No app mesclado quem manda no tema é o NutriLog; aqui só guardamos a
  // preferência para o caso de o módulo voltar a rodar sozinho.
  state.settings.theme=theme;
  saveState(true);
}"""
assert old_apply in t_script, 'applyTheme not found'
t_script = t_script.replace(old_apply, new_apply, 1)

# ------------------------------------------------- shell
SHELL_CSS = """
/* ============================================================
   CASCA — alterna entre os dois módulos e hospeda a tela inicial
   ============================================================ */
.mod{display:none}
.mod.mod-active{display:block}
.switchbar{display:none}
.switchbar.on{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  max-width:560px;margin:0 auto;width:100%;
  padding-left:16px;padding-right:16px;padding-bottom:8px;
  padding-top:8px;
  padding-top:calc(env(safe-area-inset-top,0px) + 8px);
}
.switchbar .backhome{
  display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;
  background:none;border:none;cursor:pointer;padding:6px 2px;
  font:inherit;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);
}
.switchbar .seg{
  display:flex;background:var(--surface-2);border-radius:999px;padding:3px;gap:2px;
  flex:0 1 auto;min-width:0;overflow:hidden;
}
.switchbar .seg button{
  border:none;background:transparent;color:var(--muted);
  padding:7px 13px;border-radius:999px;font:inherit;font-size:.8rem;font-weight:650;cursor:pointer;
  white-space:nowrap;min-width:0;
}
.switchbar .seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.18)}
/* O toast do NutriLogic é markup fixo e se esconde só com translateY(140%).
   Vazio ele tem ~46px, logo desce ~64px — menos que os ~76px+ que o separam
   do fundo (--nav-h + 12 + safe-area). Resultado: uma barra clara vazia
   parada sobre o menu. Escondemos de verdade quando não está .show,
   preservando a animação de entrada. Não afeta o toast do appGYM, que é
   criado dinamicamente dentro de #mod-treino. */
#mod-dieta .toast{transition:transform .25s cubic-bezier(.32,.72,0,1),opacity .2s ease,visibility .2s ease}
#mod-dieta .toast:not(.show){visibility:hidden;opacity:0;pointer-events:none}
.launcher{max-width:560px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 32px) 20px 40px}
.launcher .eyebrow-l{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.launcher h1{font-size:30px;line-height:1.15;margin:6px 0 6px;letter-spacing:-.02em;color:var(--ink)}
.launcher .sub{color:var(--muted);font-size:15px;line-height:1.5;margin-bottom:26px}
.launch-card{
  display:block;width:100%;text-align:left;cursor:pointer;
  background:var(--surface);border:1px solid var(--line);border-radius:20px;
  padding:20px;margin-bottom:14px;box-shadow:var(--shadow);
  transition:transform .12s ease,border-color .12s ease;
  font:inherit;color:inherit;
}
.launch-card:active{transform:scale(.985);border-color:var(--line-strong)}
.launch-card .lc-top{display:flex;align-items:center;gap:12px}
.launch-card .lc-ico{
  width:44px;height:44px;border-radius:14px;flex:0 0 auto;
  display:flex;align-items:center;justify-content:center;color:var(--on-accent);
}
.launch-card .lc-ico.diet{background:var(--accent)}
.launch-card .lc-ico.gym{background:var(--citrine)}
.launch-card h2{font-size:19px;margin:0;letter-spacing:-.01em;color:var(--ink)}
.launch-card .lc-sub{font-size:13.5px;color:var(--muted);margin-top:2px}
.launch-card .lc-meta{
  margin-top:14px;padding-top:12px;border-top:1px solid var(--line);
  font-size:12.5px;color:var(--faint);display:flex;gap:14px;flex-wrap:wrap;
}
.launcher .foot{margin-top:22px;font-size:12.5px;color:var(--faint);line-height:1.6;text-align:center}
"""

SHELL_HTML = """
<!-- ===================== TELA: INÍCIO (casca) ===================== -->
<div class="mod" id="mod-inicio">
  <div class="launcher">
    <p class="eyebrow-l">NutriGYM</p>
    <h1>Bom dia, Jean</h1>
    <p class="sub">Dois módulos, um app só. Os dados de cada um ficam separados e salvos neste navegador.</p>

    <button class="launch-card" data-go="dieta">
      <div class="lc-top">
        <span class="lc-ico diet">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9a4 4 0 018 0v12"/><path d="M8 9V3"/><path d="M16 21V3c2.5 1 3.5 3.5 3.5 6S18.5 14 16 14"/></svg>
        </span>
        <div>
          <h2>NutriLogic</h2>
          <div class="lc-sub">Análise nutricional e diário alimentar</div>
        </div>
      </div>
      <div class="lc-meta"><span id="launch-diet-a">Registro por foto ou texto</span><span id="launch-diet-b">Carga glicêmica</span></div>
    </button>

    <button class="launch-card" data-go="treino">
      <div class="lc-top">
        <span class="lc-ico gym">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6.5 9v6M4 10.5v3M17.5 9v6M20 10.5v3M6.5 12h11"/></svg>
        </span>
        <div>
          <h2>appGYM</h2>
          <div class="lc-sub">Força e corrida na escala 24x72</div>
        </div>
      </div>
      <div class="lc-meta"><span id="launch-gym-a">Ciclo 24x72</span><span id="launch-gym-b">Push · Pull · Legs</span></div>
    </button>

    <p class="foot">Faça backup de cada módulo separadamente, nos respectivos Ajustes.</p>
  </div>
</div>
"""

SWITCHBAR_HTML = (
    '<div class="switchbar" id="switchbar">'
    '<button class="backhome" data-go="inicio" aria-label="Voltar ao início">'
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" '
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Início</button>'
    '<span class="seg">'
    '<button data-go="dieta">NutriLogic</button>'
    '<button data-go="treino">appGYM</button>'
    '</span></div>'
)

SHELL_JS = """
/* ============================================================
   CASCA — roteamento entre módulos.
   O NutriLog não usa hash; a Ficha de Treino usa (#/hoje, #/treino/...).
   Então a casca reserva apenas duas rotas próprias e entrega
   qualquer outra ao módulo de treino, que continua dono do hash.
   ============================================================ */
var SHELL = {
  active: 'inicio',
  resolve: function () {
    var h = (location.hash || '').replace(/^#\\/?/, '');
    if (!h || h === 'inicio') return 'inicio';
    if (h === 'dieta') return 'dieta';
    return 'treino';
  },
  go: function (mod) {
    location.hash = (mod === 'treino') ? '#/hoje' : '#/' + mod;
  },
  apply: function () {
    var next = this.resolve();
    var changed = next !== this.active;
    this.active = next;
    ['inicio', 'dieta', 'treino'].forEach(function (m) {
      var elm = document.getElementById('mod-' + m);
      if (elm) elm.classList.toggle('mod-active', m === next);
    });
    var sb = document.getElementById('switchbar');
    if (sb) {
      sb.classList.toggle('on', next !== 'inicio');
      sb.querySelectorAll('.seg button[data-go]').forEach(function (b) {
        b.classList.toggle('on', b.dataset.go === next);
      });
    }
    if (next === 'treino' && typeof render === 'function') render();
    if (changed) window.scrollTo(0, 0);
  }
};
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-go]');
  if (!b) return;
  e.preventDefault();
  SHELL.go(b.dataset.go);
});
window.addEventListener('hashchange', function () { SHELL.apply(); });
"""

# ------------------------------------------------- compose
head = n_head.replace('<title>NutriLog — Analista Nutricional</title>',
                      '<title>NutriGYM</title>')
head = head.replace('content="NutriLog — analista nutricional visual e diário alimentar com estimativas honestas, carga glicêmica e relatórios."',
                    'content="appGYM (treino) e NutriLogic (nutrição) no mesmo aplicativo."')
head = head.replace('<meta name="apple-mobile-web-app-title" content="NutriLog">', '')
# o favicon SVG embutido do NutriLogic (folha) dá lugar à nova marca
head = re.sub(r'<link rel="icon" href="data:image/svg\+xml[^>]*>\s*', '', head)
head += ('<meta name="apple-mobile-web-app-title" content="NutriGYM">\n'
         '<link rel="apple-touch-icon" href="./app-icon-180.png">\n'
         '<link rel="icon" type="image/png" sizes="512x512" href="./app-icon-512.png">\n')

out = []
out.append('<!DOCTYPE html>\n<html lang="pt-BR" data-theme="light">\n<head>')
out.append(head)
out.append('<style>' + n_style + '</style>')
out.append('<style>' + SHELL_CSS + '</style>')
out.append('<style>' + PALETTE + t_style + '</style>')
out.append('</head>\n<body>')
out.append(SHELL_HTML)
out.append(SWITCHBAR_HTML)
out.append('<div class="mod" id="mod-dieta">' + n_body + '</div>')
out.append('<div class="mod" id="mod-treino">'
           + '<div id="app"></div><div id="overlay-root"></div><div id="toast-root"></div></div>')
out.append('<script>' + SHELL_JS + '</script>')
out.append('<script>' + n_script + '</script>')
out.append('<script>' + t_script + '</script>')
out.append('<script>SHELL.apply();</script>')
out.append('</body>\n</html>\n')

merged = '\n'.join(out)
open(OUT, 'w', encoding='utf-8').write(merged)
print('merged bytes:', len(merged))
print('lines:', merged.count(chr(10)) + 1)
print('tokens renamed:', len(tokens))
