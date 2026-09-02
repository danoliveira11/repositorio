/* ================= DATA LOAD =================
   Os dados nao ficam mais embutidos no HTML. O loader do index.html
   baixa os quatro arquivos JSON da pasta /data (local ou GitHub) e
   deixa tudo pronto em window.SOTREQ_DATA antes de injetar este script. */
const DADOS = window.SOTREQ_DATA || {};

const RAW = (DADOS.raw || [])
  .filter(r => r.d && r.eq && /^\d{4}-\d{2}-\d{2}$/.test(r.d));

const FULL_MAINTENANCE_DATA = (DADOS.maint || []).map(d => ({
  equipment: d.equipment, startTime: d.startTime, endTime: d.endTime, duration: d.duration,
  description: d.description,
  type: (d.description||'').includes('HMC') || (d.description||'').includes('Corretiva') ? 'corretiva' : 'preventiva',
  code: d.code, classification: d.classification, conjunto: d.conjunto,
  problema: d.problema, solucao: d.solucao, causa: d.causa, falha: d.falha
}));
const COMPONENTS_DATA = DADOS.components || [];
const PM_DATA = DADOS.pm || [];

/* ================= HELPERS ================= */
const fmtPct = v => (isFinite(v) ? (v*100).toFixed(1) : '0.0') + '%';
const fmtPctRaw = v => (isFinite(v) ? v.toFixed(1) : '0.0') + '%'; // v already in %
const fmtH = v => (isFinite(v) ? v.toFixed(1) : '0.0');
const sum = (arr,f) => arr.reduce((a,r)=>a+(f(r)||0),0);
const uniq = arr => [...new Set(arr)].filter(Boolean).sort();

function computeIndicators(rows){
  const HC = sum(rows,r=>r.hc), HM = sum(rows,r=>r.hm), HMC = sum(rows,r=>r.hmc);
  const HD = sum(rows,r=>r.hd), HT = sum(rows,r=>r.ht);
  const NIC = sum(rows,r=>r.nic), NIM = sum(rows,r=>r.nim);
  const MPS = sum(rows,r=>r.mps), MPNS = sum(rows,r=>r.mpns), HAC = sum(rows,r=>r.hac);
  const DF = HC>0 ? (HC-HM)/HC : 0;
  const UF = HD>0 ? HT/HD : 0;
  const MTBF = NIC>0 ? HT/NIC : 0;
  const MTTR = NIC>0 ? HMC/NIC : 0;
  const RO = DF*UF;
  const DM = (HT+HMC)>0 ? HT/(HT+HMC) : 0;
  const MTBS = NIM>0 ? HT/NIM : 0;
  return {HC,HM,HMC,HD,HT,NIC,NIM,MPS,MPNS,HAC,DF,UF,MTBF,MTTR,RO,DM,MTBS};
}

/* Thresholds for KPI coloring (percentage-based indicators) */
const THRESH = {
  DF:{good:.90,warn:.80}, UF:{good:.70,warn:.55}, RO:{good:.65,warn:.45}, DM:{good:.90,warn:.80}
};
function pillClass(key,val){
  const t = THRESH[key]; if(!t) return 'pill-good';
  if(val>=t.good) return 'pill-good';
  if(val>=t.warn) return 'pill-warn';
  return 'pill-bad';
}
function pillLabel(cls){ return cls==='pill-good'?'Bom':cls==='pill-warn'?'Atenção':'Crítico'; }
function barColor(cls){ return cls==='pill-good'?'#1e8e5a':cls==='pill-warn'?'#c98a00':'#c62d3c'; }
const KPI_ICONS = {
  DF:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-2.9 8-7 9-4.1-1-7-4.5-7-9V6l7-3z"/><path d="M9 12.3l2 2 4-4.4"/></svg>',
  UF:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5.5"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/></svg>',
  MTBF:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-2.9 8-7 9-4.1-1-7-4.5-7-9V6l7-3z"/><circle cx="12" cy="11" r="2.2"/><path d="M12 7.4v1M12 13.6v1M8.8 11h1M14.2 11h1M9.7 8.7l.7.7M13.6 12.6l.7.7M9.7 13.3l.7-.7M13.6 9.4l.7-.7"/></svg>',
  MTTR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 4.6l-6 6a1.6 1.6 0 0 0 2.3 2.3l6-6a4 4 0 0 0 4.6-5.4l-2.6 2.6-2-.6-.6-2z"/></svg>',
  RO:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16"/><rect x="5" y="14" width="2.6" height="6" fill="currentColor" stroke="none" rx=".5"/><rect x="10.7" y="10.5" width="2.6" height="9.5" fill="currentColor" stroke="none" rx=".5"/><rect x="16.4" y="7" width="2.6" height="13" fill="currentColor" stroke="none" rx=".5"/><path d="M5 12l5-3.5 3.5 2L19 5"/></svg>',
  DM:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 13.5a7.4 7.4 0 0 0 0-3l2-1.6-2-3.4-2.3.9a7.3 7.3 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.4a7.3 7.3 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.6a7.4 7.4 0 0 0 0 3l-2 1.6 2 3.4 2.3-.9c.75.66 1.63 1.16 2.6 1.5l.5 2.5h4l.5-2.5a7.3 7.3 0 0 0 2.6-1.5l2.3.9 2-3.4-2-1.6z"/></svg>',
};

