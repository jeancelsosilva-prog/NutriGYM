/* =============================================================================
 * NUTRIDB :: MÓDULO MARMITAS
 * Marmitas industrializadas (LivUp) + equivalentes caseiras + rotina de produção
 * acoplada ao ciclo de plantão 24x72.
 *
 * Autocontido. Sem build, sem CDN, sem dependências.
 * Uso: <script src="nutridb-marmitas.js"></script>  →  window.NutriDBMarmitas
 *      ou  import { MARMITAS_LIVUP, calcMarmita } from './nutridb-marmitas.js'
 *
 * ---------------------------------------------------------------------------
 * MODELO DE DADOS
 * ---------------------------------------------------------------------------
 * A marmita NÃO guarda macros. Ela guarda uma lista de componentes
 * ({ alimento, g }). Todo valor nutricional é DERIVADO da tabela ALIMENTOS.
 *
 * Vantagem: quando você conferir o rótulo real de uma marmita e descobrir que
 * o arroz integral da LivUp tem 130 kcal/100g e não 124, você corrige UMA
 * linha em ALIMENTOS e todas as 8 marmitas se recalculam.
 *
 * ---------------------------------------------------------------------------
 * PROVENIÊNCIA DOS NÚMEROS  (importante)
 * ---------------------------------------------------------------------------
 * - PREÇOS LivUp: lidos direto do site (jul/2026). Confiáveis. campo `fonte:"site"`.
 * - GRAMAGEM DE PROTEÍNA: lida dos selos do site (125g, 130g, 140g, 180g). Confiável.
 * - DEMAIS GRAMAGENS e MACROS: ESTIMADOS por composição, calibrados p/ bater a
 *   porção total declarada (400g linha clássica / 430g linha Performance).
 *   campo `fonte:"estimado"`. Fotografe o rótulo da primeira caixa que chegar e
 *   rode ajustarPorRotulo() pra travar os valores reais.
 * - IG dos alimentos: tabela internacional (Foster-Powell / Atkinson), glicose=100.
 * ========================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NutriDBMarmitas = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* =============================================================================
 * 1. TABELA DE ALIMENTOS  —  valores por 100 g NO ESTADO EM QUE VÃO PRO POTE
 * =============================================================================
 * kcal  = quilocalorias
 * prot  = proteína (g)
 * carb  = carboidrato TOTAL (g)  ← inclui fibra
 * fibra = fibra alimentar (g)
 * gord  = gordura (g)
 * ig    = índice glicêmico (escala glicose = 100). null = não contém carbo
 *         relevante, fica FORA do cálculo de IG da refeição.
 * rend  = fator de rendimento cru→pronto (usado só no custo). 1 = já é o estado cru.
 * ========================================================================== */

