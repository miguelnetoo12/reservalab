/* =====================================================================
   ReservaLab — versão GitHub Pages + Firebase
   Front-end: HTML, CSS e JavaScript (este arquivo)
   Back-end:  Firebase Authentication (login Google) + Cloud Firestore
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, query, where, orderBy, limit,
  onSnapshot, runTransaction, deleteDoc, addDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMINS } from "./firebase-config.js";

/* ============ Configuração da escola (edite aqui) ============
   Se mudar os ids dos recursos ou o número de aulas, atualize também
   o firestore.rules (lista de recursos e "aula <= 8"). */
const RECURSOS = [
  { id:'lab',        nome:'Laboratório de Informática', desc:'Computadores para aulas práticas, pesquisa e programação.',   cor:'var(--r-lab)' },
  { id:'datashow-1', nome:'Data Show 01',               desc:'Projetor portátil. Retire e devolva na coordenação.',       cor:'var(--r-ds)' },
  { id:'datashow-2', nome:'Data Show 02',               desc:'Projetor portátil. Retire e devolva na coordenação.',       cor:'var(--r-ds2)' },
  { id:'inovacao',   nome:'Sala de Inovação',           desc:'Espaço maker para projetos, robótica e trabalho em grupo.', cor:'var(--r-ino)' },
  { id:'google',     nome:'Sala Google',                desc:'Sala com Chromebooks e ferramentas Google for Education.',  cor:'var(--r-goo)' },
];
const AULAS = [
  { n:1, ini:'07:00', fim:'08:00' },
  { n:2, ini:'08:00', fim:'09:00' },
  { pausa:'Intervalo', ini:'09:00', fim:'09:20' },
  { n:3, ini:'09:30', fim:'10:30' },
  { n:4, ini:'10:30', fim:'11:20' },
  { pausa:'Almoço', ini:'11:20', fim:'12:20' },
  { n:5, ini:'12:20', fim:'13:20' },
  { n:6, ini:'13:20', fim:'14:20' },
  { pausa:'Intervalo', ini:'14:20', fim:'14:40' },
  { n:7, ini:'14:40', fim:'15:40' },
  { n:8, ini:'15:40', fim:'16:30' },
];
const SO_AULAS = AULAS.filter(a => a.n);
const DIAS = ['Seg','Ter','Qua','Qui','Sex'];
const DIAS_LONGO = ['segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira'];
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/* ============ Datas ============ */
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
function mondayOf(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = x.getDay();
  return addDays(x, wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd);
}
const fmtDia = d => `${d.getDate()} ${MESES[d.getMonth()]}`;
const hojeISO = () => iso(new Date());
function passou(dataISO, aula){
  const h = hojeISO();
  if (dataISO < h) return true;
  if (dataISO > h) return false;
  const a = SO_AULAS.find(x => x.n === aula);
  const now = new Date();
  const [hh,mm] = a.fim.split(':').map(Number);
  return now.getHours()*60 + now.getMinutes() > hh*60 + mm;
}
const aulaPor = n => SO_AULAS.find(a => a.n === n);
const recPor = id => RECURSOS.find(r => r.id === id) || RECURSOS[0];
const diaSemana = d => DIAS_LONGO[(d.getDay()+6)%7];

/* ============ Estado ============ */
const S = {
  view:'agenda', recurso:'lab', semana: mondayOf(new Date()),
  dia: Math.min(Math.max(new Date().getDay()-1,0),4),
  reservas:[], ocorrencias:[], ocFiltro:'aberta',
  user:null, isAdmin:false,
};
const ls = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
};
const ultimoRec = ls.get('rl_recurso');
if (ultimoRec && RECURSOS.some(r => r.id === ultimoRec)) S.recurso = ultimoRec;

/* ============ Utilitários ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4000);
}
function msgErro(e){
  const c = e && e.code;
  if (c === 'permission-denied') return 'Sua conta não tem permissão para isso. Fale com a coordenação.';
  if (c === 'unavailable') return 'Sem conexão com o banco de dados. Verifique a internet e tente de novo.';
  if (c === 'resource-exhausted') return 'O limite gratuito do Firebase de hoje foi atingido. Tente de novo amanhã.';
  if (c === 'unauthenticated') return 'Sua sessão expirou. Entre de novo com sua conta Google.';
  return 'Não foi possível salvar agora. Tente de novo.';
}

/* ============ Firebase ============ */
const configurado = Object.values(firebaseConfig).every(v => v && !String(v).includes('COLE_AQUI'));
let auth = null, db = null;
if (configurado) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