/* ================= FILTER OPTIONS ================= */
function fillSelect(id, values, labelAll){
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${labelAll}</option>` + values.map(v=>`<option value="${v}">${v}</option>`).join('');
}
fillSelect('fModelo', uniq(RAW.map(r=>r.md)), 'Todos');

const ALL_EQUIP = uniq(RAW.map(r=>r.eq));
const selectedEquip = new Set();
// Painel abre limpo -- só renderiza dados de verdade depois que o usuário
// mexer em algum filtro (Aplicar, trocar data/modelo, ou Limpar filtros).
let filtersApplied = false;

// Build a map of equipment by model
const EQUIP_BY_MODEL = {};
RAW.forEach(r=>{
  if(!EQUIP_BY_MODEL[r.md]) EQUIP_BY_MODEL[r.md] = new Set();
  EQUIP_BY_MODEL[r.md].add(r.eq);
});
// Convert to arrays and sort
Object.keys(EQUIP_BY_MODEL).forEach(md=>{
  EQUIP_BY_MODEL[md] = [...EQUIP_BY_MODEL[md]].sort();
});

document.getElementById('equipCount').textContent = ALL_EQUIP.length;

/* Bound the date-range inputs to the actual data extent */
const ALL_DATES = uniq(RAW.map(r=>r.d)).sort();
document.getElementById('fDataIni').min = ALL_DATES[0];
document.getElementById('fDataIni').max = ALL_DATES[ALL_DATES.length-1];
document.getElementById('fDataFim').min = ALL_DATES[0];
document.getElementById('fDataFim').max = ALL_DATES[ALL_DATES.length-1];

/* format date label dd/mm from yyyy-mm-dd */
function ddmm(iso){ const p=iso.split('-'); return p[2]+'/'+p[1]; }
function ddmmyyyy(iso){ const p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }

// Atualiza "Período de referência" no cabeçalho pra sempre bater com o
// filtro de Início/Fim aplicado (ou, se algum dos dois ficar em aberto, com
// o intervalo real dos dados carregados naquele momento).
function updatePeriodoRef(rows){
  const fdi = document.getElementById('fDataIni').value;
  const fdf = document.getElementById('fDataFim').value;
  const el = document.getElementById('periodoRef');
  let ini = fdi, fim = fdf;
  if(!ini || !fim){
    const dates = rows.map(r=>r.d).sort();
    if(dates.length){
      ini = ini || dates[0];
      fim = fim || dates[dates.length-1];
    }
  }
  if(!ini && !fim){ el.textContent = '–'; return; }
  if(ini && fim && ini !== fim) el.textContent = `${ddmmyyyy(ini)} – ${ddmmyyyy(fim)}`;
  else el.textContent = ddmmyyyy(ini || fim);
}

/* ---------- Multiselect: Equipamento ---------- */
const msPanel = document.getElementById('fEquipPanel');
const msToggle = document.getElementById('fEquipBtn');
const msOptions = document.getElementById('fEquipOptions');
const msLabel = document.getElementById('fEquipLabel');
const msSearch = document.getElementById('fEquipSearch');

msOptions.innerHTML = ALL_EQUIP.map(eq=>`
  <label class="ms-option" data-eq="${eq}">
    <input type="checkbox" value="${eq}"> <span>${eq}</span>
  </label>`).join('') || '<div class="ms-empty">Nenhum equipamento</div>';

function updateEquipLabel(){
  if(selectedEquip.size===0) msLabel.textContent = 'Todos';
  else if(selectedEquip.size===1) msLabel.textContent = [...selectedEquip][0];
  else msLabel.textContent = selectedEquip.size + ' selecionados';
  const currentModelEquip = getAvailableEquipment();
  document.getElementById('fEquipCount').textContent = selectedEquip.size + ' de ' + currentModelEquip.length + ' selecionados';
}

function getAvailableEquipment(){
  const fm = document.getElementById('fModelo').value;
  return fm ? EQUIP_BY_MODEL[fm] || [] : ALL_EQUIP;
}

function updateEquipmentOptions(){
  const availableEquip = getAvailableEquipment();
  // Clear equipment selection when model changes
  selectedEquip.clear();
  
  // Regenerate equipment options
  msOptions.innerHTML = availableEquip.map(eq=>`
    <label class="ms-option" data-eq="${eq}">
      <input type="checkbox" value="${eq}"> <span>${eq}</span>
    </label>`).join('') || '<div class="ms-empty">Nenhum equipamento disponível</div>';
  
  updateEquipLabel();
  updateClearButtons();
}

msToggle.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  const isOpen = msPanel.classList.toggle('open');
  msToggle.classList.toggle('open', isOpen);
  if(isOpen){ msSearch.value=''; filterEquipOptions(); msSearch.focus(); }
});
document.addEventListener('click', (ev)=>{
  if(!document.getElementById('msEquip').contains(ev.target)){
    msPanel.classList.remove('open');
    msToggle.classList.remove('open');
  }
});

// Attach change listener ONCE for all checkboxes in equipment options
function attachEquipmentChangeListener(){
  msOptions.addEventListener('change', (ev)=>{
    const cb = ev.target;
    if(cb.type!=='checkbox') return;
    if(cb.checked) selectedEquip.add(cb.value); else selectedEquip.delete(cb.value);
    updateEquipLabel();
    updateClearButtons();
    renderAll();
  });
}
attachEquipmentChangeListener();
document.getElementById('fEquipSelAll').addEventListener('click', ()=>{
  msOptions.querySelectorAll('.ms-option:not(.hidden) input').forEach(cb=>{ cb.checked=true; selectedEquip.add(cb.value); });
  updateEquipLabel(); updateClearButtons(); renderAll();
});
document.getElementById('fEquipClearAll').addEventListener('click', ()=>{
  msOptions.querySelectorAll('input').forEach(cb=>cb.checked=false);
  selectedEquip.clear();
  updateEquipLabel(); updateClearButtons(); renderAll();
});
function filterEquipOptions(){
  const q = msSearch.value.trim().toLowerCase();
  msOptions.querySelectorAll('.ms-option').forEach(opt=>{
    opt.classList.toggle('hidden', q && !opt.dataset.eq.toLowerCase().includes(q));
  });
}
msSearch.addEventListener('input', filterEquipOptions);

/* ================= CHARTS (instances) ================= */
// Plugin de rotulo de dados registrado globalmente mas desligado por padrao
// (Chart.defaults) -- so o grafico DF x UF liga explicitamente nos seus
// datasets, pra nao poluir os outros graficos com rotulo em cada barra/ponto.
if(typeof ChartDataLabels !== 'undefined'){
  Chart.register(ChartDataLabels);
  Chart.defaults.set('plugins.datalabels', {display:false});
}
let chTrendDfUf, chTrendMtbfMttr, chDowntimeCorretiva, chDowntimePreventiva;
const CAT_YELLOW='#FFC72C', CAT_BLACK='#151515', CAT_GREEN='#1e8e5a', CAT_GRAY='#c9c9cc';

function getFiltered(){
  const fdi=document.getElementById('fDataIni').value;
  const fdf=document.getElementById('fDataFim').value;
  const fm=document.getElementById('fModelo').value;
  return RAW.filter(r=>
    (!fdi || r.d>=fdi) &&
    (!fdf || r.d<=fdf) &&
    (!fm || r.md===fm) &&
    (selectedEquip.size===0 || selectedEquip.has(r.eq))
  );
}

function renderKPIs(ind){
  const cards = [
    {key:'DF', name:'DF', full:'Disponibilidade Física', val:ind.DF, fmt:fmtPct, meta:0.89},
    {key:'UF', name:'UF', full:'Utilização Física', val:ind.UF, fmt:fmtPct, meta:0.78},
    {key:'MTBF', name:'MTBF', full:'Tempo Médio Entre Falhas', val:ind.MTBF, fmt:v=>fmtH(v)+' h', noThresh:true, meta:80},
    {key:'MTTR', name:'MTTR', full:'Tempo Médio de Reparo', val:ind.MTTR, fmt:v=>fmtH(v)+' h', noThresh:true, invert:true},
    {key:'RO', name:'RO', full:'Rendimento Operacional', val:ind.RO, fmt:fmtPct},
    {key:'DM', name:'DM', full:'Disponibilidade Mecânica', val:ind.DM, fmt:fmtPct},
  ];
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = cards.map(c=>{
    let cls, pillText, pct;

    if(c.meta != null){
      // Status baseado na meta definida (atingiu ou não), não nas faixas genéricas.
      const metGoal = c.invert ? c.val <= c.meta : c.val >= c.meta;
      cls = metGoal ? 'pill-good' : 'pill-bad';
      pillText = metGoal ? 'Meta atingida' : 'Abaixo da meta';
      if(c.noThresh){
        // Métrica sem teto natural (ex.: horas) -- escala a barra para caber valor e meta.
        const scaleMax = Math.max(c.val, c.meta) * 1.2 || 1;
        pct = c.val / scaleMax;
      } else {
        pct = Math.min(c.val, 1);
      }
    } else if(!c.noThresh){
      cls = pillClass(c.key, c.val);
      pillText = pillLabel(cls);
      pct = Math.min(c.val, 1);
    } else {
      cls = 'pill-good';
      pct = 0.7;
    }

    const showPill = c.meta != null || !c.noThresh;
    return `<div class="kpi-card">
      <div class="kpi-heading">
        <span class="kpi-icon">${KPI_ICONS[c.key]}</span>
        <div class="kpi-name-full">${c.full}</div>
      </div>
      <div class="kpi-row">
        <div class="kpi-value${c.key==='MTBF' ? ' kpi-value-sm' : ''}">${c.fmt(c.val)}</div>
        ${showPill ? `<span class="kpi-status ${cls}">${pillText}</span>` : ''}
      </div>
      <div class="kpi-meta-row">
        <span class="kpi-meta-label">${c.meta != null ? `Meta: ${c.fmt(c.meta)}` : 'Meta'}</span>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${(pct*100).toFixed(0)}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

/* Escreve o valor de cada coluna acima da barra, nos gráficos diários
   coloridos por meta (Corretivas/dia, Downtime Corretiva/Preventiva). */
// Degradê preto -> cinza reutilizado nas barras "principais" dos gráficos
// diários e dos gráficos de PM (a barra "secundária" usa CAT_YELLOW puro).
const barGradientStatic = (ctxWrap) => {
  const {ctx, chartArea} = ctxWrap.chart;
  if(!chartArea) return '#3a3a3c';
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, '#6b6b6e');
  g.addColorStop(1, '#151515');
  return g;
};

const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    if(meta.hidden) return;
    ctx.save();
    ctx.font = "700 12px -apple-system,Segoe UI,Arial,sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a4a4c';
    meta.data.forEach((bar, i) => {
      const v = chart.data.datasets[0].data[i];
      if(v == null || v === '' || +v === 0) return;
      ctx.fillText(v, bar.x, bar.y - 4);
    });
    ctx.restore();
  }
};

/* Rótulo de valor em cima de cada barra/ponto, para todos os datasets do
   gráfico (ao contrário de barValueLabelsPlugin, que só olha o dataset 0) --
   usado nos gráficos de PM, que têm duas séries lado a lado. */
const pmValueLabelsPlugin = {
  id: 'pmValueLabels',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    chart.data.datasets.forEach((ds, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if(meta.hidden) return;
      ctx.save();
      ctx.font = "700 12px -apple-system,Segoe UI,Arial,sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = dsIndex === 0 ? '#151515' : '#8a6d00';
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if(v == null || v === '') return;
        ctx.fillText(v, el.x, el.y - (ds.type === 'bar' ? 6 : 10));
      });
      ctx.restore();
    });
  }
};

const MESES_PT_JS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// PM_DATA vem cru (uma linha por ordem de PM) pra poder respeitar os
// mesmos filtros de Período e Modelo (frota) usados no resto do painel --
// mesmo padrão de getFilteredMaintenance(), usando EQUIP_BY_MODEL pra achar
// a frota de cada equipamento (a base de PM não guarda o modelo direto).
function pmModelMatch(eq, fm){
  if(!fm) return true;
  for(const [model, equipArray] of Object.entries(EQUIP_BY_MODEL)){
    if(equipArray.includes(eq)) return model === fm;
  }
  return false;
}

// Ano travado em 2026, independente do filtro de Período escolhido pelo
// usuário -- histórico de PM vai até 2021 e não faz sentido misturar com
// outros anos nos 3 gráficos mensais. Só a frota (Modelo) continua filtrável.
function getFilteredPM(){
  if(typeof PM_DATA === 'undefined') return [];
  const fm = document.getElementById('fModelo').value;
  return PM_DATA.filter(r => r.d >= '2026-01-01' && r.d <= '2026-12-31' && pmModelMatch(r.eq, fm));
}

// Já os 3 cards de status (em atraso / concluída no prazo / concluída em
// atraso) respeitam o filtro de Período escolhido pelo usuário de verdade.
function getFilteredPMByDate(){
  if(typeof PM_DATA === 'undefined') return [];
  const fdi = document.getElementById('fDataIni').value;
  const fdf = document.getElementById('fDataFim').value;
  const fm = document.getElementById('fModelo').value;
  return PM_DATA.filter(r => (!fdi || r.d >= fdi) && (!fdf || r.d <= fdf) && pmModelMatch(r.eq, fm));
}

// Classifica cada ordem de PM pelo prazo programado de término (progFim) x
// quando (se) foi realizada (realFim). Sem realFim e já passado o prazo =
// em atraso; com realFim, compara a data de conclusão com o prazo pra saber
// se terminou dentro ou fora do previsto.
function classifyPM(rows){
  const today = new Date().toISOString().slice(0, 10);
  let pendenteAtraso = 0, concluidaNoPrazo = 0, concluidaAtraso = 0;
  rows.forEach(r => {
    if(!r.progFim) return;
    if(r.realFim){
      if(r.realFim <= r.progFim) concluidaNoPrazo++; else concluidaAtraso++;
    } else if(r.progFim < today){
      pendenteAtraso++;
    }
  });
  return {pendenteAtraso, concluidaNoPrazo, concluidaAtraso};
}

