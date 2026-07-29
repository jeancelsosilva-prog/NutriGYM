/* Detecta propriedades do NutriLogic vazando para classes de mesmo nome no
   appGYM. Escopo por #id vence a especificidade, mas só nas propriedades
   declaradas — o resto herda do host. Foi assim que o toggle virou bola. */
const fs=require('fs');
const html=fs.readFileSync('/mnt/user-data/outputs/index.html','utf-8');
const styles=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
const nutri=styles[0];
const gym=styles.find(s=>/REDESENHO NA LINGUAGEM DO NUTRILOGIC/.test(s));

const semComentarios = css => css.replace(/\/\*[\s\S]*?\*\//g,'');
function rules(css,test){
  css = semComentarios(css);
  const out={};
  for(const [,sel,body] of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)){
    for(const part of sel.split(',')){
      const p=part.trim();
      if(!test(p)) continue;
      const props=out[p]||(out[p]={});
      for(const decl of body.split(';')){
        const i=decl.indexOf(':');
        if(i>0) props[decl.slice(0,i).trim()]=decl.slice(i+1).trim();
      }
    }
  }
  return out;
}

const colisoes=['.btn','.btn-block','.btn-danger','.btn-ghost','.btn-lg','.btn-outline',
  '.btn-primary','.card','.chip','.divider','.field','.grid-2','.mono','.row','.sheet',
  '.sheet-title','.stack','.stepper','.switch','.toast'];

// propriedades puramente visuais e idempotentes que não causam dano se herdadas
const inofensivas=new Set(['font-family','font-variant-numeric','font-size','color',
  'letter-spacing','line-height','font-weight','-webkit-font-smoothing']);

let p=0,f=0; const ck=(l,c)=>{c?(p++,console.log('PASS:',l)):(f++,console.log('FAIL:',l));};
const nr=rules(nutri,s=>colisoes.includes(s));
const gr=rules(gym,s=>colisoes.some(c=>s===`#mod-treino ${c}`));

let vazamentos=[];
for(const c of colisoes){
  const host=nr[c]; if(!host) continue;
  const mine=gr[`#mod-treino ${c}`]||{};
  const leak=Object.keys(host).filter(k=>!(k in mine) && !inofensivas.has(k));
  if(leak.length) vazamentos.push(`${c}: ${leak.join(', ')}`);
}
ck('nenhuma propriedade estrutural vaza do NutriLogic para o appGYM',vazamentos.length===0);
vazamentos.forEach(v=>console.log('   ->',v));

// verificações pontuais dos três casos corrigidos
const g=k=>gr[`#mod-treino ${k}`]||{};
ck('.switch zera o min-height de 52px do host', g('.switch')['min-height']==='0');
ck('.switch mantém 52x31', g('.switch').width==='52px' && g('.switch').height==='31px');
ck('.sheet zera position/transform do host',
   g('.sheet').position==='relative' && g('.sheet').transform==='none');
ck('.sheet fixa o estado final da animação', /animation:sheetUp[^;]*both/.test(gym));
ck('.stepper zera fundo e padding do host',
   g('.stepper').background==='none' && g('.stepper').padding==='0');

console.log('\n=== VAZAMENTOS:',p,'passaram,',f,'falharam ===');
process.exit(f>0?1:0);