/* ============ Camada de dados ============ */
const api = {
  // Cria a reserva dentro de uma transação: lê o horário e só grava se estiver livre.
  async reservar(r){
    const ref = doc(db, 'reservas', `${r.recurso}_${r.data}_${r.aula}`);
    try {
      await runTransaction(db, async tx => {
        const atual = await tx.get(ref);
        if (atual.exists()) throw { code:'ocupado' };
        tx.set(ref, r);
      });
      return { ok:true };
    } catch (e) {
      if (e && e.code === 'ocupado') return { ok:false, motivo:'Esse horário já está reservado.' };
      return { ok:false, fatal:true, motivo:msgErro(e) };
    }
  },
  cancelar: id => deleteDoc(doc(db, 'reservas', id)),
  addOcorrencia: o => addDoc(collection(db, 'ocorrencias'), o),
  resolver: (id, valor) => updateDoc(doc(db, 'ocorrencias', id), {
    resolvida: valor, resolvidaEm: valor ? new Date().toISOString() : null,
  }),
};

// Escuta as reservas da semana em tempo real
let unsubSemana = null, unsubOc = null;
function assinarSemana(){
  if (unsubSemana) unsubSemana();
  if (!S.user) return;
  const ini = iso(S.semana), fim = iso(addDays(S.semana,4));
  const q = query(collection(db, 'reservas'), where('data','>=',ini), where('data','<=',fim));
  unsubSemana = onSnapshot(q,
    snap => { S.reservas = snap.docs.map(d => ({ id:d.id, ...d.data() })); render(); },
    err => { console.error(err); toast(err.code === 'permission-denied' ? 'Sua conta não tem permissão para ver a agenda.' : 'A agenda parou de atualizar. Recarregue a página.'); }
  );
}
// Escuta as ocorrências em tempo real (as 200 mais recentes)
function assinarOcorrencias(){
  if (unsubOc) unsubOc();
  if (!S.user) return;
  const q = query(collection(db, 'ocorrencias'), orderBy('criadoEm','desc'), limit(200));
  unsubOc = onSnapshot(q,
    snap => { S.ocorrencias = snap.docs.map(d => ({ id:d.id, ...d.data() })); render(); },
    err => console.error(err)
  );
}

/* ============ Renderização ============ */
function mapaSemana(){
  const m = new Map();
  for (const r of S.reservas) m.set(`${r.recurso}|${r.data}|${r.aula}`, r);
  return m;
}
const ehMinha = r => S.user && r.criadoPor === S.user.uid;

function slotHTML(rec, dataISO, aula, mapa){
  const r = mapa.get(`${rec.id}|${dataISO}|${aula.n}`);
  if (r) {
    const bloq = r.tipo === 'bloqueio';
    return `<button class="slot ocupado ${bloq ? 'bloqueio' : ''} ${ehMinha(r) ? 'mine' : ''}" data-act="ver" data-id="${esc(r.id)}">
      <span class="p">${bloq ? 'Bloqueado' : esc(r.professor)}</span>
      <span class="t">${esc(bloq ? (r.finalidade || 'Coordenação') : [r.turma, r.disciplina].filter(Boolean).join(' · '))}</span>
    </button>`;
  }
  if (passou(dataISO, aula.n)) return `<div class="slot passado" aria-label="Horário encerrado">—</div>`;
  return `<button class="slot livre" data-act="slot" data-data="${dataISO}" data-aula="${aula.n}" aria-label="Reservar ${esc(rec.nome)}, ${aula.n}ª aula, ${dataISO}">
    <span class="txt">Livre</span><span class="plus">+ Reservar</span></button>`;
}

