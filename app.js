// Portal de Fechamento GSM — telas do administrador (passos 1, 2 e 4 do ciclo)
import { decodeText, parseCSV, parseUmov, resumoUmov, parseCarteira, parseAtendimentos, norm } from './parse.js';
import { gerarModelo } from './modelo.js';

const SB_URL = 'https://quqatijyafqgybzkbuhv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWF0aWp5YWZxZ3liemtidWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzU0NTIsImV4cCI6MjEwNzcxMTQ1Mn0.BTIoDePK8klSS3k2RwwQ6WPuFPJ4SJt16GFjDcpP4r0';
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const app = document.getElementById('app');

const S = { user: null, perfil: null, comps: [], parceiros: [], rotas: {}, view: 'painel', compId: null, umovPrev: null, cartPrev: null };

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (n ?? 0).toLocaleString('pt-BR');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = iso => { if (!iso) return '—'; const [y, m] = iso.split('-'); return `${MESES[+m - 1]}/${y}`; };
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtD = iso => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const safeName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
const $ = sel => app.querySelector(sel);
const comp = () => S.comps.find(c => c.id === S.compId);
const parcNome = id => { const p = S.parceiros.find(x => x.id === id); return p ? `${p.codigo} · ${p.regiao} · ${p.nome}` : '—'; };

async function q(promise) {
  const { data, error, count } = await promise;
  if (error) throw new Error(error.message);
  return count != null && data == null ? count : data;
}

// ---------- autenticação ----------
async function iniciar() {
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  if (!S.user) return telaLogin();
  try {
    S.perfil = await q(sb.from('perfis').select('*').eq('id', S.user.id).maybeSingle());
  } catch (e) { S.perfil = null; }
  if (!S.perfil) return telaSemPerfil();
  if (S.perfil.papel === 'parceiro') return iniciarParceiro();
  if (S.perfil.papel !== 'admin') return telaEmBreve();
  await carregarBase();
  window.addEventListener('hashchange', rotear);
  rotear();
}