const ALIMENTOS = {
  // --- CEREAIS E TUBÉRCULOS --------------------------------------------------
  arroz_branco_cozido:      { nome: 'Arroz branco cozido',        kcal: 128, prot: 2.5,  carb: 28.0, fibra: 0.4, gord: 0.2, ig: 73, rend: 2.8 },
  arroz_integral_cozido:    { nome: 'Arroz integral cozido',      kcal: 124, prot: 2.6,  carb: 26.0, fibra: 2.7, gord: 1.0, ig: 68, rend: 2.6 },
  pure_batata:              { nome: 'Purê de batata',             kcal:  88, prot: 2.0,  carb: 15.0, fibra: 1.5, gord: 2.5, ig: 83, rend: 1.0 },
  macarrao_cozido:          { nome: 'Macarrão cozido al dente',   kcal: 158, prot: 5.8,  carb: 31.0, fibra: 1.8, gord: 0.9, ig: 49, rend: 2.5 },
  macarrao_yakisoba:        { nome: 'Macarrão yakisoba cozido',   kcal: 150, prot: 5.0,  carb: 29.0, fibra: 2.0, gord: 1.5, ig: 55, rend: 2.4 },

  // --- LEGUMINOSAS -----------------------------------------------------------
  feijao_carioca_cozido:    { nome: 'Feijão carioca cozido',      kcal:  76, prot: 4.8,  carb: 13.6, fibra: 8.5, gord: 0.5, ig: 30, rend: 2.5 },
  feijao_preto_cozido:      { nome: 'Feijão preto cozido',        kcal:  77, prot: 4.5,  carb: 14.0, fibra: 8.4, gord: 0.5, ig: 30, rend: 2.5 },
  ervilha_cozida:           { nome: 'Ervilha cozida',             kcal:  81, prot: 5.0,  carb: 14.0, fibra: 5.0, gord: 0.4, ig: 48, rend: 1.0 },

  // --- PROTEÍNAS -------------------------------------------------------------
  frango_grelhado_cubos:    { nome: 'Peito de frango em cubos',   kcal: 165, prot: 31.0, carb:  0.0, fibra: 0.0, gord: 3.6, ig: null, rend: 0.70 },
  frango_desfiado:          { nome: 'Frango desfiado',            kcal: 165, prot: 31.0, carb:  0.0, fibra: 0.0, gord: 3.6, ig: null, rend: 0.70 },
  almondega_frango:         { nome: 'Almôndega de frango + molho',kcal: 172, prot: 19.0, carb:  4.0, fibra: 0.8, gord: 8.0, ig: 45,  rend: 0.80 },
  almondega_carne:          { nome: 'Almôndega de carne + molho', kcal: 215, prot: 18.0, carb:  5.0, fibra: 0.9, gord: 13.0,ig: 45,  rend: 0.80 },
  carne_moida_refogada:     { nome: 'Carne moída refogada',       kcal: 210, prot: 22.0, carb:  1.0, fibra: 0.2, gord: 13.0,ig: null, rend: 0.75 },
  molho_bolonhesa:          { nome: 'Molho à bolonhesa',          kcal:  90, prot: 6.0,  carb:  6.0, fibra: 1.2, gord: 4.0, ig: 45,  rend: 0.85 },

  // --- HORTALIÇAS ------------------------------------------------------------
  legumes_mistos:           { nome: 'Legumes mistos (cenoura/abobrinha/vagem)', kcal: 45, prot: 2.0, carb: 8.0, fibra: 3.0, gord: 0.4, ig: 35, rend: 1.0 },
  brocolis:                 { nome: 'Brócolis cozido',            kcal:  35, prot: 2.8,  carb:  7.0, fibra: 3.0, gord: 0.4, ig: 15,  rend: 1.0 },
  vagem:                    { nome: 'Vagem cozida',               kcal:  31, prot: 1.8,  carb:  7.0, fibra: 3.0, gord: 0.2, ig: 30,  rend: 1.0 },
  tomate_cereja:            { nome: 'Tomate cereja',              kcal:  18, prot: 0.9,  carb:  3.9, fibra: 1.2, gord: 0.2, ig: 30,  rend: 1.0 },
  repolho_roxo_refogado:    { nome: 'Repolho roxo refogado',      kcal:  40, prot: 1.4,  carb:  6.0, fibra: 2.0, gord: 1.5, ig: 20,  rend: 1.0 },

  // --- GORDURAS, MOLHOS E COMPLEMENTOS --------------------------------------
  amendoas:                 { nome: 'Amêndoas laminadas',         kcal: 579, prot: 21.0, carb: 22.0, fibra: 12.0,gord: 50.0,ig: 15,  rend: 1.0 },
  molho_oriental:           { nome: 'Molho oriental (shoyu/mel)', kcal:  95, prot: 3.0,  carb: 16.0, fibra: 0.3, gord: 1.5, ig: 60,  rend: 1.0 },
  azeite_oleo:              { nome: 'Azeite / óleo',              kcal: 884, prot: 0.0,  carb:  0.0, fibra: 0.0, gord:100.0,ig: null, rend: 1.0 },
};