function renderAgenda(){
  const rec = recPor(S.recurso);
  const mapa = mapaSemana();
  const hoje = hojeISO();
  const dias = [0,1,2,3,4].map(i => addDays(S.semana,i));
  const total = SO_AULAS.length * 5;

  $('recursos').innerHTML = RECURSOS.map(r => {
    const n = S.reservas.filter(x => x.recurso === r.id).length;
    return `<button class="chip" style="--c:${r.cor}" data-act="recurso" data-id="${r.id}" aria-pressed="${r.id === S.recurso}">
      <span class="dot"></span>${esc(r.nome)}<span class="n">${n}</span></button>`;
  }).join('');

  const usados = S.reservas.filter(x => x.recurso === rec.id).length;
  $('rec-info').innerHTML = `<h2>${esc(rec.nome)}</h2><p>${esc(rec.desc)} <span class="uso">${usados} de ${total} aulas reservadas nesta semana</span></p>`;
  const lbl = `${fmtDia(dias[0])} – ${fmtDia(dias[4])} ${dias[4].getFullYear()}`;
  $('semana-lbl').textContent = lbl; $('semana-lbl2').textContent = lbl;
  $('leg-oc').style.background = `color-mix(in srgb, ${rec.cor} 15%, var(--surface))`;
  $('leg-oc').style.border = `1px solid color-mix(in srgb, ${rec.cor} 40%, transparent)`;
  $('leg-mine').style.boxShadow = `inset 0 0 0 2px ${rec.cor}`;

  // Grade da semana (computador)
  let g = `<div class="gh"></div>` + dias.map((d,i) => `<div class="gh ${iso(d) === hoje ? 'hoje' : ''}">${DIAS[i]}<b>${d.getDate()}</b></div>`).join('');
  for (const a of AULAS) {
    if (a.pausa) { g += `<div class="brk">${a.pausa} · ${a.ini}–${a.fim}</div>`; continue; }
    g += `<div class="tm"><span class="n">${a.n}ª aula</span><span class="h">${a.ini}–${a.fim}</span></div>`;
    g += dias.map(d => `<div class="cell ${iso(d) === hoje ? 'hoje' : ''}" style="--c:${rec.cor}">${slotHTML(rec, iso(d), a, mapa)}</div>`).join('');
  }
  $('grade').innerHTML = g;

  // Lista por dia (celular)
  $('dias').innerHTML = dias.map((d,i) => `<button class="dia ${iso(d) === hoje ? 'hoje' : ''}" data-act="dia" data-i="${i}" aria-pressed="${i === S.dia}">${DIAS[i]}<b>${d.getDate()}</b></button>`).join('');
  const dSel = iso(dias[S.dia]);
  let l = '';
  for (const a of AULAS) {
    if (a.pausa) { l += `<div class="brk">${a.pausa} · ${a.ini}–${a.fim}</div>`; continue; }
    l += `<div class="lrow"><div class="tm"><span class="n">${a.n}ª</span><span class="h">${a.ini}</span></div><div class="cell" style="--c:${rec.cor}">${slotHTML(rec, dSel, a, mapa)}</div></div>`;
  }
  $('lista').innerHTML = l;
}