let chPmBacklogsGerados, chPmBacklogsExec, chPmHoras;
function renderPMCharts(){
  const rows = getFilteredPM();
  const pmDateRows = getFilteredPMByDate();
  const status = classifyPM(pmDateRows);
  document.getElementById('pmStatusAtraso').textContent = status.pendenteAtraso;
  document.getElementById('pmStatusNoPrazo').textContent = status.concluidaNoPrazo;
  document.getElementById('pmStatusAtrasoConcluida').textContent = status.concluidaAtraso;

  if(!rows.length){
    [chPmBacklogsGerados, chPmBacklogsExec, chPmHoras].forEach(c => c && c.destroy());
    chPmBacklogsGerados = chPmBacklogsExec = chPmHoras = null;
    return;
  }

  // Agrega por mês (ano-mês de "d") depois de filtrado -- os totais mensais
  // mudam conforme o período/frota escolhidos pelo usuário.
  const months = {};
  rows.forEach(r => {
    const key = r.d.slice(0, 7); // 'YYYY-MM'
    const mo = months[key] || (months[key] = {p0:0, p1:0, blProg:0, blExec:0, hProg:0, hReal:0});
    mo.p0 += r.p0; mo.p1 += r.p1;
    mo.blProg += r.blProg; mo.blExec += r.blExec;
    mo.hProg += r.hProg; mo.hReal += r.hReal;
  });
  const keys = Object.keys(months).sort();
  const labels = keys.map(k => {
    const [y, m] = k.split('-');
    return MESES_PT_JS[+m - 1] + '/' + y;
  });
  const p0 = keys.map(k => Math.round(months[k].p0));
  const p1 = keys.map(k => Math.round(months[k].p1));
  const blProg = keys.map(k => Math.round(months[k].blProg));
  const blExec = keys.map(k => Math.round(months[k].blExec));
  const hProg = keys.map(k => +months[k].hProg.toFixed(1));
  const hReal = keys.map(k => +months[k].hReal.toFixed(1));

  const baseOptions = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    interaction:{mode:'index',intersect:false}
  };
  const countScales = { y:{ beginAtZero:true, ticks:{precision:0,font:{size:10}}, grid:{color:'#eef0f2'} }, x:{ grid:{display:false}, ticks:{font:{size:10}} } };
  const hourScales = { y:{ beginAtZero:true, ticks:{callback:v=>v+'h',font:{size:10}}, grid:{color:'#eef0f2'} }, x:{ grid:{display:false}, ticks:{font:{size:10}} } };

  if(chPmBacklogsGerados) chPmBacklogsGerados.destroy();
  chPmBacklogsGerados = new Chart(document.getElementById('chartPmBacklogsGerados'), {
    type:'line',
    data:{ labels, datasets:[
      {label:"BL's P0", data:p0, borderColor:CAT_BLACK, backgroundColor:CAT_BLACK, tension:.3, pointRadius:3, borderWidth:2.5},
      {label:"BL's P1", data:p1, borderColor:CAT_YELLOW, backgroundColor:CAT_YELLOW, tension:.3, pointRadius:3, borderWidth:2.5},
    ]},
    options:{ ...baseOptions, scales:countScales },
    plugins:[pmValueLabelsPlugin]
  });

  if(chPmBacklogsExec) chPmBacklogsExec.destroy();
  chPmBacklogsExec = new Chart(document.getElementById('chartPmBacklogsExec'), {
    type:'bar',
    data:{ labels, datasets:[
      {label:"BL's Prog.", data:blProg, backgroundColor:barGradientStatic, borderRadius:4, maxBarThickness:26},
      {label:"BL's Executados", data:blExec, backgroundColor:CAT_YELLOW, borderRadius:4, maxBarThickness:26},
    ]},
    options:{ ...baseOptions, scales:countScales },
    plugins:[pmValueLabelsPlugin]
  });

  if(chPmHoras) chPmHoras.destroy();
  chPmHoras = new Chart(document.getElementById('chartPmHoras'), {
    type:'bar',
    data:{ labels, datasets:[
      {label:'Horas Programadas', data:hProg, backgroundColor:barGradientStatic, borderRadius:4, maxBarThickness:26},
      {label:'Horas Exec. Real', data:hReal, backgroundColor:CAT_YELLOW, borderRadius:4, maxBarThickness:26},
    ]},
    options:{ ...baseOptions, scales:hourScales },
    plugins:[pmValueLabelsPlugin]
  });
}

function renderTrend(rows){
  const byDate = {};
  rows.forEach(r=>{ (byDate[r.d]=byDate[r.d]||[]).push(r); });
  const dates = Object.keys(byDate).sort();
  const df=[],uf=[],mtbf=[],nic=[],hmc=[],prevH=[];
  dates.forEach(d=>{
    const ind = computeIndicators(byDate[d]);
    df.push((ind.DF*100).toFixed(1));
    uf.push((ind.UF*100).toFixed(1));
    mtbf.push(ind.MTBF.toFixed(1));
    nic.push(ind.NIC);
    hmc.push(ind.HMC.toFixed(1));
    prevH.push((ind.MPS+ind.MPNS).toFixed(1));
  });
  const labels = dates.map(ddmm);

  // Linha suave com preenchimento em degradê amarelo para o indicador
  // secundário -- mesmo espírito visual da referência (barra + curva), na
  // paleta Sotreq. A barra principal usa barGradientStatic (global).
  const lineFill = (ctxWrap) => {
    const {ctx, chartArea} = ctxWrap.chart;
    if(!chartArea) return 'rgba(255,199,44,.3)';
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, 'rgba(255,199,44,.35)');
    g.addColorStop(1, 'rgba(255,199,44,0)');
    return g;
  };
  const pctBar = (label, data, yAxisID) => ({
    type:'bar', label, data, backgroundColor:barGradientStatic, borderRadius:4, maxBarThickness:16, order:1, yAxisID,
    datalabels:{
      display:true, anchor:'end', align:'top', offset:2,
      color:'#fff', backgroundColor:CAT_BLACK, borderRadius:4, padding:{top:2,bottom:2,left:4,right:4},
      font:{size:10,weight:700}, formatter:v=>v+'%'
    }
  });
  const pctSmoothLine = (label, data, yAxisID) => ({
    type:'line', label, data, borderColor:CAT_YELLOW, backgroundColor:lineFill, fill:true,
    tension:.4, pointRadius:3, pointBackgroundColor:CAT_YELLOW, pointBorderColor:CAT_BLACK, borderWidth:3, order:2, yAxisID,
    datalabels:{
      display:true, anchor:'start', align:'bottom', offset:4,
      color:'#fff', backgroundColor:'#8a6d00', borderRadius:4, padding:{top:2,bottom:2,left:4,right:4},
      font:{size:10,weight:700}, formatter:v=>v+'%'
    }
  });
  const metaLine = (label, metaVal) => ({
    type:'line', label, data:labels.map(()=>metaVal), borderColor:'#151515', borderWidth:1.5, borderDash:[6,4],
    pointRadius:0, fill:false, tension:0, order:1
  });
  // Verde nos dias em que a meta foi cumprida, vermelho nos que não foi.
  const barColorsByMeta = (data, metaVal, invert) => data.map(v => {
    const val = parseFloat(v);
    const ok = invert ? val <= metaVal : val >= metaVal;
    return ok ? '#1e8e5a' : '#c62d3c';
  });
  const pctBarMeta = (label, data, metaVal, invert) => ({
    type:'bar', label, data, backgroundColor:barColorsByMeta(data, metaVal, invert), borderRadius:4, maxBarThickness:16, order:2
  });
  const countScales = { y:{ beginAtZero:true, ticks:{precision:0,font:{size:10}}, grid:{color:'#eef0f2'} }, x:{ grid:{display:false}, ticks:{maxRotation:60,minRotation:45,autoSkip:true,font:{size:10}} } };
  const pctScales = { y:{ min:0, max:100, ticks:{callback:v=>v+'%',font:{size:10}}, grid:{color:'#eef0f2'} }, x:{ grid:{display:false}, ticks:{maxRotation:60,minRotation:45,autoSkip:true,font:{size:10}} } };
  const baseOptions = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    interaction:{mode:'index',intersect:false}
  };

  // Conta quantos dias do período o indicador ficou dentro/fora da meta.
  const daysWithinMeta = (data, metaVal, invert) => {
    let good = 0, bad = 0;
    data.forEach(v => {
      const val = parseFloat(v);
      const ok = invert ? val <= metaVal : val >= metaVal;
      if(ok) good++; else bad++;
    });
    return {good, bad};
  };
  // Monta o bloco com cabeçalho ("dentro"/"fora" da meta) e uma linha de cards por indicador.
  const metaDaysBlock = (pairs) => `
    <div class="meta-days-header"><div>Dias dentro da meta</div><div>Dias fora da meta</div></div>
    ${pairs.map(p => `<div class="meta-days-row">
      <div class="days-card good"><div class="days-value">${p.good}</div><div class="days-label">${p.label}</div></div>
      <div class="days-card bad"><div class="days-value">${p.bad}</div><div class="days-label">${p.label}</div></div>
    </div>`).join('')}
  `;

  if(chTrendDfUf) chTrendDfUf.destroy();
  chTrendDfUf = new Chart(document.getElementById('chartTrendDfUf'), {
    type:'bar',
    data:{ labels, datasets:[ pctBar('DF %', df), pctSmoothLine('UF %', uf) ] },
    options:{ ...baseOptions, scales:pctScales }
  });
  const dfDays = daysWithinMeta(df, 89), ufDays = daysWithinMeta(uf, 78);
  document.getElementById('trendDaysDfUf').innerHTML = metaDaysBlock([
    {label:'DF', ...dfDays}, {label:'UF', ...ufDays},
  ]);

  if(chTrendMtbfMttr) chTrendMtbfMttr.destroy();
  chTrendMtbfMttr = new Chart(document.getElementById('chartTrendMtbfMttr'), {
    type:'bar',
    data:{ labels, datasets:[ pctBarMeta('Corretivas/dia', nic, 5.4, true), metaLine('Meta (5,4/dia)', 5.4) ] },
    options:{ ...baseOptions, scales:countScales },
    plugins:[barValueLabelsPlugin]
  });
  const mtbfDays = daysWithinMeta(mtbf, 80);
  const nicDays = daysWithinMeta(nic, 5.4, true);
  document.getElementById('trendDaysMtbfMttr').innerHTML = metaDaysBlock([
    {label:'MTBF', ...mtbfDays}, {label:'Corretivas', ...nicDays},
  ]);
  const totalInd = computeIndicators(rows);
  document.getElementById('mtbfAccum').innerHTML = `
    <div class="mtbf-accum-value">${fmtH(totalInd.MTBF)}h</div>
    ${mtbfBarHTML(totalInd.MTBF, 80)}
    <div class="mtbf-accum-label">MTBF acumulado no período <strong>(meta: 80h)</strong></div>
  `;
  document.getElementById('corretivasAccum').innerHTML = `
    <div class="mtbf-accum-value">${totalInd.NIC}</div>
    <div class="mtbf-accum-label">Corretivas acumuladas no mês (meta: 162)</div>
  `;

  const hourScales = { y:{ beginAtZero:true, ticks:{callback:v=>v+'h',font:{size:10}}, grid:{color:'#eef0f2'} }, x:{ grid:{display:false}, ticks:{maxRotation:60,minRotation:45,autoSkip:true,font:{size:10}} } };

  if(chDowntimeCorretiva) chDowntimeCorretiva.destroy();
  chDowntimeCorretiva = new Chart(document.getElementById('chartDowntimeCorretiva'), {
    type:'bar',
    data:{ labels, datasets:[ pctBarMeta('Corretiva (h)', hmc, 30, true), metaLine('Meta (30h/dia)', 30) ] },
    options:{ ...baseOptions, scales:hourScales },
    plugins:[barValueLabelsPlugin]
  });

  if(chDowntimePreventiva) chDowntimePreventiva.destroy();
  chDowntimePreventiva = new Chart(document.getElementById('chartDowntimePreventiva'), {
    type:'bar',
    data:{ labels, datasets:[ pctBarMeta('Preventiva (h)', prevH, 29, true), metaLine('Meta (29h/dia)', 29) ] },
    options:{ ...baseOptions, scales:hourScales },
    plugins:[barValueLabelsPlugin]
  });
  const hmcDays = daysWithinMeta(hmc, 30, true), prevDays = daysWithinMeta(prevH, 29, true);
  document.getElementById('trendDaysDowntime').innerHTML = metaDaysBlock([
    {label:'Corretiva', ...hmcDays}, {label:'Preventiva', ...prevDays},
  ]);
}