/* =============================================================================
 * 2. MOTOR DE CÁLCULO
 * =============================================================================
 *
 * 2.1  CALORIAS — fatores de Atwater
 *      kcal = 4×prot + 4×carb_disponível + 9×gordura + 2×fibra
 *      (a fibra fermentável rende ~2 kcal/g; a maioria dos rótulos BR ignora,
 *       por isso o flag CONFIG.contarFibraKcal vem FALSE por padrão, pra bater
 *       com o rótulo. Ligue se quiser fisiologia em vez de rótulo.)
 *
 * 2.2  CARBOIDRATO DISPONÍVEL (o que de fato vira glicose)
 *      carbDisp = carb_total − fibra
 *
 * 2.3  IG DA REFEIÇÃO — média ponderada pela contribuição de carbo disponível
 *      IG_refeicao = Σ(IG_i × carbDisp_i) / Σ(carbDisp_i)
 *      Ingredientes com ig:null (carne pura, óleo) NÃO entram nem no numerador
 *      nem no denominador — eles não têm IG, eles MODULAM (ver 2.5).
 *
 * 2.4  CARGA GLICÊMICA
 *      CG = (IG_refeicao × carbDisp_total) / 100
 *      Classificação por refeição:  ≤10 baixa | 11–19 média | ≥20 alta
 *      Teto diário sugerido:        <80 baixa | 80–120 moderada | >120 alta
 *
 * 2.5  ATENUAÇÃO POR REFEIÇÃO MISTA  (opcional, CONFIG.atenuarMista)
 *      Gordura e proteína retardam esvaziamento gástrico e achatam o pico.
 *      Heurística usada (conservadora, teto de 25% de redução):
 *          fator = 1 − min(0.25, 0.010×gord_g/100g_ref + 0.006×prot_g/100g_ref)
 *      ⚠ Isso é ESTIMATIVA, não medição. O IG cru é o número defensável;
 *        o atenuado é o número útil na prática. Guarde os dois.
 * ========================================================================== */

const CONFIG = {
  contarFibraKcal: false,   // true = soma 2 kcal/g de fibra (fisiológico)
  atenuarMista:    true,    // calcula também igAtenuado / cgAtenuada
  tetoAtenuacao:   0.25,    // redução máxima de 25% no IG
};

const FATOR = { prot: 4, carb: 4, gord: 9, fibra: 2 };

function _somaComponentes(componentes) {
  const t = { g: 0, kcal: 0, prot: 0, carb: 0, fibra: 0, gord: 0 };
  const carbSources = [];

  for (const c of componentes) {
    const a = ALIMENTOS[c.alimento];
    if (!a) throw new Error(`Alimento não encontrado em ALIMENTOS: "${c.alimento}"`);
    const k = c.g / 100;

    t.g     += c.g;
    t.prot  += a.prot  * k;
    t.carb  += a.carb  * k;
    t.fibra += a.fibra * k;
    t.gord  += a.gord  * k;

    const carbDisp = Math.max(0, (a.carb - a.fibra) * k);
    if (a.ig !== null && carbDisp > 0) {
      carbSources.push({ alimento: c.alimento, nome: a.nome, ig: a.ig, carbDisp });
    }
  }

  t.kcal = FATOR.prot * t.prot
         + FATOR.carb * Math.max(0, t.carb - t.fibra)
         + FATOR.gord * t.gord
         + (CONFIG.contarFibraKcal ? FATOR.fibra * t.fibra : 0);

  return { t, carbSources };
}

function classificarCG(cg) {
  if (cg <= 10) return 'baixa';
  if (cg < 20)  return 'media';
  return 'alta';
}

function classificarIG(ig) {
  if (ig === null) return 'sem-carbo';
  if (ig <= 55) return 'baixo';
  if (ig <= 69) return 'medio';
  return 'alto';
}

/**
 * Calcula o perfil nutricional completo de uma marmita.
 * @param {object} marmita  objeto de MARMITAS_LIVUP ou MARMITAS_CASEIRAS
 * @returns {object} perfil com macros, IG, CG e a decomposição por fonte de carbo
 */