function renderOcorrencias(){
  const sel = $('oc-recurso');
  if (!sel.dataset.set) {
    sel.innerHTML = RECURSOS.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('');
    sel.value = S.recurso; sel.dataset.set = '1';
  }
  $('oc-count').textContent = S.ocorrencias.filter(o => !o.resolvida).length;
  document.querySelectorAll('[data-act="ocfiltro"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === S.ocFiltro));
  const lista = S.ocorrencias.filter(o => S.ocFiltro === 'todas' ? true : S.ocFiltro === 'aberta' ? !o.resolvida : o.resolvida);
  if (!lista.length) {
    $('oc-list').innerHTML = `<div class="vazio"><b>${S.ocFiltro === 'aberta' ? 'Nenhum problema em aberto' : 'Nada por aqui ainda'}</b>Quando alguém relatar um defeito pelo formulário, ele aparece nesta lista.</div>`;
    return;
  }
  $('oc-list').innerHTML = lista.map(o => {
    const r = recPor(o.recurso);
    const q = new Date(o.criadoEm);
    const data = `${q.getDate()} ${MESES[q.getMonth()]}, ${pad(q.getHours())}:${pad(q.getMinutes())}`;
    return `<article class="oc">
      <div class="meta"><span class="rtag" style="--c:${r.cor}"><i></i>${esc(r.nome)}</span>
        <span class="pill ${o.resolvida ? 'resolvida' : 'aberta'}">${o.resolvida ? 'Resolvida' : 'Aberta'}</span>
        <span>${esc(o.autor || 'Sem nome')} · ${data}</span></div>
      <p class="desc">${esc(o.descricao)}</p>
      <div class="acts"><button class="btn" data-act="resolver" data-id="${esc(o.id)}" data-v="${o.resolvida ? '0' : '1'}">${o.resolvida ? 'Reabrir' : 'Marcar resolvida'}</button></div>
    </article>`;
  }).join('');
}

function renderRelatorio(){
  const dias = [0,1,2,3,4].map(i => addDays(S.semana,i));
  const totalRec = SO_AULAS.length * 5;
  const res = S.reservas;
  const aulasRes = res.filter(r => r.tipo !== 'bloqueio');
  $('rel-sub').textContent = `Semana de ${fmtDia(dias[0])} a ${fmtDia(dias[4])}. ${SO_AULAS.length} aulas por dia em cada recurso.`;

  const porRec = RECURSOS.map(r => ({ r, n: res.filter(x => x.recurso === r.id).length }));
  const ocupGeral = res.length / (totalRec * RECURSOS.length);
  const pico = SO_AULAS.map(a => ({ a, n: res.filter(x => x.aula === a.n).length })).reduce((m,x) => x.n > m.n ? x : m, { n:0 });
  const mais = porRec.reduce((m,x) => x.n > m.n ? x : m, { n:0 });
  const turmas = new Set(aulasRes.map(r => (r.turma || '').trim().toLowerCase()).filter(Boolean)).size;

  $('kpis').innerHTML = `
    <div class="kpi"><div class="k">Reservas</div><div class="v">${aulasRes.length}</div><div class="d">${turmas} ${turmas === 1 ? 'turma atendida' : 'turmas atendidas'}</div></div>
    <div class="kpi"><div class="k">Ocupação geral</div><div class="v">${Math.round(ocupGeral*100)}%</div><div class="d">de ${totalRec * RECURSOS.length} horários possíveis</div></div>
    <div class="kpi"><div class="k">Mais procurado</div><div class="v" style="font-size:20px;padding-block:5px">${mais.n ? esc(mais.r.nome) : '—'}</div><div class="d">${mais.n ? `${mais.n} reservas` : 'Sem reservas ainda'}</div></div>
    <div class="kpi"><div class="k">Horário de pico</div><div class="v">${pico.n ? pico.a.n + 'ª' : '—'}</div><div class="d">${pico.n ? `${pico.a.ini}–${pico.a.fim} · ${pico.n} reservas` : 'Sem reservas ainda'}</div></div>`;

  $('ocup').innerHTML = porRec.map(({r,n}) => {
    const p = n / totalRec;
    return `<div class="orow" style="--c:${r.cor}"><span class="nm"><i></i>${esc(r.nome)}</span>
      <span class="track" role="img" aria-label="${Math.round(p*100)}% ocupado"><b style="width:${(p*100).toFixed(1)}%"></b></span>
      <span class="pc">${Math.round(p*100)}%</span></div>`;
  }).join('');

  const porDia = dias.map(d => res.filter(x => x.data === iso(d)).length);
  const max = Math.max(1, ...porDia);
  const hoje = hojeISO();
  $('dias-chart').innerHTML = dias.map((d,i) => `<div class="dcol">
      <span class="vl">${porDia[i]}</span>
      <span class="vb ${iso(d) === hoje ? 'hoje' : ''}" style="height:${(porDia[i]/max*100*0.78).toFixed(1)}%"></span>
      <span class="dl">${DIAS[i]} ${d.getDate()}</span></div>`).join('');

  const ord = [...res].sort((a,b) => a.data.localeCompare(b.data) || a.aula - b.aula);
  $('tabela').innerHTML = ord.length ? `<table><thead><tr><th>Dia</th><th>Aula</th><th>Recurso</th><th>Professor(a)</th><th>Turma</th><th>Disciplina</th></tr></thead><tbody>${
    ord.map(r => { const d = parseISO(r.data); const a = aulaPor(r.aula); return `<tr>
      <td>${DIAS[(d.getDay()+6)%7] || ''} ${d.getDate()}</td><td class="num">${r.aula}ª · ${a ? a.ini : ''}</td>
      <td><span class="rtag" style="--c:${recPor(r.recurso).cor}"><i></i>${esc(recPor(r.recurso).nome)}</span></td>
      <td>${r.tipo === 'bloqueio' ? '<em>Bloqueio</em>' : esc(r.professor)}</td><td>${esc(r.turma || '—')}</td><td>${esc(r.disciplina || r.finalidade || '—')}</td></tr>`; }).join('')
  }</tbody></table>` : `<div class="vazio"><b>Nenhuma reserva nesta semana</b>As reservas feitas na aba Agenda aparecem aqui automaticamente.</div>`;
}

function renderTelas(){
  const st = $('status');
  if (!configurado) { st.dataset.s = 'demo'; $('status-txt').textContent = 'Firebase não configurado'; }
  else if (S.user === null) { st.dataset.s = 'demo'; $('status-txt').textContent = 'Entre para usar'; }
  else if (S.user) { st.dataset.s = 'online'; $('status-txt').textContent = 'Conectado ao Firebase'; }
  $('tela-config').hidden = configurado;
  $('tela-login').hidden = !configurado || S.user !== null;
  $('app').hidden = !S.user;
  $('conta').hidden = !S.user;
  if (S.user) {
    const nome = S.user.displayName || S.user.email || 'Professor(a)';
    $('conta-nome').textContent = nome;
    const ini = $('conta-ini');
    if (S.user.photoURL) { ini.innerHTML = ''; const img = document.createElement('img'); img.src = S.user.photoURL; img.alt = ''; img.referrerPolicy = 'no-referrer'; ini.appendChild(img); }
    else ini.textContent = nome.trim().charAt(0).toUpperCase();
    $('conta-adm').hidden = !S.isAdmin;
  }
}

function render(){
  renderTelas();
  if (!S.user) return;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === S.view));
  ['agenda','ocorrencias','relatorio'].forEach(v => { $('view-' + v).hidden = v !== S.view; });
  renderAgenda(); renderOcorrencias(); renderRelatorio();
}