function renderComposicao(ind){
  // Regra CAT 80/20: Preventiva (MPS + MPNS) x Corretiva (HMC). O traço
  // vertical na faixa marca onde ficariam os 80% de meta.
  const prevH = ind.MPS + ind.MPNS;
  const corrH = ind.HMC;
  const cats = [
    {label:'Preventiva (MPS + MPNS)', val:prevH, color:'#3a3a3c'},
    {label:'Corretiva (HMC)', val:corrH, color:'#FFC72C'},
  ];
  const total = cats.reduce((s,c)=>s+c.val, 0) || 1;
  const prevPct = prevH / total * 100;
  const strip = document.getElementById('composicaoStrip');
  const legend = document.getElementById('composicaoLegend');
  strip.innerHTML = cats.filter(c=>c.val>0).map(c=>{
    const pct = c.val / total * 100;
    const textColor = c.color === '#FFC72C' ? '#151515' : '#fff';
    return `<div class="composicao-seg" style="flex:${pct};background:${c.color};color:${textColor}">${pct>=8 ? fmtH(c.val)+'h · '+pct.toFixed(0)+'%' : ''}</div>`;
  }).join('');
  legend.innerHTML = cats.map(c=>`<span><i class="legend-dot" style="background:${c.color}"></i>${c.label}: ${fmtH(c.val)}h</span>`).join('')
    + `<span><i class="legend-dash"></i>Meta: 80% preventiva / 20% corretiva (atual: ${prevPct.toFixed(1)}% preventiva)</span>`;
}

/* Interpolates the DF% heat scale: red -> amber -> yellow -> green */
function heatColor(pct){
  const stops = [
    {p:0,   c:[198,45,60]},   // red
    {p:33,  c:[201,138,0]},   // amber
    {p:66,  c:[255,199,44]},  // yellow
    {p:100, c:[30,142,90]},   // green
  ];
  const v = Math.max(0, Math.min(100, pct));
  let a=stops[0], b=stops[stops.length-1];
  for(let i=0;i<stops.length-1;i++){
    if(v>=stops[i].p && v<=stops[i+1].p){ a=stops[i]; b=stops[i+1]; break; }
  }
  const range = (b.p-a.p) || 1;
  const t = (v-a.p)/range;
  const rgb = a.c.map((ch,i)=>Math.round(ch + (b.c[i]-ch)*t));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

let heatTooltipEl = null;
function renderHeatmapDF(rows){
  const byEq = {};
  rows.forEach(r=>{ (byEq[r.eq]=byEq[r.eq]||[]).push(r); });
  const entries = Object.keys(byEq).map(eq=>{
    const ind = computeIndicators(byEq[eq]);
    return {eq, df: ind.DF*100, ht: ind.HT};
  }).sort((a,b)=>b.df-a.df);

  const wrap = document.getElementById('heatmapDF');
  if(!entries.length){ wrap.innerHTML = '<div class="empty-state">Nenhum dado para os filtros selecionados.</div>'; return; }

  wrap.innerHTML = entries.map(e=>{
    const color = heatColor(e.df);
    return `<div class="heatmap-row">
      <div class="heatmap-label" title="${e.eq}">${e.eq}</div>
      <div class="heatmap-cell" style="background:${color}" data-eq="${e.eq}" data-df="${e.df.toFixed(1)}" data-ht="${e.ht.toFixed(1)}"></div>
      <div class="heatmap-value">${e.df.toFixed(1)}%</div>
    </div>`;
  }).join('');

  if(!heatTooltipEl){
    heatTooltipEl = document.createElement('div');
    heatTooltipEl.className = 'heatmap-tooltip';
    document.body.appendChild(heatTooltipEl);
  }
  wrap.querySelectorAll('.heatmap-cell').forEach(cell=>{
    cell.addEventListener('mousemove', ev=>{
      heatTooltipEl.textContent = `${cell.dataset.eq} — DF ${cell.dataset.df}% · HT ${cell.dataset.ht}h`;
      heatTooltipEl.style.left = (ev.clientX+14)+'px';
      heatTooltipEl.style.top = (ev.clientY+14)+'px';
      heatTooltipEl.classList.add('show');
    });
    cell.addEventListener('mouseleave', ()=> heatTooltipEl.classList.remove('show'));
  });
}

function renderEmptyState(){
  const msg = '<div class="empty-state">Selecione um período, modelo ou equipamento e clique em "Aplicar" para carregar os dados.</div>';
  document.getElementById('periodoRef').textContent = '–';
  document.getElementById('kpiGrid').innerHTML = msg;
  document.getElementById('composicaoStrip').innerHTML = '';
  document.getElementById('composicaoLegend').innerHTML = '';
  [chTrendDfUf, chTrendMtbfMttr, chDowntimeCorretiva, chDowntimePreventiva, chPmBacklogsGerados, chPmBacklogsExec, chPmHoras].forEach(c => c && c.destroy());
  chTrendDfUf = chTrendMtbfMttr = chDowntimeCorretiva = chDowntimePreventiva = chPmBacklogsGerados = chPmBacklogsExec = chPmHoras = null;
  ['trendDaysDfUf','trendDaysMtbfMttr','trendDaysDowntime','mtbfAccum','corretivasAccum'].forEach(id => document.getElementById(id).innerHTML = '');
  ['pmStatusAtraso','pmStatusNoPrazo','pmStatusAtrasoConcluida'].forEach(id => document.getElementById(id).textContent = '–');
  document.getElementById('heatmapDF').innerHTML = msg;
  document.querySelector('.heatmap-scale').style.display = 'none';
  document.getElementById('criticalEquipmentList').innerHTML = msg;
}

function renderAll(){
  if(!filtersApplied){ renderEmptyState(); return; }
  document.querySelector('.heatmap-scale').style.display = '';
  const rows = getFiltered();
  const ind = computeIndicators(rows);
  updatePeriodoRef(rows);
  renderKPIs(ind);
  renderTrend(rows);
  renderComposicao(ind);
  renderPMCharts();
  renderHeatmapDF(rows);
  renderFailureAnalysis();
}

/* ================= EVENTS ================= */
const FILTER_IDS = ['fDataIni','fDataFim','fModelo']; // fEquip handled separately (multiselect)

function updateClearButtons(){
  FILTER_IDS.forEach(id=>{
    const el = document.getElementById(id);
    const btn = document.querySelector(`.field-clear[data-target="${id}"]`);
    if(btn) btn.classList.toggle('show', !!el.value);
  });
  const equipBtn = document.querySelector('.field-clear[data-target="fEquip"]');
  if(equipBtn) equipBtn.classList.toggle('show', selectedEquip.size>0);
}

document.getElementById('btnApply').addEventListener('click', ()=>{ filtersApplied = true; renderAll(); });
document.getElementById('btnReset').addEventListener('click', ()=>{
  FILTER_IDS.forEach(id=>document.getElementById(id).value='');
  msOptions.querySelectorAll('input').forEach(cb=>cb.checked=false);
  selectedEquip.clear();
  updateEquipLabel();
  updateClearButtons();
  filtersApplied = false;
  renderAll();
});

// Special handler for Model filter to update equipment options
document.getElementById('fModelo').addEventListener('change', ()=>{
  updateEquipmentOptions();
  updateClearButtons();
  filtersApplied = true;
  renderAll();
});

// Handle date filters
['fDataIni','fDataFim'].forEach(id=>{
  document.getElementById(id).addEventListener('change', ()=>{ updateClearButtons(); filtersApplied = true; renderAll(); });
  document.getElementById(id).addEventListener('input', updateClearButtons);
});
document.querySelectorAll('.field-clear').forEach(btn=>{
  btn.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    const id = btn.dataset.target;
    if(id==='fEquip'){
      msOptions.querySelectorAll('input').forEach(cb=>cb.checked=false);
      selectedEquip.clear();
      updateEquipLabel();
    } else {
      document.getElementById(id).value = '';
    }
    updateClearButtons();
    renderAll();
  });
});

document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('data-geracao').textContent = new Date().toLocaleDateString('pt-BR');
updateEquipLabel();
updateClearButtons();

/* ================= MAINTENANCE HISTORY ================= */


