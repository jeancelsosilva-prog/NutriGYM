/* =============================================================================
 * PONTE  NutriDB Marmitas  ->  NutriLogic
 * -----------------------------------------------------------------------------
 * O módulo de marmitas guarda componentes, não macros. Aqui derivamos os
 * valores com calcMarmita() e registramos cada marmita como um alimento do
 * NutriLogic, para poder lançar no diário como qualquer outro item.
 *
 * Entra por App.SEED_FOODS: o DB.load() do NutriLogic mescla alimentos novos
 * do seed sem sobrescrever edições suas, então isto é idempotente e não
 * atropela nada que você já tenha ajustado à mão.
 * ========================================================================== */
(function () {
  "use strict";
  var App = window.NutriLogApp, M = window.NutriDBMarmitas;
  if (!App || !M || !Array.isArray(App.SEED_FOODS)) return;

  /* macros da marmita -> por 100 g, que é como o NutriLogic guarda tudo */
  function paraAlimento(c, marmita) {
    if (!c || !c.porcaoG) return null;
    var k = 100 / c.porcaoG;
    var r = function (v) { return Math.round(v * k * 10) / 10; };
    return {
      id: "marmita_" + c.id,
      name: c.nome,
      aliases: ["marmita", marmita.marca, marmita.linha].filter(Boolean),
      cat: "pratos",
      unit: "g",
      per100: {
        kcal: Math.round(c.kcal * k),
        protein: r(c.prot),
        carb: r(c.carbTotal),
        fiber: r(c.fibra),
        fat: r(c.gord),
        sat: null,
        sodium: null
      },
      gi: c.ig,
      giRange: c.ig ? [Math.max(0, c.ig - 10), c.ig + 10] : [0, 0],
      // Gramagem da proteína vem do site; o resto é estimado por composição.
      // Registrar como "alta" seria mentir sobre o que se sabe.
      conf: "baixa",
      up: true,
      fried: false,
      portion: c.porcaoG,
      household: [{ label: "marmita", g: c.porcaoG }],
      note: "Macros estimados por composição para fechar a porção declarada. "
          + "Confira o rótulo da caixa e ajuste se divergir.",
      source: (marmita.marca || "Marmita") + " · NutriDB Marmitas (estimado)",
      generic: false
    };
  }

  var novos = [];
  (M.MARMITAS_LIVUP || []).forEach(function (m) {
    var calc;
    try { calc = M.calcMarmita(m); } catch (e) { return; }
    var f = paraAlimento(calc, m);
    if (f) novos.push(f);
  });
  if (!novos.length) return;

  var tem = {};
  App.SEED_FOODS.forEach(function (f) { tem[f.id] = true; });
  var add = novos.filter(function (f) { return !tem[f.id]; });
  add.forEach(function (f) { App.SEED_FOODS.push(f); });

  // Se o banco já carregou (boot passou), recarrega para mesclar os novos.
  if (add.length && App.db && App.db.data && typeof App.db.load === "function") {
    App.db.load();
  }

  // Deixa o módulo acessível para custo, lista de compras e rotina de produção.
  App.marmitas = M;
})();
