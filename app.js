// Portal de Fechamento GSM — telas do administrador (passos 1, 2 e 4 do ciclo)
import { decodeText, parseCSV, parseUmov, resumoUmov, parseCarteira, parseAtendimentos, parseHistorico, parseRelatorio, numBR, norm } from './parse.js';
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
  if (S.perfil.ativo === false) return telaSimples('Acesso bloqueado', 'Seu login está bloqueado no portal. Fale com o Fechamento GSM.');
  if (S.perfil.papel === 'parceiro') return iniciarParceiro();
  if (S.perfil.papel === 'diretoria' || S.perfil.papel === 'financeiro') return iniciarConsulta();
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
          <button type="button" data-aba="senha" class="${aba === 'senha' ? 'on' : ''}">Nova senha</button>
        </div>
        ${aba === 'entrar' ? `
          <label class="campo">E-mail<input id="email" type="email" autocomplete="username" required></label>
          <label class="campo">Senha<input id="senha" type="password" autocomplete="current-password" required></label>
          <button class="btn" type="submit">Entrar</button>
          <p class="nota">Esqueceu a senha? Peça à GSM um código e use a aba "Nova senha".</p>
        ` : `
          <p style="margin:0;font-size:14px;color:var(--muted)">${aba === 'senha' ? 'Use o código de nova senha que a GSM enviou (vale 2 dias) e escolha a nova senha' : 'Use o código que a GSM enviou para você e escolha sua senha'} (mínimo de 8 caracteres).</p>
          <label class="campo">E-mail<input id="email" type="email" autocomplete="username" required></label>
          <label class="campo">Código do convite<input id="codigo" type="text" autocomplete="one-time-code" required style="text-transform:uppercase;letter-spacing:.12em"></label>
          <label class="campo">Nova senha<input id="senha" type="password" autocomplete="new-password" required></label>
          <label class="campo">Repita a senha<input id="senha2" type="password" autocomplete="new-password" required></label>
          <button class="btn marca" type="submit">${aba === 'senha' ? 'Salvar nova senha' : 'Criar meu acesso'}</button>
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
      if (aba === 'primeiro' || aba === 'senha') {
        if (senha !== $('#senha2').value) return erro('As duas senhas não são iguais.');
        if (senha.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
        const r = await fetch(`${SB_URL}/functions/v1/${aba === 'senha' ? 'redefinir-senha' : 'primeiro-acesso'}`, {
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
  ['Base do mês', [['umov', 'Importar Umov'], ['carteira', 'Inclusão e cancelamento'], ['pontos', 'Carteira de pontos'], ['competencias', 'Liberar competência']]],
  ['Parceiros', [['cadastro', 'Parceiros e rotas'], ['conferencia', 'Conferência e aprovação'], ['adiantamentos', 'Adiantamentos'], ['notas', 'Notas fiscais'], ['verparceiro', 'Portal do parceiro (GSM)'], ['acessos', 'Acessos e convites']]],
  ['Acompanhamento', [['diretoria', 'Diretoria e financeiro'], ['historico', 'Histórico por cliente']]],
  ['Financeiro', [['pacote', 'Pacote e pagamento']]],
];
const VIEWS = { painel: () => vPainel(), umov: () => vUmov(), carteira: () => vCarteira(), pontos: () => vPontos(), competencias: () => vCompetencias(), acessos: () => vAcessos(), diretoria: () => vDiretoria($('#main')), historico: () => vHistorico(), conferencia: () => vConferencia(), verparceiro: () => vVerParceiro(), notas: () => vNotas(), cadastro: () => vCadastro(), adiantamentos: () => vAdiantamentos(), pacote: () => vPacote() };

// Admin vê exatamente a tela do parceiro escolhido, só para consulta
async function vVerParceiro() {
  const m = $('#main');
  const ativos = S.parceiros.filter(p => p.ativo !== false);
  S.previaParc = S.previaParc || ativos[0]?.id;
  m.innerHTML = `<div class="topo"><div><h1>Portal do parceiro</h1><p>A mesma tela que o parceiro vê, com os dados dele. Como gestor, você pode baixar o modelo, enviar o relatório e responder itens em nome do parceiro. Tudo fica registrado como feito pela GSM.</p></div>
    <label class="campo" style="min-width:300px">Parceiro<select id="pvp">${ativos.map(p => `<option value="${p.id}" ${p.id === S.previaParc ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select></label></div>
    <div class="msg alerta">Acesso do gestor: você vê todos os meses, inclusive os ainda não liberados para o parceiro.</div>
    <div id="pvcorpo" style="display:flex;flex-direction:column;gap:22px;border:1px dashed var(--rule);border-radius:10px;padding:20px;background:#fff"><div class="carregando">Carregando…</div></div>`;
  $('#pvp').onchange = e => { S.previaParc = e.target.value; S.compPId = null; vVerParceiro(); };
  S.previa = true;
  S.parc = await q(sb.from('parceiros').select('*').eq('id', S.previaParc).single());
  S.compsP = S.comps.slice().sort((a, b) => b.mes.localeCompare(a.mes));
  if (!S.compPId || !S.compsP.some(c => c.id === S.compPId)) S.compPId = (S.compsP.find(c => c.liberada_parceiros) || S.compsP.find(c => c.status === 'aberta') || S.compsP[0])?.id;
  vParceiroInicio();
}

function rotear() {
  const v = (location.hash || '#painel').slice(1);
  S.previa = false;
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
  if (lista.length && !lista.some(c => c.id === S.compId)) { S.compId = lista.slice().sort((a, b) => a.mes.localeCompare(b.mes))[0].id; S.umovPrev = null; }
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
  const [pend, vinc, pendM] = await Promise.all([
    q(sb.from('umov_pendentes_cidade').select('*').eq('importacao_id', ativa.id).order('atendimentos', { ascending: false })),
    q(sb.from('umov_vinculos_resumo').select('*').eq('importacao_id', ativa.id)),
    q(sb.from('umov_pendentes_malote').select('*').eq('importacao_id', ativa.id).order('atendimentos', { ascending: false }).limit(300)),
  ]);
  const cont = {}; vinc.forEach(v => cont[v.vinculo] = v.atendimentos);
  const opts = S.parceiros.filter(p => p.ativo).map(p => `<option value="${p.id}">${esc(p.codigo + ' · ' + p.regiao + ' · ' + p.nome)}</option>`).join('');
  $('#rotas').innerHTML = `<section class="bloco"><h2>Vínculo com parceiros</h2>
    <p class="sub">Malote: o parceiro vem do cadastro de pontos, pelo código de integração. Kits: primeiro a rota do de-para; se a rota não tem parceiro, a cidade (cidade dividida vai para o principal quando ele tem 90% ou mais dos pontos).</p>
    <div class="kpis">
      <div class="kpi"><small>Malote pelo cadastro</small><b>${fmtN(cont.cadastro || 0)}</b><span></span></div>
      <div class="kpi"><small>Kits pela rota</small><b>${fmtN(cont.rota || 0)}</b><span></span></div>
      <div class="kpi"><small>Pela cidade</small><b>${fmtN((cont.cidade || 0) + (cont.cidade_principal || 0))}</b><span>${cont.cidade_principal ? fmtN(cont.cidade_principal) + ' pelo parceiro principal' : ''}</span></div>
      <div class="kpi neutro"><small>Manual</small><b>${fmtN(cont.manual || 0)}</b><span></span></div>
      <div class="kpi neutro"><small>Base própria GSM</small><b>${fmtN(cont.base_propria || 0)}</b><span>SP, RJ e rotas próprias</span></div>
      <div class="kpi ${pend.length ? 'alerta' : 'neutro'}"><small>Pendentes</small><b>${fmtN(pend.reduce((a, r) => a + r.atendimentos, 0))}</b><span>${pend.length ? pend.length + ' cidades' : 'nenhum'}</span></div>
    </div>
    ${pendM.length ? `<h2 style="font-size:15px;margin-top:6px">Malote com código fora da carteira</h2>
    <p class="sub" style="margin:0">Pontos que o Umov atendeu e não estão no cadastro. Escolha o parceiro para cadastrar, ou "Base própria GSM" para pontos da rota própria (não entram no pagamento de parceiros). Os demais dados vêm do Umov e podem ser completados na Carteira de pontos.</p>
    <div class="tabela"><table><thead><tr><th>Código</th><th>Cliente no Umov</th><th>Cidade</th><th class="n">Atend.</th><th>Parceiro</th><th></th></tr></thead><tbody>
    ${pendM.map((r, i) => `<tr><td class="num">${esc(r.cod_int || '(sem código)')}</td><td style="font-size:13px">${esc(r.cliente || '')}</td><td style="font-size:13px">${esc(r.cidade || '')}</td><td class="n">${fmtN(r.atendimentos)}</td>
      <td><select class="peq" id="selm${i}" ${r.cod_int ? '' : 'disabled'}><option value="">Escolha…</option><option value="__bp">Base própria GSM (rota própria)</option>${opts}</select></td>
      <td>${r.cod_int ? `<button class="btn peq" data-m="${i}">Cadastrar ponto</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${(() => { const rc = {}; pendM.forEach(r => (r.rotas || '').split(', ').filter(Boolean).forEach(x => rc[x] = (rc[x] || 0) + r.atendimentos));
      const lst = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 30);
      return lst.length ? `<p class="sub" style="margin:4px 0 0">Se o atendimento é de uma base própria da GSM (SP ou RJ), marque a rota. Os pontos dessa rota fora da carteira deixam de aparecer como pendentes.</p>
        <div class="linha">${lst.map(([r, n]) => `<span class="pill" style="display:inline-flex;gap:8px;align-items:center;padding:4px 6px 4px 10px">${esc(r)} · ${fmtN(n)} atend. <button class="btn sec peq" style="min-height:28px;padding:2px 8px" data-bp="${esc(r)}">Base própria</button></span>`).join('')}</div>` : ''; })()}` : ''}
    ${pend.length ? `<h2 style="font-size:15px;margin-top:6px">Kits sem parceiro</h2><p class="sub" style="margin:0">Cidades que nenhum parceiro atende na base. Ao vincular, a cidade fica salva para os próximos meses.</p>
    <div class="tabela"><table><thead><tr><th>Cidade</th><th>Rotas no Umov</th><th class="n">Atend.</th><th>Parceiro</th><th></th></tr></thead><tbody>
    ${pend.map((r, i) => `<tr><td>${esc(r.cidade_norm || '(sem cidade)')}${r.uf_norm ? ' - ' + esc(r.uf_norm) : ''}</td><td style="font-size:13px;color:var(--muted)">${esc(r.rotas)}</td><td class="n">${fmtN(r.atendimentos)}</td>
      <td><select class="peq" id="sel${i}"><option value="">Escolha…</option>${opts}</select></td>
      <td><button class="btn peq" data-i="${i}">Vincular cidade</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
  app.querySelectorAll('#rotas button[data-bp]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await q(sb.rpc('vincular_rota', { p_rota: b.dataset.bp, p_parceiro: null, p_base_propria: true }));
      await q(sb.rpc('vincular_por_cidade', { p_importacao: ativa.id }));
      await umovAtivaEHist();
    } catch (e) { b.disabled = false; alertaTopo(e.message); }
  });
  app.querySelectorAll('#rotas button[data-m]').forEach(b => b.onclick = async () => {
    const r = pendM[+b.dataset.m], v = $(`#selm${b.dataset.m}`).value;
    if (!v) return;
    b.disabled = true;
    try {
      const x = (r.cidade || '').match(/^(.*?)[\s\-]+([A-Za-z]{2})\s*$/);
      const dados = { cod_int: r.cod_int, cliente: r.cliente, cidade: x ? x[1] : r.cidade, uf: r.uf || (x ? x[2].toUpperCase() : null) };
      if (v === '__bp') await q(sb.rpc('marcar_ponto_base_propria', { p: dados, p_motivo: 'Cadastrado a partir do Umov como base própria' }));
      else await q(sb.rpc('salvar_ponto', { p: { ...dados, parceiro_id: v }, p_motivo: 'Cadastrado a partir do Umov' }));
      await umovAtivaEHist();
    } catch (e) { b.disabled = false; alertaTopo(e.message); }
  });
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

function alertaOk(t) { const d = document.createElement('div'); d.className = 'msg ok'; d.textContent = t; $('#main').prepend(d); }
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
    passo('Atualizando a carteira de pontos…', 98);
    const ap = await q(sb.rpc('aplicar_movimentos_cadastro'));
    prog.innerHTML = '';
    $('#prevc').innerHTML = `<div class="msg ok">Planilha gravada: ${fmtN(novas)} movimentos novos (${fmtN(p.movimentos.length - novas)} já estavam no portal).<br>Carteira de pontos atualizada: ${fmtN(ap.novos)} pontos novos, ${fmtN(ap.situacao)} mudanças de situação (ativo, cancelado, suspenso) e ${fmtN(ap.frequencia)} de frequência. ${ap.pendencias ? `${fmtN(ap.pendencias)} pontos com pendência (sem parceiro ou sem preço) para completar em <a href="#pontos">Carteira de pontos</a>.` : ''}</div>`;
    await carteiraResumo();
  } catch (e) {
    prog.innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. O que já foi gravado fica; pode subir de novo que as linhas repetidas são ignoradas.</div>`;
    $('#gravarc').disabled = false; $('#cancelarc').disabled = false;
  }
}

// ---------- Passo 4: Liberar competência ----------
async function vCompetencias() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Liberar competência</h1><p>Para liberar, o mês precisa ter a base de pontos gerada (a partir da Carteira de pontos). O Umov entra quando o mês termina e não impede a liberação. Dá para bloquear de novo enquanto a competência estiver aberta.</p></div></div><div id="lista" class="carregando">Carregando…</div><div id="evt"></div>`;
  const [imps, bases, evts] = await Promise.all([
    q(sb.from('umov_importacoes').select('competencia_id,linhas,importado_em').eq('status', 'ativa')),
    q(sb.from('pontos_importacoes').select('competencia_id,pontos,importado_em').eq('status', 'ativa')),
    q(sb.from('competencia_eventos').select('*').order('feito_em', { ascending: false }).limit(20)),
  ]);
  const impDe = id => imps.find(i => i.competencia_id === id); const baseDe = id => bases.find(i => i.competencia_id === id);
  $('#lista').outerHTML = `<section class="bloco"><div class="tabela"><table>
    <thead><tr><th>Competência</th><th>Situação</th><th>Base de pontos</th><th>Umov</th><th>Parceiros</th><th></th></tr></thead>
    <tbody>${S.comps.map(c => {
      const i = impDe(c.id); const bs = baseDe(c.id); const aberta = c.status === 'aberta';
      return `<tr><td><b>${nomeMes(c.mes)}</b></td>
        <td><span class="pill ${aberta ? 'marca' : ''}">${aberta ? 'Aberta' : 'Fechada'}</span></td>
        <td>${bs ? `${fmtN(bs.pontos)} pontos · ${fmtD(bs.importado_em)}` : (aberta ? `<button class="btn sec peq" data-gerar="${c.id}">Gerar base do mês</button>` : '—')}</td>
        <td>${i ? `${fmtN(i.linhas)} linhas · ${fmtD(i.importado_em)}` : (aberta ? '<span class="nota">entra no fim do mês</span>' : '—')}</td>
        <td>${c.liberada_parceiros ? `Liberada em ${fmtDH(c.liberada_em)}` : (aberta ? 'Bloqueada' : '—')}</td>
        <td>${aberta ? (c.liberada_parceiros
          ? `<button class="btn sec peq" data-acao="bloquear" data-id="${c.id}">Bloquear</button>`
          : `<button class="btn peq" data-acao="liberar" data-id="${c.id}" ${bs ? '' : 'disabled title="Gere a base do mês antes"'}>Liberar</button>`) : ''}</td></tr>
        <tr id="conf-${c.id}" hidden><td colspan="6"></td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  $('#evt').innerHTML = evts.length ? `<section class="bloco"><h2>Registro</h2><div class="tabela"><table><thead><tr><th>Quando</th><th>Competência</th><th>O que aconteceu</th></tr></thead><tbody>
    ${evts.map(e => `<tr><td>${fmtDH(e.feito_em)}</td><td>${nomeMes(S.comps.find(c => c.id === e.competencia_id)?.mes)}</td><td>${({ liberada: 'Liberada aos parceiros', bloqueada: 'Bloqueada para os parceiros', fechada: 'Competência fechada' })[e.evento] || esc(e.evento)}${e.detalhe ? ` <span class="nota">${esc(e.detalhe)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  app.querySelectorAll('[data-gerar]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = 'Gerando…';
    try { const r = await q(sb.rpc('gerar_base_mes', { p_comp: b.dataset.gerar })); await vCompetencias(); alertaOk(`Base gerada: ${fmtN(r.pontos)} pontos.${r.sem_parceiro ? ` ${fmtN(r.sem_parceiro)} pontos ativos ficaram de fora por não ter parceiro — complete em Carteira de pontos e gere de novo.` : ''}`); }
    catch (e) { b.disabled = false; b.textContent = 'Gerar base do mês'; alertaTopo(e.message); }
  });
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

// ---------- Carteira de pontos (cadastro permanente) ----------
async function vPontos() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Carteira de pontos</h1><p>O cadastro de pontos fica no portal: cliente, loja, cidade, frequência, parceiro e valor unitário. Ele é atualizado pela planilha de inclusão e cancelamento e pelos seus ajustes, e todo mês o portal gera a base de pontos a partir dele.</p></div>${seletorComp()}</div>
    <div id="cart-corpo" class="carregando">Carregando…</div>`;
  ligarSeletor(vPontos);
  let res = await q(sb.from('cadastro_resumo').select('*'));
  const tot = res.reduce((a, r) => a + r.pontos, 0);
  if (!tot) return cargaInicial();
  // a carteira acompanha sempre a última planilha de inclusão e cancelamento (a rotina não duplica nada)
  try { const ap = await q(sb.rpc('aplicar_movimentos_cadastro')); if (ap.novos || ap.situacao || ap.frequencia) { S.apAuto = ap; res = await q(sb.from('cadastro_resumo').select('*')); } } catch (e) { /* segue com o que existe */ }
  const g = k => res.find(r => r.situacao === k) || { pontos: 0, pendencias: 0, parceiros: 0 };
  const [hist, ult] = await Promise.all([
    q(sb.from('pontos_importacoes').select('*').eq('competencia_id', S.compId).eq('status', 'ativa').maybeSingle()),
    q(sb.from('carteira_importacoes').select('importado_em').order('importado_em', { ascending: false }).limit(1)),
  ]);
  const c = comp();
  $('#cart-corpo').outerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Pontos ativos</small><b>${fmtN(g('Ativo').pontos)}</b><span>${fmtN(g('Ativo').parceiros)} parceiros</span></div>
      <div class="kpi neutro"><small>Cancelados</small><b>${fmtN(g('Cancelado').pontos)}</b><span></span></div>
      <div class="kpi neutro"><small>Suspensos</small><b>${fmtN(g('Suspenso').pontos)}</b><span></span></div>
      <div class="kpi ${g('Ativo').pendencias ? 'alerta' : 'neutro'}"><small>Pendências</small><b>${fmtN(g('Ativo').pendencias)}</b><span>pontos ativos sem parceiro, preço ou dia</span></div>
    </div>
    <section class="bloco"><h2>Rotina do mês</h2>
      <div class="linha" style="align-items:flex-start">
        <div style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px">
          <b>1. Aplicar inclusões e cancelamentos</b>
          <span class="sub" style="margin:0">Leva para o cadastro os movimentos da última planilha importada${ult[0] ? ` (${fmtD(ult[0].importado_em)})` : ''}: pontos novos, cancelamentos, suspensões, reativações e mudanças de frequência.</span>
          <div><button class="btn sec" id="aplicar">Aplicar movimentos</button></div><div id="msg-aplicar"></div>
        </div>
        <div style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px">
          <b>2. Gerar a base de ${nomeMes(c.mes)}</b>
          <span class="sub" style="margin:0">${hist ? `Base atual: ${esc(hist.arquivo)}, ${fmtDH(hist.importado_em)} · ${fmtN(hist.pontos)} pontos. Gerar de novo substitui (a anterior fica guardada).` : 'Ainda não há base para este mês.'} O previsto é calculado pela frequência, pelos dias úteis do mês (sem feriados) e pelas datas de entrada e saída de cada ponto.</span>
          <div><button class="btn marca" id="gerar">Gerar base de ${nomeMes(c.mes)}</button></div><div id="msg-gerar"></div>
        </div>
      </div>
    </section>
    <section class="bloco"><h2>Pendências</h2><div id="pend" class="carregando">Carregando…</div></section>
    <section class="bloco"><h2>Buscar e ajustar pontos</h2>
      <div class="linha">
        <input type="text" id="busca" placeholder="Cliente, loja, cidade ou código" style="flex:2 1 260px">
        <select id="fparc" style="flex:1 1 220px"><option value="">Todos os parceiros</option>${S.parceiros.map(p => `<option value="${p.id}">${esc(p.codigo + ' · ' + p.regiao)}</option>`).join('')}</select>
        <select id="fsit" style="flex:0 1 150px"><option value="">Todas</option><option>Ativo</option><option>Cancelado</option><option>Suspenso</option></select>
        <button class="btn sec" id="buscar">Buscar</button><button class="btn sec" id="novo">Novo ponto</button>
      </div>
      <div id="res"></div>
    </section>`;
  if (S.apAuto) { const r = S.apAuto; S.apAuto = null; $('#msg-aplicar').innerHTML = `<div class="msg ok">Carteira atualizada pela última planilha de inclusão e cancelamento: ${fmtN(r.novos)} pontos novos, ${fmtN(r.situacao)} mudanças de situação e ${fmtN(r.frequencia)} de frequência. ${fmtN(r.pendencias)} pendências para revisar.</div>`; }
  $('#aplicar').onclick = async e => {
    e.target.disabled = true;
    try { const r = await q(sb.rpc('aplicar_movimentos_cadastro')); $('#msg-aplicar').innerHTML = `<div class="msg ok">${fmtN(r.novos)} pontos novos, ${fmtN(r.situacao)} mudanças de situação e ${fmtN(r.frequencia)} de frequência. ${fmtN(r.pendencias)} pendências para revisar.</div>`; carregarPend(); }
    catch (er) { $('#msg-aplicar').innerHTML = `<div class="msg erro">${esc(er.message)}</div>`; } finally { e.target.disabled = false; }
  };
  $('#gerar').onclick = async e => {
    e.target.disabled = true;
    try { const r = await q(sb.rpc('gerar_base_mes', { p_comp: S.compId })); $('#msg-gerar').innerHTML = `<div class="msg ok">Base de ${nomeMes(c.mes)} gerada: ${fmtN(r.pontos)} pontos.${r.sem_parceiro ? ` ${fmtN(r.sem_parceiro)} pontos ativos ficaram de fora por não ter parceiro.` : ''}</div>`; }
    catch (er) { $('#msg-gerar').innerHTML = `<div class="msg erro">${esc(er.message)}</div>`; } finally { e.target.disabled = false; }
  };
  $('#buscar').onclick = buscarPontos;
  $('#busca').onkeydown = e => { if (e.key === 'Enter') buscarPontos(); };
  $('#novo').onclick = () => { $('#res').innerHTML = `<div class="tabela"><table><tbody>${linhaPonto({ cod_int: '', situacao: 'Ativo' }, true)}</tbody></table></div>`; ligarLinhas(); };
  carregarPend();
}

const optsParc = (sel, bp) => `<option value="">Sem parceiro</option><option value="__bp" ${bp ? 'selected' : ''}>Base própria GSM (rota própria)</option>` + S.parceiros.filter(p => p.ativo || p.id === sel).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.codigo + ' · ' + p.regiao)}</option>`).join('');
function linhaPonto(p, novo = false) {
  const k = novo ? 'novo' : p.cod_int;
  return `<tr data-cod="${esc(k)}">
    <td style="min-width:200px">${novo ? `<input class="peq" data-f="cod_int" placeholder="Código" style="width:120px">` : `<b class="num">${esc(p.cod_int)}</b>`}
      <div><input class="peq" data-f="cliente" value="${esc(p.cliente || '')}" placeholder="Cliente" style="width:200px;margin-top:4px"></div>
      <div><input class="peq" data-f="loja" value="${esc(p.loja || '')}" placeholder="Loja" style="width:200px;margin-top:4px"></div></td>
    <td><input class="peq" data-f="cidade" value="${esc(p.cidade || '')}" placeholder="Cidade" style="width:130px"> <input class="peq" data-f="uf" value="${esc(p.uf || '')}" placeholder="UF" style="width:46px"></td>
    <td><select class="peq" data-f="parceiro_id" style="max-width:210px">${optsParc(p.parceiro_id, p.base_propria)}</select></td>
    <td><input class="peq" data-f="frequencia" value="${esc(p.frequencia || '')}" placeholder="SEG, QUA" style="width:120px"></td>
    <td><input class="peq num" data-f="v_unit" value="${p.v_unit == null ? '' : p.v_unit}" placeholder="R$" style="width:80px"></td>
    <td><select class="peq" data-f="situacao">${['Ativo', 'Cancelado', 'Suspenso'].map(s => `<option ${s === p.situacao ? 'selected' : ''}>${s}</option>`).join('')}</select>
      ${p.pendencia ? `<div><span class="pill alerta" style="margin-top:4px;white-space:normal;max-width:180px">${esc(p.pendencia)}</span></div>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn peq" data-salvar>Salvar</button> ${novo ? '' : '<button class="btn sec peq" data-hist>Histórico</button>'}</td></tr>`;
}
const CAB_PONTOS = '<thead><tr><th>Ponto</th><th>Cidade</th><th>Parceiro</th><th>Frequência</th><th>V. Unit</th><th>Situação</th><th></th></tr></thead>';
function ligarLinhas() {
  document.querySelectorAll('#main [data-salvar]').forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'); const p = {};
    tr.querySelectorAll('[data-f]').forEach(i => { const v = i.value.trim(); p[i.dataset.f] = i.dataset.f === 'v_unit' ? v.replace(',', '.') : v; });
    if (tr.dataset.cod !== 'novo') p.cod_int = tr.dataset.cod;
    b.disabled = true;
    try {
      if (p.parceiro_id === '__bp') { const { parceiro_id, v_unit, ...resto } = p; await q(sb.rpc('salvar_ponto', { p: resto })); await q(sb.rpc('marcar_ponto_base_propria', { p: { cod_int: p.cod_int } })); }
      else await q(sb.rpc('salvar_ponto', { p }));
      b.textContent = 'Salvo'; setTimeout(() => { b.textContent = 'Salvar'; b.disabled = false; }, 1500); carregarPend(); }
    catch (e) { alertaTopo(e.message); b.disabled = false; }
  });
  document.querySelectorAll('#main [data-hist]').forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'); const cod = tr.dataset.cod;
    if (tr.nextElementSibling?.classList.contains('hist')) { tr.nextElementSibling.remove(); return; }
    const h = await q(sb.from('cadastro_pontos_hist').select('*').eq('cod_int', cod).order('feito_em', { ascending: false }).limit(50));
    const nomeP = v => S.parceiros.find(x => x.id === v) ? parcNome(v) : v;
    const linha = document.createElement('tr'); linha.className = 'hist';
    linha.innerHTML = `<td colspan="7" style="background:var(--field)">${h.length ? h.map(x => `<div style="font-size:13px">${fmtDH(x.feito_em)} · <b>${esc(x.campo)}</b>: ${esc(x.campo === 'parceiro_id' ? nomeP(x.de) : x.de ?? '—')} → ${esc(x.campo === 'parceiro_id' ? nomeP(x.para) : x.para ?? '—')} <span class="nota">${esc(x.motivo || '')}</span></div>`).join('') : '<span class="nota">Sem alterações registradas.</span>'}</td>`;
    tr.after(linha);
  });
}
async function carregarPend() {
  const el = $('#pend'); if (!el) return;
  const p = await q(sb.from('cadastro_pontos').select('*').eq('situacao', 'Ativo').not('pendencia', 'is', null).order('cidade').limit(300));
  el.className = '';
  el.innerHTML = p.length ? `<p class="sub" style="margin:0 0 8px">Pontos ativos que precisam de uma decisão. Sem parceiro, o ponto fica fora da base do mês. Sem preço, entra com valor zero. Frequência sem dia (ex.: "1X SEMANA") não gera previsto; informe o dia.</p>
    <div class="tabela"><table>${CAB_PONTOS}<tbody>${p.map(x => linhaPonto(x)).join('')}</tbody></table></div>${p.length === 300 ? '<p class="nota">Mostrando 300.</p>' : ''}` : '<div class="msg ok">Nenhuma pendência.</div>';
  ligarLinhas();
}
async function buscarPontos() {
  const t = $('#busca').value.trim(); let qr = sb.from('cadastro_pontos').select('*').order('cliente').limit(200);
  if (t) qr = qr.or(['cliente', 'loja', 'cidade', 'cod_int'].map(c => `${c}.ilike.*${t.replace(/[,()*]/g, ' ')}*`).join(','));
  if ($('#fparc').value) qr = qr.eq('parceiro_id', $('#fparc').value);
  if ($('#fsit').value) qr = qr.eq('situacao', $('#fsit').value);
  const r = await q(qr);
  $('#res').innerHTML = r.length ? `<div class="tabela"><table>${CAB_PONTOS}<tbody>${r.map(x => linhaPonto(x)).join('')}</tbody></table></div>${r.length === 200 ? '<p class="nota">Mostrando os 200 primeiros. Refine a busca.</p>' : ''}` : '<div class="msg alerta">Nenhum ponto encontrado.</div>';
  ligarLinhas();
}

