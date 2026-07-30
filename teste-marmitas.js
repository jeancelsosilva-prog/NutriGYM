const { JSDOM } = require('jsdom');
const html = require('fs').readFileSync('/mnt/user-data/outputs/index.html','utf-8');
(async()=>{
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',resources:'usable',pretendToBeVisual:true});
  const w=dom.window, ev=c=>w.eval(c);
  await new Promise(r=>setTimeout(r,400));
  let p=0,f=0; const ck=(l,c)=>{c?(p++,console.log('PASS:',l)):(f++,console.log('FAIL:',l));};

  ck('módulo de marmitas carregou', typeof ev('window.NutriDBMarmitas')==='object');
  ck('8 marmitas no catálogo', ev('window.NutriDBMarmitas.MARMITAS_LIVUP.length')===8);
  ck('módulo exposto em App.marmitas', typeof ev('window.NutriLogApp.marmitas')==='object');

  // viraram alimentos do NutriLogic
  const n = ev(`window.NutriLogApp.SEED_FOODS.filter(f=>f.id.indexOf('marmita_')===0).length`);
  ck('8 marmitas viraram alimentos do seed', n===8);
  const noDb = ev(`window.NutriLogApp.db.data.foods.filter(f=>f.id.indexOf('marmita_')===0).length`);
  ck('8 marmitas chegaram ao banco carregado', noDb===8);

  // integridade nutricional: derivado bate com o cálculo do módulo
  const ok = ev(`(function(){
    var M=window.NutriDBMarmitas, App=window.NutriLogApp, erros=[];
    M.MARMITAS_LIVUP.forEach(function(m){
      var c=M.calcMarmita(m);
      var f=App.db.data.foods.find(x=>x.id==='marmita_'+c.id);
      if(!f){erros.push(c.id+': ausente');return;}
      var kcalPorcao=Math.round(f.per100.kcal*f.portion/100);
      if(Math.abs(kcalPorcao-c.kcal)>3) erros.push(c.id+': kcal '+kcalPorcao+' vs '+c.kcal);
      var protPorcao=+(f.per100.protein*f.portion/100).toFixed(1);
      if(Math.abs(protPorcao-c.prot)>0.6) erros.push(c.id+': prot '+protPorcao+' vs '+c.prot);
      if(f.portion!==c.porcaoG) erros.push(c.id+': porcao');
    });
    return erros.join(' | ');})()`);
  ck('macros por 100g reconstroem a porção original', ok==='');
  if(ok) console.log('   ->',ok);

  // formato compatível com o resto do app
  const shape = ev(`(function(){
    var App=window.NutriLogApp;
    var ref=App.SEED_FOODS.find(f=>f.id==='arroz_branco_cozido');
    var mar=App.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0);
    var faltando=Object.keys(ref).filter(k=>!(k in mar));
    var faltandoP=Object.keys(ref.per100).filter(k=>!(k in mar.per100));
    return faltando.concat(faltandoP).join(',');})()`);
  ck('mesma forma dos demais alimentos', shape==='');
  if(shape) console.log('   -> campos faltando:',shape);

  ck('categoria "pratos"', ev(`window.NutriLogApp.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0).cat`)==='pratos');
  ck('confiança "baixa" (macros são estimados)', ev(`window.NutriLogApp.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0).conf`)==='baixa');
  ck('marcado como ultraprocessado', ev(`window.NutriLogApp.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0).up`)===true);
  ck('medida caseira "1 marmita" com a gramagem', ev(`window.NutriLogApp.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0).household[0].label`)==='marmita');
  ck('IG calculado presente', ev(`window.NutriLogApp.SEED_FOODS.find(f=>f.id.indexOf('marmita_')===0).gi`)>0);

  // idempotência: rodar de novo não duplica
  ev(`window.NutriLogApp.db.load(); window.NutriLogApp.db.load();`);
  ck('recarregar o banco não duplica marmitas',
     ev(`window.NutriLogApp.db.data.foods.filter(f=>f.id.indexOf('marmita_')===0).length`)===8);

  // funções extras continuam disponíveis
  ck('custo caseiro disponível', typeof ev('window.NutriDBMarmitas.custoCaseiro')==='function');
  ck('lista de compras disponível', typeof ev('window.NutriDBMarmitas.gerarListaCompras')==='function');
  ck('comparação de cenários disponível', typeof ev('window.NutriDBMarmitas.compararCenarios')==='function');

  // não quebrou o appGYM
  ev(`state.onboarded=true; SHELL.go('treino'); render();`);
  await new Promise(r=>setTimeout(r,60));
  ck('appGYM segue funcionando', w.document.getElementById('app').innerHTML.length>500);

  console.log('\n=== MARMITAS:',p,'passaram,',f,'falharam ===');
  process.exit(f>0?1:0);
})().catch(e=>{console.error('CRASH:',e);process.exit(1)});