function calcMarmita(marmita) {
  const { t, carbSources } = _somaComponentes(marmita.componentes);

  const carbDisp = carbSources.reduce((s, c) => s + c.carbDisp, 0);
  const igCru = carbDisp > 0
    ? carbSources.reduce((s, c) => s + c.ig * c.carbDisp, 0) / carbDisp
    : null;

  let igAtenuado = igCru, fatorAtenuacao = 1;
  if (CONFIG.atenuarMista && igCru !== null && t.g > 0) {
    const gordPor100 = (t.gord / t.g) * 100;
    const protPor100 = (t.prot / t.g) * 100;
    const reducao = Math.min(CONFIG.tetoAtenuacao, 0.010 * gordPor100 + 0.006 * protPor100);
    fatorAtenuacao = 1 - reducao;
    igAtenuado = igCru * fatorAtenuacao;
  }

  const cg  = igCru      !== null ? (igCru      * carbDisp) / 100 : 0;
  const cgA = igAtenuado !== null ? (igAtenuado * carbDisp) / 100 : 0;

  return {
    id: marmita.id,
    nome: marmita.nome,
    porcaoG: Math.round(t.g),
    kcal: Math.round(t.kcal),
    prot: +t.prot.toFixed(1),
    carbTotal: +t.carb.toFixed(1),
    fibra: +t.fibra.toFixed(1),
    carbDisponivel: +carbDisp.toFixed(1),
    gord: +t.gord.toFixed(1),

    ig: igCru !== null ? Math.round(igCru) : null,
    igClasse: classificarIG(igCru !== null ? Math.round(igCru) : null),
    cg: +cg.toFixed(1),
    cgClasse: classificarCG(cg),

    igAtenuado: igAtenuado !== null ? Math.round(igAtenuado) : null,
    cgAtenuada: +cgA.toFixed(1),
    cgAtenuadaClasse: classificarCG(cgA),
    fatorAtenuacao: +fatorAtenuacao.toFixed(3),

    densidadeProteica: +(t.prot / (t.kcal / 100)).toFixed(1),  // g prot por 100 kcal
    kcalPor100g: Math.round((t.kcal / t.g) * 100),

    fontesCarbo: carbSources
      .map(c => ({
        nome: c.nome,
        carbDisp: +c.carbDisp.toFixed(1),
        ig: c.ig,
        contribCG: +((c.ig * c.carbDisp) / 100).toFixed(1),
        pctDaCG: +(((c.ig * c.carbDisp) / 100 / (cg || 1)) * 100).toFixed(0),
      }))
      .sort((a, b) => b.contribCG - a.contribCG),
  };
}

/* =============================================================================
 * 3. MARMITAS LIVUP
 * =============================================================================
 * precoUnit  : preço avulso lido no site (BRL)
 * precoKit   : preço/refeição dentro do Kit 20 Performance
 * porcaoAlvo : porção declarada. Os componentes foram calibrados pra somar isso.
 * ========================================================================== */

const PRECOS_LIVUP = {
  kit20Performance: {
    nome: 'Kit 20 Marmitas Performance',
    porcaoG: 430,
    precoCheio: 725.81,
    precoPadrao: 519.80,          // recompra — é ESTE o preço do longo prazo
    precoPrimeiraCompra: 479.80,  // só uma vez
    unidades: 20,
    porRefeicaoPadrao: 25.99,
    porRefeicaoPrimeira: 23.99,
    freteGratis: true,
    obs: 'Variedade do kit muda conforme estoque da cidade. Em Campo Grande o mix costuma ser mais restrito que SP/RJ.',
  },
  freteGratisAcimaDe: 290.00,
  cashbackPrimeiraCompra: 0.10,
};