function renderMaintenanceHistory(){
  const rows = getFiltered();
  const equipamentos = [...new Set(rows.map(r=>r.eq))];
  const container = document.getElementById('maintenanceContainer');
  
  // Filter maintenance data by selected equipment and date range
  let filteredMaint = FULL_MAINTENANCE_DATA;
  
  // Filter by equipment
  if(selectedEquip.size > 0) {
    filteredMaint = filteredMaint.filter(m => selectedEquip.has(m.equipment));
  } else if(equipamentos.length > 0) {
    filteredMaint = filteredMaint.filter(m => equipamentos.includes(m.equipment));
  }
  
  // Sort by date descending (most recent first)
  filteredMaint.sort((a,b) => {
    const dateA = new Date(a.startTime.split(' ')[0].split('/').reverse().join('-'));
    const dateB = new Date(b.startTime.split(' ')[0].split('/').reverse().join('-'));
    return dateB - dateA;
  });
  
  if(filteredMaint.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum registro de manutenção para o período selecionado</div>';
    return;
  }
  
  // Show only last 50 records for performance
  const displayData = filteredMaint.slice(0, 50);
  container.innerHTML = displayData.map(m => `
    <div class="maintenance-item ${m.type}">
      <div class="maint-equipment">${m.equipment}</div>
      <div>
        <div class="maint-desc">${m.description}</div>
        <div class="maint-time">${m.startTime} até ${m.endTime}</div>
      </div>
      <div style="text-align:center;">
        <div class="maint-type ${m.type}">${m.type === 'preventiva' ? 'Preventiva' : 'Corretiva'}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px;"><strong>${m.duration}h</strong></div>
      </div>
    </div>
  `).join('');
  
  // Add info about total records
  if(filteredMaint.length > 50) {
    const info = document.createElement('div');
    info.style.cssText = 'text-align:center;padding:10px;font-size:11px;color:var(--gray-500);margin-top:8px;';
    info.innerHTML = `Mostrando 50 de ${filteredMaint.length} registros`;
    container.appendChild(info);
  }
}

// Update maintenance history when rendering all
const origRenderAll = renderAll;
renderAll = function(){
  origRenderAll();
};

/* ================= FAILURE MODES & CRITICAL EQUIPMENT ================= */

// Get maintenance data filtered by current filters
function getFilteredMaintenance(){
  const fdi = document.getElementById('fDataIni').value;
  const fdf = document.getElementById('fDataFim').value;
  const fm = document.getElementById('fModelo').value;
  
  return FULL_MAINTENANCE_DATA.filter(m => {
    // Parse date from DD/MM/YYYY HH:MM to YYYY-MM-DD
    const mDate = m.startTime ? m.startTime.split(' ')[0].split('/').reverse().join('-') : '';
    const dateMatch = (!fdi || mDate >= fdi) && (!fdf || mDate <= fdf);
    
    // Check if equipment is in selected list
    const equipMatch = selectedEquip.size === 0 || selectedEquip.has(m.equipment);
    
    // Get model for this equipment from EQUIP_BY_MODEL
    let modelMatch = true;
    if(fm){
      // Find which model this equipment belongs to
      let equipModel = null;
      for(const [model, equipArray] of Object.entries(EQUIP_BY_MODEL)){
        if(equipArray.includes(m.equipment)){
          equipModel = model;
          break;
        }
      }
      modelMatch = equipModel === fm;
    }
    
    return dateMatch && equipMatch && modelMatch;
  });
}

function renderFailureAnalysis(){
  const criticalEquipmentList = document.getElementById('criticalEquipmentList');
  if(criticalEquipmentList) criticalEquipmentList.innerHTML = '';

  const maintData = getFilteredMaintenance();
  const rows = getFiltered();
  if(!rows.length) return;
  
  const byEq = {};
  rows.forEach(r => {
    if(!byEq[r.eq]) byEq[r.eq] = {eq: r.eq, md: r.md, rows: []};
    byEq[r.eq].rows.push(r);
  });
  
  const criticalEquip = Object.values(byEq)
    .map(group => {
      const ind = computeIndicators(group.rows);
      const totalHM = group.rows.reduce((s, r) => s + (r.hm || 0), 0);
      const totalHMC = group.rows.reduce((s, r) => s + (r.hmc || 0), 0);
      const totalEvents = totalHM + totalHMC;
      
      // Count events from FILTERED maintenance data for this equipment
      const equipMaint = maintData.filter(m => m.equipment === group.eq);
      const maintCount = equipMaint.length;
      
      return {
        eq: group.eq,
        md: group.md,
        downtime: totalHM,
        events: maintCount > 0 ? maintCount : totalEvents,
        df: (ind.DF * 100).toFixed(1),
      };
    })
    .sort((a, b) => b.downtime - a.downtime)
    .slice(0, 5);
  
  renderCriticalEquipment(criticalEquip, maintData);
}

/* Barra unica pro MTBF acumulado (mesmo estilo da faixa de Composicao das
   Horas: preenchimento proporcional + marcador de meta) -- substituiu o
   velocimetro em SVG, que "esticava" demais quando o card ficava largo. */
function mtbfBarHTML(value, target){
  const maxScale = target > 0 ? Math.max(target * 1.25, value) : (value || 1);
  const pct = Math.max(0, Math.min(100, (value / maxScale) * 100));
  const targetPct = Math.max(0, Math.min(100, (target / maxScale) * 100));
  const dentroDaMeta = value >= target;   // MTBF: quanto mais, melhor
  const cor = dentroDaMeta ? '#1e8e5a' : '#c62d3c';
  return `<div class="mtbf-bar-wrap">
    <div class="mtbf-bar-track"><div class="mtbf-bar-fill" style="width:${pct.toFixed(1)}%;background:${cor}"></div></div>
    <div class="composicao-target" style="left:${targetPct.toFixed(1)}%"><span>Meta ${fmtH(target)}h</span></div>
  </div>`;
}

function gaugeSVG(pctValue, color){
  const r = 46, cx = 60, cy = 58;
  const arcLen = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pctValue || 0));
  const offset = arcLen * (1 - clamped / 100);
  return `<svg viewBox="0 0 120 66" class="gauge-svg">
    <path d="M14,${cy} A${r},${r} 0 0 1 106,${cy}" fill="none" stroke="#dcdde0" stroke-width="10" stroke-linecap="round"/>
    <path d="M14,${cy} A${r},${r} 0 0 1 106,${cy}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${arcLen.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
  </svg>`;
}