/* ============ Diálogos ============ */
let novo = null, detalheId = null;
function abrirReserva(dataISO, aula){
  const rec = recPor(S.recurso), a = aulaPor(aula), d = parseISO(dataISO);
  novo = { data:dataISO, aula };
  $('dr-titulo').textContent = `Reservar ${rec.nome}`;
  $('dr-sub').textContent = `${diaSemana(d)}, ${fmtDia(d)} · ${aula}ª aula (${a.ini}–${a.fim})`;
  $('dr-prof').value = ls.get('rl_prof') || S.user.displayName || '';
  $('dr-turma').value = ''; $('dr-disc').value = ls.get('rl_disc') || ''; $('dr-fin').value = '';
  $('dr-rep').value = '1'; $('dr-bloq').checked = false;
  $('dr-bloq-wrap').hidden = !S.isAdmin;
  $('dr-erro').hidden = true; $('dr-ok').disabled = false; $('dr-ok').textContent = 'Confirmar reserva';
  $('dlg-reserva').showModal();
  setTimeout(() => ($('dr-prof').value ? $('dr-turma') : $('dr-prof')).focus(), 30);
}
function abrirDetalhe(id){
  const r = S.reservas.find(x => x.id === id); if (!r) return;
  detalheId = id;
  const rec = recPor(r.recurso), a = aulaPor(r.aula), d = parseISO(r.data);
  $('dd-titulo').textContent = r.tipo === 'bloqueio' ? 'Horário bloqueado' : `Reserva de ${rec.nome}`;
  $('dd-sub').textContent = `${diaSemana(d)}, ${fmtDia(d)} · ${r.aula}ª aula (${a ? a.ini + '–' + a.fim : ''})`;
  const linhas = r.tipo === 'bloqueio'
    ? [['Recurso', rec.nome], ['Motivo', r.finalidade || 'Coordenação'], ['Registrado por', r.professor || '—']]
    : [['Recurso', rec.nome], ['Professor(a)', r.professor], ['Turma', r.turma], ['Disciplina', r.disciplina || '—'], ['Atividade', r.finalidade || '—']];
  $('dd-det').innerHTML = linhas.map(([k,v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const b = $('dd-cancel');
  b.hidden = !(ehMinha(r) || S.isAdmin);
  b.classList.remove('armed'); b.disabled = false;
  b.textContent = r.tipo === 'bloqueio' ? 'Remover bloqueio' : 'Cancelar reserva';
  $('dlg-detalhe').showModal();
}

$('form-reserva').addEventListener('submit', async ev => {
  ev.preventDefault();
  const bloq = $('dr-bloq').checked;
  let prof = $('dr-prof').value.trim();
  const turma = $('dr-turma').value.trim(), disc = $('dr-disc').value.trim(), fin = $('dr-fin').value.trim();
  const erro = $('dr-erro');
  if (!bloq && (!prof || !turma)) { erro.textContent = 'Preencha o nome do professor(a) e a turma.'; erro.hidden = false; return; }
  if (bloq && !fin) { erro.textContent = 'Escreva o motivo do bloqueio em “Atividade planejada”.'; erro.hidden = false; return; }
  if (bloq && !prof) prof = S.user.displayName || 'Coordenação';
  erro.hidden = true;
  ls.set('rl_prof', prof); ls.set('rl_disc', disc);
  const btn = $('dr-ok'); btn.disabled = true; btn.textContent = 'Salvando…';
  const semanas = Number($('dr-rep').value) || 1;
  const base = {
    recurso:S.recurso, aula:novo.aula, professor:prof, turma, disciplina:disc, finalidade:fin,
    tipo: bloq ? 'bloqueio' : 'aula', criadoPor:S.user.uid, criadoEm:new Date().toISOString(),
  };
  const feitas = [], puladas = [];
  for (let k = 0; k < semanas; k++) {
    const data = iso(addDays(parseISO(novo.data), 7*k));
    const res = await api.reservar({ ...base, data });
    if (res.ok) feitas.push(data); else { puladas.push(res); if (res.fatal) break; }
  }
  if (!feitas.length) {
    btn.disabled = false; btn.textContent = 'Confirmar reserva';
    erro.textContent = puladas[0]?.motivo || 'Não foi possível reservar.'; erro.hidden = false; return;
  }
  $('dlg-reserva').close();
  const rec = recPor(S.recurso).nome;
  if (puladas.length) toast(`${feitas.length} ${feitas.length === 1 ? 'reserva feita' : 'reservas feitas'} para ${rec}. ${puladas.length} ${puladas.length === 1 ? 'semana já estava ocupada' : 'semanas já estavam ocupadas'}.`);
  else toast(feitas.length > 1 ? `${feitas.length} reservas feitas para ${rec}.` : `${rec} reservado.`);
});

$('form-oc').addEventListener('submit', async ev => {
  ev.preventDefault();
  const desc = $('oc-desc').value.trim();
  const erro = $('oc-erro');
  if (!desc) { erro.textContent = 'Descreva o problema antes de registrar.'; erro.hidden = false; return; }
  erro.hidden = true;
  const btn = $('oc-enviar'); btn.disabled = true; btn.textContent = 'Registrando…';
  try {
    await api.addOcorrencia({
      recurso:$('oc-recurso').value, descricao:desc, autor:S.user.displayName || S.user.email || '',
      resolvida:false, criadoPor:S.user.uid, criadoEm:new Date().toISOString(),
    });
    $('oc-desc').value = ''; S.ocFiltro = 'aberta';
    toast('Ocorrência registrada. A coordenação já pode ver.'); render();
  } catch (e) { erro.textContent = msgErro(e); erro.hidden = false; }
  btn.disabled = false; btn.textContent = 'Registrar ocorrência';
});

/* ============ Cliques ============ */
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'entrar') {
    $('login-erro').hidden = true;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      $('login-erro').textContent = e.code === 'auth/unauthorized-domain'
        ? 'Este endereço ainda não foi autorizado no Firebase. Veja o passo "Domínios autorizados" no README.'
        : e.code === 'auth/popup-blocked' ? 'O navegador bloqueou a janela de login. Permita pop-ups para este site.'
        : 'Não foi possível entrar. Tente de novo.';
      $('login-erro').hidden = false;
    }
  }
  else if (act === 'sair') signOut(auth);
  else if (act === 'tab') { S.view = el.dataset.v; render(); }
  else if (act === 'recurso') { S.recurso = el.dataset.id; ls.set('rl_recurso', S.recurso); render(); }
  else if (act === 'dia') { S.dia = Number(el.dataset.i); render(); }
  else if (act === 'semana') {
    const d = Number(el.dataset.d);
    S.semana = d === 0 ? mondayOf(new Date()) : addDays(S.semana, 7*d);
    if (d === 0) S.dia = Math.min(Math.max(new Date().getDay()-1,0),4);
    S.reservas = []; render(); assinarSemana();
  }
  else if (act === 'slot') abrirReserva(el.dataset.data, Number(el.dataset.aula));
  else if (act === 'ver') abrirDetalhe(el.dataset.id);
  else if (act === 'fechar') el.closest('dialog').close();
  else if (act === 'cancelar') {
    if (!el.classList.contains('armed')) { el.classList.add('armed'); el.textContent = 'Clique de novo para confirmar'; return; }
    el.disabled = true; el.textContent = 'Cancelando…';
    try { await api.cancelar(detalheId); $('dlg-detalhe').close(); toast('Reserva cancelada. O horário está livre.'); }
    catch (e) { el.disabled = false; el.classList.remove('armed'); el.textContent = 'Cancelar reserva'; toast(msgErro(e)); }
  }
  else if (act === 'ocfiltro') { S.ocFiltro = el.dataset.f; render(); }
  else if (act === 'resolver') {
    el.disabled = true;
    try { await api.resolver(el.dataset.id, el.dataset.v === '1'); toast(el.dataset.v === '1' ? 'Marcada como resolvida.' : 'Ocorrência reaberta.'); }
    catch (e) { el.disabled = false; toast(msgErro(e)); }
  }
  else if (act === 'csv') baixarCSV();
});
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', ev => { if (ev.target === d) d.close(); }));