const MARMITAS_LIVUP = [
  {
    id: 'livup_almondega_frango_integral',
    nome: 'Almôndega de frango, arroz integral com ervilha, feijão e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 24.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:125g', macros: 'estimado' },
    componentes: [
      { alimento: 'almondega_frango',      g: 125 },
      { alimento: 'arroz_integral_cozido', g: 100 },
      { alimento: 'ervilha_cozida',        g:  20 },
      { alimento: 'feijao_carioca_cozido', g:  80 },
      { alimento: 'legumes_mistos',        g:  75 },
    ],
  },
  {
    id: 'livup_frango_oriental',
    nome: 'Frango oriental, arroz com amêndoas e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 25.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:130g', macros: 'estimado' },
    componentes: [
      { alimento: 'frango_grelhado_cubos',   g: 130 },
      { alimento: 'arroz_branco_cozido',     g: 110 },
      { alimento: 'amendoas',                g:  10 },
      { alimento: 'vagem',                   g:  60 },
      { alimento: 'repolho_roxo_refogado',   g:  75 },
      { alimento: 'molho_oriental',          g:  15 },
    ],
  },
  {
    id: 'livup_almondega_carne_pure',
    nome: 'Almôndega de carne, purê de batata e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 27.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:125g', macros: 'estimado' },
    componentes: [
      { alimento: 'almondega_carne', g: 125 },
      { alimento: 'pure_batata',     g: 140 },
      { alimento: 'legumes_mistos',  g: 135 },
    ],
  },
  {
    id: 'livup_macarrao_bolonhesa',
    nome: 'Macarrão à bolonhesa com legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 28.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'não informado', macros: 'estimado' },
    componentes: [
      { alimento: 'macarrao_cozido',  g: 160 },
      { alimento: 'molho_bolonhesa',  g: 150 },
      { alimento: 'legumes_mistos',   g:  90 },
    ],
  },
  {
    id: 'livup_carne_moida_feijao_preto',
    nome: 'Carne moída, arroz, feijão preto e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 28.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:140g', macros: 'estimado' },
    componentes: [
      { alimento: 'carne_moida_refogada', g: 140 },
      { alimento: 'arroz_branco_cozido',  g: 100 },
      { alimento: 'feijao_preto_cozido',  g:  80 },
      { alimento: 'legumes_mistos',       g:  80 },
    ],
  },
  {
    id: 'livup_frango_lemon_pepper',
    nome: 'Frango com lemon pepper, arroz, feijão e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 25.99, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:130g', macros: 'estimado' },
    componentes: [
      { alimento: 'frango_grelhado_cubos',  g: 130 },
      { alimento: 'arroz_branco_cozido',    g: 100 },
      { alimento: 'feijao_carioca_cozido',  g:  90 },
      { alimento: 'brocolis',               g:  60 },
      { alimento: 'tomate_cereja',          g:  20 },
    ],
  },
  {
    id: 'livup_frango_desfiado_pure',
    nome: 'Frango desfiado, purê de batata e legumes',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 25.49, porcaoAlvo: 400,
    fonte: { preco: 'site', proteinaG: 'site:180g', macros: 'estimado' },
    componentes: [
      { alimento: 'frango_desfiado', g: 180 },
      { alimento: 'pure_batata',     g: 130 },
      { alimento: 'legumes_mistos',  g:  90 },
    ],
  },
  {
    id: 'livup_yakisoba_frango',
    nome: 'Yakisoba de frango com legumes 450g',
    marca: 'LivUp', linha: 'Clássica',
    precoUnit: 27.99, porcaoAlvo: 450,
    fonte: { preco: 'site', proteinaG: 'site:130g', macros: 'estimado' },
    componentes: [
      { alimento: 'macarrao_yakisoba',      g: 180 },
      { alimento: 'frango_grelhado_cubos',  g: 130 },
      { alimento: 'legumes_mistos',         g: 120 },
      { alimento: 'molho_oriental',         g:  20 },
    ],
  },
];

/* =============================================================================
 * 4. CUSTO DE INSUMOS  —  Campo Grande/MS, referência jul/2026
 * =============================================================================
 * precoKg é o preço do item CRU no mercado.
 * O motor converte pronto→cru usando ALIMENTOS[x].rend antes de precificar.
 *   gramasCru = gramasProntas / rend
 * (frango rende 0.70 → 130g prontos exigem 186g crus)
 * ========================================================================== */

const PRECOS_INSUMOS = {
  // mapa alimento → { precoKg, insumo }
  frango_grelhado_cubos:  { precoKg: 21.00, insumo: 'Peito de frango' },
  frango_desfiado:        { precoKg: 21.00, insumo: 'Peito de frango' },
  almondega_frango:       { precoKg: 26.00, insumo: 'Frango moído + molho' },
  almondega_carne:        { precoKg: 38.00, insumo: 'Patinho moído + molho' },
  carne_moida_refogada:   { precoKg: 36.00, insumo: 'Patinho moído' },
  molho_bolonhesa:        { precoKg: 28.00, insumo: 'Carne moída + molho tomate' },
  arroz_branco_cozido:    { precoKg:  6.00, insumo: 'Arroz tipo 1' },
  arroz_integral_cozido:  { precoKg: 10.00, insumo: 'Arroz integral' },
  feijao_carioca_cozido:  { precoKg:  9.00, insumo: 'Feijão carioca' },
  feijao_preto_cozido:    { precoKg:  9.50, insumo: 'Feijão preto' },
  pure_batata:            { precoKg:  7.00, insumo: 'Batata + leite + manteiga' },
  macarrao_cozido:        { precoKg: 10.00, insumo: 'Macarrão sêmola' },
  macarrao_yakisoba:      { precoKg: 16.00, insumo: 'Macarrão yakisoba' },
  legumes_mistos:         { precoKg: 13.00, insumo: 'Seleta congelada' },
  brocolis:               { precoKg: 14.00, insumo: 'Brócolis' },
  vagem:                  { precoKg: 12.00, insumo: 'Vagem' },
  ervilha_cozida:         { precoKg: 12.00, insumo: 'Ervilha congelada' },
  tomate_cereja:          { precoKg: 18.00, insumo: 'Tomate cereja' },
  repolho_roxo_refogado:  { precoKg:  6.00, insumo: 'Repolho roxo' },
  amendoas:               { precoKg: 90.00, insumo: 'Amêndoas laminadas' },
  molho_oriental:         { precoKg: 22.00, insumo: 'Shoyu + mel + gengibre' },
  azeite_oleo:            { precoKg: 14.00, insumo: 'Óleo de soja' },
};