function renderCriticalEquipment(equipList, maintData){
  const container = document.getElementById('criticalEquipmentList');

  container.innerHTML = equipList.map((equip, idx) => {
    // Find offenders (failure modes) for this equipment from FILTERED maintenance data
    const equipMaint = maintData.filter(m => m.equipment === equip.eq);
    const offenders = extractFailureModesForEquip(equipMaint);

    const offendersList = Object.entries(offenders)
      .map(([name, data]) => ({name, ...data}))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Top 3 setores (sistemas) por horas de manutenção, cada um com seu proprio Pareto de conjuntos
    const setores = groupBySetor(equipMaint).slice(0, 3);

    // Hotsheet de componentes instalados, piores (% vida útil) primeiro
    const components = getComponentsForEquip(equip.eq)
      .filter(c => COMPONENTS_WHITELIST.has(c.componente))
      .sort((a, b) => (b.vidaUtilPct || 0) - (a.vidaUtilPct || 0));

    return `
      <div class="critical-item">
        <div class="critical-header">
          <span class="critical-rank">${idx + 1}</span>
          <span class="critical-name">${equip.eq}</span>
          <span class="critical-model">${equip.md}</span>
        </div>

        <div class="critical-top">
          <!-- Tempo Parado, Eventos e DF -->
          <div class="critical-metrics">
            <div class="critical-metric">
              <div class="critical-metric-value">${equip.downtime.toFixed(1)}h</div>
              <div class="critical-metric-label">Tempo Parado</div>
            </div>
            <div class="critical-metric">
              <div class="critical-metric-value">${Math.round(equip.events)}</div>
              <div class="critical-metric-label">Eventos</div>
            </div>
            <div class="critical-metric gauge-metric">
              ${gaugeSVG(parseFloat(equip.df), barColor(pillClass('DF', parseFloat(equip.df) / 100)))}
              <div class="gauge-value">${equip.df}%</div>
              <div class="critical-metric-label">DF</div>
            </div>
          </div>

          <div class="critical-divider"></div>

          <!-- Principais Ofensores -->
          <div class="critical-offenders">
            <div class="critical-offenders-title">Principais Ofensores</div>
            <div class="critical-offenders-grid">
              ${offendersList.length > 0 ? `
                ${offendersList.map(off => `
                  <div class="offender-item ${off.riskLevel === 'alto' ? 'critical' : 'warning'}">
                    <span class="offender-name">${off.name}</span>
                    <div class="offender-stats">
                      <div class="offender-stat">
                        <span class="offender-stat-value">${off.count}</span>
                        <span class="offender-stat-label">ocorrências</span>
                      </div>
                      <div class="offender-stat">
                        <span class="offender-stat-value">${off.hours.toFixed(1)}h</span>
                        <span class="offender-stat-label">downtime</span>
                      </div>
                    </div>
                  </div>
                `).join('')}
              ` : `<div class="offender-item empty"><span class="offender-name">Sem dados de manutenção</span></div>`}
            </div>
          </div>
        </div>

        <!-- DF/UF diário: acima do Pareto, largura total -->
        <div class="critical-daily-section">
          <div class="critical-daily-title">Performance Diária (DF/UF)</div>
          <div class="critical-daily-chart-wrap">
            <canvas id="dailyChart_${idx}"></canvas>
          </div>
        </div>

        <!-- Pareto por Setor / Conjunto -->
        <div class="setor-section">
          ${setores.length > 0 ? `
            <div class="setor-grid">
              ${setores.map((s, sIdx) => `
                <div class="setor-block">
                  <div class="setor-banner">${s.setor} — ${s.hours.toFixed(1)}h | ${s.paradas} paradas</div>
                  <div class="setor-chart-wrap">
                    <canvas id="setorChart_${idx}_${sIdx}"></canvas>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="setor-empty">Sem dados de manutenção por setor</div>`}
        </div>

        <!-- Recomendação Técnica -->
        ${setores.length > 0 ? `
          <div class="recommendation-section">
            <div class="recommendation-title">Histórico de Ocorrências</div>
            <div class="recommendation-grid">
              ${setores.map(s => {
                const topConjunto = groupByConjunto(s.records)[0];
                return `
                  <div class="recommendation-card">
                    <div class="recommendation-setor">${s.setor}</div>
                    <div class="recommendation-text">${getRecommendation(s.setor, topConjunto, s.records)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Hotsheet de Componentes -->
        <div class="components-section">
          <div class="components-title">Hotsheet de Componentes</div>
          ${components.length > 0 ? `
            <div class="components-grid">
              ${COMPONENTS_ORDER.map(name => {
                const items = components
                  .filter(c => c.componente === name)
                  .sort((a, b) => (a.posicao || '').localeCompare(b.posicao || ''));
                return `
                  <div class="component-card">
                    <div class="component-card-name" title="${name}">${name}</div>
                    <div class="component-positions">
                      ${items.length > 0 ? items.map(c => {
                        const pct = c.vidaUtilPct;
                        const lifeCls = pct == null ? '' : pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'good';
                        const pctLabel = pct == null ? '—' : `${pct.toFixed(0)}%`;
                        const posLabel = c.posicao && c.posicao !== 'UN' ? c.posicao : '—';
                        const barWidth = pct == null ? 0 : Math.max(0, Math.min(100, pct));
                        return `<div class="component-item" title="${c.serie || ''} · Venc.: ${c.vencimento || '—'}">
                          <div class="component-item-row">
                            <span class="component-item-pos">${posLabel}</span>
                            <span class="component-item-pct ${lifeCls}">${pctLabel}</span>
                          </div>
                          <div class="component-bar-track"><div class="component-bar-fill ${lifeCls}" style="width:${barWidth}%"></div></div>
                        </div>`;
                      }).join('') : `<div class="component-item-empty">Sem dado cadastrado</div>`}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `<div class="setor-empty">Sem dados de componentes cadastrados</div>`}
        </div>
      </div>
    `;
  }).join('');

  renderSetorCharts(equipList, maintData);
  renderDailyCharts(equipList);
}

// Alguns equipamentos aparecem com sufixo diferente entre bases (ex.: RAW
// tem "CA1014KS100_R", já o cadastro de componentes tem "CA1014KS100") --
// casa por código exato primeiro e cai para o código-base (sem sufixo) depois.
function baseEqCode(eq){ return (eq || '').split('_')[0]; }

function getComponentsForEquip(eq){
  const exact = COMPONENTS_DATA.filter(c => c.equipment === eq);
  if(exact.length) return exact;
  const base = baseEqCode(eq);
  return COMPONENTS_DATA.filter(c => baseEqCode(c.equipment) === base);
}

// Hotsheet: só os componentes críticos definidos pelo usuário. "Motor Diesel"
// é o nome usado nesta base para o motor de combustão (não há um componente
// chamado literalmente "Motor de Combustão" no cadastro).
const COMPONENTS_WHITELIST = new Set([
  'Bomba Alta Pressão Combustível',
  'Cilindro de Direção',
  'Cilindro de Elevação',
  'Comando Final',
  'Cruzeta PTO',
  'King Pin',
  'Motor Diesel',
  'Nose Cone',
  'Suspensão',
]);
// Mesma ordem da whitelist -- garante que o grid de cards saia sempre igual
// (mesmas 9 posições) em todo equipamento, com ou sem dado.
const COMPONENTS_ORDER = [...COMPONENTS_WHITELIST];

/* Linha diária de DF/UF por equipamento, respeitando o período filtrado
   (fDataIni/fDataFim) mas travado no equipamento do card. */
function getEquipDailyRows(eq){
  const fdi = document.getElementById('fDataIni').value;
  const fdf = document.getElementById('fDataFim').value;
  return RAW.filter(r => r.eq === eq && (!fdi || r.d >= fdi) && (!fdf || r.d <= fdf));
}

let dailyCharts = [];
function renderDailyCharts(equipList){
  dailyCharts.forEach(c => c && c.destroy());
  dailyCharts = [];

  equipList.forEach((equip, idx) => {
    const canvas = document.getElementById(`dailyChart_${idx}`);
    if(!canvas) return;

    const rows = getEquipDailyRows(equip.eq);
    const byDate = {};
    rows.forEach(r => { (byDate[r.d] = byDate[r.d] || []).push(r); });
    const dates = Object.keys(byDate).sort();

    const df = [], uf = [];
    dates.forEach(d => {
      const ind = computeIndicators(byDate[d]);
      df.push((ind.DF * 100).toFixed(1));
      uf.push((ind.UF * 100).toFixed(1));
    });

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: dates.map(ddmm),
        datasets: [
          {label: 'DF %', data: df, borderColor: '#8a8a8d', backgroundColor: '#8a8a8d', tension: .3, pointRadius: 1.5, borderWidth: 2},
          {label: 'UF %', data: uf, borderColor: CAT_YELLOW, backgroundColor: CAT_YELLOW, tension: .3, pointRadius: 1.5, borderWidth: 2},
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { min: 0, max: 100, ticks: { font: { size: 10 }, callback: v => v + '%' }, grid: { color: '#eee' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 60, minRotation: 60, autoSkip: true, maxTicksLimit: 31 } }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
    dailyCharts.push(chart);
  });

  // Com varias dezenas de canvases criados de uma vez (um por caminhao),
  // o primeiro auto-resize do Chart.js as vezes mede o card antes do
  // layout "assentar" e o grafico nasce pequeno, sem preencher o card
  // branco. Forcar um resize explicito no proximo frame corrige.
  requestAnimationFrame(() => dailyCharts.forEach(c => c && c.resize()));
}

/* Custom Chart.js plugin: draws the value above each bar and the
   cumulative % above each line point, matching a classic Pareto chart. */
const setorLabelsPlugin = {
  id: 'setorLabels',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    chart.data.datasets.forEach((ds, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if(meta.hidden) return;
      ctx.save();
      ctx.font = "700 12px -apple-system,Segoe UI,Arial,sans-serif";
      ctx.textAlign = 'center';
      if(ds.type === 'bar'){
        ctx.fillStyle = '#333';
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if(v) ctx.fillText(v, bar.x, bar.y - 5);
        });
      } else if(ds.type === 'line'){
        ctx.fillStyle = '#a5281b';
        meta.data.forEach((pt, i) => ctx.fillText(ds.data[i] + '%', pt.x, pt.y - 8));
      }
      ctx.restore();
    });
  }
};

let setorCharts = [];
function renderSetorCharts(equipList, maintData){
  setorCharts.forEach(c => c && c.destroy());
  setorCharts = [];

  equipList.forEach((equip, idx) => {
    const equipMaint = maintData.filter(m => m.equipment === equip.eq);
    const setores = groupBySetor(equipMaint).slice(0, 3);

    setores.forEach((s, sIdx) => {
      const canvas = document.getElementById(`setorChart_${idx}_${sIdx}`);
      if(!canvas) return;

      const conjuntos = groupByConjunto(s.records);

      const chart = new Chart(canvas.getContext('2d'), {
        data: {
          labels: conjuntos.map(c => c.conjunto),
          datasets: [
            {
              type: 'bar', label: 'Horas HMC', data: conjuntos.map(c => +c.hours.toFixed(1)),
              backgroundColor: '#232323', borderRadius: 2, maxBarThickness: 34, order: 3, yAxisID: 'y'
            },
            {
              type: 'bar', label: 'Paradas', data: conjuntos.map(c => c.paradas),
              backgroundColor: '#FFC72C', borderRadius: 2, maxBarThickness: 34, order: 2, yAxisID: 'y'
            },
            {
              type: 'line', label: '% Acum.', data: conjuntos.map(c => c.cumPct),
              borderColor: '#C0392B', backgroundColor: '#C0392B', borderWidth: 2,
              pointRadius: 3, pointBackgroundColor: '#C0392B', pointBorderColor: '#fff',
              pointBorderWidth: 1, tension: 0, order: 1, yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 16 } },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            y: { beginAtZero: true, position: 'left', grid: { color: '#eee' }, ticks: { font: { size: 10 } } },
            y1: {
              beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false },
              ticks: { font: { size: 10 }, callback: v => v + '%' }
            },
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 } }
          }
        },
        plugins: [setorLabelsPlugin]
      });
      setorCharts.push(chart);
    });
  });

  // Mesmo problema do grafico diario: com dezenas de canvases criados de
  // uma vez, o primeiro auto-resize do Chart.js as vezes mede o card
  // antes do layout assentar e o grafico nasce menor que o card branco.
  requestAnimationFrame(() => setorCharts.forEach(c => c && c.resize()));
}

function extractFailureModesForEquip(maintData){
  const modes = {};
  
  maintData.forEach(m => {
    const desc = m.description.toLowerCase();
    let mode = 'Manutenção Geral';
    
    if(desc.includes('mps')) mode = 'Preventiva Sistemática';
    else if(desc.includes('mpns')) mode = 'Preventiva Não-Sistemática';
    else if(desc.includes('hmc') || desc.includes('corretiva')) mode = 'Corretiva';
    
    if(!modes[mode]) modes[mode] = {count: 0, hours: 0, riskLevel: 'medio'};
    modes[mode].count++;
    modes[mode].hours += m.duration || 0;
    
    // Risk level: Corrective = alto, Preventive = baixo
    if(desc.includes('corretiva') || desc.includes('hmc')) modes[mode].riskLevel = 'alto';
    else modes[mode].riskLevel = 'baixo';
  });
  
  return modes;
}

// Setores genéricos (não são um sistema específico do equipamento) -- ficam
// de fora do agrupamento por Setor/Conjunto usado nos gráficos de Pareto.
const SETOR_EXCLUDE = new Set(['PREVENTIVA', 'INSPEÇÃO', 'INSPECAO', 'DESPACHO', 'ACIDENTE', 'ACESSORIO', 'LUBRIFICACAO', '']);

// Agrupa a manutenção de um equipamento por Setor (sistema: Elétrico, Motor
// de Combustão, Locomoção...), somando horas e contando paradas.
function groupBySetor(equipMaint){
  const bySetor = {};
  equipMaint.forEach(m => {
    if(m.type !== 'corretiva') return; // Pareto considera só paradas corretivas (HMC)
    const setor = (m.classification || '').trim().toUpperCase();
    if(!setor || SETOR_EXCLUDE.has(setor)) return;
    if(!bySetor[setor]) bySetor[setor] = {setor, hours: 0, paradas: 0, records: []};
    bySetor[setor].hours += m.duration || 0;
    bySetor[setor].paradas++;
    bySetor[setor].records.push(m);
  });
  return Object.values(bySetor).sort((a, b) => b.hours - a.hours);
}

// Dentro de um Setor, agrupa por Conjunto (subcomponente) para o Pareto,
// com % acumulado sobre as horas.
function groupByConjunto(records){
  const byConj = {};
  records.forEach(m => {
    const conj = (m.conjunto || '').trim().toUpperCase() || 'NÃO ESPECIFICADO';
    if(!byConj[conj]) byConj[conj] = {conjunto: conj, hours: 0, paradas: 0};
    byConj[conj].hours += m.duration || 0;
    byConj[conj].paradas++;
  });
  const list = Object.values(byConj).sort((a, b) => b.hours - a.hours).slice(0, 5);
  const totalHours = list.reduce((s, c) => s + c.hours, 0);
  let cum = 0;
  return list.map(c => {
    cum += c.hours;
    return {...c, cumPct: totalHours > 0 ? +(cum / totalHours * 100).toFixed(1) : 0};
  });
}

/* Base de conhecimento técnica -- recomendações de manutenção pesada CAT
   793F/794 AC, montadas em 3 camadas: (1) padrão específico observado no
   histórico deste equipamento (Falha/Problema/Solução mais recorrentes no
   Conjunto), (2) referência ao Manual de Operação e Manutenção CAT 794 AC
   (SPBU9099-12) com o item oficial e o intervalo de manutenção preventiva,
   e (3) leitura de um analista de suporte técnico sênior sobre o que essa
   combinação sugere. */

// (1) Padrão específico do histórico: falha/problema/solução mais frequentes
// entre os registros do Conjunto dominante deste Setor, para ESTE equipamento.
function mostCommon(records, field){
  const counts = {};
  records.forEach(r => {
    const v = (r[field] || '').trim();
    if(!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? {value: entries[0][0], count: entries[0][1]} : null;
}

function getRecommendation(setor, topConjuntoObj, allSetorRecords){
  const conjunto = topConjuntoObj ? topConjuntoObj.conjunto : null;
  const conjuntoLabel = conjunto && conjunto !== 'NÃO ESPECIFICADO' ? conjunto : 'itens não especificados';
  const conjuntoRecords = conjunto ? allSetorRecords.filter(r => (r.conjunto || '').trim().toUpperCase() === conjunto) : [];

  const falha = mostCommon(conjuntoRecords, 'falha');
  const problema = mostCommon(conjuntoRecords, 'problema');
  const solucao = mostCommon(conjuntoRecords, 'solucao');

  let historico = '';
  if(falha){
    historico = `Histórico deste equipamento aponta <strong>${falha.count}</strong> ocorrência(s) de "<strong>${falha.value}</strong>" em ${conjuntoLabel}`;
    if(problema) historico += ` (problema recorrente: "${problema.value}")`;
    if(solucao) historico += `, normalmente resolvida por "${solucao.value.toLowerCase()}"`;
    historico += '.';
  } else {
    historico = `Setor concentrado em <strong>${conjuntoLabel}</strong>, sem detalhamento de falha registrado nos apontamentos.`;
  }

  return historico;
}

// Render inicial (o painel antes só populava a tela em reação a algum
// filtro/clique do usuário -- nada aparecia sozinho ao abrir a página).
renderAll();

// ============================================================
// AJUSTE AUTOMATICO A FOLHA A4
// ------------------------------------------------------------
// Problema: o painel tem ~1500px de largura util e a A4 retrato tem
// ~733px. O Chrome nao reduz nada sozinho -- ele encaixa o que couber
// e corta o resto (as bordas "comidas"), e ainda por cima os canvases
// do Chart.js continuam com o tamanho em pixels que tinham na tela.
//
// Solucao em tres passos, executados antes de abrir a impressao:
//   1. a pagina assume uma LARGURA VIRTUAL fixa (larguraBase);
//   2. os graficos sao redesenhados nessa largura;
//   3. o conjunto inteiro e reduzido por `zoom` ate caber na area util
//      da folha -- e blocos altos demais levam uma reducao extra
//      individual para nao vazarem no rodape.
// Tudo e desfeito no afterprint.
// ============================================================
const FIT_A4 = {
  larguraBase   : 980,                 // largura virtual (px) do layout impresso
  orientacao    : 'retrato',           // 'retrato' | 'paisagem'
  // 12mm em cima/embaixo NAO e estetica: abaixo de ~10,2mm (0,4pol) o
  // Chrome simplesmente nao desenha o cabecalho/rodape dele (data, titulo,
  // caminho do arquivo, "1/4"). Era por isso que essa faixa sumia.
  margemMm      : { x: 10, y: 12 },    // margens da folha
  paginaMm      : { w: 210, h: 297 },  // A4
  zoomMinimo    : 0.45,                // limite de reducao (legibilidade)
  tetoDeExtravasamento : 1.15,         // ignora medidas acima de 115% da base
  ajustarAltura : true,                // reduz blocos mais altos que a folha
  blocosPagina  : '.pm-section, .critical-item, .corretivas-downtime-page', // blocos que ocupam 1 folha
  // Canvas do Chart.js e rasterizado na resolucao da TELA (devicePixelRatio
  // normal, 1x-1.5x). O PDF do Chrome imprime bem mais denso que isso, entao
  // o grafico e reamostrado/esticado -- e isso que borra. Redesenhando com um
  // devicePixelRatio mais alto so na hora de imprimir, o canvas nasce com
  // pixels de sobra e fica nitido no PDF.
  dprImpressao  : 3
};

const PX_POR_MM = 96 / 25.4;           // 1mm = 3,7795px de CSS a 96dpi
let _estiloPagina = null;

/* Todos os graficos vivos, sem depender das variaveis soltas de cada bloco. */
function graficosAtivos(){
  if(!window.Chart || !Chart.getChart) return [];
  return Array.from(document.querySelectorAll('canvas'))
              .map(c => Chart.getChart(c))
              .filter(Boolean);
}

/* Regra @page reescrita em runtime -- permite trocar orientacao/margem
   pelo objeto FIT_A4 sem mexer no CSS. */
function aplicarRegraDePagina(){
  if(!_estiloPagina){
    _estiloPagina = document.createElement('style');
    document.head.appendChild(_estiloPagina);
  }
  const paisagem = FIT_A4.orientacao === 'paisagem';
  _estiloPagina.textContent =
    '@page{size:A4 ' + (paisagem ? 'landscape' : 'portrait') + ';' +
    'margin:' + FIT_A4.margemMm.y + 'mm ' + FIT_A4.margemMm.x + 'mm;}';
}

/* Area util da folha, em px de CSS. */
function areaUtil(){
  const paisagem = FIT_A4.orientacao === 'paisagem';
  const w = paisagem ? FIT_A4.paginaMm.h : FIT_A4.paginaMm.w;
  const h = paisagem ? FIT_A4.paginaMm.w : FIT_A4.paginaMm.h;
  return {
    largura: (w - 2 * FIT_A4.margemMm.x) * PX_POR_MM,
    altura : (h - 2 * FIT_A4.margemMm.y) * PX_POR_MM
  };
}

/* chart.resize() SEM argumentos manda o Chart.js medir o container
   sozinho -- e essa auto-medicao sai ERRADA sempre que o elemento (ou um
   ancestral) tem CSS `zoom` diferente de 1 aplicado (e o `style.zoom`
   que _ajustarAlturaDosBlocos usa pra encolher bloco alto demais e
   exatamente isso): o Chart.js relata uma largura menor que a caixa
   branca de verdade, e sobra vazio do lado direito no PDF. Isso NAO e
   um problema de tempo/reflow -- foi testado esperar quantos frames
   fossem e o valor auto-medido continua errado.
   O jeito confiavel e nunca deixar o Chart.js adivinhar: medimos o
   proprio container (wrap.clientWidth, que o navegador SEMPRE relata
   certo, com ou sem zoom) e passamos o numero pronto pro resize(). */
function _resizeExplicito(){
  graficosAtivos().forEach(c => {
    const wrap = c.canvas.parentElement;
    if(!wrap) return;
    const cs = getComputedStyle(wrap);
    const w = wrap.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = wrap.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
    if(w > 0 && h > 0) c.resize(w, h);
  });
}

/* Passo 1 e 2: veste o layout de impressao e redesenha os graficos. */
function _montarLarguraVirtual(){
  const raiz = document.documentElement;
  raiz.style.setProperty('--fit-base', FIT_A4.larguraBase + 'px');
  raiz.classList.add('preparando-impressao');
  // forca o reflow antes de medir/redimensionar
  void document.body.offsetWidth;
  graficosAtivos().forEach(c => {
    if(c._animOriginal === undefined) c._animOriginal = c.options.animation;
    if(c._dprOriginal === undefined) c._dprOriginal = c.options.devicePixelRatio;
    c.options.animation = false;      // resize instantaneo, sem transicao
    c.options.devicePixelRatio = FIT_A4.dprImpressao;  // canvas nitido no PDF
  });
  _resizeExplicito();
}

/* Passo 3: quanto o conjunto precisa encolher para caber na largura.
   O calculo e deterministico (area util / largura base) -- e so isso que
   garante o painel ocupando a folha inteira, sem sobra de margem branca.
   A varredura de scrollWidth entra apenas como rede de seguranca, e com
   TETO: um canvas do Chart.js que ainda nao terminou de redimensionar
   reporta a largura antiga (de tela, ~1400px) e, sem esse limite, puxava
   o zoom para baixo -- era isso que deixava as bordas enormes. */
function _calcularZoom(){
  const util = areaUtil();
  const teto = FIT_A4.larguraBase * FIT_A4.tetoDeExtravasamento;
  let larguraReal = FIT_A4.larguraBase;

  document.querySelectorAll('.container, .container > *, .panel, .critical-item, .kpi-grid, .heatmap-wrap')
    .forEach(el => {
      const w = el.scrollWidth;
      if(w > larguraReal && w <= teto) larguraReal = w;   // acima do teto = medida suja, ignora
    });

  const zoom = util.largura / larguraReal;
  return Math.max(FIT_A4.zoomMinimo, Math.min(1, zoom));
}

/* Blocos que ocupam uma folha inteira (secao de PM, cada caminhao do
   Bandit) as vezes ficam mais altos que a area util -- ai o Chrome
   estoura para a folha seguinte e o rodape do bloco some. Cada um leva
   uma reducao propria, sem mexer no resto do documento. */
function _ajustarAlturaDosBlocos(zoomGlobal){
  if(!FIT_A4.ajustarAltura) return;
  const alturaDisponivel = areaUtil().altura / zoomGlobal;  // em px do layout virtual
  document.querySelectorAll(FIT_A4.blocosPagina).forEach(el => {
    el.style.zoom = '';
    const altura = el.getBoundingClientRect().height;
    if(altura > alturaDisponivel){
      const fator = Math.max(FIT_A4.zoomMinimo / zoomGlobal, alturaDisponivel / altura);
      el.style.zoom = (fator * 0.985).toFixed(4);   // 1,5% de folga
    }
  });
}

/* O Mapa de Calor mora no rodape da folha 1 (nao tem folha propria, ao
   contrario de FIT_A4.blocosPagina) -- entao "caber" pra ele significa
   caber no espaco que sobra ABAIXO do que ja esta na mesma folha, nao
   na folha inteira. Mede quanto espaco ja foi usado antes dele e, se o
   mapa nao couber no que resta, encolhe so a altura das linhas (via
   --heat-scale) ate caber -- assim nada vaza pra folha 2. */
function _ajustarMapaDeCalor(zoomGlobal){
  const heat = document.querySelector('.bento-heat');
  if(!heat) return;
  heat.style.removeProperty('--heat-scale');
  const wrap = heat.querySelector('.heatmap-wrap');
  if(!wrap) return;

  const alturaDisponivel = areaUtil().altura / zoomGlobal;       // orcamento de 1 folha, em px virtuais
  const topo = heat.getBoundingClientRect().top + window.scrollY; // altura ja usada antes dele, na folha 1
  // 20px de folga: a medicao acontece ANTES do zoom real de impressao
  // entrar em vigor, entao pequenas diferencas de arredondamento entre
  // essa pre-visualizacao e a paginacao real do Chrome sao esperadas --
  // sem essa folga, a legenda de cores (ultima coisa do painel) e o
  // que mais sofre, porque e o resto que vaza pra folha 2.
  const espacoRestante = alturaDisponivel - topo - 20;

  const alturaAtual = heat.getBoundingClientRect().height;
  if(alturaAtual <= espacoRestante) return;   // ja cabe inteiro, nada a fazer

  const alturaLinhas = wrap.getBoundingClientRect().height;
  const alturaFixa = alturaAtual - alturaLinhas;   // titulo + legenda de cores + padding do painel
  const linhasDisponivel = espacoRestante - alturaFixa;
  if(linhasDisponivel <= 0) return;   // nem o cabecalho cabe -- caso extremo, deixa como esta

  const escala = Math.max(0.6, Math.min(1, (linhasDisponivel / alturaLinhas) * 0.96));
  heat.style.setProperty('--heat-scale', escala.toFixed(3));
}

/* Passo 4: o canvas do Chart.js se redimensiona sozinho via
   ResizeObserver -- quando o `zoom` de impressao entra em vigor (DEPOIS
   que toda essa preparacao ja rodou, so quando a impressao real
   comeca), esse observer as vezes dispara de novo, mede a pagina num
   estado intermediario da paginacao fisica (~733px da folha, nao os
   980px virtuais) e encolhe o canvas errado -- sobra espaco em branco
   do lado do grafico. Uma imagem estatica (uma "foto" do canvas nesse
   exato instante) nao tem esse problema: como qualquer <img> comum,
   ela so acompanha o `zoom` do CSS de forma passiva, sem redimensionar
   sozinha por tras. */
function _congelarGraficosComoImagem(){
  document.querySelectorAll('.print-chart-snapshot').forEach(img => img.remove());
  graficosAtivos().forEach(c => {
    const canvas = c.canvas;
    // Se o canvas ainda estiver com largura/altura zero (o resize() do
    // passo anterior as vezes nao termina a tempo, sobretudo logo apos
    // "Aplicar" acabar de montar os graficos), toBase64Image() devolve
    // uma imagem vazia ("data:,") e a foto sai em branco. Forca mais um
    // resize antes de fotografar -- sem isso, o grafico congelado fica
    // vazio ate a pagina ser recarregada.
    if(canvas.width === 0 || canvas.height === 0){
      c.resize();
    }
    c.draw();   // resize()/update() so AGENDAM o redesenho pro proximo frame; draw() pinta na hora, sem isso a foto sai em branco
    if(canvas.width === 0 || canvas.height === 0) return;   // ainda sem tamanho: mantem o canvas ao vivo em vez de uma foto em branco
    const dataUrl = c.toBase64Image();
    if(!dataUrl || dataUrl === 'data:,') return;   // foto vazia: melhor deixar o canvas visivel do que sumir com o grafico
    const img = document.createElement('img');
    img.src = dataUrl;
    img.className = 'print-chart-snapshot';
    img.style.cssText = canvas.style.cssText;
    canvas.insertAdjacentElement('afterend', img);
    canvas.style.display = 'none';
  });
}

/* Desfaz o passo acima -- tira a "foto" e devolve o canvas ao vivo. */
function _descongelarGraficos(){
  document.querySelectorAll('.print-chart-snapshot').forEach(img => img.remove());
  graficosAtivos().forEach(c => { c.canvas.style.display = ''; });
}

/* window.print() disparado pelo botao TAMBEM aciona o listener de
   'beforeprint' la embaixo, e o listener de matchMedia('print') dispara
   ainda uma 3a vez -- ou seja, ajustarParaA4() e chamada varias vezes
   em sequencia pro mesmo ato de imprimir. Rodar tudo de novo a cada
   chamada (descongelar -> remontar -> re-congelar) e o que causava o
   grafico em branco: se uma dessas chamadas repetidas cair bem na hora
   em que o Chrome ja comecou a capturar a pagina pro PDF, ela descongela
   a imagem (mostra o canvas "ao vivo" de novo) e o Chrome fotografa o
   canvas nesse instante em branco, antes do proximo frame redesenhar e
   re-congelar. Essa trava faz so a PRIMEIRA chamada de cada impressao
   valer -- as repeticoes (beforeprint, matchMedia) viram no-op. */
let _impressaoPreparada = false;

/* Funcao principal: deixa a pagina pronta para virar A4. */
function ajustarParaA4(){
  if(_impressaoPreparada) return null;
  _impressaoPreparada = true;
  _descongelarGraficos();
  aplicarRegraDePagina();
  _montarLarguraVirtual();
  const zoom = _calcularZoom();
  document.documentElement.style.setProperty('--fit-zoom', zoom.toFixed(4));
  _ajustarAlturaDosBlocos(zoom);
  _ajustarMapaDeCalor(zoom);
  // So agora (depois do zoom individual de cada bloco) e que da pra medir
  // o tamanho final de verdade -- ver o comentario de _resizeExplicito
  // sobre por que isso NAO pode ser um chart.resize() sem argumentos.
  _resizeExplicito();
  _congelarGraficosComoImagem();
  return zoom;
}

/* Devolve a pagina ao estado de tela. */
function restaurarTela(){
  _impressaoPreparada = false;
  const raiz = document.documentElement;
  _descongelarGraficos();
  raiz.classList.remove('preparando-impressao');
  raiz.style.removeProperty('--fit-base');
  raiz.style.removeProperty('--fit-zoom');
  document.querySelectorAll(FIT_A4.blocosPagina).forEach(el => el.style.zoom = '');
  document.querySelector('.bento-heat')?.style.removeProperty('--heat-scale');
  graficosAtivos().forEach(c => {
    if(c._animOriginal !== undefined){ c.options.animation = c._animOriginal; }
    if(c._dprOriginal !== undefined){ c.options.devicePixelRatio = c._dprOriginal; }
    c.resize();
  });
}

/* Botao "Imprimir / Salvar PDF": ajusta, deixa o navegador respirar um
   frame para os graficos terminarem de redesenhar, e so entao imprime. */
function imprimirA4(){
  ajustarParaA4();
  requestAnimationFrame(() => setTimeout(() => window.print(), 150));
}
window.imprimirA4 = imprimirA4;
window.ajustarParaA4 = ajustarParaA4;

/* Ctrl+P tambem passa pelo ajuste (o beforeprint dispara em qualquer
   caminho de impressao); afterprint limpa tudo. */
window.addEventListener('beforeprint', ajustarParaA4);
window.addEventListener('afterprint', restaurarTela);

/* Rede de seguranca: o Chrome tem um bug conhecido onde 'afterprint'
   as vezes NAO dispara no fluxo "Salvar como PDF" (mais comum em
   certas versoes/combinacoes de Windows) -- quando isso acontece, o
   painel fica preso no layout de impressao (980px de largura,
   graficos congelados como imagem) ate a pagina ser recarregada.
   matchMedia('print') e um jeito redundante e independente de saber
   quando a impressao comeca/termina; ajustarParaA4/restaurarTela ja
   sao seguras para rodar mais de uma vez seguida, entao nao ha risco
   de conflito entre os dois gatilhos disparando juntos. */
const mqlImpressao = window.matchMedia('print');
const onMudancaImpressao = (e) => { if(e.matches){ ajustarParaA4(); } else { restaurarTela(); } };
if(mqlImpressao.addEventListener){ mqlImpressao.addEventListener('change', onMudancaImpressao); }
else if(mqlImpressao.addListener){ mqlImpressao.addListener(onMudancaImpressao); }