function baixarCSV(){
  const linhas = [['Data','Dia','Aula','Horário','Recurso','Tipo','Professor(a)','Turma','Disciplina','Atividade']];
  const ord = [...S.reservas].sort((a,b) => a.data.localeCompare(b.data) || a.aula - b.aula);
  for (const r of ord) {
    const d = parseISO(r.data), a = aulaPor(r.aula);
    linhas.push([r.data, diaSemana(d), `${r.aula}ª`, a ? `${a.ini}-${a.fim}` : '', recPor(r.recurso).nome,
      r.tipo === 'bloqueio' ? 'Bloqueio' : 'Aula', r.professor || '', r.turma || '', r.disciplina || '', r.finalidade || '']);
  }
  // ﻿ faz o Excel reconhecer os acentos; ";" separa as colunas no Excel em português
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `reservas-semana-${iso(S.semana)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============ Início ============ */
const h = (location.hash || '').slice(1);
if (['agenda','ocorrencias','relatorio'].includes(h)) S.view = h;

if (!configurado) {
  render();
} else {
  S.user = undefined; // ainda verificando o login
  render();
  onAuthStateChanged(auth, user => {
    S.user = user || null;
    S.isAdmin = !!(user && user.email && ADMINS.map(e => e.toLowerCase()).includes(user.email.toLowerCase()));
    if (user) { assinarSemana(); assinarOcorrencias(); }
    else {
      if (unsubSemana) unsubSemana(); if (unsubOc) unsubOc();
      unsubSemana = unsubOc = null; S.reservas = []; S.ocorrencias = [];
    }
    render();
  });
}

// Atualiza os horários encerrados a cada minuto
setInterval(() => { if (S.user && !document.querySelector('dialog[open]')) renderAgenda(); }, 60000);