const CUSTOS_FIXOS_POR_MARMITA = {
  tempero:  0.45,   // alho, cebola, sal, temperos secos
  gas:      0.30,   // rateio de botijão por marmita em produção de lote
  energia:  0.10,   // freezer
  pote:     0.12,   // pote 500ml reutilizável, amortizado em ~10 usos
  get total() { return this.tempero + this.gas + this.energia + this.pote; },
};

/**
 * Custo de produzir em casa a mesma composição de uma marmita.
 * @returns {object} custo total, custo por componente e comparativo vs LivUp
 */
function custoCaseiro(marmita) {
  const linhas = [];
  let insumosTotal = 0;

  for (const c of marmita.componentes) {
    const a = ALIMENTOS[c.alimento];
    const p = PRECOS_INSUMOS[c.alimento];
    if (!p) continue;
    const gCru = c.g / (a.rend || 1);
    const custo = (gCru / 1000) * p.precoKg;
    insumosTotal += custo;
    linhas.push({
      insumo: p.insumo,
      gPronto: Math.round(c.g),
      gCru: Math.round(gCru),
      custo: +custo.toFixed(2),
    });
  }

  const total = insumosTotal + CUSTOS_FIXOS_POR_MARMITA.total;
  const refLivUp = marmita.precoUnit ?? PRECOS_LIVUP.kit20Performance.porRefeicaoPadrao;

  return {
    id: marmita.id,
    nome: marmita.nome,
    linhas: linhas.sort((a, b) => b.custo - a.custo),
    custoInsumos: +insumosTotal.toFixed(2),
    custosFixos: +CUSTOS_FIXOS_POR_MARMITA.total.toFixed(2),
    custoTotal: +total.toFixed(2),
    precoLivUp: refLivUp,
    economiaUnit: +(refLivUp - total).toFixed(2),
    multiplicador: +(refLivUp / total).toFixed(1),
  };
}

/* =============================================================================
 * 5. ROTINA DE PRODUÇÃO ACOPLADA AO CICLO 24x72
 * =============================================================================
 * O ciclo tem 4 dias: D0 = plantão (24h), D1/D2/D3 = folga.
 * Demanda de refeições prontas por ciclo:
 *   D0 (plantão): almoço + jantar + ceia         = 3
 *   D1 (recuperação, sono fora de hora): almoço + jantar = 2  ← dia de maior risco de delivery
 *   D2: almoço + jantar (1 costuma ser refeição fresca)  = 1
 *   D3: almoço                                    = 1
 *   → ~7 marmitas por ciclo, ~14 por quinzena de 2 ciclos
 *
 * Estratégia: UMA sessão de batch a cada 2 ciclos (8 dias), 14–16 marmitas.
 * Janela: D2 do primeiro ciclo (já dormiu, ainda longe do próximo plantão).
 * ========================================================================== */

const CICLO = {
  duracaoDias: 4,
  dias: [
    { d: 0, tipo: 'plantao',      marmitas: 3, obs: 'Levar em bolsa térmica. Ceia leve, CG baixa (madrugada).' },
    { d: 1, tipo: 'recuperacao',  marmitas: 2, obs: 'Dia crítico: sono fragmentado + fome desregulada. Marmita pronta evita delivery.' },
    { d: 2, tipo: 'livre',        marmitas: 1, obs: 'Dia de produção. 1 refeição fresca no fogão + 1 marmita.' },
    { d: 3, tipo: 'pre_plantao',  marmitas: 1, obs: 'Carbo maior no jantar, pré-plantão.' },
  ],
  get marmitasPorCiclo() { return this.dias.reduce((s, x) => s + x.marmitas, 0); },
};