// Carga inicial: só quando o cadastro está vazio. Usa a planilha de fechamento uma única vez.
function cargaInicial() {
  $('#cart-corpo').outerHTML = `<div class="msg alerta"><b>A carteira ainda está vazia.</b> Faça a carga inicial uma única vez com a planilha de fechamento do mês selecionado (aba Atendimentos). Depois disso, o cadastro passa a ser mantido aqui e não precisa mais subir a planilha.</div>
    <div id="pativa"></div>
    ${zonaArquivo('arqp', 'Arraste a planilha de fechamento ou clique para escolher', 'Excel (.xlsx) com a aba Atendimentos', '.xlsx,.xlsm')}
    <div id="prevp"></div><div id="porparc"></div>`;
  ligarZona('arqp', previaPontos);
  pontosAtiva();
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
    passo('Criando a carteira de pontos…', 98);
    const n = await q(sb.rpc('carga_inicial_cadastro', { p_importacao: impId }));
    S.pontosPrev = null;
    await vPontos();
    alertaOk(`Carteira criada com ${fmtN(n)} pontos a partir da planilha de ${nomeMes(c.mes)}. A base de ${nomeMes(c.mes)} também já está pronta.`);
  } catch (e) {
    if (impId) await sb.from('pontos_importacoes').update({ status: 'falhou', observacao: e.message.slice(0, 200) }).eq('id', impId);
    prog.innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. Os pontos ativos anteriores (se havia) continuam valendo.</div>`;
    $('#gravarp').disabled = false; $('#cancelarp').disabled = false;
  }
}

// ---------- Acessos e convites ----------
const PAPEIS = { admin: 'Administrador', diretoria: 'Diretoria', financeiro: 'Financeiro', parceiro: 'Parceiro' };
const ST_AC = { ativo: ['Ativo', 'escuro'], bloqueado: ['Bloqueado', 'marca'], excluido: ['Excluído', ''], convite: ['Convite pendente', 'alerta'], cancelado: ['Convite cancelado', ''] };
async function vAcessos() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Acessos e convites</h1><p>Todos os logins do portal. Em cada um você pode alterar nome, perfil e parceiro, gerar código de nova senha, bloquear, desbloquear ou excluir. Novos acessos entram por convite: gere o código e envie junto com o endereço do portal.</p></div></div>
    <div id="acs" class="carregando">Carregando…</div>`;
  const [parcs, lista, logs] = await Promise.all([
    q(sb.from('parceiros').select('id,codigo,regiao,nome,email_contato,ativo').order('regiao')),
    q(sb.rpc('listar_acessos')),
    q(sb.from('acessos_log').select('*').order('feito_em', { ascending: false }).limit(30)),
  ]);
  const pNome = id => { const p = parcs.find(x => x.id === id); return p ? `${p.regiao} · ${p.nome}` : ''; };
  const comLogin = new Set(lista.filter(l => l.user_id && l.situacao !== 'excluido' && l.parceiro_id).map(l => l.parceiro_id));
  const comConvite = new Set(lista.filter(l => l.situacao === 'convite' && l.parceiro_id).map(l => l.parceiro_id));
  const semAcesso = parcs.filter(p => p.ativo !== false && !comLogin.has(p.id));
  S.acFiltro = S.acFiltro ?? ''; S.acSit = S.acSit || 'todos';
  const filtrar = l => (S.acSit === 'todos' ? l.situacao !== 'excluido' : l.situacao === S.acSit)
    && (!S.acFiltro || norm(`${l.email} ${l.nome || ''} ${pNome(l.parceiro_id)} ${PAPEIS[l.papel] || ''}`).includes(norm(S.acFiltro)));
  const vis = lista.filter(filtrar).sort((a, b) => (a.papel === 'parceiro') - (b.papel === 'parceiro') || a.email.localeCompare(b.email));
  const cont = k => lista.filter(l => l.situacao === k).length;
  const acoes = l => {
    if (l.situacao === 'ativo') return `<button class="btn sec peq" data-ed="${l.user_id}">Alterar</button> <button class="btn sec peq" data-senha="${esc(l.email)}">Nova senha</button> <button class="btn sec peq" data-sa="bloquear" data-u="${l.user_id}">Bloquear</button> <button class="btn sec peq" data-ex="${l.user_id}">Excluir</button>`;
    if (l.situacao === 'bloqueado') return `<button class="btn sec peq" data-ed="${l.user_id}">Alterar</button> <button class="btn peq" data-sa="desbloquear" data-u="${l.user_id}">Desbloquear</button> <button class="btn sec peq" data-ex="${l.user_id}">Excluir</button>`;
    if (l.situacao === 'excluido') return `<button class="btn sec peq" data-sa="restaurar" data-u="${l.user_id}">Restaurar</button>`;
    return `<button class="btn peq" data-novo="${esc(l.email)}">Novo código</button>${l.situacao === 'convite' ? ` <button class="btn sec peq" data-canc="${esc(l.email)}">Cancelar convite</button>` : ''}`;
  };
  $('#acs').outerHTML = `
  <section class="bloco"><div class="linha" style="justify-content:space-between"><h2>Logins e convites</h2>
      <input id="acf" class="peq" placeholder="Buscar e-mail, nome ou parceiro" value="${esc(S.acFiltro)}" style="min-width:260px"></div>
    <div class="linha">${[['todos', 'Todos', lista.length - cont('excluido')], ['ativo', 'Ativos', cont('ativo')], ['bloqueado', 'Bloqueados', cont('bloqueado')], ['convite', 'Convites pendentes', cont('convite')], ['excluido', 'Excluídos', cont('excluido')], ['cancelado', 'Convites cancelados', cont('cancelado')]]
      .map(([k, n, q]) => `<button class="btn ${S.acSit === k ? '' : 'sec'} peq" data-sit="${k}">${n} (${q})</button>`).join('')}</div>
    <div class="tabela"><table id="actab"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead><tbody>
    ${vis.map(l => { const [rot, cls] = ST_AC[l.situacao] || [l.situacao, '']; const eu = l.user_id === S.user.id;
      return `<tr data-row="${l.user_id || esc(l.email)}"><td><b>${esc(l.email)}</b>${eu ? ' <span class="pill">você</span>' : ''}</td><td>${esc(l.nome || '')}</td>
      <td>${esc(PAPEIS[l.papel] || l.papel)}${l.parceiro_id ? `<br><span style="font-size:12px;color:var(--muted)">${esc(pNome(l.parceiro_id))}</span>` : ''}</td>
      <td><span class="pill ${cls}">${rot}</span>${l.tentativas ? ` <span class="nota">${l.tentativas} tentativa(s) errada(s)</span>` : ''}</td>
      <td style="font-size:13px">${l.ultimo_acesso ? fmtDH(l.ultimo_acesso) : '—'}</td>
      <td style="white-space:nowrap">${eu ? `<button class="btn sec peq" data-ed="${l.user_id}">Alterar</button> <button class="btn sec peq" data-senha="${esc(l.email)}">Nova senha</button>` : acoes(l)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="nota">Nada encontrado.</td></tr>'}
    </tbody></table></div></section>
  <section class="bloco"><h2>Novo acesso</h2>
    <p class="sub">O convidado entra em "Primeiro acesso" com o e-mail e o código e escolhe a senha. O código vale uma vez e trava após 5 tentativas erradas.</p>
    <div class="linha">
      <input type="email" id="int-email" placeholder="e-mail" style="flex:1 1 240px">
      <input type="text" id="int-nome" placeholder="nome" style="flex:1 1 180px">
      <select id="int-papel" style="flex:0 1 180px"><option value="parceiro">Parceiro</option><option value="diretoria">Diretoria (consulta)</option><option value="financeiro">Financeiro (consulta)</option><option value="admin">Administrador</option></select>
      <select id="int-parc" style="flex:1 1 220px"><option value="">Parceiro…</option>${parcs.filter(p => p.ativo !== false).map(p => `<option value="${p.id}">${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select>
      <button class="btn" id="int-gerar">Gerar código</button>
    </div><div id="int-cod"></div>
    ${semAcesso.length ? `<details><summary style="cursor:pointer;font-size:14px">Parceiros ativos sem login (${semAcesso.length})</summary>
      <div class="tabela"><table><tbody>${semAcesso.map(p => `<tr><td>${esc(p.regiao)}<br><span style="font-size:12px;color:var(--muted)">${esc(p.codigo)} · ${esc(p.nome)}</span></td><td>${comConvite.has(p.id) ? '<span class="pill alerta">Convite pendente</span>' : '<span class="pill">Sem convite</span>'}</td>
        <td><input type="email" class="peq" id="em-${p.id}" value="${esc(p.email_contato || '')}" placeholder="e-mail do parceiro" style="width:100%"></td><td><button class="btn peq" data-p="${p.id}">Gerar código</button></td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>
  ${logs.length ? `<section class="bloco"><h2>Histórico de alterações</h2><div class="tabela"><table><tbody>${logs.map(g => `<tr><td style="font-size:13px;white-space:nowrap">${fmtDH(g.feito_em)}</td><td>${esc(g.alvo_email || '')}</td><td>${esc(g.acao)}</td><td style="font-size:13px;color:var(--muted)">${esc(g.detalhe || '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;

  const tab = $('#actab');
  const abaixo = (tr, html) => { tab.querySelectorAll('tr.extra').forEach(x => x.remove()); const l = document.createElement('tr'); l.className = 'extra'; l.innerHTML = `<td colspan="6" style="background:var(--field)">${html}</td>`; tr.after(l); return l; };
  const falha = (alvo, e) => { (alvo.querySelector('.am') || alvo).insertAdjacentHTML('beforeend', `<div class="msg erro" style="margin-top:6px">${esc(e.message)}</div>`); };
  const mostrarCodigo = (alvo, email, cod) => {
    const link = location.origin + location.pathname;
    const texto = `Portal de Fechamento GSM\n${link}\nPrimeiro acesso: e-mail ${email} e código ${cod}`;
    alvo.innerHTML = `<div class="confirma" style="margin-top:8px"><b>Código de ${esc(email)}: <span class="num" style="font-size:18px;letter-spacing:.12em">${esc(cod)}</span></b>
      <span>Ele aparece só agora. Copie e envie ao destinatário.</span>
      <textarea readonly style="font:inherit;font-size:13px;min-height:70px;padding:8px;border:1px solid var(--rule);border-radius:6px">${esc(texto)}</textarea>
      <div><button class="btn peq">Copiar mensagem</button></div></div>`;
    alvo.querySelector('button').onclick = async () => { try { await navigator.clipboard.writeText(texto); alvo.querySelector('button').textContent = 'Copiado'; } catch (e) { alvo.querySelector('textarea').select(); } };
  };
  $('#acf').oninput = e => { S.acFiltro = e.target.value; clearTimeout(S.acT); S.acT = setTimeout(() => { vAcessos().then(() => { const i = $('#acf'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
  m.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => { S.acSit = b.dataset.sit; vAcessos(); });
  const papelSel = $('#int-papel'); const parcSel = $('#int-parc');
  const ajusta = () => { parcSel.style.display = papelSel.value === 'parceiro' ? '' : 'none'; }; papelSel.onchange = ajusta; ajusta();
  $('#int-gerar').onclick = async () => {
    const email = $('#int-email').value.trim(); if (!email.includes('@')) return alertaTopo('Informe um e-mail válido.');
    if (papelSel.value === 'parceiro' && !parcSel.value) return alertaTopo('Escolha o parceiro deste login.');
    try { const cod = await q(sb.rpc('criar_convite', { p_email: email, p_papel: papelSel.value, p_parceiro: papelSel.value === 'parceiro' ? parcSel.value : null, p_nome: $('#int-nome').value.trim() || null })); mostrarCodigo($('#int-cod'), email, cod); }
    catch (e) { alertaTopo(e.message); }
  };
  m.querySelectorAll('button[data-p]').forEach(b => b.onclick = async () => {
    const id = b.dataset.p; const email = $(`#em-${id}`).value.trim(); const p = parcs.find(x => x.id === id);
    if (!email.includes('@')) return alertaTopo('Informe o e-mail do parceiro antes de gerar o código.');
    b.disabled = true;
    try { const cod = await q(sb.rpc('criar_convite', { p_email: email, p_papel: 'parceiro', p_parceiro: id, p_nome: p.nome }));
      const tr = b.closest('tr'); const l = document.createElement('tr'); l.innerHTML = '<td colspan="4"></td>'; tr.after(l); mostrarCodigo(l.firstElementChild, email, cod); }
    catch (e) { alertaTopo(e.message); } finally { b.disabled = false; }
  });
  tab.querySelectorAll('[data-novo]').forEach(b => b.onclick = async () => {
    const l = lista.find(x => x.email === b.dataset.novo); b.disabled = true;
    try { const cod = await q(sb.rpc('criar_convite', { p_email: l.email, p_papel: l.papel, p_parceiro: l.parceiro_id, p_nome: l.nome })); mostrarCodigo(abaixo(b.closest('tr'), '<div></div>').firstElementChild, l.email, cod); }
    catch (e) { alertaTopo(e.message); } finally { b.disabled = false; }
  });
  tab.querySelectorAll('[data-canc]').forEach(b => b.onclick = () => {
    const l = abaixo(b.closest('tr'), `<div class="linha am"><span>Cancelar o convite de <b>${esc(b.dataset.canc)}</b>? O código deixa de funcionar.</span><button class="btn peq" id="okc">Sim, cancelar</button><button class="btn sec peq" id="noc">Voltar</button></div>`);
    l.querySelector('#noc').onclick = () => l.remove();
    l.querySelector('#okc').onclick = async () => { try { await q(sb.rpc('cancelar_convite', { p_email: b.dataset.canc })); vAcessos(); } catch (e) { falha(l, e); } };
  });
  tab.querySelectorAll('[data-sa]').forEach(b => b.onclick = async () => { b.disabled = true; try { await q(sb.rpc('situacao_acesso', { p_user: b.dataset.u, p_acao: b.dataset.sa })); vAcessos(); } catch (e) { b.disabled = false; alertaTopo(e.message); } });
  tab.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => {
    const u = lista.find(x => x.user_id === b.dataset.ex);
    const l = abaixo(b.closest('tr'), `<div class="linha am"><span>Excluir o login <b>${esc(u.email)}</b>? A pessoa deixa de entrar no portal. O histórico do que ela fez (envios, aprovações) é mantido, e dá para restaurar depois em "Excluídos".</span><button class="btn marca peq" id="oke">Sim, excluir</button><button class="btn sec peq" id="noe">Voltar</button></div>`);
    l.querySelector('#noe').onclick = () => l.remove();
    l.querySelector('#oke').onclick = async () => { try { await q(sb.rpc('situacao_acesso', { p_user: u.user_id, p_acao: 'excluir' })); vAcessos(); } catch (e) { falha(l, e); } };
  });
  tab.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
    const u = lista.find(x => x.user_id === b.dataset.ed);
    const l = abaixo(b.closest('tr'), `<div class="linha am" style="align-items:flex-end">
      <label class="campo" style="flex:1 1 180px">Nome<input type="text" class="peq" id="ed-n" value="${esc(u.nome || '')}"></label>
      <label class="campo">Perfil<select class="peq" id="ed-p">${Object.entries(PAPEIS).map(([k, n]) => `<option value="${k}" ${k === u.papel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1 1 220px" id="ed-pw">Parceiro<select class="peq" id="ed-pc"><option value="">—</option>${parcs.map(p => `<option value="${p.id}" ${p.id === u.parceiro_id ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select></label>
      <button class="btn peq" id="ed-ok">Salvar</button><button class="btn sec peq" id="ed-no">Cancelar</button></div>
      <p class="nota" style="margin:6px 0 0">O e-mail de login não muda por aqui. Para trocar o e-mail, exclua este login e convide o novo e-mail.</p>`);
    const ps = l.querySelector('#ed-p'); const aj = () => l.querySelector('#ed-pw').style.display = ps.value === 'parceiro' ? '' : 'none'; ps.onchange = aj; aj();
    l.querySelector('#ed-no').onclick = () => l.remove();
    l.querySelector('#ed-ok').onclick = async () => { try { await q(sb.rpc('alterar_acesso', { p_user: u.user_id, p_nome: l.querySelector('#ed-n').value, p_papel: ps.value, p_parceiro: l.querySelector('#ed-pc').value || null })); vAcessos(); } catch (e) { falha(l, e); } };
  });
  tab.querySelectorAll('[data-senha]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const email = b.dataset.senha; const cod = await q(sb.rpc('criar_codigo_senha', { p_email: email }));
      const link = location.origin + location.pathname;
      const texto = `Portal de Fechamento GSM\n${link}\nNova senha: aba "Nova senha", e-mail ${email} e código ${cod} (vale 2 dias)`;
      abaixo(b.closest('tr'), `<div class="confirma"><b>Código de nova senha de ${esc(email)}: <span class="num" style="font-size:18px;letter-spacing:.12em">${esc(cod)}</span></b><textarea readonly style="font:inherit;font-size:13px;min-height:60px;padding:8px;border:1px solid var(--rule);border-radius:6px">${esc(texto)}</textarea></div>`);
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
  const m = S.previa && $('#pvcorpo') ? $('#pvcorpo') : $('#main');
  if (!S.compsP.length) {
    m.innerHTML = `<div class="bloco"><h2>Nenhum mês liberado</h2><p class="sub" style="margin:0">Assim que a GSM liberar a competência, a base do mês aparece aqui.</p></div>`;
    return;
  }
  const c = S.compsP.find(x => x.id === S.compPId) || S.compsP[0]; S.compPId = c.id;
  m.innerHTML = `<div class="topo"><div><h1>Fechamento de ${nomeMes(c.mes)}</h1><p>A sua base do mês já está no portal: pontos, o que o Umov registrou e os kits. Confira, ajuste só o que não bate (com explicação) e envie para a GSM validar. Depois de aprovado, a NF é enviada aqui mesmo.</p></div>
    <label class="campo" style="min-width:220px">Competência<select id="compP">${S.compsP.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${nomeMes(x.mes)}</option>`).join('')}</select></label></div>
    ${S.previa ? `<div class="msg alerta">Você está agindo em nome de <b>${esc(S.parc.regiao)} · ${esc(S.parc.nome)}</b>. ${c.liberada_parceiros ? 'Mês liberado para o parceiro.' : 'Este mês ainda não está liberado para o parceiro.'} Tudo fica registrado como feito pela GSM.</div>` : ''}
    <section class="bloco" id="secbase"><h2>1. Base do mês</h2><div id="basep" class="carregando">Carregando…</div></section>
    <section class="bloco" id="situacao"><h2>2. Validação da GSM</h2><div id="sitr" class="carregando">Carregando…</div></section>
    <section class="bloco" id="secnf"><h2>3. Nota fiscal</h2><div id="nfp" class="carregando">Carregando…</div></section>
    <section class="bloco"><h2>Adiantamento</h2><p class="sub">Peça um adiantamento do mês. A GSM confirma o valor e a data; o valor adiantado é descontado da NF do fechamento.</p><div id="adip" class="carregando">Carregando…</div></section>`;
  $('#compP').onchange = e => { S.compPId = e.target.value; S.baseAba = null; vParceiroInicio(); };
  baseParceiro(c);
  situacaoParceiro(c);
  secaoNF(c);
  secaoAdiantamento(c);
}

// ---------- Base do mês no portal (substitui o modelo em Excel) ----------
const SERV_FORA = ['Redespacho', 'Diária', 'Reversa', 'Embarque', 'Outro'];
async function baseParceiro(c) {
  const box = $('#basep'); if (!box) return;
  const pid = S.parc.id;
  const [pts, upp, kits, contr, conts, envs, imp] = await Promise.all([
    todas(() => sb.from('pontos_vigentes').select('cod_int,cliente,loja,cidade,uf,frequencia,previsto,v_unit').eq('competencia_id', c.id).eq('parceiro_id', pid).order('cliente')),
    todas(() => sb.from('umov_por_ponto').select('cod_int,retornadas,atendimentos').eq('competencia_id', c.id).eq('parceiro_id', pid)),
    todas(() => sb.from('umov_vigente').select('id_umov,grupo_cliente,cliente,cidade,situacao,data_prevista,data_final').eq('competencia_id', c.id).eq('parceiro_id', pid).eq('tipo', 'kit').order('data_prevista')),
    q(sb.from('contratos').select('valor_fixo,inicio,fim').eq('parceiro_id', pid).order('inicio', { ascending: false })),
    q(sb.from('base_contestacoes').select('*').eq('competencia_id', c.id).eq('parceiro_id', pid).eq('ativo', true).order('criado_em')),
    q(sb.from('envios').select('id,versao,status,enviado_em,totais').eq('competencia_id', c.id).eq('parceiro_id', pid).order('versao', { ascending: false }).limit(1)),
    q(sb.from('umov_importacoes').select('importado_em,arquivo').eq('competencia_id', c.id).eq('status', 'ativa').limit(1)),
  ]);
  box.className = '';
  if (!pts.length && !kits.length) { box.innerHTML = '<div class="msg alerta">A GSM ainda não gerou a sua base deste mês.</div>'; return; }
  const ult = envs[0]; const aprovado = ult?.status === 'aprovado'; const fechada = c.status === 'fechada'; const trava = aprovado || fechada;
  const fx = contr.find(k => k.inicio <= c.mes && (!k.fim || k.fim >= c.mes)); const fixo = fx ? Number(fx.valor_fixo) : 0;
  const ticket = S.parc.ticket_kit != null ? Number(S.parc.ticket_kit) : null;
  const um = Object.fromEntries(upp.map(u => [u.cod_int, u]));
  const cM = Object.fromEntries(conts.filter(x => x.tipo === 'malote').map(x => [x.ref, x]));
  const cK = Object.fromEntries(conts.filter(x => x.tipo === 'kit').map(x => [x.ref, x]));
  const extras = conts.filter(x => x.tipo === 'kit_extra'); const servs = conts.filter(x => x.tipo === 'servico');
  const linhasM = pts.map(p => { const u = um[p.cod_int]; const feitos = u ? u.retornadas : 0; const ct = cM[p.cod_int]; const vu = Number(p.v_unit) || 0;
    return { ...p, feitos, ct, vu, valor: (ct ? ct.realizado : feitos) * vu, valorGSM: feitos * vu }; });
  const kitVal = k => k.situacao === 'Retornada de Campo' ? (ticket ?? 0) : 0;
  const linhasK = kits.map(k => { const ct = cK[k.id_umov]; return { ...k, ct, valorGSM: kitVal(k), valor: ct ? Number(ct.valor) : kitVal(k) }; });
  const soma = (l, f) => l.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const calcGSM = fixo + soma(linhasM, x => x.valorGSM) + soma(linhasK, x => x.valorGSM);
  const totalParc = fixo + soma(linhasM, x => x.valor) + soma(linhasK, x => x.valor) + soma(extras, x => x.valor) + soma(servs, x => Number(x.quantidade) * Number(x.valor));
  const nAjustes = conts.length;
  S.baseAba = S.baseAba || 'malote';
  const abas = [['malote', `Malote (${fmtN(pts.length)})`], ['kits', `Kits/Spot (${fmtN(kits.length + extras.length)})`], ['servicos', `Serviços fora do Umov (${fmtN(servs.length)})`], ['enviar', 'Resumo e envio']];
  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Valor pela base GSM</small><b>${BRL2(calcGSM)}</b><span>${fixo ? `fixo ${BRL2(fixo)} + ` : ''}Umov × valores cadastrados</span></div>
      <div class="kpi ${Math.abs(totalParc - calcGSM) > 0.009 ? 'alerta' : 'neutro'}"><small>Seus ajustes</small><b>${(totalParc - calcGSM >= 0 ? '+' : '') + BRL2(totalParc - calcGSM)}</b><span>${fmtN(nAjustes)} ajuste(s) com explicação</span></div>
      <div class="kpi"><small>Valor que você vai enviar</small><b>${BRL2(totalParc)}</b><span>${ult ? `último envio: ${fmtDH(ult.enviado_em)}` : 'ainda não enviado'}</span></div>
    </div>
    <p class="nota" style="margin:0">Umov ${imp[0] ? `atualizado em ${fmtDH(imp[0].importado_em)}` : 'ainda não importado neste mês'}. ${ticket != null ? `Kits retornados valem o ticket médio de ${BRL2(ticket)} cada; se um kit foi maior, ajuste o valor e explique.` : '<b>Ticket médio de kits ainda não cadastrado pela GSM.</b>'}</p>
    ${trava ? `<div class="msg ok">${aprovado ? 'Mês aprovado pela GSM: a base não pode mais ser alterada.' : 'Mês fechado.'}</div>` : ''}
    <nav class="abas">${abas.map(([k, n]) => `<button type="button" data-ba="${k}" class="${S.baseAba === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
    <div id="baseaba"></div>`;
  box.querySelectorAll('[data-ba]').forEach(b => b.onclick = () => { S.baseAba = b.dataset.ba; baseParceiro(c); });
  const alvo = $('#baseaba'); const P = S.previa ? pid : null;
  const recarregar = () => baseParceiro(c);
  const anexar = async (file, tag) => { if (!file) return null; const path = `${pid}/${c.mes.slice(0, 7)}/base/${tag}_${Date.now()}_${safeName(file.name)}`; const up = await sb.storage.from('envios').upload(path, file); if (up.error) throw new Error('Anexo: ' + up.error.message); return path; };
  const salvar = async (dados, file, tag, msgEl) => { try { const ap = await anexar(file, tag); await q(sb.rpc('salvar_contestacao', { p: { competencia_id: c.id, ...dados, arquivo_path: ap }, p_parceiro: P })); recarregar(); } catch (e) { msgEl.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; } };
  const retirar = async id => { try { await q(sb.rpc('retirar_contestacao', { p_id: id, p_parceiro: P })); recarregar(); } catch (e) { alertaTopo(e.message); } };
  const formLinha = (cols, campos, tag, onSave) => { const l = document.createElement('tr'); l.className = 'extra';
    l.innerHTML = `<td colspan="${cols}" style="background:var(--field)"><div class="linha" style="align-items:flex-end">${campos}
      <label class="campo" style="flex:1 1 260px">Explicação<input class="peq" data-x="just" placeholder="O que aconteceu"></label>
      <label class="campo">Comprovante (opcional)<input type="file" data-x="arq" accept=".pdf,.jpg,.jpeg,.png" style="font:inherit;font-size:13px"></label>
      <button class="btn peq" data-x="ok">Salvar ajuste</button></div><div data-x="msg"></div></td>`;
    l.querySelector('[data-x="ok"]').onclick = () => onSave(l); return l; };
  const v = (l, k) => l.querySelector(`[data-x="${k}"]`);

  if (S.baseAba === 'malote') {
    S.baseFiltro = S.baseFiltro ?? ''; S.baseSo = S.baseSo || 'todos';
    const vis = linhasM.filter(x => (S.baseSo === 'todos' || (S.baseSo === 'ajustados' ? x.ct : S.baseSo === 'zerados' ? x.feitos === 0 : x.feitos < (x.previsto || 0)))
      && (!S.baseFiltro || norm(`${x.cod_int} ${x.cliente} ${x.loja} ${x.cidade}`).includes(norm(S.baseFiltro))));
    const pag = vis.slice(0, 200);
    alvo.innerHTML = `<div class="linha" style="justify-content:space-between"><div class="linha">${[['todos', 'Todos'], ['abaixo', 'Abaixo do previsto'], ['zerados', 'Sem atendimento no Umov'], ['ajustados', 'Ajustados por você']].map(([k, n]) => `<button class="btn ${S.baseSo === k ? '' : 'sec'} peq" data-so="${k}">${n}</button>`).join('')}</div>
      <input class="peq" id="bfil" placeholder="Buscar código, cliente, cidade" value="${esc(S.baseFiltro)}" style="min-width:240px"></div>
      <div class="tabela"><table id="btm"><thead><tr><th>Código</th><th>Cliente / loja</th><th>Cidade</th><th>Frequência</th><th class="n">Previsto</th><th class="n">Feitos (Umov)</th><th class="n">V. unit</th><th class="n">Valor</th><th></th></tr></thead><tbody>
      ${pag.map(x => `<tr data-cod="${esc(x.cod_int)}"${x.ct ? ' style="background:var(--wash)"' : ''}><td class="num">${esc(x.cod_int)}</td><td style="font-size:13px"><b>${esc(x.cliente || '')}</b><br>${esc(x.loja || '')}</td><td style="font-size:13px">${esc(x.cidade || '')}${x.uf ? ' - ' + esc(x.uf) : ''}</td><td style="font-size:13px">${esc(x.frequencia || '')}</td>
        <td class="n">${fmtN(x.previsto || 0)}</td><td class="n">${x.ct ? `<s style="color:var(--muted)">${fmtN(x.feitos)}</s> <b>${fmtN(x.ct.realizado)}</b>` : fmtN(x.feitos)}</td><td class="n">${BRL2(x.vu)}</td><td class="n">${BRL2(x.valor)}</td>
        <td style="white-space:nowrap">${trava ? '' : x.ct ? `<span class="nota" title="${esc(x.ct.justificativa)}">ajustado</span> <button class="btn sec peq" data-rm="${x.ct.id}">Desfazer</button>` : `<button class="btn sec peq" data-aj="${esc(x.cod_int)}">Ajustar</button>`}</td></tr>`).join('')}
      </tbody></table></div>${vis.length > pag.length ? `<p class="nota">Mostrando ${pag.length} de ${fmtN(vis.length)}. Use a busca para achar um ponto.</p>` : ''}
      <p class="nota">Feitos = atendimentos retornados de campo no Umov. Se você atendeu e o Umov não registrou (ou o contrário), clique em Ajustar, informe o número certo e explique.${fixo ? ` O valor fixo do contrato (${BRL2(fixo)}) entra no total.` : ''}</p>`;
    alvo.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { S.baseSo = b.dataset.so; baseParceiro(c); });
    $('#bfil').oninput = e => { S.baseFiltro = e.target.value; clearTimeout(S.bT); S.bT = setTimeout(() => { baseParceiro(c).then(() => { const i = $('#bfil'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); };
    alvo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => retirar(b.dataset.rm));
    alvo.querySelectorAll('[data-aj]').forEach(b => b.onclick = () => { const x = linhasM.find(k => k.cod_int === b.dataset.aj); const tr = b.closest('tr');
      alvo.querySelectorAll('tr.extra').forEach(e => e.remove());
      const l = formLinha(9, `<label class="campo">Atendimentos feitos<input class="peq" data-x="real" value="${x.feitos}" style="width:110px"></label>`, 'mal', async l2 => {
        const n = Number(v(l2, 'real').value); if (!Number.isInteger(n) || n < 0) return (v(l2, 'msg').innerHTML = '<div class="msg erro">Informe um número inteiro.</div>');
        await salvar({ tipo: 'malote', ref: x.cod_int, realizado: n, justificativa: v(l2, 'just').value }, v(l2, 'arq').files[0], 'mal', v(l2, 'msg')); });
      tr.after(l); });
  } else if (S.baseAba === 'kits') {
    alvo.innerHTML = `<div class="tabela"><table><thead><tr><th>Ref. Umov</th><th>Data</th><th>Kit / cliente</th><th>Cidade</th><th>Situação no Umov</th><th class="n">Valor</th><th></th></tr></thead><tbody>
      ${linhasK.map(k => `<tr${k.ct ? ' style="background:var(--wash)"' : ''}><td class="num">${esc(k.id_umov)}</td><td>${fmtD(k.data_final || k.data_prevista)}</td><td style="font-size:13px"><b>${esc(k.grupo_cliente || '')}</b><br>${esc(k.cliente || '')}</td><td style="font-size:13px">${esc(k.cidade || '')}</td>
        <td><span class="pill ${k.situacao === 'Retornada de Campo' ? '' : 'alerta'}">${esc(k.situacao || '—')}</span></td><td class="n">${k.ct ? `<s style="color:var(--muted)">${BRL2(k.valorGSM)}</s> <b>${BRL2(k.valor)}</b>` : BRL2(k.valor)}</td>
        <td style="white-space:nowrap">${trava ? '' : k.ct ? `<span class="nota" title="${esc(k.ct.justificativa)}">ajustado</span> <button class="btn sec peq" data-rm="${k.ct.id}">Desfazer</button>` : `<button class="btn sec peq" data-ak="${esc(k.id_umov)}">Ajustar</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="nota">Nenhum kit do Umov para você neste mês.</td></tr>'}
      </tbody></table></div>
      <h3 style="margin:10px 0 0;font-size:15px">Kits que não aparecem no Umov</h3>
      ${extras.length ? `<div class="tabela"><table><tbody>${extras.map(x => `<tr><td>${fmtD(x.data)}</td><td>${esc(x.descricao || '')}</td><td>${esc(x.cidade || '')}</td><td class="n">${BRL2(x.valor)}</td><td style="font-size:13px">${esc(x.justificativa || '')}${x.arquivo_path ? ' · comprovante anexado' : ''}</td><td>${trava ? '' : `<button class="btn sec peq" data-rm="${x.id}">Remover</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${trava ? '' : `<div class="linha" style="align-items:flex-end"><label class="campo">Data<input type="date" class="peq" id="ke-d"></label><label class="campo" style="flex:1 1 200px">Kit / cliente<input class="peq" id="ke-ds"></label><label class="campo">Cidade<input class="peq" id="ke-c" style="width:150px"></label><label class="campo">Valor (R$)<input class="peq" id="ke-v" style="width:110px"></label>
        <label class="campo" style="flex:1 1 220px">Explicação<input class="peq" id="ke-j" placeholder="por que não está no Umov"></label><label class="campo">Comprovante<input type="file" id="ke-a" accept=".pdf,.jpg,.jpeg,.png" style="font:inherit;font-size:13px"></label><button class="btn peq" id="ke-ok">Adicionar kit</button></div><div id="ke-m"></div>`}`;
    alvo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => retirar(b.dataset.rm));
    alvo.querySelectorAll('[data-ak]').forEach(b => b.onclick = () => { const k = linhasK.find(x => x.id_umov === b.dataset.ak); const tr = b.closest('tr');
      alvo.querySelectorAll('tr.extra').forEach(e => e.remove());
      const l = formLinha(7, `<label class="campo">Valor do kit (R$)<input class="peq" data-x="val" value="${String(k.valorGSM || '').replace('.', ',')}" style="width:120px"></label>`, 'kit', async l2 => {
        const n = numBR(v(l2, 'val').value); if (n == null || Number.isNaN(n) || n < 0) return (v(l2, 'msg').innerHTML = '<div class="msg erro">Valor inválido.</div>');
        await salvar({ tipo: 'kit', ref: k.id_umov, valor: n, justificativa: v(l2, 'just').value }, v(l2, 'arq').files[0], 'kit', v(l2, 'msg')); });
      tr.after(l); });
    const ok = $('#ke-ok'); if (ok) ok.onclick = async () => { const n = numBR($('#ke-v').value); if (n == null || Number.isNaN(n)) return ($('#ke-m').innerHTML = '<div class="msg erro">Informe o valor.</div>');
      ok.disabled = true; await salvar({ tipo: 'kit_extra', data: $('#ke-d').value || null, descricao: $('#ke-ds').value, cidade: $('#ke-c').value, valor: n, justificativa: $('#ke-j').value }, $('#ke-a').files[0], 'kitx', $('#ke-m')); ok.disabled = false; };
  } else if (S.baseAba === 'servicos') {
    alvo.innerHTML = `<p class="sub" style="margin:0">Serviços que não passam pelo Umov: redespacho, diária, reversa, embarque. Um por linha, de preferência com comprovante.</p>
      ${servs.length ? `<div class="tabela"><table><thead><tr><th>Data</th><th>Serviço</th><th>Descrição</th><th class="n">Qtd.</th><th class="n">V. unit</th><th class="n">Total</th><th>Explicação</th><th></th></tr></thead><tbody>${servs.map(x => `<tr><td>${fmtD(x.data)}</td><td>${esc(x.servico || '')}</td><td>${esc(x.descricao || '')}</td><td class="n">${fmtN(Number(x.quantidade))}</td><td class="n">${BRL2(x.valor)}</td><td class="n">${BRL2(Number(x.quantidade) * Number(x.valor))}</td><td style="font-size:13px">${esc(x.justificativa || '')}${x.arquivo_path ? ' · comprovante anexado' : ''}</td><td>${trava ? '' : `<button class="btn sec peq" data-rm="${x.id}">Remover</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${trava ? '' : `<div class="linha" style="align-items:flex-end"><label class="campo">Data<input type="date" class="peq" id="sv-d"></label><label class="campo">Serviço<select class="peq" id="sv-s">${SERV_FORA.map(x => `<option>${x}</option>`).join('')}</select></label><label class="campo" style="flex:1 1 200px">Descrição<input class="peq" id="sv-ds"></label>
        <label class="campo">Qtd.<input class="peq" id="sv-q" value="1" style="width:70px"></label><label class="campo">Valor unit. (R$)<input class="peq" id="sv-v" style="width:110px"></label><label class="campo" style="flex:1 1 200px">Explicação<input class="peq" id="sv-j"></label><label class="campo">Comprovante<input type="file" id="sv-a" accept=".pdf,.jpg,.jpeg,.png" style="font:inherit;font-size:13px"></label><button class="btn peq" id="sv-ok">Adicionar serviço</button></div><div id="sv-m"></div>`}`;
    alvo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => retirar(b.dataset.rm));
    const ok = $('#sv-ok'); if (ok) ok.onclick = async () => { const qn = numBR($('#sv-q').value), vv = numBR($('#sv-v').value); if (!qn || vv == null || Number.isNaN(vv)) return ($('#sv-m').innerHTML = '<div class="msg erro">Informe quantidade e valor.</div>');
      ok.disabled = true; await salvar({ tipo: 'servico', data: $('#sv-d').value || null, servico: $('#sv-s').value, descricao: $('#sv-ds').value, quantidade: qn, valor: vv, justificativa: $('#sv-j').value }, $('#sv-a').files[0], 'serv', $('#sv-m')); ok.disabled = false; };
  } else {
    const t = { fixo, mal: soma(linhasM, x => x.valor), kits: soma(linhasK, x => x.valor) + soma(extras, x => x.valor), serv: soma(servs, x => Number(x.quantidade) * Number(x.valor)) };
    alvo.innerHTML = `<div class="tabela" style="max-width:560px"><table><tbody>
        <tr><td>Valor fixo do contrato</td><td class="n">${BRL2(t.fixo)}</td></tr><tr><td>Malote (atendimentos × valor unitário)</td><td class="n">${BRL2(t.mal)}</td></tr>
        <tr><td>Kits/Spot</td><td class="n">${BRL2(t.kits)}</td></tr><tr><td>Serviços fora do Umov</td><td class="n">${BRL2(t.serv)}</td></tr>
        <tr><td><b>Total a enviar</b></td><td class="n"><b style="font-size:18px">${BRL2(totalParc)}</b></td></tr></tbody></table></div>
      ${nAjustes ? `<p class="sub" style="margin:0">${fmtN(nAjustes)} ajuste(s) seguem com a sua explicação para a GSM analisar.</p>` : '<p class="sub" style="margin:0">Nenhum ajuste: você está de acordo com a base da GSM.</p>'}
      ${trava ? '' : `<label class="linha"><input type="checkbox" id="conf"> Conferi a base e os ajustes estão corretos.</label>
        <div><button class="btn marca" id="envb" disabled>${ult && ult.status !== 'aprovado' ? 'Enviar de novo para validação' : 'Enviar para validação'}</button></div><div id="envm"></div>
        ${ult ? '<p class="nota">Enviar de novo substitui o envio anterior (ele fica no histórico).</p>' : ''}`}`;
    const cf = $('#conf'), eb = $('#envb');
    if (cf) cf.onchange = () => eb.disabled = !cf.checked;
    if (eb) eb.onclick = async () => { eb.disabled = true; eb.textContent = 'Enviando…';
      try { const r = await q(sb.rpc('enviar_base', { p_comp: c.id, p_parceiro: P }));
        $('#envm').innerHTML = `<div class="msg ok">Enviado para a GSM (envio ${r.versao}). ${r.em_analise || r.precisa_acao ? 'Os seus ajustes estão em análise.' : 'Sem ajustes: a GSM vai validar e aprovar.'}</div>`;
        situacaoParceiro(c); }
      catch (e) { eb.disabled = false; eb.textContent = 'Enviar para validação'; $('#envm').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; } };
  }
}

// ---------- Envio do relatório e conferência ----------
async function previaRelatorio(file, c) {
  const box = $('#prevr'); box.innerHTML = '<div class="carregando" style="padding:12px 0">Lendo o arquivo…</div>';
  let r;
  try { r = parseRelatorio(await lerPlanilha(file)); } catch (e) { box.innerHTML = `<div class="msg erro">Não foi possível ler o arquivo: ${esc(e.message)}</div>`; return; }
  if (!r.erros.length && r.id.parceiro_id !== S.parc.id) r.erros.push('Este modelo foi gerado para outro parceiro. Baixe o seu modelo no passo 1.');
  if (!r.erros.length && r.id.competencia_id !== c.id) r.erros.push(`Este modelo é de ${nomeMes(r.id.competencia || '')}, não de ${nomeMes(c.mes)}. Escolha a competência certa ou baixe o modelo deste mês.`);
  if (r.erros.length) {
    box.innerHTML = `<div class="msg erro"><b>O arquivo não pode ser enviado ainda.</b><ul style="margin:6px 0 0;padding-left:18px">${r.erros.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${r.erros.length > 12 ? `<div>…e mais ${r.erros.length - 12}.</div>` : ''}</div>`;
    return;
  }
  const t = r.totais;
  box.innerHTML = `<div class="confirma">
    <b>Confira antes de enviar · ${esc(file.name)}</b>
    <div class="kpis" style="gap:12px">
      <div class="kpi neutro"><small>Malote</small><b style="font-size:20px">${fmtN(t.malote_qtd)} atend.</b><span>${BRL2(t.malote_atend)} pelos atendimentos (sem o fixo)</span></div>
      <div class="kpi neutro"><small>Kits/Spot</small><b style="font-size:20px">${BRL2(t.kits)}</b><span>${fmtN(t.kits_qtd)} kit(s) com valor</span></div>
      <div class="kpi neutro"><small>Fora do Umov</small><b style="font-size:20px">${BRL2(t.fora)}</b><span>${fmtN(t.fora_qtd)} serviço(s)</span></div>
    </div>
    ${t.vazios ? `<div class="msg alerta">${fmtN(t.vazios)} ponto(s) com "Realizado" em branco. Se não houve atendimento, coloque 0.</div>` : ''}
    ${r.avisos.length ? `<div class="msg alerta">${r.avisos.slice(0, 6).map(esc).join('<br>')}</div>` : ''}
    <div class="linha"><button class="btn marca" id="enviarr">Enviar relatório</button><button class="btn sec" id="cancelr">Cancelar</button></div>
    <span class="nota">O valor fixo do contrato é somado pela GSM. Nada é aprovado automaticamente: a GSM confere tudo antes do pagamento.</span></div>`;
  $('#cancelr').onclick = () => { box.innerHTML = ''; $('#arqr').value = ''; };
  $('#enviarr').onclick = async () => {
    const b = $('#enviarr'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const path = `${S.parc.id}/${c.mes.slice(0, 7)}/${Date.now()}_${safeName(file.name)}`;
      const up = await sb.storage.from('envios').upload(path, file, { upsert: false });
      if (up.error) throw new Error('Falha ao guardar o arquivo: ' + up.error.message);
      const args = { p_comp: c.id, p_arquivo: path, p_malote: r.malote, p_kits: r.kits, p_fora: r.fora };
      const res = await q(S.previa ? sb.rpc('registrar_envio_gsm', { p_parceiro: S.parc.id, ...args }) : sb.rpc('registrar_envio', args));
      box.innerHTML = `<div class="msg ${res.precisa_acao ? 'alerta' : 'ok'}">Relatório recebido (envio ${res.versao}). ${res.precisa_acao ? `${res.precisa_acao} item(ns) precisam da sua ação. Veja abaixo.` : 'Nenhum item precisa da sua ação. A GSM vai conferir e aprovar.'}</div>`;
      situacaoParceiro(c); $('#situacao').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { box.insertAdjacentHTML('beforeend', `<div class="msg erro" style="margin-top:8px">${esc(e.message)}</div>`); b.disabled = false; b.textContent = 'Enviar relatório'; }
  };
}

const BRL2 = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SIT_ENVIO = { recebido: ['Recebido', ''], validado: ['Conferido, sem pendências', 'escuro'], com_divergencias: ['Com itens para você resolver', 'alerta'], aprovado: ['Aprovado pela GSM', 'escuro'], recusado: ['Devolvido pela GSM', 'marca'], substituido: ['Substituído', ''] };

async function situacaoParceiro(c) {
  const box = $('#sitr'); if (!box) return;
  const envs = await q(sb.from('envios').select('id,versao,enviado_em,status,totais,arquivo_path,comentario_gsm').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).order('versao', { ascending: false }));
  box.className = '';
  if (!envs.length) { box.innerHTML = '<p class="nota">Nenhum relatório enviado para este mês.</p>'; return; }
  const e = envs.find(x => x.status !== 'substituido') || envs[0]; const t = e.totais || {};
  const [divs, acoes] = await Promise.all([
    q(sb.from('divergencias').select('*').eq('envio_id', e.id).order('operacao').order('ref_linha')),
    q(sb.from('acoes_parceiro').select('*').eq('parceiro_id', S.parc.id).order('criado_em')),
  ]);
  const acoesPor = {}; acoes.forEach(a => (acoesPor[a.divergencia_id] = acoesPor[a.divergencia_id] || []).push(a));
  const grupos = [['precisa_acao', 'Precisam da sua ação', 'Envie um comprovante ou explique. Se a base estiver errada, ajuste no passo 1 e envie de novo.'],
    ['em_analise', 'Em análise pela GSM', 'Você já respondeu ou o item depende da GSM.'], ['informativo', 'Para seu conhecimento', 'Não bloqueiam o pagamento.'], ['conferido', 'Conferidos pela GSM', '']];
  const [rot, cls] = SIT_ENVIO[e.status] || [e.status, ''];
  const difUmov = (Number(t.malote_qtd) || 0) - (Number(t.umov_qtd) || 0);
  box.innerHTML = `
    <div class="linha" style="justify-content:space-between"><span>Envio ${e.versao} · ${fmtDH(e.enviado_em)}${t.enviado_pela_gsm ? ' · enviado pela GSM' : ''}</span><span class="pill ${cls}">${esc(rot)}</span></div>
    ${e.comentario_gsm ? `<div class="msg ${e.status === 'recusado' ? 'erro' : 'ok'}"><b>GSM:</b> ${esc(e.comentario_gsm)}${e.status === 'recusado' ? '<br>Ajuste a base no passo 1 e envie de novo.' : ''}</div>` : ''}
    <div class="kpis">
      <div class="kpi"><small>Total informado</small><b>${BRL2(t.total)}</b><span>${t.malote_fixo ? `inclui fixo de ${BRL2(t.malote_fixo)}` : 'sem valor fixo'}</span></div>
      <div class="kpi ${difUmov > 0 ? 'alerta' : ''}"><small>Malote: você x Umov</small><b>${fmtN(t.malote_qtd)} x ${fmtN(t.umov_qtd)}</b><span>${difUmov ? (difUmov > 0 ? '+' : '') + fmtN(difUmov) + ' atendimento(s)' : 'iguais'}</span></div>
      <div class="kpi neutro"><small>Kits/Spot e fora do Umov</small><b>${BRL2((Number(t.kits) || 0) + (Number(t.fora) || 0))}</b><span>kits ${BRL2(t.kits)} · fora ${BRL2(t.fora)}</span></div>
      <div class="kpi ${t.precisa_acao ? 'alerta' : 'neutro'}"><small>Pendências</small><b>${fmtN(divs.filter(d => d.situacao === 'precisa_acao').length)}</b><span>${fmtN(divs.filter(d => d.situacao === 'em_analise').length)} em análise na GSM</span></div>
    </div>
    ${grupos.map(([k, tit, sub]) => { const ls = divs.filter(d => d.situacao === k); if (!ls.length) return '';
      return `<div style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:8px 0 0;font-size:15px">${tit} (${ls.length})</h3>${sub ? `<p class="nota" style="margin:0">${sub}</p>` : ''}
      <div class="tabela"><table><thead><tr><th>Operação</th><th>Item</th><th>O que foi encontrado</th><th class="n">Valor</th><th></th></tr></thead><tbody>
      ${ls.map(d => `<tr data-d="${d.id}"><td style="white-space:nowrap">${esc(d.operacao)}</td><td class="num">${esc(d.ref_linha)}</td><td>${esc(d.descricao)}${d.decisao ? `<div class="nota" style="margin-top:4px"><b>GSM: ${d.decisao === 'aceita' ? 'aceito' : 'glosado ' + BRL2(d.valor_glosa)}</b>${d.comentario_gsm ? ' — ' + esc(d.comentario_gsm) : ''}</div>` : ''}${(acoesPor[d.id] || []).map(a => `<div class="nota" style="margin-top:4px">Sua resposta (${fmtDH(a.criado_em)}): ${esc(a.texto || '')}${a.arquivo_path ? ' · comprovante anexado' : ''}${a.decisao !== 'pendente' ? ` · <b>GSM: ${esc(a.decisao)}</b>${a.comentario_gsm ? ' — ' + esc(a.comentario_gsm) : ''}` : ''}</div>`).join('')}</td>
        <td class="n">${d.valor == null ? '—' : BRL2(d.valor)}</td><td>${k === 'precisa_acao' || k === 'informativo' ? `<button class="btn sec peq" data-resp="${d.id}">${S.previa ? 'Responder pelo parceiro' : 'Responder'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`; }).join('')}
    ${!divs.length ? '<div class="msg ok">Tudo confere com o Umov. A GSM vai revisar e aprovar.</div>' : ''}
    ${envs.length > 1 ? `<details><summary style="cursor:pointer;font-size:14px">Envios anteriores (${envs.length - 1})</summary><ul style="font-size:13px;margin:8px 0 0;padding-left:18px">${envs.filter(x => x.id !== e.id).map(x => `<li>Envio ${x.versao} · ${fmtDH(x.enviado_em)}${x.totais?.enviado_pela_gsm ? ' (pela GSM)' : ''} · ${esc((SIT_ENVIO[x.status] || [x.status])[0])} · ${BRL2(x.totais?.total)}</li>`).join('')}</ul></details>` : ''}`;
  box.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => formResposta(b, c));
}

function formResposta(b, c) {
  const tr = b.closest('tr'); const id = b.dataset.resp;
  if (tr.nextElementSibling?.classList.contains('resp')) { tr.nextElementSibling.remove(); return; }
  const linha = document.createElement('tr'); linha.className = 'resp';
  linha.innerHTML = `<td colspan="5" style="background:var(--field)"><div style="display:flex;flex-direction:column;gap:8px;padding:6px 0">
    <label class="campo">Explicação<textarea id="rt-${id}" style="font:inherit;font-size:14px;min-height:70px;padding:8px;border:1px solid var(--rule);border-radius:6px;text-transform:none;letter-spacing:normal;font-weight:400;color:var(--ink)" placeholder="Ex.: atendimento feito em 12/09, cliente assinou o protocolo"></textarea></label>
    <label class="campo">Comprovante (opcional)<input type="file" id="rf-${id}" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx" style="font:inherit;font-size:13px"></label>
    <div class="linha"><button class="btn peq" id="rs-${id}">Enviar resposta</button><span id="rm-${id}"></span></div></div></td>`;
  tr.after(linha);
  linha.querySelector(`#rs-${id}`).onclick = async ev => {
    const btn = ev.currentTarget; const texto = linha.querySelector(`#rt-${id}`).value.trim(); const arq = linha.querySelector(`#rf-${id}`).files[0];
    if (!texto && !arq) { linha.querySelector(`#rm-${id}`).innerHTML = '<span class="nota">Escreva uma explicação ou anexe um comprovante.</span>'; return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      let path = null;
      if (arq) { path = `${S.parc.id}/${c.mes.slice(0, 7)}/respostas/${id}_${Date.now()}_${safeName(arq.name)}`; const up = await sb.storage.from('envios').upload(path, arq); if (up.error) throw new Error(up.error.message); }
      await q(sb.from('acoes_parceiro').insert({ divergencia_id: id, parceiro_id: S.parc.id, tipo: arq ? 'comprovante' : 'justificativa', texto: texto || null, arquivo_path: path, criado_por: S.user.id, decisao: 'pendente' }));
      situacaoParceiro(c);
    } catch (e) { linha.querySelector(`#rm-${id}`).innerHTML = `<span class="msg erro">${esc(e.message)}</span>`; btn.disabled = false; btn.textContent = 'Enviar resposta'; }
  };
}

// ================= Cadastro de parceiros e rotas =================
const OPC = {
  tipo: ['Fechado', 'Unitário', 'Misto'],
  dia_pagamento: ['5º dia útil', 'Dia 15', 'Dia 20', 'Dia 30', 'Quinzenal'],
  limita_previsto: ['Sim', 'Não', 'Depende do caso', 'Não se aplica'],
  fluxo: ['1 - Enviamos relatório para validação', '2 - Parceiro envia relatório', 'Pendente de definição'],
};
const selOpc = (id, lista, v) => `<select class="peq" id="${id}"><option value="">—</option>${lista.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

async function vCadastro() {
  const m = $('#main'); S.cadAba = S.cadAba || 'parceiros';
  m.innerHTML = `<div class="topo"><div><h1>Parceiros e rotas</h1><p>Cadastre e altere parceiros, o valor fixo do contrato e as rotas do Umov. Nada é apagado: parceiro sai por inativação e toda alteração fica no histórico.</p></div></div>
    <nav class="abas">${[['parceiros', 'Parceiros'], ['rotas', 'Rotas do Umov'], ['hist', 'Histórico']].map(([k, n]) => `<button type="button" data-cab="${k}" class="${S.cadAba === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
    <div id="cad" class="carregando">Carregando…</div>`;
  m.querySelectorAll('[data-cab]').forEach(b => b.onclick = () => { S.cadAba = b.dataset.cab; vCadastro(); });
  const [parcs, contr, rotas] = await Promise.all([
    q(sb.from('parceiros').select('*').order('regiao')),
    q(sb.from('contratos').select('*').order('inicio', { ascending: false })),
    q(sb.from('rotas_depara').select('*').order('rota')),
  ]);
  S.rotas = {}; rotas.forEach(r => S.rotas[r.rota.toUpperCase().trim()] = r);
  if (S.cadAba === 'parceiros') return cadParceiros(parcs, contr);
  if (S.cadAba === 'rotas') return cadRotas(parcs, rotas);
  return cadHistorico(parcs);
}

function formParceiro(p = {}, fixo) {
  return `<div style="display:flex;flex-direction:column;gap:10px">
    <div class="linha" style="align-items:flex-end">
      <label class="campo" style="flex:1 1 200px">Região / rota<input class="peq" id="f-regiao" value="${esc(p.regiao || '')}" placeholder="ex.: SJRP - SP"></label>
      <label class="campo" style="flex:1 1 200px">Nome (responsável)<input class="peq" id="f-nome" value="${esc(p.nome || '')}"></label>
      <label class="campo" style="flex:1 1 240px">Razão social<input class="peq" id="f-razao" value="${esc(p.razao_social || '')}"></label>
      <label class="campo" style="flex:0 1 190px">CNPJ<input class="peq" id="f-cnpj" value="${esc(fmtCNPJ(p.cnpj || ''))}"></label>
    </div>
    <div class="linha" style="align-items:flex-end">
      <label class="campo">Tipo de contrato${selOpc('f-tipo', OPC.tipo, p.tipo)}</label>
      <label class="campo">Pagamento${selOpc('f-dia', OPC.dia_pagamento, p.dia_pagamento)}</label>
      <label class="campo">Limita ao previsto${selOpc('f-lim', OPC.limita_previsto, p.limita_previsto)}</label>
      <label class="campo" style="flex:1 1 220px">Fluxo do relatório${selOpc('f-fluxo', OPC.fluxo, p.fluxo)}</label>
      <label class="campo" style="flex:1 1 220px">E-mail de contato<input class="peq" id="f-email" type="email" value="${esc(p.email_contato || '')}"></label>
    </div>
    <div class="linha" style="align-items:flex-end">
      <label class="campo">Documento<input class="peq" id="f-doc" list="l-doc" value="${esc(p.tipo_documento || '')}" style="width:150px"></label>
      <label class="campo">Log / Group<input class="peq" id="f-emp" list="l-emp" value="${esc(p.empresa_gsm || '')}" style="width:110px"></label>
      <label class="campo">Tipo de pagamento<input class="peq" id="f-forma" list="l-forma" value="${esc(p.forma_pagamento || '')}" style="width:130px"></label>
      <label class="campo" style="flex:1 1 220px">Dados p/ pagamento (chave PIX, "Boleto"…)<input class="peq" id="f-dados" value="${esc(p.dados_pagamento || '')}"></label>
      <label class="campo">Modelo (capa)<input class="peq" id="f-mod" list="l-mod" value="${esc(p.modelo_capa || '')}" style="width:130px"></label>
      <datalist id="l-doc"><option>NF</option><option>NF/FATURA</option><option>NF/BOLETO</option><option>FATURA/BOLETO</option><option>CT-e</option><option>BOLETO</option></datalist>
      <datalist id="l-emp"><option>GROUP</option><option>LOG</option></datalist><datalist id="l-forma"><option>PIX</option><option>BOLETO</option><option>TED</option></datalist><datalist id="l-mod"><option>Parceiro</option><option>Adiantamento</option></datalist>
    </div>
    <div class="linha" style="align-items:flex-end">
      <label class="campo">Valor fixo mensal (R$)<input class="peq" id="f-fixo" value="${fixo != null ? String(fixo).replace('.', ',') : ''}" placeholder="vazio = sem fixo" style="width:150px"></label>
      <label class="campo">Vale a partir de<input class="peq" id="f-ini" type="month" value="${new Date().toISOString().slice(0, 7)}"></label>
      <label class="campo">Ticket médio por kit (R$)<input class="peq" id="f-ticket" value="${p.ticket_kit != null ? String(p.ticket_kit).replace('.', ',') : ''}" placeholder="vazio = não definido" style="width:150px"></label>
      <span class="nota" style="flex:1 1 260px">Mudar o valor fixo cria um novo período a partir do mês escolhido; o valor anterior fica guardado até o mês anterior.</span>
    </div>
    <div class="linha"><button class="btn peq" id="f-salvar">Salvar</button><button class="btn sec peq" id="f-cancelar">Cancelar</button></div><div id="f-msg"></div></div>`;
}

function cadParceiros(parcs, contr) {
  const box = $('#cad'); S.cadFiltro = S.cadFiltro ?? ''; S.cadSit = S.cadSit || 'ativos';
  const fixoAtual = id => { const hoje = new Date().toISOString().slice(0, 10); const c = contr.find(k => k.parceiro_id === id && k.inicio <= hoje && (!k.fim || k.fim >= hoje)); return c ? Number(c.valor_fixo) : null; };
  const vis = parcs.filter(p => (S.cadSit === 'todos' || (S.cadSit === 'ativos' ? p.ativo !== false : p.ativo === false))
    && (!S.cadFiltro || norm(`${p.codigo} ${p.regiao} ${p.nome} ${p.razao_social || ''} ${p.cnpj || ''}`).includes(norm(S.cadFiltro))));
  box.className = '';
  box.innerHTML = `<section class="bloco">
    <div class="linha" style="justify-content:space-between"><div class="linha">${[['ativos', 'Ativos', parcs.filter(p => p.ativo !== false).length], ['inativos', 'Inativos', parcs.filter(p => p.ativo === false).length], ['todos', 'Todos', parcs.length]].map(([k, n, qq]) => `<button class="btn ${S.cadSit === k ? '' : 'sec'} peq" data-cs="${k}">${n} (${qq})</button>`).join('')}</div>
      <div class="linha"><input id="cadf" class="peq" placeholder="Buscar região, nome, CNPJ" value="${esc(S.cadFiltro)}" style="min-width:240px"><button class="btn marca peq" id="novo">+ Novo parceiro</button></div></div>
    <div id="novobox"></div>
    <div class="tabela"><table id="cadtab"><thead><tr><th>Código</th><th>Região / rota</th><th>Razão social · CNPJ</th><th>Contrato</th><th class="n">Fixo vigente</th><th class="n">Ticket kit</th><th>Pagamento</th><th></th></tr></thead><tbody>
    ${vis.map(p => `<tr data-id="${p.id}" style="${p.ativo === false ? 'opacity:.55' : ''}"><td class="num">${esc(p.codigo)}</td><td><b>${esc(p.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome)}</span></td>
      <td style="font-size:13px">${esc(p.razao_social || '—')}<br><span class="num" style="color:var(--muted)">${esc(fmtCNPJ(p.cnpj) || 'sem CNPJ')}</span></td><td>${esc(p.tipo || '—')}</td><td class="n">${fixoAtual(p.id) != null ? BRL2(fixoAtual(p.id)) : '—'}</td><td class="n">${p.ticket_kit != null ? BRL2(p.ticket_kit) : '<span class="pill alerta">definir</span>'}</td><td>${esc(p.dia_pagamento || '—')}</td>
      <td style="white-space:nowrap"><button class="btn sec peq" data-alt="${p.id}">Alterar</button> ${p.ativo === false ? `<button class="btn peq" data-at="${p.id}" data-v="1">Reativar</button>` : `<button class="btn sec peq" data-at="${p.id}" data-v="0">Inativar</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="nota">Nada encontrado.</td></tr>'}
    </tbody></table></div></section>`;
  box.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => { S.cadSit = b.dataset.cs; cadParceiros(parcs, contr); });
  $('#cadf').oninput = e => { S.cadFiltro = e.target.value; clearTimeout(S.cadT); S.cadT = setTimeout(() => { cadParceiros(parcs, contr); const i = $('#cadf'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  const ligarForm = (alvo, p) => {
    alvo.querySelector('#f-cancelar').onclick = () => { alvo.closest('tr.extra') ? alvo.closest('tr.extra').remove() : (alvo.innerHTML = ''); };
    alvo.querySelector('#f-salvar').onclick = async ev => {
      const b = ev.currentTarget; const g = id => alvo.querySelector(id).value;
      const dados = { id: p?.id || null, regiao: g('#f-regiao'), nome: g('#f-nome'), razao_social: g('#f-razao'), cnpj: g('#f-cnpj'), tipo: g('#f-tipo'), dia_pagamento: g('#f-dia'), limita_previsto: g('#f-lim'), fluxo: g('#f-fluxo'), email_contato: g('#f-email'), tipo_documento: g('#f-doc'), empresa_gsm: g('#f-emp'), forma_pagamento: g('#f-forma'), dados_pagamento: g('#f-dados'), modelo_capa: g('#f-mod') };
      const fixoTxt = g('#f-fixo').trim(); const fixo = fixoTxt === '' ? null : numBR(fixoTxt);
      if (fixo != null && (Number.isNaN(fixo) || fixo < 0)) { alvo.querySelector('#f-msg').innerHTML = '<div class="msg erro">Valor fixo inválido.</div>'; return; }
      b.disabled = true;
      try {
        const id = await q(sb.rpc('salvar_parceiro', { p: dados }));
        const atual = p ? fixoAtual(p.id) : null;
        const tk = g('#f-ticket').trim(); const tkv = tk === '' ? null : numBR(tk);
        if (tkv !== null && (Number.isNaN(tkv) || tkv < 0)) throw new Error('Ticket médio inválido.');
        if ((p?.ticket_kit ?? null) !== tkv) await q(sb.rpc('definir_ticket_kit', { p_parceiro: id, p_valor: tkv }));
        if ((fixo ?? 0) !== (atual ?? 0)) await q(sb.rpc('definir_valor_fixo', { p_parceiro: id, p_valor: fixo ?? 0, p_inicio: g('#f-ini') + '-01' }));
        S.parceiros = await q(sb.from('parceiros').select('id,codigo,regiao,nome,ativo').order('codigo'));
        vCadastro();
      } catch (e) { b.disabled = false; alvo.querySelector('#f-msg').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
    };
  };
  $('#novo').onclick = () => { const nb = $('#novobox'); if (nb.innerHTML) { nb.innerHTML = ''; return; } nb.innerHTML = `<div class="confirma"><b>Novo parceiro</b><span class="nota">O código (P075, P076…) é gerado sozinho. Depois de salvar, gere o acesso em "Acessos e convites" e cadastre as rotas do Umov.</span>${formParceiro()}</div>`; ligarForm(nb, null); };
  box.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => {
    const p = parcs.find(x => x.id === b.dataset.alt); const tr = b.closest('tr');
    box.querySelectorAll('tr.extra').forEach(x => x.remove());
    const l = document.createElement('tr'); l.className = 'extra';
    const hist = contr.filter(k => k.parceiro_id === p.id);
    l.innerHTML = `<td colspan="8" style="background:var(--field)">${formParceiro(p, fixoAtual(p.id))}
      ${hist.length ? `<div class="nota" style="margin-top:8px">Valores fixos: ${hist.map(k => `${BRL2(k.valor_fixo)} de ${fmtD(k.inicio).slice(3)}${k.fim ? ' até ' + fmtD(k.fim).slice(3) : ' em diante'}`).join(' · ')}</div>` : ''}</td>`;
    tr.after(l); ligarForm(l.firstElementChild, p);
  });
  box.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
    const p = parcs.find(x => x.id === b.dataset.at); b.disabled = true;
    try { await q(sb.rpc('salvar_parceiro', { p: { ...p, ativo: b.dataset.v === '1' } })); vCadastro(); } catch (e) { b.disabled = false; alertaTopo(e.message); }
  });
}

function cadRotas(parcs, rotas) {
  const box = $('#cad'); box.className = ''; S.rotFiltro = S.rotFiltro ?? '';
  const pm = Object.fromEntries(parcs.map(p => [p.id, p]));
  const ativos = parcs.filter(p => p.ativo !== false);
  const vis = rotas.filter(r => !S.rotFiltro || norm(`${r.rota} ${pm[r.parceiro_id]?.regiao || ''} ${r.base_propria ? 'base propria' : ''}`).includes(norm(S.rotFiltro)));
  const opcoes = v => `<option value="">— sem parceiro —</option><option value="__bp" ${v === '__bp' ? 'selected' : ''}>Base própria GSM</option>${ativos.map(p => `<option value="${p.id}" ${p.id === v ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}`;
  box.innerHTML = `<section class="bloco">
    <p class="sub" style="margin:0">A rota é o nome do motorista/rota como aparece no Umov. Ela liga os <b>kits</b> ao parceiro (o malote é ligado pelo código de integração do ponto). Ao salvar, o Umov do mês aberto é religado na hora.</p>
    <div class="confirma"><b>Nova rota</b><div class="linha"><input class="peq" id="r-nome" placeholder="Nome da rota no Umov (ex.: SUL 23)" style="flex:1 1 220px"><select class="peq" id="r-parc" style="flex:1 1 260px">${opcoes('')}</select><button class="btn peq" id="r-add">Adicionar rota</button></div><div id="r-msg"></div></div>
    <div class="linha" style="justify-content:space-between"><span>${rotas.length} rotas · ${rotas.filter(r => r.base_propria).length} de base própria · ${rotas.filter(r => !r.parceiro_id && !r.base_propria).length} sem parceiro</span><input id="rotf" class="peq" placeholder="Buscar rota ou parceiro" value="${esc(S.rotFiltro)}" style="min-width:240px"></div>
    <div class="tabela"><table><thead><tr><th>Rota no Umov</th><th>Ligada a</th><th>Situação</th><th></th></tr></thead><tbody>
    ${vis.map(r => `<tr><td class="num"><b>${esc(r.rota)}</b></td><td><select class="peq" data-rsel="${esc(r.rota)}" style="min-width:260px">${opcoes(r.base_propria ? '__bp' : r.parceiro_id || '')}</select></td>
      <td>${r.confirmado ? '<span class="pill escuro">Confirmada</span>' : '<span class="pill alerta">Sugerida</span>'}</td><td><button class="btn sec peq" data-rsave="${esc(r.rota)}">Salvar</button> <span data-rok="${esc(r.rota)}"></span></td></tr>`).join('')}
    </tbody></table></div></section>`;
  $('#rotf').oninput = e => { S.rotFiltro = e.target.value; clearTimeout(S.rotT); S.rotT = setTimeout(() => { cadRotas(parcs, rotas); const i = $('#rotf'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  const salvar = async (rota, v) => q(sb.rpc('vincular_rota', { p_rota: rota, p_parceiro: v && v !== '__bp' ? v : null, p_base_propria: v === '__bp' }));
  $('#r-add').onclick = async () => {
    const nome = $('#r-nome').value.trim(); const v = $('#r-parc').value;
    if (!nome) return ($('#r-msg').innerHTML = '<div class="msg erro">Informe o nome da rota.</div>');
    if (!v) return ($('#r-msg').innerHTML = '<div class="msg erro">Escolha o parceiro ou base própria.</div>');
    if (rotas.some(r => r.rota.toUpperCase().trim() === nome.toUpperCase())) return ($('#r-msg').innerHTML = '<div class="msg erro">Essa rota já existe. Altere na lista abaixo.</div>');
    try { const n = await salvar(nome, v); vCadastro(); alertaOk(`Rota ${nome.toUpperCase()} cadastrada. ${n} atendimento(s) do Umov religado(s).`); } catch (e) { $('#r-msg').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
  };
  box.querySelectorAll('[data-rsave]').forEach(b => b.onclick = async () => {
    const rota = b.dataset.rsave; const v = box.querySelector(`[data-rsel="${CSS.escape(rota)}"]`).value; const ok = box.querySelector(`[data-rok="${CSS.escape(rota)}"]`);
    if (!v) { ok.innerHTML = '<span class="nota">Escolha um parceiro ou base própria.</span>'; return; }
    b.disabled = true;
    try { const n = await salvar(rota, v); ok.innerHTML = `<span class="pill escuro">Salvo · ${n} religado(s)</span>`; } catch (e) { ok.innerHTML = `<span class="msg erro">${esc(e.message)}</span>`; } finally { b.disabled = false; }
  });
}

async function cadHistorico(parcs) {
  const box = $('#cad'); box.className = '';
  const log = await q(sb.from('cadastro_log').select('*').order('feito_em', { ascending: false }).limit(150));
  const pm = Object.fromEntries(parcs.map(p => [p.id, p]));
  const CAMPOS = { regiao: 'Região', nome: 'Nome', razao_social: 'Razão social', cnpj: 'CNPJ', tipo: 'Tipo', fluxo: 'Fluxo', limita_previsto: 'Limita previsto', dia_pagamento: 'Pagamento', email_contato: 'E-mail', ativo: 'Ativo', valor_fixo: 'Valor fixo', inicio: 'Início', fim: 'Fim', parceiro_id: 'Parceiro', base_propria: 'Base própria', confirmado: 'Confirmada' };
  const val = (k, v) => v == null ? '—' : k === 'parceiro_id' ? (pm[v]?.regiao || v) : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);
  const desc = g => {
    const alvo = g.tabela === 'parceiros' ? (g.depois?.regiao || g.antes?.regiao) : g.tabela === 'contratos' ? `Contrato de ${pm[(g.depois || g.antes)?.parceiro_id]?.regiao || '—'}` : `Rota ${g.chave}`;
    if (g.acao === 'insert') return `<b>${esc(alvo)}</b> · criado`;
    const mud = Object.keys(CAMPOS).filter(k => g.antes && g.depois && JSON.stringify(g.antes[k]) !== JSON.stringify(g.depois[k]));
    return `<b>${esc(alvo)}</b> · ${mud.map(k => `${CAMPOS[k]}: ${esc(val(k, g.antes[k]))} → ${esc(val(k, g.depois[k]))}`).join(' · ') || 'alterado'}`;
  };
  box.innerHTML = `<section class="bloco"><div class="tabela"><table><tbody>${log.map(g => `<tr><td style="font-size:13px;white-space:nowrap">${fmtDH(g.feito_em)}</td><td style="font-size:14px">${desc(g)}</td></tr>`).join('') || '<tr><td class="nota">Nenhuma alteração registrada ainda.</td></tr>'}</tbody></table></div>
    <p class="nota">Mostra as últimas 150 alterações em parceiros, valores fixos e rotas.</p></section>`;
}

// ================= Adiantamentos =================
const ST_ADI = { solicitado: ['Aguardando GSM', 'alerta'], liberado: ['Liberado, a pagar', 'marca'], recusado: ['Recusado', ''], enviado_financeiro: ['No financeiro', 'marca'], nf_recebida: ['Liberado, a pagar', 'marca'], pago: ['Pago', 'escuro'], cancelado: ['Cancelado', ''] };

async function secaoAdiantamento(c) {
  const box = $('#adip'); if (!box) return;
  const [ads, fe] = await Promise.all([
    q(sb.from('adiantamentos').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).order('solicitado_em', { ascending: false })),
    q(sb.from('fechamento_parceiro').select('valor_aprovado').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).limit(1)),
  ]).then(([x, f]) => [x, f[0]]);
  box.className = '';
  const pendente = ads.some(a => a.status === 'solicitado');
  const pode = c.status === 'aberta' && !pendente && !(fe && fe.valor_aprovado != null);
  const comprometido = ads.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status)).reduce((s, a) => s + Number(a.valor || 0), 0);
  box.innerHTML = `${ads.length ? `<div class="tabela"><table><thead><tr><th>Pedido</th><th class="n">Solicitado</th><th class="n">Liberado</th><th class="n">Você recebe</th><th>Pagamento</th><th>Situação</th></tr></thead><tbody>
      ${ads.map(a => { const [r, k] = ST_ADI[a.status] || [a.status, '']; return `<tr><td>${fmtDH(a.solicitado_em)}${a.observacao ? `<br><span class="nota">${esc(a.observacao)}</span>` : ''}</td><td class="n">${a.valor_solicitado != null ? BRL2(a.valor_solicitado) : '—'}</td><td class="n">${a.valor != null ? BRL2(a.valor) : '—'}</td><td class="n">${a.valor != null ? BRL2(a.valor_liquido) + (Number(a.taxa_pct) ? `<br><span class="nota">desconto de ${String(a.taxa_pct).replace('.', ',')}%</span>` : '') : '—'}</td>
        <td>${a.pago_em ? 'pago em ' + fmtD(a.pago_em) : a.data_pagamento ? 'previsto ' + fmtD(a.data_pagamento) : '—'}</td><td><span class="pill ${k}">${r}</span>${a.motivo_recusa ? `<div class="nota">GSM: ${esc(a.motivo_recusa)}</div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>${comprometido ? `<p class="nota" style="margin:0">Adiantado no mês: ${BRL2(comprometido)}. Esse valor (liberado) é descontado da NF do fechamento.</p>` : ''}` : '<p class="nota" style="margin:0">Nenhum pedido de adiantamento neste mês.</p>'}
    ${pode ? `<div class="linha" style="align-items:flex-end"><label class="campo">Valor (R$)<input class="peq" id="adi-v" style="width:140px"></label><label class="campo" style="flex:1 1 260px">Observação (opcional)<input class="peq" id="adi-o" placeholder="ex.: combustível da primeira quinzena"></label><button class="btn peq" id="adi-ok">Pedir adiantamento</button></div><div id="adi-m"></div>`
      : pendente ? '<p class="nota" style="margin:0">Há um pedido aguardando a GSM.</p>' : ''}`;
  const b = $('#adi-ok');
  if (b) b.onclick = async () => {
    const v = numBR($('#adi-v').value);
    if (v == null || Number.isNaN(v) || v <= 0) { $('#adi-m').innerHTML = '<div class="msg erro">Informe um valor válido.</div>'; return; }
    b.disabled = true;
    try { await q(sb.rpc('solicitar_adiantamento', { p_comp: c.id, p_valor: v, p_obs: $('#adi-o').value, p_parceiro: S.previa ? S.parc.id : null })); secaoAdiantamento(c); }
    catch (e) { b.disabled = false; $('#adi-m').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
  };
}

async function vAdiantamentos() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Adiantamentos</h1><p>Pedidos dos parceiros. Você libera (podendo ajustar o valor e a data) ou recusa com motivo. O valor liberado é descontado da NF do fechamento, que sai pelo líquido.</p></div>${seletorComp(false)}</div><div id="adis" class="carregando">Carregando…</div>`;
  ligarSeletor(vAdiantamentos);
  const c = comp();
  const [ads, prev, fech, parcs] = await Promise.all([
    todas(() => sb.from('adiantamentos').select('*').eq('competencia_id', c.id).order('solicitado_em', { ascending: false })),
    todas(() => sb.from('previsao_realizado').select('parceiro_id,previsto').eq('competencia_id', c.id)),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado').eq('competencia_id', c.id)),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,ativo').order('regiao')),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const pv = Object.fromEntries(prev.map(p => [p.parceiro_id, Number(p.previsto)]));
  const ativo = a => ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status);
  const jaAd = id => ads.filter(a => a.parceiro_id === id && ativo(a)).reduce((s, a) => s + Number(a.valor || 0), 0);
  const soma = f => ads.filter(f).reduce((s, a) => s + Number(a.valor ?? a.valor_solicitado ?? 0), 0);
  S.adiFiltro = S.adiFiltro || 'todos';
  const vis = ads.filter(a => S.adiFiltro === 'todos' || (S.adiFiltro === 'apagar' ? ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status) : a.status === S.adiFiltro));
  $('#adis').outerHTML = `
    <div class="kpis">
      <div class="kpi ${ads.some(a => a.status === 'solicitado') ? 'alerta' : 'neutro'}"><small>Pedidos em aberto</small><b>${ads.filter(a => a.status === 'solicitado').length}</b><span>${BRL(soma(a => a.status === 'solicitado'))} solicitados</span></div>
      <div class="kpi"><small>Liberados a pagar</small><b>${BRL(soma(a => ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status)))}</b><span>${ads.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status)).length} adiantamento(s)</span></div>
      <div class="kpi neutro"><small>Pagos</small><b>${BRL(soma(a => a.status === 'pago'))}</b><span>${ads.filter(a => a.status === 'pago').length} adiantamento(s)</span></div>
      <div class="kpi"><small>Economia com adiantamentos (save)</small><b>${BRL2(ads.filter(ativo).reduce((s2, a) => s2 + Number(a.valor_desconto || 0), 0))}</b><span>desconto aplicado nos adiantamentos do mês</span></div>
    </div>
    ${c.status === 'aberta' ? `<section class="bloco"><h2>Lançar pedido em nome do parceiro</h2><div class="linha"><select class="peq" id="na-p" style="flex:1 1 260px"><option value="">Parceiro…</option>${parcs.filter(p => p.ativo !== false).map(p => `<option value="${p.id}">${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select>
      <input class="peq" id="na-v" placeholder="Valor (R$)" style="width:140px"><input class="peq" id="na-o" placeholder="Observação" style="flex:1 1 220px"><button class="btn sec peq" id="na-ok">Lançar pedido</button></div></section>` : ''}
    <section class="bloco"><div class="linha">${[['todos', 'Todos', ads.length], ['solicitado', 'Em aberto', ads.filter(a => a.status === 'solicitado').length], ['apagar', 'A pagar', ads.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status)).length], ['pago', 'Pagos', ads.filter(a => a.status === 'pago').length], ['recusado', 'Recusados', ads.filter(a => a.status === 'recusado').length]]
      .map(([k, n, qq]) => `<button class="btn ${S.adiFiltro === k ? '' : 'sec'} peq" data-af="${k}">${n} (${qq})</button>`).join('')}</div>
    <div class="tabela"><table id="aditab"><thead><tr><th>Parceiro</th><th>Pedido</th><th class="n">Solicitado</th><th class="n">Previsto do mês</th><th class="n">Já adiantado</th><th class="n">Liberado</th><th class="n">Desconto (save)</th><th>Situação</th><th></th></tr></thead><tbody>
    ${vis.map(a => { const p = pm[a.parceiro_id] || {}; const [r, k] = ST_ADI[a.status] || [a.status, '']; const prv = pv[a.parceiro_id];
      return `<tr><td><b>${esc(p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome || '')}</span></td><td style="font-size:13px">${fmtDH(a.solicitado_em)}${a.observacao ? `<br><span class="nota">${esc(a.observacao)}</span>` : ''}</td>
        <td class="n">${a.valor_solicitado != null ? BRL2(a.valor_solicitado) : '—'}</td><td class="n">${prv ? BRL(prv) : '—'}</td><td class="n">${jaAd(a.parceiro_id) ? BRL(jaAd(a.parceiro_id)) : '—'}</td>
        <td class="n">${a.valor != null ? BRL2(a.valor) : '—'}${a.data_pagamento ? `<br><span class="nota">${a.pago_em ? 'pago ' + fmtD(a.pago_em) : 'pagar ' + fmtD(a.data_pagamento)}</span>` : ''}</td>
        <td class="n">${a.valor != null && Number(a.taxa_pct) ? `${BRL2(a.valor_desconto)}<br><span class="nota">${String(a.taxa_pct).replace('.', ',')}% · paga ${BRL2(a.valor_liquido)}</span>` : '—'}</td>
        <td><span class="pill ${k}">${r}</span>${a.motivo_recusa ? `<div class="nota">${esc(a.motivo_recusa)}</div>` : ''}</td>
        <td style="white-space:nowrap">${a.status === 'solicitado' ? `<button class="btn peq" data-lib="${a.id}">Liberar</button> <button class="btn sec peq" data-rcs="${a.id}">Recusar</button>`
          : ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status) ? `<button class="btn peq" data-pag="${a.id}">Registrar pago</button> <button class="btn sec peq" data-can="${a.id}">Cancelar</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="nota">Nenhum adiantamento.</td></tr>'}
    </tbody></table></div>
    <p class="nota">"Previsto do mês" é o calendarizado do parceiro, só como referência. O portal não impõe limite de valor.</p></section>`;
  m.querySelectorAll('[data-af]').forEach(b => b.onclick = () => { S.adiFiltro = b.dataset.af; vAdiantamentos(); });
  const tab = $('#aditab');
  const linha = (b, html) => { tab.querySelectorAll('tr.extra').forEach(x => x.remove()); const l = document.createElement('tr'); l.className = 'extra'; l.innerHTML = `<td colspan="9" style="background:var(--field)"><div class="linha" style="align-items:flex-end">${html}</div><div class="am"></div></td>`; b.closest('tr').after(l); return l; };
  const rodar = async (l, btn, fn) => { btn.disabled = true; try { await fn(); vAdiantamentos(); } catch (e) { btn.disabled = false; l.querySelector('.am').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; } };
  const hoje = new Date().toISOString().slice(0, 10);
  tab.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { const a = ads.find(x => x.id === b.dataset.lib);
    const ultTaxa = ads.filter(x => x.parceiro_id === a.parceiro_id && Number(x.taxa_pct)).map(x => x.taxa_pct)[0];
    const l = linha(b, `<label class="campo">Valor liberado<input class="peq" id="lv" value="${String(a.valor_solicitado ?? '').replace('.', ',')}" style="width:130px"></label><label class="campo">Desconto (%)<input class="peq" id="lt" value="${ultTaxa != null ? String(ultTaxa).replace('.', ',') : ''}" placeholder="0" style="width:80px"></label><label class="campo">Data de pagamento<input class="peq" type="date" id="ld" value="${hoje}"></label><label class="campo" style="flex:1 1 200px">Observação<input class="peq" id="lo"></label><button class="btn peq" id="lok">Confirmar liberação</button><span class="nota" id="lcalc" style="flex-basis:100%"></span>`);
    const calc = () => { const v = numBR(l.querySelector('#lv').value) || 0, t = numBR(l.querySelector('#lt').value) || 0; const d = Math.round(v * t) / 100; l.querySelector('#lcalc').textContent = `Desconto de ${BRL2(d)} · o parceiro recebe ${BRL2(v - d)} · na NF do fechamento é abatido ${BRL2(v)}.`; };
    l.querySelector('#lv').oninput = calc; l.querySelector('#lt').oninput = calc; calc();
    l.querySelector('#lok').onclick = ev => { const v = numBR(l.querySelector('#lv').value); const t = numBR(l.querySelector('#lt').value); rodar(l, ev.currentTarget, () => q(sb.rpc('liberar_adiantamento', { p_id: a.id, p_valor: Number.isNaN(v) ? null : v, p_data: l.querySelector('#ld').value || null, p_taxa: t == null || Number.isNaN(t) ? 0 : t, p_obs: l.querySelector('#lo').value }))); }; });
  tab.querySelectorAll('[data-rcs]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo" style="flex:1 1 300px">Motivo (o parceiro vê)<input class="peq" id="rm"></label><button class="btn peq" id="rok">Recusar</button>`);
    l.querySelector('#rok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_adiantamento', { p_id: b.dataset.rcs, p_decisao: 'recusar', p_motivo: l.querySelector('#rm').value }))); });
  tab.querySelectorAll('[data-can]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo" style="flex:1 1 300px">Motivo do cancelamento<input class="peq" id="cm"></label><button class="btn peq" id="cok">Cancelar adiantamento</button>`);
    l.querySelector('#cok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_adiantamento', { p_id: b.dataset.can, p_decisao: 'cancelar', p_motivo: l.querySelector('#cm').value }))); });
  tab.querySelectorAll('[data-pag]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo">Pago em<input class="peq" type="date" id="pd" value="${hoje}"></label><button class="btn peq" id="pok">Confirmar pagamento</button>`);
    l.querySelector('#pok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('pagar_adiantamento', { p_id: b.dataset.pag, p_data: l.querySelector('#pd').value || null }))); });
  const na = $('#na-ok');
  if (na) na.onclick = async () => { const v = numBR($('#na-v').value); if (!$('#na-p').value) return alertaTopo('Escolha o parceiro.'); if (v == null || Number.isNaN(v) || v <= 0) return alertaTopo('Informe o valor.');
    na.disabled = true; try { await q(sb.rpc('solicitar_adiantamento', { p_comp: c.id, p_valor: v, p_obs: $('#na-o').value, p_parceiro: $('#na-p').value })); vAdiantamentos(); } catch (e) { na.disabled = false; alertaTopo(e.message); } };
}

// ================= Pacote do financeiro e pagamento =================
const ST_LOTE = { gerado: ['Gerado', 'alerta'], enviado: ['Enviado ao financeiro', 'marca'], pago_parcial: ['Pago em parte', 'alerta'], pago: ['Pago', 'escuro'], desfeito: ['Desfeito', ''] };

// Junta tudo o que a capa precisa para um lote
async function dadosLote(lote) {
  const [fech, adis] = await Promise.all([
    q(sb.from('fechamento_parceiro').select('*').eq('lote_id', lote.id)),
    q(sb.from('adiantamentos').select('*').eq('lote_id', lote.id)),
  ]);
  const ids = [...new Set(fech.map(f => f.parceiro_id).concat(adis.map(a => a.parceiro_id)))];
  if (!ids.length) return { lote, linhas: [] };
  const fechMes = adis.length ? await q(sb.from('fechamento_parceiro').select('*').eq('competencia_id', lote.competencia_id).in('parceiro_id', adis.map(a => a.parceiro_id))) : [];
  const comp = (await q(sb.from('competencias').select('id,mes').eq('id', lote.competencia_id)))[0];
  const [parcs, contr, prev, nfs, res] = await Promise.all([
    q(sb.from('parceiros').select('*').in('id', ids)),
    q(sb.from('contratos').select('parceiro_id,valor_fixo,inicio,fim').in('parceiro_id', ids)),
    q(sb.from('previsao_realizado').select('parceiro_id,previsto').eq('competencia_id', lote.competencia_id).in('parceiro_id', ids)),
    q(sb.from('notas_fiscais').select('parceiro_id,numero,arquivo_path,status,valor').eq('competencia_id', lote.competencia_id).in('parceiro_id', ids).in('status', ['recebida', 'conferida'])),
    q(sb.from('nf_resumo').select('parceiro_id,situacao').eq('competencia_id', lote.competencia_id).in('parceiro_id', ids)),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const pv = Object.fromEntries(prev.map(p => [p.parceiro_id, Number(p.previsto)]));
  const sit = Object.fromEntries(res.map(r => [r.parceiro_id, r.situacao]));
  const fixo = id => { const c = contr.filter(k => k.parceiro_id === id && k.inicio <= comp.mes && (!k.fim || k.fim >= comp.mes)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0]; return c ? Number(c.valor_fixo) : 0; };
  const n = v => Number(v) || 0;
  const linhas = fech.map(f => { const p = pm[f.parceiro_id] || {}; const minhas = nfs.filter(x => x.parceiro_id === f.parceiro_id);
    const calend = f.calendarizado != null ? n(f.calendarizado) : (pv[f.parceiro_id] ?? 0); const final = n(f.valor_aprovado ?? f.valor_final);
    return { id: f.parceiro_id, regiao: p.regiao, nome: p.nome, razao: p.razao_social, cnpj: fmtCNPJ(p.cnpj), contrato: fixo(f.parceiro_id), calend, malote: n(f.malote), caixas: n(f.kits), extrasMal: n(f.fora_umov), desc: n(f.descontos),
      final, dif: final - calend, pagar: final - n(f.adiantado), adiantado: n(f.adiantado), data: lote.data_pagamento, status: f.pago_em ? 'Pago' : sit[f.parceiro_id] === 'conferida' ? 'Ok' : 'Aguardando NF',
      doc: p.tipo_documento, nf: minhas.map(x => x.numero).join(' / ') || '-', emp: p.empresa_gsm, forma: p.forma_pagamento, dados: p.dados_pagamento, tipo: p.tipo, modelo: p.modelo_capa, nfs: minhas, pago: f.pago_em }; })
    .concat(adis.map(a => { const p = pm[a.parceiro_id] || {}; const f = fechMes.find(x => x.parceiro_id === a.parceiro_id) || {}; const calend = f.calendarizado != null ? n(f.calendarizado) : (pv[a.parceiro_id] ?? 0); const final = f.valor_aprovado != null ? n(f.valor_aprovado) : null;
      return { id: a.parceiro_id, regiao: p.regiao, nome: p.nome, razao: p.razao_social, cnpj: fmtCNPJ(p.cnpj), contrato: fixo(a.parceiro_id), calend, malote: f.malote != null ? n(f.malote) : null, caixas: f.kits != null ? n(f.kits) : null, extrasMal: f.fora_umov != null ? n(f.fora_umov) : null, desc: f.descontos != null ? n(f.descontos) : null,
        final, dif: final != null ? final - calend : null, pagar: n(a.valor_liquido), adiantado: 0, data: lote.data_pagamento, status: a.status === 'pago' ? 'Pago' : 'Ok',
        doc: p.tipo_documento, nf: '-', emp: p.empresa_gsm, forma: p.forma_pagamento, dados: p.dados_pagamento, tipo: p.tipo, modelo: /adiant/i.test(p.modelo_capa || '') ? p.modelo_capa : 'Parceiro (Adiantamento)', nfs: [], pago: a.pago_em, adiantamento: a }; }))
    .sort((a, b) => (a.status === 'Ok' ? 0 : 1) - (b.status === 'Ok' ? 0 : 1) || (a.regiao || '').localeCompare(b.regiao || ''));
  return { lote, comp, linhas };
}

// Capa no mesmo layout que o financeiro já recebe (Capa-Fechamento_DD.xlsx)
async function baixarCapa(lote) {
  const { linhas, comp } = await dadosLote(lote);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Planilha1');
  const F = { name: 'Aptos Narrow', size: 11 }; const MOEDA = '_-"R$ "* #,##0.00_-;"-R$ "* #,##0.00_-;_-"R$ "* \\-??_-;_-@_-';
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } }; const borda = { top: thin, left: thin, bottom: thin, right: thin };
  const dd = lote.data_pagamento.slice(8, 10);
  const cab = ['Região', 'Parceiros', 'Razão Social', 'CNPJ/CPF', 'Valor Contrato', 'Calendarizado', 'Valor Mensal Malote', 'Extras - Caixas', 'Extras - Malotes', 'Descontos', 'Valor final', 'Diferença', `Pagamento ${dd}`, 'Data para PAGTO', 'Status', 'Tipo', 'NF', 'Log / Group', 'Tipo de Pagamento', 'Dados p/ Pagamento', 'Contrato', 'Modelo'];
  [24.2, 28.9, 53, 17.7, 12.9, 14, 17.8, 13.1, 14.1, 10.3, 14, 12.9, 14, 9.9, 9.3, 14.8, 19.1, 10.2, 16.8, 30.1, 8.2, 12.2].forEach((w, i) => ws.getColumn(i + 1).width = w);
  const h = ws.getRow(3); h.height = 28.95;
  cab.forEach((t, i) => { const c = h.getCell(i + 1); c.value = t; c.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF262626'); c.border = borda; c.alignment = { vertical: 'middle', wrapText: true }; });
  const [y, mo, d] = lote.data_pagamento.split('-').map(Number);
  linhas.forEach((l, i) => {
    const r = ws.getRow(4 + i);
    const v = [l.regiao, l.nome, l.razao, l.cnpj, l.contrato, l.calend, l.malote, l.caixas, l.extrasMal, l.desc, l.final, l.dif, l.pagar, new Date(Date.UTC(y, mo - 1, d)), l.status, l.doc || '-', l.nf, l.emp || '-', l.forma || '-', l.dados || '-', l.tipo || '-', l.modelo || ''];
    v.forEach((x, j) => { const c = r.getCell(j + 1); c.value = x ?? null; c.font = { ...F, bold: [5, 10, 11, 12].includes(j) }; c.border = borda;
      if (j >= 4 && j <= 12) c.numFmt = MOEDA; if (j === 13) c.numFmt = '[$-416]d\\-mmm\\-yy;@'; if (j === 12) c.fill = fill('FFFFFF99'); });
  });
  const ult = 3 + linhas.length;
  ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach(col => { const c = ws.getCell(`${col}1`); c.value = linhas.length ? { formula: `SUM(${col}4:${col}${ult})`, result: linhas.reduce((a, l) => a + (Number({ F: l.calend, G: l.malote, H: l.caixas, I: l.extrasMal, J: l.desc, K: l.final, L: l.dif, M: l.pagar }[col]) || 0), 0) } : 0;
    c.font = { ...F, bold: true }; c.fill = fill('FFD9D9D9'); c.numFmt = MOEDA; });
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Capa-Fechamento_${dd}.xlsx`);
}

async function baixarNFs(lote, btn) {
  if (!window.JSZip) return alertaTopo('Não foi possível carregar o compactador de arquivos. Recarregue a página.');
  const { linhas, comp } = await dadosLote(lote); const zip = new JSZip(); let n = 0, falhas = [];
  for (const l of linhas) for (const nf of l.nfs) {
    if (!nf.arquivo_path) continue;
    btn.textContent = `Baixando ${++n}…`;
    const { data, error } = await sb.storage.from('envios').download(nf.arquivo_path);
    if (error || !data) { falhas.push(`${l.regiao} NF ${nf.numero}`); continue; }
    zip.file(safeName(`${l.regiao} - NF ${nf.numero}.pdf`), data);
  }
  if (!n) { btn.textContent = 'NFs (.zip)'; return alertaTopo('Nenhuma NF em PDF neste lote ainda.'); }
  const blob = await zip.generateAsync({ type: 'blob' });
  baixarBlob(blob, `NFs_${lote.rotulo.replace(/\s+/g, '')}_${comp.mes.slice(0, 7)}.zip`);
  btn.textContent = 'NFs (.zip)';
  if (falhas.length) alertaTopo('Não baixaram: ' + falhas.join(', '));
}
function baixarBlob(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// Lista de lotes (admin e financeiro)
async function listaLotes(box, compId, admin) {
  box.innerHTML = '<div class="carregando">Carregando…</div>';
  const lotes = (await q(sb.from('lotes_financeiro').select('*').eq('competencia_id', compId).order('data_pagamento'))).filter(l => l.status !== 'desfeito');
  const fech = lotes.length ? (await todas(() => sb.from('fechamento_parceiro').select('parceiro_id,lote_id,pago_em').in('lote_id', lotes.map(l => l.id))))
    .concat((await q(sb.from('adiantamentos').select('parceiro_id,lote_id,pago_em').in('lote_id', lotes.map(l => l.id)))).map(a => ({ ...a, adi: true }))) : [];
  if (!lotes.length) { box.innerHTML = `<p class="nota">Nenhum lote gerado neste mês.${admin ? '' : ' A GSM gera os lotes depois da aprovação dos parceiros.'}</p>`; return; }
  const hoje = new Date().toISOString().slice(0, 10);
  box.innerHTML = lotes.map(l => { const fs = fech.filter(f => f.lote_id === l.id); const pagos = fs.filter(f => f.pago_em).length; const [r, k] = ST_LOTE[l.status] || [l.status, ''];
    return `<div class="bloco" style="border-top-color:var(--rule)" data-lote="${l.id}">
      <div class="linha" style="justify-content:space-between"><div><b style="font-size:16px">${esc(l.rotulo || l.descricao)}</b> · ${fmtD(l.data_pagamento)} <span class="pill ${k}">${r}</span></div>
        <div class="linha"><button class="btn sec peq" data-capa="${l.id}">Capa (.xlsx)</button><button class="btn sec peq" data-zip="${l.id}">NFs (.zip)</button>
        ${admin && l.status === 'gerado' ? `<button class="btn sec peq" data-env="${l.id}">Marcar enviado</button>` : ''}${admin && !pagos ? `<button class="btn sec peq" data-desf="${l.id}">Desfazer lote</button>` : ''}</div></div>
      <div class="kpis"><div class="kpi neutro"><small>A pagar neste lote</small><b>${BRL2(l.total)}</b><span>${fs.filter(f => !f.adi).length} fechamento(s)${fs.some(f => f.adi) ? ` · ${fs.filter(f => f.adi).length} adiantamento(s)` : ''}</span></div>
        <div class="kpi ${pagos < fs.length ? 'alerta' : ''}"><small>Pagos</small><b>${pagos} de ${fs.length}</b><span>${l.pago_em ? 'concluído em ' + fmtD(l.pago_em) : l.enviado_em ? 'enviado ' + fmtDH(l.enviado_em) : 'ainda não enviado'}</span></div></div>
      ${pagos < fs.length ? `<div class="linha"><label class="campo">Pago em<input type="date" class="peq" data-pd="${l.id}" value="${hoje}"></label><button class="btn peq" data-pagar="${l.id}" style="align-self:flex-end">Registrar pagamento do lote</button>
        <span class="nota" style="align-self:flex-end">Parceiros ainda sem NF conferida ficam de fora e continuam pendentes.</span></div>` : ''}<div data-msg="${l.id}"></div></div>`; }).join('');
  const L = id => lotes.find(x => x.id === id);
  box.querySelectorAll('[data-capa]').forEach(b => b.onclick = async () => { b.disabled = true; try { await baixarCapa(L(b.dataset.capa)); } catch (e) { alertaTopo(e.message); } b.disabled = false; });
  box.querySelectorAll('[data-zip]').forEach(b => b.onclick = async () => { b.disabled = true; try { await baixarNFs(L(b.dataset.zip), b); } catch (e) { alertaTopo(e.message); } b.disabled = false; });
  box.querySelectorAll('[data-env]').forEach(b => b.onclick = async () => { try { await q(sb.rpc('marcar_lote_enviado', { p_lote: b.dataset.env })); listaLotes(box, compId, admin); } catch (e) { alertaTopo(e.message); } });
  box.querySelectorAll('[data-desf]').forEach(b => b.onclick = async () => { try { await q(sb.rpc('desfazer_lote_v2', { p_lote: b.dataset.desf })); admin ? vPacote() : listaLotes(box, compId, admin); } catch (e) { alertaTopo(e.message); } });
  box.querySelectorAll('[data-pagar]').forEach(b => b.onclick = async () => { const id = b.dataset.pagar; b.disabled = true;
    try { const r = await q(sb.rpc('pagar_lote_v2', { p_lote: id, p_data: box.querySelector(`[data-pd="${id}"]`).value || null }));
      await listaLotes(box, compId, admin);
      const m = box.querySelector(`[data-msg="${id}"]`); if (m) m.innerHTML = `<div class="msg ${r.sem_nf ? 'alerta' : 'ok'}">${r.pagos} fechamento(s)${r.adiantamentos ? ` e ${r.adiantamentos} adiantamento(s)` : ''} marcados como pagos.${r.sem_nf ? ' Ficaram de fora por falta de NF conferida: ' + esc(r.sem_nf) : ''}</div>`;
    } catch (e) { b.disabled = false; alertaTopo(e.message); } });
}

async function vPacote() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Pacote do financeiro e pagamento</h1><p>Monte um lote por data de pagamento com os parceiros aprovados. A capa sai no mesmo layout que o financeiro já usa (Capa-Fechamento_DD.xlsx), junto com as NFs em PDF. O financeiro registra o pagamento no portal; depois que todos estiverem pagos, você fecha a competência.</p></div>${seletorComp(false)}</div>
    <section class="bloco"><h2>Montar lote</h2><div id="montar" class="carregando">Carregando…</div></section>
    <section class="bloco"><h2>Lotes do mês</h2><div id="lotes"></div></section>
    <section class="bloco"><h2>Fechar a competência</h2><div id="fechar"></div></section>`;
  ligarSeletor(vPacote);
  const c = comp();
  const [fech, res, parcs, adisLib] = await Promise.all([
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,adiantado,lote_id,pago_em').eq('competencia_id', c.id)),
    todas(() => sb.from('nf_resumo').select('parceiro_id,situacao').eq('competencia_id', c.id)),
    q(sb.from('parceiros').select('id,regiao,nome,dia_pagamento,forma_pagamento,tipo_documento')),
    q(sb.from('adiantamentos').select('*').eq('competencia_id', c.id).eq('status', 'liberado').is('lote_id', null).order('data_pagamento')),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const sit = Object.fromEntries(res.map(r => [r.parceiro_id, r.situacao]));
  const livres = fech.filter(f => f.valor_aprovado != null && !f.lote_id);
  const grupos = {}; livres.forEach(f => { const d = pm[f.parceiro_id]?.dia_pagamento || 'Sem data cadastrada'; (grupos[d] = grupos[d] || []).push(f); });
  const ord = ['5º dia útil', 'Dia 15', 'Dia 20', 'Dia 30', 'Quinzenal', 'Sem data cadastrada'];
  const gs = Object.entries(grupos).sort((a, b) => ord.indexOf(a[0]) - ord.indexOf(b[0]));
  S.pacGrupo = S.pacGrupo && grupos[S.pacGrupo] ? S.pacGrupo : gs[0]?.[0];
  const sel = grupos[S.pacGrupo] || [];
  const sugData = () => { const n = (S.pacGrupo || '').match(/\d+/); if (!n || /útil/.test(S.pacGrupo)) return ''; const [y, mm] = c.mes.split('-').map(Number); const dt = new Date(Date.UTC(y, mm, +n[0])); return dt.toISOString().slice(0, 10); };
  $('#montar').className = '';
  $('#montar').innerHTML = c.status === 'fechada' ? '<p class="nota">Competência fechada: não recebe novos lotes.</p>' : !livres.length && !adisLib.length ? '<p class="nota">Nenhum parceiro aprovado ou adiantamento liberado fora de lote neste mês.</p>' : `
    <div class="linha">${gs.map(([d, ls]) => `<button class="btn ${d === S.pacGrupo ? '' : 'sec'} peq" data-grp="${esc(d)}">${esc(d)} (${ls.length})</button>`).join('')}</div>
    <div class="tabela"><table><thead><tr><th><input type="checkbox" id="tudo" checked></th><th>Parceiro</th><th>Pagamento</th><th class="n">A pagar (aprovado − adiantado)</th><th>NF</th></tr></thead><tbody>
      ${sel.map(f => { const p = pm[f.parceiro_id] || {}; const s = sit[f.parceiro_id]; return `<tr><td><input type="checkbox" class="pck" value="${f.parceiro_id}" checked></td><td><b>${esc(p.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome)}</span></td><td style="font-size:13px">${esc(p.forma_pagamento || '—')}</td>
        <td class="n">${BRL2(Number(f.valor_aprovado) - Number(f.adiantado || 0))}</td><td><span class="pill ${s === 'conferida' ? 'escuro' : 'alerta'}">${(SIT_NF[s] || ['—'])[0]}</span></td></tr>`; }).join('')}
    </tbody></table></div>
    ${adisLib.length ? `<h3 style="margin:8px 0 0;font-size:15px">Adiantamentos liberados</h3><div class="tabela"><table><thead><tr><th></th><th>Parceiro</th><th>Pagar em</th><th class="n">Liberado</th><th class="n">Desconto</th><th class="n">A pagar</th></tr></thead><tbody>
      ${adisLib.map(a => `<tr><td><input type="checkbox" class="ack" value="${a.id}"></td><td><b>${esc(pm[a.parceiro_id]?.regiao || '—')}</b></td><td>${fmtD(a.data_pagamento)}</td><td class="n">${BRL2(a.valor)}</td><td class="n">${Number(a.taxa_pct) ? BRL2(a.valor_desconto) + ` (${String(a.taxa_pct).replace('.', ',')}%)` : '—'}</td><td class="n"><b>${BRL2(a.valor_liquido)}</b></td></tr>`).join('')}
      </tbody></table></div><p class="nota">Marque os adiantamentos que saem neste lote. Na capa eles aparecem com Modelo "Parceiro (Adiantamento)" e o valor líquido na coluna de pagamento.</p>` : ''}
    <div class="linha" style="align-items:flex-end"><label class="campo">Nome do lote<input class="peq" id="lrot" value="Pagamento ${esc(((S.pacGrupo || '').match(/\d+/) || [''])[0])}" style="width:180px"></label><label class="campo">Data de pagamento<input class="peq" type="date" id="ldata" value="${sugData()}"></label><button class="btn marca" id="lgerar">Gerar lote</button></div>
    <p class="nota">Parceiros aguardando NF podem entrar no lote (aparecem como "Aguardando NF" na capa, como hoje), mas só são marcados como pagos depois da NF conferida.</p>`;
  m.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { S.pacGrupo = b.dataset.grp; vPacote(); });
  const tudo = $('#tudo'); if (tudo) tudo.onchange = () => m.querySelectorAll('.pck').forEach(x => x.checked = tudo.checked);
  const g = $('#lgerar'); if (g) g.onclick = async () => { const ids = [...m.querySelectorAll('.pck:checked')].map(x => x.value); const aids = [...m.querySelectorAll('.ack:checked')].map(x => x.value);
    g.disabled = true; try { await q(sb.rpc('gerar_lote_v2', { p_comp: c.id, p_data: $('#ldata').value || null, p_rotulo: $('#lrot').value, p_parceiros: ids, p_adiantamentos: aids })); vPacote(); } catch (e) { g.disabled = false; alertaTopo(e.message); } };
  listaLotes($('#lotes'), c.id, true);
  const pend = fech.filter(f => !f.pago_em);
  $('#fechar').innerHTML = c.status === 'fechada' ? '<div class="msg ok">Competência fechada.</div>'
    : `<p class="sub" style="margin:0">${fech.length ? `${fech.length - pend.length} de ${fech.length} parceiros pagos.` : 'Nenhum parceiro com fechamento neste mês.'} O fechamento só é aceito com todos pagos e sem adiantamento pendente.</p>
      ${pend.length ? `<details><summary style="cursor:pointer;font-size:14px">Pendentes (${pend.length})</summary><p style="font-size:13px">${pend.map(f => esc(pm[f.parceiro_id]?.regiao || '—')).join(', ')}</p></details>` : ''}
      <div><button class="btn ${pend.length || !fech.length ? 'sec' : 'marca'}" id="fcomp" ${pend.length || !fech.length ? 'disabled' : ''}>Fechar ${nomeMes(c.mes)}</button></div>`;
  const fc = $('#fcomp'); if (fc) fc.onclick = async () => { fc.disabled = true; try { await q(sb.rpc('fechar_competencia', { p_comp: c.id })); await carregarBase(); vPacote(); } catch (e) { fc.disabled = false; alertaTopo(e.message); } };
}

// ================= Notas fiscais =================
const digitos = t => String(t || '').replace(/\D/g, '');
const fmtCNPJ = t => { const d = digitos(t); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (t || ''); };
async function textoPDF(file) {
  if (!window.pdfjsLib) return '';
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let t = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); t += c.items.map(x => x.str).join(' ') + '\n'; }
  return t;
}
// Lê o que der do PDF; o que não achar fica para a pessoa preencher. Nada é inventado.
function lerNF(texto, cnpjParceiro, esperado) {
  const t = texto.replace(/\s+/g, ' ');
  const cnpjs = [...new Set((t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || []).map(digitos))];
  const valores = [...new Set((t.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(v => Number(v.replace(/\./g, '').replace(',', '.'))))].filter(v => v > 0);
  const m = t.match(/(?:N[úu]mero|N[º°o]\.?)\s*(?:da\s*)?(?:NFS-?e|Nota(?:\s*Fiscal)?)?\s*[:\-]?\s*(\d{1,15})/i);
  const vl = t.match(/Valor\s+L[íi]quido[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/i) || t.match(/Valor\s+(?:Total|do\s+Servi[çc]o|dos\s+Servi[çc]os)[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const dt = t.match(/(?:Emiss[ãa]o|Compet[êe]ncia)[^\d]{0,30}(\d{2}\/\d{2}\/\d{4})/i);
  return {
    texto: t.trim().length > 40, cnpj_parceiro_no_pdf: !!cnpjParceiro && cnpjs.includes(digitos(cnpjParceiro)),
    numero: m ? m[1] : '', valor: vl ? Number(vl[1].replace(/\./g, '').replace(',', '.')) : null,
    esperado_no_pdf: esperado != null && valores.some(v => Math.abs(v - esperado) < 0.01),
    data: dt ? dt[1].split('/').reverse().join('-') : '',
  };
}
const ST_NF = { recebida: ['A conferir', 'alerta'], conferida: ['Conferida', 'escuro'], recusada: ['Recusada', 'marca'], cancelada: ['Cancelada', ''], substituida: ['Substituída', ''] };
const SIT_NF = { aguardando: ['Aguardando NF', ''], a_conferir: ['NF a conferir', 'alerta'], faltando: ['Soma diferente do esperado', 'marca'], conferida: ['NF conferida', 'escuro'] };

async function secaoNF(c) {
  const box = $('#nfp'); if (!box) return;
  const [res, nfs] = await Promise.all([
    q(sb.from('nf_resumo').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).maybeSingle()),
    q(sb.from('notas_fiscais').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).order('enviado_em')),
  ]);
  box.className = '';
  if (!res) { box.innerHTML = '<p class="nota">A NF é enviada aqui depois que a GSM aprovar o valor do mês.</p>'; return; }
  const esp = Number(res.valor_esperado), env = Number(res.valor_nfs), falta = esp - env;
  const [rot, cls] = SIT_NF[res.situacao] || [res.situacao, ''];
  box.innerHTML = `<div class="linha" style="justify-content:space-between"><span>Emita a NF pelo valor líquido. Pode dividir em mais de uma NF, desde que a soma bata.</span><span class="pill ${cls}">${rot}</span></div>
    <div class="kpis">
      <div class="kpi"><small>Valor aprovado</small><b>${BRL2(res.valor_aprovado)}</b><span>aprovado pela GSM</span></div>
      <div class="kpi neutro"><small>Adiantamento</small><b>${BRL2(res.adiantado)}</b><span>já pago no mês</span></div>
      <div class="kpi"><small>Valor da NF (líquido)</small><b>${BRL2(esp)}</b><span>aprovado − adiantamento</span></div>
      <div class="kpi ${Math.abs(falta) > 0.009 ? 'alerta' : 'neutro'}"><small>${falta >= 0 ? 'Falta emitir' : 'Enviado a mais'}</small><b>${BRL2(Math.abs(falta))}</b><span>${fmtN(res.nfs)} NF(s) enviada(s): ${BRL2(env)}</span></div>
    </div>
    ${nfs.length ? `<div class="tabela"><table><thead><tr><th>NF</th><th>Emissão</th><th>CNPJ emitente</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
      ${nfs.map(n => { const [r, k] = ST_NF[n.status] || [n.status, '']; return `<tr><td><b>${esc(n.numero)}</b>${n.arquivo_path ? ` · <a href="#" data-nfarq="${esc(n.arquivo_path)}">PDF</a>` : ''}</td><td>${fmtD(n.data_emissao)}</td><td class="num">${esc(fmtCNPJ(n.cnpj_emitente))}</td><td class="n">${BRL2(n.valor)}</td>
        <td><span class="pill ${k}">${r}</span>${n.motivo_recusa ? `<div class="nota">GSM: ${esc(n.motivo_recusa)}</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    ${res.situacao !== 'conferida' && c.status !== 'fechada' ? `${zonaArquivo('arqnf', 'Arraste o PDF da NF aqui ou clique para escolher', 'O portal lê o número, o valor e o CNPJ quando o PDF tem texto. Confira antes de enviar.', '.pdf')}<div id="nfform"></div>` : ''}`;
  box.querySelectorAll('[data-nfarq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const { data } = await sb.storage.from('envios').createSignedUrl(a.dataset.nfarq, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); });
  if ($('#arqnf')) ligarZona('arqnf', f => formNF(f, c, falta > 0.009 ? falta : esp));
}

async function formNF(file, c, sugerido) {
  const box = $('#nfform');
  if (!/\.pdf$/i.test(file.name)) { box.innerHTML = '<div class="msg erro">Envie o PDF da nota fiscal.</div>'; return; }
  box.innerHTML = '<div class="carregando" style="padding:10px 0">Lendo o PDF…</div>';
  let lido = { texto: false };
  try { lido = lerNF(await textoPDF(file), S.parc.cnpj, sugerido); } catch (e) { lido = { texto: false }; }
  const valorIni = lido.valor ?? (lido.esperado_no_pdf ? sugerido : null);
  box.innerHTML = `<div class="confirma">
    <b>Confira os dados da NF · ${esc(file.name)}</b>
    <span>${lido.texto ? `Lido do PDF: ${[lido.numero && 'número', lido.valor != null && 'valor', lido.data && 'data'].filter(Boolean).join(', ') || 'nada reconhecido'}. ${lido.cnpj_parceiro_no_pdf ? 'O CNPJ do parceiro aparece no PDF.' : '<b>O CNPJ cadastrado do parceiro não foi encontrado no PDF.</b>'}` : 'O PDF não tem texto legível (pode ser imagem). Preencha os campos.'}</span>
    <div class="linha" style="align-items:flex-end">
      <label class="campo">Número<input class="peq" id="nf-num" value="${esc(lido.numero || '')}" style="width:140px"></label>
      <label class="campo">Emissão<input class="peq" id="nf-dt" type="date" value="${esc(lido.data || '')}"></label>
      <label class="campo">CNPJ emitente<input class="peq" id="nf-cnpj" value="${esc(fmtCNPJ(S.parc.cnpj || ''))}" style="width:190px"></label>
      <label class="campo">Valor (R$)<input class="peq" id="nf-val" value="${valorIni != null ? valorIni.toFixed(2).replace('.', ',') : ''}" style="width:130px"></label>
    </div>
    <span class="nota">Valor que falta emitir: ${BRL2(sugerido)}.</span>
    <div class="linha"><button class="btn marca" id="nf-env">Enviar NF</button><button class="btn sec" id="nf-canc">Cancelar</button></div><div id="nf-msg"></div></div>`;
  $('#nf-canc').onclick = () => { box.innerHTML = ''; $('#arqnf').value = ''; };
  $('#nf-env').onclick = async () => {
    const b = $('#nf-env'); const v = numBR($('#nf-val').value);
    if (v == null || Number.isNaN(v)) { $('#nf-msg').innerHTML = '<div class="msg erro">Valor inválido.</div>'; return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const path = `${S.parc.id}/${c.mes.slice(0, 7)}/nf/${Date.now()}_${safeName(file.name)}`;
      const up = await sb.storage.from('envios').upload(path, file); if (up.error) throw new Error('Falha ao guardar o PDF: ' + up.error.message);
      await q(sb.rpc('registrar_nf', { p_comp: c.id, p_parceiro: S.previa ? S.parc.id : null, p_arquivo: path, p_numero: $('#nf-num').value, p_cnpj: digitos($('#nf-cnpj').value), p_valor: v, p_data: $('#nf-dt').value || null,
        p_checagens: { texto: !!lido.texto, cnpj_no_pdf: !!lido.cnpj_parceiro_no_pdf, numero_lido: lido.numero || null, valor_lido: lido.valor ?? null, valor_confere_pdf: lido.valor != null ? Math.abs(lido.valor - v) < 0.01 : null } }));
      secaoNF(c);
    } catch (e) { $('#nf-msg').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; b.disabled = false; b.textContent = 'Enviar NF'; }
  };
}

async function vNotas() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Notas fiscais</h1><p>NFs dos parceiros com valor aprovado. A NF sai pelo valor líquido (aprovado − adiantamento) e pode ser dividida em várias, desde que a soma bata. Confira cada uma; quando a soma conferida bater, o parceiro passa para "NF conferida".</p></div>${seletorComp(false)}</div><div id="nfs" class="carregando">Carregando…</div>`;
  ligarSeletor(vNotas);
  const c = comp();
  const [res, nfs, parcs] = await Promise.all([
    todas(() => sb.from('nf_resumo').select('*').eq('competencia_id', c.id)),
    todas(() => sb.from('notas_fiscais').select('*').eq('competencia_id', c.id).order('enviado_em')),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,cnpj')),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p]));
  S.nfFiltro = S.nfFiltro || 'todos';
  const cont = k => res.filter(r => r.situacao === k).length;
  const vis = res.filter(r => S.nfFiltro === 'todos' || r.situacao === S.nfFiltro).sort((a, b) => (pm[a.parceiro_id]?.regiao || '').localeCompare(pm[b.parceiro_id]?.regiao || ''));
  const soma = (k, f = () => true) => res.filter(f).reduce((a, r) => a + Number(r[k] || 0), 0);
  $('#nfs').outerHTML = res.length ? `
    <div class="kpis">
      <div class="kpi"><small>Valor líquido esperado</small><b>${BRL(soma('valor_esperado'))}</b><span>${res.length} parceiros aprovados</span></div>
      <div class="kpi ${cont('a_conferir') ? 'alerta' : 'neutro'}"><small>NFs a conferir</small><b>${cont('a_conferir')}</b><span>parceiros com NF nova</span></div>
      <div class="kpi ${cont('aguardando') ? 'alerta' : 'neutro'}"><small>Aguardando NF</small><b>${cont('aguardando')}</b><span>${BRL(soma('valor_esperado', r => r.situacao === 'aguardando'))}</span></div>
      <div class="kpi"><small>NF conferida</small><b>${cont('conferida')}</b><span>${BRL(soma('valor_conferido'))}</span></div>
    </div>
    <section class="bloco"><div class="linha">${[['todos', 'Todos', res.length], ['a_conferir', 'A conferir', cont('a_conferir')], ['aguardando', 'Aguardando NF', cont('aguardando')], ['faltando', 'Soma diferente', cont('faltando')], ['conferida', 'Conferidas', cont('conferida')]]
      .map(([k, n, qq]) => `<button class="btn ${S.nfFiltro === k ? '' : 'sec'} peq" data-nf="${k}">${n} (${qq})</button>`).join('')}</div>
    <div class="tabela"><table id="nftab"><thead><tr><th>Parceiro</th><th class="n">Aprovado</th><th class="n">Adiantado</th><th class="n">Líquido esperado</th><th class="n">NFs enviadas</th><th class="n">Diferença</th><th>Situação</th></tr></thead><tbody>
    ${vis.map(r => { const p = pm[r.parceiro_id] || {}; const [rot, cls] = SIT_NF[r.situacao] || [r.situacao, '']; const dif = Number(r.valor_nfs) - Number(r.valor_esperado);
      const minhas = nfs.filter(n => n.parceiro_id === r.parceiro_id);
      return `<tr><td><b>${esc(p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome || '')} · ${esc(fmtCNPJ(p.cnpj))}</span></td><td class="n">${BRL2(r.valor_aprovado)}</td><td class="n">${Number(r.adiantado) ? BRL2(r.adiantado) : '—'}</td><td class="n"><b>${BRL2(r.valor_esperado)}</b></td>
        <td class="n">${r.nfs ? `${BRL2(r.valor_nfs)}<br><span class="nota">${r.nfs} NF(s)</span>` : '—'}</td><td class="n" style="color:${Math.abs(dif) > 0.009 && r.nfs ? 'var(--brand-deep)' : 'var(--ink)'}">${r.nfs ? (dif > 0 ? '+' : '') + BRL2(dif) : '—'}</td><td><span class="pill ${cls}">${rot}</span></td></tr>
      ${minhas.map(n => { const ck = n.checagens || {}; const [r2, k2] = ST_NF[n.status] || [n.status, '']; const sinais = [
          ck.cnpj_confere === false ? '<span class="pill marca">CNPJ diferente do cadastro</span>' : '<span class="pill">CNPJ confere</span>',
          ck.texto ? (ck.cnpj_no_pdf ? '<span class="pill">CNPJ no PDF</span>' : '<span class="pill alerta">CNPJ não achado no PDF</span>') : '<span class="pill alerta">PDF sem texto: conferir visualmente</span>',
          ck.valor_confere_pdf === false ? `<span class="pill alerta">PDF mostra ${BRL2(ck.valor_lido)}</span>` : ''].join(' ');
        return `<tr style="background:var(--field)"><td colspan="3" style="padding-left:24px;font-size:13px">NF <b>${esc(n.numero)}</b> · emissão ${fmtD(n.data_emissao)} · enviada ${fmtDH(n.enviado_em)}${n.arquivo_path ? ` · <a href="#" data-nfarq="${esc(n.arquivo_path)}">abrir PDF</a>` : ''}<div style="margin-top:4px">${sinais}</div>${n.motivo_recusa ? `<div class="nota">Recusa: ${esc(n.motivo_recusa)}</div>` : ''}</td>
          <td class="n">${BRL2(n.valor)}</td><td colspan="2"><span class="pill ${k2}">${r2}</span></td>
          <td style="white-space:nowrap">${c.status === 'fechada' ? '' : n.status === 'recebida' ? `<button class="btn peq" data-ok="${n.id}">Conferir</button> <button class="btn sec peq" data-rec="${n.id}">Recusar</button>` : `<button class="btn sec peq" data-reab="${n.id}">Desfazer</button>`}</td></tr>`; }).join('')}`; }).join('')}
    </tbody></table></div></section>` : '<div class="msg alerta">Nenhum parceiro com valor aprovado neste mês. A NF entra depois da aprovação em "Conferência e aprovação".</div>';
  m.querySelectorAll('[data-nf]').forEach(b => b.onclick = () => { S.nfFiltro = b.dataset.nf; vNotas(); });
  m.querySelectorAll('[data-nfarq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const u = await linkArquivo(a.dataset.nfarq); if (u) window.open(u, '_blank'); });
  const run = async (b, args) => { b.disabled = true; try { await q(sb.rpc('conferir_nf', args)); vNotas(); } catch (e) { b.disabled = false; alertaTopo(e.message); } };
  m.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => run(b, { p_nf: b.dataset.ok, p_decisao: 'conferida' }));
  m.querySelectorAll('[data-reab]').forEach(b => b.onclick = () => run(b, { p_nf: b.dataset.reab, p_decisao: 'reabrir' }));
  m.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr'); if (tr.nextElementSibling?.classList.contains('extra')) { tr.nextElementSibling.remove(); return; }
    const l = document.createElement('tr'); l.className = 'extra';
    l.innerHTML = `<td colspan="7" style="background:var(--field)"><div class="linha"><input class="peq" id="rec-m" placeholder="Motivo da recusa (o parceiro vê)" style="flex:1;min-width:280px"><button class="btn peq" id="rec-ok">Recusar NF</button></div></td>`;
    tr.after(l); l.querySelector('#rec-ok').onclick = ev => run(ev.currentTarget, { p_nf: b.dataset.rec, p_decisao: 'recusada', p_motivo: l.querySelector('#rec-m').value });
  });
}

// ================= Conferência e aprovação (admin) =================
const ST_ENV = { recebido: ['Recebido', ''], validado: ['Sem pendências', 'escuro'], com_divergencias: ['Com pendências do parceiro', 'alerta'], aprovado: ['Aprovado', 'escuro'], recusado: ['Devolvido', 'marca'], substituido: ['Substituído', ''] };
async function vConferencia() {
  const m = $('#main');
  if (S.confParc) return detalheConferencia();
  m.innerHTML = `<div class="topo"><div><h1>Conferência e aprovação</h1><p>Relatórios enviados pelos parceiros, já conferidos com o Umov. Decida cada item em aberto, registre ajustes e aprove o valor do mês. Nada é aprovado com item sem decisão.</p></div>${seletorComp(false)}</div><div id="conf" class="carregando">Carregando…</div>`;
  ligarSeletor(vConferencia);
  const c = comp();
  const [envs, fech, divs] = await Promise.all([
    todas(() => sb.from('envios').select('id,parceiro_id,versao,enviado_em,status,totais').eq('competencia_id', c.id).neq('status', 'substituido').order('versao', { ascending: false })),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,status,valor_aprovado,valor_final').eq('competencia_id', c.id)),
    todas(() => sb.from('divergencias').select('envio_id,situacao').eq('competencia_id', c.id).in('situacao', ['precisa_acao', 'em_analise'])),
  ]);
  const ult = {}; envs.forEach(e => { if (!ult[e.parceiro_id]) ult[e.parceiro_id] = e; });
  const fPor = Object.fromEntries(fech.map(f => [f.parceiro_id, f]));
  const pend = {}; divs.forEach(d => { const x = pend[d.envio_id] || (pend[d.envio_id] = { acao: 0, analise: 0 }); d.situacao === 'precisa_acao' ? x.acao++ : x.analise++; });
  const linhas = S.parceiros.filter(p => p.ativo !== false || ult[p.id]).map(p => {
    const e = ult[p.id]; const pd = e ? (pend[e.id] || { acao: 0, analise: 0 }) : null;
    const grupo = !e ? 'sem' : e.status === 'aprovado' ? 'aprovado' : e.status === 'recusado' ? 'devolvido' : (pd.acao + pd.analise) ? 'pendente' : 'pronto';
    return { p, e, pd, grupo, f: fPor[p.id] };
  });
  const cont = k => linhas.filter(l => l.grupo === k).length;
  S.confFiltro = S.confFiltro || 'todos';
  const filtros = [['todos', 'Todos', linhas.length], ['pronto', 'Prontos para aprovar', cont('pronto')], ['pendente', 'Com itens em aberto', cont('pendente')], ['devolvido', 'Devolvidos', cont('devolvido')], ['sem', 'Sem envio', cont('sem')], ['aprovado', 'Aprovados', cont('aprovado')]];
  const vis = linhas.filter(l => S.confFiltro === 'todos' || l.grupo === S.confFiltro).sort((a, b) => a.p.regiao.localeCompare(b.p.regiao));
  const totAprov = linhas.filter(l => l.grupo === 'aprovado').reduce((a, l) => a + (Number(l.f?.valor_aprovado) || 0), 0);
  $('#conf').outerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Relatórios recebidos</small><b>${linhas.length - cont('sem')} de ${linhas.length}</b><span>${cont('sem')} parceiro(s) sem envio</span></div>
      <div class="kpi ${cont('pendente') ? 'alerta' : 'neutro'}"><small>Com itens em aberto</small><b>${cont('pendente')}</b><span>${linhas.reduce((a, l) => a + (l.pd?.analise || 0), 0)} item(ns) aguardam sua decisão</span></div>
      <div class="kpi"><small>Prontos para aprovar</small><b>${cont('pronto')}</b><span>sem item em aberto</span></div>
      <div class="kpi"><small>Aprovados</small><b>${cont('aprovado')}</b><span>${BRL2(totAprov)}</span></div>
    </div>
    <section class="bloco"><div class="linha">${filtros.map(([k, n, q]) => `<button class="btn ${S.confFiltro === k ? '' : 'sec'} peq" data-f="${k}">${n} (${q})</button>`).join('')}</div>
    <div class="tabela"><table><thead><tr><th>Parceiro</th><th>Envio</th><th>Situação</th><th class="n">Informado</th><th class="n">Malote: parceiro x Umov</th><th class="n">Em aberto</th><th></th></tr></thead><tbody>
    ${vis.map(({ p, e, pd, f }) => { const t = e?.totais || {}; const [rot, cls] = e ? ST_ENV[e.status] || [e.status, ''] : ['Sem envio', ''];
      return `<tr><td><b>${esc(p.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.codigo)} · ${esc(p.nome)}</span></td>
      <td style="font-size:13px">${e ? `Envio ${e.versao}<br>${fmtDH(e.enviado_em)}` : '—'}</td>
      <td><span class="pill ${cls}">${esc(rot)}</span>${f?.valor_aprovado != null && e?.status === 'aprovado' ? `<br><span class="nota">${BRL2(f.valor_aprovado)}</span>` : ''}</td>
      <td class="n">${e ? BRL2(t.total) : '—'}</td>
      <td class="n">${e ? `${fmtN(t.malote_qtd)} x ${fmtN(t.umov_qtd)}` : '—'}</td>
      <td class="n">${pd && (pd.acao + pd.analise) ? `${pd.acao ? `<span class="pill alerta">${pd.acao} com o parceiro</span> ` : ''}${pd.analise ? `<span class="pill marca">${pd.analise} com a GSM</span>` : ''}` : '—'}</td>
      <td>${e ? `<button class="btn ${e.status === 'aprovado' ? 'sec' : ''} peq" data-abrir="${p.id}">${e.status === 'aprovado' ? 'Ver' : 'Conferir'}</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.confFiltro = b.dataset.f; vConferencia(); });
  m.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { S.confParc = b.dataset.abrir; detalheConferencia(); });
}

async function linkArquivo(path) { const { data } = await sb.storage.from('envios').createSignedUrl(path, 600); return data?.signedUrl; }

async function detalheConferencia() {
  const m = $('#main'); const c = comp(); const p = S.parceiros.find(x => x.id === S.confParc);
  m.innerHTML = '<div class="carregando">Carregando…</div>';
  const envs = await q(sb.from('envios').select('*').eq('competencia_id', c.id).eq('parceiro_id', p.id).order('versao', { ascending: false }));
  const e = envs.find(x => x.status !== 'substituido') || envs[0];
  const [divs, acoes, ajs, res] = await Promise.all([
    todas(() => sb.from('divergencias').select('*').eq('envio_id', e.id).order('operacao').order('ref_linha')),
    todas(() => sb.from('acoes_parceiro').select('*').eq('parceiro_id', p.id).order('criado_em')),
    q(sb.from('ajustes').select('*').eq('competencia_id', c.id).eq('parceiro_id', p.id).order('criado_em')),
    q(sb.rpc('resumo_aprovacao', { p_envio: e.id })),
  ]);
  const acPor = {}; acoes.forEach(a => (acPor[a.divergencia_id] = acPor[a.divergencia_id] || []).push(a));
  const t = e.totais || {}; const aberto = !['aprovado', 'recusado', 'substituido'].includes(e.status) && c.status !== 'fechada';
  const [rot, cls] = ST_ENV[e.status] || [e.status, ''];
  const desc = (Number(res.ajustes) || 0) - (Number(res.glosas) || 0);
  const final = (Number(res.malote) || 0) + (Number(res.kits) || 0) + (Number(res.fora) || 0) + desc;
  const ativos = divs.filter(d => d.situacao !== 'informativo'); const info = divs.filter(d => d.situacao === 'informativo');
  const linhaDiv = d => { const ac = acPor[d.id] || []; const pend = ['precisa_acao', 'em_analise'].includes(d.situacao);
    return `<tr data-d="${d.id}"><td style="white-space:nowrap">${esc(d.operacao)}</td><td class="num">${esc(d.ref_linha)}</td>
      <td>${esc(d.descricao)}${ac.map(a => `<div style="margin-top:6px;padding:6px 8px;background:#fff;border-left:3px solid var(--brand);font-size:13px"><b>Parceiro, ${fmtDH(a.criado_em)}:</b> ${esc(a.texto || '')}${a.arquivo_path ? ` <a href="#" data-arq="${esc(a.arquivo_path)}">abrir comprovante</a>` : ''}</div>`).join('')}
        ${d.decisao ? `<div class="nota" style="margin-top:4px">GSM: <b>${d.decisao === 'aceita' ? 'aceito' : 'glosado ' + BRL2(d.valor_glosa)}</b>${d.comentario_gsm ? ' — ' + esc(d.comentario_gsm) : ''}</div>` : ''}</td>
      <td class="n">${d.valor == null ? '—' : BRL2(d.valor)}</td>
      <td>${pend ? `<span class="pill ${d.situacao === 'precisa_acao' ? 'alerta' : 'marca'}">${d.situacao === 'precisa_acao' ? 'Sem resposta' : 'Respondido'}</span>` : `<span class="pill escuro">Decidido</span>`}</td>
      <td style="white-space:nowrap">${aberto ? (pend ? `<button class="btn peq" data-ac="${d.id}">Aceitar</button> <button class="btn sec peq" data-gl="${d.id}" data-v="${Math.max(0, Number(d.valor) || 0)}">Glosar</button>` : `<button class="btn sec peq" data-re="${d.id}">Desfazer</button>`) : ''}</td></tr>`; };
  m.innerHTML = `
    <div class="topo"><div><a href="#conferencia" id="voltar" style="font-size:14px">← Todos os parceiros</a><h1>${esc(p.regiao)} · ${nomeMes(c.mes)}</h1><p>${esc(p.codigo)} · ${esc(p.nome)} · Envio ${e.versao} em ${fmtDH(e.enviado_em)} · <span class="pill ${cls}">${esc(rot)}</span></p></div>
      <div class="linha">${e.arquivo_path ? `<button class="btn sec peq" data-arq="${esc(e.arquivo_path)}">Baixar relatório do parceiro</button>` : ''}</div></div>
    ${e.comentario_gsm ? `<div class="msg ${e.status === 'recusado' ? 'erro' : 'ok'}">${esc(e.comentario_gsm)}</div>` : ''}
    <div class="kpis">
      <div class="kpi"><small>Malote informado</small><b>${BRL2(res.malote)}</b><span>fixo ${BRL2(t.malote_fixo)} + atendimentos ${BRL2(t.malote_atend)}</span></div>
      <div class="kpi ${(t.malote_qtd || 0) > (t.umov_qtd || 0) ? 'alerta' : 'neutro'}"><small>Atendimentos: parceiro x Umov</small><b>${fmtN(t.malote_qtd)} x ${fmtN(t.umov_qtd)}</b><span>Umov vale ${BRL2(t.umov_valor)} em atendimentos</span></div>
      <div class="kpi neutro"><small>Kits/Spot</small><b>${BRL2(res.kits)}</b><span>${fmtN(t.kits_qtd)} kit(s)</span></div>
      <div class="kpi neutro"><small>Fora do Umov</small><b>${BRL2(res.fora)}</b><span>serviços avulsos</span></div>
    </div>
    <section class="bloco"><h2>Itens para decidir (${ativos.length})</h2>
      <p class="sub">Aceitar mantém o valor informado. Glosar tira o valor que você indicar e vira desconto, com o motivo que o parceiro vai ler.</p>
      ${ativos.length ? `<div class="tabela"><table><thead><tr><th>Operação</th><th>Item</th><th>O que foi encontrado</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${ativos.map(linhaDiv).join('')}</tbody></table></div>` : '<div class="msg ok">Nenhum item para decidir: o relatório confere com o Umov.</div>'}
      ${info.length ? `<details><summary style="cursor:pointer;font-size:14px">Itens informativos (${info.length}) · não bloqueiam a aprovação</summary><div class="tabela"><table><tbody>${info.map(linhaDiv).join('')}</tbody></table></div></details>` : ''}
    </section>
    <section class="bloco"><h2>Ajustes e descontos</h2>
      <p class="sub">Descontos ou acréscimos que não vêm do relatório (ex.: multa contratual, devolução). Cada um fica registrado com o motivo.</p>
      ${ajs.length ? `<div class="tabela"><table><thead><tr><th>Data</th><th>Operação</th><th>Tipo</th><th>Motivo</th><th class="n">Valor</th></tr></thead><tbody>${ajs.map(a => `<tr><td>${fmtD(a.criado_em)}</td><td>${esc(a.operacao)}</td><td>${esc(a.tipo)}</td><td>${esc(a.motivo || '')}</td><td class="n">${BRL2(a.valor)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${aberto ? `<div class="linha"><select id="aj-op" class="peq"><option>Desconto</option><option>Malote</option><option>Kits/Spot</option><option>Fora do Umov</option></select>
        <select id="aj-tipo" class="peq"><option value="desconto">Desconto (−)</option><option value="acrescimo">Acréscimo (+)</option></select>
        <input id="aj-valor" class="peq" placeholder="Valor (R$)" style="width:120px"><input id="aj-motivo" class="peq" placeholder="Motivo" style="min-width:260px;flex:1"><button class="btn sec peq" id="aj-add">Registrar ajuste</button></div>` : ''}
    </section>
    <section class="bloco"><h2>Valor do mês</h2>
      <div class="tabela" style="max-width:560px"><table><tbody>
        <tr><td>Malote (fixo + atendimentos)</td><td class="n">${BRL2(res.malote)}</td></tr><tr><td>Kits/Spot</td><td class="n">${BRL2(res.kits)}</td></tr><tr><td>Fora do Umov</td><td class="n">${BRL2(res.fora)}</td></tr>
        <tr><td>Glosas</td><td class="n">${BRL2(-(Number(res.glosas) || 0))}</td></tr><tr><td>Ajustes</td><td class="n">${BRL2(res.ajustes)}</td></tr>
        <tr><td><b>Valor a aprovar</b></td><td class="n"><b style="font-size:18px">${BRL2(final)}</b></td></tr></tbody></table></div>
      ${aberto ? `${res.pendentes ? `<div class="msg alerta">Faltam ${res.pendentes} item(ns) sem decisão. A aprovação libera quando todos forem decididos.</div>` : ''}
        <label class="campo" style="max-width:560px">Comentário para o parceiro (opcional na aprovação, obrigatório na devolução)<input type="text" id="ap-com"></label>
        <div class="linha"><button class="btn marca" id="aprovar" ${res.pendentes ? 'disabled' : ''}>Aprovar ${BRL2(final)}</button><button class="btn sec" id="devolver">Devolver ao parceiro</button></div>`
      : e.status === 'aprovado' && c.status !== 'fechada' ? `<div class="linha"><input type="text" id="re-mot" class="peq" placeholder="Motivo da reabertura" style="min-width:320px"><button class="btn sec peq" id="reabrir">Reabrir aprovação</button></div>` : ''}
      <div id="ap-msg"></div>
    </section>
    ${envs.length > 1 ? `<details><summary style="cursor:pointer;font-size:14px">Envios anteriores (${envs.length - 1})</summary><ul style="font-size:13px">${envs.filter(x => x.id !== e.id).map(x => `<li>Envio ${x.versao} · ${fmtDH(x.enviado_em)} · ${esc((ST_ENV[x.status] || [x.status])[0])} · ${BRL2(x.totais?.total)}${x.arquivo_path ? ` · <a href="#" data-arq="${esc(x.arquivo_path)}">arquivo</a>` : ''}</li>`).join('')}</ul></details>` : ''}`;
  const erro = (alvo, msg) => { $('#ap-msg').innerHTML = `<div class="msg erro">${esc(msg)}</div>`; };
  const rodar = async (b, fn) => { b.disabled = true; try { await fn(); await detalheConferencia(); } catch (x) { b.disabled = false; erro(b, x.message); } };
  $('#voltar').onclick = ev => { ev.preventDefault(); S.confParc = null; vConferencia(); };
  m.querySelectorAll('[data-arq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const u = await linkArquivo(a.dataset.arq); if (u) window.open(u, '_blank'); else erro(a, 'Arquivo não encontrado.'); });
  m.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => rodar(b, () => q(sb.rpc('decidir_divergencia', { p_div: b.dataset.ac, p_decisao: 'aceita' }))));
  m.querySelectorAll('[data-re]').forEach(b => b.onclick = () => rodar(b, () => q(sb.rpc('decidir_divergencia', { p_div: b.dataset.re, p_decisao: 'reabrir' }))));
  m.querySelectorAll('[data-gl]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr'); if (tr.nextElementSibling?.classList.contains('glosa')) { tr.nextElementSibling.remove(); return; }
    const l = document.createElement('tr'); l.className = 'glosa';
    l.innerHTML = `<td colspan="6" style="background:var(--field)"><div class="linha"><label class="campo">Valor a glosar<input class="peq" id="gv" value="${String(b.dataset.v).replace('.', ',')}" style="width:130px"></label>
      <label class="campo" style="flex:1;min-width:260px">Motivo (o parceiro vê)<input class="peq" id="gm"></label><button class="btn peq" id="gok" style="align-self:flex-end">Confirmar glosa</button></div></td>`;
    tr.after(l);
    l.querySelector('#gok').onclick = ev => { const v = numBR(l.querySelector('#gv').value); if (v == null || Number.isNaN(v) || v < 0) return erro(null, 'Valor da glosa inválido.');
      rodar(ev.currentTarget, () => q(sb.rpc('decidir_divergencia', { p_div: b.dataset.gl, p_decisao: 'glosada', p_comentario: l.querySelector('#gm').value, p_glosa: v }))); };
  });
  const add = $('#aj-add');
  if (add) add.onclick = () => { const v = numBR($('#aj-valor').value); const mot = $('#aj-motivo').value.trim(); const tipo = $('#aj-tipo').value;
    if (v == null || Number.isNaN(v) || v <= 0) return erro(null, 'Informe o valor do ajuste (positivo; o tipo define o sinal).');
    if (!mot) return erro(null, 'Informe o motivo do ajuste.');
    rodar(add, () => q(sb.from('ajustes').insert({ competencia_id: c.id, parceiro_id: p.id, operacao: $('#aj-op').value, tipo, valor: tipo === 'desconto' ? -v : v, motivo: mot, criado_por: S.user.id }))); };
  const ap = $('#aprovar'); if (ap) ap.onclick = () => rodar(ap, async () => { await q(sb.rpc('aprovar_envio', { p_envio: e.id, p_comentario: $('#ap-com').value })); });
  const dv = $('#devolver'); if (dv) dv.onclick = () => rodar(dv, () => q(sb.rpc('devolver_envio', { p_envio: e.id, p_comentario: $('#ap-com').value })));
  const rb = $('#reabrir'); if (rb) rb.onclick = () => rodar(rb, () => q(sb.rpc('reabrir_envio', { p_envio: e.id, p_motivo: $('#re-mot').value })));
}

// ================= Diretoria e financeiro =================
const BRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRLk = v => { const n = Number(v) || 0; return Math.abs(n) >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : 'R$ ' + Math.round(n / 1000).toLocaleString('pt-BR') + ' mil'; };
const pct = v => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const OPS = { tudo: 'Tudo', malote: 'Malote', kits: 'Kits/Spot' };
// Mês fechado conta todos como fechados (os textos de situação das planilhas antigas variam)
const fechado = r => (S.compsFechadas && S.compsFechadas.has(r.competencia_id)) || (r.status ? /^(ok|aprovado|pago|nf conferida)/i.test(r.status) : r.valor_aprovado != null);
const valorOp = (r, op) => op === 'malote' ? Number(r.malote) || 0 : op === 'kits' ? Number(r.kits) || 0 : Number(r.valor_aprovado ?? r.valor_final) || 0;

async function iniciarConsulta() {
  app.innerHTML = `
  <div style="min-height:100vh;display:flex;flex-direction:column">
    <header style="background:var(--ink);color:#fff;border-left:8px solid var(--brand)">
      <div style="max-width:1240px;margin:0 auto;padding:18px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <img src="logo_escuro.png" alt="GSM Log" style="height:34px;width:102px;object-fit:contain">
          <div><div class="eyebrow">Fechamento de última milha</div><div style="font-size:18px;font-weight:600">${S.perfil.papel === 'financeiro' ? 'Financeiro' : 'Diretoria'}</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;font-size:13px;color:var(--on-dark)"><span>${esc(S.user.email)}</span>
          <button id="sair" style="font:inherit;font-size:13px;color:#fff;background:none;border:1px solid #3A3639;border-radius:6px;padding:8px 12px;cursor:pointer">Sair</button></div>
      </div>
    </header>
    <main id="main" style="max-width:1240px;width:100%;margin:0 auto"></main>
  </div>`;
  $('#sair').onclick = sair;
  vDiretoria($('#main'));
}

async function vDiretoria(el) {
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  const [comps, parcs, fech, prev, efic, adis] = await Promise.all([
    q(sb.from('competencias').select('id,mes,status').order('mes')),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,tipo,dia_pagamento,ativo')),
    todas(() => sb.from('fechamento_parceiro').select('competencia_id,parceiro_id,status,malote,kits,descontos,valor_final,valor_aprovado,adiantado,pago_em,data_pagamento')),
    todas(() => sb.from('previsao_realizado').select('competencia_id,parceiro_id,previsto,origem_previsao,atendimentos_previstos,pontos')),
    todas(() => sb.from('dir_eficiencia').select('competencia_id,parceiro_id,pontos,atend_previstos,atend_umov')),
    todas(() => sb.from('adiantamentos').select('competencia_id,parceiro_id,valor,taxa_pct,valor_desconto,status')),
  ]);
  S.compsFechadas = new Set(comps.filter(c => c.status === 'fechada').map(c => c.id));
  const comComDados = comps.filter(c => fech.some(f => f.competencia_id === c.id) || prev.some(f => f.competencia_id === c.id && f.previsto != null));
  if (!comComDados.length) { el.innerHTML = '<div class="msg alerta">Ainda não há fechamentos registrados.</div>'; return; }
  S.dir = S.dir || {};
  const D = S.dir;
  D.comps = comComDados; D.parcs = parcs; D.fech = fech; D.prev = prev; D.efic = efic; D.adis = adis.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status)); D.aba = D.aba || 'resumo';
  if (!D.compId || !comComDados.some(c => c.id === D.compId)) D.compId = comComDados[comComDados.length - 1].id;
  D.op = D.op || 'tudo'; D.sort = D.sort || ['total', -1];
  desenharDiretoria(el);
}

function desenharDiretoria(el) {
  const D = S.dir; const op = D.op;
  const idx = D.comps.findIndex(c => c.id === D.compId); const c = D.comps[idx]; const ant = D.comps[idx - 1];
  const doMes = id => D.fech.filter(f => f.competencia_id === id);
  const prevMes = id => D.prev.filter(f => f.competencia_id === id && f.previsto != null);
  const prevPor = Object.fromEntries(prevMes(c.id).map(r => [r.parceiro_id, r]));
  const somaPrev = id => prevMes(id).reduce((a, r) => a + Number(r.previsto), 0);
  const realMal = id => doMes(id).reduce((a, r) => a + (Number(r.malote) || 0), 0);
  const serieP = D.comps.map(x => ({ c: x, p: somaPrev(x.id), r: doMes(x.id).length ? realMal(x.id) : null, origem: (prevMes(x.id)[0] || {}).origem_previsao }));
  const linhas = doMes(c.id).concat(prevMes(c.id).filter(r => !D.fech.some(f => f.competencia_id === c.id && f.parceiro_id === r.parceiro_id)).map(r => ({ parceiro_id: r.parceiro_id, status: 'Sem fechamento', malote: null, kits: null, descontos: null, valor_final: null, sem: true }))); const linhasAnt = ant ? doMes(ant.id) : [];
  const soma = (ls) => ls.reduce((a, r) => a + valorOp(r, op), 0);
  const total = soma(linhas), totalAnt = ant ? soma(linhasAnt) : null;
  const nFech = linhas.filter(fechado).length;
  const vFech = linhas.filter(fechado).reduce((a, r) => a + valorOp(r, op), 0);
  const desc = linhas.reduce((a, r) => a + (Number(r.descontos) || 0), 0);
  const serie = D.comps.map(x => ({ c: x, v: soma(doMes(x.id)) }));
  const pmap = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const antPor = Object.fromEntries(linhasAnt.map(r => [r.parceiro_id, valorOp(r, op)]));
  let tab = linhas.map(r => { const p = pmap[r.parceiro_id] || {}; const v = valorOp(r, op);
    return { id: r.parceiro_id, regiao: p.regiao || '—', nome: p.nome || '', tipo: p.tipo || '', malote: Number(r.malote) || 0, kits: Number(r.kits) || 0, desc: Number(r.descontos) || 0, total: v,
      varr: antPor[r.parceiro_id] && !r.sem ? v / antPor[r.parceiro_id] - 1 : null,
      prev: prevPor[r.parceiro_id] ? Number(prevPor[r.parceiro_id].previsto) : null, dif: prevPor[r.parceiro_id] && !r.sem ? (Number(r.malote) || 0) - Number(prevPor[r.parceiro_id].previsto) : null, status: r.status || (r.valor_aprovado != null ? 'Aprovado' : '—'), fechado: fechado(r), dia: p.dia_pagamento || '—', pago: r.pago_em }; });
  const [sk, sd] = D.sort;
  tab.sort((a, b) => (typeof a[sk] === 'string' ? a[sk].localeCompare(b[sk]) : (a[sk] ?? -1e15) - (b[sk] ?? -1e15)) * sd);
  if (D.filtro) { const f = norm(D.filtro); tab = tab.filter(t => norm(t.regiao + ' ' + t.nome).includes(f)); }

  el.innerHTML = `
  <div class="topo"><div><h1>Fechamento de ${nomeMes(c.mes)}</h1><p>${c.status === 'fechada' ? 'Competência fechada.' : 'Competência em andamento: os valores mudam até o fechamento.'} Valores por parceiro${op === 'tudo' ? ', já com descontos' : ''}.</p></div>
    <div class="linha">
      <div class="alterna" role="group" aria-label="Operação" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:#fff">
        ${Object.entries(OPS).map(([k, n]) => `<button type="button" data-op="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${k === op ? 'background:var(--ink);color:#fff;font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}
      </div>
      <select id="dcomp" class="peq" style="min-height:44px;font-size:15px">${D.comps.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${nomeMes(x.mes)}</option>`).join('')}</select>
    </div></div>
  <div class="kpis">
    <div class="kpi"><small>${OPS[op]} · ${nomeMes(c.mes)}</small><b>${BRL(total)}</b><span>${ant && total ? `${pct(total / totalAnt - 1)} sobre ${MES3[+ant.mes.slice(5, 7) - 1]}` : ''}</span></div>
    <div class="kpi ${nFech < linhas.length ? 'alerta' : ''}"><small>Parceiros fechados</small><b>${nFech} de ${linhas.length}</b><span>${Math.round(100 * nFech / Math.max(1, linhas.length))}% dos parceiros</span></div>
    <div class="kpi ${vFech < total ? 'alerta' : ''}"><small>Valor fechado</small><b>${BRL(vFech)}</b><span>${total ? Math.round(100 * vFech / total) : 0}% do valor do mês</span></div>
    ${kpiPrev(serieP.find(x => x.c.id === c.id))}
    <div class="kpi neutro"><small>Descontos aplicados</small><b>${BRL(desc)}</b><span>no mês</span></div>
  </div>
  <nav class="abas" style="flex-wrap:wrap">${ABAS_DIR.concat(S.perfil?.papel === 'financeiro' || S.perfil?.papel === 'admin' ? [['lotes', 'Lotes de pagamento']] : []).map(([k, n]) => `<button type="button" data-aba="${k}" class="${D.aba === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
  <div data-sec="resumo" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><h2>2026 até ${nomeMes(c.mes)}</h2><div id="dano"></div></section>
  <section class="bloco"><h2>Evolução em 2026 · ${OPS[op]}</h2><div id="graf" style="position:relative"></div></section>
  <section class="bloco"><h2>Clientes de ${nomeMes(c.mes)}</h2><div id="dcli" class="carregando">Carregando…</div></section>
  </div>
  <div data-sec="variacao" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>O que mudou de ${ant ? nomeMes(ant.mes) : '—'} para ${nomeMes(c.mes)}</h2><div id="dponte" style="position:relative"></div></section></div>
  <div data-sec="eficiencia" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Custo unitário e execução · ${nomeMes(c.mes)}</h2><div id="defic"></div></section></div>
  <div data-sec="lotes" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Lotes de pagamento · ${nomeMes(c.mes)}</h2><p class="sub">Baixe a capa e as NFs de cada lote e registre o pagamento quando ele for feito.</p><div id="dlotes"></div></section></div>
  <div data-sec="caixa" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Caixa e pagamentos · ${nomeMes(c.mes)}</h2><div id="dpag"></div></section></div>
  <div data-sec="previsto" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><h2>Previsto (calendarizado) x Realizado · Malote</h2>
    <p class="sub">Previsto = valor fixo do contrato + atendimentos calendarizados de cada ponto × valor unitário. Realizado = malote fechado do parceiro. Kits/Spot não entram na previsão.</p>
    <div id="gprev" style="position:relative"></div><div id="tprev"></div></section></div>
  <div data-sec="parceiros" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><div class="linha" style="justify-content:space-between"><h2>Parceiros</h2>
      <div class="linha"><input id="dfiltro" class="peq" placeholder="Filtrar parceiro" value="${esc(D.filtro || '')}" style="min-width:200px"><button class="btn sec peq" id="dcsv">Baixar tabela (CSV)</button></div></div>
    <div class="tabela"><table id="dtab"><thead><tr>
      ${[['regiao', 'Parceiro'], ['prev', 'Previsto', 1], ['malote', 'Malote', 1], ['dif', 'Malote − previsto', 1], ['kits', 'Kits/Spot', 1], ['desc', 'Descontos', 1], ['total', OPS[op] === 'Tudo' ? 'Total' : OPS[op], 1], ['varr', 'Var. mês', 1], ['dia', 'Pagamento'], ['status', 'Situação']]
        .map(([k, n, num]) => `<th class="${num ? 'n' : ''}" data-sort="${k}" style="cursor:pointer;white-space:nowrap">${n}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${tab.map(t => `<tr data-p="${t.id}" style="cursor:pointer">
        <td><b>${esc(t.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(t.nome)}${t.tipo ? ' · ' + esc(t.tipo) : ''}</span></td>
        <td class="n" style="color:var(--muted)">${t.prev == null ? '—' : BRL(t.prev)}</td><td class="n">${BRL(t.malote)}</td>
        <td class="n" style="color:${t.dif > 0.5 ? 'var(--brand-deep)' : 'var(--ink)'}">${t.dif == null ? '—' : (t.dif > 0 ? '+' : '') + BRL(t.dif)}${t.dif != null && t.prev ? `<br><span style="font-size:12px;color:var(--muted)">${pct(t.dif / t.prev)}</span>` : ''}</td><td class="n">${BRL(t.kits)}</td><td class="n">${t.desc ? BRL(t.desc) : '—'}</td><td class="n"><b>${BRL(t.total)}</b></td>
        <td class="n" style="color:${t.varr > 0.1 ? 'var(--brand-deep)' : 'var(--ink)'}">${pct(t.varr)}</td>
        <td style="font-size:13px">${esc(t.dia)}${t.pago ? `<br><span class="pill escuro">Pago ${fmtD(t.pago)}</span>` : ''}</td>
        <td><span class="pill ${t.fechado ? 'escuro' : t.sem ? '' : 'alerta'}">${esc(t.fechado ? 'Fechado' : t.status)}</span></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>Total (${tab.length})</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + (t.prev || 0), 0))}</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + t.malote, 0))}</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + (t.dif || 0), 0))}</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + t.kits, 0))}</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + t.desc, 0))}</b></td><td class="n"><b>${BRL(tab.reduce((a, t) => a + t.total, 0))}</b></td><td colspan="3"></td></tr></tfoot></table></div>
    <p class="nota">Clique em um parceiro para ver a evolução e os clientes atendidos.</p>
  </section></div>`;
  el.querySelectorAll('[data-sec]').forEach(x => x.style.display = x.dataset.sec === D.aba ? 'flex' : 'none');
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { D.aba = b.dataset.aba; desenharDiretoria(el); });
  blocoAno($('#dano'), D, c);
  ponte($('#dponte'), D, c, ant);
  eficiencia($('#defic'), D, c);
  if (D.aba === 'lotes') listaLotes($('#dlotes'), c.id, false);

  grafico($('#graf'), serie.map(x => ({ rot: MES3[+x.c.mes.slice(5, 7) - 1], v: x.v, atual: x.c.id === c.id, id: x.c.id })));
  pagamentos($('#dpag'), D.adis.filter(a => a.competencia_id === c.id), doMes(c.id).map(r => ({ dia: (pmap[r.parceiro_id] || {}).dia_pagamento || '—', total: valorOp(r, 'tudo'), adi: Number(r.adiantado) || 0, pago: r.pago_em, fechado: fechado(r) })));
  graficoPrev($('#gprev'), $('#tprev'), serieP, c.id);
  clientesMes($('#dcli'), c.id, op, null);
  el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { D.op = b.dataset.op; desenharDiretoria(el); });
  $('#dcomp').onchange = e => { D.compId = e.target.value; desenharDiretoria(el); };
  el.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => { const k = th.dataset.sort; D.sort = [k, D.sort[0] === k ? -D.sort[1] : (k === 'regiao' || k === 'dia' || k === 'status' ? 1 : -1)]; desenharDiretoria(el); });
  $('#dfiltro').oninput = e => { D.filtro = e.target.value; clearTimeout(D.t); D.t = setTimeout(() => { desenharDiretoria(el); const i = $('#dfiltro'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); };
  $('#dcsv').onclick = () => {
    const linhasCsv = [['Regiao', 'Parceiro', 'Previsto', 'Malote', 'Malote - previsto', 'Kits/Spot', 'Descontos', 'Total', 'Var mes', 'Pagamento', 'Situacao'].join(';'),
      ...tab.map(t => [t.regiao, t.nome, t.prev ?? '', t.malote, t.dif ?? '', t.kits, t.desc, t.total, t.varr == null ? '' : (t.varr * 100).toFixed(1) + '%', t.dia, t.fechado ? 'Fechado' : t.status].map(v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`).join(';'))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhasCsv.join('\n')], { type: 'text/csv' }));
    a.download = `Fechamento_${c.mes.slice(0, 7)}_${op}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  el.querySelectorAll('#dtab tbody tr[data-p]').forEach(tr => tr.onclick = () => detalheParceiro(tr, tr.dataset.p, c, op));
}

// Barras verticais (um série, cor da marca; mês selecionado em destaque) com dica ao passar o mouse
function grafico(box, pts) {
  const W = 900, H = 260, L = 70, R = 12, T = 16, B = 34;
  const max = Math.max(...pts.map(p => p.v), 1); const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / nice) * nice;
  const bw = (W - L - R) / pts.length; const y = v => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top];
  box.innerHTML = `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;height:auto;display:block" role="img" aria-label="Evolução mensal">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#E9E7E3" stroke-width="1"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="#6E6E72" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${pts.map((p, i) => { const x = L + i * bw + bw * 0.2, w = bw * 0.6, h = Math.max(0, y(0) - y(p.v));
      return `<g data-i="${i}"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>
        <path d="M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z" fill="${p.atual ? '#DB2242' : '#121112'}" opacity="${p.atual ? 1 : 0.82}"/>
        <text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="${p.atual ? '#A3182F' : '#6E6E72'}" font-weight="${p.atual ? 600 : 400}" font-family="Poppins">${p.rot}</text></g>`; }).join('')}
  </svg></div><div id="gtip" hidden style="position:absolute;pointer-events:none;background:#121112;color:#fff;font-size:13px;padding:8px 10px;border-radius:6px;white-space:nowrap"></div>`;
  const tip = box.querySelector('#gtip'); const svg = box.querySelector('svg');
  svg.querySelectorAll('g[data-i]').forEach(g => {
    g.onmousemove = e => { const p = pts[+g.dataset.i]; const ant = pts[+g.dataset.i - 1]; tip.hidden = false;
      tip.innerHTML = `<b>${p.rot}</b> · ${BRL(p.v)}${ant && ant.v ? `<br><span style="color:#B8B6B4">${pct(p.v / ant.v - 1)} sobre ${ant.rot}</span>` : ''}`;
      const r = box.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 180) + 'px'; tip.style.top = (e.clientY - r.top - 50) + 'px'; };
    g.onmouseleave = () => tip.hidden = true;
    g.style.cursor = 'pointer';
    g.onclick = () => { S.dir.compId = pts[+g.dataset.i].id; desenharDiretoria(box.closest('main') || $('#main')); };
  });
}

function kpiPrev(x) {
  if (!x || !x.p) return `<div class="kpi neutro"><small>Previsto (calendarizado)</small><b>—</b><span>sem base do mês gerada</span></div>`;
  if (x.r == null) return `<div class="kpi neutro"><small>Previsto (calendarizado) · malote</small><b>${BRL(x.p)}</b><span>previsão do mês · ainda sem realizado</span></div>`;
  const d = x.r - x.p;
  return `<div class="kpi ${d > 0 ? 'alerta' : ''}"><small>Malote realizado x previsto</small><b>${(d > 0 ? '+' : '') + BRL(d)}</b><span>${pct(d / x.p)} · previsto ${BRLk(x.p)}</span></div>`;
}

// Duas barras por mês: previsto (contorno) e realizado (cheia)
function graficoPrev(box, tbox, pts, atualId) {
  const W = 900, H = 240, L = 70, R = 12, T = 16, B = 34;
  const max = Math.max(...pts.map(p => Math.max(p.p || 0, p.r || 0)), 1); const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / nice) * nice;
  const bw = (W - L - R) / pts.length; const y = v => T + (H - T - B) * (1 - v / top);
  const rot = p => MES3[+p.c.mes.slice(5, 7) - 1];
  box.innerHTML = `<div class="linha" style="font-size:13px;color:var(--muted);gap:18px"><span><i style="display:inline-block;width:12px;height:12px;border:2px solid #121112;border-radius:2px;vertical-align:-2px"></i> Previsto</span><span><i style="display:inline-block;width:12px;height:12px;background:#DB2242;border-radius:2px;vertical-align:-2px"></i> Realizado</span></div>
  <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;height:auto;display:block" role="img" aria-label="Previsto x realizado">
    ${[0, top / 2, top].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#E9E7E3"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="#6E6E72" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${pts.map((p, i) => { const x0 = L + i * bw, w = bw * 0.3, g = 3;
      const bar = (v, x, cheia) => v ? `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="2" ${cheia ? 'fill="#DB2242"' : 'fill="#FBFAF8" stroke="#121112" stroke-width="1.5"'}/>` : '';
      return `<g data-i="${i}"><rect x="${x0}" y="${T}" width="${bw}" height="${H - T - B}" fill="${p.c.id === atualId ? '#F6F5F2' : 'transparent'}"/>
        ${bar(p.p, x0 + bw / 2 - w - g / 2, false)}${bar(p.r, x0 + bw / 2 + g / 2, true)}
        <text x="${x0 + bw / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="${p.c.id === atualId ? '#A3182F' : '#6E6E72'}" font-weight="${p.c.id === atualId ? 600 : 400}" font-family="Poppins">${rot(p)}</text></g>`; }).join('')}
  </svg></div><div class="gt" hidden style="position:absolute;pointer-events:none;background:#121112;color:#fff;font-size:13px;padding:8px 10px;border-radius:6px;white-space:nowrap"></div>`;
  const tip = box.querySelector('.gt');
  box.querySelectorAll('g[data-i]').forEach(g => {
    const p = pts[+g.dataset.i];
    g.onmousemove = e => { tip.hidden = false;
      tip.innerHTML = `<b>${rot(p)}</b><br>Previsto ${p.p ? BRL(p.p) : '—'}<br>Realizado ${p.r != null ? BRL(p.r) : '—'}${p.p && p.r != null ? `<br><span style="color:#B8B6B4">${pct(p.r / p.p - 1)}</span>` : ''}`;
      const r = box.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top - 70) + 'px'; };
    g.onmouseleave = () => tip.hidden = true; g.style.cursor = 'pointer';
    g.onclick = () => { S.dir.compId = p.c.id; desenharDiretoria(box.closest('main') || $('#main')); };
  });
  const comAmbos = pts.filter(p => p.p && p.r != null);
  const tp = comAmbos.reduce((a, p) => a + p.p, 0), tr = comAmbos.reduce((a, p) => a + p.r, 0);
  tbox.innerHTML = `<div class="tabela"><table><thead><tr><th>Mês</th><th class="n">Previsto</th><th class="n">Realizado</th><th class="n">Diferença</th><th class="n">%</th><th>Origem da previsão</th></tr></thead><tbody>
    ${pts.map(p => `<tr${p.c.id === atualId ? ' style="background:var(--field);font-weight:600"' : ''}><td>${nomeMes(p.c.mes)}</td><td class="n">${p.p ? BRL(p.p) : '—'}</td><td class="n">${p.r != null ? BRL(p.r) : '—'}</td>
      <td class="n">${p.p && p.r != null ? ((p.r - p.p > 0 ? '+' : '') + BRL(p.r - p.p)) : '—'}</td><td class="n">${p.p && p.r != null ? pct(p.r / p.p - 1) : '—'}</td>
      <td style="font-size:13px;color:var(--muted)">${p.origem === 'planilha' ? 'Planilha de fechamento' : p.origem === 'portal' ? 'Calculado no portal' : 'Base do mês ainda não gerada'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>Acumulado</b></td><td class="n"><b>${BRL(tp)}</b></td><td class="n"><b>${BRL(tr)}</b></td><td class="n"><b>${(tr - tp > 0 ? '+' : '') + BRL(tr - tp)}</b></td><td class="n"><b>${tp ? pct(tr / tp - 1) : '—'}</b></td><td></td></tr></tfoot></table></div>
    <p class="nota">Meses fechados usam o calendarizado da planilha de fechamento. A partir de outubro, a previsão é calculada pelo portal quando a base do mês é gerada (Carteira de pontos → Gerar base).</p>`;
}

const ABAS_DIR = [['resumo', 'Resumo'], ['previsto', 'Previsto x Realizado'], ['variacao', 'Variação do mês'], ['eficiencia', 'Custo unitário'], ['caixa', 'Caixa'], ['parceiros', 'Parceiros']];

// Acumulado do ano e projeção: realizado dos meses fechados + previsto (calendarizado) dos que faltam
function blocoAno(box, D, c) {
  const ano = c.mes.slice(0, 4);
  const real = {}; const prevM = {};
  D.fech.forEach(f => { const x = D.comps.find(k => k.id === f.competencia_id); if (!x || x.mes.slice(0, 4) !== ano) return; const m = +x.mes.slice(5, 7); real[m] = (real[m] || 0) + valorOp(f, 'tudo'); });
  D.prev.forEach(f => { const x = D.comps.find(k => k.id === f.competencia_id); if (!x || f.previsto == null || x.mes.slice(0, 4) !== ano) return; const m = +x.mes.slice(5, 7); prevM[m] = (prevM[m] || 0) + Number(f.previsto); });
  const mesSel = +c.mes.slice(5, 7);
  const ate = Object.entries(real).filter(([m]) => +m <= mesSel); const acum = ate.reduce((a, [, v]) => a + v, 0);
  const prevAte = Object.entries(prevM).filter(([m]) => +m <= mesSel && real[m] != null).reduce((a, [, v]) => a + v, 0);
  const malAte = D.fech.filter(f => { const x = D.comps.find(k => k.id === f.competencia_id); return x && x.mes.slice(0, 4) === ano && +x.mes.slice(5, 7) <= mesSel; }).reduce((a, f) => a + (Number(f.malote) || 0), 0);
  const fechados = Object.keys(real).map(Number); const ultimoReal = Math.max(...fechados);
  const ultPrev = Object.keys(prevM).map(Number).sort((a, b) => b - a)[0];
  let futuro = 0; const base = []; for (let m = ultimoReal + 1; m <= 12; m++) { const v = prevM[m] ?? prevM[ultPrev] ?? 0; futuro += v; base.push(`${MES3[m - 1]} ${prevM[m] != null ? 'calendarizado do mês' : `repete ${MES3[ultPrev - 1]}`}`); }
  const realAno = Object.values(real).reduce((a, v) => a + v, 0); const proj = realAno + futuro;
  box.innerHTML = `<div class="kpis">
    <div class="kpi"><small>Acumulado ${MES3[0]}–${MES3[mesSel - 1]}</small><b>${BRL(acum)}</b><span>${ate.length} mês(es) com fechamento</span></div>
    <div class="kpi neutro"><small>Média mensal</small><b>${BRL(ate.length ? acum / ate.length : 0)}</b><span>${BRLk((ate.length ? acum / ate.length : 0) * 12)} em 12 meses neste ritmo</span></div>
    <div class="kpi ${malAte > prevAte ? 'alerta' : 'neutro'}"><small>Malote acumulado x previsto</small><b>${prevAte ? pct(malAte / prevAte - 1) : '—'}</b><span>${BRLk(malAte)} realizado · ${BRLk(prevAte)} previsto</span></div>
    <div class="kpi"><small>Projeção de ${ano}</small><b>${BRL(proj)}</b><span>${BRLk(realAno)} realizado + ${BRLk(futuro)} previsto</span></div>
    <div class="kpi neutro"><small>Save com adiantamentos no ano</small><b>${BRL2((D.adis || []).filter(a => { const x = D.comps.find(k => k.id === a.competencia_id); return x && x.mes.slice(0, 4) === ano && +x.mes.slice(5, 7) <= mesSel; }).reduce((s2, a) => s2 + Number(a.valor_desconto || 0), 0))}</b><span>desconto aplicado nos adiantamentos</span></div>
  </div>
  <p class="nota">Projeção = valor realizado de ${MES3[0]} a ${MES3[ultimoReal - 1]} + calendarizado dos meses seguintes (${base.join(', ') || 'nenhum'}). O calendarizado cobre o malote; kits/spot e descontos dos meses futuros não entram até acontecerem.</p>`;
}

// Ponte de variação entre dois meses (Tudo)
function ponte(box, D, c, ant) {
  const cur = D.fech.filter(f => f.competencia_id === c.id); const prv = ant ? D.fech.filter(f => f.competencia_id === ant.id) : [];
  if (!ant || !cur.length || !prv.length) { box.innerHTML = `<p class="nota">${!cur.length ? 'Este mês ainda não tem fechamento.' : 'Não há mês anterior para comparar.'}</p>`; return; }
  const n = v => Number(v) || 0; const tot = r => valorOp(r, 'tudo');
  const pA = Object.fromEntries(prv.map(r => [r.parceiro_id, r])); const pC = Object.fromEntries(cur.map(r => [r.parceiro_id, r]));
  const cont = cur.filter(r => pA[r.parceiro_id]);
  const comp = { malote: 0, kits: 0, desc: 0, outros: 0 };
  cont.forEach(r => { const a = pA[r.parceiro_id];
    comp.malote += n(r.malote) - n(a.malote); comp.kits += n(r.kits) - n(a.kits); comp.desc += n(r.descontos) - n(a.descontos);
    comp.outros += (tot(r) - n(r.malote) - n(r.kits) - n(r.descontos)) - (tot(a) - n(a.malote) - n(a.kits) - n(a.descontos)); });
  const novos = cur.filter(r => !pA[r.parceiro_id]); const sairam = prv.filter(r => !pC[r.parceiro_id]);
  const vA = prv.reduce((a, r) => a + tot(r), 0), vC = cur.reduce((a, r) => a + tot(r), 0);
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const passos = [['Malote', comp.malote], ['Kits/Spot', comp.kits], ['Descontos', comp.desc], ['Outros ajustes', comp.outros], [`Parceiros novos (${novos.length})`, novos.reduce((a, r) => a + tot(r), 0)], [`Parceiros que saíram (${sairam.length})`, -sairam.reduce((a, r) => a + tot(r), 0)]].filter(x => Math.abs(x[1]) >= 0.5);
  const barras = [{ rot: MES3[+ant.mes.slice(5, 7) - 1], ini: 0, fim: vA, tipo: 'total' }]; let acc = vA;
  passos.forEach(([r, v]) => { barras.push({ rot: r, ini: acc, fim: acc + v, tipo: v >= 0 ? 'sobe' : 'desce', v }); acc += v; });
  barras.push({ rot: MES3[+c.mes.slice(5, 7) - 1], ini: 0, fim: vC, tipo: 'total' });
  const lo = Math.min(...barras.filter(b => b.tipo !== 'total').map(b => Math.min(b.ini, b.fim)), vA, vC) * 0.97;
  const hi = Math.max(...barras.map(b => Math.max(b.ini, b.fim))) * 1.01;
  const W = 900, H = 280, L = 70, R = 12, T = 24, B = 54; const bw = (W - L - R) / barras.length; const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const cor = { total: '#121112', sobe: '#DB2242', desce: '#6E6E72' };
  box.innerHTML = `<p class="sub" style="margin:0">Variação total: <b>${(vC - vA > 0 ? '+' : '') + BRL(vC - vA)}</b> (${pct(vC / vA - 1)}). Vermelho aumenta o custo; cinza reduz. O eixo começa em ${BRLk(lo)} para mostrar as diferenças.</p>
  <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:620px;height:auto;display:block" role="img" aria-label="Ponte de variação">
    ${[lo, (lo + hi) / 2, hi].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#E9E7E3"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="#6E6E72" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${barras.map((b, i) => { const x = L + i * bw + bw * 0.18, w = bw * 0.64; const top = y(Math.max(b.ini, b.fim)), bot = b.tipo === 'total' ? y(lo) : y(Math.min(b.ini, b.fim));
      const lbl = b.tipo === 'total' ? BRLk(b.fim) : (b.v > 0 ? '+' : '') + BRLk(b.v);
      return `<rect x="${x}" y="${top}" width="${w}" height="${Math.max(2, bot - top)}" rx="3" fill="${cor[b.tipo]}"><title>${esc(b.rot)}: ${b.tipo === 'total' ? BRL(b.fim) : BRL(b.v)}</title></rect>
        ${i < barras.length - 1 ? `<line x1="${x + w}" x2="${x + bw}" y1="${y(b.fim)}" y2="${y(b.fim)}" stroke="#B8B6B4" stroke-dasharray="3 3"/>` : ''}
        <text x="${x + w / 2}" y="${top - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="#121112" font-family="Poppins">${lbl}</text>
        <foreignObject x="${L + i * bw}" y="${H - B + 6}" width="${bw}" height="${B - 6}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:12px Poppins,sans-serif;color:#6E6E72;text-align:center;line-height:1.2">${esc(b.rot)}</div></foreignObject>`; }).join('')}
  </svg></div>
  ${(() => { const dif = cont.map(r => ({ p: pm[r.parceiro_id] || {}, d: tot(r) - tot(pA[r.parceiro_id]) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
    return `<div class="tabela"><table><thead><tr><th>Maiores variações por parceiro</th><th class="n">${MES3[+ant.mes.slice(5, 7) - 1]}</th><th class="n">${MES3[+c.mes.slice(5, 7) - 1]}</th><th class="n">Diferença</th></tr></thead><tbody>
    ${dif.map(x => `<tr><td>${esc(x.p.regiao || '—')}</td><td class="n">${BRL(tot(pA[x.p.id]))}</td><td class="n">${BRL(tot(pC[x.p.id]))}</td><td class="n" style="color:${x.d > 0 ? 'var(--brand-deep)' : 'var(--ink)'}">${(x.d > 0 ? '+' : '') + BRL(x.d)}</td></tr>`).join('')}
    ${novos.map(r => `<tr><td>${esc((pm[r.parceiro_id] || {}).regiao || '—')} <span class="pill">novo</span></td><td class="n">—</td><td class="n">${BRL(tot(r))}</td><td class="n">+${BRL(tot(r))}</td></tr>`).join('')}
    ${sairam.map(r => `<tr><td>${esc((pm[r.parceiro_id] || {}).regiao || '—')} <span class="pill">saiu</span></td><td class="n">${BRL(tot(r))}</td><td class="n">—</td><td class="n">−${BRL(tot(r))}</td></tr>`).join('')}
    </tbody></table></div>`; })()}`;
}

// Custo por atendimento e execução do calendarizado (meses com Umov no portal)
function eficiencia(box, D, c) {
  const ef = D.efic.filter(e => e.competencia_id === c.id);
  if (!ef.length) { box.innerHTML = '<p class="nota">Disponível nos meses com Umov e carteira carregados no portal (a partir de Setembro/2026).</p>'; return; }
  const fe = Object.fromEntries(D.fech.filter(f => f.competencia_id === c.id).map(f => [f.parceiro_id, f]));
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const ls = ef.map(e => { const f = fe[e.parceiro_id]; const mal = f ? Number(f.malote) || 0 : null; const p = pm[e.parceiro_id] || {};
    return { p, mal, pontos: e.pontos, prev: Number(e.atend_previstos), umov: Number(e.atend_umov), exec: e.atend_previstos ? e.atend_umov / e.atend_previstos : null,
      cAt: mal != null && e.atend_umov ? mal / e.atend_umov : null, cPt: mal != null && e.pontos ? mal / e.pontos : null }; }).filter(x => x.pontos || x.umov);
  const comV = ls.filter(x => x.mal != null);
  const sMal = comV.reduce((a, x) => a + x.mal, 0), sUm = comV.reduce((a, x) => a + x.umov, 0), sPt = comV.reduce((a, x) => a + x.pontos, 0), sPrev = comV.reduce((a, x) => a + x.prev, 0);
  D.efSort = D.efSort || ['exec', 1];
  const [k, d] = D.efSort; ls.sort((a, b) => ((a[k] ?? 1e15) - (b[k] ?? 1e15)) * d);
  const fechados = comV.filter(x => /fechad/i.test(x.p.tipo || '') && x.exec != null).sort((a, b) => a.exec - b.exec).slice(0, 6);
  box.innerHTML = `<div class="kpis">
      <div class="kpi"><small>Custo médio por atendimento</small><b>${BRL2(sUm ? sMal / sUm : 0)}</b><span>malote ÷ atendimentos retornados no Umov</span></div>
      <div class="kpi neutro"><small>Custo médio por ponto</small><b>${BRL2(sPt ? sMal / sPt : 0)}</b><span>${fmtN(sPt)} pontos na carteira</span></div>
      <div class="kpi ${sPrev && sUm / sPrev < 1 ? 'alerta' : 'neutro'}"><small>Execução do calendarizado</small><b>${sPrev ? pct(sUm / sPrev).replace('+', '') : '—'}</b><span>${fmtN(sUm)} feitos de ${fmtN(sPrev)} previstos</span></div>
    </div>
    ${fechados.length ? `<div class="msg alerta"><b>Contratos fechados com menor execução</b> (pagam o mesmo valor mesmo com menos atendimentos):<br>${fechados.map(x => `${esc(x.p.regiao)} ${pct(x.exec).replace('+', '')} (${fmtN(x.umov)} de ${fmtN(x.prev)}, ${BRL(x.mal)})`).join(' · ')}</div>` : ''}
    <div class="tabela"><table id="eftab"><thead><tr>${[['regiao', 'Parceiro'], ['mal', 'Malote', 1], ['pontos', 'Pontos', 1], ['prev', 'Previstos', 1], ['umov', 'Feitos (Umov)', 1], ['exec', 'Execução', 1], ['cAt', 'R$/atend.', 1], ['cPt', 'R$/ponto', 1]]
      .map(([kk, nn, num]) => `<th class="${num ? 'n' : ''}" ${kk !== 'regiao' ? `data-es="${kk}" style="cursor:pointer;white-space:nowrap"` : ''}>${nn}${k === kk ? (d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${ls.map(x => `<tr><td><b>${esc(x.p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(x.p.tipo || '')}</span></td><td class="n">${x.mal == null ? '—' : BRL(x.mal)}</td><td class="n">${fmtN(x.pontos)}</td><td class="n">${fmtN(x.prev)}</td><td class="n">${fmtN(x.umov)}</td>
      <td class="n" style="color:${x.exec != null && x.exec < 0.9 ? 'var(--alert)' : 'var(--ink)'}">${x.exec == null ? '—' : pct(x.exec).replace('+', '')}</td><td class="n">${x.cAt == null ? '—' : BRL2(x.cAt)}</td><td class="n">${x.cPt == null ? '—' : BRL2(x.cPt)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="nota">Feitos = atendimentos de malote retornados de campo no Umov e ligados ao parceiro pelo código de integração. Previstos = calendarizado da carteira do mês. O malote inclui o valor fixo do contrato. Pontos de base própria não entram.</p>`;
  box.querySelectorAll('[data-es]').forEach(th => th.onclick = () => { const kk = th.dataset.es; D.efSort = [kk, D.efSort[0] === kk ? -D.efSort[1] : (kk === 'exec' ? 1 : -1)]; eficiencia(box, D, c); });
}

// Caixa: o que vence em cada data, adiantamentos e saldo
function pagamentos(box, adis, ls) {
  const save = adis.reduce((a, x) => a + Number(x.valor_desconto || 0), 0); const adiBruto = adis.reduce((a, x) => a + Number(x.valor || 0), 0);
  const g = {}; ls.forEach(t => { const x = g[t.dia] || (g[t.dia] = { n: 0, v: 0, adi: 0, pagos: 0, vp: 0, aberto: 0 }); x.n++; x.v += t.total; x.adi += t.adi; if (!t.fechado) x.aberto++; if (t.pago) { x.pagos++; x.vp += t.total - t.adi; } });
  const ord = ['5º dia útil', 'Dia 15', 'Dia 20', 'Dia 30', 'Quinzenal', '—'];
  const lst = Object.entries(g).sort((a, b) => (ord.indexOf(a[0]) + 99) % 99 - (ord.indexOf(b[0]) + 99) % 99);
  const T = lst.reduce((a, [, x]) => ({ n: a.n + x.n, v: a.v + x.v, adi: a.adi + x.adi, vp: a.vp + x.vp, aberto: a.aberto + x.aberto }), { n: 0, v: 0, adi: 0, vp: 0, aberto: 0 });
  const saldo = T.v - T.adi - T.vp;
  box.innerHTML = `<div class="kpis">
      <div class="kpi"><small>Valor do mês</small><b>${BRL(T.v)}</b><span>${T.n} parceiros${T.aberto ? ` · ${T.aberto} ainda não fechados` : ''}</span></div>
      <div class="kpi neutro"><small>Adiantamentos já pagos</small><b>${BRL(T.adi)}</b><span>${T.v ? pct(T.adi / T.v).replace('+', '') : '—'} do mês</span></div>
      <div class="kpi neutro"><small>Pago no fechamento</small><b>${BRL(T.vp)}</b><span>registrado no portal</span></div>
      <div class="kpi ${saldo > 0 ? 'alerta' : ''}"><small>Saldo a pagar</small><b>${BRL(saldo)}</b><span>valor − adiantado − pago</span></div>
      <div class="kpi"><small>Economia com adiantamentos (save)</small><b>${BRL2(save)}</b><span>${adis.length ? `${adis.length} adiantamento(s) · ${BRL(adiBruto)} adiantados` : 'nenhum adiantamento com desconto'}</span></div>
    </div>
    <div class="tabela"><table><thead><tr><th>Data de pagamento</th><th class="n">Parceiros</th><th class="n">Valor</th><th class="n">Adiantado</th><th class="n">Pago</th><th class="n">Saldo a pagar</th></tr></thead><tbody>
    ${lst.map(([k, x]) => { const sd = x.v - x.adi - x.vp; return `<tr><td>${esc(k === '—' ? 'Sem data cadastrada' : k)}</td><td class="n">${x.n}</td><td class="n">${BRL(x.v)}</td><td class="n">${x.adi ? BRL(x.adi) : '—'}</td><td class="n">${x.vp ? BRL(x.vp) : '—'}</td>
      <td class="n"><b>${BRL(sd)}</b><div style="height:4px;background:#E9E7E3;border-radius:2px;margin-top:4px"><div style="height:4px;width:${T.v ? Math.max(0, 100 * sd / T.v) : 0}%;background:#121112;border-radius:2px"></div></div></td></tr>`; }).join('')}
    </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${T.n}</b></td><td class="n"><b>${BRL(T.v)}</b></td><td class="n"><b>${BRL(T.adi)}</b></td><td class="n"><b>${BRL(T.vp)}</b></td><td class="n"><b>${BRL(saldo)}</b></td></tr></tfoot></table></div>
    <p class="nota">Datas fixas do cadastro de cada parceiro. Valores com descontos. "Pago" passa a aparecer quando o pagamento for registrado no portal (etapa do financeiro).</p>`;
}

async function clientesMes(box, compId, op, parceiroId) {
  let qr = sb.from(parceiroId ? 'historico_cliente' : 'dir_cliente_mes').select('cliente,operacao,valor,atendimentos,estimado').eq('competencia_id', compId);
  if (parceiroId) qr = qr.eq('parceiro_id', parceiroId).eq('vigente', true);
  if (op !== 'tudo') qr = qr.eq('operacao', op === 'malote' ? 'Malote' : 'Kits/Spot');
  const rows = await todas(() => qr);
  const g = {}; let est = false; rows.forEach(r => { const x = g[r.cliente] || (g[r.cliente] = { v: 0, a: 0 }); x.v += Number(r.valor) || 0; x.a += r.atendimentos || 0; est = est || r.estimado; });
  const lst = Object.entries(g).sort((a, b) => b[1].v - a[1].v); const top = lst.slice(0, 12); const max = top[0]?.[1].v || 1;
  const tot = lst.reduce((a, [, x]) => a + x.v, 0);
  box.className = '';
  box.innerHTML = lst.length ? `<div style="display:flex;flex-direction:column;gap:8px">${top.map(([n, x]) => `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(n)}">${esc(n)}</span>
      <span style="height:10px;background:#E9E7E3;border-radius:5px"><span style="display:block;height:10px;width:${100 * x.v / max}%;background:#DB2242;border-radius:5px"></span></span>
      <span class="num" style="min-width:86px;text-align:right">${BRL(x.v)}</span></div>`).join('')}</div>
    <p class="nota">${lst.length} clientes · ${BRL(tot)}. ${est ? 'Malote por cliente é estimado: o valor de cada parceiro é dividido pela proporção de atendimentos de cada cliente.' : ''}</p>`
    : `<p class="nota">Sem detalhe por cliente para este mês. O administrador carrega em "Histórico por cliente".</p>`;
}

async function detalheParceiro(tr, pid, c, op) {
  const prox = tr.nextElementSibling;
  document.querySelectorAll('#dtab tr.det').forEach(x => x.remove());
  if (prox && prox.classList.contains('det') && prox.dataset.p === pid) return;
  const D = S.dir; const linha = document.createElement('tr'); linha.className = 'det'; linha.dataset.p = pid;
  linha.innerHTML = `<td colspan="10" style="background:var(--field)"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;padding:8px 4px">
    <div><b style="font-size:13px">Evolução · ${OPS[op]}</b><div id="dg"></div></div><div><b style="font-size:13px">Clientes em ${nomeMes(c.mes)}</b><div id="dc" class="carregando">Carregando…</div></div></div></td>`;
  tr.after(linha);
  const pts = D.comps.map(x => { const r = D.fech.find(f => f.competencia_id === x.id && f.parceiro_id === pid); return { rot: MES3[+x.mes.slice(5, 7) - 1], v: r ? valorOp(r, op) : 0, atual: x.id === c.id, id: x.id }; });
  const W = 420, H = 120, L = 22, R = 22, T = 20, B = 22; const max = Math.max(...pts.map(p => p.v), 1);
  const x = i => L + i * (W - L - R) / Math.max(1, pts.length - 1); const y = v => T + (H - T - B) * (1 - v / max);
  linha.querySelector('#dg').innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:520px;height:auto;display:block">
    <path d="M${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' L')}" fill="none" stroke="#121112" stroke-width="2"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${p.atual ? 5 : 3}" fill="${p.atual ? '#DB2242' : '#121112'}" stroke="#FBFAF8" stroke-width="2"><title>${p.rot}: ${BRL(p.v)}</title></circle>
      <text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#6E6E72" font-family="Poppins">${p.rot}</text>`).join('')}
    <text x="${x(pts.findIndex(p => p.atual))}" y="${y(pts.find(p => p.atual).v) - 9}" text-anchor="${pts.findIndex(p => p.atual) === pts.length - 1 ? 'end' : 'middle'}" font-size="12" font-weight="600" fill="#121112" font-family="Poppins">${BRLk(pts.find(p => p.atual).v)}</text></svg>`;
  clientesMes(linha.querySelector('#dc'), c.id, op, pid);
}

// ---------- Histórico por cliente (carga das planilhas antigas) ----------
async function vHistorico() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Histórico por cliente</h1><p>Carregue uma vez a planilha de fechamento de cada mês já fechado para a diretoria ver a evolução por cliente. Malote por cliente é estimado pela proporção de atendimentos; Kits/Spot vem da aba Extras.</p></div>${seletorComp(false)}</div>
    <div id="hst" class="carregando">Carregando…</div>
    ${zonaArquivo('arqh', 'Arraste a planilha de fechamento do mês selecionado', 'Excel (.xlsx) com as abas Atendimentos e Extras', '.xlsx,.xlsm')}
    <div id="prevh"></div>`;
  ligarSeletor(vHistorico);
  ligarZona('arqh', previaHistorico);
  const cont = await Promise.all(S.comps.map(async c => [c, await q(sb.from('historico_cliente').select('id', { count: 'exact', head: true }).eq('competencia_id', c.id).eq('vigente', true))]));
  $('#hst').outerHTML = `<div class="linha">${cont.slice().sort((a, b) => a[0].mes.localeCompare(b[0].mes)).map(([c, n]) => `<span class="pill ${n ? 'escuro' : ''}">${MES3[+c.mes.slice(5, 7) - 1]}/${c.mes.slice(2, 4)} ${n ? '✓' : '—'}</span>`).join('')}</div>`;
}

function ultimaLinha(ws) { const d = ws['!data'] || ws; let n = 0; if (Array.isArray(d)) { for (let i = 0; i < d.length; i++) if (d[i] && d[i].some(c => c && c.v != null && c.v !== '')) n = i; return n + 1; } return XLSX.utils.decode_range(ws['!ref']).e.r + 1; }

async function previaHistorico(file) {
  $('#prevh').innerHTML = '<div class="carregando">Lendo a planilha (a aba Extras é grande, leva alguns segundos)…</div>';
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheets: ['Atendimentos', 'Extras'], dense: true });
    if (!wb.Sheets.Atendimentos) throw new Error('Aba Atendimentos não encontrada.');
    const rowsA = XLSX.utils.sheet_to_json(wb.Sheets.Atendimentos, { header: 1, raw: true, defval: null, range: `A1:Q${ultimaLinha(wb.Sheets.Atendimentos)}` });
    const rowsE = wb.Sheets.Extras ? XLSX.utils.sheet_to_json(wb.Sheets.Extras, { header: 1, raw: true, defval: null, range: `A1:H${ultimaLinha(wb.Sheets.Extras)}` }) : null;
    const nomeMap = {}; S.parceiros.forEach(p => nomeMap[norm(p.nome)] = p.id);
    const r = parseHistorico(rowsA, rowsE, regiaoMap(), nomeMap);
    if (r.erro) throw new Error(r.erro);
    const fech = await q(sb.from('fechamento_parceiro').select('parceiro_id,malote,kits').eq('competencia_id', S.compId));
    const linhas = []; let malDist = 0, malTot = 0, kitsPl = 0;
    fech.forEach(f => {
      const M = Number(f.malote) || 0; malTot += M; const at = r.atend[f.parceiro_id] || {}; const T = Object.values(at).reduce((a, n) => a + n, 0);
      if (M && T) Object.entries(at).forEach(([cli, n]) => { if (n) { const v = M * n / T; malDist += v; linhas.push({ parceiro_id: f.parceiro_id, cliente: cli, operacao: 'Malote', valor: +v.toFixed(2), atendimentos: Math.round(n), estimado: true }); } });
      else if (M) { malDist += M; linhas.push({ parceiro_id: f.parceiro_id, cliente: '(sem atendimentos na aba)', operacao: 'Malote', valor: M, atendimentos: null, estimado: true }); }
    });
    Object.entries(r.kits).forEach(([pid, cs]) => Object.entries(cs).forEach(([cli, v]) => { kitsPl += v; linhas.push({ parceiro_id: pid, cliente: cli, operacao: 'Kits/Spot', valor: +v.toFixed(2), atendimentos: null, estimado: false }); }));
    const kitsFech = fech.reduce((a, f) => a + (Number(f.kits) || 0), 0);
    S.histPrev = { file, linhas };
    const sem = Object.entries(r.semParceiro);
    $('#prevh').innerHTML = `<section class="bloco"><h2>Prévia: ${esc(file.name)} → ${nomeMes(comp().mes)}</h2>
      <div class="kpis">
        <div class="kpi"><small>Linhas cliente × parceiro</small><b>${fmtN(linhas.length)}</b><span>${fmtN(new Set(linhas.map(l => l.cliente)).size)} clientes</span></div>
        <div class="kpi"><small>Malote distribuído</small><b>${BRL(malDist)}</b><span>de ${BRL(malTot)} no fechamento do portal</span></div>
        <div class="kpi ${Math.abs(kitsPl - kitsFech) > 1 ? 'alerta' : ''}"><small>Kits/Spot por cliente</small><b>${BRL(kitsPl)}</b><span>${BRL(kitsFech)} no fechamento do portal</span></div>
      </div>
      ${sem.length ? `<div class="msg alerta">Regiões da aba Atendimentos sem parceiro no cadastro (ficam de fora do rateio): ${sem.map(([k, n]) => `${esc(k)} (${n})`).join(', ')}.</div>` : ''}
      ${r.kitsSem ? `<div class="msg alerta">${BRL(r.kitsSem)} de extras com parceiro não reconhecido ficaram de fora.</div>` : ''}
      <div class="linha"><button class="btn marca" id="gravarh">Gravar histórico de ${nomeMes(comp().mes)}</button></div><div id="progh"></div></section>`;
    $('#gravarh').onclick = async e => {
      e.target.disabled = true;
      try { const n = await q(sb.rpc('carregar_historico_cliente', { p_comp: S.compId, p_linhas: S.histPrev.linhas })); S.histPrev = null; await vHistorico(); alertaOk(`Histórico de ${nomeMes(comp().mes)} gravado: ${fmtN(n)} linhas.`); }
      catch (er) { $('#progh').innerHTML = `<div class="msg erro">${esc(er.message)}</div>`; e.target.disabled = false; }
    };
  } catch (e) { $('#prevh').innerHTML = `<div class="msg erro">Não consegui ler a planilha: ${esc(e.message)}</div>`; }
}

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') telaLogin(); });
iniciar().catch(e => { app.innerHTML = `<div class="carregando">Erro ao iniciar: ${esc(e.message)}</div>`; });