function telaLogin(aba = 'entrar', msg = '') {
  app.innerHTML = `
  <div class="login">
    <section class="login-lado" aria-label="Sobre o portal">
      <img src="logo_escuro.png" alt="GSM Log">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="eyebrow">Portal de Fechamento</div>
        <h1>Fechamento mensal<br>de última milha</h1>
        <p>Relatórios dos parceiros conferidos com o Umov, aprovação, notas fiscais e pagamento num só lugar.</p>
      </div>
      <ol class="passos">
        <li><b>1</b><strong>Base do mês</strong><span>Umov e carteira importados pela GSM</span></li>
        <li><b>2</b><strong>Relatório do parceiro</strong><span>Conferido automaticamente</span></li>
        <li><b>3</b><strong>Aprovação e NF</strong><span>Valor congelado, NF em PDF</span></li>
      </ol>
    </section>
    <section class="login-form" aria-label="Entrar">
      <form id="f" novalidate>
        <div class="abas" role="tablist">
          <button type="button" data-aba="entrar" class="${aba === 'entrar' ? 'on' : ''}">Entrar</button>
          <button type="button" data-aba="primeiro" class="${aba === 'primeiro' ? 'on' : ''}">Primeiro acesso</button>
        </div>
        ${aba === 'entrar' ? `
          <label class="campo">E-mail<input id="email" type="email" autocomplete="username" required></label>
          <label class="campo">Senha<input id="senha" type="password" autocomplete="current-password" required></label>
          <button class="btn" type="submit">Entrar</button>
          <p class="nota">Esqueceu a senha? Peça à GSM um novo código de acesso.</p>
        ` : `
          <p style="margin:0;font-size:14px;color:var(--muted)">Use o código que a GSM enviou para você e escolha sua senha (mínimo de 8 caracteres).</p>
          <label class="campo">E-mail<input id="email" type="email" autocomplete="username" required></label>
          <label class="campo">Código do convite<input id="codigo" type="text" autocomplete="one-time-code" required style="text-transform:uppercase;letter-spacing:.12em"></label>
          <label class="campo">Nova senha<input id="senha" type="password" autocomplete="new-password" required></label>
          <label class="campo">Repita a senha<input id="senha2" type="password" autocomplete="new-password" required></label>
          <button class="btn marca" type="submit">Criar meu acesso</button>
        `}
        <div id="msg">${msg}</div>
        <p class="nota">Cada parceiro vê apenas os próprios relatórios, divergências e valores.</p>
      </form>
    </section>
  </div>`;
  app.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => telaLogin(b.dataset.aba));
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#f button[type=submit]'); btn.disabled = true;
    const email = $('#email').value.trim(), senha = $('#senha').value;
    const erro = t => { $('#msg').innerHTML = `<div class="msg erro">${esc(t)}</div>`; btn.disabled = false; };
    try {
      if (aba === 'primeiro') {
        if (senha !== $('#senha2').value) return erro('As duas senhas não são iguais.');
        if (senha.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
        const r = await fetch(`${SB_URL}/functions/v1/primeiro-acesso`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({ email, codigo: $('#codigo').value, senha }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return erro(j.erro || 'Não foi possível criar o acesso.');
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) return erro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      iniciar();
    } catch (e) { erro('Falha de conexão: ' + e.message); }
  };
}

function telaSimples(titulo, texto) {
  app.innerHTML = `<div class="login"><section class="login-form" style="flex-basis:100%"><div style="max-width:520px;display:flex;flex-direction:column;gap:16px">
    <img src="logo_claro.png" alt="GSM Log" style="height:40px;width:120px;object-fit:contain">
    <div class="bloco"><h2 style="font-size:24px">${titulo}</h2><p style="margin:0;color:var(--muted)">${texto}</p></div>
    <div><button class="btn sec" id="sair">Sair</button></div></div></section></div>`;
  $('#sair').onclick = sair;
}
const telaSemPerfil = () => telaSimples('Acesso sem perfil', 'Seu login existe, mas ainda não tem um perfil no portal. Fale com o Fechamento GSM.');
const telaEmBreve = () => telaSimples(`Olá${S.perfil.nome ? ', ' + esc(S.perfil.nome) : ''}`, 'Sua área no portal está sendo preparada. Assim que a GSM liberar a competência, você verá aqui o modelo do relatório e o envio.');
async function sair() { await sb.auth.signOut(); location.hash = ''; location.reload(); }

// ---------- dados de base ----------
async function carregarBase() {
  const [comps, parceiros, rotas] = await Promise.all([
    q(sb.from('competencias').select('*').order('mes', { ascending: false })),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,ativo').order('codigo')),
    q(sb.from('rotas_depara').select('*')),
  ]);
  S.comps = comps; S.parceiros = parceiros;
  S.rotas = {}; rotas.forEach(r => S.rotas[r.rota.toUpperCase().trim()] = r);
  if (!S.compId) {
    const abertas = comps.filter(c => c.status === 'aberta').sort((a, b) => a.mes.localeCompare(b.mes));
    S.compId = (abertas[0] || comps[0])?.id;
  }
}

// ---------- casca ----------
const MENU = [
  ['Visão geral', [['painel', 'Painel']]],
  ['Base do mês', [['umov', 'Importar Umov'], ['carteira', 'Inclusão e cancelamento'], ['pontos', 'Pontos do mês'], ['competencias', 'Liberar competência']]],
  ['Parceiros', [['acessos', 'Acessos e convites']]],
  ['Próximas etapas', [['', 'Adiantamentos'], ['', 'Conferência e aprovação'], ['', 'Notas fiscais'], ['', 'Financeiro'], ['', 'Diretoria']]],
];
const VIEWS = { painel: () => vPainel(), umov: () => vUmov(), carteira: () => vCarteira(), pontos: () => vPontos(), competencias: () => vCompetencias(), acessos: () => vAcessos() };

function rotear() {
  const v = (location.hash || '#painel').slice(1);
  S.view = VIEWS[v] ? v : 'painel';
  casca();
  VIEWS[S.view]();
}

function casca() {
  app.innerHTML = `
  <div class="sistema">
    <aside class="menu">
      <img src="logo_escuro.png" alt="GSM Log">
      <div class="tit"><small>Fechamento</small><strong>Administração</strong></div>
      <nav aria-label="Menu">
        ${MENU.map(([g, itens]) => `<div class="grupo">${g}</div>` + itens.map(([id, nome]) =>
          id ? `<a href="#${id}" class="${S.view === id ? 'on' : ''}">${nome}</a>` : `<a class="off">${nome} <em>em construção</em></a>`).join('')).join('')}
      </nav>
      <div class="rodape"><span>${esc(S.user.email)}</span><button id="sair">Sair</button></div>
    </aside>
    <main id="main"></main>
  </div>`;
  $('#sair').onclick = sair;
}

function seletorComp(soAbertas = true) {
  const lista = S.comps.filter(c => !soAbertas || c.status === 'aberta');
  return `<label class="campo" style="min-width:220px">Competência
    <select id="comp">${lista.map(c => `<option value="${c.id}" ${c.id === S.compId ? 'selected' : ''}>${nomeMes(c.mes)}${c.status === 'fechada' ? ' (fechada)' : ''}</option>`).join('')}</select></label>`;
}
function ligarSeletor(fn) { const s = $('#comp'); if (s) s.onchange = () => { S.compId = s.value; S.umovPrev = null; fn(); }; }

function zonaArquivo(id, titulo, dica, accept) {
  return `<label class="soltar" id="${id}-zona" for="${id}">
    <strong>${titulo}</strong><span>${dica}</span>
    <input id="${id}" type="file" accept="${accept}" style="font:inherit;font-size:13px;margin-top:6px"></label>`;
}
function ligarZona(id, fn) {
  const z = $(`#${id}-zona`), inp = $(`#${id}`);
  inp.onchange = () => inp.files[0] && fn(inp.files[0]);
  z.ondragover = e => { e.preventDefault(); z.classList.add('sobre'); };
  z.ondragleave = () => z.classList.remove('sobre');
  z.ondrop = e => { e.preventDefault(); z.classList.remove('sobre'); e.dataTransfer.files[0] && fn(e.dataTransfer.files[0]); };
}

async function lerPlanilha(file) {
  const buf = await file.arrayBuffer();
  if (/\.csv$|\.txt$/i.test(file.name)) return { 'CSV': parseCSV(decodeText(buf)) };
  const wb = XLSX.read(buf, { type: 'array' });
  const out = {};
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  return out;
}

// ---------- Painel ----------
async function vPainel() {
  const m = $('#main');
  const c = comp();
  m.innerHTML = `<div class="topo"><div><h1>Painel</h1><p>Situação da competência em aberto e do ciclo mensal.</p></div>${seletorComp()}</div><div id="corpo" class="carregando">Carregando…</div>`;
  ligarSeletor(vPainel);
  const [imp, cart] = await Promise.all([
    q(sb.from('umov_importacoes').select('*').eq('competencia_id', S.compId).eq('status', 'ativa').maybeSingle()),
    q(sb.from('carteira_importacoes').select('*').order('importado_em', { ascending: false }).limit(1)),
  ]);
  const ult = cart[0];
  const passos = [
    ['Importar Umov', !!imp, imp ? `${fmtN(imp.linhas)} linhas` : 'pendente'],
    ['Importar inclusão e cancelamento', !!ult, ult ? fmtD(ult.importado_em) : 'pendente'],
    ['Liberar adiantamentos', false, 'em construção'],
    ['Liberar competência aos parceiros', c.liberada_parceiros, c.liberada_parceiros ? 'liberada' : 'pendente'],
    ['Parceiro valida e envia relatório', false, 'em construção'],
    ['GSM aprova (valor congelado)', false, 'em construção'],
    ['Parceiro sobe a NF em PDF', false, 'em construção'],
    ['Conferência da NF', false, 'em construção'],
    ['Data de pagamento', false, 'em construção'],
    ['Pacote do financeiro', false, 'em construção'],
    ['Registrar pagamento', false, 'em construção'],
    ['Fechar competência', c.status === 'fechada', c.status],
  ];
  $('#corpo').outerHTML = `
    <div class="kpis">
      <div class="kpi ${imp ? '' : 'alerta'}"><small>Umov de ${nomeMes(c.mes)}</small><b>${imp ? fmtN(imp.linhas) : '—'}</b><span>${imp ? `${fmtN(imp.malote)} malote · ${fmtN(imp.kits)} kits` : 'Ainda não importado'}</span></div>
      <div class="kpi ${imp && imp.sem_parceiro ? 'alerta' : 'neutro'}"><small>Atendimentos sem parceiro</small><b>${imp ? fmtN(imp.sem_parceiro) : '—'}</b><span>${imp ? (imp.sem_parceiro ? 'Rotas sem de-para' : 'Todas as rotas vinculadas') : ''}</span></div>
      <div class="kpi ${ult ? 'neutro' : 'alerta'}"><small>Inclusão e cancelamento</small><b>${ult ? fmtN(ult.linhas_gravadas) : '—'}</b><span>${ult ? 'Importado em ' + fmtD(ult.importado_em) : 'Ainda não importado'}</span></div>
      <div class="kpi ${c.liberada_parceiros ? '' : 'neutro'}"><small>Parceiros</small><b>${c.liberada_parceiros ? 'Liberada' : 'Bloqueada'}</b><span>${c.liberada_parceiros ? 'desde ' + fmtDH(c.liberada_em) : 'Libere depois de importar as bases'}</span></div>
    </div>
    <section class="bloco"><h2>Ciclo mensal · ${nomeMes(c.mes)}</h2>
      <ol class="ciclo">${passos.map(([t, ok, d], i) => `<li class="${ok ? 'pronto' : ''}"><b>${i + 1}</b><span>${t}</span><em>${ok ? '✓ ' : ''}${esc(d)}</em></li>`).join('')}</ol>
    </section>`;
}

// ---------- Passo 1: Importar Umov ----------
async function vUmov() {
  const m = $('#main');
  m.innerHTML = `
    <div class="topo"><div><h1>Importar Umov</h1><p>Suba a Listagem de atendimentos exportada do Umov. O que tem “KIT …” no Grupo Cliente vira Kits/Spot; o resto é Malote. O arquivo original fica guardado no portal.</p></div>${seletorComp()}</div>
    <div id="ativa"></div>
    ${zonaArquivo('arq', 'Arraste a Listagem de atendimentos ou clique para escolher', 'CSV ou Excel, do jeito que sai do Umov', '.csv,.txt,.xlsx,.xls')}
    <div id="prev"></div>
    <div id="rotas"></div>
    <div id="hist"></div>`;
  ligarSeletor(vUmov);
  ligarZona('arq', previaUmov);
  await umovAtivaEHist();
  if (S.umovPrev) desenharPreviaUmov();
}

async function umovAtivaEHist() {
  const hist = await q(sb.from('umov_importacoes').select('*').eq('competencia_id', S.compId).order('importado_em', { ascending: false }));
  const ativa = hist.find(h => h.status === 'ativa');
  $('#ativa').innerHTML = ativa
    ? `<div class="msg ok">Base ativa de ${nomeMes(comp().mes)}: <b>${esc(ativa.arquivo)}</b>, importada em ${fmtDH(ativa.importado_em)} · ${fmtN(ativa.linhas)} linhas (${fmtN(ativa.malote)} malote, ${fmtN(ativa.kits)} kits).</div>`
    : `<div class="msg alerta">${nomeMes(comp().mes)} ainda não tem base do Umov.</div>`;
  $('#hist').innerHTML = hist.length ? `<section class="bloco"><h2>Histórico de importações</h2><div class="tabela"><table>
    <thead><tr><th>Arquivo</th><th>Importado em</th><th class="n">Linhas</th><th class="n">Malote</th><th class="n">Kits</th><th class="n">Sem parceiro</th><th>Situação</th></tr></thead>
    <tbody>${hist.map(h => `<tr><td>${esc(h.arquivo)}</td><td>${fmtDH(h.importado_em)}</td><td class="n">${fmtN(h.linhas)}</td><td class="n">${fmtN(h.malote)}</td><td class="n">${fmtN(h.kits)}</td><td class="n">${fmtN(h.sem_parceiro)}</td>
      <td><span class="pill ${h.status === 'ativa' ? 'escuro' : h.status === 'falhou' ? 'marca' : ''}">${h.status}</span>${h.observacao ? ` <span class="nota">${esc(h.observacao)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  if (ativa) await rotasSemParceiro(ativa);
  else $('#rotas').innerHTML = '';
  return ativa;
}

async function previaUmov(file) {
  $('#prev').innerHTML = '<div class="carregando">Lendo o arquivo…</div>';
  try {
    const abas = await lerPlanilha(file);
    let r = null;
    for (const rows of Object.values(abas)) { r = parseUmov(rows); if (!r.erro) break; }
    if (r.erro) { $('#prev').innerHTML = `<div class="msg erro">${esc(r.erro)}</div>`; return; }
    S.umovPrev = { file, ...r, resumo: resumoUmov(r.registros, S.rotas) };
    desenharPreviaUmov();
  } catch (e) { $('#prev').innerHTML = `<div class="msg erro">Não consegui ler o arquivo: ${esc(e.message)}</div>`; }
}

function desenharPreviaUmov() {
  const p = S.umovPrev, s = p.resumo, c = comp();
  const mesComp = c.mes.slice(0, 7);
  const mesesOrd = Object.entries(s.meses).sort((a, b) => b[1] - a[1]);
  const foraDoMes = s.total - (s.meses[mesComp] || 0);
  const semDepara = s.rotas.filter(r => !r.parceiro);
  const ativaTxt = $('#ativa').textContent.startsWith('Base ativa');
  $('#prev').innerHTML = `
  <section class="bloco"><h2>Prévia: ${esc(p.file.name)}</h2><p class="sub">Nada foi gravado ainda. Confira os números antes de gravar.</p>
    <div class="kpis">
      <div class="kpi"><small>Linhas lidas</small><b>${fmtN(s.total)}</b><span>cabeçalho na linha ${p.cabecalho}</span></div>
      <div class="kpi"><small>Malote</small><b>${fmtN(s.malote)}</b><span>vai para Atendimentos</span></div>
      <div class="kpi"><small>Kits/Spot</small><b>${fmtN(s.kits)}</b><span>Grupo Cliente “KIT …”</span></div>
      <div class="kpi neutro"><small>Retornada de Campo</small><b>${fmtN(s.ret)}</b><span>${fmtN(s.total - s.ret)} em outras situações</span></div>
      <div class="kpi neutro"><small>Rotas sem de-para</small><b>${fmtN(semDepara.length)}</b><span>${fmtN(semDepara.reduce((a, r) => a + r.n, 0))} atend. · a cidade decide ao gravar</span></div>
    </div>
    ${foraDoMes ? `<div class="msg alerta">${fmtN(foraDoMes)} atendimentos têm data prevista fora de ${nomeMes(c.mes)} (${mesesOrd.map(([k, v]) => `${k === 'sem data' ? k : nomeMes(k + '-01')}: ${fmtN(v)}`).join(' · ')}). Confira se escolheu a competência certa.</div>` : ''}
    ${p.avisos.length ? `<div class="msg alerta"><b>${fmtN(p.avisos.length)} avisos de leitura</b> (as linhas são gravadas assim mesmo):<br>${p.avisos.slice(0, 8).map(esc).join('<br>')}${p.avisos.length > 8 ? '<br>…' : ''}</div>` : ''}
    <div class="tabela"><table><thead><tr><th>Rota (Motorista)</th><th>Parceiro pelo de-para</th><th class="n">Atendimentos</th><th class="n">Kits</th></tr></thead>
      <tbody>${s.rotas.slice(0, 12).map(r => `<tr><td>${esc(r.rota || '(vazio)')}</td><td>${r.parceiro ? (r.parceiro.parceiro_id ? esc(parcNome(r.parceiro.parceiro_id)) : '<span class="pill">Base própria</span>') : '<span class="pill alerta">Sem de-para</span>'}</td><td class="n">${fmtN(r.n)}</td><td class="n">${fmtN(r.kits)}</td></tr>`).join('')}</tbody></table>
      ${s.rotas.length > 12 ? `<p class="nota">Mostrando 12 de ${s.rotas.length} rotas. Ao gravar, o portal vincula pela cidade o que a rota não resolver.</p>` : ''}</div>
    ${ativaTxt ? `<div class="confirma"><b>Já existe uma base ativa para ${nomeMes(c.mes)}.</b> Ao gravar, a nova passa a valer e a anterior fica guardada como “substituída” (nada é apagado).
      <label class="linha"><input type="checkbox" id="ciente"> Entendi, quero substituir a base ativa.</label></div>` : ''}
    <div class="linha"><button class="btn marca" id="gravar" ${ativaTxt ? 'disabled' : ''}>Gravar no portal</button><button class="btn sec" id="cancelar">Descartar prévia</button></div>
    <div id="prog"></div>
  </section>`;
  if (ativaTxt) $('#ciente').onchange = e => $('#gravar').disabled = !e.target.checked;
  $('#cancelar').onclick = () => { S.umovPrev = null; vUmov(); };
  $('#gravar').onclick = gravarUmov;
}

async function gravarUmov() {
  const p = S.umovPrev, c = comp();
  $('#gravar').disabled = true; $('#cancelar').disabled = true;
  const prog = $('#prog');
  const passo = (t, pct) => prog.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px">${t}</span><div class="barra"><i style="width:${pct}%"></i></div></div>`;
  let impId = null;
  try {
    passo('Guardando o arquivo original…', 2);
    const path = `umov/${c.mes.slice(0, 7)}/${Date.now()}_${safeName(p.file.name)}`;
    const up = await sb.storage.from('importacoes').upload(path, p.file, { upsert: false });
    if (up.error) throw new Error('Arquivo original: ' + up.error.message);
    const imp = await q(sb.from('umov_importacoes').insert({ competencia_id: c.id, arquivo: p.file.name, arquivo_path: path }).select().single());
    impId = imp.id;
    const regs = p.registros.map(r => ({ ...r, competencia_id: c.id, importacao_id: impId, parceiro_id: S.rotas[(r.motorista || '').toUpperCase().trim()]?.parceiro_id || null }));
    const LOTE = 500;
    for (let i = 0; i < regs.length; i += LOTE) {
      passo(`Gravando linhas ${fmtN(i + 1)} a ${fmtN(Math.min(i + LOTE, regs.length))} de ${fmtN(regs.length)}…`, 5 + 90 * i / regs.length);
      await q(sb.from('umov_atendimentos').insert(regs.slice(i, i + LOTE)));
    }
    passo('Ativando a base…', 97);
    await q(sb.rpc('ativar_importacao_umov', { p_id: impId }));
    S.umovPrev = null;
    prog.innerHTML = `<div class="msg ok">Base gravada: ${fmtN(regs.length)} linhas de ${nomeMes(c.mes)}.</div>`;
    await umovAtivaEHist();
    $('#prev').innerHTML = `<div class="msg ok">Base do Umov de ${nomeMes(c.mes)} gravada com ${fmtN(regs.length)} linhas.</div>`;
  } catch (e) {
    if (impId) await sb.from('umov_importacoes').update({ status: 'falhou', observacao: e.message.slice(0, 200) }).eq('id', impId);
    prog.innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. A base ativa anterior (se havia) continua valendo. Pode tentar de novo.</div>`;
    $('#gravar').disabled = false; $('#cancelar').disabled = false;
  }
}

// Regra de vínculo (aprovada em 19/10/2026): 1) rota com parceiro no de-para; 2) cidade atendida por um só parceiro;
// 3) cidade dividida: parceiro principal se tiver >= 90% dos pontos; 4) rota de base própria fica com a GSM; 5) resto pendente.
async function rotasSemParceiro(ativa) {
  const [pend, vinc] = await Promise.all([
    q(sb.from('umov_pendentes_cidade').select('*').eq('importacao_id', ativa.id).order('atendimentos', { ascending: false })),
    q(sb.from('umov_vinculos_resumo').select('*').eq('importacao_id', ativa.id)),
  ]);
  const cont = {}; vinc.forEach(v => cont[v.vinculo] = v.atendimentos);
  const opts = S.parceiros.filter(p => p.ativo).map(p => `<option value="${p.id}">${esc(p.codigo + ' · ' + p.regiao + ' · ' + p.nome)}</option>`).join('');
  $('#rotas').innerHTML = `<section class="bloco"><h2>Vínculo com parceiros</h2>
    <p class="sub">Primeiro vale a rota do de-para; se a rota não tem parceiro, vale a cidade (pela base de pontos de cada parceiro). Cidade dividida entre parceiros vai para o principal quando ele tem 90% ou mais dos pontos.</p>
    <div class="kpis">
      <div class="kpi"><small>Pela rota</small><b>${fmtN(cont.rota || 0)}</b><span></span></div>
      <div class="kpi"><small>Pela cidade</small><b>${fmtN((cont.cidade || 0) + (cont.cidade_principal || 0))}</b><span>${cont.cidade_principal ? fmtN(cont.cidade_principal) + ' pelo parceiro principal' : ''}</span></div>
      <div class="kpi neutro"><small>Manual</small><b>${fmtN(cont.manual || 0)}</b><span></span></div>
      <div class="kpi neutro"><small>Base própria GSM</small><b>${fmtN(cont.base_propria || 0)}</b><span>SP, RJ e rotas próprias</span></div>
      <div class="kpi ${pend.length ? 'alerta' : 'neutro'}"><small>Pendentes</small><b>${fmtN(pend.reduce((a, r) => a + r.atendimentos, 0))}</b><span>${pend.length ? pend.length + ' cidades' : 'nenhum'}</span></div>
    </div>
    ${pend.length ? `<p class="sub" style="margin:0">Cidades que nenhum parceiro atende na base. Ao vincular, a cidade fica salva para os próximos meses.</p>
    <div class="tabela"><table><thead><tr><th>Cidade</th><th>Rotas no Umov</th><th class="n">Atend.</th><th>Parceiro</th><th></th></tr></thead><tbody>
    ${pend.map((r, i) => `<tr><td>${esc(r.cidade_norm || '(sem cidade)')}${r.uf_norm ? ' - ' + esc(r.uf_norm) : ''}</td><td style="font-size:13px;color:var(--muted)">${esc(r.rotas)}</td><td class="n">${fmtN(r.atendimentos)}</td>
      <td><select class="peq" id="sel${i}"><option value="">Escolha…</option>${opts}</select></td>
      <td><button class="btn peq" data-i="${i}">Vincular cidade</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
  app.querySelectorAll('#rotas button[data-i]').forEach(b => b.onclick = async () => {
    const r = pend[+b.dataset.i], v = $(`#sel${b.dataset.i}`).value;
    if (!v) return;
    b.disabled = true;
    try {
      await q(sb.rpc('vincular_cidade', { p_cidade: r.cidade_norm, p_uf: r.uf_norm, p_parceiro: v }));
      await umovAtivaEHist();
    } catch (e) { b.disabled = false; alertaTopo(e.message); }
  });
}

function alertaTopo(t) { const d = document.createElement('div'); d.className = 'msg erro'; d.textContent = t; $('#main').prepend(d); }

// ---------- Passo 2: Inclusão e cancelamento ----------
async function vCarteira() {
  const m = $('#main');
  m.innerHTML = `
    <div class="topo"><div><h1>Inclusão e cancelamento</h1><p>Suba a planilha geral de inclusão e cancelamento. Se o mesmo ponto aparece mais de uma vez, vale a linha mais recente (data efetiva, depois data de solicitação). Linhas repetidas de outras abas ou de meses anteriores não são gravadas de novo.</p></div></div>
    <div id="resumo"></div>
    ${zonaArquivo('arqc', 'Arraste a planilha de Inclusão e Cancelamento ou clique para escolher', 'Excel (.xlsx), com todas as abas', '.xlsx,.xls')}
    <div id="prevc"></div>
    <div id="histc"></div>`;
  ligarZona('arqc', previaCarteira);
  await carteiraResumo();
  if (S.cartPrev) desenharPreviaCarteira();
}

async function carteiraResumo() {
  const [res, hist] = await Promise.all([
    q(sb.rpc('carteira_resumo')),
    q(sb.from('carteira_importacoes').select('*').order('importado_em', { ascending: false }).limit(12)),
  ]);
  const tot = res.reduce((a, r) => a + r.pontos, 0);
  const g = k => res.find(r => r.situacao === k)?.pontos || 0;
  $('#resumo').innerHTML = tot ? `<div class="kpis">
      <div class="kpi"><small>Pontos na base</small><b>${fmtN(tot)}</b><span>situação pela linha mais recente</span></div>
      <div class="kpi"><small>Ativos</small><b>${fmtN(g('Ativo'))}</b><span>inclusão ou reativação</span></div>
      <div class="kpi neutro"><small>Cancelados</small><b>${fmtN(g('Cancelado'))}</b><span></span></div>
      <div class="kpi neutro"><small>Suspensos</small><b>${fmtN(g('Suspenso'))}</b><span></span></div>
      <div class="kpi ${g('Sem status') ? 'alerta' : 'neutro'}"><small>Sem status</small><b>${fmtN(g('Sem status'))}</b><span>só alteração cadastral ou de frequência</span></div>
    </div>` : '<div class="msg alerta">Nenhuma base de inclusão e cancelamento importada ainda.</div>';
  $('#histc').innerHTML = hist.length ? `<section class="bloco"><h2>Importações anteriores</h2><div class="tabela"><table>
    <thead><tr><th>Arquivo</th><th>Importado em</th><th class="n">Lidas</th><th class="n">Novas</th><th class="n">Com alerta</th></tr></thead>
    <tbody>${hist.map(h => `<tr><td>${esc(h.arquivo)}</td><td>${fmtDH(h.importado_em)}</td><td class="n">${fmtN(h.linhas_lidas)}</td><td class="n">${fmtN(h.linhas_novas ?? h.linhas_gravadas)}</td><td class="n">${fmtN(h.linhas_com_alerta)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
}

async function previaCarteira(file) {
  $('#prevc').innerHTML = '<div class="carregando">Lendo a planilha (pode levar alguns segundos)…</div>';
  try {
    const abas = await lerPlanilha(file);
    const r = parseCarteira(abas);
    if (!r.movimentos.length) { $('#prevc').innerHTML = '<div class="msg erro">Não encontrei a coluna “CODIGO DE INTEGRAÇÃO” em nenhuma aba.</div>'; return; }
    S.cartPrev = { file, ...r };
    desenharPreviaCarteira();
  } catch (e) { $('#prevc').innerHTML = `<div class="msg erro">Não consegui ler a planilha: ${esc(e.message)}</div>`; }
}

function desenharPreviaCarteira() {
  const p = S.cartPrev;
  const lidas = Object.values(p.porAba).reduce((a, s) => a + s.lidas, 0);
  const comAlerta = p.movimentos.filter(m => m.alerta);
  const tipos = {}; p.movimentos.forEach(m => tipos[m.tipo_mov || '(vazio)'] = (tipos[m.tipo_mov || '(vazio)'] || 0) + 1);
  $('#prevc').innerHTML = `<section class="bloco"><h2>Prévia: ${esc(p.file.name)}</h2><p class="sub">Nada foi gravado ainda.</p>
    <div class="kpis">
      <div class="kpi"><small>Linhas lidas</small><b>${fmtN(lidas)}</b><span>${Object.keys(p.porAba).length} abas</span></div>
      <div class="kpi"><small>Movimentos únicos</small><b>${fmtN(p.movimentos.length)}</b><span>${fmtN(p.duplicadas)} repetidas entre abas</span></div>
      <div class="kpi ${comAlerta.length ? 'alerta' : 'neutro'}"><small>Com alerta de data</small><b>${fmtN(comAlerta.length)}</b><span>gravadas e marcadas</span></div>
      <div class="kpi ${p.semCodigo ? 'alerta' : 'neutro'}"><small>Sem código de integração</small><b>${fmtN(p.semCodigo)}</b><span>${p.semCodigo ? 'não entram (sem ponto)' : ''}</span></div>
    </div>
    <div class="tabela"><table><thead><tr><th>Aba</th><th class="n">Lidas</th><th class="n">Únicas</th><th class="n">Repetidas</th><th class="n">Sem código</th><th class="n">Alertas</th></tr></thead>
      <tbody>${Object.entries(p.porAba).map(([a, s]) => `<tr><td>${esc(a)}</td><td class="n">${fmtN(s.lidas)}</td><td class="n">${fmtN(s.gravadas)}</td><td class="n">${fmtN(s.duplicadas)}</td><td class="n">${fmtN(s.sem_codigo)}</td><td class="n">${fmtN(s.alertas)}</td></tr>`).join('')}</tbody></table>
      ${p.ignoradas.length ? `<p class="nota">Abas sem a coluna de código (não lidas): ${p.ignoradas.map(esc).join(', ')}</p>` : ''}</div>
    <div class="linha">${Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="pill">${esc(t)}: ${fmtN(n)}</span>`).join('')}</div>
    ${comAlerta.length ? `<details><summary style="cursor:pointer;font-size:14px">Ver linhas com alerta (${fmtN(comAlerta.length)})</summary><div class="tabela"><table>
      <thead><tr><th>Aba · linha</th><th>Código</th><th>Ponto</th><th>Movimento</th><th>Data escrita</th><th>Alerta</th></tr></thead>
      <tbody>${comAlerta.slice(0, 200).map(m => `<tr><td>${esc(m.aba)} · ${m.linha}</td><td class="num">${esc(m.cod_int)}</td><td>${esc(m.nomenclatura || m.cliente)}</td><td>${esc(m.tipo_mov)}</td><td>${esc(m.data_texto || '')}</td><td>${esc(m.alerta)}</td></tr>`).join('')}</tbody></table>
      ${comAlerta.length > 200 ? '<p class="nota">Mostrando as 200 primeiras.</p>' : ''}</div></details>` : ''}
    <div class="linha"><button class="btn marca" id="gravarc">Gravar no portal</button><button class="btn sec" id="cancelarc">Descartar prévia</button></div>
    <div id="progc"></div></section>`;
  $('#cancelarc').onclick = () => { S.cartPrev = null; vCarteira(); };
  $('#gravarc').onclick = gravarCarteira;
}

async function gravarCarteira() {
  const p = S.cartPrev;
  $('#gravarc').disabled = true; $('#cancelarc').disabled = true;
  const prog = $('#progc');
  const passo = (t, pct) => prog.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px">${t}</span><div class="barra"><i style="width:${pct}%"></i></div></div>`;
  try {
    passo('Guardando o arquivo original…', 2);
    const path = `carteira/${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safeName(p.file.name)}`;
    const up = await sb.storage.from('importacoes').upload(path, p.file, { upsert: false });
    if (up.error) throw new Error('Arquivo original: ' + up.error.message);
    const lidas = Object.values(p.porAba).reduce((a, s) => a + s.lidas, 0);
    const imp = await q(sb.from('carteira_importacoes').insert({ arquivo: p.file.name, arquivo_path: path, linhas_lidas: lidas, linhas_gravadas: p.movimentos.length, linhas_com_alerta: p.movimentos.filter(m => m.alerta).length }).select().single());
    let novas = 0; const LOTE = 1000;
    for (let i = 0; i < p.movimentos.length; i += LOTE) {
      passo(`Gravando ${fmtN(i + 1)} a ${fmtN(Math.min(i + LOTE, p.movimentos.length))} de ${fmtN(p.movimentos.length)}…`, 5 + 92 * i / p.movimentos.length);
      const lote = p.movimentos.slice(i, i + LOTE).map(m => ({ ...m, importacao_id: imp.id }));
      const ins = await q(sb.from('carteira_movimentos').upsert(lote, { onConflict: 'chave', ignoreDuplicates: true }).select('id'));
      novas += ins.length;
    }
    await q(sb.from('carteira_importacoes').update({ linhas_novas: novas }).eq('id', imp.id));
    S.cartPrev = null;
    $('#prevc').innerHTML = `<div class="msg ok">Planilha gravada: ${fmtN(novas)} movimentos novos (${fmtN(p.movimentos.length - novas)} já estavam no portal).</div>`;
    await carteiraResumo();
  } catch (e) {
    prog.innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. O que já foi gravado fica; pode subir de novo que as linhas repetidas são ignoradas.</div>`;
    $('#gravarc').disabled = false; $('#cancelarc').disabled = false;
  }
}

// ---------- Passo 4: Liberar competência ----------
async function vCompetencias() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Liberar competência</h1><p>Depois de importar o Umov do mês, libere a competência para os parceiros baixarem o relatório e enviarem a versão deles. Dá para bloquear de novo enquanto a competência estiver aberta.</p></div></div><div id="lista" class="carregando">Carregando…</div><div id="evt"></div>`;
  const [imps, evts] = await Promise.all([
    q(sb.from('umov_importacoes').select('competencia_id,linhas,importado_em').eq('status', 'ativa')),
    q(sb.from('competencia_eventos').select('*').order('feito_em', { ascending: false }).limit(20)),
  ]);
  const impDe = id => imps.find(i => i.competencia_id === id);
  $('#lista').outerHTML = `<section class="bloco"><div class="tabela"><table>
    <thead><tr><th>Competência</th><th>Situação</th><th>Base do Umov</th><th>Parceiros</th><th></th></tr></thead>
    <tbody>${S.comps.map(c => {
      const i = impDe(c.id); const aberta = c.status === 'aberta';
      return `<tr><td><b>${nomeMes(c.mes)}</b></td>
        <td><span class="pill ${aberta ? 'marca' : ''}">${aberta ? 'Aberta' : 'Fechada'}</span></td>
        <td>${i ? `${fmtN(i.linhas)} linhas · ${fmtD(i.importado_em)}` : (aberta ? '<span class="pill alerta">não importada</span>' : '—')}</td>
        <td>${c.liberada_parceiros ? `Liberada em ${fmtDH(c.liberada_em)}` : (aberta ? 'Bloqueada' : '—')}</td>
        <td>${aberta ? (c.liberada_parceiros
          ? `<button class="btn sec peq" data-acao="bloquear" data-id="${c.id}">Bloquear</button>`
          : `<button class="btn peq" data-acao="liberar" data-id="${c.id}" ${i ? '' : 'disabled title="Importe o Umov antes"'}>Liberar</button>`) : ''}</td></tr>
        <tr id="conf-${c.id}" hidden><td colspan="5"></td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  $('#evt').innerHTML = evts.length ? `<section class="bloco"><h2>Registro</h2><div class="tabela"><table><thead><tr><th>Quando</th><th>Competência</th><th>O que aconteceu</th></tr></thead><tbody>
    ${evts.map(e => `<tr><td>${fmtDH(e.feito_em)}</td><td>${nomeMes(S.comps.find(c => c.id === e.competencia_id)?.mes)}</td><td>${e.evento === 'liberada' ? 'Liberada aos parceiros' : 'Bloqueada para os parceiros'}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  app.querySelectorAll('[data-acao]').forEach(b => b.onclick = () => {
    const c = S.comps.find(x => x.id === b.dataset.id); const lib = b.dataset.acao === 'liberar';
    const tr = $(`#conf-${c.id}`); tr.hidden = false;
    tr.firstElementChild.innerHTML = `<div class="confirma">${lib
      ? `Liberar <b>${nomeMes(c.mes)}</b>? Os parceiros passam a ver a competência e podem baixar o relatório e enviar a versão deles.`
      : `Bloquear <b>${nomeMes(c.mes)}</b>? Os parceiros deixam de poder enviar até você liberar de novo. Nada do que já foi enviado é apagado.`}
      <div class="linha"><button class="btn ${lib ? 'marca' : ''} peq" id="ok-${c.id}">${lib ? 'Confirmar liberação' : 'Confirmar bloqueio'}</button><button class="btn sec peq" id="nao-${c.id}">Cancelar</button></div></div>`;
    $(`#nao-${c.id}`).onclick = () => { tr.hidden = true; };
    $(`#ok-${c.id}`).onclick = async () => {
      try {
        await q(sb.rpc('liberar_competencia', { p_comp: c.id, p_liberar: lib }));
        await carregarBase(); vCompetencias();
      } catch (e) { alertaTopo(e.message); }
    };
  });
}

// Busca todas as linhas (o banco devolve no máximo 1000 por vez)
async function todas(montar) {
  const out = []; const P = 1000;
  for (let i = 0; ; i += P) {
    const lote = await q(montar().range(i, i + P - 1));
    out.push(...lote);
    if (lote.length < P) return out;
  }
}
const regiaoMap = () => { const m = {}; S.parceiros.forEach(p => m[norm(p.regiao)] = p.id); return m; };

// ---------- Pontos do mês (aba Atendimentos) ----------
async function vPontos() {
  const m = $('#main');
  m.innerHTML = `
    <div class="topo"><div><h1>Pontos do mês</h1><p>Suba a planilha de fechamento do mês. O portal lê a aba Atendimentos (cliente, código, loja, cidade, frequência, previsto e V. Unit) e liga cada ponto ao parceiro pela coluna Região. É essa lista que vai no modelo de cada parceiro.</p></div>${seletorComp()}</div>
    <div id="pativa"></div>
    ${zonaArquivo('arqp', 'Arraste a planilha de fechamento ou clique para escolher', 'Excel (.xlsx) com a aba Atendimentos', '.xlsx,.xlsm')}
    <div id="prevp"></div><div id="porparc"></div>`;
  ligarSeletor(vPontos);
  ligarZona('arqp', previaPontos);
  await pontosAtiva();
  if (S.pontosPrev) desenharPreviaPontos();
}

async function pontosAtiva() {
  const hist = await q(sb.from('pontos_importacoes').select('*').eq('competencia_id', S.compId).order('importado_em', { ascending: false }));
  const ativa = hist.find(h => h.status === 'ativa');
  $('#pativa').innerHTML = ativa
    ? `<div class="msg ok">Pontos ativos de ${nomeMes(comp().mes)}: <b>${esc(ativa.arquivo)}</b>, importados em ${fmtDH(ativa.importado_em)} · ${fmtN(ativa.pontos)} pontos.</div>`
    : `<div class="msg alerta">${nomeMes(comp().mes)} ainda não tem pontos importados. Sem eles o parceiro não consegue baixar o modelo.</div>`;
  if (!ativa) { $('#porparc').innerHTML = ''; return; }
  const pts = await todas(() => sb.from('pontos').select('parceiro_id,v_unit,previsto').eq('importacao_id', ativa.id));
  const g = {}; pts.forEach(p => { const x = g[p.parceiro_id] || (g[p.parceiro_id] = { n: 0, prev: 0, unit: 0 }); x.n++; x.prev += p.previsto || 0; if (Number(p.v_unit) > 0) x.unit++; });
  const lin = Object.entries(g).sort((a, b) => b[1].n - a[1].n);
  $('#porparc').innerHTML = `<section class="bloco"><h2>Pontos por parceiro</h2><div class="tabela"><table>
    <thead><tr><th>Parceiro</th><th class="n">Pontos</th><th class="n">Atend. previstos</th><th class="n">Com V. Unit</th></tr></thead>
    <tbody>${lin.map(([id, x]) => `<tr><td>${esc(parcNome(id))}</td><td class="n">${fmtN(x.n)}</td><td class="n">${fmtN(x.prev)}</td><td class="n">${fmtN(x.unit)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

async function previaPontos(file) {
  $('#prevp').innerHTML = '<div class="carregando">Lendo a planilha (arquivos grandes levam alguns segundos)…</div>';
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', sheets: ['Atendimentos'], dense: true });
    const ws = wb.Sheets['Atendimentos'];
    if (!ws) { $('#prevp').innerHTML = '<div class="msg erro">Não encontrei a aba "Atendimentos" nesse arquivo.</div>'; return; }
    const ult = XLSX.utils.decode_range(ws['!ref']).e.r + 1;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: `A1:Q${ult}` });
    const r = parseAtendimentos(rows, regiaoMap());
    if (r.erro) { $('#prevp').innerHTML = `<div class="msg erro">${esc(r.erro)}</div>`; return; }
    S.pontosPrev = { file, ...r };
    desenharPreviaPontos();
  } catch (e) { $('#prevp').innerHTML = `<div class="msg erro">Não consegui ler a planilha: ${esc(e.message)}</div>`; }
}

function desenharPreviaPontos() {
  const p = S.pontosPrev; const c = comp();
  const parcs = new Set(p.pontos.map(x => x.parceiro_id)).size;
  const sem = Object.entries(p.semRegiao);
  const ativaTxt = $('#pativa').textContent.startsWith('Pontos ativos');
  $('#prevp').innerHTML = `<section class="bloco"><h2>Prévia: ${esc(p.file.name)}</h2><p class="sub">Nada foi gravado ainda.</p>
    <div class="kpis">
      <div class="kpi"><small>Pontos</small><b>${fmtN(p.pontos.length)}</b><span>cabeçalho na linha ${p.cabecalho}</span></div>
      <div class="kpi"><small>Parceiros</small><b>${fmtN(parcs)}</b><span>pela coluna Região</span></div>
      <div class="kpi neutro"><small>Atend. previstos</small><b>${fmtN(p.pontos.reduce((a, x) => a + (x.previsto || 0), 0))}</b><span>coluna Qtd atend.</span></div>
      <div class="kpi ${sem.length ? 'alerta' : 'neutro'}"><small>Região sem parceiro</small><b>${fmtN(sem.reduce((a, x) => a + x[1], 0))}</b><span>${sem.length ? sem.length + ' regiões' : 'todas reconhecidas'}</span></div>
      <div class="kpi ${p.duplicados || p.semCodigo ? 'alerta' : 'neutro'}"><small>Não entram</small><b>${fmtN(p.duplicados + p.semCodigo)}</b><span>${fmtN(p.duplicados)} repetidos · ${fmtN(p.semCodigo)} sem código</span></div>
    </div>
    ${sem.length ? `<div class="msg alerta">Estas regiões não batem com nenhum parceiro do cadastro e ficam de fora: ${sem.map(([r, n]) => `${esc(r)} (${n})`).join(', ')}.</div>` : ''}
    ${ativaTxt ? `<div class="confirma"><b>Já existem pontos ativos para ${nomeMes(c.mes)}.</b> Os novos passam a valer e os anteriores ficam guardados.
      <label class="linha"><input type="checkbox" id="cientep"> Entendi, quero substituir.</label></div>` : ''}
    <div class="linha"><button class="btn marca" id="gravarp" ${ativaTxt ? 'disabled' : ''}>Gravar no portal</button><button class="btn sec" id="cancelarp">Descartar prévia</button></div>
    <div id="progp"></div></section>`;
  if (ativaTxt) $('#cientep').onchange = e => $('#gravarp').disabled = !e.target.checked;
  $('#cancelarp').onclick = () => { S.pontosPrev = null; vPontos(); };
  $('#gravarp').onclick = gravarPontos;
}

async function gravarPontos() {
  const p = S.pontosPrev, c = comp();
  $('#gravarp').disabled = true; $('#cancelarp').disabled = true;
  const prog = $('#progp');
  const passo = (t, pct) => prog.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px">${t}</span><div class="barra"><i style="width:${pct}%"></i></div></div>`;
  let impId = null;
  try {
    passo('Guardando o arquivo original…', 2);
    const path = `pontos/${c.mes.slice(0, 7)}/${Date.now()}_${safeName(p.file.name)}`;
    const up = await sb.storage.from('importacoes').upload(path, p.file, { upsert: false });
    if (up.error) throw new Error('Arquivo original: ' + up.error.message);
    const sem = Object.values(p.semRegiao).reduce((a, n) => a + n, 0);
    const imp = await q(sb.from('pontos_importacoes').insert({ competencia_id: c.id, arquivo: p.file.name, arquivo_path: path, linhas_lidas: p.pontos.length + sem + p.duplicados + p.semCodigo, sem_parceiro: sem, duplicados: p.duplicados }).select().single());
    impId = imp.id;
    const L = 1000;
    for (let i = 0; i < p.pontos.length; i += L) {
      passo(`Gravando pontos ${fmtN(i + 1)} a ${fmtN(Math.min(i + L, p.pontos.length))} de ${fmtN(p.pontos.length)}…`, 5 + 90 * i / p.pontos.length);
      await q(sb.from('pontos').insert(p.pontos.slice(i, i + L).map(x => ({ ...x, competencia_id: c.id, importacao_id: impId }))));
    }
    await q(sb.rpc('ativar_importacao_pontos', { p_id: impId }));
    S.pontosPrev = null;
    $('#prevp').innerHTML = `<div class="msg ok">Pontos de ${nomeMes(c.mes)} gravados: ${fmtN(p.pontos.length)}.</div>`;
    await pontosAtiva();
  } catch (e) {
    if (impId) await sb.from('pontos_importacoes').update({ status: 'falhou', observacao: e.message.slice(0, 200) }).eq('id', impId);
    prog.innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. Os pontos ativos anteriores (se havia) continuam valendo.</div>`;
    $('#gravarp').disabled = false; $('#cancelarp').disabled = false;
  }
}

// ---------- Acessos e convites ----------
async function vAcessos() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Acessos e convites</h1><p>Gere um código para cada parceiro e envie junto com o endereço do portal. No primeiro acesso ele informa o e-mail, o código e escolhe a senha. O código vale uma vez e trava após 5 tentativas erradas. Gerar de novo substitui o código anterior.</p></div></div>
    <div id="acs" class="carregando">Carregando…</div>`;
  const [parcs, conv] = await Promise.all([
    q(sb.from('parceiros').select('id,codigo,regiao,nome,email_contato,ativo').eq('ativo', true).order('codigo')),
    q(sb.from('convites_lista').select('*')),
  ]);
  const deParc = id => conv.filter(c => c.parceiro_id === id).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
  const internos = conv.filter(c => c.papel !== 'parceiro');
  $('#acs').outerHTML = `
  <section class="bloco"><h2>Diretoria, financeiro e administradores</h2>
    <div class="linha">
      <input type="email" id="int-email" placeholder="e-mail" style="flex:1 1 240px">
      <input type="text" id="int-nome" placeholder="nome" style="flex:1 1 180px">
      <select id="int-papel" style="flex:0 1 180px"><option value="diretoria">Diretoria (consulta)</option><option value="financeiro">Financeiro (consulta)</option><option value="admin">Administrador</option></select>
      <button class="btn" id="int-gerar">Gerar código</button>
    </div><div id="int-cod"></div>
    ${internos.length ? `<div class="tabela"><table><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Situação</th></tr></thead><tbody>
      ${internos.map(c => `<tr><td>${esc(c.email)}</td><td>${esc(c.nome || '')}</td><td>${esc(c.papel)}</td><td>${c.usado ? `<span class="pill escuro">Acesso criado ${fmtD(c.usado_em)}</span>` : '<span class="pill alerta">Convite pendente</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>
  <section class="bloco"><h2>Parceiros</h2>
    <div class="tabela"><table><thead><tr><th>Parceiro</th><th>E-mail de acesso</th><th>Situação</th><th></th></tr></thead><tbody>
    ${parcs.map(p => { const c = deParc(p.id); return `<tr><td>${esc(p.codigo + ' · ' + p.regiao)}<br><span style="font-size:12px;color:var(--muted)">${esc(p.nome)}</span></td>
      <td><input type="email" class="peq" id="em-${p.id}" value="${esc(c?.email || p.email_contato || '')}" placeholder="e-mail do parceiro" style="min-height:38px;font-size:14px;width:100%" ${c?.usado ? 'disabled' : ''}></td>
      <td id="st-${p.id}">${c ? (c.usado ? `<span class="pill escuro">Acesso criado ${fmtD(c.usado_em)}</span>` : `<span class="pill alerta">Convite pendente</span>${c.tentativas ? ` <span class="nota">${c.tentativas} tentativa(s) errada(s)</span>` : ''}`) : '<span class="pill">Sem convite</span>'}</td>
      <td>${c?.usado ? '' : `<button class="btn peq" data-p="${p.id}">${c ? 'Gerar novo código' : 'Gerar código'}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
  const mostrarCodigo = (alvo, email, cod) => {
    const link = location.origin + location.pathname;
    const texto = `Portal de Fechamento GSM\n${link}\nPrimeiro acesso: e-mail ${email} e código ${cod}`;
    alvo.innerHTML = `<div class="confirma" style="margin-top:8px"><b>Código de ${esc(email)}: <span class="num" style="font-size:18px;letter-spacing:.12em">${esc(cod)}</span></b>
      <span>Ele aparece só agora. Copie e envie ao destinatário.</span>
      <textarea readonly style="font:inherit;font-size:13px;min-height:70px;padding:8px;border:1px solid var(--rule);border-radius:6px">${esc(texto)}</textarea>
      <div><button class="btn peq">Copiar mensagem</button></div></div>`;
    const ta = alvo.querySelector('textarea');
    alvo.querySelector('button').onclick = async () => { try { await navigator.clipboard.writeText(texto); alvo.querySelector('button').textContent = 'Copiado'; } catch (e) { ta.select(); } };
  };
  $('#int-gerar').onclick = async () => {
    const email = $('#int-email').value.trim(); if (!email.includes('@')) return alertaTopo('Informe um e-mail válido.');
    try { const cod = await q(sb.rpc('criar_convite', { p_email: email, p_papel: $('#int-papel').value, p_nome: $('#int-nome').value.trim() || null })); mostrarCodigo($('#int-cod'), email, cod); }
    catch (e) { alertaTopo(e.message); }
  };
  app.querySelectorAll('#main button[data-p]').forEach(b => b.onclick = async () => {
    const id = b.dataset.p; const email = $(`#em-${id}`).value.trim(); const p = parcs.find(x => x.id === id);
    if (!email.includes('@')) return alertaTopo('Informe o e-mail do parceiro antes de gerar o código.');
    b.disabled = true;
    try {
      const cod = await q(sb.rpc('criar_convite', { p_email: email, p_papel: 'parceiro', p_parceiro: id, p_nome: p.nome }));
      const tr = b.closest('tr'); const linha = document.createElement('tr'); linha.innerHTML = '<td colspan="4"></td>'; tr.after(linha);
      mostrarCodigo(linha.firstElementChild, email, cod);
      $(`#st-${id}`).innerHTML = '<span class="pill alerta">Convite pendente</span>';
    } catch (e) { alertaTopo(e.message); } finally { b.disabled = false; }
  });
}

// ---------- Área do parceiro ----------
async function iniciarParceiro() {
  const [parc, comps] = await Promise.all([
    q(sb.from('parceiros').select('*').eq('id', S.perfil.parceiro_id).single()),
    q(sb.from('competencias').select('*').eq('liberada_parceiros', true).order('mes', { ascending: false })),
  ]);
  S.parc = parc; S.compsP = comps; S.compPId = S.compPId || comps[0]?.id;
  telaParceiro();
}

function telaParceiro() {
  const p = S.parc;
  app.innerHTML = `
  <div style="min-height:100vh;display:flex;flex-direction:column">
    <header style="background:var(--ink);color:#fff;border-left:8px solid var(--brand)">
      <div style="max-width:1100px;margin:0 auto;padding:18px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <img src="logo_escuro.png" alt="GSM Log" style="height:34px;width:102px;object-fit:contain">
          <div><div class="eyebrow">Portal do Parceiro</div><div style="font-size:18px;font-weight:600">${esc(p.nome)} · ${esc(p.regiao)}</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;font-size:13px;color:var(--on-dark)"><span>${esc(S.user.email)}</span>
          <button id="sair" style="font:inherit;font-size:13px;color:#fff;background:none;border:1px solid #3A3639;border-radius:6px;padding:8px 12px;cursor:pointer">Sair</button></div>
      </div>
    </header>
    <main id="main" style="max-width:1100px;width:100%;margin:0 auto"></main>
  </div>`;
  $('#sair').onclick = sair;
  vParceiroInicio();
}

async function vParceiroInicio() {
  const m = $('#main');
  if (!S.compsP.length) {
    m.innerHTML = `<div class="bloco"><h2>Nenhum mês liberado</h2><p class="sub" style="margin:0">Assim que a GSM liberar a competência, o modelo do relatório aparece aqui.</p></div>`;
    return;
  }
  const c = S.compsP.find(x => x.id === S.compPId);
  m.innerHTML = `<div class="topo"><div><h1>Relatório de ${nomeMes(c.mes)}</h1><p>Baixe o modelo GSM, que já vem com os seus pontos e os kits que o Umov registrou para você. Confira, complete e envie de volta pelo portal.</p></div>
    <label class="campo" style="min-width:220px">Competência<select id="compP">${S.compsP.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${nomeMes(x.mes)}</option>`).join('')}</select></label></div>
    <div id="pcorpo" class="carregando">Carregando…</div>`;
  $('#compP').onchange = e => { S.compPId = e.target.value; vParceiroInicio(); };
  const [pts, upp, kits, contr] = await Promise.all([
    todas(() => sb.from('pontos_vigentes').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).order('cliente')),
    todas(() => sb.from('umov_por_ponto').select('cod_int,retornadas').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id)),
    todas(() => sb.from('umov_vigente').select('id_umov,grupo_cliente,cliente,cidade,status_gsm,situacao,data_prevista,data_final').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).eq('tipo', 'kit').order('data_prevista')),
    q(sb.from('contratos').select('valor_fixo,inicio,fim').eq('parceiro_id', S.parc.id).order('inicio', { ascending: false }).limit(1)),
  ]);
  const umovPonto = {}; upp.forEach(u => umovPonto[u.cod_int] = u.retornadas);
  const ret = upp.reduce((a, u) => a + u.retornadas, 0);
  const prev = pts.reduce((a, x) => a + (x.previsto || 0), 0);
  $('#pcorpo').outerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Pontos da sua carteira</small><b>${fmtN(pts.length)}</b><span>${fmtN(prev)} atendimentos previstos</span></div>
      <div class="kpi"><small>Malote no Umov</small><b>${fmtN(ret)}</b><span>retornados de campo</span></div>
      <div class="kpi"><small>Kits no Umov</small><b>${fmtN(kits.length)}</b><span>já listados no modelo</span></div>
    </div>
    <section class="bloco"><h2>1. Baixe o modelo do mês</h2>
      <p class="sub">Preencha só as células rosa. O arquivo traz uma aba Resumo com o total que você está informando.</p>
      ${pts.length || kits.length ? `<div><button class="btn marca" id="baixar">Baixar modelo de ${nomeMes(c.mes)}</button></div>` : '<div class="msg alerta">A GSM ainda não carregou os seus pontos deste mês. Tente de novo mais tarde.</div>'}
      <div id="msgb"></div>
    </section>
    <section class="bloco"><h2>2. Envie o relatório preenchido</h2>
      <p class="sub">O envio pelo portal abre na próxima etapa. Quando estiver disponível, o portal confere com o Umov na hora e mostra o que precisa de ajuste.</p>
    </section>`;
  const b = $('#baixar');
  if (b) b.onclick = async () => {
    b.disabled = true; b.textContent = 'Gerando…';
    try {
      const blob = await gerarModelo({ parceiro: S.parc, comp: c, nomeMes: nomeMes(c.mes), pontos: pts, umovPonto, kits, contrato: contr[0] ? Number(contr[0].valor_fixo) : 0 });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `GSM_Relatorio_${S.parc.codigo}_${c.mes.slice(0, 7)}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      $('#msgb').innerHTML = '<div class="msg ok">Modelo baixado. Confira a pasta de downloads.</div>';
    } catch (e) { $('#msgb').innerHTML = `<div class="msg erro">Não foi possível gerar o modelo: ${esc(e.message)}</div>`; }
    finally { b.disabled = false; b.textContent = `Baixar modelo de ${nomeMes(c.mes)}`; }
  };
}

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') telaLogin(); });
iniciar().catch(e => { app.innerHTML = `<div class="carregando">Erro ao iniciar: ${esc(e.message)}</div>`; });