const ROTINA_PRODUCAO = {
  id: 'batch_24x72_v1',
  nome: 'Batch cooking 16 marmitas — 2 ciclos',
  janela: 'D2 do ciclo (2º dia de folga)',
  frequencia: 'a cada 8 dias',
  rendimento: 16,
  tempoTotalMin: 165,
  tempoAtivoMin: 75,          // o resto é forno/panela trabalhando sozinho

  // 4 blocos rodando em paralelo — é isso que corta o tempo pela metade
  blocos: [
    {
      ordem: 1, nome: 'Leguminosas (panela de pressão)',
      inicioMin: 0, duracaoMin: 45, ativoMin: 5,
      acao: 'Feijão de molho na véspera. 700g cru → pressão 25min → 1,75kg pronto (≈20 porções de 85g).',
    },
    {
      ordem: 2, nome: 'Proteínas (forno, 2 assadeiras)',
      inicioMin: 5, duracaoMin: 50, ativoMin: 25,
      acao: '2,2kg peito de frango temperado (metade em cubos lemon pepper, metade p/ desfiar) + 1,2kg patinho moído na frigideira. Forno 200°C.',
    },
    {
      ordem: 3, nome: 'Carboidratos (2 bocas)',
      inicioMin: 30, duracaoMin: 35, ativoMin: 15,
      acao: '600g arroz cru (→1,7kg) + 1,5kg batata p/ purê. Arroz cozido e resfriado 12h ganha amido resistente: derruba o IG efetivo em ~10–15%.',
    },
    {
      ordem: 4, nome: 'Hortaliças',
      inicioMin: 60, duracaoMin: 25, ativoMin: 15,
      acao: '1,8kg seleta congelada + brócolis, refogado rápido no azeite. Não cozinhar demais — vai reaquecer depois.',
    },
    {
      ordem: 5, nome: 'Montagem e etiquetagem',
      inicioMin: 100, duracaoMin: 40, ativoMin: 40,
      acao: 'Linha de montagem: pote → carbo → proteína → legume. Etiqueta com ID da marmita + data. Registrar no app via registrarLote().',
    },
    {
      ordem: 6, nome: 'Resfriamento e congelamento',
      inicioMin: 140, duracaoMin: 25, ativoMin: 5,
      acao: 'Esfriar até <21°C em ≤2h (RDC 216). Geladeira: as 4 dos próximos 2 dias. Freezer: as outras 12.',
    },
  ],

  seguranca: {
    resfriamento: 'De 60°C para <10°C em até 2h. Potes abertos, camada fina, geladeira já vazia.',
    validadeGeladeira: '3 dias',
    validadeFreezer: '90 dias (proteína + carbo), 60 dias (purê — textura degrada antes)',
    reaquecimento: 'Micro-ondas até >70°C no centro. Descongelar na geladeira na véspera, nunca em temperatura ambiente.',
    naoCongelarBem: ['pure_batata (fica arenoso)', 'macarrao_cozido (empapa)'],
    plantao: 'Bolsa térmica com gelo reutilizável. Marmita congelada funciona como o próprio gelo e descongela até o almoço.',
  },
};

/**
 * Gera lista de compras consolidada a partir de um plano de marmitas.
 * @param {Array<{marmitaId:string, qtd:number}>} plano
 */
function gerarListaCompras(plano) {
  const todas = [...MARMITAS_LIVUP];
  const acc = {};

  for (const item of plano) {
    const m = todas.find(x => x.id === item.marmitaId);
    if (!m) throw new Error(`Marmita não encontrada: ${item.marmitaId}`);
    for (const c of m.componentes) {
      const a = ALIMENTOS[c.alimento];
      const p = PRECOS_INSUMOS[c.alimento];
      if (!p) continue;
      const gCru = (c.g / (a.rend || 1)) * item.qtd;
      if (!acc[c.alimento]) acc[c.alimento] = { insumo: p.insumo, gCru: 0, precoKg: p.precoKg };
      acc[c.alimento].gCru += gCru;
    }
  }

  const totalUnidades = plano.reduce((s, x) => s + x.qtd, 0);
  const lista = Object.entries(acc).map(([k, v]) => ({
    alimento: k,
    insumo: v.insumo,
    quantidade: v.gCru >= 1000 ? `${(v.gCru / 1000).toFixed(2)} kg` : `${Math.round(v.gCru)} g`,
    gCru: Math.round(v.gCru),
    custo: +((v.gCru / 1000) * v.precoKg).toFixed(2),
  })).sort((a, b) => b.custo - a.custo);

  const custoInsumos = lista.reduce((s, x) => s + x.custo, 0);
  const custoFixo = CUSTOS_FIXOS_POR_MARMITA.total * totalUnidades;

  return {
    unidades: totalUnidades,
    lista,
    custoInsumos: +custoInsumos.toFixed(2),
    custoFixo: +custoFixo.toFixed(2),
    custoTotal: +(custoInsumos + custoFixo).toFixed(2),
    custoPorMarmita: +((custoInsumos + custoFixo) / totalUnidades).toFixed(2),
  };
}

/**
 * Compara o custo de N marmitas: LivUp avulso vs Kit 20 vs produção caseira.
 */
function compararCenarios(qtd = 20) {
  const k = PRECOS_LIVUP.kit20Performance;
  const mediaAvulso = MARMITAS_LIVUP.reduce((s, m) => s + m.precoUnit, 0) / MARMITAS_LIVUP.length;
  const caseiroMedia = MARMITAS_LIVUP.reduce((s, m) => s + custoCaseiro(m).custoTotal, 0) / MARMITAS_LIVUP.length;

  return {
    quantidade: qtd,
    cenarios: [
      { nome: 'LivUp avulso',              unit: +mediaAvulso.toFixed(2),        total: +(mediaAvulso * qtd).toFixed(2) },
      { nome: 'LivUp Kit 20 (recompra)',   unit: k.porRefeicaoPadrao,            total: +(k.porRefeicaoPadrao * qtd).toFixed(2) },
      { nome: 'LivUp Kit 20 (1ª compra)',  unit: k.porRefeicaoPrimeira,          total: +(k.porRefeicaoPrimeira * qtd).toFixed(2) },
      { nome: 'Caseiro (batch)',           unit: +caseiroMedia.toFixed(2),       total: +(caseiroMedia * qtd).toFixed(2) },
    ],
    economiaVsKitPadrao: +((k.porRefeicaoPadrao - caseiroMedia) * qtd).toFixed(2),
    horasDeTrabalho: +(ROTINA_PRODUCAO.tempoAtivoMin / 60 * (qtd / ROTINA_PRODUCAO.rendimento)).toFixed(1),
    get valorDaHora() {
      return +(this.economiaVsKitPadrao / this.horasDeTrabalho).toFixed(2);
    },
  };
}

/**
 * Substitui os macros estimados pelos valores reais do rótulo.
 * Recalibra proporcionalmente os componentes pra bater com o rótulo,
 * preservando a estrutura de IG por fonte.
 * @param {string} marmitaId
 * @param {{kcal:number, prot:number, carb:number, fibra:number, gord:number, porcaoG:number}} rotulo
 */
function ajustarPorRotulo(marmitaId, rotulo) {
  const m = MARMITAS_LIVUP.find(x => x.id === marmitaId);
  if (!m) throw new Error(`Marmita não encontrada: ${marmitaId}`);
  const antes = calcMarmita(m);
  m.rotuloReal = { ...rotulo, registradoEm: new Date().toISOString().slice(0, 10) };
  m.fonte.macros = 'rotulo';
  m.ajuste = {
    kcal:  +(rotulo.kcal  / antes.kcal).toFixed(3),
    prot:  +(rotulo.prot  / antes.prot).toFixed(3),
    carb:  +(rotulo.carb  / antes.carbTotal).toFixed(3),
    gord:  +(rotulo.gord  / antes.gord).toFixed(3),
  };
  return { antes, rotulo, desvio: m.ajuste };
}

/* =============================================================================
 * 6. SNAPSHOT PRÉ-CALCULADO  (útil pra popular tela sem recalcular)
 * ========================================================================== */

function snapshot() {
  return MARMITAS_LIVUP.map(m => {
    const n = calcMarmita(m);
    const c = custoCaseiro(m);
    return {
      ...n,
      precoLivUp: m.precoUnit,
      custoCaseiro: c.custoTotal,
      economia: c.economiaUnit,
      multiplicador: c.multiplicador,
      kcalPorReal: Math.round(n.kcal / m.precoUnit),
      protPorReal: +(n.prot / m.precoUnit).toFixed(2),
    };
  });
}

/* =============================================================================
 * 7. EXPORT
 * ========================================================================== */

return {
  ALIMENTOS,
  MARMITAS_LIVUP,
  PRECOS_LIVUP,
  PRECOS_INSUMOS,
  CUSTOS_FIXOS_POR_MARMITA,
  CICLO,
  ROTINA_PRODUCAO,
  CONFIG,
  calcMarmita,
  custoCaseiro,
  gerarListaCompras,
  compararCenarios,
  ajustarPorRotulo,
  classificarCG,
  classificarIG,
  snapshot,
};

});
