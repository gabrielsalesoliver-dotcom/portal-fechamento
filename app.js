// Portal de Fechamento GSM — telas do administrador (passos 1, 2 e 4 do ciclo)
import { decodeText, parseCSV, parseUmov, resumoUmov, parseCarteira, parseAtendimentos, parseHistorico, parseRelatorio, numBR, norm } from './parse.js?v=2026.11.03-1420';
import BR from './brasil.js?v=2026.11.03-1420';
import { gerarModelo } from './modelo.js?v=2026.11.03-1420';
import { lerLinhas, casar } from './importa.js?v=2026.11.13-1215';

const SB_URL = 'https://quqatijyafqgybzkbuhv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWF0aWp5YWZxZ3liemtidWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzU0NTIsImV4cCI6MjEwNzcxMTQ1Mn0.BTIoDePK8klSS3k2RwwQ6WPuFPJ4SJt16GFjDcpP4r0';
const sb = window.supabase.createClient(SB_URL, SB_KEY);
if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const app = document.getElementById('app');

const VERSAO = '2026.11.25-1005';
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

// ---------- privacidade (LGPD) e sessão ----------
const PRIV_VERSAO = '2026-10-v1';
// Parceiro fechado por quinzena: etiqueta em todas as listas
const pillQ = p => p && p.quinzenal ? ' <span class="pill marca" style="font-size:11px" title="Fecha e recebe por quinzena: confira se as duas quinzenas do mês entraram">Quinzenal</span>' : '';
const PRIV_CONTATO = 'sales@gsmlogistica.com.br';
const textoPrivacidade = () => `
  <p><b>Quem trata os dados:</b> GSM Group Logística, que usa este portal para o fechamento mensal e o pagamento dos serviços de última milha.</p>
  <p><b>Quais dados:</b> nome e razão social, CPF ou CNPJ, e-mail de acesso, dados para pagamento (chave PIX ou boleto), notas fiscais e relatórios que você envia, e os atendimentos registrados no Umov (pontos, datas e nome do motorista ou responsável).</p>
  <p><b>Para quê:</b> conferir os atendimentos, calcular e aprovar o valor do mês, receber e conferir as notas fiscais e fazer o pagamento. A base legal é a execução do contrato de prestação de serviços e o cumprimento de obrigações fiscais.</p>
  <p><b>Quem vê:</b> você vê só os dados da sua empresa. Na GSM, o acesso é restrito à equipe de fechamento e ao financeiro; a diretoria vê apenas valores e indicadores, sem CPF/CNPJ nem dados bancários. Os dados ficam em servidores no Brasil (São Paulo) e não são vendidos nem compartilhados para outras finalidades.</p>
  <p><b>Por quanto tempo:</b> notas fiscais e valores pagos ficam guardados pelo prazo exigido pela legislação fiscal (5 anos). Nomes de motoristas e responsáveis do Umov são apagados após 12 meses; os atendimentos ficam sem identificação.</p>
  <p><b>Seus direitos:</b> você pode pedir acesso, correção ou exclusão dos seus dados (respeitados os prazos legais) pelo e-mail <a href="mailto:${PRIV_CONTATO}">${PRIV_CONTATO}</a>.</p>
  <p><b>Segurança:</b> acesso só por convite, com senha individual; a sessão encerra sozinha após 30 minutos sem uso.</p>`;
function telaPrivacidade() {
  app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg)">
    <section class="bloco" style="max-width:720px;width:100%"><div class="eyebrow">Portal do Parceiro · GSM</div><h1 style="margin:4px 0 8px">Aviso de privacidade</h1>
      <p class="sub">Antes do primeiro uso, leia como o portal trata os seus dados (Lei Geral de Proteção de Dados, LGPD).</p>
      <div style="font-size:14px;line-height:1.55">${textoPrivacidade()}</div>
      <div class="linha" style="margin-top:12px"><button class="btn" id="priv-ok">Li e concordo</button><button class="btn sec" id="priv-sair">Sair</button></div></section></div>`;
  $('#priv-sair').onclick = sair;
  $('#priv-ok').onclick = async () => { const b = $('#priv-ok'); b.disabled = true;
    try { await q(sb.rpc('aceitar_privacidade', { p_versao: PRIV_VERSAO })); S.perfil.aceite_privacidade_versao = PRIV_VERSAO; iniciar(); }
    catch (e) { b.disabled = false; alertaTopo('Não foi possível registrar: ' + e.message); } };
}
function verPrivacidade(ev) { if (ev) ev.preventDefault(); const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px';
  d.innerHTML = `<section class="bloco" style="max-width:720px;width:100%;max-height:90vh;overflow:auto"><h2>Aviso de privacidade</h2><div style="font-size:14px;line-height:1.55">${textoPrivacidade()}</div><button class="btn sec" style="margin-top:8px">Fechar</button></section>`;
  d.onclick = e => { if (e.target === d || e.target.tagName === 'BUTTON') d.remove(); }; document.body.appendChild(d); }
const INATIVO_MS = 30 * 60 * 1000;
function vigiarInatividade() {
  if (S.vigiando) return; S.vigiando = true;
  const marcar = () => { try { localStorage.setItem('gsm-ult-uso', String(Date.now())); } catch (e) {} S.ultUso = Date.now(); };
  ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { if (Date.now() - (S.ultUso || 0) > 15000) marcar(); }, { passive: true }));
  let ult = 0; try { ult = +localStorage.getItem('gsm-ult-uso') || 0; } catch (e) {}
  if (ult && Date.now() - ult > INATIVO_MS) { sairPorInatividade(); return; }
  marcar();
  setInterval(() => { let u = S.ultUso || 0; try { u = Math.max(u, +localStorage.getItem('gsm-ult-uso') || 0); } catch (e) {} if (Date.now() - u > INATIVO_MS) sairPorInatividade(); }, 60000);
}
async function sairPorInatividade() { try { await sb.auth.signOut(); } catch (e) {} try { localStorage.removeItem('gsm-ult-uso'); } catch (e) {} location.hash = ''; S.vigiando = false; telaLogin('entrar', '<div class="msg alerta">Sua sessão foi encerrada após 30 minutos sem uso. Entre de novo.</div>'); }

// ---------- autenticação ----------
async function iniciar() {
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  // link de convite: ...?acesso=primeiro abre direto na aba Primeiro acesso
  if (!S.user) return telaLogin(/^(primeiro|convite)$/i.test(new URLSearchParams(location.search).get('acesso') || '') ? 'primeiro' : 'entrar');
  try {
    S.perfil = await q(sb.from('perfis').select('*').eq('id', S.user.id).maybeSingle());
  } catch (e) { S.perfil = null; }
  if (!S.perfil) return telaSemPerfil();
  if (S.perfil.ativo === false) return telaSimples('Acesso bloqueado', 'Seu login está bloqueado no portal. Fale com o Fechamento GSM.');
  vigiarInatividade();
  if (S.perfil.papel === 'parceiro' && S.perfil.aceite_privacidade_versao !== PRIV_VERSAO) return telaPrivacidade();
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
      if (error) return erro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos. É o seu primeiro acesso? Use a aba "Primeiro acesso" com o e-mail e o código que a GSM enviou para criar a sua senha.' : error.message);
      try { localStorage.setItem('gsm-ult-uso', String(Date.now())); } catch (e) {}
      iniciar();
    } catch (e) { erro('Falha de conexão: ' + e.message); }
  };
}

// Tema claro/escuro (o tema inicial é aplicado por tema.js)
const temaAtual = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'escuro' : 'claro';
const temaRot = () => temaAtual() === 'escuro' ? '☀ Tema claro' : '☾ Tema escuro';
function temaBtn() { return `<button type="button" class="btn-tema" data-tema title="Alternar entre tema claro e escuro">${temaRot()}</button>`; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tema]'); if (!b) return;
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  if (novo === 'escuro') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('gsm-tema', novo); } catch (_) {}
  document.querySelectorAll('[data-tema]').forEach(x => { x.textContent = temaRot(); });
  document.querySelectorAll('img[data-logo]').forEach(x => { x.src = novo === 'escuro' ? 'logo_escuro.png' : 'logo_claro.png'; });
});

function telaSimples(titulo, texto) {
  app.innerHTML = `<div class="login"><section class="login-form" style="flex-basis:100%"><div style="max-width:520px;display:flex;flex-direction:column;gap:16px">
    <img data-logo src="${temaAtual() === 'escuro' ? 'logo_escuro.png' : 'logo_claro.png'}" alt="GSM Log" style="height:40px;width:120px;object-fit:contain">
    <div class="bloco"><h2 style="font-size:24px">${titulo}</h2><p style="margin:0;color:var(--muted)">${texto}</p></div>
    <div class="linha" style="gap:8px"><button class="btn sec" id="sair">Sair</button><button type="button" class="btn sec" data-tema>${temaRot()}</button></div></div></section></div>`;
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
  ['Visão geral', [['pendencias', 'Pendências e cobrança'], ['painel', 'Painel do mês']]],
  ['Base do mês', [['umov', 'Base do Umov (API)'], ['carteira', 'Inclusão e cancelamento'], ['pontos', 'Carteira de pontos'], ['competencias', 'Liberar competência']]],
  ['Parceiros', [['cadastro', 'Parceiros e rotas'], ['conferencia', 'Conferência e aprovação'], ['adiantamentos', 'Adiantamentos e antecipações'], ['notas', 'Notas fiscais'], ['verparceiro', 'Portal do parceiro (GSM)']]],
  ['Financeiro', [['pacote', 'Pacote e pagamento']]],
  ['Acompanhamento', [['operacao', 'Operação ao vivo (Umov)'], ['diretoria', 'Diretoria e financeiro'], ['historico', 'Histórico por cliente']]],
  ['Configurações', [['torre', 'Torre de controle (robôs)'], ['acessos', 'Acessos e convites'], ['backup', 'Cópia de segurança']]],
];
const VIEWS = { torre: () => vTorre(), operacao: () => vOperacao($('#main')), painel: () => vPainel(), umov: () => vUmov(), carteira: () => vCarteira(), pontos: () => vPontos(), competencias: () => vCompetencias(), acessos: () => vAcessos(), diretoria: () => vDiretoria($('#main')), historico: () => vHistorico(), backup: () => vBackup(), conferencia: () => vConferencia(), verparceiro: () => vVerParceiro(), pendencias: () => vPendencias(), notas: () => vNotas(), cadastro: () => vCadastro(), adiantamentos: () => vAdiantamentos(), pacote: () => vPacote() };

// Admin vê exatamente a tela do parceiro escolhido, só para consulta
// ================= Pendências e cobrança =================
const ETAPAS_PEND = {
  sem_envio: ['Sem envio da base', 'parceiro', 'alerta'], responder: ['Itens para responder', 'parceiro', 'alerta'], devolvido: ['Envio devolvido: corrigir e reenviar', 'parceiro', 'alerta'],
  sem_nf: ['Aprovado: falta a NF', 'parceiro', 'alerta'], nf_recusada: ['NF recusada ou soma diferente', 'parceiro', 'alerta'],
  analise: ['Aguardando a GSM conferir o envio', 'gsm', ''], nf_conferir: ['NF a conferir', 'gsm', ''],
  lote: ['NF conferida: montar lote', 'financeiro', 'marca'], pagar: ['Em lote: aguardando pagamento', 'financeiro', 'marca'], pago: ['Pago', 'ok', 'escuro'],
};
// Movimentações registradas à mão pela GSM (ex.: base extraída e mandada ao parceiro por e-mail)
const MOV_ST = [['Base extraída pela GSM', 'gsm'], ['Enviado para conferência do parceiro', 'parceiro'], ['Cobrado novamente', 'parceiro'],
  ['Parceiro respondeu: em análise da GSM', 'gsm'], ['Parceiro pediu ajuste: GSM corrigindo', 'gsm'], ['Parceiro aprovou a base', 'gsm'], ['Lançado pela GSM no portal', 'gsm'], ['Não fecha neste mês (acumula para o próximo)', 'ok']];
// "não fecha neste mês" / "faturamento acumulado": o parceiro sai das pendências do mês
const RX_NAO_FECHA = /n[ãa]o\s+fecha|acumulad|sem\s+fechamento\s+no\s+m[êe]s/i;
const grupoMov = st => RX_NAO_FECHA.test(st || '') ? 'ok' : (MOV_ST.find(x => x[0] === st) || [null, 'parceiro'])[1];
async function carregarMovs(compId) { return todas(() => sb.from('movimentacoes_parceiro').select('id,parceiro_id,status,observacao,criado_em').eq('competencia_id', compId).order('criado_em', { ascending: false })).catch(() => []); }
function popMovimentacao(c, p, movs, aoSalvar) {
  const box = abrirPop(`Movimentação · ${p.regiao}`, `${esc(p.nome || '')} · ${nomeMes(c.mes)}. Registre o que foi feito com este parceiro fora do portal (ex.: base enviada por e-mail).`);
  const minhas = movs.filter(x => x.parceiro_id === p.id);
  box.className = '';
  box.innerHTML = `<div class="linha" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
      <label class="campo" style="flex:1;min-width:240px">Status<select id="mv-st">${MOV_ST.map(([t]) => `<option>${esc(t)}</option>`).join('')}<option value="__outro">Outro (escrever)</option></select></label>
      <label class="campo" style="flex:1;min-width:200px;display:none" id="mv-outro-l">Qual?<input type="text" id="mv-outro" maxlength="80" placeholder="Ex.: Parceiro em férias até 20/11"></label></div>
    <label class="campo" style="margin-top:12px">Observação (opcional)<input type="text" id="mv-obs" maxlength="300" placeholder="Ex.: enviado por e-mail para fulano às 14h"></label>
    <div class="linha" style="margin-top:14px"><button class="btn" id="mv-ok">Registrar</button><span class="nota" id="mv-msg"></span></div>
    <h3 style="margin:18px 0 6px">Histórico</h3>
    ${minhas.length ? `<div class="tabela"><table><tbody>${minhas.map(x => `<tr><td style="white-space:nowrap">${fmtDH(x.criado_em)}</td><td><b>${esc(x.status)}</b>${x.observacao ? `<br><span class="nota">${esc(x.observacao)}</span>` : ''}</td><td><button class="btn sec peq" data-mvdel="${x.id}">Apagar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="nota">Nenhuma movimentação ainda.</p>'}`;
  const sel = box.querySelector('#mv-st'); const idx = MOV_ST.findIndex(x => x[0] === minhas[0]?.status);
  if (idx >= 0 && idx < MOV_ST.length - 1) sel.selectedIndex = idx + 1; else if (!minhas.length) sel.selectedIndex = 1;
  sel.onchange = () => { box.querySelector('#mv-outro-l').style.display = sel.value === '__outro' ? '' : 'none'; };
  const fechar = () => document.querySelectorAll('.pop-fundo').forEach(x => x.remove());
  box.querySelector('#mv-ok').onclick = async () => {
    const st = sel.value === '__outro' ? box.querySelector('#mv-outro').value.trim() : sel.value;
    if (!st) { box.querySelector('#mv-msg').textContent = 'Escreva o status.'; return; }
    try { await q(sb.from('movimentacoes_parceiro').insert({ competencia_id: c.id, parceiro_id: p.id, status: st, observacao: box.querySelector('#mv-obs').value.trim() || null })); fechar(); aoSalvar(); atualizarBadges(true); }
    catch (e) { box.querySelector('#mv-msg').textContent = e.message; }
  };
  box.querySelectorAll('[data-mvdel]').forEach(b => b.onclick = async () => { if (!confirm('Apagar esta movimentação?')) return;
    try { await q(sb.from('movimentacoes_parceiro').delete().eq('id', b.dataset.mvdel)); fechar(); aoSalvar(); } catch (e) { alertaTopo(e.message); } });
}
const GRUPO_PEND = [['parceiro', 'Cobrar do parceiro'], ['gsm', 'Com a GSM'], ['financeiro', 'Com o financeiro'], ['ok', 'Concluídos'], ['todos', 'Todos']];
// Data de pagamento do mês seguinte à competência, a partir do "dia de pagamento" do cadastro
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
function dataPagamento(dia, mesComp) {
  if (!dia || !mesComp) return null;
  const [y, mo] = mesComp.slice(0, 7).split('-').map(Number); const ano = mo === 12 ? y + 1 : y, mes = mo === 12 ? 1 : mo + 1;
  const iso = d => `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const m = String(dia).match(/(\d+)\s*º?\s*dia\s*[uú]til/i);
  if (m) { let n = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(ano, mes - 1, d); if (dt.getMonth() !== mes - 1) break; const w = dt.getDay();
    if (w === 0 || w === 6 || FERIADOS_FIXOS.includes(iso(d).slice(5))) continue; if (++n === +m[1]) return iso(d); } return null; }
  const d = String(dia).match(/dia\s*(\d+)/i); return d ? iso(+d[1]) : null;
}
async function vPendencias() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Pendências e cobrança</h1><p>Em que etapa está cada parceiro no mês e de quem depende o próximo passo. Use "Cobrar do parceiro" para saber quem precisa mandar a base, responder itens ou mandar a NF.</p></div>${seletorComp(false)}</div><div id="pend" class="carregando">Carregando…</div>`;
  ligarSeletor(vPendencias);
  const c = comp();
  const [parcs, envs, divs, fech, nfr, nfs, prevM, movs, quinz] = await Promise.all([
    q(sb.from('parceiros').select('id,regiao,nome,email_contato,ativo,dia_pagamento,quinzenal').order('regiao')),
    todas(() => sb.from('envios').select('id,parceiro_id,versao,status,enviado_em').eq('competencia_id', c.id).neq('status', 'substituido')),
    todas(() => sb.from('divergencias').select('envio_id,situacao').eq('competencia_id', c.id).eq('situacao', 'precisa_acao')),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,a_pagar,aprovado_em,lote_id,pago_em').eq('competencia_id', c.id)),
    todas(() => sb.from('nf_resumo').select('parceiro_id,situacao,recusadas').eq('competencia_id', c.id)),
    todas(() => sb.from('notas_fiscais').select('parceiro_id,status,enviado_em').eq('competencia_id', c.id).eq('tipo', 'fechamento')),
    todas(() => sb.from('previsao_realizado').select('parceiro_id,previsto').eq('competencia_id', c.id)).catch(() => []),
    carregarMovs(c.id),
    todas(() => sb.rpc('quinzenas_descobertas')).catch(() => []),
  ]);
  const mvU = {}; movs.forEach(x => { if (!mvU[x.parceiro_id]) mvU[x.parceiro_id] = x; });
  const ult = {}; envs.forEach(e => { if (!ult[e.parceiro_id] || e.versao > ult[e.parceiro_id].versao) ult[e.parceiro_id] = e; });
  const fm = Object.fromEntries(fech.map(f => [f.parceiro_id, f])), nm = Object.fromEntries(nfr.map(r => [r.parceiro_id, r]));
  const libDesde = c.liberada_em ? c.liberada_em : null;
  const dias = d => d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)) : null;
  const hojeISO = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const prazoDe = k => ['sem_envio', 'responder', 'devolvido'].includes(k) ? c.prazo_envio : ['sem_nf', 'nf_recusada'].includes(k) ? c.prazo_nf : null;
  const atrasado = k => { const pz = prazoDe(k); return !!pz && hojeISO > pz; };
  const L = parcs.filter(p => p.ativo !== false).map(p => { const e = ult[p.id], f = fm[p.id], r = nm[p.id]; let k, desde = null;
    if (f && f.pago_em) { k = 'pago'; desde = f.pago_em; }
    else if (f && f.valor_aprovado != null) {
      if (r && r.situacao === 'conferida') { k = f.lote_id ? 'pagar' : 'lote'; }
      else if (r && r.situacao === 'a_conferir') { k = 'nf_conferir'; desde = (nfs.filter(n => n.parceiro_id === p.id && n.status === 'recebida').slice(-1)[0] || {}).enviado_em; }
      else if (r && (r.situacao === 'faltando' || (r.recusadas && r.situacao === 'aguardando'))) k = 'nf_recusada';
      else { k = 'sem_nf'; desde = f.aprovado_em; }
    } else if (!e) { k = 'sem_envio'; desde = libDesde; }
    else if (e.status === 'recusado') { k = 'devolvido'; desde = e.enviado_em; }
    else if (divs.some(d => d.envio_id === e.id)) { k = 'responder'; desde = e.enviado_em; }
    else { k = 'analise'; desde = e.enviado_em; }
    const mv = mvU[p.id]; const porMov = k === 'sem_envio' && mv;
    if (porMov) desde = mv.criado_em;
    return { p, k, desde, d: dias(desde), valor: f ? (f.a_pagar ?? f.valor_aprovado) : null, atr: porMov && grupoMov(mv.status) === 'ok' ? false : atrasado(k), mv, g: porMov ? grupoMov(mv.status) : ETAPAS_PEND[k][1], t: porMov ? mv.status : ETAPAS_PEND[k][0] }; });
  S.pendGrupo = S.pendGrupo || 'parceiro'; S.pendDia = S.pendDia || 'todos';
  const diaDe = p => p.dia_pagamento || 'Sem dia cadastrado';
  const ordemDia = d => { const dt = dataPagamento(d, c.mes); return dt || '9999'; };
  const DIAS = [...new Set(L.map(x => diaDe(x.p)))].sort((a, b) => ordemDia(a).localeCompare(ordemDia(b)));
  if (S.pendDia !== 'todos' && !DIAS.includes(S.pendDia)) S.pendDia = 'todos';
  const LD = L.filter(x => S.pendDia === 'todos' || diaDe(x.p) === S.pendDia);
  const vis = LD.filter(x => S.pendGrupo === 'todos' || x.g === S.pendGrupo).sort((a, b) => (b.atr - a.atr) || (b.d ?? -1) - (a.d ?? -1) || (a.p.regiao || '').localeCompare(b.p.regiao || ''));
  const cont = g => LD.filter(x => g === 'todos' || x.g === g).length;
  const porEtapa = [...new Set(LD.map(x => x.t))].map(t => [t, LD.filter(x => x.t === t).length]);
  const msg = x => { const nomeM = nomeMes(c.mes); if (x.k === 'sem_envio' && x.mv && /conferência|Cobrado/.test(x.mv.status)) return `Olá, ${x.p.nome}! Tudo bem? Enviamos a base de ${nomeM} para sua conferência${x.mv ? ` em ${fmtD(x.mv.criado_em.slice(0, 10))}` : ''}. Pode nos retornar com a conferência (o que estiver de acordo e o que precisar ajustar)? Você também pode conferir e enviar direto no portal: ${location.origin + location.pathname}. Qualquer dúvida, estou à disposição. Obrigado!`; const t = { sem_envio: `conferir e enviar a base de ${nomeM} no portal`, responder: `responder os itens da validação de ${nomeM} no portal`, devolvido: `corrigir e reenviar a base de ${nomeM} (a GSM devolveu com um comentário)`, sem_nf: `enviar a NF de ${nomeM} pelo portal${x.valor ? `, no valor de ${BRL2(x.valor)}` : ''}`, nf_recusada: `enviar uma nova NF de ${nomeM} (a anterior foi recusada ou a soma não bate)` }[x.k];
    const pz = prazoDe(x.k); const tp = pz ? (x.atr ? ` O prazo era ${fmtD(pz)}.` : ` O prazo é ${fmtD(pz)}.`) : '';
    return t ? `Olá, ${x.p.nome}! Tudo bem? Para fecharmos ${nomeM}, falta ${t}: ${location.origin + location.pathname}.${tp} Qualquer dúvida, estou à disposição. Obrigado!` : ''; };
  const resumoDia = d => { const xs = L.filter(x => diaDe(x.p) === d); const prontos = xs.filter(x => ['lote', 'pagar', 'pago'].includes(x.k)).length; return { n: xs.length, prontos, dt: dataPagamento(d, c.mes) }; };
  $('#pend').outerHTML = `
    <section class="bloco" style="padding:12px 16px"><div class="linha" style="align-items:center;gap:8px"><b style="font-size:14px">Pagamento:</b>
      <button class="btn ${S.pendDia === 'todos' ? '' : 'sec'} peq" data-pd="todos">Todos (${L.length})</button>
      ${DIAS.map(d => { const r = resumoDia(d); return `<button class="btn ${S.pendDia === d ? '' : 'sec'} peq" data-pd="${esc(d)}" title="${r.prontos} de ${r.n} com NF conferida ou já em lote">${esc(d)}${r.dt ? ` · ${fmtD(r.dt)}` : ''} (${r.prontos}/${r.n})</button>`; }).join('')}</div>
      ${S.pendDia !== 'todos' ? (() => { const r = resumoDia(S.pendDia); return `<p class="nota" style="margin:8px 0 0">${r.dt ? `Pagamento em <b>${fmtD(r.dt)}</b> · ` : ''}<b>${r.prontos} de ${r.n}</b> parceiros prontos para pagar (NF conferida, em lote ou pago). Os números entre parênteses nos botões mostram prontos / total.</p>`; })() : '<p class="nota" style="margin:8px 0 0">Escolha um dia para ver só os parceiros que recebem nessa data. Entre parênteses: prontos para pagar / total.</p>'}</section>
    ${(() => { const pmap = Object.fromEntries(parcs.map(p => [p.id, p]));
      const comPrev = prevM.filter(x => x.previsto != null).map(x => x.parceiro_id);
      const doMes = [...new Set([...(comPrev.length ? comPrev : L.map(x => x.p.id)), ...fech.map(f => f.parceiro_id)])]
        .filter(id => S.pendDia === 'todos' || diaDe(pmap[id] || {}) === S.pendDia);
      const fin = doMes.filter(id => fm[id] && fm[id].valor_aprovado != null).length, tot = doMes.length, pc = tot ? Math.round(100 * fin / tot) : 0;
      return `<div class="fin-box"><div><small>Finalização do fechamento${S.pendDia !== 'todos' ? ` · ${esc(S.pendDia)}` : ''}</small><b>${pc}%</b></div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><div class="fin-bar"><i style="width:${pc}%"></i></div>
        <span><b>${fin} de ${tot}</b> parceiros com fechamento aprovado · faltam ${tot - fin}</span></div></div>`; })()}
    <div class="kpis">${GRUPO_PEND.slice(0, 4).map(([g, t]) => `<div class="kpi ${g === 'parceiro' && cont(g) ? 'alerta' : 'neutro'}"><small>${t}</small><b>${cont(g)}</b><span>${g === 'ok' ? 'parceiros pagos' : 'parceiros'}</span></div>`).join('')}</div>
    ${(() => { const pmq = Object.fromEntries(parcs.map(p => [p.id, p])); const qs = (quinz || []).filter(r => r.competencia_id === c.id || r.mes < c.mes);
      return qs.length ? `<div class="msg alerta" style="margin:0"><b>Quinzena sem fechamento.</b> ${qs.map(r => `${esc(pmq[r.parceiro_id]?.regiao || '—')} (${esc(pmq[r.parceiro_id]?.nome || '')}): <b>${fmtD(r.de)} a ${fmtD(r.ate)}</b> (${r.dias_uteis} dias úteis de ${MES3[+r.mes.slice(5, 7) - 1]}) não está em nenhum fechamento${r.periodo_de ? `; o fechamento de ${MES3[+r.mes.slice(5, 7) - 1]} cobre ${fmtD(r.periodo_de)} a ${fmtD(r.periodo_ate)}` : ''}.`).join(' · ')} Lance a quinzena que falta para não deixar de pagar.</div>` : ''; })()}
    <p class="nota" style="margin:0"><b>Prazos do mês:</b> base até ${c.prazo_envio ? fmtD(c.prazo_envio) : '(não definido)'} · NF até ${c.prazo_nf ? fmtD(c.prazo_nf) : '(não definido)'}${L.some(x => x.atr) ? ` · <b style="color:var(--brand-deep)">${L.filter(x => x.atr).length} parceiro(s) com prazo vencido</b>` : ''}. Defina em Liberar competência.</p>
    <p class="nota" style="margin:0">${porEtapa.map(([t, n]) => `${esc(t)}: <b>${n}</b>`).join(' · ')}${!c.liberada_parceiros ? ' · <b>Atenção: o mês ainda não foi liberado para os parceiros.</b>' : ''}</p>
    <section class="bloco"><div class="linha" style="justify-content:space-between"><div class="linha">${GRUPO_PEND.map(([g, t]) => `<button class="btn ${S.pendGrupo === g ? '' : 'sec'} peq" data-pg="${g}">${t} (${cont(g)})</button>`).join('')}</div>
      <div class="linha"><button class="btn sec peq" id="pd-mail">Copiar e-mails da lista</button><button class="btn sec peq" id="pd-xls">Baixar Excel</button></div></div>
      <div class="tabela"><table><thead><tr><th>Parceiro</th><th>Etapa</th><th class="n">Há quantos dias</th><th class="n">Valor</th><th>Contato</th><th></th></tr></thead><tbody>
      ${vis.map((x, i) => { const cls = x.k === 'sem_envio' && x.mv ? (x.g === 'gsm' ? '' : 'alerta') : ETAPAS_PEND[x.k][2]; const t = x.t; const mm = msg(x);
        return `<tr><td><b>${esc(x.p.regiao)}</b>${pillQ(x.p)}<br><span style="font-size:12px;color:var(--muted)">${esc(x.p.nome || '')} · ${esc(diaDe(x.p))}</span></td><td><span class="pill ${cls}">${esc(t)}</span>${x.atr ? ' <span class="pill marca">Prazo vencido</span>' : ''}${x.mv ? `<br><span class="nota" title="${esc(x.mv.observacao || '')}">${x.k === 'sem_envio' ? 'desde' : 'Últ. movimentação: ' + esc(x.mv.status) + ' ·'} ${fmtD(x.mv.criado_em.slice(0, 10))}${x.mv.observacao ? ' · ' + esc(x.mv.observacao.slice(0, 60)) : ''}</span>` : ''}</td>
        <td class="n" style="color:${(x.d ?? 0) > 5 && ETAPAS_PEND[x.k][1] === 'parceiro' ? 'var(--brand-deep)' : 'inherit'}">${x.d == null ? '—' : x.d}</td><td class="n">${x.valor != null ? BRL2(x.valor) : '—'}</td>
        <td style="font-size:13px">${x.p.email_contato ? `<a href="mailto:${esc(x.p.email_contato)}?subject=${encodeURIComponent('Fechamento ' + nomeMes(c.mes) + ' · GSM')}&body=${encodeURIComponent(mm)}">${esc(x.p.email_contato)}</a>` : '<span class="nota">sem e-mail no cadastro</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sec peq" data-mov="${i}" title="Registrar o que foi feito (ex.: enviado para conferência do parceiro)">Movimentar</button> ${mm ? `<button class="btn sec peq" data-cp="${i}">Copiar mensagem</button> ` : ''}<button class="btn sec peq" data-ab="${i}">Abrir</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="nota">Ninguém nesta situação.</td></tr>'}
      </tbody></table></div>
      <p class="nota">"Movimentar" registra o que foi feito fora do portal (ex.: base extraída e enviada para conferência do parceiro); para quem ainda não enviou a base, a etapa passa a mostrar a última movimentação e os dias contam a partir dela. "Há quantos dias": desde a liberação do mês (sem envio), desde o envio (itens e análise), desde a aprovação (falta a NF) ou desde a NF enviada. Em vermelho, cobranças com mais de 5 dias. "Copiar mensagem" copia um texto pronto para WhatsApp ou e-mail; o e-mail abre já preenchido.</p></section>`;
  m.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { S.pendGrupo = b.dataset.pg; vPendencias(); });
  m.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { S.pendDia = b.dataset.pd; vPendencias(); });
  m.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(msg(vis[+b.dataset.cp])); b.textContent = 'Copiado'; setTimeout(() => b.textContent = 'Copiar mensagem', 1500); } catch (e) { alertaTopo('Não foi possível copiar: ' + e.message); } });
  m.querySelectorAll('[data-mov]').forEach(b => b.onclick = () => popMovimentacao(c, vis[+b.dataset.mov].p, movs, vPendencias));
  m.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => { const x = vis[+b.dataset.ab]; const g = ETAPAS_PEND[x.k][1];
    if (['analise'].includes(x.k)) { S.confParc = x.p.id; location.hash = '#conferencia'; } else if (x.k === 'nf_conferir') location.hash = '#notas'; else if (g === 'financeiro' || x.k === 'pago') location.hash = '#pacote';
    else { S.previaParc = x.p.id; S.compPId = c.id; location.hash = '#verparceiro'; } });
  $('#pd-mail').onclick = async () => { const em = [...new Set(vis.map(x => x.p.email_contato).filter(Boolean))].join('; '); if (!em) return alertaTopo('Nenhum e-mail cadastrado nesta lista.'); try { await navigator.clipboard.writeText(em); $('#pd-mail').textContent = `${em.split(';').length} e-mails copiados`; } catch (e) { alertaTopo(e.message); } };
  $('#pd-xls').onclick = () => baixarXlsx(`Pendencias_${c.mes.slice(0, 7)}.xlsx`, { titulo: 'Pendências e cobrança', sub: `Competência ${nomeMes(c.mes)}`, abas: [{ nome: 'Pendências', linhas: vis.map(x => ({ 'Data de pagamento': dataPagamento(x.p.dia_pagamento, c.mes) ? fmtD(dataPagamento(x.p.dia_pagamento, c.mes)) : '', 'Região': x.p.regiao, 'Parceiro': x.p.nome, 'Etapa': x.t, 'Última movimentação': x.mv ? `${x.mv.status} (${fmtD(x.mv.criado_em.slice(0, 10))})${x.mv.observacao ? ' · ' + x.mv.observacao : ''}` : '', 'Com quem': GRUPO_PEND.find(g => g[0] === ETAPAS_PEND[x.k][1])?.[1] || '', 'Dias': x.d, 'Prazo vencido': x.atr ? 'Sim' : '', 'Valor': x.valor != null ? Number(x.valor) : null, 'E-mail': x.p.email_contato || '', 'Dia de pagamento': x.p.dia_pagamento || '' })) }] });
}

// ---------- Base do mês do parceiro em Excel (para mandar enquanto nem todos usam o portal) ----------
// Grupo de praças do mesmo parceiro (ex.: Gristch - GO/MT/PR/RS, Salvador1/2/3): nome antes do " - ", sem número no fim
const grupoDe = p => norm(String(p.regiao || '').split(' - ')[0].replace(/\d+\s*$/, '').trim());
const nomeGrupo = p => String(p.regiao || '').split(' - ')[0].replace(/\d+\s*$/, '').trim();
async function dadosBaseParceiro(c, parc) {
  const pid = parc.id;
  const [pts, upp, kits, contr] = await Promise.all([
    todas(() => sb.from('pontos_vigentes').select('cod_int,cliente,loja,cidade,uf,frequencia,previsto,v_unit').eq('competencia_id', c.id).eq('parceiro_id', pid).order('cliente')),
    todas(() => sb.from('umov_por_ponto').select('cod_int,retornadas,atendimentos').eq('competencia_id', c.id).eq('parceiro_id', pid)),
    todas(() => sb.from('umov_fechamento').select('id_umov,grupo_cliente,cliente,cidade,situacao,data_prevista,data_final').eq('competencia_id', c.id).eq('parceiro_id', pid).eq('tipo', 'kit').order('data_prevista')),
    q(sb.from('contratos').select('valor_fixo,inicio,fim').eq('parceiro_id', pid).order('inicio', { ascending: false })),
  ]);
  if (!pts.length && !kits.length) return null;
  const fx = contr.find(k => k.inicio <= c.mes && (!k.fim || k.fim >= c.mes)); const fixo = fx ? Number(fx.valor_fixo) : 0;
  const ticket = parc.ticket_kit != null ? Number(parc.ticket_kit) : 0;
  const um = Object.fromEntries(upp.map(u => [u.cod_int, u]));
  const vistos = new Set(); const kitsU = kits.filter(k => { if (vistos.has(k.id_umov)) return false; vistos.add(k.id_umov); return true; });
  const M = pts.map(p => { const u = um[p.cod_int]; const feitos = u ? Number(u.retornadas) || 0 : 0; const vu = Number(p.v_unit) || 0;
    return { 'Cliente': p.cliente, 'Cod. Int': p.cod_int, 'Loja': p.loja, 'Cidade': p.cidade, 'UF': p.uf, 'Frequência': p.frequencia, 'Previsto (atend.)': Number(p.previsto) || 0, 'Realizado Umov (atend.)': feitos, 'Diferença (atend.)': { f: '[Realizado Umov (atend.)]-[Previsto (atend.)]', v: feitos - (Number(p.previsto) || 0) }, 'V. Unit': vu, 'Valor': { f: '[Realizado Umov (atend.)]*[V. Unit]', v: +(feitos * vu).toFixed(2) } }; });
  const K = kitsU.map(k => { const ret = k.situacao === 'Retornada de Campo';
    return { 'Ref. Umov': k.id_umov, 'Kit': k.grupo_cliente, 'Cliente': k.cliente, 'Cidade': k.cidade, 'Data prevista': (k.data_prevista || '').slice(0, 10), 'Data final': (k.data_final || '').slice(0, 10), 'Situação': k.situacao, 'Valor': ret ? ticket : 0 }; });
  return { M, K, fixo, ticket };
}
async function exportarBaseParceiro(c, parc) {
  const d = await dadosBaseParceiro(c, parc); if (!d) return null;
  const { M, K, fixo, ticket } = d;
  const vM = M.reduce((a, x) => a + valF(x['Valor']), 0), vK = K.reduce((a, x) => a + x['Valor'], 0);
  const qM = M.reduce((a, x) => a + x['Realizado Umov (atend.)'], 0), qK = K.filter(x => x['Valor'] > 0).length;
  // Resumo puxa das abas Malote e Kits (soma e contagem por fórmula)
  const cM = n => M.length ? colLetra(Object.keys(M[0]).indexOf(n) + 1) : null, cK = n => K.length ? colLetra(Object.keys(K[0]).indexOf(n) + 1) : null;
  const fimM = 4 + M.length, fimK = 4 + K.length;
  const resumo = [
    { 'Item': 'Contrato fixo', 'Quantidade': null, 'Valor': fixo },
    { 'Item': 'Malote: atendimentos registrados no Umov × valor unitário', 'Quantidade': M.length ? { f: `SUM(Malote!${cM('Realizado Umov (atend.)')}5:${cM('Realizado Umov (atend.)')}${fimM})`, v: qM } : 0,
      'Valor': M.length ? { f: `SUM(Malote!${cM('Valor')}5:${cM('Valor')}${fimM})`, v: +vM.toFixed(2) } : 0, _q: qM, _v: vM },
    { 'Item': `Kits/Spot retornados (ticket médio ${BRL2(ticket)})`, 'Quantidade': K.length ? { f: `COUNTIF(Kits!${cK('Valor')}5:${cK('Valor')}${fimK},">0")`, v: qK } : 0,
      'Valor': K.length ? { f: `SUM(Kits!${cK('Valor')}5:${cK('Valor')}${fimK})`, v: +vK.toFixed(2) } : 0, _q: qK, _v: vK },
  ].filter(x => (x._v ?? x['Valor']) || x._q).map(({ _q, _v, ...x }) => x);
  const prazo = c.prazo_envio ? ` · confira e devolva até ${fmtD(c.prazo_envio)}` : '';
  const buf = await planilhaPadrao({ titulo: `Base do mês · ${parc.regiao} · ${parc.nome || ''}`, sub: `${nomeMes(c.mes)}${prazo}`, abas: [
    { nome: 'Resumo', linhas: resumo, sub: 'Valores pela base GSM, antes dos ajustes do parceiro. Informe extras e divergências com explicação.' },
    { nome: 'Malote', linhas: M.length ? M : [{ 'Cliente': '(sem pontos de malote)' }] },
    { nome: 'Kits', linhas: K.length ? K : [{ 'Ref. Umov': '(sem kits no Umov)' }] }] });
  return { buf, nome: `Base_${nomeMes(c.mes).replace('/', '_')}_${safeName(parc.regiao || 'parceiro')}.xlsx` };
}
// Uma única planilha com todas as praças do grupo: resumo por praça + malote e kits com a coluna Praça
async function exportarBaseGrupo(c, parcs) {
  const res = [], M = [], K = [];
  const tmp = [];
  for (const p of parcs) { const d = await dadosBaseParceiro(c, p); if (!d) continue;
    const vM = d.M.reduce((a, x) => a + valF(x['Valor']), 0), vK = d.K.reduce((a, x) => a + x['Valor'], 0);
    tmp.push({ p, d, vM, vK, qM: d.M.reduce((a, x) => a + x['Realizado Umov (atend.)'], 0), qK: d.K.filter(x => x['Valor'] > 0).length });
    d.M.forEach(x => M.push({ 'Praça': p.regiao, ...x })); d.K.forEach(x => K.push({ 'Praça': p.regiao, ...x })); }
  if (!tmp.length) return null;
  // Resumo por praça com SOMASES/CONT.SES nas abas Malote e Kits (coluna Praça)
  const cM = n => colLetra(Object.keys(M[0] || { 'Praça': 0 }).indexOf(n) + 1), cK = n => colLetra(Object.keys(K[0] || { 'Praça': 0 }).indexOf(n) + 1);
  const rM = col => `Malote!$${col}$5:$${col}$${4 + M.length}`, rK = col => `Kits!$${col}$5:$${col}$${4 + K.length}`;
  tmp.forEach(({ p, d, vM, vK, qM, qK }) => res.push({ 'Praça': p.regiao, 'Parceiro': p.nome || '', 'Fixo do contrato': d.fixo,
    'Realizado Umov (atend.)': M.length ? { f: `SUMIFS(${rM(cM('Realizado Umov (atend.)'))},${rM('A')},[Praça])`, v: qM } : 0,
    'Valor Malote': M.length ? { f: `SUMIFS(${rM(cM('Valor'))},${rM('A')},[Praça])`, v: +vM.toFixed(2) } : 0,
    'Kits retornados': K.length ? { f: `COUNTIFS(${rK('A')},[Praça],${rK(cK('Valor'))},">0")`, v: qK } : 0,
    'Valor Kits/Spot': K.length ? { f: `SUMIFS(${rK(cK('Valor'))},${rK('A')},[Praça])`, v: +vK.toFixed(2) } : 0,
    'Total': { f: '[Fixo do contrato]+[Valor Malote]+[Valor Kits/Spot]', v: +(d.fixo + vM + vK).toFixed(2) } }));
  const g = nomeGrupo(parcs[0]); const prazo = c.prazo_envio ? ` · confira e devolva até ${fmtD(c.prazo_envio)}` : '';
  const buf = await planilhaPadrao({ titulo: `Base do mês · ${g} · ${res.length} praças`, sub: `${nomeMes(c.mes)}${prazo}`, abas: [
    { nome: 'Resumo por praça', linhas: res, sub: 'Valores pela base GSM, antes dos ajustes do parceiro (kits pelo ticket médio de cada praça). Informe extras e divergências com explicação.' },
    { nome: 'Malote', linhas: M.length ? M : [{ 'Praça': '(sem pontos de malote)' }] },
    { nome: 'Kits', linhas: K.length ? K : [{ 'Praça': '(sem kits no Umov)' }] }] });
  return { buf, nome: `Base_${nomeMes(c.mes).replace('/', '_')}_${safeName(g)}_${res.length}_pracas.xlsx` };
}
async function baixarBaseGrupo(c, parcs, btn) {
  const t = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  try { const r = await exportarBaseGrupo(c, parcs); if (!r) return alertaTopo('Nenhuma praça do grupo tem base neste mês.');
    baixarBlob(new Blob([r.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), r.nome); }
  catch (e) { alertaTopo('Não foi possível gerar a base do grupo: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = t; } }
}
async function baixarBaseParceiro(c, parc, btn) {
  const t = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  try { const r = await exportarBaseParceiro(c, parc); if (!r) return alertaTopo('Este parceiro não tem base neste mês.');
    baixarBlob(new Blob([r.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), r.nome); }
  catch (e) { alertaTopo('Não foi possível gerar a base: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = t; } }
}
async function baixarBasesTodos(c, btn) {
  if (!window.JSZip) return alertaTopo('Não foi possível carregar o compactador de arquivos. Recarregue a página.');
  const t = btn.textContent; btn.disabled = true;
  try { const parcs = await q(sb.from('parceiros').select('id,regiao,nome,ticket_kit,ativo').order('regiao')); const ativos = parcs.filter(p => p.ativo !== false);
    const zip = new JSZip(); let n = 0;
    for (let i = 0; i < ativos.length; i++) { btn.textContent = `Gerando ${i + 1} de ${ativos.length}…`; const r = await exportarBaseParceiro(c, ativos[i]); if (r) { zip.file(r.nome, r.buf); n++; } }
    if (!n) return alertaTopo('Nenhum parceiro tem base neste mês.');
    btn.textContent = 'Compactando…'; baixarBlob(await zip.generateAsync({ type: 'blob' }), `Bases_parceiros_${c.mes.slice(0, 7)}.zip`); alertaOk(`${n} bases geradas.`); }
  catch (e) { alertaTopo('Não foi possível gerar as bases: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = t; }
}

async function vVerParceiro() {
  const m = $('#main');
  const ativos = S.parceiros.filter(p => p.ativo !== false);
  S.previaParc = S.previaParc || ativos[0]?.id;
  m.innerHTML = `<div class="topo"><div><h1>Portal do parceiro</h1><p>A mesma tela que o parceiro vê, com os dados dele. Como gestor, você pode baixar o modelo, enviar o relatório e responder itens em nome do parceiro. Tudo fica registrado como feito pela GSM.</p></div>
    <label class="campo" style="min-width:300px">Parceiro<select id="pvp">${ativos.map(p => `<option value="${p.id}" ${p.id === S.previaParc ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select></label></div>
    <div class="msg alerta" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>Acesso do gestor: você vê todos os meses, inclusive os ainda não liberados para o parceiro.</span><button class="btn sec peq" id="bx-todos">Baixar bases de todos os parceiros (.zip)</button></div>
    <div id="pvcorpo" style="display:flex;flex-direction:column;gap:22px;border:1px dashed var(--rule);border-radius:10px;padding:20px;background:var(--surface)"><div class="carregando">Carregando…</div></div>`;
  $('#pvp').onchange = e => { S.previaParc = e.target.value; S.compPId = null; vVerParceiro(); };
  $('#bx-todos').onclick = e => { const c = S.comps.find(x => x.id === S.compPId) || comp(); if (c) baixarBasesTodos(c, e.currentTarget); };
  S.previa = true;
  S.parc = await q(sb.from('parceiros').select('*').eq('id', S.previaParc).single());
  S.compsP = S.comps.slice().sort((a, b) => b.mes.localeCompare(a.mes));
  if (!S.compPId || !S.compsP.some(c => c.id === S.compPId)) S.compPId = (S.compsP.find(c => c.liberada_parceiros) || S.compsP.find(c => c.status === 'aberta') || S.compsP[0])?.id;
  vParceiroInicio();
}

function rotear() {
  const v = (location.hash || '#pendencias').slice(1);
  S.previa = false; pararTv();
  S.tvGeral = v === 'tvgeral';
  if (v === 'tv') { S.view = 'tv'; return vTv(); }
  if (v === 'tvdir') { S.view = 'tv'; return vTvDir(); }
  if (v === 'tvgeral') { S.view = 'tv'; S.tvSl = 0; return vTv(); }
  S.view = VIEWS[v] ? v : 'pendencias';
  casca();
  VIEWS[S.view]();
}

function casca() {
  app.innerHTML = `
  <div class="sistema">
    <aside class="menu">
      <div class="m-barra"><img src="logo_escuro.png" alt="GSM Log"><b>${esc((MENU.flatMap(g => g[1]).find(x => x[0] === S.view) || [])[1] || '')}</b>
        <button type="button" id="m-menu" aria-expanded="false" aria-label="Abrir o menu">☰ Menu <span class="badge" id="m-badge" hidden></span></button></div>
      <img src="logo_escuro.png" alt="GSM Log">
      <div class="tit"><small>Fechamento</small><strong>Administração</strong></div>
      <nav aria-label="Menu">
        ${MENU.map(([g, itens]) => `<div class="grupo">${g}</div>` + itens.map(([id, nome]) =>
          id ? `<a href="#${id}" class="${S.view === id ? 'on' : ''}"><span>${nome}</span><span class="badge" data-badge="${id}" hidden></span></a>` : `<a class="off">${nome} <em>em construção</em></a>`).join('')).join('')}
      </nav>
      <div class="rodape"><span>${esc(S.user.email)}<br><small style="opacity:.6">versão ${VERSAO}</small></span><span style="display:flex;gap:6px;flex-wrap:wrap">${temaBtn()}<button id="sair">Sair</button></span></div>
    </aside>
    <main id="main"></main>
  </div>`;
  $('#sair').onclick = sair;
  $('#m-menu').onclick = () => { const sis = app.querySelector('.sistema'); const ab = sis.classList.toggle('menu-aberto'); $('#m-menu').setAttribute('aria-expanded', ab); $('#m-menu').firstChild.textContent = ab ? '✕ Fechar ' : '☰ Menu '; };
  desenharBadges(); atualizarBadges(); setTimeout(() => avisoMemoria().catch(() => {}), 800);
}

// Contadores no menu (competência aberta mais recente): o que está esperando ação
const BADGE_TIT = { pendencias: 'parceiros para cobrar', conferencia: 'envios aguardando a GSM', adiantamentos: 'pedidos aguardando decisão', notas: 'NF(s) a conferir', pacote: 'parceiros prontos para montar lote', torre: 'robô(s) com falha ou atrasado', operacao: 'atendimento(s) fora do previsto a revisar (7 dias)' };
function desenharBadges() {
  const b = S.badges || {}; const mb = document.getElementById('m-badge'); if (mb) { const t = Object.values(b).reduce((a, n) => a + (Number(n) || 0), 0); mb.hidden = !t; mb.textContent = t > 99 ? '99+' : t; }
  document.querySelectorAll('[data-badge]').forEach(el => { const n = b[el.dataset.badge] || 0;
    el.hidden = !n; el.textContent = n > 99 ? '99+' : n; el.title = n ? `${n} ${BADGE_TIT[el.dataset.badge] || ''}${S.badgesMes ? ' · ' + S.badgesMes : ''}` : ''; });
}
async function atualizarBadges(forcar = false) {
  if (!forcar && S.badgesEm && Date.now() - S.badgesEm < 10000) return;
  S.badgesEm = Date.now();
  (() => { const h = new Date(), a = new Date(h); a.setDate(a.getDate() - 6);
    sb.rpc('umov_extras', { p_de: isoDia(a), p_ate: isoDia(h) }).then(({ data }) => { if (!data) return; S.badges = { ...(S.badges || {}), operacao: data.filter(r => !r.rev_situacao).length }; desenharBadges(); }); })();
  sb.rpc('torre_robos').then(({ data }) => { if (!data) return; S.badges = { ...(S.badges || {}), torre: (data.robos || []).filter(r => ['falha', 'atrasado'].includes(statusRobo(r)[0])).length }; desenharBadges(); });
  try {
    const c = (S.comps || []).filter(x => x.status === 'aberta').sort((a, b) => b.mes.localeCompare(a.mes))[0]; if (!c) return;
    const [parcs, envs, divs, fech, nfr, adis, movs] = await Promise.all([
      q(sb.from('parceiros').select('id,ativo')),
      todas(() => sb.from('envios').select('id,parceiro_id,versao,status').eq('competencia_id', c.id).neq('status', 'substituido')),
      todas(() => sb.from('divergencias').select('envio_id').eq('competencia_id', c.id).eq('situacao', 'precisa_acao')),
      todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,lote_id,pago_em,antec_status').eq('competencia_id', c.id)),
      todas(() => sb.from('nf_resumo').select('parceiro_id,situacao,recusadas').eq('competencia_id', c.id)),
      todas(() => sb.from('adiantamentos').select('id,status').eq('competencia_id', c.id)),
      carregarMovs(c.id),
    ]);
    const mvU = {}; movs.forEach(x => { if (!mvU[x.parceiro_id]) mvU[x.parceiro_id] = x; });
    const ult = {}; envs.forEach(e => { if (!ult[e.parceiro_id] || e.versao > ult[e.parceiro_id].versao) ult[e.parceiro_id] = e; });
    const fm = Object.fromEntries(fech.map(f => [f.parceiro_id, f])), nm = Object.fromEntries(nfr.map(r => [r.parceiro_id, r]));
    const bd = { pendencias: 0, conferencia: 0, notas: 0, pacote: 0, adiantamentos: 0 };
    parcs.filter(p => p.ativo !== false).forEach(p => { const e = ult[p.id], f = fm[p.id], r = nm[p.id];
      if (f && f.pago_em) return;
      if (f && f.valor_aprovado != null) {
        if (r && r.situacao === 'conferida') { if (!f.lote_id) bd.pacote++; }
        else if (r && r.situacao === 'a_conferir') bd.notas++;
        else bd.pendencias++; // falta a NF ou NF recusada
        return; }
      if (!e && mvU[p.id] && ['gsm', 'ok'].includes(grupoMov(mvU[p.id].status))) return; // sem envio, mas a bola está com a GSM (movimentação manual)
      if (!e || e.status === 'recusado' || divs.some(d => d.envio_id === e.id)) bd.pendencias++; else bd.conferencia++; });
    bd.adiantamentos = adis.filter(a => a.status === 'solicitado').length + fech.filter(f => f.antec_status === 'solicitada').length;
    S.badges = { ...bd, torre: (S.badges || {}).torre || 0, operacao: (S.badges || {}).operacao || 0 }; S.badgesMes = nomeMes(c.mes); desenharBadges();
  } catch (e) { /* contadores são só um aviso */ }
}

function seletorComp(soAbertas = true) {
  const lista = S.comps.filter(c => !soAbertas || c.status === 'aberta');
  if (lista.length && !lista.some(c => c.id === S.compId)) { S.compId = lista.slice().sort((a, b) => a.mes.localeCompare(b.mes))[0].id; S.umovPrev = null; }
  return `<label class="campo" style="min-width:220px">Competência
    <select id="comp">${lista.map(c => `<option value="${c.id}" ${c.id === S.compId ? 'selected' : ''}>${nomeMes(c.mes)}${c.status === 'fechada' ? ' (fechada)' : ''}</option>`).join('')}</select></label>`;
}
function ligarSeletor(fn) { const s = $('#comp'); if (s) s.onchange = () => { S.compId = s.value; S.umovPrev = null; fn(); }; }

function zonaArquivo(id, titulo, dica, accept, multi = false) {
  return `<label class="soltar" id="${id}-zona" for="${id}">
    <strong>${titulo}</strong><span>${dica}</span>
    <input id="${id}" type="file" accept="${accept}"${multi ? ' multiple' : ''} style="font:inherit;font-size:13px;margin-top:6px"></label>`;
}
function ligarZona(id, fn) {
  const z = $(`#${id}-zona`), inp = $(`#${id}`);
  inp.onchange = () => inp.files[0] && fn(inp.files[0], [...inp.files]);
  z.ondragover = e => { e.preventDefault(); z.classList.add('sobre'); };
  z.ondragleave = () => z.classList.remove('sobre');
  z.ondrop = e => { e.preventDefault(); z.classList.remove('sobre'); e.dataTransfer.files[0] && fn(e.dataTransfer.files[0], [...e.dataTransfer.files]); };
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
  m.innerHTML = `<div class="topo"><div><h1>Painel</h1><p>O que está acontecendo no mês e o que depende de você agora.</p></div>${seletorComp()}</div><div id="corpo" class="carregando">Carregando…</div>`;
  ligarSeletor(vPainel);
  const id = S.compId;
  const [imp, cart, base, envs, divs, fech, nfr, adis, lotes, cad] = await Promise.all([
    q(sb.from('umov_importacoes').select('linhas,malote,kits,sem_parceiro,importado_em').eq('competencia_id', id).eq('status', 'ativa').limit(1)).then(r => r[0]),
    q(sb.from('carteira_importacoes').select('importado_em,linhas_gravadas').order('importado_em', { ascending: false }).limit(1)).then(r => r[0]),
    q(sb.from('pontos_importacoes').select('importado_em,linhas_lidas,sem_parceiro').eq('competencia_id', id).eq('status', 'ativa').limit(1)).then(r => r[0]),
    todas(() => sb.from('envios').select('id,parceiro_id,status,versao').eq('competencia_id', id).neq('status', 'substituido')),
    todas(() => sb.from('divergencias').select('envio_id,parceiro_id,situacao').eq('competencia_id', id).in('situacao', ['precisa_acao', 'em_analise'])),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,lote_id,pago_em,antec_status').eq('competencia_id', id)),
    todas(() => sb.from('nf_resumo').select('parceiro_id,situacao,a_conferir').eq('competencia_id', id)),
    q(sb.from('adiantamentos').select('status,valor,valor_solicitado').eq('competencia_id', id)),
    q(sb.from('lotes_financeiro').select('id,status').eq('competencia_id', id).neq('status', 'desfeito')),
    q(sb.from('cadastro_resumo').select('*')),
  ]);
  const ativos = S.parceiros.filter(p => p.ativo !== false).length;
  const ult = {}; envs.forEach(e => { if (!ult[e.parceiro_id] || e.versao > ult[e.parceiro_id].versao) ult[e.parceiro_id] = e; });
  const ue = Object.values(ult);
  const comEnvio = ue.length, aprov = ue.filter(e => e.status === 'aprovado').length;
  const envAtivos = new Set(ue.map(e => e.id));
  const dv = divs.filter(d => envAtivos.has(d.envio_id));
  const decidir = dv.filter(d => d.situacao === 'em_analise').length, comParc = dv.filter(d => d.situacao === 'precisa_acao').length;
  const parcDecidir = new Set(dv.filter(d => d.situacao === 'em_analise').map(d => d.parceiro_id)).size;
  const prontos = ue.filter(e => e.status !== 'aprovado' && e.status !== 'recusado' && !dv.some(d => d.envio_id === e.id)).length;
  const comValor = fech.filter(f => f.valor_aprovado != null);
  const nfConf = nfr.filter(r => r.situacao === 'conferida').length, nfAConf = nfr.filter(r => r.situacao === 'a_conferir').length;
  const nfAguard = nfr.filter(r => r.situacao === 'aguardando').length, nfDif = nfr.filter(r => r.situacao === 'faltando').length;
  const adiPed = adis.filter(a => a.status === 'solicitado'), adiLib = adis.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status));
  const emLote = comValor.filter(f => f.lote_id).length, pagos = comValor.filter(f => f.pago_em).length;
  const pendCad = (cad || []).filter(r => r.situacao === 'Ativo').reduce((a, r) => a + (r.pendencias || 0), 0);
  const fechada = c.status === 'fechada';

  // O que depende de você agora
  const acoes = [];
  const ac = (txt, link, rot, alerta = true) => acoes.push({ txt, link, rot, alerta });
  if (!fechada) {
    if (!base) ac('A base de pontos do mês ainda não foi gerada.', '#competencias', 'Gerar base');
    else if (!c.liberada_parceiros) ac('A base está pronta, mas o mês ainda não foi liberado para os parceiros.', '#competencias', 'Liberar');
    if (pendCad) ac(`${fmtN(pendCad)} ponto(s) ativo(s) da carteira com pendência (sem parceiro, sem preço ou frequência sem dia).`, '#pontos', 'Completar');
    if (imp && imp.sem_parceiro) ac(`${fmtN(imp.sem_parceiro)} atendimento(s) do Umov sem parceiro.`, '#umov', 'Vincular');
    if (decidir) ac(`${fmtN(decidir)} item(ns) de ${parcDecidir} parceiro(s) aguardando a sua decisão.`, '#conferencia', 'Decidir');
    if (prontos) ac(`${prontos} parceiro(s) sem pendência, prontos para aprovar.`, '#conferencia', 'Aprovar');
    const antPed = fech.filter(f => f.antec_status === 'solicitada').length;
    if (antPed) ac(`${antPed} pedido(s) de antecipação do fechamento aguardando resposta.`, '#adiantamentos', 'Responder');
    if (adiPed.length) ac(`${adiPed.length} pedido(s) de adiantamento aguardando resposta (${BRL(adiPed.reduce((a, x) => a + Number(x.valor_solicitado || 0), 0))}).`, '#adiantamentos', 'Responder');
    if (nfAConf) ac(`${nfAConf} parceiro(s) com NF nova para conferir.`, '#notas', 'Conferir');
    if (nfDif) ac(`${nfDif} parceiro(s) com soma de NF diferente do valor líquido.`, '#notas', 'Ver');
    const semLote = comValor.filter(f => !f.lote_id).length;
    if (semLote && nfConf) ac(`${semLote} parceiro(s) aprovado(s) ainda fora de lote de pagamento.`, '#pacote', 'Montar lote', false);
    if (comValor.length && pagos === comValor.length && comValor.length >= ativos) ac('Todos os parceiros pagos: o mês pode ser fechado.', '#pacote', 'Fechar mês', false);
  }

  const etapas = [
    ['Inclusão e cancelamento', !!cart, cart ? `última em ${fmtD(cart.importado_em)}` : 'não importada', '#carteira'],
    ['Base de pontos do mês', !!base, base ? `${fmtN(base.linhas_lidas)} pontos` : 'não gerada', '#competencias'],
    ['Liberar aos parceiros', !!c.liberada_parceiros, c.liberada_parceiros ? `desde ${fmtD(c.liberada_em)}` : 'não liberada', '#competencias'],
    ['Umov do mês', !!imp, imp ? `${fmtN(imp.linhas)} linhas` : 'entra no fim do mês', '#umov'],
    ['Parceiros enviam a base', comEnvio >= ativos && ativos > 0, `${comEnvio} de ${ativos}`, '#conferencia'],
    ['GSM decide e aprova', aprov >= ativos && ativos > 0, `${aprov} aprovado(s)${decidir ? ` · ${decidir} item(ns) para decidir` : ''}`, '#conferencia'],
    ['Adiantamentos e antecipações', !adiPed.length && !fech.some(f => f.antec_status === 'solicitada'), adiPed.length ? `${adiPed.length} pedido(s) em aberto` : adiLib.length ? `${adiLib.length} liberado(s) a pagar` : 'nenhum pendente', '#adiantamentos'],
    ['NF conferida', comValor.length > 0 && nfConf >= comValor.length, comValor.length ? `${nfConf} de ${comValor.length} aprovados${nfAguard ? ` · ${nfAguard} aguardando` : ''}` : 'depois da aprovação', '#notas'],
    ['Lotes do financeiro', comValor.length > 0 && emLote >= comValor.length, comValor.length ? `${emLote} de ${comValor.length} em lote · ${lotes.length} lote(s)` : '—', '#pacote'],
    ['Pagamento registrado', comValor.length > 0 && pagos >= comValor.length, comValor.length ? `${pagos} de ${comValor.length}` : '—', '#pacote'],
    ['Fechar competência', fechada, fechada ? 'fechada' : 'aberta', '#pacote'],
  ];
  const feitas = etapas.filter(e => e[1]).length;
  $('#corpo').outerHTML = `
    <div class="kpis">
      <div class="kpi ${comEnvio < ativos ? 'alerta' : ''}"><small>Envios dos parceiros</small><b>${comEnvio} de ${ativos}</b><span>${ativos - comEnvio} ainda sem envio</span></div>
      <div class="kpi ${decidir ? 'alerta' : 'neutro'}"><small>Itens para você decidir</small><b>${fmtN(decidir)}</b><span>${comParc ? `${comParc} aguardando o parceiro` : 'nenhum com o parceiro'}</span></div>
      <div class="kpi"><small>Aprovados</small><b>${aprov}</b><span>${BRL(comValor.reduce((a, f) => a + Number(f.valor_aprovado || 0), 0))}</span></div>
      <div class="kpi ${nfAConf ? 'alerta' : 'neutro'}"><small>NFs</small><b>${nfConf} conferida(s)</b><span>${nfAConf} a conferir · ${nfAguard} aguardando</span></div>
      <div class="kpi ${pagos < comValor.length ? 'neutro' : ''}"><small>Pagos</small><b>${pagos} de ${comValor.length}</b><span>${emLote} parceiro(s) em lote</span></div>
    </div>
    <section class="bloco"><h2>O que depende de você agora</h2>
      ${acoes.length ? `<div class="tabela"><table><tbody>${acoes.map(a => `<tr><td style="width:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${a.alerta ? 'var(--alert)' : 'var(--ink)'}"></span></td><td>${a.txt}</td><td style="text-align:right;white-space:nowrap"><a class="btn sec peq" href="${a.link}">${a.rot}</a></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="msg ok">${fechada ? 'Competência fechada. Nada pendente.' : 'Nada pendente com você neste momento.'}</div>`}
    </section>
    <section class="bloco"><h2>Ciclo de ${nomeMes(c.mes)} · ${feitas} de ${etapas.length} etapas concluídas</h2>
      <div class="barra" style="max-width:520px"><i style="width:${Math.round(100 * feitas / etapas.length)}%"></i></div>
      <ol class="ciclo">${etapas.map(([t, ok, d, link], i) => `<li class="${ok ? 'pronto' : ''}"><b>${i + 1}</b><a href="${link}" style="color:inherit;text-decoration:none">${t}</a><em>${ok ? '✓ ' : ''}${esc(d)}</em></li>`).join('')}</ol>
    </section>`;
}

// ---------- Passo 1: Importar Umov ----------
async function vUmov() {
  const m = $('#main');
  m.innerHTML = `
    <div class="topo"><div><h1>Base do Umov (API)</h1><p>Os atendimentos do mês vêm direto da API do Umov: o <b>Robô Leitor do Umov</b> traz as movimentações a cada 2 horas e o <b>Robô Montador da Base</b> monta a base do fechamento sozinho às 6h, 12h e 18h. O que é “KIT …” no grupo cliente vira Kits/Spot; o resto é Malote. Não é preciso subir planilha.</p></div>${seletorComp()}</div>
    <div id="ativa"></div>
    <div id="apiacao"></div>
    <details class="bloco" id="contingencia" style="margin-top:12px"${S.umovPrev ? ' open' : ''}><summary style="cursor:pointer"><b>Importar arquivo manualmente</b> <span class="nota">· só em contingência (API fora do ar)</span></summary>
    ${zonaArquivo('arq', 'Arraste a Listagem de atendimentos ou clique para escolher', 'CSV ou Excel, do jeito que sai do Umov', '.csv,.txt,.xlsx,.xls')}
    <div id="prev"></div></details>
    <div id="rotas"></div>
    <div id="hist"></div>`;
  ligarSeletor(vUmov);
  ligarZona('arq', previaUmov);
  await umovAtivaEHist();
  if (S.umovPrev) desenharPreviaUmov();
}

async function umovAtivaEHist() {
  const hist = await q(sb.from('umov_importacoes').select('*').eq('competencia_id', S.compId).order('importado_em', { ascending: false }));
  const ativa = hist.find(h => h.status === 'ativa'); const c = comp();
  const daApi = ativa && ativa.origem === 'api';
  $('#ativa').innerHTML = ativa
    ? `<div class="msg ok">Base ativa de ${nomeMes(c.mes)}: <b>${esc(ativa.arquivo)}</b>${daApi ? ' (API)' : ' (arquivo)'}, ${daApi ? 'montada' : 'importada'} em ${fmtDH(ativa.importado_em)} · ${fmtN(ativa.linhas)} linhas (${fmtN(ativa.malote)} malote, ${fmtN(ativa.kits)} kits).</div>`
    : `<div class="msg alerta">${nomeMes(c.mes)} ainda não tem base do Umov. ${c.status === 'fechada' ? '' : 'Ela é montada sozinha pela API; se quiser, monte agora.'}</div>`;
  const ac = $('#apiacao');
  if (ac) {
    const fechada = c.status === 'fechada';
    ac.innerHTML = fechada ? '' : ativa && !daApi
      ? `<div class="msg">Este mês foi fechado com base de arquivo, por isso a montagem automática não mexe nele. <button class="btn sec peq" id="api-trocar">Trocar pela base da API</button> <button class="btn sec peq" id="api-teste">Só comparar (sem trocar)</button></div>`
      : `<div class="linha"><button class="btn marca" id="api-gerar">Atualizar base agora pela API</button><span class="nota">Leva de 1 a 3 minutos.</span></div>`;
    const rodar = async (bt, forcar, teste) => {
      if (forcar && !confirm(`Trocar a base de ${nomeMes(c.mes)} pela API? A base de arquivo fica no histórico, mas os valores do Umov deste mês passam a vir da API.`)) return;
      bt.disabled = true; const t = bt.textContent; bt.textContent = 'Montando a base…';
      try { const r = await q(sb.rpc('gerar_base_umov', { p_comp: c.id, p_forcar: !!forcar, p_teste: !!teste }));
        bt.textContent = 'Na fila · montando (1 a 3 min)…';
        for (let i = 0; i < 40; i++) { await new Promise(ok => setTimeout(ok, 15000));
          const pd = (await q(sb.from('umov_base_pedido').select('fim,resultado,erro').eq('id', r.pedido)))[0];
          if (!pd || !pd.fim) continue;
          const res = pd.resultado || {};
          if (pd.erro) alertaErro('A base não foi montada: ' + pd.erro); else if (res.ok === false) alertaErro(res.motivo);
          else alertaOk(teste ? `Base de comparação montada: ${fmtN(res.linhas)} linhas (não foi ativada).` : `Base de ${nomeMes(c.mes)} atualizada pela API: ${fmtN(res.linhas)} linhas.`);
          if ($('#apiacao')) await umovAtivaEHist(); break; }
      } catch (e) { alertaErro(e.message); } finally { bt.disabled = false; bt.textContent = t; }
    };
    const b1 = $('#api-gerar'), b2 = $('#api-trocar'), b3 = $('#api-teste');
    if (b1) b1.onclick = () => rodar(b1, false, false); if (b2) b2.onclick = () => rodar(b2, true, false); if (b3) b3.onclick = () => rodar(b3, false, true);
  }
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
    S.umovPrev.per = periodoUmov(r.registros); S.umovPrev.modo = S.umovPrev.per && S.umovPrev.per.dias < 20 ? 'comp' : 'subst';
    if (S.umovPrev.per) { try { S.umovPrev.mant = await contarMantidas(comp(), S.umovPrev.per); } catch (e) {} }
    desenharPreviaUmov();
  } catch (e) { $('#prev').innerHTML = `<div class="msg erro">Não consegui ler o arquivo: ${esc(e.message)}</div>`; }
}

function periodoUmov(regs) {
  const ds = regs.map(r => r.data_prevista && r.data_prevista.slice(0, 10)).filter(Boolean).sort();
  if (!ds.length) return null;
  const ini = ds[0], fim = ds[ds.length - 1]; const dias = Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1;
  const prox = new Date(fim + 'T12:00:00Z'); prox.setUTCDate(prox.getUTCDate() + 1);
  return { ini, fim, dias, iniTs: `${ini}T00:00:00-03:00`, fimTs: `${prox.toISOString().slice(0, 10)}T00:00:00-03:00` };
}
async function contarMantidas(c, per) {
  const at = (await q(sb.from('umov_importacoes').select('id,linhas').eq('competencia_id', c.id).eq('status', 'ativa').limit(1)))[0];
  if (!at) return null;
  const { count: dentro } = await sb.from('umov_atendimentos').select('id', { count: 'exact', head: true }).eq('importacao_id', at.id).gte('data_prevista', per.iniTs).lt('data_prevista', per.fimTs);
  return { total: at.linhas, dentro: dentro || 0, fora: (at.linhas || 0) - (dentro || 0) };
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
    ${ativaTxt ? `<div class="confirma"><b>Já existe uma base ativa para ${nomeMes(c.mes)}.</b> Este arquivo vai de <b>${p.per ? `${fmtD(p.per.ini)} a ${fmtD(p.per.fim)}` : '—'}</b>${p.per ? ` (${p.per.dias} dias)` : ''}. Como gravar?
      <label class="linha" style="margin-top:6px"><input type="radio" name="modo" value="comp" ${p.modo === 'comp' ? 'checked' : ''}> <span><b>Complementar</b>: trocar só os atendimentos de ${p.per ? `${fmtD(p.per.ini)} a ${fmtD(p.per.fim)}` : 'deste período'} e manter o resto da base ativa${p.mant ? ` (${fmtN(p.mant.fora)} linhas mantidas; ${fmtN(p.mant.dentro)} linhas do período saem e entram as ${fmtN(s.total)} deste arquivo)` : ''}. Use para extrações de uma semana ou de alguns dias.</span></label>
      <label class="linha"><input type="radio" name="modo" value="subst" ${p.modo === 'subst' ? 'checked' : ''}> <span><b>Substituir a base inteira</b> por este arquivo. Use só quando o arquivo tiver o mês completo.</span></label>
      ${p.modo === 'subst' && p.per && p.per.dias < 20 ? '<div class="msg alerta" style="margin:6px 0 0">Atenção: este arquivo tem só ' + p.per.dias + ' dias. Substituindo a base, os atendimentos dos outros dias do mês somem da base ativa.</div>' : ''}
      <label class="linha" style="margin-top:6px"><input type="checkbox" id="ciente"> Entendi, quero gravar assim.</label></div>` : ''}
    <div class="linha"><button class="btn marca" id="gravar" ${ativaTxt ? 'disabled' : ''}>Gravar no portal</button><button class="btn sec" id="cancelar">Descartar prévia</button></div>
    <div id="prog"></div>
  </section>`;
  if (ativaTxt) { $('#ciente').onchange = e => $('#gravar').disabled = !e.target.checked;
    $('#prev').querySelectorAll('input[name="modo"]').forEach(r => r.onchange = () => { p.modo = r.value; desenharPreviaUmov(); }); }
  $('#cancelar').onclick = () => { S.umovPrev = null; vUmov(); };
  $('#gravar').onclick = gravarUmov;
}

async function gravarUmov() {
  const p = S.umovPrev, c = comp();
  $('#gravar').disabled = true; $('#cancelar').disabled = true;
  // A gravação continua mesmo se o usuário trocar de tela no meio (só o progresso deixa de aparecer)
  const fake = { innerHTML: '' }; const progEl = () => $('#prog') || fake;
  const passo = (t, pct) => progEl().innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px">${t}</span><div class="barra"><i style="width:${pct}%"></i></div></div>`;
  window.onbeforeunload = () => 'A base do Umov ainda está sendo gravada. Sair agora interrompe a gravação.';
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
    let mantidas = 0;
    if (p.modo === 'comp' && p.per) { passo('Juntando com o resto da base ativa…', 95); mantidas = await q(sb.rpc('complementar_umov', { p_nova: impId, p_ini: p.per.iniTs, p_fim: p.per.fimTs })) || 0; }
    passo('Ativando a base…', 97);
    await q(sb.rpc('ativar_importacao_umov', { p_id: impId }));
    S.umovPrev = null;
    progEl().innerHTML = `<div class="msg ok">Base gravada: ${fmtN(regs.length)} linhas de ${nomeMes(c.mes)}.</div>`;
    window.onbeforeunload = null; alertaOk(mantidas ? `Base do Umov de ${nomeMes(c.mes)} complementada: ${fmtN(regs.length)} linhas novas de ${fmtD(p.per.ini)} a ${fmtD(p.per.fim)} + ${fmtN(mantidas)} linhas mantidas da base anterior.` : `Base do Umov de ${nomeMes(c.mes)} gravada e ativada: ${fmtN(regs.length)} linhas.`); if ($('#prev')) await umovAtivaEHist();
    if ($('#prev')) $('#prev').innerHTML = `<div class="msg ok">Base do Umov de ${nomeMes(c.mes)} gravada com ${fmtN(regs.length)} linhas.</div>`;
  } catch (e) {
    if (impId) await sb.from('umov_importacoes').update({ status: 'falhou', observacao: e.message.slice(0, 200) }).eq('id', impId);
    window.onbeforeunload = null; progEl().innerHTML = `<div class="msg erro">A gravação parou: ${esc(e.message)}. A base ativa anterior (se havia) continua valendo. Pode tentar de novo.</div>`;
    if ($('#gravar')) { $('#gravar').disabled = false; $('#cancelar').disabled = false; }
  }
}

// Regra de vínculo (aprovada em 19/10/2026): 1) rota com parceiro no de-para; 2) cidade atendida por um só parceiro;
// 3) cidade dividida: parceiro principal se tiver >= 90% dos pontos; 4) rota de base própria fica com a GSM; 5) resto pendente.
async function rotasSemParceiro(ativa) {
  const [pend, vinc, pendM, cidP] = await Promise.all([
    q(sb.from('umov_pendentes_cidade').select('*').eq('importacao_id', ativa.id).order('atendimentos', { ascending: false })),
    q(sb.from('umov_vinculos_resumo').select('*').eq('importacao_id', ativa.id)),
    q(sb.from('umov_pendentes_malote').select('*').eq('importacao_id', ativa.id).order('atendimentos', { ascending: false }).limit(300)),
    todas(() => sb.from('cidades_parceiro').select('cidade,uf,parceiro_id,pontos')).catch(() => []),
  ]);
  // Sugestão: 1) rota do Umov com de-para (parceiro ou base própria); 2) cidade atendida por um só parceiro (ou principal com 90%+ dos pontos)
  const normCid = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s\-]+[A-Z]{2}\s*$/, '').replace(/\s+/g, ' ').trim();
  const porCid = {}; cidP.forEach(x => { if (!(x.pontos > 0)) return; (porCid[normCid(x.cidade)] = porCid[normCid(x.cidade)] || []).push(x); });
  const nomeP = id => { const p = S.parceiros.find(x => x.id === id); return p ? p.regiao : '—'; };
  const sugerir = (rotas, cidade) => {
    const alvos = [...new Set((rotas || '').split(', ').filter(Boolean).map(x => S.rotas[x.toUpperCase().trim()]).filter(Boolean).map(d => d.base_propria ? '__bp' : d.parceiro_id).filter(Boolean))];
    if (alvos.length === 1) return { v: alvos[0], fonte: 'pela rota' };
    const cs = porCid[normCid(cidade)] || []; const tot = cs.reduce((a, x) => a + x.pontos, 0); const top = cs.sort((a, b) => b.pontos - a.pontos)[0];
    if (top && (cs.length === 1 || top.pontos / tot >= 0.9)) return { v: top.parceiro_id, fonte: 'pela cidade' };
    return null;
  };
  pendM.forEach(r => r.sug = r.cod_int ? sugerir(r.rotas, r.cidade) : null);
  pend.forEach(r => { r.sug = sugerir(r.rotas, r.cidade_norm); });
  const barra = (pre, n) => `<div class="linha" style="align-items:flex-end;margin:6px 0">
      <input class="peq" id="${pre}-fil" placeholder="Filtrar cliente, cidade ou rota" style="min-width:220px">
      <span class="nota">Marcar: <a href="#" data-${pre}sel="todos">todos</a> · <a href="#" data-${pre}sel="sug">com sugestão</a> · <a href="#" data-${pre}sel="nada">nenhum</a></span>
      <select class="peq" id="${pre}-lote"><option value="">Aplicar a todos os marcados…</option><option value="__bp">Base própria GSM${pre === 'm' ? ' (rota própria)' : ' (kits desta cidade)'}</option>${opts}</select>
      <button class="btn marca peq" id="${pre}-ok">${pre === 'm' ? 'Cadastrar' : 'Vincular'} marcados (<span id="${pre}-n">${n}</span>)</button><span id="${pre}-st" class="nota"></span></div>`;
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
    ${barra('m', pendM.filter(r => r.sug).length)}
    <div class="tabela" style="max-height:560px;overflow:auto"><table><thead><tr><th></th><th>Código</th><th>Cliente no Umov</th><th>Cidade</th><th>Rota no Umov</th><th class="n">Atend.</th><th>Parceiro</th></tr></thead><tbody>
    ${pendM.map((r, i) => `<tr data-mrow="${i}" data-txt="${esc(norm(`${r.cliente} ${r.cidade} ${r.rotas} ${r.cod_int}`))}"><td><input type="checkbox" class="mck" value="${i}" ${r.sug ? 'checked' : ''} ${r.cod_int ? '' : 'disabled'}></td><td class="num">${esc(r.cod_int || '(sem código)')}</td><td style="font-size:13px">${esc(r.cliente || '')}</td><td style="font-size:13px">${esc(r.cidade || '')}</td><td style="font-size:12px;color:var(--muted)">${esc(r.rotas || '')}</td><td class="n">${fmtN(r.atendimentos)}</td>
      <td><select class="peq" id="selm${i}" ${r.cod_int ? '' : 'disabled'}><option value="">Escolha…</option><option value="__bp" ${r.sug?.v === '__bp' ? 'selected' : ''}>Base própria GSM (rota própria)</option>${S.parceiros.filter(p => p.ativo).map(p => `<option value="${p.id}" ${r.sug?.v === p.id ? 'selected' : ''}>${esc(p.codigo + ' · ' + p.regiao + ' · ' + p.nome)}</option>`).join('')}</select>${r.sug ? `<br><span class="nota">sugestão ${r.sug.fonte}: ${r.sug.v === '__bp' ? 'base própria' : esc(nomeP(r.sug.v))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${(() => { const rc = {}; pendM.forEach(r => (r.rotas || '').split(', ').filter(Boolean).forEach(x => rc[x] = (rc[x] || 0) + r.atendimentos));
      const lst = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 30);
      return lst.length ? `<p class="sub" style="margin:4px 0 0">Se o atendimento é de uma base própria da GSM (SP ou RJ), marque a rota. Os pontos dessa rota fora da carteira deixam de aparecer como pendentes.</p>
        <div class="linha">${lst.map(([r, n]) => `<span class="pill" style="display:inline-flex;gap:8px;align-items:center;padding:4px 6px 4px 10px">${esc(r)} · ${fmtN(n)} atend. <button class="btn sec peq" style="min-height:28px;padding:2px 8px" data-bp="${esc(r)}">Base própria</button></span>`).join('')}</div>` : ''; })()}` : ''}
    ${pend.length ? `<h2 style="font-size:15px;margin-top:6px">Kits sem parceiro</h2><p class="sub" style="margin:0">Cidades que nenhum parceiro atende na base. Ao vincular, a cidade fica salva para os próximos meses.</p>
    ${barra('c', pend.filter(r => r.sug).length)}
    <div class="tabela" style="max-height:480px;overflow:auto"><table><thead><tr><th></th><th>Cidade</th><th>Rotas no Umov</th><th class="n">Atend.</th><th>Parceiro</th></tr></thead><tbody>
    ${pend.map((r, i) => `<tr data-crow="${i}" data-txt="${esc(norm(`${r.cidade_norm} ${r.uf_norm} ${r.rotas}`))}"><td><input type="checkbox" class="cck" value="${i}" ${r.sug ? 'checked' : ''} ${r.cidade_norm ? '' : 'disabled'}></td><td>${esc(r.cidade_norm || '(sem cidade)')}${r.uf_norm ? ' - ' + esc(r.uf_norm) : ''}</td><td style="font-size:13px;color:var(--muted)">${esc(r.rotas)}</td><td class="n">${fmtN(r.atendimentos)}</td>
      <td><select class="peq" id="sel${i}"><option value="">Escolha…</option><option value="__bp" ${r.sug?.v === '__bp' ? 'selected' : ''}>Base própria GSM (kits desta cidade)</option>${S.parceiros.filter(p => p.ativo).map(p => `<option value="${p.id}" ${r.sug?.v === p.id ? 'selected' : ''}>${esc(p.codigo + ' · ' + p.regiao + ' · ' + p.nome)}</option>`).join('')}</select>${r.sug ? `<br><span class="nota">sugestão ${r.sug.fonte}: ${r.sug.v === '__bp' ? 'base própria' : esc(nomeP(r.sug.v))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${(() => { const rc = {}; pend.forEach(r => (r.rotas || '').split(', ').filter(Boolean).forEach(x => rc[x] = (rc[x] || 0) + r.atendimentos));
      const lst = Object.entries(rc).filter(([x]) => !S.rotas[x.toUpperCase().trim()]?.base_propria).sort((a, b) => b[1] - a[1]).slice(0, 30);
      return lst.length ? `<p class="sub" style="margin:4px 0 0">Rotas destes kits. Se a rota é da GSM (base própria SP, RJ, BH ou uma pessoa da equipe), marque a rota: todos os kits e malotes dela passam a contar como base própria, também nos próximos meses.</p>
        <div class="linha">${lst.map(([r, n]) => `<span class="pill" style="display:inline-flex;gap:8px;align-items:center;padding:4px 6px 4px 10px">${esc(r)} · ${fmtN(n)} kits <button class="btn sec peq" style="min-height:28px;padding:2px 8px" data-bp="${esc(r)}">Base própria</button></span>`).join('')}</div>` : ''; })()}` : ''}
  </section>`;
  app.querySelectorAll('#rotas button[data-bp]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await q(sb.rpc('vincular_rota', { p_rota: b.dataset.bp, p_parceiro: null, p_base_propria: true }));
      await q(sb.rpc('vincular_por_cidade', { p_importacao: ativa.id }));
      await umovAtivaEHist();
    } catch (e) { b.disabled = false; alertaTopo(e.message); }
  });
  // Ações em lote (malote fora da carteira e cidades de kits)
  const lote = (pre, ck, rowAttr, executar) => {
    const box = $('#rotas'); if (!$(`#${pre}-ok`)) return;
    const conta = () => { $(`#${pre}-n`).textContent = box.querySelectorAll(`.${ck}:checked`).length; };
    box.querySelectorAll(`.${ck}`).forEach(c => c.onchange = conta);
    box.querySelectorAll(`[data-${pre}sel]`).forEach(a => a.onclick = ev => { ev.preventDefault(); const m = a.getAttribute(`data-${pre}sel`);
      box.querySelectorAll(`.${ck}:not(:disabled)`).forEach(c => { const tr = c.closest('tr'); if (tr.style.display === 'none') return; c.checked = m === 'todos' || (m === 'sug' && !!tr.querySelector('.nota')); }); conta(); });
    $(`#${pre}-fil`).oninput = e => { const t = norm(e.target.value); box.querySelectorAll(`tr[${rowAttr}]`).forEach(tr => tr.style.display = !t || tr.dataset.txt.includes(t) ? '' : 'none'); };
    $(`#${pre}-lote`).onchange = e => { const v = e.target.value; if (!v) return; box.querySelectorAll(`.${ck}:checked`).forEach(c => { const sel = $(`#${pre === 'm' ? 'selm' : 'sel'}${c.value}`); if (sel) sel.value = v; }); e.target.value = ''; };
    $(`#${pre}-ok`).onclick = async ev => { const b = ev.currentTarget; const idx = [...box.querySelectorAll(`.${ck}:checked`)].map(c => +c.value);
      const itens = idx.map(i => ({ i, v: $(`#${pre === 'm' ? 'selm' : 'sel'}${i}`).value })).filter(x => x.v);
      if (!itens.length) return alertaTopo('Marque as linhas e escolha o parceiro de cada uma (ou use "Aplicar a todos os marcados").');
      b.disabled = true; let ok = 0; const erros = [];
      for (let k = 0; k < itens.length; k += 6) { await Promise.all(itens.slice(k, k + 6).map(async x => { try { await executar(x.i, x.v); ok++; } catch (e) { erros.push(e.message); } }));
        $(`#${pre}-st`).textContent = `${ok + erros.length} de ${itens.length}…`; }
      if (pre === 'm' && ok) { try { await q(sb.rpc('completar_pontos_umov', { p_cods: itens.map(x => String(pendM[x.i].cod_int)) })); } catch (e) { erros.push('Complemento de loja/valor/frequência: ' + e.message); } }
      if (pre === 'c' || itens.some(x => x.v === '__bp')) { try { await q(sb.rpc('vincular_por_cidade', { p_importacao: ativa.id })); } catch (e) {} }
      await umovAtivaEHist(); alertaOk(`${ok} ${pre === 'm' ? 'pontos cadastrados' : 'cidades vinculadas'}${erros.length ? ` · ${erros.length} com erro: ${[...new Set(erros)].slice(0, 2).join(' · ')}` : ''}.`); };
  };
  lote('m', 'mck', 'data-mrow', async (i, v) => { const r = pendM[i];
    const x = (r.cidade || '').match(/^(.*?)[\s\-]+([A-Za-z]{2})\s*$/);
    const dados = { cod_int: r.cod_int, cliente: r.grupo_cliente || r.cliente, loja: r.cliente, cidade: x ? x[1] : r.cidade, uf: r.uf || (x ? x[2].toUpperCase() : null) };
    if (v === '__bp') await q(sb.rpc('marcar_ponto_base_propria', { p: dados, p_motivo: 'Cadastrado a partir do Umov como base própria' }));
    else await q(sb.rpc('salvar_ponto', { p: { ...dados, parceiro_id: v }, p_motivo: 'Cadastrado a partir do Umov' })); });
  lote('c', 'cck', 'data-crow', async (i, v) => { const r = pend[i];
    if (v === '__bp') await q(sb.rpc('marcar_cidade_base_propria', { p_cidade: r.cidade_norm, p_uf: r.uf_norm }));
    else await q(sb.rpc('vincular_cidade', { p_cidade: r.cidade_norm, p_uf: r.uf_norm, p_parceiro: v })); });
}

function alertaOk(t) { const d = document.createElement('div'); d.className = 'msg ok'; d.textContent = t; $('#main').prepend(d); }
function alertaErro(t) { const d = document.createElement('div'); d.className = 'msg erro'; d.textContent = t; $('#main').prepend(d); }
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
    <thead><tr><th>Competência</th><th>Situação</th><th>Base de pontos</th><th>Umov</th><th>Parceiros</th><th>Prazos do parceiro</th><th></th></tr></thead>
    <tbody>${S.comps.map(c => {
      const i = impDe(c.id); const bs = baseDe(c.id); const aberta = c.status === 'aberta';
      return `<tr><td><b>${nomeMes(c.mes)}</b></td>
        <td><span class="pill ${aberta ? 'marca' : ''}">${aberta ? 'Aberta' : 'Fechada'}</span></td>
        <td>${bs ? `${fmtN(bs.pontos)} pontos · ${fmtD(bs.importado_em)}` : (aberta ? `<button class="btn sec peq" data-gerar="${c.id}">Gerar base do mês</button>` : '—')}</td>
        <td>${i ? `${fmtN(i.linhas)} linhas · ${fmtD(i.importado_em)}` : (aberta ? '<span class="nota">entra no fim do mês</span>' : '—')}</td>
        <td>${c.liberada_parceiros ? `Liberada em ${fmtDH(c.liberada_em)}` : (aberta ? 'Bloqueada' : '—')}</td>
        <td style="white-space:nowrap;font-size:13px">${aberta ? `<label class="campo" style="margin:0">Base até<input type="date" class="peq" id="pz-e-${c.id}" value="${c.prazo_envio || ''}"></label><label class="campo" style="margin:4px 0 0">NF até<input type="date" class="peq" id="pz-n-${c.id}" value="${c.prazo_nf || ''}"></label><button class="btn sec peq" data-pz="${c.id}" style="margin-top:4px">Salvar prazos</button>` : (c.prazo_envio || c.prazo_nf ? `Base ${fmtD(c.prazo_envio)} · NF ${fmtD(c.prazo_nf)}` : '—')}</td>
        <td>${aberta ? (c.liberada_parceiros
          ? `<button class="btn sec peq" data-acao="bloquear" data-id="${c.id}">Bloquear</button>`
          : `<button class="btn peq" data-acao="liberar" data-id="${c.id}" ${bs ? '' : 'disabled title="Gere a base do mês antes"'}>Liberar</button>`) : ''}</td></tr>
        <tr id="conf-${c.id}" hidden><td colspan="7"></td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  $('#evt').innerHTML = evts.length ? `<section class="bloco"><h2>Registro</h2><div class="tabela"><table><thead><tr><th>Quando</th><th>Competência</th><th>O que aconteceu</th></tr></thead><tbody>
    ${evts.map(e => `<tr><td>${fmtDH(e.feito_em)}</td><td>${nomeMes(S.comps.find(c => c.id === e.competencia_id)?.mes)}</td><td>${({ liberada: 'Liberada aos parceiros', bloqueada: 'Bloqueada para os parceiros', fechada: 'Competência fechada' })[e.evento] || esc(e.evento)}${e.detalhe ? ` <span class="nota">${esc(e.detalhe)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  app.querySelectorAll('[data-pz]').forEach(b => b.onclick = async () => { const id = b.dataset.pz;
    const e = $(`#pz-e-${id}`).value || null, n = $(`#pz-n-${id}`).value || null;
    if (e && n && n < e) return alertaTopo('O prazo da NF não pode ser antes do prazo da base.');
    try { await q(sb.from('competencias').update({ prazo_envio: e, prazo_nf: n }).eq('id', id)); await carregarBase(); vCompetencias(); alertaOk('Prazos salvos. Eles aparecem para os parceiros e na tela de Pendências.'); } catch (er) { alertaTopo(er.message); } });
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
  try { S.freqs = (await q(sb.from('frequencias_cadastradas').select('frequencia,pontos').order('pontos', { ascending: false }))).map(r => r.frequencia); } catch (e) { S.freqs = S.freqs || []; }
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
    </section>
    <section class="bloco" id="massa"><h2>Alteração em massa</h2>
      <p class="sub">Para cancelamentos, suspensões ou inclusões grandes que ainda não vieram na planilha de inclusão e cancelamento (ex.: Casas Bahia). Mostra a prévia antes de gravar, e cada ponto alterado fica no histórico com o motivo. Se depois vier na planilha um movimento com data mais nova, ele vale.</p>
      <div id="massa-corpo"></div>
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
  massaPontos();
}

const optsParc = (sel, bp) => `<option value="">Sem parceiro</option><option value="__bp" ${bp ? 'selected' : ''}>Base própria GSM (rota própria)</option>` + S.parceiros.filter(p => p.ativo || p.id === sel).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.codigo + ' · ' + p.regiao)}</option>`).join('');
// Frequência: lista suspensa com as frequências já usadas na carteira (mais usadas primeiro) + "Outra…" para digitar
function selFreq(atual) {
  const lista = [...(S.freqs || [])]; if (atual && !lista.includes(atual)) lista.unshift(atual);
  return `<select class="peq" data-f="frequencia" data-freq style="width:150px"><option value="">— escolher —</option>${lista.map(f => `<option ${f === atual ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__outra">Outra… (digitar)</option></select>`;
}
function ligarFreq() {
  document.querySelectorAll('#main [data-freq]').forEach(sel => sel.onchange = () => {
    if (sel.value !== '__outra') return;
    const i = document.createElement('input'); i.className = 'peq'; i.dataset.f = 'frequencia'; i.placeholder = 'SEG, QUA'; i.style.width = '150px';
    i.onblur = () => { i.value = i.value.toUpperCase().replace(/\s*[,;\/]\s*|\s+E\s+/g, ', ').trim(); };
    sel.replaceWith(i); i.focus(); });
}
function linhaPonto(p, novo = false) {
  const k = novo ? 'novo' : p.cod_int;
  return `<tr data-cod="${esc(k)}">
    <td style="min-width:200px">${novo ? `<input class="peq" data-f="cod_int" placeholder="Código" style="width:120px">` : `<b class="num">${esc(p.cod_int)}</b>`}
      <div><input class="peq" data-f="cliente" value="${esc(p.cliente || '')}" placeholder="Cliente" style="width:200px;margin-top:4px"></div>
      <div><input class="peq" data-f="loja" value="${esc(p.loja || '')}" placeholder="Loja" style="width:200px;margin-top:4px"></div></td>
    <td><input class="peq" data-f="cidade" value="${esc(p.cidade || '')}" placeholder="Cidade" style="width:130px"> <input class="peq" data-f="uf" value="${esc(p.uf || '')}" placeholder="UF" style="width:46px"></td>
    <td><select class="peq" data-f="parceiro_id" style="max-width:210px">${optsParc(p.parceiro_id, p.base_propria)}</select></td>
    <td>${selFreq(p.frequencia)}</td>
    <td><input class="peq num" data-f="v_unit" value="${p.v_unit == null ? '' : p.v_unit}" placeholder="R$" style="width:80px"></td>
    <td><select class="peq" data-f="situacao">${['Ativo', 'Cancelado', 'Suspenso'].map(s => `<option ${s === p.situacao ? 'selected' : ''}>${s}</option>`).join('')}</select>
      ${p.pendencia ? `<div><span class="pill alerta" style="margin-top:4px;white-space:normal;max-width:180px">${esc(p.pendencia)}</span></div>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn peq" data-salvar>Salvar</button> ${novo ? '' : '<button class="btn sec peq" data-hist>Histórico</button>'}</td></tr>`;
}
const CAB_PONTOS = '<thead><tr><th>Ponto</th><th>Cidade</th><th>Parceiro</th><th>Frequência</th><th>V. Unit</th><th>Situação</th><th></th></tr></thead>';
function ligarLinhas() {
  ligarFreq();
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
const diasDesde = iso => { const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`; };
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
  S.acFiltro = S.acFiltro ?? ''; S.acSit = S.acSit || 'todos'; S.acSetor = S.acSetor || 'todos';
  const naSit = l => S.acSit === 'todos' ? l.situacao !== 'excluido' : l.situacao === S.acSit;
  const filtrar = l => naSit(l) && (S.acSetor === 'todos' || l.papel === S.acSetor)
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
    <div class="linha" style="gap:8px;align-items:center"><span class="nota" style="margin:0">Setor:</span><div role="group" aria-label="Filtrar por setor" style="display:inline-flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">
      ${[['todos', 'Todos'], ['parceiro', 'Parceiros'], ['financeiro', 'Financeiro'], ['diretoria', 'Diretoria'], ['admin', 'Administradores']].map(([k, n]) => `<button type="button" data-setor="${k}" aria-pressed="${S.acSetor === k}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${S.acSetor === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n} (${lista.filter(l => naSit(l) && (k === 'todos' || l.papel === k)).length})</button>`).join('')}</div></div>
    <div class="tabela"><table id="actab"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Situação</th><th>Convite gerado</th><th>Último acesso</th><th></th></tr></thead><tbody>
    ${vis.map(l => { const [rot, cls] = ST_AC[l.situacao] || [l.situacao, '']; const eu = l.user_id === S.user.id;
      return `<tr data-row="${l.user_id || esc(l.email)}"><td><b>${esc(l.email)}</b>${eu ? ' <span class="pill">você</span>' : ''}</td><td>${esc(l.nome || '')}</td>
      <td>${esc(PAPEIS[l.papel] || l.papel)}${l.parceiro_id ? `<br><span style="font-size:12px;color:var(--muted)">${esc(pNome(l.parceiro_id))}</span>` : ''}</td>
      <td><span class="pill ${cls}">${rot}</span>${l.tentativas ? ` <span class="nota">${l.tentativas} tentativa(s) errada(s)</span>` : ''}</td>
      <td style="font-size:13px;white-space:nowrap">${l.convite_em ? `${fmtDH(l.convite_em)}${l.situacao === 'convite' ? `<br><span class="nota">${diasDesde(l.convite_em)}</span>` : l.convite_usado_em ? `<br><span class="nota">usado ${fmtDH(l.convite_usado_em)}</span>` : ''}` : '—'}</td>
      <td style="font-size:13px">${l.ultimo_acesso ? fmtDH(l.ultimo_acesso) : '—'}</td>
      <td style="white-space:nowrap">${eu ? `<button class="btn sec peq" data-ed="${l.user_id}">Alterar</button> <button class="btn sec peq" data-senha="${esc(l.email)}">Nova senha</button>` : acoes(l)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="nota">Nada encontrado.</td></tr>'}
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
  const abaixo = (tr, html) => { tab.querySelectorAll('tr.extra').forEach(x => x.remove()); const l = document.createElement('tr'); l.className = 'extra'; l.innerHTML = `<td colspan="7" style="background:var(--field)">${html}</td>`; tr.after(l); return l; };
  const falha = (alvo, e) => { (alvo.querySelector('.am') || alvo).insertAdjacentHTML('beforeend', `<div class="msg erro" style="margin-top:6px">${esc(e.message)}</div>`); };
  const mostrarCodigo = (alvo, email, cod) => {
    const link = location.origin + location.pathname + '?acesso=primeiro';
    const texto = `Portal de Fechamento GSM\n${link}\nPrimeiro acesso (aba "Primeiro acesso"): e-mail ${email} e código ${cod}. Depois escolha a sua senha.`;
    alvo.innerHTML = `<div class="confirma" style="margin-top:8px"><b>Código de ${esc(email)}: <span class="num" style="font-size:18px;letter-spacing:.12em">${esc(cod)}</span></b>
      <span>Ele aparece só agora. Copie e envie ao destinatário.</span>
      <textarea readonly style="font:inherit;font-size:13px;min-height:70px;padding:8px;border:1px solid var(--rule);border-radius:6px">${esc(texto)}</textarea>
      <div><button class="btn peq">Copiar mensagem</button></div></div>`;
    alvo.querySelector('button').onclick = async () => { try { await navigator.clipboard.writeText(texto); alvo.querySelector('button').textContent = 'Copiado'; } catch (e) { alvo.querySelector('textarea').select(); } };
  };
  $('#acf').oninput = e => { S.acFiltro = e.target.value; clearTimeout(S.acT); S.acT = setTimeout(() => { vAcessos().then(() => { const i = $('#acf'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
  m.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => { S.acSit = b.dataset.sit; vAcessos(); });
  m.querySelectorAll('[data-setor]').forEach(b => b.onclick = () => { S.acSetor = b.dataset.setor; vAcessos(); });
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
    <header style="background:var(--panel);color:var(--on-panel);border-left:8px solid var(--brand)">
      <div class="cab" style="max-width:1100px;margin:0 auto;padding:18px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <img src="logo_escuro.png" alt="GSM Log" style="height:34px;width:102px;object-fit:contain">
          <div><div class="eyebrow">Portal do Parceiro</div><div style="font-size:18px;font-weight:600">${esc(p.nome)} · ${esc(p.regiao)}</div></div>
        </div>
        <div class="cab-user" style="display:flex;gap:12px;align-items:center;font-size:13px;color:var(--on-dark)"><span class="cab-email" style="text-align:right">${esc(S.user.email)}<br><small style="opacity:.6">versão ${VERSAO} · <a href="#" id="lnkpriv" style="color:inherit">Privacidade</a></small></span>
          ${temaBtn()}<button id="sair" style="font:inherit;font-size:13px;color:var(--on-panel);background:none;border:1px solid var(--panel-line);border-radius:6px;padding:8px 12px;cursor:pointer">Sair</button></div>
      </div>
    </header>
    <main id="main" style="max-width:1100px;width:100%;margin:0 auto"></main>
  </div>`;
  $('#sair').onclick = sair; $('#lnkpriv').onclick = verPrivacidade;
  vParceiroInicio();
}

async function vParceiroInicio() {
  if (S.baseFechada === undefined) S.baseFechada = !!S.previa;
  const m0 = S.previa && $('#pvcorpo') ? $('#pvcorpo') : $('#main');
  S.pAba = S.pAba || 'acomp';
  m0.innerHTML = `<nav class="abas" aria-label="Seções do portal">${[['acomp', 'Acompanhamento em tempo real'], ['fech', 'Fechamento do mês']].map(([k, t]) => `<button type="button" data-paba="${k}" class="${S.pAba === k ? 'on' : ''}">${t}</button>`).join('')}</nav><div id="pcorpo" style="display:flex;flex-direction:column;gap:22px"></div>`;
  m0.querySelectorAll('[data-paba]').forEach(b => b.onclick = () => { S.pAba = b.dataset.paba; vParceiroInicio(); });
  const m = m0.querySelector('#pcorpo');
  if (S.pAba === 'acomp') return vParceiroAcomp(m);
  if (!S.compsP.length) {
    m.innerHTML = `<div class="bloco"><h2>Nenhum mês liberado</h2><p class="sub" style="margin:0">Assim que a GSM liberar a competência, a base do mês aparece aqui.</p></div>`;
    return;
  }
  const c = S.compsP.find(x => x.id === S.compPId) || S.compsP[0]; S.compPId = c.id;
  m.innerHTML = `<div class="topo"><div><h1>Fechamento de ${nomeMes(c.mes)}</h1><p>A sua base do mês já está no portal: pontos, o que o Umov registrou e os kits. Confira, ajuste só o que não bate (com explicação) e envie para a GSM validar. Depois de aprovado, a NF é enviada aqui mesmo.</p></div>
    <label class="campo" style="min-width:220px">Competência<select id="compP">${S.compsP.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${nomeMes(x.mes)}</option>`).join('')}</select></label></div>
    ${S.previa ? `<div class="msg alerta">Você está agindo em nome de <b>${esc(S.parc.regiao)} · ${esc(S.parc.nome)}</b>. ${c.liberada_parceiros ? 'Mês liberado para o parceiro.' : 'Este mês ainda não está liberado para o parceiro.'} Tudo fica registrado como feito pela GSM.</div>` : ''}
    ${c.prazo_envio || c.prazo_nf ? `<div class="msg" style="margin:0"><b>Prazos de ${nomeMes(c.mes)}:</b> ${c.prazo_envio ? `enviar a base até <b>${fmtD(c.prazo_envio)}</b>` : ''}${c.prazo_envio && c.prazo_nf ? ' · ' : ''}${c.prazo_nf ? `enviar a NF até <b>${fmtD(c.prazo_nf)}</b>` : ''}.</div>` : ''}
    <nav class="linha" style="gap:8px;font-size:14px">${[['secbase', '1. Base do mês'], ['situacao', '2. Validação da GSM'], ['secnf', '3. Nota fiscal'], ['secadi', 'Adiantamento e antecipação']].map(([id, t]) => `<a href="#" data-ir="${id}" class="btn sec peq">${t}</a>`).join('')}</nav>
    <section class="bloco${S.baseFechada ? ' fechada' : ''}" id="secbase"><h2 id="basetit" style="cursor:pointer;user-select:none" title="Clique para abrir ou fechar a lista de pontos">${S.baseFechada ? '▸' : '▾'} 1. Base do mês <span class="nota" style="font-weight:400;font-size:13px">${S.baseFechada ? '(clique para abrir os pontos)' : '(clique para fechar)'}</span></h2><div id="basep" class="carregando">Carregando…</div></section>
    <section class="bloco" id="situacao"><h2>2. Validação da GSM</h2><div id="sitr" class="carregando">Carregando…</div></section>
    <section class="bloco" id="secnf"><h2>3. Nota fiscal</h2><div id="nfp" class="carregando">Carregando…</div></section>
    <section class="bloco" id="secadi"><h2>Adiantamento e antecipação</h2><p class="sub">Antes da aprovação, peça um adiantamento: o valor adiantado é descontado da NF do fechamento. Depois da aprovação, peça a antecipação do pagamento: a NF sai pelo valor com o desconto.</p><div id="adip" class="carregando">Carregando…</div></section>`;
  $('#compP').onchange = e => { S.compPId = e.target.value; S.baseAba = null; vParceiroInicio(); };
  m.querySelectorAll('[data-ir]').forEach(b => b.onclick = ev => { ev.preventDefault(); const id = b.dataset.ir; if (id === 'secbase' && S.baseFechada) $('#basetit').click(); const el = $('#' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#basetit').onclick = () => { S.baseFechada = !S.baseFechada; const t = $('#basetit'); t.firstChild.textContent = (S.baseFechada ? '▸' : '▾') + ' 1. Base do mês ';
    t.querySelector('.nota').textContent = S.baseFechada ? '(clique para abrir os pontos)' : '(clique para fechar)'; $('#secbase').classList.toggle('fechada', S.baseFechada); };
  baseParceiro(c);
  situacaoParceiro(c);
  secaoNF(c);
  secaoAdiantamento(c);
}

// ---------- Base do mês no portal (substitui o modelo em Excel) ----------
const SERV_FORA = ['Redespacho', 'Diária', 'Reversa', 'Embarque', 'Outro'];
// Cabeçalho clicável para ordenar tabelas: estado em S[chave] = { k, d } (d = 1 crescente, -1 decrescente)
function thOrd(chave, k, rot, cls = '') { const o = S[chave] || {}; const seta = o.k === k ? (o.d > 0 ? ' ▲' : ' ▼') : ' <span style="opacity:.35">↕</span>';
  return `<th class="${cls}" data-ord="${chave}:${k}" style="cursor:pointer;user-select:none;white-space:nowrap" title="Clique para ordenar">${rot}${seta}</th>`; }
function ordenar(lista, chave, valores) { const o = S[chave]; if (!o || !valores[o.k]) return lista; const f = valores[o.k];
  return [...lista].sort((a, b) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * o.d; }); }
function ligarOrd(raiz, refazer) { raiz.querySelectorAll('[data-ord]').forEach(th => th.onclick = () => { const [chave, k] = th.dataset.ord.split(':'); const o = S[chave];
  S[chave] = o && o.k === k ? { k, d: -o.d } : { k, d: ['prev', 'feitos', 'vu', 'valor', 'data'].includes(k) ? -1 : 1 }; refazer(); }); }
async function baseParceiro(c) {
  const box = $('#basep'); if (!box) return;
  const pid = S.parc.id;
  const [pts, upp, kits, contr, conts, envs, imp] = await Promise.all([
    todas(() => sb.from('pontos_vigentes').select('cod_int,cliente,loja,cidade,uf,frequencia,previsto,v_unit').eq('competencia_id', c.id).eq('parceiro_id', pid).order('cliente')),
    todas(() => sb.from('umov_por_ponto').select('cod_int,retornadas,atendimentos').eq('competencia_id', c.id).eq('parceiro_id', pid)),
    todas(() => sb.from('umov_fechamento').select('id_umov,grupo_cliente,cliente,cidade,situacao,data_prevista,data_final').eq('competencia_id', c.id).eq('parceiro_id', pid).eq('tipo', 'kit').order('data_prevista')),
    q(sb.from('contratos').select('valor_fixo,inicio,fim').eq('parceiro_id', pid).order('inicio', { ascending: false })),
    q(sb.from('base_contestacoes').select('*').eq('competencia_id', c.id).eq('parceiro_id', pid).eq('ativo', true).order('criado_em')),
    q(sb.from('envios').select('id,versao,status,enviado_em,totais').eq('competencia_id', c.id).eq('parceiro_id', pid).order('versao', { ascending: false }).limit(1)),
    q(sb.from('umov_importacoes').select('importado_em,arquivo').eq('competencia_id', c.id).eq('status', 'ativa').limit(1)),
  ]);
  const per = (await q(sb.from('periodos_parceiro').select('inicio,fim,obs').eq('competencia_id', c.id).eq('parceiro_id', pid)))[0] || null;
  const adiMes = (await q(sb.from('adiantamentos').select('valor,status').eq('competencia_id', c.id).eq('parceiro_id', pid).in('status', ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago']))).reduce((a, x) => a + Number(x.valor || 0), 0);
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
      ${adiMes ? `<div class="kpi neutro"><small>A receber no fechamento</small><b>${BRL2(totalParc - adiMes)}</b><span>valor do mês − ${BRL2(adiMes)} já adiantado</span></div>` : ''}
    </div>
    <div class="linha" style="justify-content:flex-end;margin:-6px 0 0">${S.previa && !trava ? '<button class="btn peq" id="imp-rel">Importar relatório do parceiro</button>' : ''}<button class="btn sec peq" id="bx-base">Baixar base em Excel</button>${(() => { if (!S.previa) return ''; const gr = (S.parceiros || []).filter(p => p.ativo !== false && grupoDe(p) === grupoDe(S.parc)); return gr.length > 1 ? `<button class="btn sec peq" id="bx-grupo" title="${esc(gr.map(p => p.regiao).join(', '))}">Baixar base do grupo ${esc(nomeGrupo(S.parc))} (${gr.length} praças)</button>` : ''; })()}</div>
    <div id="impbox"></div>
    ${per || (S.previa && !trava) ? `<div class="msg ${per ? 'alerta' : ''}" style="margin:6px 0;padding:8px 12px" id="per-box">${S.parc?.quinzenal ? '<b>Parceiro quinzenal:</b> confira se as duas quinzenas do mês entram em algum fechamento. ' : ''}${per ? `<b>Período de apuração: ${fmtD(per.inicio)} a ${fmtD(per.fim)}</b>${per.obs ? ` · ${esc(per.obs)}` : ''}. Só os atendimentos do Umov dentro dessas datas contam neste fechamento, e o previsto é proporcional ao período.` : 'Fechamento do mês inteiro.'}
      ${S.previa && !trava ? ` <a href="#" id="per-ed">${per ? 'alterar' : 'Definir um período (ex.: quinzena)'}</a>${per ? ' · <a href="#" id="per-rm">voltar para o mês inteiro</a>' : ''}` : ''}</div>` : ''}
    <p class="nota" style="margin:0">Umov ${imp[0] ? `atualizado em ${fmtDH(imp[0].importado_em)}` : 'ainda não importado neste mês'}. ${ticket != null ? `Kits retornados valem o ticket médio de ${BRL2(ticket)} cada; se um kit foi maior, ajuste o valor e explique.` : '<b>Ticket médio de kits ainda não cadastrado pela GSM.</b>'}</p>
    ${trava ? `<div class="msg ok">${aprovado ? 'Mês aprovado pela GSM: a base não pode mais ser alterada.' : 'Mês fechado.'}</div>` : ''}
    <nav class="abas">${abas.map(([k, n]) => `<button type="button" data-ba="${k}" class="${S.baseAba === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
    <div id="baseaba"></div>`;
  box.querySelectorAll('[data-ba]').forEach(b => b.onclick = () => { S.baseAba = b.dataset.ba; baseParceiro(c); });
  $('#bx-base').onclick = e => baixarBaseParceiro(c, S.parc, e.currentTarget);
  const bg = $('#bx-grupo'); if (bg) bg.onclick = async e => { const btn = e.currentTarget; const ids = (S.parceiros || []).filter(p => p.ativo !== false && grupoDe(p) === grupoDe(S.parc)).map(p => p.id);
    try { const gr = await q(sb.from('parceiros').select('id,regiao,nome,ticket_kit,ativo').in('id', ids).order('regiao')); baixarBaseGrupo(c, gr, btn); } catch (er) { alertaTopo(er.message); } };
  const salvaPer = async (ini, fim, obs) => { try { await q(sb.rpc('definir_periodo_parceiro', { p_comp: c.id, p_parceiro: pid, p_inicio: ini, p_fim: fim, p_obs: obs || null })); baseParceiro(c); } catch (e) { alertaTopo(e.message); } };
  const pe = $('#per-ed'); if (pe) pe.onclick = ev => { ev.preventDefault(); const b = $('#per-box');
    b.innerHTML = `<div class="linha" style="align-items:flex-end"><label class="campo">De<input type="date" class="peq" id="per-i" value="${per?.inicio || c.mes}"></label><label class="campo">Até<input type="date" class="peq" id="per-f" value="${per?.fim || ''}"></label>
      <label class="campo" style="flex:1 1 220px">Observação<input class="peq" id="per-o" value="${esc(per?.obs || '')}" placeholder="ex.: 2ª quinzena"></label><button class="btn peq" id="per-ok">Salvar período</button></div>`;
    $('#per-ok').onclick = () => salvaPer($('#per-i').value, $('#per-f').value, $('#per-o').value); };
  const pr = $('#per-rm'); if (pr) pr.onclick = ev => { ev.preventDefault(); salvaPer(null, null, null); };
  const ctxImp = () => ({ per, pontos: pts.map(p => ({ ...p, feitos: um[p.cod_int] ? Number(um[p.cod_int].retornadas) || 0 : 0 })), kits, ticket: ticket ?? 0, conts, fixo, pid, recarregar: () => baseParceiro(c) });
  const ib = $('#imp-rel'); if (ib) ib.onclick = () => importadorRelatorio(c, ctxImp());
  if (S.imp && S.imp.pid === pid && S.imp.comp === c.id && $('#impbox')) { if (S.imp.recarregarPer) { S.imp.recarregarPer = false; S.imp.ctx = ctxImp(); recasar(); } desenharImport(c); }
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
    const visO = ordenar(vis, 'ordM', { cod: x => x.cod_int, cli: x => `${x.cliente || ''} ${x.loja || ''}`, cid: x => `${x.cidade || ''} ${x.uf || ''}`, freq: x => x.frequencia || null,
      prev: x => Number(x.previsto) || 0, feitos: x => x.ct ? x.ct.realizado : x.feitos, vu: x => x.vu, valor: x => x.valor });
    const pag = visO.slice(0, 200);
    alvo.innerHTML = `<div class="linha" style="justify-content:space-between"><div class="linha">${[['todos', 'Todos'], ['abaixo', 'Abaixo do previsto'], ['zerados', 'Sem atendimento no Umov'], ['ajustados', 'Ajustados por você']].map(([k, n]) => `<button class="btn ${S.baseSo === k ? '' : 'sec'} peq" data-so="${k}">${n}</button>`).join('')}</div>
      <input class="peq" id="bfil" placeholder="Buscar código, cliente, cidade" value="${esc(S.baseFiltro)}" style="min-width:240px"></div>
      <div class="tabela"><table id="btm"><thead><tr>${thOrd('ordM', 'cod', 'Código')}${thOrd('ordM', 'cli', 'Cliente / loja')}${thOrd('ordM', 'cid', 'Cidade')}${thOrd('ordM', 'freq', 'Frequência')}${thOrd('ordM', 'prev', 'Previsto', 'n')}${thOrd('ordM', 'feitos', 'Feitos (Umov)', 'n')}${thOrd('ordM', 'vu', 'V. unit', 'n')}${thOrd('ordM', 'valor', 'Valor', 'n')}<th></th></tr></thead><tbody>
      ${pag.map(x => `<tr data-cod="${esc(x.cod_int)}"${x.ct ? ' style="background:var(--wash)"' : ''}><td class="num">${esc(x.cod_int)}</td><td style="font-size:13px"><b>${esc(x.cliente || '')}</b><br>${esc(x.loja || '')}</td><td style="font-size:13px">${esc(x.cidade || '')}${x.uf ? ' - ' + esc(x.uf) : ''}</td><td style="font-size:13px">${esc(x.frequencia || '')}</td>
        <td class="n">${fmtN(x.previsto || 0)}</td><td class="n">${x.ct ? `<s style="color:var(--muted)">${fmtN(x.feitos)}</s> <b>${fmtN(x.ct.realizado)}</b>` : fmtN(x.feitos)}</td><td class="n">${BRL2(x.vu)}</td><td class="n">${BRL2(x.valor)}</td>
        <td style="white-space:nowrap">${trava ? '' : x.ct ? `<span class="nota" title="${esc(x.ct.justificativa)}">ajustado</span> <button class="btn sec peq" data-rm="${x.ct.id}">Desfazer</button>` : `<button class="btn sec peq" data-aj="${esc(x.cod_int)}">Ajustar</button>`}</td></tr>`).join('')}
      </tbody></table></div>${vis.length > pag.length ? `<p class="nota">Mostrando ${pag.length} de ${fmtN(vis.length)}. Use a busca para achar um ponto.</p>` : ''}
      <p class="nota">Feitos = atendimentos retornados de campo no Umov. Se você atendeu e o Umov não registrou (ou o contrário), clique em Ajustar, informe o número certo e explique.${fixo ? ` O valor fixo do contrato (${BRL2(fixo)}) entra no total.` : ''}</p>`;
    alvo.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { S.baseSo = b.dataset.so; baseParceiro(c); });
    ligarOrd(alvo, () => baseParceiro(c));
    $('#bfil').oninput = e => { S.baseFiltro = e.target.value; clearTimeout(S.bT); S.bT = setTimeout(() => { baseParceiro(c).then(() => { const i = $('#bfil'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); };
    alvo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => retirar(b.dataset.rm));
    alvo.querySelectorAll('[data-aj]').forEach(b => b.onclick = () => { const x = linhasM.find(k => k.cod_int === b.dataset.aj); const tr = b.closest('tr');
      alvo.querySelectorAll('tr.extra').forEach(e => e.remove());
      const l = formLinha(9, `<label class="campo">Atendimentos feitos<input class="peq" data-x="real" value="${x.feitos}" style="width:110px"></label>`, 'mal', async l2 => {
        const n = Number(v(l2, 'real').value); if (!Number.isInteger(n) || n < 0) return (v(l2, 'msg').innerHTML = '<div class="msg erro">Informe um número inteiro.</div>');
        await salvar({ tipo: 'malote', ref: x.cod_int, realizado: n, justificativa: v(l2, 'just').value }, v(l2, 'arq').files[0], 'mal', v(l2, 'msg')); });
      tr.after(l); });
  } else if (S.baseAba === 'kits') {
    const kOrd = ordenar(linhasK, 'ordK', { ref: k => k.id_umov, data: k => (k.data_final || k.data_prevista || '').slice(0, 16), kit: k => `${k.grupo_cliente || ''} ${k.cliente || ''}`, cid: k => k.cidade || null, sit: k => k.situacao || null, valor: k => k.valor });
    alvo.innerHTML = `<div class="tabela"><table><thead><tr>${thOrd('ordK', 'ref', 'Ref. Umov')}${thOrd('ordK', 'data', 'Data')}${thOrd('ordK', 'kit', 'Kit / cliente')}${thOrd('ordK', 'cid', 'Cidade')}${thOrd('ordK', 'sit', 'Situação no Umov')}${thOrd('ordK', 'valor', 'Valor', 'n')}<th></th></tr></thead><tbody>
      ${kOrd.map(k => `<tr${k.ct ? ' style="background:var(--wash)"' : ''}><td class="num">${esc(k.id_umov)}</td><td>${fmtD(k.data_final || k.data_prevista)}</td><td style="font-size:13px"><b>${esc(k.grupo_cliente || '')}</b><br>${esc(k.cliente || '')}</td><td style="font-size:13px">${esc(k.cidade || '')}</td>
        <td><span class="pill ${k.situacao === 'Retornada de Campo' ? '' : 'alerta'}">${esc(k.situacao || '—')}</span></td><td class="n">${k.ct ? `<s style="color:var(--muted)">${BRL2(k.valorGSM)}</s> <b>${BRL2(k.valor)}</b>` : BRL2(k.valor)}</td>
        <td style="white-space:nowrap">${trava ? '' : k.ct ? `<span class="nota" title="${esc(k.ct.justificativa)}">ajustado</span> <button class="btn sec peq" data-rm="${k.ct.id}">Desfazer</button>` : `<button class="btn sec peq" data-ak="${esc(k.id_umov)}">Ajustar</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="nota">Nenhum kit do Umov para você neste mês.</td></tr>'}
      </tbody></table></div>
      <h3 style="margin:10px 0 0;font-size:15px">Kits que não aparecem no Umov</h3>
      ${extras.length ? `<div class="tabela"><table><tbody>${extras.map(x => `<tr><td>${fmtD(x.data)}</td><td>${esc(x.descricao || '')}</td><td>${esc(x.cidade || '')}</td><td class="n">${BRL2(x.valor)}</td><td style="font-size:13px">${esc(x.justificativa || '')}${x.arquivo_path ? ' · comprovante anexado' : ''}</td><td>${trava ? '' : `<button class="btn sec peq" data-rm="${x.id}">Remover</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${trava ? '' : `<div class="linha" style="align-items:flex-end"><label class="campo">Data<input type="date" class="peq" id="ke-d"></label><label class="campo" style="flex:1 1 200px">Kit / cliente<input class="peq" id="ke-ds"></label><label class="campo">Cidade<input class="peq" id="ke-c" style="width:150px"></label><label class="campo">Valor (R$)<input class="peq" id="ke-v" style="width:110px"></label>
        <label class="campo" style="flex:1 1 220px">Explicação<input class="peq" id="ke-j" placeholder="por que não está no Umov"></label><label class="campo">Comprovante<input type="file" id="ke-a" accept=".pdf,.jpg,.jpeg,.png" style="font:inherit;font-size:13px"></label><button class="btn peq" id="ke-ok">Adicionar kit</button></div><div id="ke-m"></div>`}`;
    alvo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => retirar(b.dataset.rm));
    ligarOrd(alvo, () => baseParceiro(c));
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
        <tr><td><b>Total a enviar</b></td><td class="n"><b style="font-size:18px">${BRL2(totalParc)}</b></td></tr>
        ${adiMes ? `<tr><td>Adiantamento já liberado (descontado na NF do fechamento)</td><td class="n">−${BRL2(adiMes)}</td></tr><tr><td><b>A receber no fechamento</b></td><td class="n"><b>${BRL2(totalParc - adiMes)}</b></td></tr>` : ''}</tbody></table></div>
      ${adiMes ? '<p class="nota" style="margin:0">O valor enviado é o do mês inteiro (é ele que a GSM valida). O adiantamento sai na NF do fechamento, que é emitida pelo valor aprovado menos o adiantado.</p>' : ''}
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

// ---------- Importar o relatório do parceiro (qualquer planilha) ----------
// Relatório em PDF (tabela): monta linhas pela posição do texto na página; as colunas vêm do cabeçalho
async function tabelaPDF(file) {
  if (!window.pdfjsLib) throw new Error('Leitor de PDF não carregou. Recarregue a página.');
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise; const linhas = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) { const pg = await pdf.getPage(p); const tc = await pg.getTextContent(); const ls = [];
    tc.items.filter(it => it.str && it.str.trim()).forEach(it => { const y = it.transform[5], x = it.transform[4], w = it.width || 0;
      let l = ls.find(k => Math.abs(k.y - y) < 3); if (!l) ls.push(l = { y, its: [] }); l.its.push({ x, c: x + w / 2, s: it.str.trim() }); });
    ls.sort((a, b) => b.y - a.y).forEach(l => linhas.push(l.its.sort((a, b) => a.x - b.x))); }
  if (!linhas.length) throw new Error('O PDF não tem texto (parece ser imagem). Peça o relatório em Excel ou PDF gerado pelo sistema.');
  // Cabeçalho: primeira linha com 3+ palavras de cabeçalho conhecidas
  const ehCab = l => l.filter(i => /^(data|hora|loja|cliente|retirada|coleta|entrega|destino|valor|qtd|quantidade|cidade|nf|nota|ponto|unidade|total|atendimentos?|frequ)/i.test(i.s)).length >= 3;
  const ih = linhas.findIndex(ehCab); if (ih < 0) return { PDF: linhas.map(l => l.map(i => i.s)) };
  const cols = linhas[ih].map(i => ({ c: i.c, s: i.s }));
  const rows = [cols.map(x => x.s)];
  for (const l of linhas.slice(ih + 1)) { if (ehCab(l)) continue; const r = cols.map(() => null);
    l.forEach(i => { let k = 0, d = Infinity; cols.forEach((col, j) => { const dd = Math.abs(col.c - i.c); if (dd < d) { d = dd; k = j; } }); r[k] = r[k] ? `${r[k]} ${i.s}` : i.s; });
    rows.push(r); }
  return { PDF: rows };
}
async function lerPlanilhaLimitada(file, max = 4000) {
  if (/\.pdf$/i.test(file.name)) return tabelaPDF(file);
  const buf = await file.arrayBuffer();
  if (/\.csv$|\.txt$/i.test(file.name)) return { 'CSV': parseCSV(decodeText(buf)) };
  const wb = XLSX.read(buf, { type: 'array' }); const out = {};
  for (const n of wb.SheetNames) { const ws = wb.Sheets[n]; if (!ws['!ref']) continue; const r = XLSX.utils.decode_range(ws['!ref']); r.e.r = Math.min(r.e.r, r.s.r + max);
    out[n] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: r }); }
  return out;
}
function importadorRelatorio(c, ctx, manter = false) {
  const box = $('#impbox'); if (!box) return;
  if (!manter) S.imp = null;
  box.innerHTML = `<section class="bloco" style="background:var(--field);margin:4px 0"><h2 style="margin-top:0">Importar relatório do parceiro</h2>
    <p class="sub">Suba a planilha (Excel/CSV) ou o PDF que o parceiro mandou, no formato dele. O portal acha as colunas sozinho e casa cada linha com a base do mês: malote pelo código de integração ou, se não tiver, pelas palavras do nome da loja; kits e spots pelo número (NF, pedido, kit) ou pelo nome. Nada é gravado antes de você conferir.</p>
    <div class="linha"><input type="file" id="imp-arq" accept=".xlsx,.xls,.xlsm,.csv,.pdf" style="font:inherit"><button class="btn sec peq" id="imp-x">Fechar</button></div><div id="imp-res"></div></section>`;
  $('#imp-x').onclick = () => { S.imp = null; box.innerHTML = ''; };
  $('#imp-arq').onchange = async e => { const f = e.target.files[0]; if (!f) return; const res = $('#imp-res'); res.innerHTML = '<div class="carregando">Lendo e casando com a base…</div>';
    try { const sheets = await lerPlanilhaLimitada(f); const mesRef = `${+c.mes.slice(5, 7)}/${c.mes.slice(0, 4)}`;
      const { abas, linhas } = lerLinhas(sheets, mesRef);
      if (!linhas.length) return (res.innerHTML = '<div class="msg erro">Não encontrei linhas com nome e valor nesta planilha. Confira se ela tem uma linha de cabeçalho (ex.: Loja / Unidade, Quantidade / Atendimentos, Valor).</div>');
      S.imp = { pid: ctx.pid, comp: c.id, arquivo: f.name, abas, linhas, ctx, usar: Object.fromEntries(abas.filter(a => a.reconhecida).map(a => [a.nome, !a.outroMes])), zerar: true, filtro: 'atencao', fora: new Set(), manual: {} };
      recasar(); desenharImport(c);
    } catch (er) { res.innerHTML = `<div class="msg erro">Não foi possível ler o arquivo: ${esc(er.message)}</div>`; } };
  if (manter && S.imp) desenharImport(c);
}
function recasar() {
  const I = S.imp; I.manual = I.manual || {}; const { itens, naoCobrados } = casar(I.linhas.filter(l => I.usar[l.aba]), { ...I.ctx, manual: I.manual });
  itens.forEach((it, i) => { it.i = i;
    if (it.tipo === 'malote') { const d = Math.round(((it.qtd ?? 0) - it.alvo.feitos) * 100) / 100; it.dif = d;
      it.sit = d === 0 ? ['Bate com o Umov', 'escuro'] : d > 0 ? [`Acima do Umov (+${fmtN(d)})`, 'marca'] : [`Abaixo do Umov (${fmtN(d)})`, ''];
      const vc = Number(it.alvo.v_unit) || 0; if (it.vu && vc && Math.abs(it.vu - vc) > 0.05) it.aviso.push(`valor unitário ${BRL2(it.vu)} no relatório e ${BRL2(vc)} no cadastro`);
      if (it.qtd != null && !Number.isInteger(it.qtd)) it.aviso.push('quantidade não inteira: será arredondada');
      it.valorPortal = Math.round(it.qtd ?? 0) * vc; it.valorUmov = it.alvo.feitos * vc; }
    else if (it.tipo === 'kit') it.sit = [`Kit no Umov${it.kitsExtra.length ? ` (+${it.kitsExtra.length} kit${it.kitsExtra.length > 1 ? 's' : ''} na mesma linha)` : ''}`, 'escuro'];
    else if (it.tipo === 'extra') it.sit = ['Não está no Umov', 'alerta'];
    else if (it.tipo === 'fora') it.sit = ['Ponto fora da carteira', 'alerta'];
    else if (it.tipo === 'adicional') it.sit = [`Atendimento extra (${fmtN(it.adicional)} × ${BRL2(it.vu)})`, 'escuro'];
    else if (it.tipo === 'duplicado') it.sit = ['Cobrado em dobro', 'marca'];
    it.atencao = it.tipo !== 'malote' && it.tipo !== 'kit' && it.tipo !== 'adicional' || (it.tipo === 'malote' && it.dif > 0) || it.aviso.length > 0 || /conferir/.test(it.conf || '');
  });
  I.itens = itens; I.naoCobrados = naoCobrados.filter(k => k.situacao === 'Retornada de Campo');
  I.fora = new Set(itens.filter(i => i.tipo === 'duplicado').map(i => i.i));
}
// Lista para escolher à mão o ponto de uma linha do relatório (sugestões primeiro)
function selPontoImp(i) { const I = S.imp; const pts = I.ctx.pontos; const sug = (i.sugestoes || []).filter(c => c !== i.alvo?.cod_int);
  const op = p => `<option value="${esc(p.cod_int)}" ${i.alvo?.cod_int === p.cod_int ? 'selected' : ''}>${esc(p.loja || p.cliente || '')} · ${esc(p.cidade || '')} (${esc(p.cod_int)})</option>`;
  const resto = [...pts].sort((a, b) => (a.loja || '').localeCompare(b.loja || ''));
  return `<div style="margin-top:4px"><select class="peq" data-pp="${esc(i.aba)}:${i.linha}" style="max-width:320px"><option value="">${i.alvo ? 'Trocar ponto…' : 'Escolher o ponto da carteira…'}</option>${i.alvo ? `<option value="${esc(i.alvo.cod_int)}" selected>${esc(i.alvo.loja || '')} (atual)</option>` : ''}
    ${sug.length ? `<optgroup label="Sugestões">${sug.map(c => pts.find(p => p.cod_int === c)).filter(Boolean).map(op).join('')}</optgroup>` : ''}<optgroup label="Todos os pontos">${resto.map(op).join('')}</optgroup><option value="__fora">Fora da carteira (lançar como extra)</option></select></div>`; }
// Diferença entre o valor do relatório e quantidade × valor cadastrado (preço diferente em algumas visitas)
const difValorImp = i => { const vc = Number(i.alvo?.v_unit) || 0; if (i.tipo !== 'malote' || !vc || !i.total) return 0; const d = Math.round((i.total - Math.round(i.qtd ?? 0) * vc) * 100) / 100; return Math.abs(d) >= 0.01 ? d : 0; };
function desenharImport(c) {
  const I = S.imp; const res = $('#imp-res'); if (!res) { if ($('#impbox')) importadorRelatorio(c, I.ctx, true); return; }
  const inc = I.itens.filter(i => !I.fora.has(i.i)); const soma = (l, f) => l.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const mal = inc.filter(i => i.tipo === 'malote'), kit = inc.filter(i => i.tipo === 'kit'), ext = inc.filter(i => i.tipo === 'extra'), fora = inc.filter(i => i.tipo === 'fora'), adic = inc.filter(i => i.tipo === 'adicional');
  const dup = I.itens.filter(i => i.tipo === 'duplicado');
  const acima = soma(mal.filter(i => i.dif > 0), i => i.dif * (Number(i.alvo.v_unit) || 0)), abaixo = soma(mal.filter(i => i.dif < 0), i => -i.dif * (Number(i.alvo.v_unit) || 0));
  const codsRel = new Set(mal.map(i => i.alvo.cod_int));
  const malPortal = soma(I.ctx.pontos, p => (codsRel.has(p.cod_int) ? Math.round(mal.find(i => i.alvo.cod_int === p.cod_int).qtd ?? 0) : p.feitos) * (Number(p.v_unit) || 0));
  const totRel = soma(inc, i => i.total);
  const totPortal = I.ctx.fixo + malPortal + soma(kit, i => i.total) + soma(ext, i => i.total) + soma(fora, i => i.total) + soma(adic, i => i.total) + (I.ajValor !== false ? soma(mal, difValorImp) : 0) + (I.zerar ? 0 : I.naoCobrados.length * I.ctx.ticket);
  const vis = I.itens.filter(i => I.filtro === 'todos' || (I.filtro === 'atencao' ? i.atencao : I.filtro === 'malote' ? (i.tipo === 'malote' || i.tipo === 'fora' || i.tipo === 'adicional') : (i.tipo === 'kit' || i.tipo === 'extra' || (i.tipo === 'duplicado' && !i.alvo?.cod_int))));
  res.innerHTML = `
    <p class="nota" style="margin:8px 0 4px"><b>${esc(I.arquivo)}</b> · abas: ${I.abas.map(a => a.reconhecida ? `<label style="margin-right:10px"><input type="checkbox" data-aba="${esc(a.nome)}" ${I.usar[a.nome] ? 'checked' : ''}> ${esc(a.nome)} (${a.linhas} linhas${a.formato ? ` · relatório de ${a.formato}` : ''}${a.periodo ? ` · ${fmtD(a.periodo[0])} a ${fmtD(a.periodo[1])}` : ''})${a.outroMes ? ' <b style="color:var(--brand-deep)">parece ser de outro mês</b>' : ''}</label>` : `<span style="color:var(--muted);margin-right:10px">${esc(a.nome)} (não reconhecida)</span>`).join('')}</p>
    ${(() => { const pa = I.abas.find(x => x.periodo && I.usar[x.nome]); const p0 = I.ctx.per; if (!pa) return '';
      const igual = p0 && p0.inicio === pa.periodo[0] && p0.fim === pa.periodo[1];
      return `<div class="msg ${igual ? 'ok' : 'alerta'}" style="margin:6px 0;padding:8px 12px">O relatório vai de <b>${fmtD(pa.periodo[0])} a ${fmtD(pa.periodo[1])}</b>. ${igual ? 'É o mesmo período de apuração deste fechamento: a comparação com o Umov já considera só essas datas.' : `${p0 ? `O período de apuração deste fechamento está como ${fmtD(p0.inicio)} a ${fmtD(p0.fim)}.` : 'Este fechamento está considerando o mês inteiro no Umov.'} Se o parceiro fecha por quinzena, use o período do relatório. <button class="btn peq" id="imp-per" data-i="${pa.periodo[0]}" data-f="${pa.periodo[1]}">Usar ${fmtD(pa.periodo[0])} a ${fmtD(pa.periodo[1])} como período deste fechamento</button>`}</div>`; })()}
    <div class="kpis">
      <div class="kpi neutro"><small>Total do relatório</small><b>${BRL2(totRel)}</b><span>${fmtN(inc.length)} linhas incluídas</span></div>
      <div class="kpi ${acima > 0.5 ? 'alerta' : 'neutro'}"><small>Malote acima do Umov</small><b>${BRL2(acima)}</b><span>${fmtN(mal.filter(i => i.dif > 0).length)} pontos · ${BRL2(abaixo)} abaixo</span></div>
      <div class="kpi ${ext.length + fora.length ? 'alerta' : 'neutro'}"><small>Sem par na base</small><b>${BRL2(soma(ext, i => i.total) + soma(fora, i => i.total))}</b><span>${ext.length} spots fora do Umov · ${fora.length} pontos fora da carteira</span></div>
      <div class="kpi ${dup.length ? 'alerta' : 'neutro'}"><small>Cobrado em dobro</small><b>${BRL2(soma(dup, i => i.total))}</b><span>${dup.length} linha(s), fora da importação</span></div>
      <div class="kpi"><small>Total no portal após importar</small><b>${BRL2(totPortal)}</b><span>${I.ctx.fixo ? `fixo ${BRL2(I.ctx.fixo)} + ` : ''}malote ${BRL2(malPortal)} + kits e extras</span></div>
    </div>
    ${mal.some(i => difValorImp(i)) ? `<label class="nota" style="display:block;margin:6px 0"><input type="checkbox" id="imp-av" ${I.ajValor !== false ? 'checked' : ''}> Lançar as diferenças de preço do relatório (${BRL2(soma(mal, difValorImp))} em ${mal.filter(i => difValorImp(i)).length} ponto(s) cobrados com valor diferente do cadastro), para o total bater com o relatório.</label>` : ''}
    ${I.naoCobrados.length ? `<label class="nota" style="display:block;margin:6px 0"><input type="checkbox" id="imp-z" ${I.zerar ? 'checked' : ''}> Zerar os ${I.naoCobrados.length} kits retornados no Umov que o parceiro não cobrou (sem isso eles entram pelo ticket médio de ${BRL2(I.ctx.ticket)}).</label>` : ''}
    <div class="linha" style="justify-content:space-between;margin-top:6px"><div class="linha">${[['atencao', 'Precisa atenção', I.itens.filter(i => i.atencao).length], ['malote', 'Malote', I.itens.filter(i => i.tipo === 'malote' || i.tipo === 'fora' || i.tipo === 'adicional').length], ['kits', 'Kits e spots', I.itens.filter(i => ['kit', 'extra'].includes(i.tipo)).length], ['todos', 'Todas', I.itens.length]].map(([k, t, n]) => `<button class="btn ${I.filtro === k ? '' : 'sec'} peq" data-if="${k}">${t} (${n})</button>`).join('')}</div>
      <button class="btn marca" id="imp-ok">Gravar ${fmtN(inc.length)} linhas na base do parceiro</button></div>
    <div class="tabela" style="max-height:520px;overflow:auto"><table><thead><tr><th></th><th>Linha</th><th>No relatório</th><th class="n">Qtd</th><th class="n">Valor</th><th>Na base do portal</th><th>Situação</th></tr></thead><tbody>
    ${vis.slice(0, 500).map(i => `<tr${I.fora.has(i.i) ? ' style="opacity:.5"' : ''}><td><input type="checkbox" data-ii="${i.i}" ${I.fora.has(i.i) ? '' : 'checked'}></td><td style="font-size:12px;white-space:nowrap">${esc(i.aba)}<br>linha ${i.linha}</td>
      <td style="font-size:13px"><b>${esc(i.loja)}</b>${i.nf ? `<br><span class="nota">NF/ref ${esc(i.nf)}</span>` : ''}${i.cidade ? `<br><span class="nota">${esc(i.cidade)}</span>` : ''}</td>
      <td class="n">${i.qtd != null ? fmtN(i.qtd) : '—'}</td><td class="n">${BRL2(i.total)}</td>
      <td style="font-size:13px">${i.alvo ? `${esc(i.alvo.loja || i.alvo.cliente || '')}<br><span class="nota">${i.alvo.cod_int ? `cód ${esc(i.alvo.cod_int)} · Umov ${fmtN(i.alvo.feitos)} de ${fmtN(i.alvo.previsto || 0)} previstos` : `Umov ${esc(i.alvo.id_umov || '')} · ${esc(i.alvo.situacao || '')}`} · por ${esc(i.conf || '')}</span>` : '<span class="nota">—</span>'}
        ${['malote', 'fora', 'duplicado', 'adicional'].includes(i.tipo) && !(i.alvo && i.alvo.id_umov) ? (!['malote', 'adicional'].includes(i.tipo) || /conferir|escolhido/.test(i.conf || '') || (i.tipo === 'adicional' && !i.alvo) ? selPontoImp(i) : `<br><a href="#" data-trocar="${i.i}" class="nota">trocar ponto</a>`) : ''}</td>
      <td><span class="pill ${i.sit[1]}">${esc(i.sit[0])}</span>${i.aviso.length ? `<br><span class="nota">${esc(i.aviso.join('; '))}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="nota">Nada neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="nota">Ao gravar: malote vira ajuste só onde a quantidade do parceiro difere do Umov; kits do Umov recebem o valor cobrado; spots sem kit no Umov e pontos fora da carteira entram como extras. Tudo fica marcado como vindo deste relatório e aparece na conferência para você aprovar ou glosar. Importar de novo substitui a importação anterior.</p>
    <div id="imp-m"></div>`;
  res.querySelectorAll('[data-aba]').forEach(b => b.onchange = () => { I.usar[b.dataset.aba] = b.checked; recasar(); desenharImport(c); });
  res.querySelectorAll('[data-if]').forEach(b => b.onclick = () => { I.filtro = b.dataset.if; desenharImport(c); });
  const bp = $('#imp-per'); if (bp) bp.onclick = async () => { bp.disabled = true; try { await q(sb.rpc('definir_periodo_parceiro', { p_comp: c.id, p_parceiro: I.ctx.pid, p_inicio: bp.dataset.i, p_fim: bp.dataset.f, p_obs: `Período do relatório ${I.arquivo}` }));
    S.imp.recarregarPer = true; I.ctx.recarregar(); } catch (e) { bp.disabled = false; alertaTopo(e.message); } };
  res.querySelectorAll('[data-pp]').forEach(sel => sel.onchange = () => { if (!sel.value) return; I.manual[sel.dataset.pp] = sel.value; recasar(); desenharImport(c); });
  res.querySelectorAll('[data-trocar]').forEach(l => l.onclick = ev => { ev.preventDefault(); const it = I.itens.find(x => x.i === +l.dataset.trocar); const d = document.createElement('div'); d.innerHTML = selPontoImp(it); l.replaceWith(d);
    d.querySelector('select').onchange = e => { if (!e.target.value) return; I.manual[`${it.aba}:${it.linha}`] = e.target.value; recasar(); desenharImport(c); }; });
  res.querySelectorAll('[data-ii]').forEach(b => b.onchange = () => { const k = +b.dataset.ii; b.checked ? I.fora.delete(k) : I.fora.add(k); desenharImport(c); });
  const z = $('#imp-z'); if (z) z.onchange = () => { I.zerar = z.checked; desenharImport(c); };
  const av = $('#imp-av'); if (av) av.onchange = () => { I.ajValor = av.checked; desenharImport(c); };
  $('#imp-ok').onclick = () => gravarImport(c);
}
async function gravarImport(c) {
  const I = S.imp; const btn = $('#imp-ok'); const msg = $('#imp-m'); btn.disabled = true;
  const tag = `[Relatório ${I.arquivo.slice(0, 60)}]`; const P = I.pid;
  const tarefas = [];
  I.ctx.conts.filter(x => /^\[Relatório /.test(x.justificativa || '')).forEach(x => tarefas.push(['retirar', { p_id: x.id, p_parceiro: P }]));
  const base = { competencia_id: c.id };
  const sv = p => tarefas.push(['salvar', { p: { ...base, ...p }, p_parceiro: P }]);
  I.itens.filter(i => !I.fora.has(i.i)).forEach(i => {
    const onde = `${tag} ${i.aba}, linha ${i.linha}: ${i.loja}${i.nf ? ` (NF/ref ${i.nf})` : ''}${i.obs ? ` · ${i.obs}` : ''}`;
    if (i.tipo === 'malote') { const q = Math.max(0, Math.round(i.qtd ?? 0)); if (q !== i.alvo.feitos) sv({ tipo: 'malote', ref: i.alvo.cod_int, realizado: q, justificativa: onde });
      const dv = I.ajValor !== false ? difValorImp(i) : 0;
      if (dv) sv({ tipo: 'servico', servico: 'Ajuste de valor', quantidade: 1, valor: dv, descricao: `${i.alvo.loja} · relatório ${BRL2(i.total)} para ${fmtN(q)} atendimento(s); cadastro ${BRL2(Number(i.alvo.v_unit))} cada`, cidade: i.cidade, justificativa: `${onde} · diferença de preço` }); }
    else if (i.tipo === 'kit') { sv({ tipo: 'kit', ref: i.alvo.id_umov, valor: Math.round(i.total * 100) / 100, descricao: i.loja, cidade: i.cidade, justificativa: onde });
      i.kitsExtra.forEach(k => sv({ tipo: 'kit', ref: k.id_umov, valor: 0, descricao: i.loja, cidade: i.cidade, justificativa: `${tag} incluído na linha ${i.linha} (${i.loja})` })); }
    else if (i.tipo === 'extra') sv({ tipo: 'kit_extra', valor: Math.round(i.total * 100) / 100, descricao: [i.loja, i.nf].filter(Boolean).join(' · '), cidade: i.cidade, justificativa: onde });
    else if (i.tipo === 'adicional') sv({ tipo: 'servico', servico: 'Atendimento extra', quantidade: i.adicional, valor: Math.round(i.vu * 10000) / 10000, descricao: `${i.alvo ? (i.alvo.loja || i.loja) + ` (cód ${i.alvo.cod_int})` : i.loja} · atendimento extra`, cidade: i.cidade, justificativa: onde });
    else if (i.tipo === 'fora') { const q = i.qtd && i.qtd > 0 ? i.qtd : 1; sv({ tipo: 'servico', servico: 'Outro', quantidade: q, valor: Math.round((i.vu ?? i.total / q) * 10000) / 10000, descricao: `${i.loja} (ponto fora da carteira)`, cidade: i.cidade, justificativa: onde }); }
  });
  if (I.zerar) I.naoCobrados.forEach(k => sv({ tipo: 'kit', ref: k.id_umov, valor: 0, descricao: k.cliente, cidade: k.cidade, justificativa: `${tag} kit do Umov não cobrado no relatório` }));
  let feitas = 0, erros = [];
  const rodar = async ([tipo, args]) => { try { await q(sb.rpc(tipo === 'retirar' ? 'retirar_contestacao' : 'salvar_contestacao', args)); } catch (e) { erros.push(e.message); } feitas++; btn.textContent = `Gravando ${feitas} de ${tarefas.length}…`; };
  const ret = tarefas.filter(t => t[0] === 'retirar'), novas = tarefas.filter(t => t[0] !== 'retirar');
  for (let k = 0; k < ret.length; k += 8) await Promise.all(ret.slice(k, k + 8).map(rodar));
  for (let k = 0; k < novas.length; k += 8) await Promise.all(novas.slice(k, k + 8).map(rodar));
  S.imp = null;
  await I.ctx.recarregar();
  const box = $('#impbox'); if (box) box.innerHTML = `<div class="msg ${erros.length ? 'alerta' : 'ok'}">Relatório importado: ${fmtN(novas.length)} ajustes gravados${ret.length ? ` (a importação anterior foi substituída)` : ''}.${erros.length ? ` ${erros.length} não gravaram: ${esc([...new Set(erros)].slice(0, 3).join(' · '))}` : ''} Confira as abas Malote, Kits/Spot e Serviços e envie em "Resumo e envio".</div>`;
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
      <label class="campo" style="flex-direction:row;align-items:center;gap:8px;min-height:44px"><input type="checkbox" id="f-quinz" ${p.quinzenal ? 'checked' : ''} style="width:18px;height:18px"> Fecha por quinzena</label>
      <datalist id="l-doc"><option>NF</option><option>NF/FATURA</option><option>NF/BOLETO</option><option>FATURA/BOLETO</option><option>CT-e</option><option>BOLETO</option><option>SEM NF</option></datalist>
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
      <td style="font-size:13px">${esc(p.razao_social || '—')}<br><span class="num" style="color:var(--muted)">${esc(fmtCNPJ(p.cnpj) || 'sem CNPJ')}</span></td><td>${esc(p.tipo || '—')}</td><td class="n">${fixoAtual(p.id) != null ? BRL2(fixoAtual(p.id)) : '—'}</td><td class="n">${p.ticket_kit != null ? BRL2(p.ticket_kit) : '<span class="pill alerta">definir</span>'}</td><td>${esc(p.dia_pagamento || '—')}${pillQ(p)}</td>
      <td style="white-space:nowrap"><button class="btn sec peq" data-alt="${p.id}">Alterar</button> ${p.ativo === false ? `<button class="btn peq" data-at="${p.id}" data-v="1">Reativar</button>` : `<button class="btn sec peq" data-at="${p.id}" data-v="0">Inativar</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="nota">Nada encontrado.</td></tr>'}
    </tbody></table></div></section>`;
  box.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => { S.cadSit = b.dataset.cs; cadParceiros(parcs, contr); });
  $('#cadf').oninput = e => { S.cadFiltro = e.target.value; clearTimeout(S.cadT); S.cadT = setTimeout(() => { cadParceiros(parcs, contr); const i = $('#cadf'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  const ligarForm = (alvo, p) => {
    alvo.querySelector('#f-cancelar').onclick = () => { alvo.closest('tr.extra') ? alvo.closest('tr.extra').remove() : (alvo.innerHTML = ''); };
    alvo.querySelector('#f-salvar').onclick = async ev => {
      const b = ev.currentTarget; const g = id => alvo.querySelector(id).value;
      const dados = { id: p?.id || null, regiao: g('#f-regiao'), nome: g('#f-nome'), razao_social: g('#f-razao'), cnpj: g('#f-cnpj'), tipo: g('#f-tipo'), dia_pagamento: g('#f-dia'), limita_previsto: g('#f-lim'), fluxo: g('#f-fluxo'), email_contato: g('#f-email'), tipo_documento: g('#f-doc'), empresa_gsm: g('#f-emp'), forma_pagamento: g('#f-forma'), dados_pagamento: g('#f-dados'), modelo_capa: g('#f-mod'), quinzenal: alvo.querySelector('#f-quinz').checked };
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
  const [ads, fe, nr] = await Promise.all([
    q(sb.from('adiantamentos').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).order('solicitado_em', { ascending: false })),
    q(sb.from('fechamento_parceiro').select('valor_aprovado,adiantado,a_pagar,lote_id,pago_em,antec_status,antec_taxa,antec_desconto,antec_data,antec_motivo,antec_solicitada_em').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).limit(1)).then(r => r[0]),
    q(sb.from('nf_resumo').select('nfs').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).limit(1)).then(r => r[0]),
  ]);
  const nfsAd = ads.length ? await q(sb.from('notas_fiscais').select('id,adiantamento_id,numero,valor,status,motivo_recusa,arquivo_path').eq('tipo', 'adiantamento').in('adiantamento_id', ads.map(a => a.id)).order('enviado_em', { ascending: false })) : [];
  const nfDe = id => nfsAd.find(n => n.adiantamento_id === id && n.status !== 'recusada') || nfsAd.find(n => n.adiantamento_id === id);
  box.className = '';
  const aprovado = fe && fe.valor_aprovado != null;
  const pendente = ads.some(a => a.status === 'solicitado');
  const pode = c.status === 'aberta' && !pendente && !aprovado;
  const comprometido = ads.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status)).reduce((s, a) => s + Number(a.valor || 0), 0);
  const P = S.previa ? S.parc.id : null;
  let antec = '';
  if (aprovado) {
    const st = fe.antec_status; const semNF = !(nr && Number(nr.nfs));
    const podeAntec = c.status === 'aberta' && !fe.lote_id && !fe.pago_em && semNF && (!st || st === 'recusada');
    const sem = Number(fe.valor_aprovado) - Number(fe.adiantado || 0);
    antec = `<div class="confirma" style="margin-top:4px"><b>Antecipar o pagamento do mês</b>
      ${st === 'liberada' ? `<div class="msg ok">Antecipação liberada pela GSM: desconto de ${String(fe.antec_taxa).replace('.', ',')}% (${BRL2(fe.antec_desconto)}), pagamento em ${fmtD(fe.antec_data)}. <b>Emita a NF por ${BRL2(fe.a_pagar)}</b>.</div>`
      : st === 'solicitada' ? `<div class="msg alerta">Pedido enviado em ${fmtDH(fe.antec_solicitada_em)}. A GSM vai responder com a taxa e a data. Envie a NF só depois da resposta, pelo valor que aparecer aqui.</div>`
      : `<span class="nota">O valor do mês já foi aprovado: ${BRL2(sem)} a receber${Number(fe.adiantado) ? ' (já descontado o adiantamento)' : ''}. Se quiser receber antes da data combinada, peça a antecipação. A GSM informa a taxa e a data; com a antecipação liberada, a NF passa a ser emitida pelo valor com o desconto.</span>
        ${st === 'recusada' ? `<div class="msg erro">Pedido anterior recusado. GSM: ${esc(fe.antec_motivo || '')}</div>` : ''}
        ${podeAntec ? `<div class="linha" style="align-items:flex-end"><label class="campo" style="flex:1 1 260px">Observação (opcional)<input class="peq" id="ant-o" placeholder="ex.: preciso receber até dia 10"></label><button class="btn peq" id="ant-ok">Pedir antecipação</button></div><div id="ant-m"></div>`
          : !semNF ? '<span class="nota">A NF do mês já foi enviada. Para antecipar, fale com a GSM.</span>' : fe.lote_id || fe.pago_em ? '<span class="nota">O pagamento deste mês já está com o financeiro.</span>' : ''}`}
    </div>`;
  }
  box.innerHTML = `${ads.length ? `<div class="tabela"><table><thead><tr><th>Pedido</th><th class="n">Solicitado</th><th class="n">Liberado</th><th class="n">Você recebe</th><th>Pagamento</th><th>Situação</th><th>NF do adiantamento</th></tr></thead><tbody>
      ${ads.map(a => { const [r, k] = ST_ADI[a.status] || [a.status, '']; const nf = nfDe(a.id); const podeNF = ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status) && (!nf || nf.status === 'recusada'); return `<tr><td>${fmtDH(a.solicitado_em)}${a.observacao ? `<br><span class="nota">${esc(a.observacao)}</span>` : ''}</td><td class="n">${a.valor_solicitado != null ? BRL2(a.valor_solicitado) : '—'}</td><td class="n">${a.valor != null ? BRL2(a.valor) : '—'}</td><td class="n">${a.valor != null ? BRL2(a.valor_liquido) + (Number(a.taxa_pct) ? `<br><span class="nota">desconto de ${String(a.taxa_pct).replace('.', ',')}%</span>` : '') : '—'}</td>
        <td>${a.pago_em ? 'pago em ' + fmtD(a.pago_em) : a.data_pagamento ? 'previsto ' + fmtD(a.data_pagamento) : '—'}</td><td><span class="pill ${k}">${r}</span>${a.motivo_recusa ? `<div class="nota">GSM: ${esc(a.motivo_recusa)}</div>` : ''}</td>
        <td>${nf && nf.status !== 'recusada' ? `NF ${esc(nf.numero)} · <span class="pill ${nf.status === 'conferida' ? 'escuro' : ''}">${nf.status === 'conferida' ? 'Conferida' : 'Em conferência'}</span>` : ''}${nf && nf.status === 'recusada' ? `<div class="nota">NF ${esc(nf.numero)} recusada: ${esc(nf.motivo_recusa || '')}</div>` : ''}${podeNF ? `<button class="btn peq" data-nfad="${a.id}">Enviar NF</button>` : (!nf ? '<span class="nota">—</span>' : '')}</td></tr>`; }).join('')}
      </tbody></table></div><div id="adinf"></div>${comprometido ? `<p class="nota" style="margin:0">Adiantado no mês: ${BRL2(comprometido)}. Esse valor (liberado) é descontado da NF do fechamento.</p>` : ''}` : aprovado ? '' : '<p class="nota" style="margin:0">Nenhum pedido de adiantamento neste mês.</p>'}
    ${pode ? `<div class="linha" style="align-items:flex-end"><label class="campo">Valor (R$)<input class="peq" id="adi-v" style="width:140px"></label><label class="campo" style="flex:1 1 260px">Observação (opcional)<input class="peq" id="adi-o" placeholder="ex.: combustível da primeira quinzena"></label><button class="btn peq" id="adi-ok">Pedir adiantamento</button></div><div id="adi-m"></div>`
      : pendente ? '<p class="nota" style="margin:0">Há um pedido aguardando a GSM.</p>' : ''}
    ${antec}`;
  const b = $('#adi-ok');
  if (b) b.onclick = async () => {
    const v = numBR($('#adi-v').value);
    if (v == null || Number.isNaN(v) || v <= 0) { $('#adi-m').innerHTML = '<div class="msg erro">Informe um valor válido.</div>'; return; }
    b.disabled = true;
    try { await q(sb.rpc('solicitar_adiantamento', { p_comp: c.id, p_valor: v, p_obs: $('#adi-o').value, p_parceiro: P })); secaoAdiantamento(c); }
    catch (e) { b.disabled = false; $('#adi-m').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
  };
  box.querySelectorAll('[data-nfad]').forEach(b => b.onclick = () => { const a = ads.find(x => x.id === b.dataset.nfad); const z = $('#adinf');
    z.innerHTML = `<div class="confirma"><b>NF do adiantamento de ${BRL2(a.valor)}</b><span class="nota">Emita a NF pelo valor liberado (${BRL2(a.valor)}), com a GSM como tomadora.</span>${zonaArquivo('arqnfad', 'Arraste a NF (ou fatura) e o boleto aqui, ou clique para escolher', 'Pode mandar mais de um arquivo de uma vez: a NF/fatura e, se tiver, o boleto e outros comprovantes. PDF ou foto JPG/PNG. O portal lê número, emissão, CNPJ e valor da NF.', '.pdf,.jpg,.jpeg,.png', true)}<div id="nfadform"></div></div>`;
    ligarZona('arqnfad', (f, fs) => { const lst = (fs && fs.length ? fs : [f]); const nf = lst.find(x => !/boleto|comprovante|recibo/i.test(x.name)) || lst[0]; formNFAdi(nf, c, a, lst.filter(x => x !== nf)); }); z.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  const ba = $('#ant-ok');
  if (ba) ba.onclick = async () => {
    ba.disabled = true;
    try { await q(sb.rpc('solicitar_antecipacao', { p_comp: c.id, p_obs: $('#ant-o').value, p_parceiro: P })); secaoAdiantamento(c); secaoNF(c); }
    catch (e) { ba.disabled = false; $('#ant-m').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
  };
}

const ST_ANT = { solicitada: ['Pedido em aberto', 'alerta'], liberada: ['Liberada', 'escuro'], recusada: ['Recusada', 'marca'] };
async function vAdiantamentos() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Adiantamentos e antecipações</h1><p>Adiantamento: pedido antes da aprovação; o valor liberado é descontado da NF do fechamento. Antecipação: pedido depois da aprovação; a NF passa a ser pelo valor com o desconto. Você libera (com taxa e data) ou recusa com motivo.</p></div>${seletorComp(false)}</div><div id="adis" class="carregando">Carregando…</div>`;
  ligarSeletor(vAdiantamentos);
  const c = comp();
  const [ads, prev, fech, parcs] = await Promise.all([
    todas(() => sb.from('adiantamentos').select('*').eq('competencia_id', c.id).order('solicitado_em', { ascending: false })),
    todas(() => sb.from('previsao_realizado').select('parceiro_id,previsto').eq('competencia_id', c.id)),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,adiantado,a_pagar,lote_id,pago_em,antec_status,antec_taxa,antec_desconto,antec_data,antec_obs,antec_motivo,antec_solicitada_em').eq('competencia_id', c.id)),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,ativo,dia_pagamento').order('regiao')),
  ]);
  const nfsAd = ads.length ? await q(sb.from('notas_fiscais').select('id,adiantamento_id,numero,valor,status,motivo_recusa,arquivo_path,checagens').eq('tipo', 'adiantamento').eq('competencia_id', c.id).order('enviado_em', { ascending: false })) : [];
  const nfDe = id => nfsAd.find(n => n.adiantamento_id === id && n.status !== 'recusada') || nfsAd.find(n => n.adiantamento_id === id);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const pv = Object.fromEntries(prev.map(p => [p.parceiro_id, Number(p.previsto)]));
  const antecs = fech.filter(f => f.antec_status).sort((a, b) => (a.antec_status === 'solicitada' ? 0 : 1) - (b.antec_status === 'solicitada' ? 0 : 1));
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
      <div class="kpi eco"><small>Economia (save)</small><b>${BRL2(ads.filter(ativo).reduce((s2, a) => s2 + Number(a.valor_desconto || 0), 0) + fech.reduce((s2, f) => s2 + Number(f.antec_desconto || 0), 0))}</b><span>desconto de adiantamentos e antecipações do mês</span></div>
    </div>
    ${antecs.length ? `<section class="bloco"><h2>Antecipações do fechamento</h2><p class="sub">Parceiros com o mês aprovado que pediram para receber antes. Ao liberar, a NF passa a ser pelo valor com o desconto e o parceiro entra no grupo "Antecipação" do Pacote do financeiro.</p>
      <div class="tabela"><table id="antab"><thead><tr><th>Parceiro</th><th>Pedido</th><th class="n">A receber sem desconto</th><th class="n">Desconto</th><th class="n">NF / pagamento</th><th>Situação</th><th></th></tr></thead><tbody>
      ${antecs.map(f => { const p = pm[f.parceiro_id] || {}; const base = Number(f.valor_aprovado) - Number(f.adiantado || 0); const [r, k] = ST_ANT[f.antec_status] || [f.antec_status, ''];
        return `<tr><td><b>${esc(p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome || '')} · ${esc(p.dia_pagamento || 'sem dia')}</span></td><td style="font-size:13px">${f.antec_solicitada_em ? fmtDH(f.antec_solicitada_em) : '—'}${f.antec_obs ? `<br><span class="nota">${esc(f.antec_obs)}</span>` : ''}</td>
          <td class="n">${BRL2(base)}</td><td class="n">${f.antec_status === 'liberada' ? `${BRL2(f.antec_desconto)}<br><span class="nota">${String(f.antec_taxa).replace('.', ',')}%</span>` : '—'}</td>
          <td class="n">${f.antec_status === 'liberada' ? `<b>${BRL2(f.a_pagar)}</b><br><span class="nota">pagar ${fmtD(f.antec_data)}</span>` : '—'}</td>
          <td><span class="pill ${k}">${r}</span>${f.antec_motivo ? `<div class="nota">${esc(f.antec_motivo)}</div>` : ''}</td>
          <td style="white-space:nowrap">${f.lote_id || f.pago_em || c.status !== 'aberta' ? '' : f.antec_status === 'solicitada' ? `<button class="btn peq" data-alib="${f.parceiro_id}">Liberar</button> <button class="btn sec peq" data-arec="${f.parceiro_id}">Recusar</button>` : f.antec_status === 'liberada' ? `<button class="btn sec peq" data-acan="${f.parceiro_id}">Cancelar</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></section>` : ''}
    ${c.status === 'aberta' ? `<section class="bloco"><h2>Lançar pedido em nome do parceiro</h2><div class="linha"><select class="peq" id="na-p" style="flex:1 1 260px"><option value="">Parceiro…</option>${parcs.filter(p => p.ativo !== false).map(p => `<option value="${p.id}">${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}</select>
      <input class="peq" id="na-v" placeholder="Valor (R$)" style="width:140px"><input class="peq" id="na-o" placeholder="Observação" style="flex:1 1 220px"><button class="btn sec peq" id="na-ok">Lançar pedido</button></div></section>` : ''}
    <section class="bloco"><div class="linha">${[['todos', 'Todos', ads.length], ['solicitado', 'Em aberto', ads.filter(a => a.status === 'solicitado').length], ['apagar', 'A pagar', ads.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status)).length], ['pago', 'Pagos', ads.filter(a => a.status === 'pago').length], ['recusado', 'Recusados', ads.filter(a => a.status === 'recusado').length]]
      .map(([k, n, qq]) => `<button class="btn ${S.adiFiltro === k ? '' : 'sec'} peq" data-af="${k}">${n} (${qq})</button>`).join('')}</div>
    <div class="tabela"><table id="aditab"><thead><tr><th>Parceiro</th><th>Pedido</th><th class="n">Solicitado</th><th class="n">Previsto do mês</th><th class="n">Já adiantado</th><th class="n">Liberado</th><th class="n">Desconto (save)</th><th>Situação</th><th>NF</th><th></th></tr></thead><tbody>
    ${vis.map(a => { const p = pm[a.parceiro_id] || {}; const [r, k] = ST_ADI[a.status] || [a.status, '']; const prv = pv[a.parceiro_id];
      return `<tr><td><b>${esc(p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome || '')}</span></td><td style="font-size:13px">${fmtDH(a.solicitado_em)}${a.observacao ? `<br><span class="nota">${esc(a.observacao)}</span>` : ''}</td>
        <td class="n">${a.valor_solicitado != null ? BRL2(a.valor_solicitado) : '—'}</td><td class="n">${prv ? BRL(prv) : '—'}</td><td class="n">${jaAd(a.parceiro_id) ? BRL(jaAd(a.parceiro_id)) : '—'}</td>
        <td class="n">${a.valor != null ? BRL2(a.valor) : '—'}${a.data_pagamento ? `<br><span class="nota">${a.pago_em ? 'pago ' + fmtD(a.pago_em) : 'pagar ' + fmtD(a.data_pagamento)}</span>` : ''}</td>
        <td class="n">${a.valor != null && Number(a.taxa_pct) ? `${BRL2(a.valor_desconto)}<br><span class="nota">${String(a.taxa_pct).replace('.', ',')}% · paga ${BRL2(a.valor_liquido)}</span>` : '—'}</td>
        <td><span class="pill ${k}">${r}</span>${a.motivo_recusa ? `<div class="nota">${esc(a.motivo_recusa)}</div>` : ''}</td>
        <td style="font-size:13px;white-space:nowrap">${(() => { const nf = nfDe(a.id); if (!nf) return ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status) ? '<span class="nota">aguardando</span>' : '—';
          const dif = Math.abs(Number(nf.valor) - Number(a.valor)) > 0.009;
          return `<a href="#" data-nfpdf="${esc(nf.arquivo_path || '')}">NF ${esc(nf.numero)}</a> · ${BRL2(nf.valor)}${dif ? ' <span class="pill alerta">valor difere</span>' : ''}<br>${nf.status === 'recebida' ? `<button class="btn peq" data-nfok="${nf.id}">Conferir</button> <button class="btn sec peq" data-nfrec="${nf.id}">Recusar</button>` : `<span class="pill ${nf.status === 'conferida' ? 'escuro' : 'marca'}">${nf.status === 'conferida' ? 'Conferida' : 'Recusada'}</span>`}`; })()}</td>
        <td style="white-space:nowrap">${a.status === 'solicitado' ? `<button class="btn peq" data-lib="${a.id}">Liberar</button> <button class="btn sec peq" data-rcs="${a.id}">Recusar</button>`
          : ['liberado', 'nf_recebida', 'enviado_financeiro'].includes(a.status) ? `<button class="btn peq" data-pag="${a.id}">Registrar pago</button> <button class="btn sec peq" data-can="${a.id}">Cancelar</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="10" class="nota">Nenhum adiantamento.</td></tr>'}
    </tbody></table></div>
    <p class="nota">"Previsto do mês" é o calendarizado do parceiro, só como referência. O portal não impõe limite de valor.</p></section>`;
  m.querySelectorAll('[data-af]').forEach(b => b.onclick = () => { S.adiFiltro = b.dataset.af; vAdiantamentos(); });
  const tab = $('#aditab');
  const linha = (b, html) => { tab.querySelectorAll('tr.extra').forEach(x => x.remove()); const l = document.createElement('tr'); l.className = 'extra'; l.innerHTML = `<td colspan="10" style="background:var(--field)"><div class="linha" style="align-items:flex-end">${html}</div><div class="am"></div></td>`; b.closest('tr').after(l); return l; };
  const rodar = async (l, btn, fn) => { btn.disabled = true; try { await fn(); vAdiantamentos(); } catch (e) { btn.disabled = false; l.querySelector('.am').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; } };
  const hoje = new Date().toISOString().slice(0, 10);
  tab.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { const a = ads.find(x => x.id === b.dataset.lib);
    const ultTaxa = ads.filter(x => x.parceiro_id === a.parceiro_id && Number(x.taxa_pct)).map(x => x.taxa_pct)[0];
    const l = linha(b, `<label class="campo">Valor liberado<input class="peq" id="lv" value="${String(a.valor_solicitado ?? '').replace('.', ',')}" style="width:130px"></label><label class="campo">Desconto (%)<input class="peq" id="lt" value="${ultTaxa != null ? String(ultTaxa).replace('.', ',') : ''}" placeholder="0" style="width:80px"></label><label class="campo">Data de pagamento<input class="peq" type="date" id="ld" value="${hoje}"></label><label class="campo" style="flex:1 1 200px">Observação<input class="peq" id="lo"></label><button class="btn peq" id="lok">Confirmar liberação</button><span class="nota" id="lcalc" style="flex-basis:100%"></span>`);
    const calc = () => { const v = numBR(l.querySelector('#lv').value) || 0, t = numBR(l.querySelector('#lt').value) || 0; const d = Math.round(v * t) / 100; l.querySelector('#lcalc').textContent = t ? `Desconto de ${BRL2(d)} · o parceiro recebe ${BRL2(v - d)} · na NF do fechamento é abatido ${BRL2(v)}.` : `Sem desconto agora: o parceiro recebe ${BRL2(v)}. Para cobrar a taxa no fechamento, use Conferência e aprovação → Ajustes e descontos → Taxa de adiantamento (o portal sugere o valor).`; };
    l.querySelector('#lv').oninput = calc; l.querySelector('#lt').oninput = calc; calc();
    l.querySelector('#lok').onclick = ev => { const v = numBR(l.querySelector('#lv').value); const t = numBR(l.querySelector('#lt').value); rodar(l, ev.currentTarget, () => q(sb.rpc('liberar_adiantamento', { p_id: a.id, p_valor: Number.isNaN(v) ? null : v, p_data: l.querySelector('#ld').value || null, p_taxa: t == null || Number.isNaN(t) ? 0 : t, p_obs: l.querySelector('#lo').value }))); }; });
  tab.querySelectorAll('[data-rcs]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo" style="flex:1 1 300px">Motivo (o parceiro vê)<input class="peq" id="rm"></label><button class="btn peq" id="rok">Recusar</button>`);
    l.querySelector('#rok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_adiantamento', { p_id: b.dataset.rcs, p_decisao: 'recusar', p_motivo: l.querySelector('#rm').value }))); });
  tab.querySelectorAll('[data-can]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo" style="flex:1 1 300px">Motivo do cancelamento<input class="peq" id="cm"></label><button class="btn peq" id="cok">Cancelar adiantamento</button>`);
    l.querySelector('#cok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_adiantamento', { p_id: b.dataset.can, p_decisao: 'cancelar', p_motivo: l.querySelector('#cm').value }))); });
  tab.querySelectorAll('[data-nfpdf]').forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!a.dataset.nfpdf) return; const { data } = await sb.storage.from('envios').createSignedUrl(a.dataset.nfpdf, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); });
  tab.querySelectorAll('[data-nfok]').forEach(b => b.onclick = async () => { b.disabled = true; try { await q(sb.rpc('conferir_nf', { p_nf: b.dataset.nfok, p_decisao: 'conferida' })); vAdiantamentos(); } catch (e) { b.disabled = false; alertaTopo(e.message); } });
  tab.querySelectorAll('[data-nfrec]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo" style="flex:1 1 300px">Motivo da recusa da NF (o parceiro vê)<input class="peq" id="nrm"></label><button class="btn peq" id="nrok">Recusar NF</button>`);
    l.querySelector('#nrok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('conferir_nf', { p_nf: b.dataset.nfrec, p_decisao: 'recusada', p_motivo: l.querySelector('#nrm').value }))); });
  tab.querySelectorAll('[data-pag]').forEach(b => b.onclick = () => { const l = linha(b, `<label class="campo">Pago em<input class="peq" type="date" id="pd" value="${hoje}"></label><button class="btn peq" id="pok">Confirmar pagamento</button>`);
    l.querySelector('#pok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('pagar_adiantamento', { p_id: b.dataset.pag, p_data: l.querySelector('#pd').value || null }))); });
  const atab = $('#antab');
  if (atab) {
    const linhaA = (b, html) => { atab.querySelectorAll('tr.extra').forEach(x => x.remove()); const l = document.createElement('tr'); l.className = 'extra'; l.innerHTML = `<td colspan="7" style="background:var(--field)"><div class="linha" style="align-items:flex-end">${html}</div><div class="am"></div></td>`; b.closest('tr').after(l); return l; };
    atab.querySelectorAll('[data-alib]').forEach(b => b.onclick = () => { const f = fech.find(x => x.parceiro_id === b.dataset.alib); const base = Number(f.valor_aprovado) - Number(f.adiantado || 0);
      const ult = ads.filter(x => x.parceiro_id === f.parceiro_id && Number(x.taxa_pct)).map(x => x.taxa_pct)[0];
      const l = linhaA(b, `<label class="campo">Desconto (%)<input class="peq" id="at" value="${ult != null ? String(ult).replace('.', ',') : ''}" placeholder="0" style="width:80px"></label><label class="campo">Data do pagamento antecipado<input class="peq" type="date" id="ad" value="${hoje}"></label><button class="btn peq" id="aok">Confirmar antecipação</button><span class="nota" id="acalc" style="flex-basis:100%"></span>`);
      const calc = () => { const t = numBR(l.querySelector('#at').value) || 0; const d = Math.round(base * t) / 100; l.querySelector('#acalc').textContent = `Desconto de ${BRL2(d)} · a NF passa a ser de ${BRL2(base - d)} (antes ${BRL2(base)}).`; };
      l.querySelector('#at').oninput = calc; calc();
      l.querySelector('#aok').onclick = ev => { const t = numBR(l.querySelector('#at').value); rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_antecipacao', { p_comp: c.id, p_parceiro: f.parceiro_id, p_decisao: 'liberar', p_taxa: t == null || Number.isNaN(t) ? 0 : t, p_data: l.querySelector('#ad').value || null }))); }; });
    atab.querySelectorAll('[data-arec]').forEach(b => b.onclick = () => { const l = linhaA(b, `<label class="campo" style="flex:1 1 300px">Motivo (o parceiro vê)<input class="peq" id="arm"></label><button class="btn peq" id="arok">Recusar</button>`);
      l.querySelector('#arok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_antecipacao', { p_comp: c.id, p_parceiro: b.dataset.arec, p_decisao: 'recusar', p_motivo: l.querySelector('#arm').value }))); });
    atab.querySelectorAll('[data-acan]').forEach(b => b.onclick = () => { const l = linhaA(b, `<span class="nota" style="flex:1 1 300px">Cancelar volta a NF para o valor sem desconto.</span><button class="btn peq" id="acok">Cancelar antecipação</button>`);
      l.querySelector('#acok').onclick = ev => rodar(l, ev.currentTarget, () => q(sb.rpc('decidir_antecipacao', { p_comp: c.id, p_parceiro: b.dataset.acan, p_decisao: 'cancelar' }))); });
  }
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
    q(sb.from('notas_fiscais').select('parceiro_id,numero,arquivo_path,status,valor,tipo,adiantamento_id,anexos').eq('competencia_id', lote.competencia_id).in('parceiro_id', ids).in('status', ['recebida', 'conferida'])),
    q(sb.from('nf_resumo').select('parceiro_id,situacao').eq('competencia_id', lote.competencia_id).in('parceiro_id', ids)),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const pv = Object.fromEntries(prev.map(p => [p.parceiro_id, Number(p.previsto)]));
  const sit = Object.fromEntries(res.map(r => [r.parceiro_id, r.situacao]));
  const fixo = id => { const c = contr.filter(k => k.parceiro_id === id && k.inicio <= comp.mes && (!k.fim || k.fim >= comp.mes)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0]; return c ? Number(c.valor_fixo) : 0; };
  const n = v => Number(v) || 0;
  const linhas = fech.map(f => { const p = pm[f.parceiro_id] || {}; const minhas = nfs.filter(x => x.parceiro_id === f.parceiro_id && x.tipo !== 'adiantamento');
    const calend = f.calendarizado != null ? n(f.calendarizado) : (pv[f.parceiro_id] ?? 0); const final = n(f.valor_aprovado ?? f.valor_final);
    return { id: f.parceiro_id, regiao: p.regiao, nome: p.nome, razao: p.razao_social, cnpj: fmtCNPJ(p.cnpj), contrato: fixo(f.parceiro_id), calend, malote: n(f.malote), caixas: n(f.kits), extrasMal: n(f.fora_umov), desc: n(f.descontos),
      final, dif: final - calend, pagar: f.a_pagar != null ? n(f.a_pagar) : final - n(f.adiantado), adiantado: n(f.adiantado), data: lote.data_pagamento, status: f.pago_em ? 'Pago' : sit[f.parceiro_id] === 'conferida' ? 'Ok' : 'Aguardando NF',
      doc: p.tipo_documento, nf: minhas.map(x => x.numero).join(' / ') || (/^sem nf/i.test(p.tipo_documento || '') ? 'Sem NF' : '-'), emp: p.empresa_gsm, forma: p.forma_pagamento, dados: p.dados_pagamento, tipo: p.tipo, modelo: p.modelo_capa, nfs: minhas, pago: f.pago_em }; })
    // Parceiro com várias NFs/faturas que somam o valor a pagar: uma linha de pagamento por documento (cada uma com o seu boleto); a composição fica só na 1ª linha
    .flatMap(l => { const soma = l.nfs.reduce((a, x) => a + n(x.valor), 0);
      if (l.nfs.length < 2 || Math.abs(soma - l.pagar) > 0.01) return [l];
      return l.nfs.slice().sort((a, b) => n(b.valor) - n(a.valor)).map((x, i) => i === 0 ? { ...l, nf: x.numero, nfs: [x], pagar: n(x.valor), parte: `1/${l.nfs.length}` }
        : { ...l, contrato: null, calend: null, malote: null, caixas: null, extrasMal: null, desc: null, final: null, dif: null, adiantado: 0, nf: x.numero, nfs: [x], pagar: n(x.valor), parte: `${i + 1}/${l.nfs.length}` }); })
    .concat(adis.map(a => { const p = pm[a.parceiro_id] || {}; const f = fechMes.find(x => x.parceiro_id === a.parceiro_id) || {}; const calend = f.calendarizado != null ? n(f.calendarizado) : (pv[a.parceiro_id] ?? 0); const final = f.valor_aprovado != null ? n(f.valor_aprovado) : null;
      return { id: a.parceiro_id, regiao: p.regiao, nome: p.nome, razao: p.razao_social, cnpj: fmtCNPJ(p.cnpj), contrato: fixo(a.parceiro_id), calend, malote: f.malote != null ? n(f.malote) : null, caixas: f.kits != null ? n(f.kits) : null, extrasMal: f.fora_umov != null ? n(f.fora_umov) : null, desc: f.descontos != null ? n(f.descontos) : null,
        final, dif: final != null ? final - calend : null, pagar: n(a.valor_liquido), adiantado: 0, data: lote.data_pagamento, status: a.status === 'pago' ? 'Pago' : 'Ok',
        doc: p.tipo_documento, nf: nfs.filter(x => x.adiantamento_id === a.id).map(x => x.numero).join(' / ') || '-', emp: p.empresa_gsm, forma: p.forma_pagamento, dados: p.dados_pagamento, tipo: p.tipo, modelo: /adiant/i.test(p.modelo_capa || '') ? p.modelo_capa : 'Parceiro (Adiantamento)', nfs: nfs.filter(x => x.adiantamento_id === a.id), pago: a.pago_em, adiantamento: a }; }))
    .sort((a, b) => (a.status === 'Ok' ? 0 : 1) - (b.status === 'Ok' ? 0 : 1) || (a.regiao || '').localeCompare(b.regiao || ''));
  return { lote, comp, linhas };
}

// ---------- Planilhas no padrão GSM (todas as exportações, exceto a capa do financeiro) ----------
const RX_MOEDA = /^(V\. |Valor|Fixo|Malote|Previsto$|Abaixo|Acima|Descontos|Save|Economia|Diferença|Ticket|Total|A pagar)|- previsto$|\(realizado\)$/;
const RX_SOMA_INT = /^(Pontos|Kits|Realizado|Umov |Previsto \(|Realizado \(|Previsto \(Qtd)|atendimentos$/;
// Célula com fórmula: { f: 'SUM(...)' ou '[Coluna A]*[Coluna B]', v: resultado }. [Nome da coluna] vira a célula da mesma linha.
const ehF = x => x != null && typeof x === 'object' && !(x instanceof Date) && 'f' in x;
const valF = x => ehF(x) ? x.v : x;
const colLetra = n => { let t = ''; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; };
async function planilhaPadrao({ titulo, sub, abas }) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Portal de Fechamento GSM'; wb.created = new Date(); wb.calcProperties = { fullCalcOnLoad: true };
  const F = { name: 'Calibri', size: 11 }; const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"-"';
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const fino = { style: 'thin', color: { argb: 'FFD9D9D9' } }; const borda = { top: fino, left: fino, bottom: fino, right: fino };
  const gerado = `Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por ${S.user?.email || ''}`;
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31), { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const L = aba.linhas || []; const cols = aba.colunas || (L.length ? Object.keys(L[0]) : ['(sem dados)']);
    const tipo = cols.map(k => { const vs = L.map(r => valF(r[k])).filter(v => v != null && v !== ''); if (!vs.length) return 'txt';
      if (vs.every(v => typeof v === 'number')) return RX_MOEDA.test(k) ? 'moeda' : vs.every(Number.isInteger) ? 'int' : 'num';
      if (vs.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) return 'data'; return 'txt'; });
    const nc = cols.length;
    ws.getCell(1, 1).value = titulo; ws.getCell(1, 1).font = { ...F, size: 15, bold: true, color: { argb: 'FF121112' } };
    ws.getCell(2, 1).value = [sub, aba.sub, gerado].filter(Boolean).join(' · '); ws.getCell(2, 1).font = { ...F, size: 10, italic: true, color: { argb: 'FF6B6466' } };
    for (let j = 1; j <= nc; j++) ws.getCell(2, j).border = { bottom: { style: 'medium', color: { argb: 'FFDB2242' } } };
    const h = ws.getRow(4); h.height = 30;
    cols.forEach((k, j) => { const c = h.getCell(j + 1); c.value = k; c.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF262626'); c.border = borda;
      c.alignment = { vertical: 'middle', horizontal: ['moeda', 'int', 'num'].includes(tipo[j]) ? 'right' : 'left', wrapText: true }; });
    L.forEach((r, i) => { const row = ws.getRow(5 + i);
      cols.forEach((k, j) => { const c = row.getCell(j + 1); let v = r[k];
        if (ehF(v)) { const fm = String(v.f).replace(/\[([^\]]+)\]/g, (m0, nm) => { const jj = cols.indexOf(nm); return jj >= 0 ? `${colLetra(jj + 1)}${5 + i}` : m0; });
          c.value = { formula: fm, result: v.v ?? undefined }; c.font = F; c.border = borda;
          if (tipo[j] === 'moeda') c.numFmt = MOEDA; else if (tipo[j] === 'int') c.numFmt = '#,##0'; else if (tipo[j] === 'num') c.numFmt = '#,##0.00';
          if (i % 2) c.fill = fill('FFF7F6F4'); return; }
        if (tipo[j] === 'data' && v) { const [y, m, d] = v.slice(0, 10).split('-').map(Number); v = new Date(Date.UTC(y, m - 1, d)); c.numFmt = 'dd/mm/yyyy'; }
        c.value = v === undefined || v === '' ? null : v; c.font = F; c.border = borda;
        if (tipo[j] === 'moeda') c.numFmt = MOEDA; else if (tipo[j] === 'int') c.numFmt = '#,##0'; else if (tipo[j] === 'num') c.numFmt = '#,##0.00';
        if (i % 2) c.fill = fill('FFF7F6F4'); }); });
    const somar = cols.map((k, j) => (tipo[j] === 'moeda' && !/^(Ticket|V\. Unit)/.test(k)) || (tipo[j] === 'int' && RX_SOMA_INT.test(k)));
    if (L.length && somar.some(Boolean)) { const tr = ws.getRow(5 + L.length); const ini = 5, fim = 4 + L.length;
      cols.forEach((k, j) => { const c = tr.getCell(j + 1); c.font = { ...F, bold: true }; c.fill = fill('FFEDEBE8'); c.border = { ...borda, top: { style: 'medium', color: { argb: 'FF262626' } } };
        if (j === 0) c.value = 'Total';
        else if (somar[j]) { const col = ws.getColumn(j + 1).letter; c.value = { formula: `SUBTOTAL(9,${col}${ini}:${col}${fim})`, result: L.reduce((a, r) => a + (Number(valF(r[k])) || 0), 0) }; c.numFmt = tipo[j] === 'moeda' ? MOEDA : '#,##0'; } }); }
    if (L.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + L.length, column: nc } };
    cols.forEach((k, j) => { const amostra = L.slice(0, 400).map(r => { const x = valF(r[k]); return x == null ? '' : tipo[j] === 'moeda' ? 'R$ ' + Number(x).toFixed(2) + '000' : String(x); });
      const w = Math.max(Math.min(String(k).length, 22), ...amostra.map(x => x.length)) + 2; ws.getColumn(j + 1).width = Math.max(9, Math.min(w, 48)); });
    ws.pageSetup = { orientation: nc > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4', margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: '&L&8Portal de Fechamento GSM&R&8Página &P de &N' };
  }
  return wb.xlsx.writeBuffer();
}
async function baixarXlsx(nome, opts) {
  try { const buf = await planilhaPadrao(opts); baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome); }
  catch (e) { alertaTopo('Não foi possível gerar a planilha: ' + e.message); }
}

// Capa no mesmo layout que o financeiro já recebe (Capa-Fechamento_DD.xlsx)
async function baixarCapa(lote, soArquivo) {
  const { linhas, comp } = soArquivo && soArquivo.dados ? soArquivo.dados : await dadosLote(lote);
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
  if (soArquivo) return { buf, nome: `Capa-Fechamento_${dd}.xlsx` };
  baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Capa-Fechamento_${dd}.xlsx`);
}

// Listagem de pontos (e kits) dos parceiros do lote, no formato da aba Atendimentos
async function pontosLote(lote, dados) {
  const { linhas, comp } = dados || await dadosLote(lote);
  const ids = new Set(linhas.map(l => l.id)); const nomeMesC = nomeMes(comp.mes);
  const [pts, kits] = await Promise.all([todas(() => sb.rpc('listagem_atendimentos', { p_comp: comp.id })), todas(() => sb.rpc('listagem_kits', { p_comp: comp.id }))]);
  const P = pts.filter(r => ids.has(r.parceiro_id)), K = kits.filter(r => ids.has(r.parceiro_id));
  const resumo = linhas.filter(l => !l.parte || l.parte.startsWith('1/')).map(l => { const ps = P.filter(r => r.parceiro_id === l.id), ks = K.filter(r => r.parceiro_id === l.id);
    return { 'Região': l.regiao, 'Parceiro': l.nome, 'Lançamento': l.adiantamento ? 'Adiantamento' : 'Fechamento', 'Pontos': ps.length, 'Previsto (atend.)': ps.reduce((a, r) => a + (r.previsto || 0), 0), 'Realizado (atend.)': ps.reduce((a, r) => a + (r.realizado || 0), 0), 'V. Previsto': +ps.reduce((a, r) => a + Number(r.valor_previsto || 0), 0).toFixed(2), 'V. Realizado': +ps.reduce((a, r) => a + Number(r.valor_realizado || 0), 0).toFixed(2), 'Kits': ks.length, 'Valor kits': +ks.reduce((a, r) => a + Number(r.valor || 0), 0).toFixed(2), 'A pagar neste lote': l.parte ? linhas.filter(x => x.id === l.id && x.parte && !x.adiantamento).reduce((t, x) => t + x.pagar, 0) : l.pagar }; });
  const abas = [{ nome: 'Resumo', linhas: resumo }, { nome: 'Atendimentos', linhas: P.map(r => ({ 'Mês': nomeMesC, 'Região': r.regiao, 'Parceiro': r.parceiro, 'Cliente': r.cliente, 'Cod. Int': r.cod_int, 'Loja': r.loja, 'Cidade': r.cidade, 'UF': r.uf, 'Frequência': r.frequencia, 'V. Unit': Number(r.v_unit), 'Previsto (Qtd atend.)': r.previsto, 'Umov retornados': r.umov_retornados, 'Realizado': r.realizado, 'Origem do realizado': r.origem_realizado, 'V. Previsto': Number(r.valor_previsto), 'V. Realizado': Number(r.valor_realizado) })) }];
  if (K.length) abas.push({ nome: 'Kits', linhas: K.map(r => ({ 'Mês': nomeMesC, 'Região': r.regiao, 'Parceiro': r.parceiro, 'Ref. Umov': r.id_umov, 'Data': r.data, 'Kit': r.grupo_cliente, 'Cliente': r.cliente, 'Cidade': r.cidade, 'Situação': r.situacao, 'Valor': Number(r.valor), 'Origem do valor': r.origem_valor })) });
  const buf = await planilhaPadrao({ titulo: `Listagem de pontos · ${lote.rotulo}`, sub: `Competência ${nomeMesC} · pagamento em ${fmtD(lote.data_pagamento)}`, abas });
  return { buf, nome: `Pontos_${lote.rotulo.replace(/\s+/g, '')}_${comp.mes.slice(0, 7)}.xlsx` };
}

// Pacote completo para o financeiro: capa + listagem de pontos + NFs, num zip só
async function baixarPacote(lote, btn) {
  if (!window.JSZip) return alertaTopo('Não foi possível carregar o compactador de arquivos. Recarregue a página.');
  const txt = btn.textContent; btn.textContent = 'Montando…';
  const dados = await dadosLote(lote); const zip = new JSZip(); const falhas = []; let n = 0;
  const capa = await baixarCapa(lote, { dados }); zip.file(capa.nome, capa.buf);
  btn.textContent = 'Listagem de pontos…'; const pts = await pontosLote(lote, dados); zip.file(pts.nome, pts.buf);
  for (const l of dados.linhas) for (const nf of l.nfs) { if (!nf.arquivo_path) continue; btn.textContent = `NF ${++n}…`;
    const { data, error } = await sb.storage.from('envios').download(nf.arquivo_path);
    if (error || !data) { falhas.push(`${l.regiao} NF ${nf.numero}`); continue; }
    const ext = (nf.arquivo_path.match(/\.(pdf|jpe?g|png)$/i) || ['', 'pdf'])[1].toLowerCase();
    zip.file(`NFs/${safeName(`${l.regiao} - ${l.adiantamento ? 'Adiantamento - ' : ''}NF ${nf.numero}.${ext}`)}`, data); }
  const semNF = dados.linhas.filter(l => !l.nfs.length).map(l => `${l.regiao}${l.adiantamento ? ' (adiantamento)' : ''}`);
  if (semNF.length) zip.file('LEIA - sem NF.txt', 'Parceiros deste lote ainda sem NF enviada:\n' + semNF.join('\n'));
  baixarBlob(await zip.generateAsync({ type: 'blob' }), `Pacote_${lote.rotulo.replace(/\s+/g, '')}_${lote.data_pagamento}.zip`);
  btn.textContent = txt;
  if (falhas.length || semNF.length) alertaTopo([falhas.length ? 'Não baixaram: ' + falhas.join(', ') : '', semNF.length ? 'Sem NF ainda: ' + semNF.join(', ') : ''].filter(Boolean).join(' · '));
}

async function baixarNFs(lote, btn) {
  if (!window.JSZip) return alertaTopo('Não foi possível carregar o compactador de arquivos. Recarregue a página.');
  const { linhas, comp } = await dadosLote(lote); const zip = new JSZip(); let n = 0, falhas = [];
  for (const l of linhas) for (const nf of l.nfs) {
    if (!nf.arquivo_path) continue;
    btn.textContent = `Baixando ${++n}…`;
    const { data, error } = await sb.storage.from('envios').download(nf.arquivo_path);
    if (error || !data) { falhas.push(`${l.regiao} NF ${nf.numero}`); continue; }
    zip.file(safeName(`${l.regiao} - ${l.adiantamento ? 'Adiantamento - ' : ''}NF ${nf.numero}.${(nf.arquivo_path.match(/\.(pdf|jpe?g|png)$/i) || ['', 'pdf'])[1].toLowerCase()}`), data);
    for (const [k, x] of (nf.anexos || []).entries()) { const r = await sb.storage.from('envios').download(x.path); if (r.error || !r.data) { falhas.push(`${l.regiao} ${x.tipo || 'anexo'} da NF ${nf.numero}`); continue; }
      zip.file(safeName(`${l.regiao} - NF ${nf.numero} - ${x.tipo || 'Anexo'}${k ? ' ' + (k + 1) : ''}.${(x.path.match(/\.(pdf|jpe?g|png)$/i) || ['', 'pdf'])[1].toLowerCase()}`), r.data); }
  }
  if (!n) { btn.textContent = 'NFs (.zip)'; return alertaTopo('Nenhuma NF em PDF neste lote ainda.'); }
  const blob = await zip.generateAsync({ type: 'blob' });
  baixarBlob(blob, `NFs_${lote.rotulo.replace(/\s+/g, '')}_${comp.mes.slice(0, 7)}.zip`);
  btn.textContent = 'NFs (.zip)';
  if (falhas.length) alertaTopo('Não baixaram: ' + falhas.join(', '));
}
function baixarBlob(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ---------- Documentos (NFs): pasta do financeiro por competência + busca em todas as NFs ----------
const tipoArq = (path, tipo) => tipo || (/fatura/i.test(path || '') ? 'Fatura' : /boleto/i.test(path || '') ? 'Boleto' : /dacte|cte/i.test(path || '') ? 'DACTE' : 'NF');
const chipArq = (path, rot) => `<a href="#" data-arq="${esc(path)}" class="pill" style="text-decoration:none;color:var(--ink);border:1px solid var(--rule);background:var(--surface);margin:2px 4px 2px 0;display:inline-block" title="Abrir o arquivo">${esc(rot)} ↗</a>`;
function ligarArquivos(box) { box.querySelectorAll('[data-arq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('envios').createSignedUrl(a.dataset.arq, 600); if (error || !data) { if (w) w.close(); return alertaTopo('Não foi possível abrir o arquivo.'); } if (w) w.location = data.signedUrl; else location.href = data.signedUrl; }); }
async function documentosFin(box, D, c, opt = {}) {
  const modo = D.docModo || 'comp';
  const topo = `<section class="bloco" style="padding:12px 16px"><div class="linha" style="justify-content:space-between;align-items:center">
    <div class="alterna" role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">${[['comp', `Pasta de ${nomeMes(c.mes)}`], ['busca', 'Buscar em todas as NFs']].map(([k, t]) => `<button type="button" data-dm="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${modo === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${t}</button>`).join('')}</div>
    <span class="nota">Todos os documentos de pagamento (NF, fatura, boleto, DACTE) guardados no portal, por competência${opt.soAprovados ? ', dos parceiros já aprovados pela GSM' : ''}. A validação do financeiro é só controle: não bloqueia o pagamento.</span></div></section><div id="docc"><div class="carregando">Carregando…</div></div>`;
  box.innerHTML = topo;
  box.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { D.docModo = b.dataset.dm; documentosFin(box, D, c, opt); });
  const cx = box.querySelector('#docc');
  if (modo === 'busca') {
    cx.innerHTML = `<section class="bloco"><div class="linha"><input class="peq" id="docq" placeholder="Número da NF, CNPJ, praça, razão social ou valor (ex.: 24.710,00)" value="${esc(D.docBusca || '')}" style="flex:1 1 360px"><button class="btn peq" id="docqb">Buscar</button></div><div id="docr" style="margin-top:12px"></div></section>`;
    const busca = async () => { const t = cx.querySelector('#docq').value.trim(); D.docBusca = t; const r = cx.querySelector('#docr'); if (t.length < 2) { r.innerHTML = '<p class="nota">Digite pelo menos 2 caracteres.</p>'; return; }
      r.innerHTML = '<div class="carregando">Buscando…</div>';
      try { const ls = await q(sb.rpc('buscar_nfs', { p_texto: t }));
        r.innerHTML = ls.length ? `<div class="tabela" style="max-height:560px;overflow:auto"><table><thead><tr><th>Competência</th><th>Praça</th><th>Documento</th><th>CNPJ emitente</th><th class="n">Valor</th><th>Emissão</th><th>Arquivos</th></tr></thead><tbody>
          ${ls.map(x => `<tr><td>${nomeMes(x.mes)}</td><td><b>${esc(x.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(x.razao_social || '')}</span></td><td>${x.tipo === 'adiantamento' ? 'Adiantamento · ' : ''}NF ${esc(x.numero || 's/nº')}<br><span class="pill ${x.status === 'conferida' ? 'escuro' : x.status === 'recusada' ? 'alerta' : ''}" style="font-size:11px">${esc(x.status)}</span></td><td class="num">${esc(fmtCNPJ(x.cnpj_emitente) || '—')}</td><td class="n">${BRL2(x.valor)}</td><td>${fmtD(x.data_emissao)}</td>
            <td>${x.arquivo_path ? chipArq(x.arquivo_path, tipoArq(x.arquivo_path)) : ''}${(x.anexos || []).map(a => chipArq(a.path, tipoArq(a.path, a.tipo))).join('')}</td></tr>`).join('')}</tbody></table></div><p class="nota">${ls.length} documento(s)${ls.length === 300 ? ' (mostrando os 300 mais recentes; refine a busca)' : ''}.</p>` : '<p class="nota">Nada encontrado.</p>';
        ligarArquivos(r); } catch (e) { r.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; } };
    cx.querySelector('#docqb').onclick = busca; cx.querySelector('#docq').onkeydown = e => { if (e.key === 'Enter') busca(); }; if (D.docBusca) busca(); return;
  }
  let nfs, fech, res, val, parcs, lotes;
  try { [nfs, fech, res, val, parcs, lotes] = await Promise.all([
      todas(() => sb.from('notas_fiscais').select('parceiro_id,numero,valor,cnpj_emitente,data_emissao,tipo,status,arquivo_path,anexos,enviado_em').eq('competencia_id', c.id).neq('status', 'substituida')),
      todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_final,valor_aprovado,a_pagar,lote_id,pago_em').eq('competencia_id', c.id)),
      todas(() => sb.from('nf_resumo').select('parceiro_id,situacao,valor_nfs,valor_esperado').eq('competencia_id', c.id)).catch(() => []),
      todas(() => sb.from('validacao_financeiro').select('*').eq('competencia_id', c.id)),
      q(sb.from('parceiros').select('id,regiao,nome,razao_social,cnpj,dia_pagamento,quinzenal')),
      q(sb.from('lotes_financeiro').select('id,rotulo,data_pagamento,status').eq('competencia_id', c.id))]);
  } catch (e) { cx.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; return; }
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])), rm = Object.fromEntries(res.map(r => [r.parceiro_id, r])), vm = Object.fromEntries(val.map(v => [v.parceiro_id, v])), lm = Object.fromEntries(lotes.map(l => [l.id, l]));
  // financeiro: só os parceiros já aprovados (o mês pode estar aberto, mas o que ele paga já está aprovado)
  if (opt.soAprovados) { const ok = new Set(fech.filter(f => f.valor_aprovado != null).map(f => f.parceiro_id)); fech = fech.filter(f => ok.has(f.parceiro_id)); nfs = nfs.filter(n => ok.has(n.parceiro_id)); }
  const ids = [...new Set(fech.map(f => f.parceiro_id).concat(nfs.map(n => n.parceiro_id)))];
  const n_ = v => Number(v) || 0;
  let L = ids.map(id => { const p = pm[id] || {}; const f = fech.find(x => x.parceiro_id === id); const ns = nfs.filter(x => x.parceiro_id === id);
    return { id, p, f, ns, r: rm[id], v: vm[id], dia: p.dia_pagamento || 'Sem dia cadastrado', dt: dataPagamento(p.dia_pagamento, c.mes) || '9999', aprov: f ? n_(f.valor_aprovado ?? f.valor_final) : null, vNF: ns.filter(x => x.status !== 'recusada').reduce((a, x) => a + n_(x.valor), 0) }; });
  const sit = x => x.v?.situacao || (x.ns.length ? 'falta' : 'semnf');
  const DIAS = [...new Set(L.map(x => x.dia))].sort((a, b) => (L.find(x => x.dia === a).dt).localeCompare(L.find(x => x.dia === b).dt));
  const cont = k => L.filter(x => sit(x) === k).length;
  const fDia = D.docDia || 'todos', fSit = D.docSit || 'todos', fT = norm(D.docFiltro || '');
  const vis = L.filter(x => (fDia === 'todos' || x.dia === fDia) && (fSit === 'todos' || sit(x) === fSit) && (!fT || norm(`${x.p.regiao} ${x.p.nome} ${x.p.razao_social} ${x.p.cnpj} ${x.ns.map(n => n.numero).join(' ')}`).includes(fT)))
    .sort((a, b) => a.dt.localeCompare(b.dt) || (a.p.regiao || '').localeCompare(b.p.regiao || ''));
  const SIT = { validado: ['Validado', 'eco'], pendencia: ['Com pendência', 'alerta'], falta: ['Falta validar', ''], semnf: ['Sem NF', 'marca'] };
  const GSM = { conferida: ['NF conferida', 'escuro'], a_conferir: ['GSM conferindo', ''], faltando: ['NF faltando', 'alerta'], aguardando: ['Aguardando NF', 'alerta'] };
  const btn = (k, t, cur) => `<button class="btn ${cur === k ? '' : 'sec'} peq" ${t}>`;
  cx.innerHTML = `<div class="kpis" style="margin-bottom:14px">
      <div class="kpi neutro"><small>Parceiros na competência</small><b>${L.length}</b><span>${L.filter(x => x.ns.length).length} com NF no portal</span></div>
      <div class="kpi eco"><small>Validados pelo financeiro</small><b>${cont('validado')} de ${L.filter(x => x.ns.length).length}</b><span>${L.filter(x => x.ns.length).length ? Math.round(100 * cont('validado') / L.filter(x => x.ns.length).length) : 0}% dos documentos</span></div>
      <div class="kpi ${cont('pendencia') ? 'alerta' : 'neutro'}"><small>Com pendência</small><b>${cont('pendencia')}</b><span>anotadas pelo financeiro</span></div>
      <div class="kpi neutro"><small>Falta validar</small><b>${cont('falta')}</b><span>${cont('semnf')} parceiro(s) ainda sem NF</span></div></div>
    <section class="bloco" style="padding:12px 16px"><div class="linha" style="align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:14px">Pagamento:</b>
      <button class="btn ${fDia === 'todos' ? '' : 'sec'} peq" data-dd="todos">Todos (${L.length})</button>${DIAS.map(d => `<button class="btn ${fDia === d ? '' : 'sec'} peq" data-dd="${esc(d)}">${esc(d)}${dataPagamento(d, c.mes) ? ' · ' + fmtD(dataPagamento(d, c.mes)) : ''} (${L.filter(x => x.dia === d).length})</button>`).join('')}</div>
      <div class="linha" style="align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap"><b style="font-size:14px">Situação:</b>${[['todos', 'Todos']].concat(Object.entries(SIT).map(([k, [t]]) => [k, t])).map(([k, t]) => `<button class="btn ${fSit === k ? '' : 'sec'} peq" data-ds="${k}">${t} (${k === 'todos' ? L.length : cont(k)})</button>`).join('')}
        <input class="peq" id="docf" placeholder="Filtrar praça, razão social, CNPJ ou nº da NF" value="${esc(D.docFiltro || '')}" style="flex:1 1 240px"><button class="btn sec peq" id="docx">Baixar Excel</button></div></section>
    ${DIAS.filter(d => vis.some(x => x.dia === d)).map(d => { const ls = vis.filter(x => x.dia === d);
      return `<section class="bloco"><div class="linha" style="justify-content:space-between;align-items:baseline"><h2 style="margin:0">Pagamento ${esc(d).replace(/^Dia /, "dia ")}${dataPagamento(d, c.mes) ? ' · ' + fmtD(dataPagamento(d, c.mes)) : ''}</h2><span class="nota">${ls.length} parceiro(s) · ${BRL2(ls.reduce((a, x) => a + (x.aprov || 0), 0))} aprovado · ${ls.filter(x => sit(x) === 'validado').length} validado(s)</span></div>
      <div class="tabela"><table><thead><tr><th>Parceiro</th><th>Documentos</th><th class="n">Aprovado</th><th class="n">NF</th><th>GSM</th><th>Financeiro</th></tr></thead><tbody>
      ${ls.map(x => { const st = sit(x); const [tS, cS] = SIT[st]; const g = x.r ? GSM[x.r.situacao] || [x.r.situacao, ''] : ['—', '']; const dif = x.aprov != null && x.ns.length && Math.abs(x.vNF - x.aprov) > 0.009;
        return `<tr data-dp="${x.id}"><td><b>${esc(x.p.regiao || '—')}</b>${pillQ(x.p)}<br><span style="font-size:12px;color:var(--muted)">${esc(x.p.razao_social || x.p.nome || '')}<br><span class="num">${esc(fmtCNPJ(x.p.cnpj) || '')}</span></span></td>
          <td style="min-width:220px">${x.ns.length ? x.ns.map(n => `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--muted)">${n.tipo === 'adiantamento' ? 'Adiantamento · ' : ''}NF ${esc(n.numero || 's/nº')}${n.status === 'recusada' ? ' <span class="pill alerta" style="font-size:11px">recusada</span>' : ''} · ${BRL2(n.valor)}${n.cnpj_emitente && x.p.cnpj && String(n.cnpj_emitente).replace(/\D/g, '') !== String(x.p.cnpj).replace(/\D/g, '') ? ' · <b style="color:var(--alert-ink2)">CNPJ diferente do cadastro</b>' : ''}</span><br>${n.arquivo_path ? chipArq(n.arquivo_path, tipoArq(n.arquivo_path)) : ''}${(n.anexos || []).map(a => chipArq(a.path, tipoArq(a.path, a.tipo))).join('')}</div>`).join('') : '<span class="nota">Nenhum documento enviado</span>'}</td>
          <td class="n">${x.aprov != null ? BRL2(x.aprov) : '—'}${x.f?.pago_em ? `<br><span class="pill escuro" style="font-size:11px">Pago ${fmtD(x.f.pago_em)}</span>` : x.f?.lote_id && lm[x.f.lote_id] ? `<br><span class="pill" style="font-size:11px">${esc(lm[x.f.lote_id].rotulo || 'Lote')}</span>` : ''}</td>
          <td class="n" style="${dif ? 'color:var(--alert-ink2);font-weight:600' : ''}">${x.ns.length ? BRL2(x.vNF) : '—'}${dif ? '<br><span style="font-size:11px">diferente do aprovado</span>' : ''}</td>
          <td><span class="pill ${g[1]}" style="font-size:11px">${esc(g[0])}</span></td>
          <td style="min-width:210px">${st === 'semnf' ? '<span class="nota">aguardando NF</span>' : `<span class="pill ${cS === 'eco' ? '' : cS}" style="font-size:11px;${cS === 'eco' ? 'background:var(--eco-bg);color:var(--eco)' : ''}">${tS}</span>${x.v ? `<br><span class="nota">${esc(x.v.por_nome || '')} · ${fmtDH(x.v.em)}</span>${x.v.obs ? `<br><span style="font-size:12px">${esc(x.v.obs)}</span>` : ''}` : ''}
            <div class="linha" style="gap:6px;margin-top:6px">${st !== 'validado' ? `<button class="btn sec peq" data-dv="${x.id}">Validar</button>` : ''}${st !== 'pendencia' ? `<button class="btn sec peq" data-dpe="${x.id}">Pendência</button>` : ''}${x.v ? `<button class="btn sec peq" data-dz="${x.id}" title="Voltar para falta validar">Desfazer</button>` : ''}</div><div data-dob="${x.id}"></div>`}</td></tr>`; }).join('')}
      </tbody></table></div></section>`; }).join('') || '<p class="nota">Nenhum parceiro neste filtro.</p>'}
    <p class="nota">Clique no documento para abrir (o link vale 10 minutos). "GSM" é a conferência da NF pela equipe de fechamento (valor e CNPJ). A pasta guarda todas as competências: use "Buscar em todas as NFs" para achar uma NF antiga por número, CNPJ, praça ou valor.</p>`;
  ligarArquivos(cx);
  const re = () => documentosFin(box, D, c, opt);
  cx.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => { D.docDia = b.dataset.dd; re(); });
  cx.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { D.docSit = b.dataset.ds; re(); });
  const fi = cx.querySelector('#docf'); fi.oninput = () => { D.docFiltro = fi.value; clearTimeout(D.docT); D.docT = setTimeout(async () => { await re(); const f2 = box.querySelector('#docf'); if (f2) { f2.focus(); f2.setSelectionRange(f2.value.length, f2.value.length); } }, 350); };
  const salva = async (id, sitv, obs) => { try { await q(sb.rpc('validar_financeiro', { p_comp: c.id, p_parceiro: id, p_situacao: sitv, p_obs: obs || null })); re(); } catch (e) { alertaTopo(e.message); } };
  cx.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => salva(b.dataset.dv, 'validado', null));
  cx.querySelectorAll('[data-dz]').forEach(b => b.onclick = () => salva(b.dataset.dz, null, null));
  cx.querySelectorAll('[data-dpe]').forEach(b => b.onclick = () => { const id = b.dataset.dpe; const alvo = cx.querySelector(`[data-dob="${id}"]`);
    alvo.innerHTML = `<div class="linha" style="gap:6px;margin-top:6px"><input class="peq" placeholder="Qual a pendência? (ex.: boleto vencido)" style="flex:1 1 160px"><button class="btn peq">Salvar</button></div>`;
    const inp = alvo.querySelector('input'); inp.focus(); const ok = () => { if (!inp.value.trim()) return alertaTopo('Descreva a pendência.'); salva(id, 'pendencia', inp.value); };
    alvo.querySelector('button').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); }; });
  cx.querySelector('#docx').onclick = () => baixarXlsx(`Documentos_${c.mes.slice(0, 7)}.xlsx`, { titulo: 'Documentos de pagamento', sub: `Competência ${nomeMes(c.mes)}`, abas: [{ nome: 'Documentos', linhas: vis.map(x => ({ 'Pagamento': x.dia, 'Data': dataPagamento(x.p.dia_pagamento, c.mes) ? fmtD(dataPagamento(x.p.dia_pagamento, c.mes)) : '', 'Praça': x.p.regiao, 'Razão social': x.p.razao_social, 'CNPJ': fmtCNPJ(x.p.cnpj), 'NFs': x.ns.map(n => n.numero).join(', '), 'Valor aprovado': x.aprov, 'Valor NF': x.ns.length ? x.vNF : null, 'Conferência GSM': x.r ? (GSM[x.r.situacao] || [x.r.situacao])[0] : '', 'Financeiro': SIT[sit(x)][0], 'Validado por': x.v?.por_nome || '', 'Em': x.v ? fmtDH(x.v.em) : '', 'Observação': x.v?.obs || '', 'Pago em': x.f?.pago_em ? fmtD(x.f.pago_em) : '' })) }] });
}

// ---------- Compilado para impressão: todas as NFs do mês num PDF só, escolhendo as páginas ----------
async function carregarPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((ok, erro) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'; sc.onload = ok; sc.onerror = () => erro(new Error('Não foi possível carregar o gerador de PDF. Recarregue a página.')); document.head.appendChild(sc); });
  return window.PDFLib;
}
// "todas", "1", "1,3", "1-2", "0"/vazio = não imprimir
function paginasDe(txt, total) {
  const t = String(txt || '').trim().toLowerCase(); if (!t || t === '0' || t === 'não' || t === 'nao') return [];
  if (t === 'todas' || t === 'tudo') return [...Array(total).keys()];
  const out = new Set(); t.split(/[,;\s]+/).forEach(parte => { const m = parte.match(/^(\d+)(?:-(\d+))?$/); if (!m) return; const a = +m[1], b = m[2] ? +m[2] : a; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= total) out.add(i - 1); });
  return [...out].sort((a, b) => a - b);
}
async function compiladoNFs(box, lote) {
  box.innerHTML = '<div class="carregando">Carregando as NFs do lote…</div>';
  try {
    const PDFLib = await carregarPdfLib();
    const { linhas, comp } = await dadosLote(lote);
    const visto = new Set(); const docs = [];
    (linhas || []).slice().sort((a, b) => (a.regiao || '').localeCompare(b.regiao || '')).forEach(l => (l.nfs || []).filter(n => n.arquivo_path).forEach(n => { const p = { id: l.id, regiao: l.regiao, nome: l.nome };
      // fatura rateada entre regiões (Gritsch): o mesmo arquivo entra uma vez só
      if (visto.has(n.arquivo_path)) return; visto.add(n.arquivo_path);
      docs.push({ p, path: n.arquivo_path, rot: `${l.adiantamento ? 'Adiantamento · ' : ''}NF ${n.numero || 's/nº'}`, tipo: 'nf', valor: n.valor });
      (n.anexos || []).forEach(x => { if (!x.path || visto.has(x.path)) return; visto.add(x.path); docs.push({ p, path: x.path, rot: `${x.tipo || 'Anexo'} da NF ${n.numero || ''}`, tipo: /boleto/i.test(x.tipo || x.nome || '') ? 'boleto' : 'anexo' }); }); }));
    if (!docs.length) { box.innerHTML = '<p class="nota">Nenhuma NF em PDF neste lote ainda.</p>'; return; }
    let feitos = 0; const fila = docs.slice();
    const um = async d => { const { data, error } = await sb.storage.from('envios').download(d.path); box.innerHTML = `<div class="carregando">Lendo os arquivos… ${++feitos} de ${docs.length}</div>`;
      if (error || !data) { d.erro = 'não baixou'; return; }
      d.bytes = new Uint8Array(await data.arrayBuffer()); d.img = /\.(jpe?g|png)$/i.test(d.path);
      if (d.img) { d.pags = 1; return; }
      try { const doc = await PDFLib.PDFDocument.load(d.bytes, { ignoreEncryption: true }); d.pags = doc.getPageCount(); } catch (e) { d.erro = 'PDF ilegível'; } };
    await Promise.all([...Array(4)].map(async () => { while (fila.length) await um(fila.shift()); }));
    // padrão: até 2 páginas imprime tudo; mais de 2, só a 1ª (a fatura); boleto sempre inteiro
    docs.forEach(d => { d.sel = d.erro ? '0' : d.tipo === 'boleto' || d.pags <= 2 ? 'todas' : '1'; });
    const longos = docs.filter(d => d.pags > 2);
    const conta = () => docs.reduce((a, d) => a + (d.erro ? 0 : paginasDe(d.sel, d.pags).length), 0);
    box.innerHTML = `<div class="msg ${longos.length ? 'alerta' : 'ok'}" style="margin:0 0 10px">${docs.length} arquivo(s) de ${new Set(docs.map(d => d.p.id)).size} parceiros. <b>${longos.length} com mais de 2 páginas</b>${longos.length ? `: ${longos.map(d => `${esc(d.p.regiao || '—')} (${esc(d.rot)}, ${d.pags} pág.)`).join(' · ')}. Nesses, o compilado leva só a 1ª página; boletos vão inteiros.` : '.'} Ajuste a coluna "Imprimir" se precisar: "todas", "1", "1-2", "1,3" ou "0" para tirar.</div>
      <div class="tabela" style="max-height:480px;overflow:auto"><table><thead><tr><th>Parceiro</th><th>Documento</th><th class="n">Páginas</th><th>Imprimir</th></tr></thead><tbody>
      ${docs.map((d, i) => `<tr style="${d.pags > 2 ? 'background:var(--hl-row)' : ''}"><td><b>${esc(d.p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(d.p.nome || '')}</span></td><td>${esc(d.rot)}${d.erro ? ` <span class="pill alerta">${d.erro}</span>` : ''}</td><td class="n">${d.pags ?? '—'}</td>
        <td><input class="peq" data-cpg="${i}" value="${esc(d.sel)}" style="width:90px" ${d.erro ? 'disabled' : ''}></td></tr>`).join('')}</tbody></table></div>
      <div class="linha" style="margin-top:10px;align-items:center"><button class="btn peq" id="cp-gerar">Gerar PDF para impressão</button><span class="nota" id="cp-tot">${conta()} página(s) no total</span></div>`;
    box.querySelectorAll('[data-cpg]').forEach(inp => inp.oninput = () => { docs[+inp.dataset.cpg].sel = inp.value; box.querySelector('#cp-tot').textContent = `${conta()} página(s) no total`; });
    box.querySelector('#cp-gerar').onclick = async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Montando o PDF…';
      try { const out = await PDFLib.PDFDocument.create();
        for (const d of docs) { if (d.erro) continue; const pg = paginasDe(d.sel, d.pags); if (!pg.length) continue;
          if (d.img) { const im = /\.png$/i.test(d.path) ? await out.embedPng(d.bytes) : await out.embedJpg(d.bytes); const W = 595.28, H = 841.89, k = Math.min((W - 40) / im.width, (H - 40) / im.height, 1);
            const page = out.addPage([W, H]); page.drawImage(im, { x: (W - im.width * k) / 2, y: (H - im.height * k) / 2, width: im.width * k, height: im.height * k }); continue; }
          const src = await PDFLib.PDFDocument.load(d.bytes, { ignoreEncryption: true }); (await out.copyPages(src, pg)).forEach(pp => out.addPage(pp)); }
        baixarBlob(new Blob([await out.save()], { type: 'application/pdf' }), `NFs_${String(lote.rotulo || 'lote').replace(/\s+/g, '')}_${lote.data_pagamento}_impressao.pdf`);
        b.textContent = 'Gerar PDF para impressão'; } catch (e) { b.textContent = 'Gerar PDF para impressão'; alertaTopo('Não foi possível montar o PDF: ' + e.message); }
      b.disabled = false; };
  } catch (e) { box.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; }
}

// Lista de lotes (admin e financeiro)
// Quadro igual à base geral: parceiro × coluna de pagamento (Adiantamento, 05, 15, 20, 30)
const COLS_PAG = [['adi', 'Adiantamento'], ['antec', 'Antecipação'], ['05', 'Pagamento 05'], ['15', 'Pagamento 15'], ['20', 'Pagamento 20'], ['30', 'Pagamento 30'], ['sem', 'Sem data']];
const colDia = d => /5º|util|útil/i.test(d || '') ? '05' : /15|quinzen/i.test(d || '') ? '15' : /20/.test(d || '') ? '20' : /30/.test(d || '') ? '30' : 'sem';
async function quadroPagamentos(box, c) {
  if (!box) return; box.innerHTML = '<div class="carregando">Carregando…</div>';
  const [fech, adis, parcs, lotes] = await Promise.all([
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_final,valor_aprovado,adiantado,a_pagar,antec_status,lote_id,pago_em').eq('competencia_id', c.id)),
    q(sb.from('adiantamentos').select('id,parceiro_id,valor,valor_liquido,status,lote_id,pago_em,data_pagamento').eq('competencia_id', c.id).in('status', ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'])),
    q(sb.from('parceiros').select('id,regiao,nome,dia_pagamento,forma_pagamento,quinzenal')),
    q(sb.from('lotes_financeiro').select('id,data_pagamento,rotulo,status').eq('competencia_id', c.id)),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const lm = Object.fromEntries(lotes.map(l => [l.id, l])); const n = v => Number(v) || 0;
  const L = {}; const lin = id => L[id] || (L[id] = { id, p: pm[id] || {}, final: null, cel: {} });
  const put = (x, col, v, info) => { const k = x.cel[col] || (x.cel[col] = { v: 0, info: [] }); k.v += v; k.info.push(info); };
  const sit = (lote_id, pago_em) => pago_em ? { t: 'pago ' + fmtD(pago_em), k: 'escuro' } : lote_id && lm[lote_id] ? { t: 'lote ' + fmtD(lm[lote_id].data_pagamento), k: 'marca' } : { t: 'sem lote', k: 'alerta' };
  fech.forEach(f => { const x = lin(f.parceiro_id); x.final = n(f.valor_aprovado ?? f.valor_final); if (f.valor_aprovado == null && f.valor_final == null) return;
    const v = f.a_pagar != null ? n(f.a_pagar) : x.final - n(f.adiantado); put(x, f.antec_status === 'liberada' ? 'antec' : colDia(x.p.dia_pagamento), v, sit(f.lote_id, f.pago_em)); });
  adis.forEach(a => { const x = lin(a.parceiro_id); put(x, 'adi', n(a.valor_liquido ?? a.valor), sit(a.lote_id, a.pago_em)); });
  const linhas = Object.values(L).filter(x => Object.keys(x.cel).length).sort((a, b) => (a.p.regiao || '').localeCompare(b.p.regiao || ''));
  if (!linhas.length) { box.innerHTML = '<p class="nota">Ainda não há valores aprovados nem adiantamentos liberados nesta competência.</p>'; return; }
  const cols = COLS_PAG.filter(([k]) => linhas.some(x => x.cel[k]));
  const tot = k => linhas.reduce((a, x) => a + (x.cel[k]?.v || 0), 0);
  const cel = (x, k) => { const c2 = x.cel[k]; if (!c2) return '<td class="n" style="color:var(--muted)">—</td>'; const s0 = c2.info[0];
    return `<td class="n">${BRL2(c2.v)}<br><span class="pill ${c2.info.every(i => i.k === 'escuro') ? 'escuro' : s0.k}" style="font-size:11px">${esc(c2.info.length > 1 ? c2.info.map(i => i.t).join(' · ') : s0.t)}</span></td>`; };
  box.innerHTML = `<div class="kpis">${cols.map(([k, t]) => `<div class="kpi neutro"><small>${t}</small><b>${BRL(tot(k))}</b><span>${linhas.filter(x => x.cel[k]).length} parceiro(s) · ${BRL(linhas.filter(x => x.cel[k] && x.cel[k].info.every(i => i.k === 'escuro')).reduce((a, x) => a + x.cel[k].v, 0))} pago</span></div>`).join('')}</div>
    <div class="tabela" style="max-height:520px;overflow:auto"><table><thead><tr><th>Parceiro</th><th class="n">Valor final</th>${cols.map(([, t]) => `<th class="n">${t}</th>`).join('')}<th>Forma</th></tr></thead><tbody>
      ${linhas.map(x => `<tr><td><b>${esc(x.p.regiao || '—')}</b>${pillQ(x.p)}<br><span style="font-size:12px;color:var(--muted)">${esc(x.p.nome || '')} · ${esc(x.p.dia_pagamento || 'sem dia')}</span></td><td class="n">${x.final != null ? BRL2(x.final) : '<span class="nota">em aberto</span>'}</td>${cols.map(([k]) => cel(x, k)).join('')}<td style="font-size:13px">${esc(x.p.forma_pagamento || '—')}</td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${BRL(linhas.reduce((a, x) => a + (x.final || 0), 0))}</b></td>${cols.map(([k]) => `<td class="n"><b>${BRL(tot(k))}</b></td>`).join('')}<td></td></tr></tfoot></table></div>
    <p class="nota">Adiantamento: valor líquido pago antes do fechamento. Nas colunas de pagamento, o valor da NF do fechamento (aprovado − adiantado − antecipação), na coluna do dia de pagamento do parceiro. Antecipação: parceiros que anteciparam o fechamento.</p>`;
}

// Agenda: lotes de todas as competências por data de pagamento
async function agendaPagamentos(box) {
  if (!box) return; box.innerHTML = '<div class="carregando">Carregando…</div>';
  const desde = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const lotes = (await q(sb.from('lotes_financeiro').select('id,competencia_id,data_pagamento,rotulo,status,total,pago_em').gte('data_pagamento', desde).order('data_pagamento'))).filter(l => l.status !== 'desfeito');
  if (!lotes.length) { box.innerHTML = '<p class="nota">Nenhum lote com pagamento nos últimos 45 dias ou à frente.</p>'; return; }
  const comps = await q(sb.from('competencias').select('id,mes').in('id', [...new Set(lotes.map(l => l.competencia_id))]));
  const cm = Object.fromEntries(comps.map(x => [x.id, x.mes])); const [ad, fe] = await Promise.all([
    q(sb.from('adiantamentos').select('lote_id').in('lote_id', lotes.map(l => l.id))), q(sb.from('fechamento_parceiro').select('lote_id').in('lote_id', lotes.map(l => l.id)))]);
  const hoje = new Date().toISOString().slice(0, 10);
  box.innerHTML = `<div class="tabela"><table><thead><tr><th>Data de pagamento</th><th>Lote</th><th>Competência</th><th>Conteúdo</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
    ${lotes.map(l => { const [r, k] = ST_LOTE[l.status] || [l.status, '']; const na = ad.filter(a => a.lote_id === l.id).length, nf = fe.filter(f => f.lote_id === l.id).length;
      return `<tr${l.data_pagamento < hoje && !/pago/.test(l.status) ? ' style="background:var(--hl-row)"' : ''}><td><b>${fmtD(l.data_pagamento)}</b></td><td>${esc(l.rotulo || '')}</td><td>${cm[l.competencia_id] ? nomeMes(cm[l.competencia_id]) : '—'}</td><td style="font-size:13px">${[nf ? `${nf} fechamento(s)` : '', na ? `${na} adiantamento(s)` : ''].filter(Boolean).join(' · ')}</td><td class="n">${BRL2(l.total)}</td><td><span class="pill ${k}">${r}</span></td></tr>`; }).join('')}
    </tbody></table></div><p class="nota">Linhas em destaque: data já passou e o lote ainda não foi registrado como pago.</p>`;
}

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
        <div class="linha"><button class="btn peq" data-pac="${l.id}">Pacote completo (.zip)</button><button class="btn sec peq" data-capa="${l.id}">Capa (.xlsx)</button><button class="btn sec peq" data-pts="${l.id}">Pontos (.xlsx)</button><button class="btn sec peq" data-compil="${l.id}" title="NFs e boletos do lote num PDF só, para imprimir (arquivos com mais de 2 páginas só com a 1ª)">Compilado p/ imprimir (PDF)</button><button class="btn sec peq" data-zip="${l.id}">NFs (.zip)</button>
        ${admin && l.status === 'gerado' ? `<button class="btn sec peq" data-env="${l.id}">Marcar enviado</button>` : ''}${admin && !pagos ? `<button class="btn sec peq" data-desf="${l.id}">Desfazer lote</button>` : ''}</div></div>
      <div class="kpis"><div class="kpi neutro"><small>A pagar neste lote</small><b>${BRL2(l.total)}</b><span>${fs.filter(f => !f.adi).length} fechamento(s)${fs.some(f => f.adi) ? ` · ${fs.filter(f => f.adi).length} adiantamento(s)` : ''}</span></div>
        <div class="kpi ${pagos < fs.length ? 'alerta' : ''}"><small>Pagos</small><b>${pagos} de ${fs.length}</b><span>${l.pago_em ? 'concluído em ' + fmtD(l.pago_em) : l.enviado_em ? 'enviado ' + fmtDH(l.enviado_em) : 'ainda não enviado'}</span></div></div>
      ${pagos < fs.length ? `<div class="linha"><label class="campo">Pago em<input type="date" class="peq" data-pd="${l.id}" value="${hoje}"></label><button class="btn peq" data-pagar="${l.id}" style="align-self:flex-end">Registrar pagamento do lote</button>
        <span class="nota" style="align-self:flex-end">Parceiros ainda sem NF conferida ficam de fora e continuam pendentes.</span></div>` : ''}<div data-compilbox="${l.id}"></div><div data-msg="${l.id}"></div></div>`; }).join('');
  const L = id => lotes.find(x => x.id === id);
  box.querySelectorAll('[data-compil]').forEach(b => b.onclick = () => { b.disabled = true; compiladoNFs(box.querySelector(`[data-compilbox="${b.dataset.compil}"]`), L(b.dataset.compil)).finally(() => { b.disabled = false; }); });
  box.querySelectorAll('[data-capa]').forEach(b => b.onclick = async () => { b.disabled = true; try { await baixarCapa(L(b.dataset.capa)); } catch (e) { alertaTopo(e.message); } b.disabled = false; });
  box.querySelectorAll('[data-pac]').forEach(b => b.onclick = async () => { b.disabled = true; try { await baixarPacote(L(b.dataset.pac), b); } catch (e) { alertaTopo(e.message); } b.disabled = false; });
  box.querySelectorAll('[data-pts]').forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await pontosLote(L(b.dataset.pts)); baixarBlob(new Blob([r.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), r.nome); } catch (e) { alertaTopo(e.message); } b.disabled = false; });
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
    <section class="bloco"><h2>Quadro de pagamentos · ${nomeMes(comp().mes)}</h2><p class="sub">Igual à base geral do fechamento: o valor de cada parceiro na coluna da data em que é pago (adiantamento, 5º dia útil, dia 15, 20 e 30), com a situação de cada um.</p><div id="quadro"></div></section>
    <section class="bloco"><h2>Agenda de pagamentos · todas as competências</h2><p class="sub">Os lotes por data de pagamento, inclusive de competências diferentes (ex.: adiantamento de outubro e fechamento de setembro pagos no mesmo mês).</p><div id="agenda"></div></section>
    <section class="bloco"><h2>Lotes do mês</h2><div id="lotes"></div></section>
    <section class="bloco"><h2>Fechar a competência</h2><div id="fechar"></div></section>`;
  ligarSeletor(vPacote);
  const c = comp();
  const [fech, res, parcs, adisLib, nfsAd] = await Promise.all([
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,valor_aprovado,adiantado,a_pagar,antec_status,antec_taxa,antec_desconto,antec_data,lote_id,pago_em').eq('competencia_id', c.id)),
    todas(() => sb.from('nf_resumo').select('parceiro_id,situacao').eq('competencia_id', c.id)),
    q(sb.from('parceiros').select('id,regiao,nome,dia_pagamento,forma_pagamento,tipo_documento,quinzenal')),
    q(sb.from('adiantamentos').select('*').eq('competencia_id', c.id).in('status', ['liberado', 'nf_recebida']).is('lote_id', null).order('data_pagamento')),
    q(sb.from('notas_fiscais').select('adiantamento_id,status').eq('competencia_id', c.id).eq('tipo', 'adiantamento')),
  ]);
  const nfAdOk = id => nfsAd.some(n => n.adiantamento_id === id && n.status === 'conferida');
  const pm = Object.fromEntries(parcs.map(p => [p.id, p])); const sit = Object.fromEntries(res.map(r => [r.parceiro_id, r.situacao]));
  const livres = fech.filter(f => f.valor_aprovado != null && !f.lote_id);
  const grupos = {}; const grpAntec = f => `Antecipação ${fmtD(f.antec_data)}`;
  livres.forEach(f => { const d = f.antec_status === 'liberada' ? grpAntec(f) : pm[f.parceiro_id]?.dia_pagamento || 'Sem data cadastrada'; (grupos[d] = grupos[d] || []).push(f); });
  const ord = ['5º dia útil', 'Dia 15', 'Dia 20', 'Dia 30', 'Quinzenal', 'Sem data cadastrada'];
  const io = k => k.startsWith('Antecipação') ? -1 : ord.indexOf(k);
  const gs = Object.entries(grupos).sort((a, b) => io(a[0]) - io(b[0]) || a[0].localeCompare(b[0]));
  S.pacGrupo = S.pacGrupo && grupos[S.pacGrupo] ? S.pacGrupo : gs[0]?.[0];
  const sel = grupos[S.pacGrupo] || []; const soAdi = !gs.length && adisLib.length;
  const sugData = () => { const fa = sel.find(f => f.antec_status === 'liberada'); if (fa && S.pacGrupo.startsWith('Antecipação')) return fa.antec_data; const n = (S.pacGrupo || '').match(/\d+/); if (!n || /útil/.test(S.pacGrupo)) return ''; const [y, mm] = c.mes.split('-').map(Number); const dt = new Date(Date.UTC(y, mm, +n[0])); return dt.toISOString().slice(0, 10); };
  $('#montar').className = '';
  $('#montar').innerHTML = c.status === 'fechada' ? '<p class="nota">Competência fechada: não recebe novos lotes.</p>' : !livres.length && !adisLib.length ? '<p class="nota">Nenhum parceiro aprovado ou adiantamento liberado fora de lote neste mês.</p>' : `
    ${soAdi ? '<p class="nota" style="margin:0">Nenhum parceiro aprovado fora de lote neste mês. Abaixo, os adiantamentos que podem ir para pagamento: marque, confira a data e gere o lote.</p>' : ''}
    <div class="linha">${gs.map(([d, ls]) => `<button class="btn ${d === S.pacGrupo ? '' : 'sec'} peq" data-grp="${esc(d)}">${esc(d)} (${ls.length})</button>`).join('')}</div>
    <div class="tabela" ${soAdi ? 'hidden' : ''}><table><thead><tr><th><input type="checkbox" id="tudo" checked></th><th>Parceiro</th><th>Pagamento</th><th class="n">A pagar (aprovado − adiantado − antecipação)</th><th>NF</th></tr></thead><tbody>
      ${sel.map(f => { const p = pm[f.parceiro_id] || {}; const s = sit[f.parceiro_id]; return `<tr><td><input type="checkbox" class="pck" value="${f.parceiro_id}" checked></td><td><b>${esc(p.regiao)}</b>${pillQ(p)}<br><span style="font-size:12px;color:var(--muted)">${esc(p.nome)}</span></td><td style="font-size:13px">${esc(p.forma_pagamento || '—')}</td>
        <td class="n">${BRL2(f.a_pagar ?? (Number(f.valor_aprovado) - Number(f.adiantado || 0)))}${f.antec_status === 'liberada' ? `<br><span class="nota">antecipação: −${BRL2(f.antec_desconto)} (${String(f.antec_taxa).replace('.', ',')}%)</span>` : f.antec_status === 'solicitada' ? '<br><span class="nota">antecipação pedida, sem resposta</span>' : ''}</td><td><span class="pill ${s === 'conferida' ? 'escuro' : 'alerta'}">${(SIT_NF[s] || ['—'])[0]}</span></td></tr>`; }).join('')}
    </tbody></table></div>
    ${adisLib.length ? `<h3 style="margin:8px 0 0;font-size:15px">Adiantamentos liberados</h3><div class="tabela"><table><thead><tr><th></th><th>Parceiro</th><th>Pagar em</th><th class="n">Liberado</th><th class="n">Desconto</th><th class="n">A pagar</th><th>NF</th></tr></thead><tbody>
      ${adisLib.map(a => `<tr><td><input type="checkbox" class="ack" value="${a.id}" ${nfAdOk(a.id) ? '' : 'disabled title="Confira a NF do adiantamento antes"'}></td><td><b>${esc(pm[a.parceiro_id]?.regiao || '—')}</b></td><td>${fmtD(a.data_pagamento)}</td><td class="n">${BRL2(a.valor)}</td><td class="n">${Number(a.taxa_pct) ? BRL2(a.valor_desconto) + ` (${String(a.taxa_pct).replace('.', ',')}%)` : '—'}</td><td class="n"><b>${BRL2(a.valor_liquido)}</b></td><td>${nfAdOk(a.id) ? '<span class="pill escuro">NF conferida</span>' : a.status === 'nf_recebida' ? '<span class="pill alerta">NF a conferir</span>' : '<span class="pill alerta">Sem NF</span>'}</td></tr>`).join('')}
      </tbody></table></div><p class="nota">Só dá para marcar adiantamentos com a NF do adiantamento conferida (em Adiantamentos e antecipações). Marque os adiantamentos que saem neste lote. Na capa eles aparecem com Modelo "Parceiro (Adiantamento)" e o valor líquido na coluna de pagamento.</p>` : ''}
    <div class="linha" style="align-items:flex-end"><label class="campo">Nome do lote<input class="peq" id="lrot" value="${soAdi ? 'Adiantamento' : (S.pacGrupo || '').startsWith('Antecipação') ? 'Antecipação' : `Pagamento ${esc(((S.pacGrupo || '').match(/\d+/) || [''])[0])}`}" style="width:180px"></label><label class="campo">Data de pagamento<input class="peq" type="date" id="ldata" value="${soAdi ? (adisLib[0].data_pagamento || '') : sugData()}"></label><button class="btn marca" id="lgerar">Gerar lote</button></div>
    <p class="nota"><b>A data de pagamento do lote é a que vale:</b> ela substitui a data prevista de cada parceiro ou adiantamento marcado e vai na capa para o financeiro. Parceiros aguardando NF podem entrar no lote (aparecem como "Aguardando NF" na capa, como hoje), mas só são marcados como pagos depois da NF conferida.</p>`;
  m.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { S.pacGrupo = b.dataset.grp; vPacote(); });
  const tudo = $('#tudo'); if (tudo) tudo.onchange = () => m.querySelectorAll('.pck').forEach(x => x.checked = tudo.checked);
  const g = $('#lgerar'); if (g) g.onclick = async () => { const ids = [...m.querySelectorAll('.pck:checked')].map(x => x.value); const aids = [...m.querySelectorAll('.ack:checked')].map(x => x.value);
    g.disabled = true; try { await q(sb.rpc('gerar_lote_v2', { p_comp: c.id, p_data: $('#ldata').value || null, p_rotulo: $('#lrot').value, p_parceiros: ids, p_adiantamentos: aids })); vPacote(); } catch (e) { g.disabled = false; alertaTopo(e.message); } };
  listaLotes($('#lotes'), c.id, true);
  quadroPagamentos($('#quadro'), c); agendaPagamentos($('#agenda'));
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
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let t = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); t += c.items.map(x => x.str).join(' ') + '\n'; }
  return t;
}
// Leitura por imagem (NF escaneada ou foto): renderiza a página e lê com OCR em português
let _tess = null;
async function carregarTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (!_tess) _tess = new Promise((ok, erro) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.onload = () => ok(window.Tesseract); sc.onerror = () => erro(new Error('Não foi possível carregar o leitor de imagem.')); document.head.appendChild(sc); });
  return _tess;
}
// Leitura de imagem com limite de tempo e botão "preencher à mão": nunca deixa a tela travada em "Lendo a NF…"
async function ocrComPulo(file, idTexto, aviso) {
  const el = $('#' + idTexto); let pular;
  const pulo = new Promise(ok => { pular = ok; });
  if (el && el.parentElement) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sec peq'; b.style.marginLeft = '10px'; b.textContent = 'Pular a leitura e preencher à mão';
    b.onclick = () => pular(''); el.after(b); }
  const limite = new Promise(ok => setTimeout(() => ok(''), 60000));
  return Promise.race([textoOCR(file, aviso).catch(() => ''), pulo, limite]);
}
async function textoOCR(file, aviso) {
  const T = await carregarTesseract();
  const imgs = [];
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 2.5 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; imgs.push(cv); }
  } else imgs.push(file);
  const w = await T.createWorker('por', 1, { logger: m => { if (m.status === 'recognizing text' && aviso) aviso(Math.round(m.progress * 100)); } });
  let t = ''; for (const im of imgs) { const { data } = await w.recognize(im); t += data.text + '\n'; }
  await w.terminate(); return t;
}
// Leitura de NFS-e (vários layouts municipais e o DANFSe nacional). Nada é inventado: o que não achar volta vazio.
const GSM_CNPJ = '46766513000109';
const digN = t => String(t || '').replace(/\D/g, '');
const moedaN = v => Number(String(v).replace(/\./g, '').replace(',', '.'));
function lerNF(texto, { cnpjParceiro = '', esperado = null } = {}) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const r = { texto: t.length > 60, numero: '', valor: null, data: '', cnpj: '', cnpj_parceiro_no_pdf: false, valor_confere: null, valores: [] };
  if (!r.texto) return r;
  // CNPJ/CPF
  const docs = [...new Set((t.match(/\b\d{2}\.?\d{3}\.?\d{3}[\/.]?\d{4}-?\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || []).map(digN).filter(d => d.length === 14 || d.length === 11))];
  const cp = digN(cnpjParceiro);
  r.cnpj_parceiro_no_pdf = !!cp && docs.includes(cp);
  r.tomador_gsm = docs.includes(GSM_CNPJ);
  r.cnpj = r.cnpj_parceiro_no_pdf ? cp : (docs.find(d => d !== GSM_CNPJ) || '');
  // Valores em R$
  const vals = (t.match(/(?<![\d.,])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d,])/g) || []).map(moedaN).filter(v => v > 0);
  r.valores = [...new Set(vals)];
  const rotulos = [/Valor\s+L[íi]quido(?:\s+da\s+NFS-?e)?(?:\s*\(R\$\))?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O\s*=?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /Valor\s+(?:Total\s+)?d[oa]s?\s+(?:Servi[çc]os?|NFS-?e|Nota)\s*(?:\(R\$\))?\s*:?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i];
  let rot = null; for (const re of rotulos) { const m = t.match(re); if (m) { rot = moedaN(m[1]); break; } }
  if (esperado != null && r.valores.some(v => Math.abs(v - esperado) < 0.01)) { r.valor = Number(esperado); r.valor_confere = true; }
  else { r.valor = rot ?? (r.valores.length ? Math.max(...r.valores) : null); r.valor_confere = esperado == null ? null : false; }
  // Data de emissão: prefere data com hora; senão a primeira perto de "emiss"
  const comHora = t.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:-|às)?\s*\d{2}:\d{2}/);
  const perto = t.match(/Emiss[ãa]o[^\d]{0,60}(\d{2}\/\d{2}\/\d{4})/i);
  const d = (comHora || perto || t.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || [])[1];
  if (d) { const [dd, mm, yy] = d.split('/'); r.data = `${yy}-${mm}-${dd}`; }
  // Número da nota. 1º: chave de acesso nacional (50 dígitos: município 7, ambiente 1, tipo 1, CNPJ/CPF 14, número 13, AAMM 4, código 9, DV 1)
  for (const ch of (t.match(/(?<!\d)\d{50}(?!\d)/g) || [])) {
    const doc = ch.slice(9, 23); const n = ch.slice(23, 36).replace(/^0+/, '');
    if (n && (docs.includes(doc) || docs.includes(doc.slice(3)) || doc === cp)) { r.numero = n; r.chave = ch; if (!r.cnpj) r.cnpj = doc; break; }
  }
  const nums = [
    /N[ÚU]MERO\s+DA\s+NFS-?E\s+0*(\d{1,15})\b(?!\/)/i,
    /N[ÚU]MERO\s+DA\s+NFS-?E\s+COMPET[ÊE]NCIA\D{0,140}?\b0*(\d{1,15})\s+\d{2}\/\d{2}\/\d{4}/i,
    /N[°º]\s*NFS-?e\s*\/\s*CHAVE\s+NFS-?e\s+0*(\d{1,15})\s*\//i,
    /N[úu]mero\s+da\s+Nota\s+Data\s+e\s+Hora\s+de\s+Emiss[ãa]o\s+C[óo]digo\s+de\s+Verifica[çc][ãa]o\s+\S*u\d+\s+0*(\d{1,10})\b/i,
    /NFS-?e\s+Substitu[íi]da\s+(?:\d+\s+)?0*(\d{1,10})\s+NFS-?e/i,
    /Compet[êe]ncia\s+0*(\d{1,10})\s*(?:\/\s*[A-Z0-9]{1,3}\s*)?\d{2}\/\d{4}/i,
    /N[úu]mero\s*\/\s*S[ée]rie.{0,80}?\b0*(\d{1,10})\s*\/\s*[A-Z]{1,3}\b/i,
    /N[úu]mero\s+da\s+(?:Nota|NFS-?e)\s*:?\s*0*(\d{1,12})\b(?!\/)/i,
    /N[úu]mero\s*:\s*0*(\d{1,12})\b(?!\/)/i,
  ];
  if (!r.numero) for (const re of nums) { const m = t.match(re); if (m && m[1] !== '0') { r.numero = m[1]; break; } }
  return r;
}

const ST_NF = { recebida: ['A conferir', 'alerta'], conferida: ['Conferida', 'escuro'], recusada: ['Recusada', 'marca'], cancelada: ['Cancelada', ''], substituida: ['Substituída', ''] };
const SIT_NF = { aguardando: ['Aguardando NF', ''], a_conferir: ['NF a conferir', 'alerta'], faltando: ['Soma diferente do esperado', 'marca'], conferida: ['NF conferida', 'escuro'] };

async function secaoNF(c) {
  const box = $('#nfp'); if (!box) return;
  const [res, nfs] = await Promise.all([
    q(sb.from('nf_resumo').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).maybeSingle()),
    q(sb.from('notas_fiscais').select('*').eq('competencia_id', c.id).eq('parceiro_id', S.parc.id).eq('tipo', 'fechamento').order('enviado_em')),
  ]);
  box.className = '';
  if (!res) { box.innerHTML = '<p class="nota">A NF é enviada aqui depois que a GSM aprovar o valor do mês.</p>'; return; }
  if (res.sem_nf) { box.innerHTML = `<div class="msg ok"><b>Sem NF:</b> o seu fechamento é pago pela confirmação do valor aprovado (${BRL2(res.valor_esperado)}). Não é preciso enviar nota fiscal; a GSM encaminha ao financeiro.</div>`; return; }
  const esp = Number(res.valor_esperado), env = Number(res.valor_nfs), falta = esp - env;
  const [rot, cls] = SIT_NF[res.situacao] || [res.situacao, ''];
  box.innerHTML = `<div class="linha" style="justify-content:space-between"><span>Emita a NF pelo valor líquido. Pode dividir em mais de uma NF, desde que a soma bata.</span><span class="pill ${cls}">${rot}</span></div>
    <div class="kpis">
      <div class="kpi"><small>Valor aprovado</small><b>${BRL2(res.valor_aprovado)}</b><span>aprovado pela GSM</span></div>
      <div class="kpi neutro"><small>Adiantamento</small><b>${BRL2(res.adiantado)}</b><span>já pago no mês</span></div>
      ${res.antec_status === 'liberada' ? `<div class="kpi neutro"><small>Desconto da antecipação</small><b>${BRL2(res.antec_desconto)}</b><span>${String(res.antec_taxa).replace('.', ',')}% · pagamento em ${fmtD(res.antec_data)}</span></div>` : ''}
      <div class="kpi"><small>Valor da NF (líquido)</small><b>${BRL2(esp)}</b><span>aprovado − adiantamento${res.antec_status === 'liberada' ? ' − antecipação' : ''}</span></div>
      <div class="kpi ${Math.abs(falta) > 0.009 ? 'alerta' : 'neutro'}"><small>${falta >= 0 ? 'Falta emitir' : 'Enviado a mais'}</small><b>${BRL2(Math.abs(falta))}</b><span>${fmtN(res.nfs)} NF(s) enviada(s): ${BRL2(env)}</span></div>
    </div>
    ${nfs.length ? `<div class="tabela"><table><thead><tr><th>NF</th><th>Emissão</th><th>CNPJ emitente</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
      ${nfs.map(n => { const [r, k] = ST_NF[n.status] || [n.status, '']; return `<tr><td><b>${esc(n.numero)}</b>${n.arquivo_path ? ` · <a href="#" data-nfarq="${esc(n.arquivo_path)}">PDF</a>` : ''}${(n.anexos || []).map(x => ` · <a href="#" data-nfarq="${esc(x.path)}">${esc(x.tipo || 'Anexo')}</a>`).join('')}</td><td>${fmtD(n.data_emissao)}</td><td class="num">${esc(fmtCNPJ(n.cnpj_emitente))}</td><td class="n">${BRL2(n.valor)}</td>
        <td><span class="pill ${k}">${r}</span>${n.motivo_recusa ? `<div class="nota">GSM: ${esc(n.motivo_recusa)}</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    ${res.antec_status === 'solicitada' ? '<div class="msg alerta">Você pediu a antecipação do pagamento. Aguarde a resposta da GSM: se ela for liberada, a NF passa a ser emitida pelo valor com o desconto.</div>' : res.situacao !== 'conferida' && c.status !== 'fechada' ? `${zonaArquivo('arqnf', 'Arraste a NF aqui ou clique para escolher', 'PDF da NF (ou foto JPG/PNG). Pode mandar junto outros arquivos, como fatura e boleto: selecione todos de uma vez. O portal lê número, emissão, CNPJ, tomador e valor da NF e confere com o fechamento aprovado.', '.pdf,.jpg,.jpeg,.png', true)}<div id="nfform"></div>` : ''}`;
  box.querySelectorAll('[data-nfarq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const { data } = await sb.storage.from('envios').createSignedUrl(a.dataset.nfarq, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); });
  if ($('#arqnf')) ligarZona('arqnf', (f, fs) => { const v = (fs || [f]).filter(x => /\.(pdf|jpe?g|png)$/i.test(x.name));
    // A NF é o arquivo com "nf"/"nota" no nome; se nenhum tiver, o primeiro que não pareça boleto ou fatura
    const alvo = falta > 0.009 ? falta : esp;
    if (v.length > 1) { formNFMulti(v, c, alvo); return; }
    const nf = v.find(x => /\b(nf|nfs-?e|nota)/i.test(x.name)) || v.find(x => !/boleto|fatura|duplicata|recibo/i.test(x.name)) || v.find(x => /fatura|duplicata/i.test(x.name)) || v[0] || f;
    formNF(nf, c, alvo, v.filter(x => x !== nf)); });
}

// NF do adiantamento: lê o arquivo, confere com o valor liberado e registra
async function formNFAdi(file, c, a, anx = []) {
  const tipoAnx = n => /boleto/i.test(n) ? 'Boleto' : /fatura|duplicata/i.test(n) ? 'Fatura' : 'Anexo';
  const box = $('#nfadform');
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { box.innerHTML = '<div class="msg erro">Envie a NF em PDF (ou foto JPG/PNG).</div>'; return; }
  box.innerHTML = '<div class="carregando" style="padding:10px 0" id="nfad-lendo">Lendo a NF…</div>';
  const esperado = Number(a.valor); const ctx = { cnpjParceiro: S.parc.cnpj, esperado };
  let lido = { texto: false }, ocr = false;
  try { if (/\.pdf$/i.test(file.name)) lido = lerNF(await textoPDF(file), ctx); } catch (e) { lido = { texto: false }; }
  if (!lido.texto || (!lido.numero && lido.valor == null)) { ocr = true; try { lido = lerNF(await ocrComPulo(file, 'nfad-lendo', p => { const e = $('#nfad-lendo'); if (e) e.textContent = `A NF é uma imagem: lendo… ${p}%`; }), ctx); } catch (e) { lido = { texto: false }; } }
  const cad = digitos(S.parc.cnpj); const valOk = lido.valor != null && Math.abs(lido.valor - esperado) < 0.01;
  box.innerHTML = `<div class="linha" style="align-items:flex-end;margin-top:8px">
      <label class="campo">Número<input class="peq" id="na-num" value="${esc(lido.numero || '')}" style="width:150px"></label>
      <label class="campo">Emissão<input class="peq" id="na-dt" type="date" value="${esc(lido.data || '')}"></label>
      <label class="campo">CNPJ emitente<input class="peq" id="na-cnpj" value="${esc(fmtCNPJ(lido.cnpj || cad))}" style="width:190px"></label>
      <label class="campo">Valor (R$)<input class="peq" id="na-val" value="${lido.valor != null ? lido.valor.toFixed(2).replace('.', ',') : String(esperado.toFixed(2)).replace('.', ',')}" style="width:130px"></label>
      <button class="btn marca" id="na-env">Enviar NF do adiantamento</button></div>
    <div class="nota" style="margin-top:6px">NF lida de <b>${esc(file.name)}</b>${anx.length ? ` · vai junto como anexo: ${anx.map(x => `<b>${esc(x.name)}</b>`).join(', ')}` : ''}.</div>
    <div class="nota" style="margin-top:6px">${lido.texto ? `Dados lidos da NF${ocr ? ' (pela imagem)' : ''}; confira e corrija se a leitura errou.` : 'Não foi possível ler a NF: preencha os dados.'} ${lido.valor != null && !valOk ? `<b>Valor lido (${BRL2(lido.valor)}) diferente do liberado (${BRL2(esperado)}).</b>` : ''}</div><div id="na-msg"></div>`;
  $('#na-env').onclick = async () => { const b = $('#na-env'); const v = numBR($('#na-val').value);
    if (v == null || Number.isNaN(v)) { $('#na-msg').innerHTML = '<div class="msg erro">Valor inválido.</div>'; return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try { const path = `${S.parc.id}/${c.mes.slice(0, 7)}/nf_adiantamento/${Date.now()}_${safeName(file.name)}`;
      const up = await sb.storage.from('envios').upload(path, file); if (up.error) throw new Error('Falha ao guardar o arquivo: ' + up.error.message);
      const reg = await q(sb.rpc('registrar_nf_adiantamento', { p_adiant: a.id, p_arquivo: path, p_numero: $('#na-num').value.trim(), p_cnpj: digitos($('#na-cnpj').value), p_valor: v, p_data: $('#na-dt').value || null,
        p_checagens: { texto: !!lido.texto, ocr, cnpj_no_pdf: !!lido.cnpj_parceiro_no_pdf, tomador_gsm: !!lido.tomador_gsm, numero_lido: lido.numero || null, valor_lido: lido.valor ?? null }, p_parceiro: S.previa ? S.parc.id : null }));
      if (anx.length) { b.textContent = 'Enviando anexos…'; const lista = [];
        for (const x of anx) { const p2 = `${S.parc.id}/${c.mes.slice(0, 7)}/nf_adiantamento/${Date.now()}_${safeName(x.name)}`; const u = await sb.storage.from('envios').upload(p2, x); if (u.error) throw new Error(`Falha ao guardar ${x.name}: ${u.error.message}`); lista.push({ path: p2, nome: x.name, tipo: tipoAnx(x.name) }); }
        const nid = reg?.id || (await q(sb.from('notas_fiscais').select('id').eq('arquivo_path', path).limit(1)))[0]?.id; if (nid) await q(sb.rpc('anexar_nf', { p_nf: nid, p_anexos: lista })); }
      secaoAdiantamento(c);
    } catch (e) { $('#na-msg').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; b.disabled = false; b.textContent = 'Enviar NF do adiantamento'; } };
}

async function formNF(file, c, sugerido, anexos = [], pre = null) {
  const box = $('#nfform');
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { box.innerHTML = '<div class="msg erro">Envie a NF em PDF (ou foto JPG/PNG).</div>'; return; }
  box.innerHTML = '<div class="carregando" style="padding:10px 0" id="nf-lendo">Lendo a NF…</div>';
  const ctx = { cnpjParceiro: S.parc.cnpj, esperado: sugerido };
  let lido = { texto: false }, ocr = false;
  try { if (/\.pdf$/i.test(file.name)) lido = lerNF(await textoPDF(file), ctx); } catch (e) { lido = { texto: false }; }
  if (!lido.texto || (!lido.numero && lido.valor == null)) {
    ocr = true;
    try { lido = lerNF(await ocrComPulo(file, 'nf-lendo', p => { const e = $('#nf-lendo'); if (e) e.textContent = `A NF é uma imagem: lendo o conteúdo… ${p}%`; }), ctx); }
    catch (e) { lido = { texto: false, erro: e.message }; }
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const cad = digitos(S.parc.cnpj);
  if (pre && !lido.numero && pre.numero) lido.numero = pre.numero;
  const ck = { numero: !!lido.numero, data: !!lido.data, cnpj: !!lido.cnpj_parceiro_no_pdf, tomador: !!lido.tomador_gsm, valor: lido.valor_confere === true };
  const ok = ck.numero && ck.cnpj && ck.tomador && ck.valor; // a data de emissão é livre (há parceiro que emite depois ou com vencimento à frente)
  const linha = (rot, okk, val, msgRuim, okTxt = 'Confere') => `<tr><td>${rot}</td><td><b>${val || '—'}</b></td><td>${okk ? `<span class="pill escuro">${okTxt}</span>` : `<span class="pill alerta">${msgRuim}</span>`}</td></tr>`;
  box.innerHTML = lido.texto ? `<div class="confirma">
    <b>Dados lidos da NF · ${esc(file.name)}${ocr ? ' (lida pela imagem)' : ''}</b>
    <div class="tabela"><table><tbody>
      ${linha('Número', ck.numero, esc(lido.numero), 'Não encontrado', 'Lido')}
      ${linha('Emissão', ck.data, lido.data ? fmtD(lido.data) : '', 'Não encontrada (opcional)', 'Lida')}
      ${linha('CNPJ do emitente', ck.cnpj, esc(fmtCNPJ(lido.cnpj)), cad ? `Diferente do cadastro (${esc(fmtCNPJ(cad))})` : 'Parceiro sem CNPJ no cadastro')}
      ${linha('Tomador', ck.tomador, ck.tomador ? 'GSM Group Logística' : '', 'GSM não aparece como tomador')}
      ${linha('Valor', ck.valor, lido.valor != null ? BRL2(lido.valor) : '', `Esperado ${BRL2(sugerido)}`)}
    </tbody></table></div>
    ${ok ? '<div class="msg ok">Todos os dados conferem com o fechamento aprovado.</div>' : '<div class="msg alerta">Há dados que não conferem. Corrija abaixo se a leitura errou; se a NF estiver errada, emita outra. Se enviar assim, a GSM vê os avisos.</div>'}
    <details ${ok ? '' : 'open'}><summary style="cursor:pointer;font-size:14px">Corrigir a leitura</summary>
    <div class="linha" style="align-items:flex-end;margin-top:8px">
      <label class="campo">Número<input class="peq" id="nf-num" value="${esc(lido.numero || '')}" style="width:160px"></label>
      <label class="campo">Emissão<input class="peq" id="nf-dt" type="date" value="${esc(lido.data || '')}"></label>
      <label class="campo">CNPJ emitente<input class="peq" id="nf-cnpj" value="${esc(fmtCNPJ(lido.cnpj || cad))}" style="width:190px"></label>
      <label class="campo">Valor (R$)<input class="peq" id="nf-val" value="${lido.valor != null ? lido.valor.toFixed(2).replace('.', ',') : ''}" style="width:130px"></label>
    </div></details>
    <div id="nf-anx"></div>
    <div class="linha"><button class="btn marca" id="nf-env">${ok ? 'Confirmar e enviar NF' : 'Enviar mesmo assim'}</button><button class="btn sec" id="nf-canc">Cancelar</button></div><div id="nf-msg"></div></div>`
  : `<div class="confirma"><b>Não foi possível ler a NF · ${esc(file.name)}</b><span>${esc(lido.erro || 'O arquivo não tem texto legível.')} Preencha os dados abaixo.</span>
    <div class="linha" style="align-items:flex-end">
      <label class="campo">Número<input class="peq" id="nf-num" style="width:160px"></label><label class="campo">Emissão<input class="peq" id="nf-dt" type="date"></label>
      <label class="campo">CNPJ emitente<input class="peq" id="nf-cnpj" value="${esc(fmtCNPJ(cad))}" style="width:190px"></label><label class="campo">Valor (R$)<input class="peq" id="nf-val" style="width:130px"></label></div>
    <span class="nota">Valor que falta emitir: ${BRL2(sugerido)}.</span>
    <div id="nf-anx"></div>
    <div class="linha"><button class="btn marca" id="nf-env">Enviar NF</button><button class="btn sec" id="nf-canc">Cancelar</button></div><div id="nf-msg"></div></div>`;
  $('#nf-canc').onclick = () => { box.innerHTML = ''; $('#arqnf').value = ''; };
  const anx = [...anexos]; const tipoAnx = n => /boleto/i.test(n) ? 'Boleto' : /fatura|duplicata/i.test(n) ? 'Fatura' : 'Anexo';
  const desenhaAnx = () => { $('#nf-anx').innerHTML = `<div style="margin:8px 0"><b style="font-size:14px">Outros arquivos junto com a NF</b> <span class="nota">(fatura, boleto, comprovantes)</span>
      ${anx.length ? `<ul style="margin:4px 0 6px 18px;font-size:14px">${anx.map((x, i) => `<li>${tipoAnx(x.name)}: ${esc(x.name)} <a href="#" data-rmanx="${i}">tirar</a> · <a href="#" data-usanf="${i}">este é a NF</a></li>`).join('')}</ul>` : '<div class="nota">Nenhum.</div>'}
      <label class="nota" style="cursor:pointer">+ adicionar arquivo <input type="file" id="nf-anx-in" multiple accept=".pdf,.jpg,.jpeg,.png" style="font:inherit;font-size:13px"></label></div>`;
    $('#nf-anx').querySelectorAll('[data-rmanx]').forEach(l => l.onclick = ev => { ev.preventDefault(); anx.splice(+l.dataset.rmanx, 1); desenhaAnx(); });
    $('#nf-anx').querySelectorAll('[data-usanf]').forEach(l => l.onclick = ev => { ev.preventDefault(); const k = +l.dataset.usanf; const novo = anx[k]; formNF(novo, c, sugerido, [file, ...anx.filter((_, j) => j !== k)]); });
    $('#nf-anx-in').onchange = e => { anx.push(...[...e.target.files].filter(x => /\.(pdf|jpe?g|png)$/i.test(x.name))); desenhaAnx(); }; };
  desenhaAnx();
  $('#nf-env').onclick = async () => {
    const b = $('#nf-env'); const v = numBR($('#nf-val').value);
    if (v == null || Number.isNaN(v)) { $('#nf-msg').innerHTML = '<div class="msg erro">Valor inválido.</div>'; return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const path = `${S.parc.id}/${c.mes.slice(0, 7)}/nf/${Date.now()}_${safeName(file.name)}`;
      const up = await sb.storage.from('envios').upload(path, file); if (up.error) throw new Error('Falha ao guardar o arquivo: ' + up.error.message);
      const num = $('#nf-num').value.trim(), dt = $('#nf-dt').value || null, cn = digitos($('#nf-cnpj').value);
      const reg = await q(sb.rpc('registrar_nf', { p_comp: c.id, p_parceiro: S.previa ? S.parc.id : null, p_arquivo: path, p_numero: num, p_cnpj: cn, p_valor: v, p_data: dt,
        p_checagens: { texto: !!lido.texto, ocr, cnpj_no_pdf: !!lido.cnpj_parceiro_no_pdf, tomador_gsm: !!lido.tomador_gsm, chave: lido.chave || null,
          numero_lido: lido.numero || null, data_lida: lido.data || null, valor_lido: lido.valor ?? null,
          valor_confere_pdf: lido.valor != null ? Math.abs(lido.valor - v) < 0.01 : null,
          editado: !!lido.texto && (num !== (lido.numero || '') || (dt || '') !== (lido.data || '') || (lido.valor != null && Math.abs(lido.valor - v) >= 0.01)) } }));
      if (anx.length) { b.textContent = 'Enviando anexos…'; const lista = [];
        for (const x of anx) { const p = `${S.parc.id}/${c.mes.slice(0, 7)}/nf/${Date.now()}_${safeName(x.name)}`; const u = await sb.storage.from('envios').upload(p, x); if (u.error) throw new Error(`Falha ao guardar ${x.name}: ${u.error.message}`); lista.push({ path: p, nome: x.name, tipo: tipoAnx(x.name) }); }
        const nid = reg?.id || (await q(sb.from('notas_fiscais').select('id').eq('arquivo_path', path).limit(1)))[0]?.id; if (nid) await q(sb.rpc('anexar_nf', { p_nf: nid, p_anexos: lista })); }
      secaoNF(c);
    } catch (e) { $('#nf-msg').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; b.disabled = false; b.textContent = 'Enviar NF'; }
  };
}

// Vários arquivos de uma vez: cada NF/fatura vira um documento próprio (uma linha de pagamento), com o boleto do mesmo valor anexado
async function formNFMulti(files, c, alvo) {
  const box = $('#nfform');
  box.innerHTML = '<div class="carregando" style="padding:10px 0" id="nfm-lendo">Lendo os arquivos…</div>';
  const R = /(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const lidos = [];
  for (const [i, f] of files.entries()) {
    const e = $('#nfm-lendo'); if (e) e.textContent = `Lendo ${i + 1} de ${files.length}: ${f.name}`;
    let t = ''; try { if (/\.pdf$/i.test(f.name)) t = String(await textoPDF(f) || ''); } catch (er) { t = ''; }
    const tt = t.replace(/\s+/g, ' ');
    const boleto = /boleto/i.test(f.name) || (/Local\s+(de\s+)?Pagamento/i.test(tt) && /Valor\s+(do\s+)?Documento/i.test(tt) && !/FATURA\s+N[ºo°]?\s*:/i.test(tt));
    const dacte = !boleto && (/dacte|\bct-?e\b/i.test(f.name) || /Documento\s+Auxiliar\s+do\s+Conhecimento\s+de\s+Transporte/i.test(tt));
    const l = lerNF(t, { cnpjParceiro: S.parc.cnpj });
    let valor = l.valor;
    const mFat = tt.match(new RegExp('Valor\\s+a\\s+pagar[^\\d]{0,80}?' + R.source, 'i')) || tt.match(new RegExp('VALOR\\s+TOTAL\\s+' + R.source, 'i'));
    if (!boleto && mFat) valor = moedaN(mFat[1]); else if (boleto && l.valores.length) valor = Math.max(...l.valores);
    const numFat = (tt.match(/FATURA\s*N\S{0,2}\s*:?\s*(\d[\d.\-\/]*)/i) || tt.match(/N\S{0,2}\s*do\s*Documento\s*:?\s*(\d[\d.\-\/]*)/i) || [])[1] || (!l.numero && (f.name.match(/(\d{4,}(?:-\d)?)/) || [])[1]) || '';
    lidos.push({ f, boleto, dacte, texto: !!l.texto, numero: (numFat || l.numero || '').replace(/^0+(?=\d)/, ''), data: l.data || '', cnpj: l.cnpj || digitos(S.parc.cnpj), valor, tomador: !!l.tomador_gsm, cnpjOk: !!l.cnpj_parceiro_no_pdf });
  }
  // DACTE/CT-e e cópias com o mesmo número são comprovantes da fatura, não outro pagamento
  let docs = lidos.filter(x => !x.boleto && !x.dacte).sort((x, y) => (/fatura|nf/i.test(y.f.name) ? 1 : 0) - (/fatura|nf/i.test(x.f.name) ? 1 : 0));
  const bols = lidos.filter(x => x.boleto); const apoio = lidos.filter(x => x.dacte);
  const vistos = new Set(); docs = docs.filter(d => { const k = digitos(d.numero || ''); if (k && vistos.has(k)) { apoio.push(d); return false; } if (k) vistos.add(k); return true; });
  if (!docs.length && apoio.length) docs.push(apoio.shift());
  if (docs.length <= 1) { const d = docs[0] || lidos[0]; formNF(d.f, c, alvo, files.filter(x => x !== d.f), { numero: d.numero }); return; }
  // pareia boleto ↔ documento pelo valor
  const usados = new Set(); bols.forEach(b => { const k = docs.findIndex((x, j) => !usados.has(j) && x.valor != null && b.valor != null && Math.abs(x.valor - b.valor) < 0.01); b.par = k; if (k >= 0) usados.add(k); });
  const nBol = bols.length;
  apoio.forEach(x => { const k = docs.findIndex(d => digitos(d.numero || '') && digitos(d.numero || '') === digitos(x.numero || '')); x.par = k >= 0 ? k : 0; x.apoio = true; bols.push(x); });
  const desenha = () => {
    const soma = docs.reduce((a, d) => a + (Number(d.valor) || 0), 0); const okSoma = Math.abs(soma - alvo) < 0.01;
    box.innerHTML = `<div class="confirma"><b>${docs.length} documentos para enviar · cada um vira uma linha de pagamento</b>
      <span class="nota">O portal separou ${docs.length} NF/fatura(s), ${nBol} boleto(s)${apoio.length ? ` e ${apoio.length} comprovante(s) (DACTE/CT-e)` : ''}. Cada boleto fica anexado ao documento de mesmo valor. Confira número, emissão e valor de cada um.</span>
      <div class="tabela"><table><thead><tr><th>Arquivo</th><th>Número</th><th>Emissão</th><th>CNPJ emitente</th><th class="n">Valor (R$)</th><th>Boleto</th></tr></thead><tbody>
      ${docs.map((d, i) => `<tr><td>${esc(d.f.name)}${!d.tomador && d.texto ? ' <span class="pill alerta">GSM não aparece como tomador</span>' : ''}</td>
        <td><input class="peq" data-m="numero" data-i="${i}" value="${esc(d.numero)}" style="width:110px"></td>
        <td><input class="peq" type="date" data-m="data" data-i="${i}" value="${esc(d.data)}"></td>
        <td><input class="peq" data-m="cnpj" data-i="${i}" value="${esc(fmtCNPJ(d.cnpj))}" style="width:170px"></td>
        <td class="n"><input class="peq" data-m="valor" data-i="${i}" value="${d.valor != null ? Number(d.valor).toFixed(2).replace('.', ',') : ''}" style="width:110px;text-align:right"></td>
        <td>${bols.filter(b => b.par === i).map(b => `${esc(b.f.name)} <span class="nota">(${BRL2(b.valor)})</span>`).join('<br>') || '<span class="nota">—</span>'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4"><b>Soma</b> <span class="nota">· valor a emitir ${BRL2(alvo)}</span></td><td class="n"><b>${BRL2(soma)}</b></td><td>${okSoma ? '<span class="pill escuro">Confere</span>' : `<span class="pill alerta">Diferença ${BRL2(soma - alvo)}</span>`}</td></tr></tfoot></table></div>
      ${bols.some(b => b.par < 0 && !b.apoio) ? `<div class="msg alerta">Boleto(s) sem documento de mesmo valor: ${bols.filter(b => b.par < 0).map(b => esc(b.f.name)).join(', ')}. Vão anexados ao primeiro documento.</div>` : ''}
      ${okSoma ? '' : '<div class="msg alerta">A soma dos documentos não bate com o valor a emitir. Corrija a leitura se errou; se enviar assim, a GSM vê o aviso.</div>'}
      <div class="linha"><button class="btn marca" id="nfm-env">Enviar ${docs.length} documentos</button><button class="btn sec" id="nfm-um">Enviar como uma NF só</button><button class="btn sec" id="nfm-canc">Cancelar</button></div><div id="nfm-msg"></div></div>`;
    box.querySelectorAll('input[data-m]').forEach(inp => inp.onchange = () => { const d = docs[+inp.dataset.i]; const k = inp.dataset.m;
      d[k] = k === 'valor' ? numBR(inp.value) : k === 'cnpj' ? digitos(inp.value) : inp.value.trim(); if (k === 'valor') desenha(); });
    $('#nfm-canc').onclick = () => { box.innerHTML = ''; };
    $('#nfm-um').onclick = () => { const d = docs[0]; formNF(d.f, c, alvo, files.filter(x => x !== d.f)); };
    $('#nfm-env').onclick = async () => {
      const b = $('#nfm-env'); const ruim = docs.find(d => !d.numero || !(Number(d.valor) > 0));
      if (ruim) { $('#nfm-msg').innerHTML = `<div class="msg erro">Informe número e valor de ${esc(ruim.f.name)}.</div>`; return; }
      b.disabled = true; const pasta = `${S.parc.id}/${c.mes.slice(0, 7)}/nf/`; const feitos = [];
      try {
        for (const [i, d] of docs.entries()) { if (d.enviado) continue;
          b.textContent = `Enviando ${i + 1} de ${docs.length}…`;
          const path = pasta + `${Date.now()}_${safeName(d.f.name)}`;
          const up = await sb.storage.from('envios').upload(path, d.f); if (up.error) throw new Error(`Falha ao guardar ${d.f.name}: ${up.error.message}`);
          const reg = await q(sb.rpc('registrar_nf', { p_comp: c.id, p_parceiro: S.previa ? S.parc.id : null, p_arquivo: path, p_numero: d.numero, p_cnpj: d.cnpj, p_valor: Number(d.valor), p_data: d.data || null,
            p_checagens: { texto: d.texto, ocr: false, cnpj_no_pdf: d.cnpjOk, tomador_gsm: d.tomador, numero_lido: d.numero || null, valor_lido: d.valor ?? null, multi: true, documentos: docs.length } }));
          const meus = bols.filter(x => x.par === i || (i === 0 && x.par < 0)); const lista = [];
          for (const x of meus) { const p = pasta + `${Date.now()}_${safeName(x.f.name)}`; const u = await sb.storage.from('envios').upload(p, x.f); if (u.error) throw new Error(`Falha ao guardar ${x.f.name}: ${u.error.message}`); lista.push({ path: p, nome: x.f.name, tipo: x.apoio ? 'DACTE' : 'Boleto' }); }
          if (lista.length) { const nid = reg?.id || (await q(sb.from('notas_fiscais').select('id').eq('arquivo_path', path).limit(1)))[0]?.id; if (nid) await q(sb.rpc('anexar_nf', { p_nf: nid, p_anexos: lista })); }
          d.enviado = true; feitos.push(d.numero);
        }
        secaoNF(c);
      } catch (e) { $('#nfm-msg').innerHTML = `<div class="msg erro">${esc(e.message)}${feitos.length ? ` Já enviados: ${esc(feitos.join(', '))}.` : ''}</div>`; b.disabled = false; b.textContent = 'Tentar de novo'; }
    };
  };
  desenha();
}

async function vNotas() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Notas fiscais</h1><p>NFs dos parceiros com valor aprovado. A NF sai pelo valor líquido (aprovado − adiantamento) e pode ser dividida em várias, desde que a soma bata. Confira cada uma; quando a soma conferida bater, o parceiro passa para "NF conferida".</p></div>${seletorComp(false)}</div>
  <div class="alterna" role="group" style="display:inline-flex;align-self:flex-start;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface);margin-bottom:6px">${[['conf', 'Conferência da GSM'], ['docs', 'Pasta de documentos e financeiro']].map(([k, t]) => `<button type="button" data-nm="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${(S.nfModo || 'conf') === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${t}</button>`).join('')}</div>
  <div id="nfs" class="carregando">Carregando…</div>`;
  ligarSeletor(vNotas);
  m.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => { S.nfModo = b.dataset.nm; vNotas(); });
  const c = comp();
  if (S.nfModo === 'docs') { const bx = $('#nfs'); bx.className = ''; S.docSt = S.docSt || {}; return documentosFin(bx, S.docSt, c, {}); }
  const [res0, nfs, parcs, fpag] = await Promise.all([
    todas(() => sb.from('nf_resumo').select('*').eq('competencia_id', c.id)),
    todas(() => sb.from('notas_fiscais').select('*').eq('competencia_id', c.id).eq('tipo', 'fechamento').order('enviado_em')),
    q(sb.from('parceiros').select('id,codigo,regiao,nome,cnpj,dia_pagamento')),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,antec_status,antec_data').eq('competencia_id', c.id)),
  ]);
  const pm = Object.fromEntries(parcs.map(p => [p.id, p]));
  const fpm = Object.fromEntries(fpag.map(f => [f.parceiro_id, f]));
  // Data de pagamento: antecipação liberada paga na data dela; os demais pelo dia de pagamento do cadastro
  const grupoPag = r => { const f = fpm[r.parceiro_id] || {}; if (f.antec_status === 'liberada') return { k: 'Antecipação' + (f.antec_data ? ' · ' + fmtD(f.antec_data) : ''), dt: f.antec_data || '0000' };
    const d = pm[r.parceiro_id]?.dia_pagamento; return { k: d || 'Sem dia cadastrado', dt: dataPagamento(d, c.mes) || '9999' }; };
  const GR = {}; res0.forEach(r => { const g = grupoPag(r); GR[g.k] = GR[g.k] || { dt: g.dt, n: 0, ok: 0, v: 0 }; GR[g.k].n++; GR[g.k].v += Number(r.valor_esperado || 0); if (r.situacao === 'conferida') GR[g.k].ok++; });
  const DIAS = Object.keys(GR).sort((x, y) => GR[x].dt.localeCompare(GR[y].dt));
  S.nfDia = S.nfDia || 'todos'; if (S.nfDia !== 'todos' && !GR[S.nfDia]) S.nfDia = 'todos';
  const res = res0.filter(r => S.nfDia === 'todos' || grupoPag(r).k === S.nfDia);
  S.nfFiltro = S.nfFiltro || 'todos';
  const cont = k => res.filter(r => r.situacao === k).length;
  const vis = res.filter(r => S.nfFiltro === 'todos' || r.situacao === S.nfFiltro).sort((a, b) => (pm[a.parceiro_id]?.regiao || '').localeCompare(pm[b.parceiro_id]?.regiao || ''));
  const soma = (k, f = () => true) => res.filter(f).reduce((a, r) => a + Number(r[k] || 0), 0);
  const chipsDia = res0.length ? `<section class="bloco" style="padding:12px 16px"><div class="linha" style="align-items:center;gap:8px"><b style="font-size:14px">Pagamento:</b>
      <button class="btn ${S.nfDia === 'todos' ? '' : 'sec'} peq" data-nd="todos">Todos (${res0.length})</button>
      ${DIAS.map(d => { const g = GR[d]; const dt = /^\d{4}-/.test(g.dt) && !d.startsWith('Antecipação') ? ' · ' + fmtD(g.dt) : '';
        return `<button class="btn ${S.nfDia === d ? '' : 'sec'} peq" data-nd="${esc(d)}" title="${g.ok} de ${g.n} com NF conferida · ${BRL2(g.v)}">${esc(d)}${dt} (${g.ok}/${g.n})</button>`; }).join('')}</div>
      <p class="nota" style="margin:8px 0 0">${S.nfDia === 'todos' ? 'Escolha a data para ver só quem recebe nela. Entre parênteses: NF conferida / parceiros aprovados.' : `<b>${GR[S.nfDia].ok} de ${GR[S.nfDia].n}</b> com NF conferida · líquido esperado ${BRL2(GR[S.nfDia].v)}.`}</p></section>` : '';
  $('#nfs').outerHTML = chipsDia + (res.length ? `
    <div class="kpis">
      <div class="kpi"><small>Valor líquido esperado</small><b>${BRL(soma('valor_esperado'))}</b><span>${res.length} parceiros aprovados</span></div>
      <div class="kpi ${cont('a_conferir') ? 'alerta' : 'neutro'}"><small>NFs a conferir</small><b>${cont('a_conferir')}</b><span>parceiros com NF nova</span></div>
      <div class="kpi ${cont('aguardando') ? 'alerta' : 'neutro'}"><small>Aguardando NF</small><b>${cont('aguardando')}</b><span>${BRL(soma('valor_esperado', r => r.situacao === 'aguardando'))}</span></div>
      <div class="kpi"><small>NF conferida</small><b>${cont('conferida')}</b><span>${BRL(soma('valor_conferido'))}</span></div>
    </div>
    <section class="bloco"><div class="linha">${[['todos', 'Todos', res.length], ['a_conferir', 'A conferir', cont('a_conferir')], ['aguardando', 'Aguardando NF', cont('aguardando')], ['faltando', 'Soma diferente', cont('faltando')], ['conferida', 'Conferidas', cont('conferida')]]
      .map(([k, n, qq]) => `<button class="btn ${S.nfFiltro === k ? '' : 'sec'} peq" data-nf="${k}">${n} (${qq})</button>`).join('')}</div>
    <div class="tabela"><table id="nftab"><thead><tr><th>Parceiro</th><th class="n">Aprovado</th><th class="n">Adiantado</th><th class="n">Líquido esperado</th><th>Nota fiscal</th><th class="n">Diferença</th><th>Situação</th><th></th></tr></thead><tbody>
    ${vis.map(r => { const p = pm[r.parceiro_id] || {}; const [rot, cls] = r.sem_nf ? ['Sem NF (valor confirmado)', 'escuro'] : SIT_NF[r.situacao] || [r.situacao, '']; const dif = Number(r.valor_nfs) - Number(r.valor_esperado);
      const minhas = nfs.filter(n => n.parceiro_id === r.parceiro_id);
      // Cada NF em bloco compacto dentro da célula; só os sinais de atenção ficam visíveis (os "ok" vão no título)
      const blocoNF = n => { const ck = n.checagens || {}; const [r2, k2] = ST_NF[n.status] || [n.status, ''];
        const ok = [ck.cnpj_confere !== false ? 'CNPJ confere' : '', ck.texto && ck.cnpj_no_pdf ? 'CNPJ no PDF' : '', ck.ocr ? 'lida pela imagem' : ''].filter(Boolean).join(' · ');
        const alertas = [ck.cnpj_confere === false ? '<span class="pill marca">CNPJ diferente do cadastro</span>' : '',
          ck.texto ? (ck.cnpj_no_pdf ? '' : '<span class="pill alerta">CNPJ não achado no PDF</span>') : '<span class="pill alerta">PDF sem texto: conferir visualmente</span>',
          ck.valor_confere_pdf === false ? `<span class="pill alerta">PDF mostra ${BRL2(ck.valor_lido)}</span>` : '',
          ck.tomador_gsm === false && ck.texto ? '<span class="pill alerta">GSM não aparece como tomador</span>' : '',
          ck.editado ? '<span class="pill alerta">Dados digitados diferentes do lido</span>' : ''].filter(Boolean).join(' ');
        return `<div style="font-size:13px;${minhas.length > 1 ? 'padding:4px 0;border-bottom:1px dashed var(--line)' : ''}" title="${esc(ok)}">NF <b>${esc(n.numero || 's/nº')}</b> · <b>${BRL2(n.valor)}</b>${minhas.length > 1 && n.status !== 'conferida' ? ` <span class="pill ${k2}">${r2}</span>` : ''}
          <br><span class="nota">emissão ${fmtD(n.data_emissao)} · enviada ${String(fmtDH(n.enviado_em)).replace(/\/\d{4},?/, '')}${n.arquivo_path ? ` · <a href="#" data-nfarq="${esc(n.arquivo_path)}">abrir PDF</a>` : ''}${(n.anexos || []).map(x => ` · <a href="#" data-nfarq="${esc(x.path)}" title="${esc(x.nome || '')}">${esc(x.tipo || 'Anexo')}</a>`).join('')}</span>
          ${alertas ? `<div style="margin-top:3px">${alertas}</div>` : ''}${n.motivo_recusa ? `<div class="nota">Recusa: ${esc(n.motivo_recusa)}</div>` : ''}</div>`; };
      const acoesNF = n => c.status === 'fechada' ? '' : `<div style="${minhas.length > 1 ? 'padding:4px 0' : ''}">${n.status === 'recebida' ? `<button class="btn peq" data-ok="${n.id}">Conferir</button> <button class="btn sec peq" data-rec="${n.id}">Recusar</button>` : `<button class="btn sec peq" data-reab="${n.id}">Desfazer</button>`}${minhas.length > 1 ? ` <span class="nota">NF ${esc(n.numero || '')}</span>` : ''}</div>`;
      return `<tr><td><b>${esc(p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.nome || '')} · ${esc(fmtCNPJ(p.cnpj))} · ${esc(grupoPag(r).k)}</span></td><td class="n">${BRL2(r.valor_aprovado)}</td><td class="n">${Number(r.adiantado) ? BRL2(r.adiantado) : '—'}</td><td class="n"><b>${BRL2(r.valor_esperado)}</b>${r.antec_status === 'liberada' && Number(r.antec_desconto) ? `<br><span class="nota">antecipação −${BRL2(r.antec_desconto)}</span>` : r.antec_status === 'solicitada' ? '<br><span class="nota">antecipação pedida</span>' : ''}</td>
        <td>${r.sem_nf ? '<span class="nota">Parceiro não emite NF: pagamento pela confirmação do valor</span>' : minhas.length ? minhas.map(blocoNF).join('') + (minhas.length > 1 ? `<span class="nota">${minhas.length} NFs · soma ${BRL2(r.valor_nfs)}</span>` : '') : '<span class="nota">—</span>'}</td>
        <td class="n" style="color:${Math.abs(dif) > 0.009 && r.nfs ? 'var(--brand-deep)' : 'var(--ink)'}">${r.nfs ? (dif > 0 ? '+' : '') + BRL2(dif) : '—'}</td><td><span class="pill ${cls}">${rot}</span></td>
        <td style="white-space:nowrap">${minhas.map(acoesNF).join('')}</td></tr>`; }).join('')}
    </tbody></table></div></section>` : '<div class="msg alerta">Nenhum parceiro com valor aprovado neste mês. A NF entra depois da aprovação em "Conferência e aprovação".</div>');
  m.querySelectorAll('[data-nf]').forEach(b => b.onclick = () => { S.nfFiltro = b.dataset.nf; vNotas(); });
  m.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => { S.nfDia = b.dataset.nd; vNotas(); });
  m.querySelectorAll('[data-nfarq]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const u = await linkArquivo(a.dataset.nfarq); if (u) window.open(u, '_blank'); });
  const run = async (b, args) => { b.disabled = true; try { await q(sb.rpc('conferir_nf', args)); vNotas(); } catch (e) { b.disabled = false; alertaTopo(e.message); } };
  m.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => run(b, { p_nf: b.dataset.ok, p_decisao: 'conferida' }));
  m.querySelectorAll('[data-reab]').forEach(b => b.onclick = () => run(b, { p_nf: b.dataset.reab, p_decisao: 'reabrir' }));
  m.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr'); if (tr.nextElementSibling?.classList.contains('extra')) { tr.nextElementSibling.remove(); return; }
    const l = document.createElement('tr'); l.className = 'extra';
    l.innerHTML = `<td colspan="8" style="background:var(--field)"><div class="linha"><input class="peq" id="rec-m" placeholder="Motivo da recusa (o parceiro vê)" style="flex:1;min-width:280px"><button class="btn peq" id="rec-ok">Recusar NF</button></div></td>`;
    tr.after(l); l.querySelector('#rec-ok').onclick = ev => run(ev.currentTarget, { p_nf: b.dataset.rec, p_decisao: 'recusada', p_motivo: l.querySelector('#rec-m').value });
  });
}

// ================= Conferência e aprovação (admin) =================
const ST_ENV = { recebido: ['Recebido', ''], validado: ['Sem pendências', 'escuro'], com_divergencias: ['Com pendências do parceiro', 'alerta'], aprovado: ['Aprovado', 'escuro'], recusado: ['Devolvido', 'marca'], substituido: ['Substituído', ''] };
const CAT_AJ = { antecipacao: 'Taxa de adiantamento (save)', repasse: 'Repasse de custo', penalidade: 'Penalidade', ajuste: 'Outro desconto' };
async function vConferencia() {
  const m = $('#main');
  if (S.confParc) return detalheConferencia();
  m.innerHTML = `<div class="topo"><div><h1>Conferência e aprovação</h1><p>Relatórios enviados pelos parceiros, já conferidos com o Umov. Decida cada item em aberto, registre ajustes e aprove o valor do mês. Nada é aprovado com item sem decisão.</p></div>${seletorComp(false)}</div><div id="conf" class="carregando">Carregando…</div>`;
  ligarSeletor(vConferencia);
  const c = comp();
  const [envs, fech, divs, movs] = await Promise.all([
    todas(() => sb.from('envios').select('id,parceiro_id,versao,enviado_em,status,totais').eq('competencia_id', c.id).neq('status', 'substituido').order('versao', { ascending: false })),
    todas(() => sb.from('fechamento_parceiro').select('parceiro_id,status,valor_aprovado,valor_final').eq('competencia_id', c.id)),
    todas(() => sb.from('divergencias').select('envio_id,situacao').eq('competencia_id', c.id).in('situacao', ['precisa_acao', 'em_analise'])),
    carregarMovs(c.id),
  ]);
  const mvU = {}; movs.forEach(x => { if (!mvU[x.parceiro_id]) mvU[x.parceiro_id] = x; });
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
    ${vis.map(({ p, e, pd, f }) => { const t = e?.totais || {}; const mv = mvU[p.id]; const [rot, cls] = e ? ST_ENV[e.status] || [e.status, ''] : mv ? [mv.status, grupoMov(mv.status) === 'gsm' ? 'marca' : grupoMov(mv.status) === 'ok' ? '' : 'alerta'] : ['Sem envio', ''];
      return `<tr><td><b>${esc(p.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(p.codigo)} · ${esc(p.nome)}</span></td>
      <td style="font-size:13px">${e ? `Envio ${e.versao}<br>${fmtDH(e.enviado_em)}` : '—'}</td>
      <td><span class="pill ${cls}">${esc(rot)}</span>${!e && mv ? `<br><span class="nota">${fmtD(mv.criado_em.slice(0, 10))}${mv.observacao ? ' · ' + esc(mv.observacao.slice(0, 50)) : ''}</span>` : ''}${f?.valor_aprovado != null && e?.status === 'aprovado' ? `<br><span class="nota">${BRL2(f.valor_aprovado)}</span>` : ''}</td>
      <td class="n">${e ? BRL2(t.total) : '—'}</td>
      <td class="n">${e ? `${fmtN(t.malote_qtd)} x ${fmtN(t.umov_qtd)}` : '—'}</td>
      <td class="n">${pd && (pd.acao + pd.analise) ? `${pd.acao ? `<span class="pill alerta">${pd.acao} com o parceiro</span> ` : ''}${pd.analise ? `<span class="pill marca">${pd.analise} com a GSM</span>` : ''}` : '—'}</td>
      <td style="white-space:nowrap">${e ? `<button class="btn ${e.status === 'aprovado' ? 'sec' : ''} peq" data-abrir="${p.id}">${e.status === 'aprovado' ? 'Ver' : 'Conferir'}</button>` : `<button class="btn sec peq" data-movc="${p.id}">Movimentar</button>`}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.confFiltro = b.dataset.f; vConferencia(); });
  m.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { S.confParc = b.dataset.abrir; detalheConferencia(); });
  m.querySelectorAll('[data-movc]').forEach(b => b.onclick = () => popMovimentacao(c, S.parceiros.find(x => x.id === b.dataset.movc), movs, vConferencia));
}

async function linkArquivo(path) { const { data } = await sb.storage.from('envios').createSignedUrl(path, 600); return data?.signedUrl; }

async function detalheConferencia() {
  const m = $('#main'); const c = comp(); const p = S.parceiros.find(x => x.id === S.confParc);
  m.innerHTML = '<div class="carregando">Carregando…</div>';
  const envs = await q(sb.from('envios').select('*').eq('competencia_id', c.id).eq('parceiro_id', p.id).order('versao', { ascending: false }));
  const e = envs.find(x => x.status !== 'substituido') || envs[0];
  avisoExtrasParceiro(m, c, p);
  const [divs, acoes, ajs, res, adisP] = await Promise.all([
    todas(() => sb.from('divergencias').select('*').eq('envio_id', e.id).order('operacao').order('ref_linha')),
    todas(() => sb.from('acoes_parceiro').select('*').eq('parceiro_id', p.id).order('criado_em')),
    q(sb.from('ajustes').select('*').eq('competencia_id', c.id).eq('parceiro_id', p.id).order('criado_em')),
    q(sb.rpc('resumo_aprovacao', { p_envio: e.id })),
    q(sb.from('adiantamentos').select('id,valor,taxa_pct,liberado_em,status').eq('competencia_id', c.id).eq('parceiro_id', p.id).in('status', ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'])),
  ]);
  // adiantamento liberado sem desconto e ainda sem taxa lançada no fechamento
  const taxaLancada = ajs.filter(a => a.categoria === 'antecipacao').reduce((s2, a) => s2 + Math.abs(Number(a.valor) || 0), 0);
  const semTaxa = (adisP || []).filter(a => !Number(a.taxa_pct)); const baseTaxa = semTaxa.reduce((s2, a) => s2 + Number(a.valor || 0), 0);
  const acPor = {}; acoes.forEach(a => (acPor[a.divergencia_id] = acPor[a.divergencia_id] || []).push(a));
  const t = e.totais || {}; const aberto = !['aprovado', 'recusado', 'substituido'].includes(e.status) && c.status !== 'fechada';
  const [rot, cls] = ST_ENV[e.status] || [e.status, ''];
  const desc = (Number(res.ajustes) || 0) - (Number(res.glosas) || 0);
  const final = (Number(res.malote) || 0) + (Number(res.kits) || 0) + (Number(res.fora) || 0) + desc;
  const ativos = divs.filter(d => d.situacao !== 'informativo'); const info = divs.filter(d => d.situacao === 'informativo');
  const linhaDiv = d => { const ac = acPor[d.id] || []; const pend = ['precisa_acao', 'em_analise'].includes(d.situacao);
    return `<tr data-d="${d.id}"><td style="white-space:nowrap">${esc(d.operacao)}</td><td class="num">${esc(d.ref_linha)}</td>
      <td>${esc(d.descricao)}${ac.map(a => `<div style="margin-top:6px;padding:6px 8px;background:var(--surface);border-left:3px solid var(--brand);font-size:13px"><b>Parceiro, ${fmtDH(a.criado_em)}:</b> ${esc(a.texto || '')}${a.arquivo_path ? ` <a href="#" data-arq="${esc(a.arquivo_path)}">abrir comprovante</a>` : ''}</div>`).join('')}
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
      <p class="sub">Descontos ou acréscimos que não vêm do relatório. Escolha o tipo: a taxa de adiantamento/antecipação entra como save na visão da diretoria; repasses, penalidades e outros entram em Descontos.</p>
      ${aberto && baseTaxa && !taxaLancada ? `<div class="msg alerta">Adiantamento de ${BRL2(baseTaxa)} liberado sem desconto neste mês. Lançar a taxa: <input id="tx-pct" class="peq" value="5" style="width:60px">% = <b id="tx-val">${BRL2(baseTaxa * 0.05)}</b> <button class="btn peq" id="tx-ok">Lançar taxa</button></div>` : ''}
      ${ajs.length ? `<div class="tabela"><table><thead><tr><th>Data</th><th>Operação</th><th>Tipo</th><th>Motivo</th><th class="n">Valor</th></tr></thead><tbody>${ajs.map(a => `<tr><td>${fmtD(a.criado_em)}</td><td>${esc(a.operacao)}</td><td>${esc(CAT_AJ[a.categoria] || a.tipo)}</td><td>${esc(a.motivo || '')}</td><td class="n">${BRL2(a.valor)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${aberto ? `<div class="linha"><select id="aj-op" class="peq"><option>Desconto</option><option>Malote</option><option>Kits/Spot</option><option>Fora do Umov</option></select>
        <select id="aj-tipo" class="peq"><option value="desconto:antecipacao">Taxa de adiantamento/antecipação (−, save)</option><option value="desconto:penalidade">Penalidade: embarque errado, extravio, multa (−)</option><option value="desconto:repasse">Repasse de custo: aluguel, locação, luz (−)</option><option value="desconto:ajuste" selected>Outro desconto (−)</option><option value="acrescimo:">Acréscimo (+)</option></select>
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
  const txp = $('#tx-pct'); if (txp) { txp.oninput = () => { $('#tx-val').textContent = BRL2(baseTaxa * (numBR(txp.value) || 0) / 100); };
    $('#tx-ok').onclick = () => { const pc = numBR(txp.value); if (!pc || pc <= 0 || pc >= 100) return erro(null, 'Percentual inválido.'); const v = Math.round(baseTaxa * pc) / 100;
      rodar($('#tx-ok'), () => q(sb.from('ajustes').insert({ competencia_id: c.id, parceiro_id: p.id, operacao: 'Desconto', tipo: 'desconto', categoria: 'antecipacao', valor: -v, motivo: `Desconto de ${String(pc).replace('.', ',')}% sobre adiantamento de ${BRL2(baseTaxa)}`, criado_por: S.user.id }))); }; }
  if (add) add.onclick = () => { const v = numBR($('#aj-valor').value); const mot = $('#aj-motivo').value.trim(); const [tipo, categoria] = $('#aj-tipo').value.split(':');
    if (v == null || Number.isNaN(v) || v <= 0) return erro(null, 'Informe o valor do ajuste (positivo; o tipo define o sinal).');
    if (!mot) return erro(null, 'Informe o motivo do ajuste.');
    rodar(add, () => q(sb.from('ajustes').insert({ competencia_id: c.id, parceiro_id: p.id, operacao: $('#aj-op').value, tipo, categoria: categoria || null, valor: tipo === 'desconto' ? -v : v, motivo: mot, criado_por: S.user.id }))); };
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
    <header style="background:var(--panel);color:var(--on-panel);border-left:8px solid var(--brand)">
      <div class="cab" style="max-width:1240px;margin:0 auto;padding:18px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <img src="logo_escuro.png" alt="GSM Log" style="height:34px;width:102px;object-fit:contain">
          <div><div class="eyebrow">Fechamento de última milha</div><div style="font-size:18px;font-weight:600">${S.perfil.papel === 'financeiro' ? 'Financeiro' : 'Diretoria'}</div></div>
        </div>
        <div class="cab-user" style="display:flex;gap:12px;align-items:center;font-size:13px;color:var(--on-dark)"><span class="cab-email" style="text-align:right">${esc(S.user.email)}<br><small style="opacity:.6">versão ${VERSAO}</small></span>
          ${temaBtn()}<button id="sair" style="font:inherit;font-size:13px;color:var(--on-panel);background:none;border:1px solid var(--panel-line);border-radius:6px;padding:8px 12px;cursor:pointer">Sair</button></div>
      </div>
    </header>
    <main id="main" style="max-width:1240px;width:100%;margin:0 auto"></main>
  </div>`;
  $('#sair').onclick = sair;
  vDiretoria($('#main'));
}

async function vDiretoria(el) {
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  const ok = await carregarDiretoria();
  if (!ok) { el.innerHTML = '<div class="msg alerta">Ainda não há fechamentos registrados.</div>'; return; }
  desenharDiretoria(el);
}
async function carregarDiretoria() {
  const [comps, parcs, fech, prev, efic, adis, ddet, spotTodos, nomesMes, quinz] = await Promise.all([
    q(sb.from('competencias').select('id,mes,status').order('mes')),
    q(sb.rpc('parceiros_resumo')),
    todas(() => sb.from('fechamento_parceiro').select('competencia_id,parceiro_id,status,malote,kits,fora_umov,descontos,valor_final,valor_aprovado,adiantado,antec_desconto,pago_em,data_pagamento,lote_id')),
    todas(() => sb.from('previsao_realizado').select('competencia_id,parceiro_id,previsto,origem_previsao,atendimentos_previstos,pontos')),
    todas(() => sb.from('dir_eficiencia').select('competencia_id,parceiro_id,pontos,atend_previstos,atend_umov')),
    todas(() => sb.from('adiantamentos').select('competencia_id,parceiro_id,valor,taxa_pct,valor_desconto,status')),
    todas(() => sb.from('descontos_detalhe').select('competencia_id,parceiro_id,categoria,descricao,cliente,valor,origem')).catch(() => []),
    todas(() => sb.rpc('dir_spot_todos')).catch(e => { console.error('dir_spot_todos', e); return []; }),
    todas(() => sb.from('parceiro_nome_mes').select('competencia_id,parceiro_id,nome,razao_social,cnpj')).catch(() => []),
    todas(() => sb.rpc('quinzenas_descobertas')).catch(() => []),
  ]);
  reclassificarSpot(fech, spotTodos || [], parcs);
  S.compsFechadas = new Set(comps.filter(c => c.status === 'fechada').map(c => c.id));
  const hojeMes = new Date().toISOString().slice(0, 7) + '-01';
  const comComDados = comps.filter(c => c.mes === hojeMes || fech.some(f => f.competencia_id === c.id) || prev.some(f => f.competencia_id === c.id && f.previsto != null));
  if (!comComDados.length) return false;
  S.dir = S.dir || {};
  const D = S.dir;
  D.comps = comComDados; D.parcs = parcs; D.fech = fech; D.prev = prev; D.efic = efic; D.adis = adis.filter(a => ['liberado', 'nf_recebida', 'enviado_financeiro', 'pago'].includes(a.status)); D.ddet = ddet || []; D.nomesMes = nomesMes || []; D.quinz = quinz || []; D.aba = D.aba || 'executivo';
  if (!D.compId || !comComDados.some(c => c.id === D.compId)) { const vig = comComDados.find(c => c.mes === hojeMes); if (vig) D.compId = vig.id; }
  if (!D.compId || !comComDados.some(c => c.id === D.compId)) { const fechadas = comComDados.filter(c => c.status === 'fechada' && fech.some(f => f.competencia_id === c.id)); const comFech = comComDados.filter(c => fech.some(f => f.competencia_id === c.id)); D.compId = (fechadas.length ? fechadas : comFech.length ? comFech : comComDados).slice(-1)[0].id; }
  D.op = D.op || 'tudo'; D.sort = D.sort || ['total', -1];
  return true;
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
  <div class="topo"><div><h1>Fechamento de ${nomeMes(c.mes)}</h1><p>${c.status === 'fechada' ? 'Competência fechada.' : 'Competência em andamento: os valores mudam até o fechamento.'} ${(D.aba === 'geral' || D.aba === 'executivo') ? 'Valores totais, já com descontos.' : `Valores por parceiro${op === 'tudo' ? ', já com descontos' : ''}.`}</p></div>
    <div class="linha">
      ${(D.aba === 'geral' || D.aba === 'executivo') ? '<button class="btn sec peq" id="dprint" style="min-height:44px">Imprimir / PDF</button>' : ''}<button class="btn marca peq" id="dtv" style="min-height:44px">Modo TV</button><button class="btn sec peq" id="dtvg" style="min-height:44px" title="Alterna a operação ao vivo com as telas da diretoria">TV carrossel</button>
      <div class="alterna" role="group" aria-label="Operação" style="display:${(D.aba === 'geral' || D.aba === 'executivo') ? 'none' : 'inline-flex'};border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">
        ${Object.entries(OPS).map(([k, n]) => `<button type="button" data-op="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${k === op ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}
      </div>
      <select id="dcomp" class="peq" style="min-height:44px;font-size:15px">${D.comps.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${nomeMes(x.mes)}</option>`).join('')}</select>
    </div></div>
  <div class="kpis" ${(D.aba === 'geral' || D.aba === 'executivo') ? 'style="display:none"' : ''}>
    <div class="kpi"><small>${OPS[op]} · ${nomeMes(c.mes)}</small><b>${BRL(total)}</b><span>${ant && total ? `${pct(total / totalAnt - 1)} sobre ${MES3[+ant.mes.slice(5, 7) - 1]}` : ''}</span></div>
    <div class="kpi ${nFech < linhas.length ? 'alerta' : ''}"><small>Parceiros fechados</small><b>${nFech} de ${linhas.length}</b><span>${Math.round(100 * nFech / Math.max(1, linhas.length))}% dos parceiros</span></div>
    <div class="kpi ${vFech < total ? 'alerta' : ''}"><small>Valor fechado</small><b>${BRL(vFech)}</b><span>${total ? Math.round(100 * vFech / total) : 0}% do valor do mês</span></div>
    ${kpiPrev(serieP.find(x => x.c.id === c.id))}
    <div class="kpi eco"><small>Descontos aplicados</small><b>${BRL(desc)}</b><span>no mês</span></div>
  </div>
  <nav class="abas" style="flex-wrap:wrap">${ABAS_DIR.filter(([k]) => S.perfil?.papel !== 'diretoria' || !SO_FIN.includes(k)).concat(S.perfil?.papel === 'financeiro' || S.perfil?.papel === 'admin' ? [['lotes', 'Lotes de pagamento']].concat(S.perfil?.papel === 'financeiro' ? [['docs', 'Notas fiscais']] : []) : []).map(([k, n]) => `<button type="button" data-aba="${k}" class="${D.aba === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
  <div data-sec="executivo" style="display:flex;flex-direction:column;gap:22px"><div id="dexec"></div></div>
  <div data-sec="geral" style="display:flex;flex-direction:column;gap:22px"><div id="dgeral"></div></div>
  <div data-sec="resumo" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><h2>2026 até ${nomeMes(c.mes)}</h2><div id="dano"></div></section>
  <section class="bloco"><h2>Evolução em 2026 · ${OPS[op]}</h2><div id="graf" style="position:relative"></div></section>
  <section class="bloco"><h2>Clientes de ${nomeMes(c.mes)}</h2><div id="dcli" class="carregando">Carregando…</div></section>
  <section class="bloco"><h2>Kits/Spot por cliente · ${nomeMes(c.mes)}</h2><p class="sub">Quanto cada cliente custou em kits e spots, comparado com ${ant ? nomeMes(ant.mes) : 'o mês anterior'}. Clique no cliente para ver os parceiros; clique no parceiro para ver cada kit (meses lançados pelo portal).</p><div id="dspot" class="carregando">Carregando…</div></section>
  </div>
  <div data-sec="variacao" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>O que mudou de ${ant ? nomeMes(ant.mes) : '—'} para ${nomeMes(c.mes)}</h2><div id="dponte" style="position:relative"></div></section></div>
  <div data-sec="eficiencia" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Custo unitário e execução · ${nomeMes(c.mes)}</h2><div id="defic"></div></section></div>
  <div data-sec="mapa" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Mapa de custos · ${nomeMes(c.mes)}</h2><p class="sub">Onde agir para reduzir custo. O custo de cada parceiro é dividido entre os estados pela quantidade de pontos que ele atende em cada um. Clique em um estado para ver os parceiros e a ação sugerida.</p><div id="dmapa"></div></section></div>
  <div data-sec="atendimentos" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Atendimentos · ${nomeMes(c.mes)}</h2><p class="sub">Malote: a mesma lista da aba Atendimentos da base de fechamento, cada ponto com o previsto, o realizado e os valores (o fixo do contrato não entra). Kits/Spot: cada kit do Umov com a situação e o valor.</p><div id="datend"></div></section></div>
  <div data-sec="lotes" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Quadro de pagamentos · ${nomeMes(c.mes)}</h2><div id="dquadro"></div></section><section class="bloco"><h2>Agenda de pagamentos · todas as competências</h2><div id="dagenda"></div></section><section class="bloco"><h2>Lotes de pagamento · ${nomeMes(c.mes)}</h2><p class="sub">Baixe a capa e as NFs de cada lote e registre o pagamento quando ele for feito.</p><div id="dlotes"></div></section></div>
  <div data-sec="docs" style="display:flex;flex-direction:column;gap:22px"><div id="ddocs"></div></div>
  <div data-sec="operacao" style="display:flex;flex-direction:column;gap:22px"><div id="doper"></div></div>
  <div data-sec="carteira" style="display:flex;flex-direction:column;gap:22px"><div id="dcart"><div class="carregando">Carregando…</div></div></div>
  <div data-sec="caixa" style="display:flex;flex-direction:column;gap:22px"><section class="bloco"><h2>Caixa e pagamentos · ${nomeMes(c.mes)}</h2><div id="dpag"></div></section></div>
  <div data-sec="previsto" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><h2>Projeção de custo · restante de 2026 e ano de 2027</h2><div id="pceo"><div class="carregando">Calculando a projeção…</div></div></section>
  <section class="bloco"><h2>Previsto (calendarizado) x Realizado · Malote</h2>
    <p class="sub">Previsto = valor fixo do contrato + atendimentos calendarizados de cada ponto × valor unitário. Realizado = malote fechado do parceiro. Kits/Spot não entram na previsão.</p>
    <div id="rprev"></div><div id="gprev" style="position:relative"></div><div id="tprev"></div></section>
  <section class="bloco"><h2>Projeção por parceiro até dezembro</h2>
    <p class="sub">Calculada com a carteira de pontos de hoje e as mesmas regras do previsto do mês: frequência de cada ponto × dias úteis (sem feriados nacionais) × valor unitário, mais o valor fixo do contrato. Entram as inclusões e cancelamentos já cadastrados com data futura.</p>
    <div id="pprev"><div class="carregando">Calculando a projeção…</div></div></section></div>
  <div data-sec="parceiros" style="display:flex;flex-direction:column;gap:22px">
  <section class="bloco"><div class="linha" style="justify-content:space-between"><h2>Parceiros</h2>
      <div class="linha"><input id="dfiltro" class="peq" placeholder="Filtrar parceiro" value="${esc(D.filtro || '')}" style="min-width:200px"><button class="btn sec peq" id="dcsv">Baixar tabela (CSV)</button></div></div>
    <div class="tabela"><table id="dtab"><thead><tr>
      ${[['regiao', 'Parceiro'], ['prev', 'Previsto', 1], ['malote', 'Malote', 1], ['dif', 'Malote − previsto', 1], ['kits', 'Kits/Spot', 1], ['desc', 'Descontos', 1], ['total', OPS[op] === 'Tudo' ? 'Total' : OPS[op], 1], ['varr', 'Var. mês', 1], ['dia', 'Pagamento'], ['status', 'Situação']]
        .map(([k, n, num]) => `<th class="${num ? 'n' : ''}" data-sort="${k}" style="cursor:pointer;white-space:nowrap">${n}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${tab.map(t => `<tr data-p="${t.id}" style="cursor:pointer">
        <td><b>${esc(t.regiao)}</b>${pillQ(pmap[t.id])}<br><span style="font-size:12px;color:var(--muted)">${esc(t.nome)}${t.tipo ? ' · ' + esc(t.tipo) : ''}</span></td>
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
  visaoGeral($('#dgeral'), D, c, ant);
  if (D.aba === 'executivo') resumoExecutivo($('#dexec'), D, c, ant);
  blocoAno($('#dano'), D, c);
  ponte($('#dponte'), D, c, ant);
  eficiencia($('#defic'), D, c);
  if (D.aba === 'lotes') { listaLotes($('#dlotes'), c.id, false); quadroPagamentos($('#dquadro'), c); agendaPagamentos($('#dagenda')); }
  if (D.aba === 'atendimentos') listaAtendimentos($('#datend'), D, c);
  if (D.aba === 'mapa') mapaCustos($('#dmapa'), D, c);
  if (D.aba === 'carteira') carteiraDir($('#dcart'), D);
  if (D.aba === 'operacao') vOperacao($('#doper'));
  if (D.aba === 'docs') documentosFin($('#ddocs'), D, c, { soAprovados: true });

  grafico($('#graf'), serie.map(x => ({ rot: MES3[+x.c.mes.slice(5, 7) - 1], v: x.v, atual: x.c.id === c.id, id: x.c.id })));
  pagamentos($('#dpag'), D.adis.filter(a => a.competencia_id === c.id), doMes(c.id).map(r => ({ dia: (pmap[r.parceiro_id] || {}).dia_pagamento || '—', total: valorOp(r, 'tudo'), adi: Number(r.adiantado) || 0, antec: Number(r.antec_desconto) || 0, pago: r.pago_em, fechado: fechado(r) })));
  if (D.proj === undefined && D.aba === 'previsto') { D.proj = null; todas(() => sb.rpc('projecao_previsto', {})).then(r => { D.proj = r; if (D.aba === 'previsto') desenharDiretoria(el); }).catch(e => { D.proj = { erro: e.message }; desenharDiretoria(el); }); }
  const proj = Array.isArray(D.proj) ? D.proj : [];
  const somaProj = m => proj.filter(r => r.mes === m).reduce((a, r) => a + Number(r.calendarizado), 0);
  const mesesProj = [...new Set(proj.map(r => r.mes))].filter(m => !D.comps.some(x => x.mes === m && somaPrev(x.id))).sort();
  // mês que já tem algum fechamento mas ainda não tem base: usa a projeção como previsto
  const serieComp = serieP.map(x => !x.p && mesesProj.includes(x.c.mes) ? { ...x, p: somaProj(x.c.mes), origem: 'projecao', proj: true, temReal: true } : x);
  const serieProj = mesesProj.filter(m => !D.comps.some(x => x.mes === m)).map(m => ({ c: { id: 'proj-' + m, mes: m }, p: somaProj(m), r: null, origem: 'projecao', proj: true }));
  graficoPrev($('#gprev'), $('#tprev'), serieComp.concat(serieProj), c.id);
  resumoAno($('#rprev'), serieComp.concat(serieProj), id => doMes(id).reduce((a, r) => a + (Number(r.kits) || 0) + (Number(r.fora_umov) || 0) + (Number(r.atend_extra) || 0), 0), Array.isArray(D.proj));
  projecaoParceiros($('#pprev'), D, proj, mesesProj);
  projecaoCEO($('#pceo'), D, proj, valorOp);
  clientesMes($('#dcli'), c.id, op, null);
  spotPorCliente($('#dspot'), c, ant);
  el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { D.op = b.dataset.op; desenharDiretoria(el); });
  $('#dcomp').onchange = e => { D.compId = e.target.value; desenharDiretoria(el); };
  const pr = $('#dprint'); if (pr) pr.onclick = () => window.print();
  const dtv = $('#dtv'); if (dtv) dtv.onclick = () => { if (S.perfil.papel === 'admin') location.hash = '#tvdir'; else vTvDir(); };
  const dtvg = $('#dtvg'); if (dtvg) dtvg.onclick = () => { if (S.perfil.papel === 'admin') location.hash = '#tvgeral'; else { S.tvGeral = true; S.view = 'tv'; S.tvSl = 0; vTv(); } };
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
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)" stroke-width="1"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="var(--muted)" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${pts.map((p, i) => { const x = L + i * bw + bw * 0.2, w = bw * 0.6, h = Math.max(0, y(0) - y(p.v));
      return `<g data-i="${i}"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>
        <path d="M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z" fill="${p.atual ? 'var(--brand)' : 'var(--ink)'}" opacity="${p.atual ? 1 : 0.82}"/>
        <text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="${p.atual ? 'var(--brand-deep)' : 'var(--muted)'}" font-weight="${p.atual ? 600 : 400}" font-family="Poppins">${p.rot}</text></g>`; }).join('')}
  </svg></div><div id="gtip" hidden style="position:absolute;pointer-events:none;background:var(--panel);color:var(--on-panel);font-size:13px;padding:8px 10px;border-radius:6px;white-space:nowrap"></div>`;
  const tip = box.querySelector('#gtip'); const svg = box.querySelector('svg');
  svg.querySelectorAll('g[data-i]').forEach(g => {
    g.onmousemove = e => { const p = pts[+g.dataset.i]; const ant = pts[+g.dataset.i - 1]; tip.hidden = false;
      tip.innerHTML = `<b>${p.rot}</b> · ${BRL(p.v)}${ant && ant.v ? `<br><span style="color:var(--on-dark)">${pct(p.v / ant.v - 1)} sobre ${ant.rot}</span>` : ''}`;
      const r = box.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 180) + 'px'; tip.style.top = (e.clientY - r.top - 50) + 'px'; };
    g.onmouseleave = () => tip.hidden = true;
    g.style.cursor = 'pointer';
    g.onclick = () => { S.dir.compId = pts[+g.dataset.i].id; desenharDiretoria(box.closest('main') || $('#main')); };
  });
}

// Projeção por parceiro dos meses que ainda não têm base (carteira atual)
// Dias úteis (seg–sex) sem feriados nacionais
const FERIADOS_NAC = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'];
function diasUteis(mes) { const [y, m] = mes.split('-').map(Number); let n = 0; for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) { const dt = new Date(y, m - 1, d); const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; if (dt.getDay() % 6 && !FERIADOS_NAC.includes(iso)) n++; } return n; }
// Projeção para a diretoria: 2026 (realizado + projetado) e 2027 (carteira de hoje, ajustada pelos dias úteis de cada mês)
const pctS = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
function projecaoCEO(box, D, proj, valorOp) {
  if (!box) return;
  if (D.proj && D.proj.erro) { box.innerHTML = `<div class="msg erro">${esc(D.proj.erro)}</div>`; return; }
  if (!Array.isArray(D.proj)) return;
  const n = v => Number(v) || 0;
  const ano = new Date().getFullYear() >= 2027 ? 2027 : 2026; const prox = ano + 1;
  const fechadas = D.comps.filter(c => c.status === 'fechada' && D.fech.some(f => f.competencia_id === c.id));
  // Kits/Spot por parceiro: média dos últimos 3 meses fechados
  const ult3 = fechadas.slice(-3); const kitsP = {};
  ult3.forEach(c => D.fech.filter(f => f.competencia_id === c.id).forEach(f => { kitsP[f.parceiro_id] = (kitsP[f.parceiro_id] || 0) + n(f.kits) / ult3.length; }));
  // Fora do Umov e atendimentos extras: média dos últimos 3 meses só do que foi cobrado (+); ajustes de fatura e adiantamento já pago (−) não se repetem
  const outMed = ult3.length ? ult3.reduce((a, c) => a + D.fech.filter(f => f.competencia_id === c.id).reduce((b, f) => b + Math.max(0, n(f.fora_umov)) + n(f.atend_extra), 0), 0) / ult3.length : 0;
  const kitsTot = Object.values(kitsP).reduce((a, x) => a + x, 0);
  // Crescimento de Kits/Spot: tendência linear do ano (R$ a mais por mês, pelos meses fechados do ano) ou % ao mês escolhido
  const fAno = fechadas.filter(c => c.mes.startsWith(String(ano)));
  const serieK = fAno.map(c => D.fech.filter(f => f.competencia_id === c.id).reduce((a, f) => a + n(f.kits), 0));
  const nk = serieK.length, xm = (nk - 1) / 2, ym = serieK.reduce((a, v) => a + v, 0) / (nk || 1);
  const slope = nk > 2 ? serieK.reduce((a, v, i) => a + (i - xm) * (v - ym), 0) / serieK.reduce((a, _, i) => a + (i - xm) ** 2, 0) : 0;
  const gSel = D.kitsG === undefined ? 'trend' : D.kitsG;
  const ultFech = fechadas.slice(-1)[0]?.mes; const mesesDesde = mes => ultFech ? (+mes.slice(0, 4) - +ultFech.slice(0, 4)) * 12 + (+mes.slice(5, 7) - +ultFech.slice(5, 7)) : 0;
  const fatorK = mes => { const k = Math.max(0, mesesDesde(mes) - 1); return gSel === 'trend' ? (kitsTot + Math.max(0, slope) * k) / (kitsTot || 1) : Math.pow(1 + Number(gSel), k); };
  const kitsMes = mes => kitsTot * fatorK(mes);
  const descMed = ult3.length ? ult3.reduce((a, c) => a + D.fech.filter(f => f.competencia_id === c.id).reduce((b, f) => b + n(f.descontos), 0), 0) / ult3.length : 0;
  // Execução histórica: malote realizado ÷ previsto (calendarizado) nos últimos 3 meses fechados que têm previsto
  const comPrev = fechadas.filter(c => D.prev.some(x => x.competencia_id === c.id && x.previsto != null)).slice(-3);
  const pS = comPrev.reduce((a, c) => a + D.prev.filter(x => x.competencia_id === c.id).reduce((b, x) => b + n(x.previsto), 0), 0);
  const rS = comPrev.reduce((a, c) => a + D.fech.filter(f => f.competencia_id === c.id).reduce((b, f) => b + n(f.malote_orig ?? f.malote), 0), 0);
  const exec = pS && rS ? Math.min(1.1, Math.max(0.8, rS / pS)) : 1;
  const mesesProj = [...new Set(proj.map(r => r.mes))].sort(); const ultP = mesesProj.slice(-1)[0];
  const base = proj.filter(r => r.mes === ultP); const duBase = diasUteis(ultP);
  const linhas = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, '0')}-01`; const comp = D.comps.find(c => c.mes === mes);
    if (comp && comp.status === 'fechada' && D.fech.some(f => f.competencia_id === comp.id)) {
      const fe = D.fech.filter(f => f.competencia_id === comp.id);
      linhas.push({ mes, origem: 'Realizado', fixo: null, varv: fe.reduce((a, f) => a + n(f.malote), 0), kits: fe.reduce((a, f) => a + n(f.kits), 0), outros: fe.reduce((a, f) => a + n(valorOp(f, 'tudo')) - n(f.malote) - n(f.kits) - n(f.descontos), 0), desc: fe.reduce((a, f) => a + n(f.descontos), 0), total: fe.reduce((a, f) => a + valorOp(f, 'tudo'), 0) });
    } else if (comp && D.fech.some(f => f.competencia_id === comp.id)) {
      // mês em andamento: parceiros já fechados pelo valor do fechamento; os demais pelo último mês fechado
      const fe = Object.fromEntries(D.fech.filter(f => f.competencia_id === comp.id).map(f => [f.parceiro_id, f]));
      const ultC = fechadas.slice(-1)[0]; const ultF = ultC ? D.fech.filter(f => f.competencia_id === ultC.id) : [];
      const ids = new Set([...Object.keys(fe), ...ultF.map(f => f.parceiro_id)]);
      let mal = 0, kt = 0, ot = 0, ds = 0, tt = 0, nF = 0;
      ids.forEach(id => { const f = fe[id] || ultF.find(x => x.parceiro_id === id); if (!f) return; if (fe[id]) nF++; mal += n(f.malote); kt += n(f.kits); ds += n(f.descontos); tt += valorOp(f, 'tudo'); ot += valorOp(f, 'tudo') - n(f.malote) - n(f.kits) - n(f.descontos); });
      linhas.push({ mes, origem: `Em andamento (${nF} fechados)`, fixo: null, varv: mal, kits: kt, outros: ot, desc: ds, total: tt });
    } else if (comp && D.prev.some(x => x.competencia_id === comp.id && x.previsto != null)) {
      const pv = D.prev.filter(x => x.competencia_id === comp.id && x.previsto != null).reduce((a, x) => a + n(x.previsto), 0) * exec;
      linhas.push({ mes, origem: 'Previsto (base do mês)', fixo: null, varv: pv, kits: kitsMes(mes), outros: outMed, desc: descMed, total: pv + kitsMes(mes) + outMed + descMed });
    } else if (proj.some(r => r.mes === mes)) {
      const rs = proj.filter(r => r.mes === mes); const fx = rs.reduce((a, r) => a + n(r.valor_fixo), 0) * exec, cal = rs.reduce((a, r) => a + n(r.calendarizado), 0) * exec;
      linhas.push({ mes, origem: 'Projeção', fixo: fx, varv: cal - fx, kits: kitsMes(mes), outros: outMed, desc: descMed, total: cal + kitsMes(mes) + outMed + descMed });
    }
  }
  const lin2 = []; const porParc = {};
  for (let m = 1; m <= 12; m++) {
    const mes = `${prox}-${String(m).padStart(2, '0')}-01`; const f = duBase ? diasUteis(mes) / duBase : 1;
    let fx = 0, vv = 0; base.forEach(r => { const a = n(r.valor_fixo) * exec, b = (n(r.calendarizado) - n(r.valor_fixo)) * f * exec; fx += a; vv += b; const pp = porParc[r.parceiro_id] || (porParc[r.parceiro_id] = { fixo: 0, varv: 0, kits: 0 }); pp.fixo += a; pp.varv += b; pp.kits += (kitsP[r.parceiro_id] || 0) * fatorK(mes); });
    lin2.push({ mes, origem: 'Projeção', du: diasUteis(mes), fixo: fx, varv: vv, kits: kitsMes(mes), outros: outMed, desc: descMed, total: fx + vv + kitsMes(mes) + outMed + descMed });
  }
  const sum = (ls, k) => ls.reduce((a, x) => a + n(x[k]), 0);
  const realAno = linhas.filter(x => x.origem === 'Realizado'), restAno = linhas.filter(x => x.origem !== 'Realizado');
  const tot26 = sum(linhas, 'total'), tot27 = sum(lin2, 'total');
  const mx = Math.max(...linhas.concat(lin2).map(x => x.total), 1);
  const malX = x => n(x.fixo) + n(x.varv), pMal = x => { const b = malX(x) + n(x.kits); return b ? malX(x) / b : 0; };
  const barras = linhas.concat(lin2).map(x => { const h = Math.round(150 * x.total / mx), hk = Math.round(h * (1 - pMal(x)));
    return `<div title="${nomeMes(x.mes)}: ${BRL(x.total)} (${x.origem}) · malote ${pctS(pMal(x))} · kits/spot ${pctS(1 - pMal(x))}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0"><div style="width:100%;height:${h}px;display:flex;flex-direction:column;border-radius:4px 4px 0 0;overflow:hidden"><div style="height:${hk}px;background:var(--alert)"></div><div style="flex:1;background:${x.origem === 'Realizado' ? 'var(--ink)' : x.mes.startsWith(String(prox)) ? 'var(--num-light, #F0C2CC)' : 'var(--brand)'}"></div></div><span style="font-size:10px;color:var(--muted)">${MES3[+x.mes.slice(5, 7) - 1]}${x.mes.slice(5, 7) === '01' ? '/' + x.mes.slice(2, 4) : ''}</span></div>`; }).join('');
  const compo = (m, k) => { const b = m + k, p = b ? m / b : 0; return `<div style="display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--rule);min-width:90px"><span style="width:${(p * 100).toFixed(1)}%;background:var(--ink)"></span><span style="flex:1;background:var(--alert)"></span></div><span style="font-size:12px;white-space:nowrap">malote <b>${pctS(p)}</b> · spot <b>${pctS(1 - p)}</b></span>`; };
  const kpi = (r, v, s) => `<div style="flex:1;min-width:170px;border:1px solid var(--rule);border-radius:10px;padding:12px 14px;background:var(--surface)"><span style="font-size:12px;color:var(--muted)">${r}</span><b style="display:block;font-size:22px">${v}</b><span style="font-size:12px;color:var(--muted)">${s}</span></div>`;
  const tab = (ls) => `<div class="tabela"><table><thead><tr><th>Mês</th><th>Origem</th><th class="n">Malote fixo</th><th class="n">Malote variável</th><th class="n">Kits/Spot</th><th class="n">Fora do Umov, extras e ajustes</th><th class="n">Descontos</th><th class="n">Total</th><th>Malote × Spot</th></tr></thead><tbody>
    ${ls.map(x => `<tr><td><b>${nomeMes(x.mes)}</b>${x.du ? `<br><span class="nota">${x.du} dias úteis</span>` : ''}</td><td><span class="pill ${x.origem === 'Realizado' ? 'escuro' : ''}">${x.origem}</span></td><td class="n">${x.fixo == null ? '—' : BRL(x.fixo)}</td><td class="n">${x.fixo == null ? BRL(x.varv) + '<br><span class="nota">malote total</span>' : BRL(x.varv)}</td><td class="n">${BRL(x.kits)}</td><td class="n">${BRL(x.outros)}</td><td class="n">${BRL(x.desc)}</td><td class="n"><b>${BRL(x.total)}</b></td><td>${compo(malX(x), n(x.kits))}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td class="n"><b>${BRL(sum(ls, 'fixo'))}</b></td><td class="n"><b>${BRL(sum(ls, 'varv'))}</b><br><span class="nota">malote total ${BRL(sum(ls, 'fixo') + sum(ls, 'varv'))}</span></td><td class="n"><b>${BRL(sum(ls, 'kits'))}</b><br><span class="nota">${sum(ls, 'total') ? pctS(sum(ls, 'kits') / sum(ls, 'total')) : '—'} do total</span></td><td class="n"><b>${BRL(sum(ls, 'outros'))}</b></td><td class="n"><b>${BRL(sum(ls, 'desc'))}</b></td><td class="n"><b>${BRL(sum(ls, 'total'))}</b></td><td>${compo(sum(ls, 'fixo') + sum(ls, 'varv'), sum(ls, 'kits'))}</td></tr></tfoot></table></div>`;
  box.innerHTML = `<div class="linha" style="gap:10px;flex-wrap:wrap">
      ${kpi(`${ano} fechado (realizado + projeção)`, BRL(tot26), `${realAno.length} meses realizados · ${restAno.length} projetados`)}
      ${kpi(`Restante de ${ano}`, BRL(sum(restAno, 'total')), restAno.map(x => MES3[+x.mes.slice(5, 7) - 1]).join(', ') || '—')}
      ${kpi(`Projeção ${prox}`, BRL(tot27), `média ${BRL(tot27 / 12)}/mês · malote ${pctS((sum(lin2, 'fixo') + sum(lin2, 'varv')) / ((sum(lin2, 'fixo') + sum(lin2, 'varv') + sum(lin2, 'kits')) || 1))} · spot ${pctS(sum(lin2, 'kits') / ((sum(lin2, 'fixo') + sum(lin2, 'varv') + sum(lin2, 'kits')) || 1))}`)}
      ${kpi(`${prox} × ${ano}`, pct(tot26 ? tot27 / tot26 - 1 : null), 'com a carteira de hoje, sem reajustes')}</div>
    <div class="linha" style="gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center"><span style="font-size:13px"><b>Crescimento de Kits/Spot:</b></span>
      <div class="alterna" role="group" aria-label="Crescimento de Kits/Spot" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${[['trend', `Tendência ${ano} (+${BRL(Math.max(0, slope))}/mês)`], ['0', 'Sem crescimento'], ['0.01', '1%/mês'], ['0.02', '2%/mês'], ['0.03', '3%/mês'], ['0.05', '5%/mês']].map(([v, t]) => `<button type="button" class="btn ${String(gSel) === v ? '' : 'sec'} peq" data-kg="${v}">${t}</button>`).join('')}</div>
      <span class="nota">Kits/Spot em ${ano}: ${serieK.map((v, i) => `${MES3[+fAno[i].mes.slice(5, 7) - 1]} ${BRL(v)}`).join(' · ')}. Com a opção escolhida, Dez/${String(prox).slice(2)} fica em ${BRL(kitsMes(`${prox}-12-01`))}/mês.</span></div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:180px;margin:18px 0 6px">${barras}</div>
    <p class="nota">Escuro: realizado · vermelho: projeção ${ano} · rosa: projeção ${prox} · amarelo no topo de cada barra: parte de Kits/Spot. O percentual de malote e spot é sobre malote + kits/spot, sem fora do Umov, ajustes e descontos.</p>
    <details open><summary style="cursor:pointer;font-weight:600;margin:10px 0">${ano} mês a mês</summary>${tab(linhas)}</details>
    <details><summary style="cursor:pointer;font-weight:600;margin:10px 0">${prox} mês a mês</summary>${tab(lin2)}</details>
    <div class="linha" style="margin-top:10px"><button class="btn sec peq" id="pceox">Baixar Excel</button></div>
    <p class="nota">Como é calculado: meses fechados usam o realizado. Meses com base gerada usam o previsto do portal. Os demais usam a projeção da carteira de hoje (frequência de cada ponto × dias úteis × valor unitário, mais o fixo de cada contrato). ${prox}: a carteira de ${nomeMes(ultP)} repetida, com a parte variável ajustada pelos dias úteis de cada mês (feriados nacionais) e o fixo constante. Malote projetado × ${(exec * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% (o que foi pago de malote em relação ao calendarizado nos últimos 3 meses fechados). Kits/Spot: parte da média dos últimos 3 meses fechados (${BRL(kitsTot)}/mês) e cresce ${gSel === 'trend' ? `${BRL(Math.max(0, slope))} por mês (tendência linear dos meses fechados de ${ano})` : `${pctS(Number(gSel))} ao mês (percentual escolhido)`}. Kits/Spot é o mesmo valor da Visão geral (só kits e spot). Fora do Umov, extras e ajustes: no realizado, o que foi lançado (serviços fora do Umov, atendimentos extras, ajustes de fatura e adiantamento já pago); nos meses projetados, a média dos últimos 3 meses só do que foi cobrado (${BRL(outMed)}/mês). Descontos: média dos últimos 3 meses (${BRL(descMed)}/mês). Não considera reajustes, novos clientes, cancelamentos futuros ainda não cadastrados nem as reduções de "Onde negociar".</p>`;
  box.querySelectorAll('[data-kg]').forEach(b => b.onclick = () => { D.kitsG = b.dataset.kg; projecaoCEO(box, D, proj, valorOp); });
  $('#pceox').onclick = () => {
    const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
    const mesL = x => ({ 'Mês': nomeMes(x.mes), 'Origem': x.origem, 'Dias úteis': x.du || diasUteis(x.mes), 'Malote fixo': x.fixo == null ? '' : Math.round(x.fixo * 100) / 100, 'Malote variável (ou total no realizado)': Math.round(x.varv * 100) / 100, 'Kits/Spot': Math.round(x.kits * 100) / 100, 'Fora do Umov, extras e ajustes': Math.round(n(x.outros) * 100) / 100, 'Descontos': Math.round(x.desc * 100) / 100, 'Total': Math.round(x.total * 100) / 100, '% Malote': Math.round(pMal(x) * 1000) / 10, '% Kits/Spot': Math.round((1 - pMal(x)) * 1000) / 10 });
    baixarXlsx(`Projecao_${ano}_${prox}.xlsx`, { titulo: `Projeção de custo ${ano} e ${prox}`, sub: 'Última milha · parceiros', abas: [
      { nome: `${ano}`, linhas: linhas.map(mesL) }, { nome: `${prox}`, linhas: lin2.map(mesL) },
      { nome: `${prox} por parceiro`, linhas: Object.entries(porParc).map(([id, x]) => ({ 'Parceiro': pm[id]?.nome || '', 'Região': pm[id]?.regiao || '', 'Tipo': pm[id]?.tipo || '', 'Fixo no ano': Math.round(x.fixo * 100) / 100, 'Variável no ano': Math.round(x.varv * 100) / 100, 'Kits/Spot no ano (média)': Math.round(x.kits * 100) / 100, 'Total no ano': Math.round((x.fixo + x.varv + x.kits) * 100) / 100 })).sort((a, b) => b['Total no ano'] - a['Total no ano']) }] });
  };
}

function projecaoParceiros(box, D, proj, meses) {
  if (!box) return;
  if (D.proj && D.proj.erro) { box.innerHTML = `<div class="msg erro">${esc(D.proj.erro)}</div>`; return; }
  if (!Array.isArray(D.proj)) return;
  if (!meses.length) { box.innerHTML = '<p class="nota">Todos os meses até dezembro já têm base gerada.</p>'; return; }
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const ultimo = D.comps.filter(x => D.fech.some(f => f.competencia_id === x.id)).slice(-1)[0];
  const ult = ultimo ? Object.fromEntries(D.fech.filter(f => f.competencia_id === ultimo.id).map(f => [f.parceiro_id, Number(f.malote) || 0])) : {};
  const ids = [...new Set(proj.map(r => r.parceiro_id))];
  const v = (id, m, k = 'calendarizado') => { const r = proj.find(x => x.parceiro_id === id && x.mes === m); return r ? Number(r[k]) : 0; };
  D.projSort = D.projSort || ['total', -1];
  const linhas = ids.map(id => ({ id, regiao: pm[id]?.regiao || '—', nome: pm[id]?.nome || '', tipo: pm[id]?.tipo || '', ult: ult[id], meses: meses.map(m => v(id, m)), atend: meses.map(m => v(id, m, 'atendimentos_previstos')), fixo: v(id, meses[0], 'valor_fixo') }))
    .map(l => ({ ...l, total: l.meses.reduce((a, x) => a + x, 0) }));
  const [sk, sd] = D.projSort; linhas.sort((a, b) => sk === 'regiao' ? sd * a.regiao.localeCompare(b.regiao) : sd * ((a[sk] ?? 0) - (b[sk] ?? 0)));
  const tot = meses.map((_, i) => linhas.reduce((a, l) => a + l.meses[i], 0));
  box.innerHTML = `<div class="linha" style="justify-content:space-between"><span class="nota">${linhas.length} parceiros · ${meses.map(nomeMes).join(', ')}</span><button class="btn sec peq" id="pjx">Baixar Excel</button></div>
    <div class="tabela"><table><thead><tr><th data-ps="regiao" style="cursor:pointer">Parceiro</th><th class="n" data-ps="fixo" style="cursor:pointer">Fixo do contrato</th>${ultimo ? `<th class="n" data-ps="ult" style="cursor:pointer">Malote ${MES3[+ultimo.mes.slice(5, 7) - 1]} (realizado)</th>` : ''}${meses.map(m => `<th class="n">${MES3[+m.slice(5, 7) - 1]} (projeção)</th>`).join('')}<th class="n" data-ps="total" style="cursor:pointer">Total projetado</th></tr></thead><tbody>
    ${linhas.map(l => `<tr><td><b>${esc(l.regiao)}</b><br><span style="font-size:12px;color:var(--muted)">${esc(l.nome)}${l.tipo ? ' · ' + esc(l.tipo) : ''}</span></td><td class="n">${l.fixo ? BRL(l.fixo) : '—'}</td>${ultimo ? `<td class="n" style="color:var(--muted)">${l.ult != null ? BRL(l.ult) : '—'}</td>` : ''}
      ${l.meses.map((x, i) => `<td class="n">${BRL(x)}<br><span style="font-size:12px;color:var(--muted)">${fmtN(l.atend[i])} atend.</span></td>`).join('')}<td class="n"><b>${BRL(l.total)}</b></td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${BRL(linhas.reduce((a, l) => a + l.fixo, 0))}</b></td>${ultimo ? `<td class="n"><b>${BRL(linhas.reduce((a, l) => a + (l.ult || 0), 0))}</b></td>` : ''}${tot.map(t => `<td class="n"><b>${BRL(t)}</b></td>`).join('')}<td class="n"><b>${BRL(tot.reduce((a, t) => a + t, 0))}</b></td></tr></tfoot></table></div>
    <p class="nota">A projeção muda conforme a carteira muda: quando a base de um mês é gerada, aquele mês passa a usar o previsto do portal. Kits/Spot não entram na previsão.</p>`;
  box.querySelectorAll('[data-ps]').forEach(th => th.onclick = () => { const k = th.dataset.ps; D.projSort = [k, D.projSort[0] === k ? -D.projSort[1] : (k === 'regiao' ? 1 : -1)]; projecaoParceiros(box, D, proj, meses); });
  $('#pjx').onclick = () => {
    const rows = linhas.map(l => { const o = { 'Parceiro': l.nome, 'Região': l.regiao, 'Tipo': l.tipo, 'Fixo do contrato': l.fixo };
      if (ultimo) o[`Malote ${nomeMes(ultimo.mes)} (realizado)`] = l.ult ?? null;
      meses.forEach((m, i) => { o[`${nomeMes(m)} - atendimentos`] = l.atend[i]; o[`${nomeMes(m)} - previsto`] = l.meses[i]; }); o['Total projetado'] = l.total; return o; });
    baixarXlsx(`Projecao_previsto_ate_${meses.slice(-1)[0].slice(0, 7)}.xlsx`, { titulo: 'Projeção do previsto por parceiro', sub: `${nomeMes(meses[0])} a ${nomeMes(meses.slice(-1)[0])}`, abas: [{ nome: 'Projeção', linhas: rows }] });
  };
}

// Ano: realizado + previsto até dezembro, para ver se a média se mantém
function resumoAno(box, pts, kitsDe, projPronta) {
  if (!box) return;
  const ano = (pts.find(p => !p.proj) || pts[0])?.c.mes.slice(0, 4);
  const doAno = pts.filter(p => p.c.mes.slice(0, 4) === ano);
  const fechou = p => !p.proj && p.r != null && (S.compsFechadas ? S.compsFechadas.has(p.c.id) : true);
  const feitos = doAno.filter(fechou), abertos = doAno.filter(p => !fechou(p) && p.p);
  if (!feitos.length) { box.innerHTML = ''; return; }
  const real = feitos.reduce((a, p) => a + p.r, 0), prevFeitos = feitos.reduce((a, p) => a + (p.p || 0), 0);
  const resto = abertos.reduce((a, p) => a + p.p, 0);
  const mReal = real / feitos.length, mResto = abertos.length ? resto / abertos.length : null;
  const estimado = real + resto, prevAno = prevFeitos + resto;
  const exec = prevFeitos ? real / prevFeitos : 1; const ajustado = real + resto * exec;
  const kitsReal = feitos.reduce((a, p) => a + kitsDe(p.c.id), 0); const kitsMedia = kitsReal / feitos.length;
  const totalAno = ajustado + kitsReal + kitsMedia * abertos.length;
  const varMedia = mResto != null && mReal ? (mResto * exec) / mReal - 1 : null;
  const ult = feitos.slice(-1)[0], ultAb = abertos.slice(-1)[0];
  const mesesTxt = (a, b) => a && b ? `${MES3[+a.c.mes.slice(5, 7) - 1]} a ${MES3[+b.c.mes.slice(5, 7) - 1]}` : '';
  const leitura = varMedia == null ? 'Sem meses em aberto até dezembro.' : Math.abs(varMedia) <= 0.02 ? `Com a execução do ano, a média dos meses em aberto fica praticamente igual à realizada (${pct(varMedia)}): o ano mantém a média.` : varMedia > 0 ? `Com a execução do ano, a média dos meses em aberto fica ${pct(varMedia)} acima da realizada: o custo mensal tende a subir até dezembro.` : `Com a execução do ano, a média dos meses em aberto fica ${pct(varMedia)} abaixo da realizada: o custo mensal tende a cair até dezembro.`;
  box.innerHTML = `<div class="kpis" style="margin-bottom:6px">
      <div class="kpi"><small>Realizado ${mesesTxt(feitos[0], ult)}</small><b>${BRL(real)}</b><span>média ${BRL(mReal)} por mês</span></div>
      <div class="kpi neutro"><small>Previsto ${abertos.length ? mesesTxt(abertos[0], ultAb) : '—'}</small><b>${abertos.length ? BRL(resto) : '—'}</b><span>${mResto != null ? `média ${BRL(mResto)}/mês; com a execução do ano, ${BRL(mResto * exec)} (${pct(varMedia)} sobre a média realizada)` : projPronta ? 'nenhum mês em aberto' : 'calculando a projeção…'}</span></div>
      <div class="kpi"><small>Ano ${ano} · realizado + previsto</small><b>${BRL(estimado)}</b><span>previsto do ano todo ${BRL(prevAno)} (${pct(estimado / prevAno - 1)})</span></div>
      <div class="kpi ${exec < 1 ? '' : 'alerta'}"><small>Se mantiver a execução do ano (${pct(exec - 1)})</small><b>${BRL(ajustado)}</b><span>${BRL(ajustado - prevAno)} contra o previsto do ano</span></div>
      <div class="kpi neutro"><small>Custo total estimado do ano</small><b>${BRL(totalAno)}</b><span>malote ajustado + Kits/Spot, fora do Umov, extras e ajustes (${BRL(kitsReal)} realizado + média ${BRL(kitsMedia)}/mês)</span></div>
    </div>
    <p class="nota" style="margin:0 0 12px">${leitura} Execução do ano = malote realizado ÷ previsto nos meses fechados; aplicada aos meses em aberto, dá o valor provável até dezembro.</p>`;
}

// ================= Mapa de custos por estado =================
async function carregarMapa(D, c) {
  D.mapa = D.mapa || {};
  const [rows, contr] = await Promise.all([todas(() => sb.rpc('mapa_uf', { p_comp: c.id })), D.contr ? Promise.resolve(D.contr) : q(sb.from('contratos').select('parceiro_id,valor_fixo,inicio,fim'))]);
  D.contr = contr; D.mapa[c.id] = rows;
}
// Fixo pago por atendimento previsto que não aconteceu (undefined = ainda não carregado; null = sem dado)
function potencialMes(D, c) {
  if (!D.mapa || !D.mapa[c.id] || !D.contr) return undefined;
  const n = v => Number(v) || 0; const rows = D.mapa[c.id]; let tot = 0, tem = false;
  D.fech.filter(f => f.competencia_id === c.id).forEach(f => { const rs = rows.filter(r => r.parceiro_id === f.parceiro_id); const prev = rs.reduce((a, r) => a + n(r.atend_previsto), 0), real = rs.reduce((a, r) => a + n(r.atend_realizado), 0);
    const k = D.contr.filter(x => x.parceiro_id === f.parceiro_id && x.inicio <= c.mes && (!x.fim || x.fim >= c.mes)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
    if (prev && k) { tem = true; tot += n(k.valor_fixo) * Math.max(0, 1 - real / prev); } });
  return tem ? tot : null;
}
const MAPA_MET = [['potencial', 'Onde agir (potencial de redução)'], ['custo', 'Custo do mês'], ['cpa', 'Custo por atendimento'], ['exec', 'Execução (realizado ÷ previsto)']];
async function mapaCustos(box, D, c) {
  if (!box) return;
  D.mapa = D.mapa || {};
  if (!D.mapa[c.id]) {
    box.innerHTML = '<div class="carregando">Montando o mapa…</div>';
    try { await carregarMapa(D, c); } catch (e) { box.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; return; }
  }
  const rows = D.mapa[c.id]; const n = v => Number(v) || 0;
  const fech = D.fech.filter(f => f.competencia_id === c.id);
  if (!fech.length || !rows.length) { box.innerHTML = '<p class="nota">Este mês ainda não tem fechamento ou base de pontos para montar o mapa.</p>'; return; }
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const prevP = Object.fromEntries(D.prev.filter(x => x.competencia_id === c.id && x.previsto != null).map(x => [x.parceiro_id, n(x.previsto)]));
  const fixoDe = id => { const k = (D.contr || []).filter(x => x.parceiro_id === id && x.inicio <= c.mes && (!x.fim || x.fim >= c.mes)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0]; return k ? n(k.valor_fixo) : 0; };
  // por parceiro
  const P = {};
  fech.forEach(f => { const rs = rows.filter(r => r.parceiro_id === f.parceiro_id); const prev = rs.reduce((a, r) => a + n(r.atend_previsto), 0), real = rs.reduce((a, r) => a + n(r.atend_realizado), 0);
    const malote = n(f.malote), kits = n(f.kits) + n(f.fora_umov) + n(f.atend_extra), custo = valorOp(f, 'tudo'); const fixo = fixoDe(f.parceiro_id);
    const exec = prev ? real / prev : null; const ocioso = fixo && exec != null ? fixo * Math.max(0, 1 - exec) : 0; const acima = prevP[f.parceiro_id] != null ? Math.max(0, malote - prevP[f.parceiro_id]) : 0;
    P[f.parceiro_id] = { id: f.parceiro_id, p: pm[f.parceiro_id] || {}, rs, prev, real, malote, kits, custo, fixo, exec, ocioso, acima, potencial: ocioso + acima, cpa: real ? (malote + kits) / real : null }; });
  const nac = (() => { const ls = Object.values(P).filter(x => x.real); const a = ls.reduce((s, x) => s + x.malote + x.kits, 0), b = ls.reduce((s, x) => s + x.real, 0); return b ? a / b : null; })();
  // por estado
  const U = {};
  Object.values(P).forEach(x => x.rs.forEach(r => { const w = n(r.peso); const u = U[r.uf] || (U[r.uf] = { uf: r.uf, custo: 0, potencial: 0, ocioso: 0, acima: 0, prev: 0, real: 0, mk: 0, parc: new Set() });
    u.custo += x.custo * w; u.potencial += x.potencial * w; u.ocioso += x.ocioso * w; u.acima += x.acima * w; u.prev += n(r.atend_previsto); u.real += n(r.atend_realizado); u.mk += (x.malote + x.kits) * w; u.parc.add(x.id); }));
  Object.values(U).forEach(u => { u.exec = u.prev ? u.real / u.prev : null; u.cpa = u.real ? u.mk / u.real : null; });
  const met = D.mapaMet = D.mapaMet || 'potencial';
  const val = u => met === 'exec' ? u.exec : u[met];
  const vals = Object.values(U).map(val).filter(v => v != null && isFinite(v));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // escuro = pede mais atenção (na execução, quanto menor, mais escuro)
  const inten = v => v == null || hi === lo ? 0.15 : met === 'exec' ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
  const cor = v => v == null ? 'var(--ok-bg)' : `rgba(219,34,66,${(0.08 + 0.85 * inten(v)).toFixed(3)})`;
  const fmt = v => v == null ? '—' : met === 'exec' ? pct(v - 1).replace('+', '') + ' do previsto' .replace(' do previsto', '') : met === 'cpa' ? BRL2(v) : BRL(v);
  const fmtExec = v => v == null ? '—' : (100 * v).toFixed(1).replace('.', ',') + '%';
  const fmtV = v => met === 'exec' ? fmtExec(v) : fmt(v);
  const sel = D.mapaUF && U[D.mapaUF] ? D.mapaUF : null;
  const rank = Object.values(U).filter(u => val(u) != null).sort((a, b) => met === 'exec' ? val(a) - val(b) : val(b) - val(a));
  const totPot = Object.values(P).reduce((a, x) => a + x.potencial, 0);
  const acao = x => { const t = [];
    if (x.fixo && x.exec != null && x.exec < 0.92) t.push(`Renegociar o fixo: executou ${fmtExec(x.exec)} do previsto`);
    if (x.acima > 1) t.push(`Conferir cobrança: malote ${BRL(x.acima)} acima do previsto`);
    if (x.cpa && nac && x.cpa > 1.5 * nac) t.push(`Custo por atendimento ${(x.cpa / nac).toFixed(1).replace('.', ',')}× a média`);
    if (x.custo && x.kits / x.custo > 0.3) t.push(`Kits/Spot são ${Math.round(100 * x.kits / x.custo)}% do custo`);
    return t.join(' · ') || '—'; };
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="alterna" role="group" aria-label="Indicador" style="display:inline-flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface);align-self:flex-start">${MAPA_MET.map(([k, t]) => `<button type="button" data-mm="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${met === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${t}</button>`).join('')}</div>
    <div class="kpis">
      <div class="kpi"><small>Potencial de redução no mês</small><b>${BRL(totPot)}</b><span>fixo pago sem atendimento + malote acima do previsto</span></div>
      <div class="kpi neutro"><small>Custo por atendimento (Brasil)</small><b>${nac ? BRL2(nac) : '—'}</b><span>malote + kits ÷ atendimentos realizados</span></div>
      <div class="kpi neutro"><small>Estado com mais potencial</small><b>${(() => { const u = Object.values(U).sort((a, b) => b.potencial - a.potencial)[0]; return u ? `${u.uf} · ${BRL(u.potencial)}` : '—'; })()}</b><span>clique no mapa para ver os parceiros</span></div>
    </div>
    <div style="display:grid;grid-template-columns:minmax(300px,1.25fr) minmax(260px,1fr);gap:24px;align-items:start" class="mapa-grid">
      <div style="position:relative">
        <svg viewBox="${BR.viewBox}" style="width:100%;height:auto;display:block" role="img" aria-label="Mapa do Brasil por estado: ${esc(MAPA_MET.find(m => m[0] === met)[1])}">
          ${Object.entries(BR.uf).map(([uf, g]) => { const u = U[uf]; const v = u ? val(u) : null; return `<path d="${g.d}" data-uf="${uf}" fill="${cor(v)}" stroke="${sel === uf ? 'var(--ink)' : 'var(--surface)'}" stroke-width="${sel === uf ? 2.2 : 0.8}" style="cursor:${u ? 'pointer' : 'default'}"><title>${esc(g.nome)}: ${u ? fmtV(v) : 'sem parceiro'}</title></path>`; }).join('')}
        </svg>
        <div class="linha" style="font-size:12px;color:var(--muted);gap:8px;margin-top:6px"><span>${met === 'exec' ? 'maior execução' : 'menor'}</span><i style="display:inline-block;width:140px;height:10px;border-radius:5px;background:linear-gradient(90deg,rgba(219,34,66,.08),rgba(219,34,66,.93))"></i><span>${met === 'exec' ? 'menor execução' : 'maior'}</span><span style="margin-left:auto">Mapa: svg-maps, CC BY 4.0</span></div>
      </div>
      <div class="tabela" style="max-height:560px;overflow:auto"><table><thead><tr><th>Estado</th><th class="n">${esc(MAPA_MET.find(m => m[0] === met)[1].replace(/ \(.*\)/, ''))}</th><th class="n">Parceiros</th></tr></thead><tbody>
        ${rank.map(u => `<tr data-ufr="${u.uf}" style="cursor:pointer${sel === u.uf ? ';background:var(--field);font-weight:600' : ''}"><td><b>${u.uf}</b> <span style="font-size:12px;color:var(--muted)">${esc(BR.uf[u.uf]?.nome || '')}</span></td><td class="n">${fmtV(val(u))}</td><td class="n">${u.parc.size}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    ${sel ? (() => { const u = U[sel]; const ls = [...u.parc].map(id => P[id]).sort((a, b) => b.potencial - a.potencial || b.custo - a.custo);
      return `<section class="bloco" style="margin:0"><h2>${esc(BR.uf[sel]?.nome || sel)} · ${BRL(u.custo)} no mês · potencial ${BRL(u.potencial)}</h2>
        <div class="tabela"><table><thead><tr><th>Parceiro</th><th class="n">Custo do parceiro</th><th class="n">Execução</th><th class="n">Custo por atend.</th><th class="n">Fixo sem atendimento</th><th class="n">Malote acima do previsto</th><th>Ação sugerida</th></tr></thead><tbody>
        ${ls.map(x => `<tr><td><b>${esc(x.p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(x.p.nome || '')}${x.p.tipo ? ' · ' + esc(x.p.tipo) : ''}${x.rs.length > 1 ? ` · ${Math.round(100 * n(x.rs.find(r => r.uf === sel)?.peso))}% dos pontos em ${sel}` : ''}</span></td><td class="n">${BRL(x.custo)}</td><td class="n">${fmtExec(x.exec)}</td><td class="n">${x.cpa ? BRL2(x.cpa) : '—'}</td><td class="n">${x.ocioso ? BRL(x.ocioso) : '—'}</td><td class="n">${x.acima ? BRL(x.acima) : '—'}</td><td style="font-size:13px">${esc(acao(x))}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="nota">Valores do parceiro inteiro; quando ele atende mais de um estado, o mapa usa a parte proporcional aos pontos.</p></section>`; })() : ''}
    <p class="nota">Potencial de redução = fixo do contrato × (1 − execução), ou seja, o que se paga por atendimentos previstos que não aconteceram, mais o malote cobrado acima do previsto. Execução = atendimentos realizados ÷ previstos no calendário. ${rows[0]?.fonte === 'carteira atual' ? 'Este mês não tem base de pontos: a divisão por estado usa a carteira atual e não há execução.' : ''}</p>
  </div>`;
  box.querySelectorAll('[data-mm]').forEach(b => b.onclick = () => { D.mapaMet = b.dataset.mm; mapaCustos(box, D, c); });
  box.querySelectorAll('[data-uf],[data-ufr]').forEach(el => el.onclick = () => { const uf = el.dataset.uf || el.dataset.ufr; if (!U[uf]) return; D.mapaUF = D.mapaUF === uf ? null : uf; mapaCustos(box, D, c); });
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
  box.innerHTML = `<div class="linha" style="font-size:13px;color:var(--muted);gap:18px"><span><i style="display:inline-block;width:12px;height:12px;border:2px solid var(--ink);border-radius:2px;vertical-align:-2px"></i> Previsto</span><span><i style="display:inline-block;width:12px;height:12px;background:var(--brand);border-radius:2px;vertical-align:-2px"></i> Realizado</span>${pts.some(p => p.proj) ? '<span><i style="display:inline-block;width:12px;height:12px;border:2px dashed var(--ink);border-radius:2px;vertical-align:-2px"></i> Projeção pela carteira atual</span>' : ''}</div>
  <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;height:auto;display:block" role="img" aria-label="Previsto x realizado">
    ${[0, top / 2, top].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="var(--muted)" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${pts.map((p, i) => { const x0 = L + i * bw, w = bw * 0.3, g = 3;
      const bar = (v, x, cheia) => v ? `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="2" ${cheia ? 'fill="var(--brand)"' : `fill="var(--field)" stroke="var(--ink)" stroke-width="1.5"${p.proj ? ' stroke-dasharray="4 3"' : ''}`}/>` : '';
      return `<g data-i="${i}"><rect x="${x0}" y="${T}" width="${bw}" height="${H - T - B}" fill="${p.c.id === atualId ? 'var(--paper)' : 'transparent'}"/>
        ${bar(p.p, x0 + bw / 2 - w - g / 2, false)}${bar(p.r, x0 + bw / 2 + g / 2, true)}
        <text x="${x0 + bw / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="${p.c.id === atualId ? 'var(--brand-deep)' : 'var(--muted)'}" font-weight="${p.c.id === atualId ? 600 : 400}" font-family="Poppins">${rot(p)}</text></g>`; }).join('')}
  </svg></div><div class="gt" hidden style="position:absolute;pointer-events:none;background:var(--panel);color:var(--on-panel);font-size:13px;padding:8px 10px;border-radius:6px;white-space:nowrap"></div>`;
  const tip = box.querySelector('.gt');
  box.querySelectorAll('g[data-i]').forEach(g => {
    const p = pts[+g.dataset.i];
    g.onmousemove = e => { tip.hidden = false;
      tip.innerHTML = `<b>${rot(p)}${p.proj ? ' · projeção' : ''}</b><br>Previsto ${p.p ? BRL(p.p) : '—'}<br>Realizado ${p.r != null ? BRL(p.r) : '—'}${p.p && p.r != null ? `<br><span style="color:var(--on-dark)">${pct(p.r / p.p - 1)}</span>` : ''}`;
      const r = box.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top - 70) + 'px'; };
    g.onmouseleave = () => tip.hidden = true; if (p.proj && !p.temReal) return; g.style.cursor = 'pointer';
    g.onclick = () => { S.dir.compId = p.c.id; desenharDiretoria(box.closest('main') || $('#main')); };
  });
  const comAmbos = pts.filter(p => p.p && p.r != null);
  const tp = comAmbos.reduce((a, p) => a + p.p, 0), tr = comAmbos.reduce((a, p) => a + p.r, 0);
  tbox.innerHTML = `<div class="tabela"><table><thead><tr><th>Mês</th><th class="n">Previsto</th><th class="n">Realizado</th><th class="n">Diferença</th><th class="n">%</th><th>Origem da previsão</th></tr></thead><tbody>
    ${pts.map(p => `<tr${p.c.id === atualId ? ' style="background:var(--field);font-weight:600"' : ''}><td>${nomeMes(p.c.mes)}</td><td class="n">${p.p ? BRL(p.p) : '—'}</td><td class="n">${p.r != null ? BRL(p.r) : '—'}</td>
      <td class="n">${p.p && p.r != null ? ((p.r - p.p > 0 ? '+' : '') + BRL(p.r - p.p)) : '—'}</td><td class="n">${p.p && p.r != null ? pct(p.r / p.p - 1) : '—'}</td>
      <td style="font-size:13px;color:var(--muted)">${p.origem === 'planilha' ? 'Planilha de fechamento' : p.origem === 'portal' ? 'Calculado no portal' : p.origem === 'projecao' ? 'Projeção pela carteira atual' : 'Base do mês ainda não gerada'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>Acumulado (meses com realizado)</b></td><td class="n"><b>${BRL(tp)}</b></td><td class="n"><b>${BRL(tr)}</b></td><td class="n"><b>${(tr - tp > 0 ? '+' : '') + BRL(tr - tp)}</b></td><td class="n"><b>${tp ? pct(tr / tp - 1) : '—'}</b></td><td></td></tr>
    ${pts.some(p => p.proj) ? (() => { const pj = pts.filter(p => p.proj).reduce((a, p) => a + p.p, 0); const sr = pts.filter(p => !p.proj && p.r == null).reduce((a, p) => a + (p.p || 0), 0); return `<tr><td><b>Ano: realizado + previsão dos meses em aberto</b></td><td class="n"></td><td class="n"><b>${BRL(tr + sr + pj)}</b></td><td colspan="3" style="font-size:13px;color:var(--muted)">${BRL(tr)} realizado + ${BRL(sr + pj)} previsto até dezembro</td></tr>`; })() : ''}</tfoot></table></div>
    <p class="nota">Meses fechados usam o calendarizado da planilha de fechamento. A partir de outubro, a previsão é calculada pelo portal quando a base do mês é gerada (Carteira de pontos → Gerar base). Os meses sem base aparecem como projeção (barra tracejada), calculada com a carteira atual até dezembro.</p>`;
}

const SO_FIN = ['atendimentos', 'eficiencia']; // abas operacionais: financeiro e GSM
const ABAS_DIR = [['executivo', 'Resumo executivo'], ['geral', 'Visão geral'], ['operacao', 'Operação ao vivo'], ['mapa', 'Mapa de custos'], ['resumo', 'Resumo do ano'], ['previsto', 'Previsto x Realizado'], ['variacao', 'Variação do mês'], ['eficiencia', 'Custo unitário'], ['atendimentos', 'Atendimentos'], ['carteira', 'Movimentação de pontos'], ['caixa', 'Caixa'], ['parceiros', 'Parceiros']];

// Visão geral: uma tela para bater o olho (diretoria e financeiro)
const kE = v => Math.abs(v) < 1000 ? BRL(v) : BRLk(v);
// Economia gerada pela GSM numa competência: validação (malote abaixo do previsto), descontos e save
function ganhosMes(D, id) {
  const n = v => Number(v) || 0;
  const doMes = x => D.fech.filter(f => f.competencia_id === x);
  const prevDe = x => D.prev.filter(f => f.competencia_id === x && f.previsto != null);
  const descBruto = (r, det) => Math.max(0, -n(r.descontos), det.filter(x => x.origem === 'portal').reduce((a, x) => a + n(x.valor), 0));
   const f = doMes(id); const pp = Object.fromEntries(prevDe(id).map(p => [p.parceiro_id, n(p.previsto)]));
    const comP = f.filter(r => pp[r.parceiro_id] != null && fechado(r)); const abaixo = comP.reduce((a, r) => a + Math.max(0, pp[r.parceiro_id] - n(r.malote)), 0), acimaV = comP.reduce((a, r) => a + Math.max(0, n(r.malote) - pp[r.parceiro_id]), 0);
    const val = Math.max(0, abaixo - acimaV);
    const cat = {}; f.forEach(r => { const det = (D.ddet || []).filter(x => x.competencia_id === id && x.parceiro_id === r.parceiro_id); const dt = descBruto(r, det); if (dt <= 0) return;
      const ant = Math.min(dt, det.filter(x => x.categoria === 'antecipacao').reduce((a, x) => a + n(x.valor), 0)); cat.antecipacao = (cat.antecipacao || 0) + ant;
      let resto = dt - ant; ['repasse', 'penalidade', 'ajuste'].forEach(k => { const v = Math.min(resto, det.filter(x => x.categoria === k).reduce((a, x) => a + n(x.valor), 0)); cat[k] = (cat[k] || 0) + v; resto -= v; }); cat.ajuste = (cat.ajuste || 0) + resto; });
    const antPl = cat.antecipacao || 0; const d = (cat.repasse || 0) + (cat.penalidade || 0) + (cat.ajuste || 0);
    const sv = (D.adis || []).filter(a => a.competencia_id === id).reduce((a, x) => a + n(x.valor_desconto), 0) + f.reduce((a, r) => a + n(r.antec_desconto), 0) + antPl;
    return { val, abaixo, acima: acimaV, nAbaixo: comP.filter(r => pp[r.parceiro_id] > n(r.malote)).length, nAcima: comP.filter(r => n(r.malote) > pp[r.parceiro_id]).length, desc: d, cat, save: sv, total: val + d + sv }; }

// ---------- Resumo executivo (CEO/CFO): uma história só, poucos números ----------
function resumoExecutivo(box, D, c, ant) {
  if (!box) return;
  const n = v => Number(v) || 0;
  const doMes = id => D.fech.filter(f => f.competencia_id === id);
  const total = r => n(r.valor_aprovado ?? r.valor_final);
  const prevDe = id => D.prev.filter(f => f.competencia_id === id && f.previsto != null);
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const mil = v => (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fe = doMes(c.id), fa = ant ? doMes(ant.id) : [];
  const nomeP = id => (pm[id] && pm[id].regiao || '—').replace(/\s+-\s+[A-Z]{2}$/, '');
  if (!fe.length) { box.innerHTML = `<div class="msg">${nomeMes(c.mes)} ainda não tem fechamento. O resumo executivo aparece quando os parceiros começarem a ser aprovados; até lá, veja a Visão geral.</div>`; return; }
  const custo = fe.reduce((a, r) => a + total(r), 0), custoAnt = fa.reduce((a, r) => a + total(r), 0);
  const mal = fe.reduce((a, r) => a + n(r.malote), 0), kit = fe.reduce((a, r) => a + n(r.kits), 0), atx = fe.reduce((a, r) => a + n(r.atend_extra), 0), desc = fe.reduce((a, r) => a + n(r.descontos), 0);
  const foraPos = fe.reduce((a, r) => a + Math.max(0, n(r.fora_umov)), 0), foraNeg = fe.reduce((a, r) => a + Math.min(0, n(r.fora_umov)), 0);
  const outP = r => total(r) - n(r.malote) - n(r.kits) - n(r.fora_umov) - n(r.atend_extra) - n(r.descontos);
  const outPos = fe.reduce((a, r) => a + Math.max(0, outP(r)), 0), outNeg = fe.reduce((a, r) => a + Math.min(0, outP(r)), 0);
  const realizado = mal + kit + foraPos + atx + outPos, abat = foraNeg + outNeg;
  const previsto = prevDe(c.id).reduce((a, p) => a + n(p.previsto), 0);
  const atend = id => (D.efic || []).filter(e => e.competencia_id === id).reduce((a, e) => a + n(e.atend_umov), 0);
  const at = atend(c.id), atAnt = ant ? atend(ant.id) : 0;
  const cpa = at ? custo / at : null, cpaAnt = atAnt && custoAnt ? custoAnt / atAnt : null;
  const G = ganhosMes(D, c.id);
  const mesesAno = D.comps.filter(x => x.mes.slice(0, 4) === c.mes.slice(0, 4) && +x.mes.slice(5, 7) <= +c.mes.slice(5, 7));
  const GAtot = mesesAno.reduce((a, x) => a + ganhosMes(D, x.id).total, 0);
  const potM = potencialMes(D, c);
  if (potM === undefined && !D.mapaCarregando) { D.mapaCarregando = true; carregarMapa(D, c).then(() => { D.mapaCarregando = false; if (D.aba === 'executivo' && D.compId === c.id) resumoExecutivo(box, D, c, ant); }).catch(() => { D.mapaCarregando = false; }); }
  // ano e projeção (mesma regra da Visão geral)
  const ano = c.mes.slice(0, 4), mSel = +c.mes.slice(5, 7);
  const serie = D.comps.filter(x => x.mes.slice(0, 4) === ano).map(x => ({ c: x, v: doMes(x.id).reduce((a, r) => a + total(r), 0), p: prevDe(x.id).reduce((a, r) => a + n(r.previsto), 0) }));
  const acum = serie.filter(s => +s.c.mes.slice(5, 7) <= mSel).reduce((a, s) => a + s.v, 0);
  const comV = serie.filter(s => s.v > 0); const ultR = comV.length ? +comV[comV.length - 1].c.mes.slice(5, 7) : 0; const ultP = serie.filter(s => s.p > 0).slice(-1)[0];
  let futuro = 0; for (let m = ultR + 1; m <= 12; m++) { const s = serie.find(x => +x.c.mes.slice(5, 7) === m); futuro += s && s.p ? s.p : (ultP ? ultP.p : 0); }
  const proj = comV.reduce((a, s) => a + s.v, 0) + futuro;
  const media = comV.length ? comV.reduce((a, s) => a + s.v, 0) / comV.length : 0;
  // variação por parceiro sobre o mês anterior (inclui quem saiu)
  const ids = ant && fa.length ? [...new Set([...fe, ...fa].map(r => r.parceiro_id))] : [];
  const vari = ids.map(id => ({ id, d: fe.filter(r => r.parceiro_id === id).reduce((a, r) => a + total(r), 0) - fa.filter(r => r.parceiro_id === id).reduce((a, r) => a + total(r), 0) })).filter(x => Math.abs(x.d) > 0.5);
  const quedas = vari.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 2), altas = vari.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 2);
  const lista = xs => xs.map(x => `${esc(nomeP(x.id))} (${x.d > 0 ? '+' : '−'}R$ ${mil(Math.abs(x.d))} mil)`).join(' e ');
  const vAnt = custoAnt ? custo / custoAnt - 1 : null, vPrev = previsto ? custo / previsto - 1 : null;
  const comoPct = v => (Math.abs(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const frase = `O custo de ${nomeMes(c.mes).split('/')[0].toLowerCase()} foi <b>R$ ${mil(custo)} mil</b>${vAnt != null ? `, <b class="${vAnt <= 0 ? 'rx-bom' : 'rx-ruim'}">${comoPct(vAnt)} ${vAnt <= 0 ? 'menor' : 'maior'} que ${nomeMes(ant.mes).split('/')[0].toLowerCase()}</b>` : ''}${vPrev != null ? ` e ${comoPct(vPrev)} ${vPrev <= 0 ? 'abaixo' : 'acima'} do previsto` : ''}.`
    + (quedas.length ? ` As maiores quedas vieram de ${lista(quedas)}` : '') + (altas.length ? `${quedas.length ? ';' : ''} as maiores altas, de ${lista(altas)}` : '') + (quedas.length || altas.length ? '.' : '');
  // onde agir
  const prevPor = Object.fromEntries(prevDe(c.id).map(p => [p.parceiro_id, n(p.previsto)]));
  const acima = fe.filter(r => prevPor[r.parceiro_id] && n(r.malote) > prevPor[r.parceiro_id] * 1.1);
  const excesso = acima.reduce((a, r) => a + n(r.malote) - prevPor[r.parceiro_id], 0);
  const acoes = [];
  if (altas.length) acoes.push([`${altas.map(x => esc(nomeP(x.id))).join(' e ')} ${altas.length > 1 ? 'subiram' : 'subiu'}`, `Sobre ${nomeMes(ant.mes)}. Rever volume e valor unitário com ${altas.length > 1 ? 'os parceiros' : 'o parceiro'}.`, `+ R$ ${mil(altas.reduce((a, x) => a + x.d, 0))} mil`, 'rx-ruim', '#var']);
  if (potM) acoes.push(['Fixo pago sem atendimento', 'Atendimentos previstos que não aconteceram, mas entraram no fixo dos parceiros. Ponto de renegociação.', `R$ ${mil(potM)} mil`, 'rx-atencao', '@mapa']);
  if (acima.length) acoes.push([`${acima.length} parceiro${acima.length > 1 ? 's' : ''} com malote mais de 10% acima do previsto`, acima.slice(0, 4).map(r => esc(nomeP(r.parceiro_id))).join(', ') + (acima.length > 4 ? '…' : '') + '. Conferir se a carteira está atualizada.', `+ R$ ${mil(excesso)} mil`, 'rx-ruim', '@previsto']);
  // cascata
  const passos = [['Malote', mal, 0, 'rx-c-base', 'Malote'], ['Entregas avulsas (kits)', kit, 1, 'rx-c-sobe', 'Kits/Spot'], ['Serviços extras', foraPos, 1, 'rx-c-sobe', 'Serviços fora do Umov'], ['Atendimentos extras', atx, 1, 'rx-c-sobe', ATX], ['Outros acertos', outPos, 1, 'rx-c-sobe', 'Outros ajustes'],
    ['Realizado no mês', realizado, 2, 'rx-c-tot', '#parc'], ['Abatimentos', abat, 1, 'rx-c-desce', 'Ajustes de fatura'], ['Descontos', desc, 1, 'rx-c-desce', 'Descontos'], ['Custo do mês', custo, 2, 'rx-c-fim', '#parc']].filter(p => p[2] !== 1 || Math.abs(p[1]) > 0.5);
  const piso = Math.max(0, Math.floor(Math.min(mal, custo) * 0.9 / 50000) * 50000), teto = Math.max(realizado, previsto || 0) * 1.03, H = 260;
  const y = v => (v - piso) / (teto - piso) * H;
  let run = 0; const barras = passos.map(([rot, v, k, cls, pop]) => { let lo, hi;
    if (k === 0) { lo = piso; hi = v; run = v; } else if (k === 2) { lo = piso; hi = v; run = v; } else { lo = Math.min(run, run + v); hi = Math.max(run, run + v); run += v; }
    const b = y(lo), h = Math.max(3, y(hi) - y(lo)); const val = k === 1 ? `${v > 0 ? '+' : '−'} R$ ${mil(Math.abs(v))} mil` : `R$ ${mil(v)} mil`;
    return `<button type="button" class="rx-col" data-rx="${esc(pop)}" title="Clique para ver os lançamentos"><div class="rx-area" style="height:${H}px"><i class="${cls}" style="bottom:${b.toFixed(0)}px;height:${h.toFixed(0)}px"></i><span style="bottom:${(b + h + 6).toFixed(0)}px"${k === 2 ? ' class="rx-forte"' : ''}>${val}</span></div><small>${rot}</small></button>`; }).join('');
  const linhaPrev = previsto ? `<div class="rx-prev" style="bottom:${(y(previsto) + 44).toFixed(0)}px" title="Previsto: ${BRL(previsto)}"></div>` : '';
  const maxM = Math.max(...serie.map(s => s.v), 1);
  const kpi = (rot, val, tag, cls, sub, ir) => `<button type="button" class="rx-kpi" data-rx="${ir}"><small>${rot}</small><b>${val}</b>${tag ? `<span class="rx-tag ${cls}">${tag}</span>` : ''}<p>${sub}</p><span class="rx-ir">${{ '#parc': 'Ver por parceiro ›', '@eficiencia': 'Ver custo unitário ›', '@geral-eco': 'Ver economia por praça ›', '@resumo': 'Ver resumo do ano ›' }[ir] || ''}</span></button>`;
  const pago = fe.every(r => r.pago_em), nF = fe.filter(fechado).length;
  box.innerHTML = `<div class="rx">
    <div class="rx-topo"><div><small class="rx-sobre">Resumo executivo · Última milha</small><h2>${nomeMes(c.mes)}</h2></div>
      <span class="rx-selo ${c.status === 'fechada' && pago ? 'ok' : ''}">${c.status === 'fechada' ? 'Mês fechado' : 'Mês em andamento'} · ${pago ? '100% pago' : `${nF} de ${fe.length} aprovados`} · ${fe.length} parceiros</span></div>
    <div class="rx-frase">${frase}</div>
    <div class="rx-kpis">
      ${kpi('Custo do mês', `R$ ${mil(custo)} mil`, vPrev != null ? `${vPrev <= 0 ? '▼' : '▲'} ${comoPct(vPrev)} ${vPrev <= 0 ? 'abaixo' : 'acima'} do previsto` : '', vPrev != null && vPrev <= 0 ? 'rx-bom' : 'rx-ruim', `Previsto pelo contrato: R$ ${mil(previsto)} mil${ant ? ` · ${nomeMes(ant.mes).split('/')[0]}: R$ ${mil(custoAnt)} mil` : ''}`, '#parc')}
      ${kpi('Custo por atendimento', cpa ? cpa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—', cpa && cpaAnt ? `${cpa <= cpaAnt ? '▼' : '▲'} ${comoPct(cpa / cpaAnt - 1)} sobre ${nomeMes(ant.mes).split('/')[0].toLowerCase()}` : '', cpa && cpaAnt && cpa <= cpaAnt ? 'rx-bom' : 'rx-ruim', at ? `${at.toLocaleString('pt-BR')} atendimentos realizados (Umov)${cpaAnt ? ` · ${nomeMes(ant.mes).split('/')[0]}: ${cpaAnt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}` : 'sem a contagem de atendimentos deste mês', '@eficiencia')}
      ${kpi('Economia gerada pela GSM', `R$ ${mil(G.total)} mil`, custo ? `${comoPct(G.total / (custo + G.total))} do que seria pago` : '', 'rx-bom', `Validação do fechamento, descontos e antecipações · acumulado ${ano}: R$ ${mil(GAtot)} mil`, '@geral-eco')}
      ${kpi(`Projeção de ${ano}`, `R$ ${(proj / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`, '', '', `Realizado até ${MES3[mSel - 1].toLowerCase()}: R$ ${(acum / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi · meses seguintes pelo previsto`, '@resumo')}
    </div>
    <section class="rx-card"><div class="rx-cab"><h3>Como chegamos aos R$ ${mil(custo)} mil</h3><span>Eixo a partir de R$ ${mil(piso).replace(',0', '')} mil${previsto ? ` · tracejado = previsto (R$ ${mil(previsto)} mil)` : ''}</span></div>
      <div class="rx-rolar"><div class="rx-cascata">${linhaPrev}${barras}</div></div>
      <div class="rx-legenda"><span><b>Entregas avulsas</b>: kits e spots fora da rota fixa</span><span><b>Serviços extras</b>: coletas, corridas e taxas cobradas à parte</span>${abat < -0.5 ? '<span><b>Abatimentos</b>: valor já pago antes (adiantamento) e rateio de fatura</span>' : ''}<span><b>Descontos</b>: repasses, penalidades e taxa de antecipação</span></div></section>
    <div class="rx-duas">
      <section class="rx-card"><div class="rx-cab"><h3>Custo mês a mês</h3><span>em R$ mil · média ${ano}: ${Math.round(media / 1000)}</span></div>
        <div class="rx-meses">${serie.filter(s => s.v > 0).map(s => `<button type="button" data-rxmes="${s.c.id}" class="${s.c.id === c.id ? 'atual' : ''}" title="Abrir ${nomeMes(s.c.mes)}"><small>${Math.round(s.v / 1000)}</small><i style="height:${(s.v / maxM * 150).toFixed(0)}px"></i><span>${MES3[+s.c.mes.slice(5, 7) - 1]}</span></button>`).join('')}</div><p class="nota" style="margin:0">Clique num mês para abrir o resumo dele.</p></section>
      <section class="rx-card"><h3 style="margin:0 0 6px">Onde agir</h3>${acoes.length ? acoes.slice(0, 3).map((a, i) => `<button type="button" class="rx-acao" data-rx="${a[4]}"><em>${i + 1}</em><div><b>${a[0]}</b><p>${a[1]} <span class="rx-ir">${a[4] === '#var' ? 'Ver variação por parceiro ›' : a[4] === '@mapa' ? 'Abrir Mapa de custos ›' : 'Abrir Previsto x Realizado ›'}</span></p></div><strong class="${a[3]}">${a[2]}</strong></button>`).join('') : '<p class="nota">Nada fora do esperado neste mês.</p>'}
        ${potM === undefined ? '<p class="nota">Calculando o fixo pago sem atendimento…</p>' : ''}</section>
    </div>
    <p class="rx-fonte">Fonte: Portal de Fechamento · valores aprovados de ${nomeMes(c.mes)} · atendimentos pela base do Umov. Clique nos números, nas barras e nas ações para ver o detalhe.</p>
  </div>`;
  const tela = box.closest('main') || $('#main');
  const irAba = k => { const ok = [...document.querySelectorAll('[data-aba]')].some(x => x.dataset.aba === k); D.aba = ok ? k : 'geral'; desenharDiretoria(tela); window.scrollTo({ top: 0 }); };
  const porParceiro = ordem => {
    const L = ids.length ? ids : fe.map(r => r.parceiro_id);
    const linhas = [...new Set(L)].map(id => { const v = fe.filter(r => r.parceiro_id === id).reduce((a, r) => a + total(r), 0), va = fa.filter(r => r.parceiro_id === id).reduce((a, r) => a + total(r), 0); return { id, v, va, d: v - va }; })
      .sort((x, y) => ordem === 'var' ? Math.abs(y.d) - Math.abs(x.d) : y.v - x.v);
    const pb = abrirPop(`${ordem === 'var' ? 'Variação' : 'Custo'} por parceiro · ${nomeMes(c.mes)}`, ant ? `Comparado com ${nomeMes(ant.mes)}. Clique no título de uma coluna para ordenar.` : '');
    const desenha = (k, dir) => { linhas.sort((x, y) => k === 'p' ? dir * nomeP(x.id).localeCompare(nomeP(y.id)) : dir * (x[k] - y[k]));
      const th = (kk, t, cl) => `<th class="${cl || 'n'}" data-o="${kk}" style="cursor:pointer;white-space:nowrap">${t}${k === kk ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      pb.className = ''; pb.innerHTML = `<div class="tabela"><table><thead><tr>${th('p', 'Parceiro', ' ')}${th('v', nomeMes(c.mes))}${ant ? th('va', nomeMes(ant.mes)) + th('d', 'Variação') : ''}</tr></thead><tbody>${linhas.map(l => `<tr><td><b>${esc(nomeP(l.id))}</b>${pm[l.id] && pm[l.id].nome ? `<br><span class="nota">${esc(pm[l.id].nome)}</span>` : ''}</td><td class="n">${BRL(l.v)}</td>${ant ? `<td class="n">${BRL(l.va)}</td><td class="n" style="color:${l.d > 0.5 ? 'var(--brand-deep)' : l.d < -0.5 ? 'var(--eco)' : 'inherit'}">${Math.abs(l.d) > 0.5 ? (l.d > 0 ? '+' : '−') + BRL(Math.abs(l.d)) : '—'}</td>` : ''}</tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total (${linhas.length})</b></td><td class="n"><b>${BRL(custo)}</b></td>${ant ? `<td class="n"><b>${BRL(custoAnt)}</b></td><td class="n"><b>${custo - custoAnt >= 0 ? '+' : '−'}${BRL(Math.abs(custo - custoAnt))}</b></td>` : ''}</tr></tfoot></table></div>`;
      pb.querySelectorAll('[data-o]').forEach(t => t.onclick = () => { const kk = t.dataset.o; desenha(kk, kk === k ? -dir : (kk === 'p' ? 1 : -1)); }); };
    if (ordem === 'var') { linhas.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)); desenha('d', -1); } else desenha('v', -1);
  };
  box.querySelectorAll('[data-rx]').forEach(e => e.onclick = () => { const k = e.dataset.rx;
    if (k === '#parc') porParceiro('valor'); else if (k === '#var') porParceiro('var');
    else if (k === '@geral-eco') { D.gresAberto = true; irAba('geral'); setTimeout(() => { const d = $('#gresdet'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); }
    else if (k.startsWith('@')) irAba(k.slice(1));
    else popComposicao(k, D, c, ant); });
  box.querySelectorAll('[data-rxmes]').forEach(e => e.onclick = () => { D.compId = e.dataset.rxmes; desenharDiretoria(tela); });
}

function visaoGeral(box, D, c, ant) {
  const n = v => Number(v) || 0;
  const doMes = id => D.fech.filter(f => f.competencia_id === id);
  const total = r => n(r.valor_aprovado ?? r.valor_final);
  const prevDe = id => D.prev.filter(f => f.competencia_id === id && f.previsto != null);
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const fe = doMes(c.id), fa = ant ? doMes(ant.id) : [];
  const custo = fe.reduce((a, r) => a + total(r), 0), custoAnt = fa.reduce((a, r) => a + total(r), 0);
  const mal = fe.reduce((a, r) => a + n(r.malote), 0), kit = fe.reduce((a, r) => a + n(r.kits), 0), fora = fe.reduce((a, r) => a + n(r.fora_umov), 0), atx = fe.reduce((a, r) => a + n(r.atend_extra), 0), desc = fe.reduce((a, r) => a + n(r.descontos), 0);
  const outros = custo - mal - kit - fora - atx - desc;
  // fora do Umov separado por sinal: serviços/coletas cobrados (+) e ajustes de fatura/adiantamento já pago (−)
  const foraPos = fe.reduce((a, r) => a + Math.max(0, n(r.fora_umov)), 0), foraNeg = fe.reduce((a, r) => a + Math.min(0, n(r.fora_umov)), 0);
  const outP = r => n(r.valor_aprovado ?? r.valor_final) - n(r.malote) - n(r.kits) - n(r.fora_umov) - n(r.atend_extra) - n(r.descontos);
  const outNeg = fe.reduce((a, r) => a + Math.min(0, outP(r)), 0), ajNeg = foraNeg + outNeg;
  const prevPor = Object.fromEntries(prevDe(c.id).map(p => [p.parceiro_id, n(p.previsto)]));
  const previsto = Object.values(prevPor).reduce((a, v) => a + v, 0);
  const malComPrev = fe.filter(r => prevPor[r.parceiro_id] != null).reduce((a, r) => a + n(r.malote), 0);
  const prevComReal = fe.filter(r => prevPor[r.parceiro_id] != null).reduce((a, r) => a + prevPor[r.parceiro_id], 0);
  const difPrev = malComPrev - prevComReal;
  const parceirosMes = new Set([...fe.map(r => r.parceiro_id), ...Object.keys(prevPor)]).size;
  const nFech = fe.filter(fechado).length;
  const pcFin = parceirosMes ? Math.round(100 * nFech / parceirosMes) : 0;
  const pago = fe.filter(r => r.pago_em).reduce((a, r) => a + total(r) - n(r.adiantado) - n(r.antec_desconto), 0);
  const adiantado = fe.reduce((a, r) => a + n(r.adiantado), 0);
  const antecTot = fe.reduce((a, r) => a + n(r.antec_desconto), 0);
  const aPagar = Math.max(0, custo - adiantado - pago - antecTot);
  const save = (D.adis || []).filter(a => a.competencia_id === c.id).reduce((a, x) => a + n(x.valor_desconto), 0) + antecTot;
  // Resultado da gestão: o que a GSM deixou de pagar
  // Desconto bruto do parceiro no mês: o líquido do fechamento ou, quando o portal registrou o detalhe, a soma dos descontos detalhados
  // (um acréscimo lançado como ajuste não pode esconder o save da antecipação nem os repasses)
  const descBruto = (r, det) => Math.max(0, -n(r.descontos), det.filter(x => x.origem === 'portal').reduce((a, x) => a + n(x.valor), 0));
  const ganhos = id => ganhosMes(D, id);
  const G = ganhos(c.id);
  const mesesAno = D.comps.filter(x => x.mes.slice(0, 4) === c.mes.slice(0, 4) && +x.mes.slice(5, 7) <= +c.mes.slice(5, 7));
  const GA = mesesAno.map(x => ganhos(x.id)).reduce((a, g) => ({ val: a.val + g.val, desc: a.desc + g.desc, save: a.save + g.save, total: a.total + g.total }), { val: 0, desc: 0, save: 0, total: 0 });
  const catTxt = g => [['repasse', 'repasses'], ['penalidade', 'penalidades'], ['ajuste', 'ajustes']].filter(([k]) => (g.cat[k] || 0) > 0.5).map(([k, t]) => `${t} ${BRL(g.cat[k])}`).join(' · ');
  const ganhosParc = ids => { const L = {}; ids.forEach(id => { const pp = Object.fromEntries(prevDe(id).map(p => [p.parceiro_id, n(p.previsto)]));
      doMes(id).forEach(r => { const x = L[r.parceiro_id] || (L[r.parceiro_id] = { id: r.parceiro_id, p: pm[r.parceiro_id] || {}, prev: 0, mal: 0, abaixo: 0, acima: 0, desc: 0, save: 0 });
        if (pp[r.parceiro_id] != null && fechado(r)) { x.prev += pp[r.parceiro_id]; x.mal += n(r.malote); x.abaixo += Math.max(0, pp[r.parceiro_id] - n(r.malote)); x.acima += Math.max(0, n(r.malote) - pp[r.parceiro_id]); }
        const detP = (D.ddet || []).filter(d => d.competencia_id === id && d.parceiro_id === r.parceiro_id); const dt = descBruto(r, detP); const ant = Math.min(dt, detP.filter(d => d.categoria === 'antecipacao').reduce((a, d) => a + n(d.valor), 0));
        x.desc += dt - ant + (dt > 0 ? 0 : Math.min(0, -n(r.descontos))); x.save += n(r.antec_desconto) + ant; });
      (D.adis || []).filter(a => a.competencia_id === id).forEach(a => { const x = L[a.parceiro_id] || (L[a.parceiro_id] = { id: a.parceiro_id, p: pm[a.parceiro_id] || {}, prev: 0, mal: 0, abaixo: 0, acima: 0, desc: 0, save: 0 }); x.save += n(a.valor_desconto); }); });
    return Object.values(L).map(x => ({ ...x, val: x.abaixo - x.acima, total: x.abaixo - x.acima + x.desc + x.save })); };
  const projMes = Array.isArray(D.proj) ? D.proj.filter(r => r.mes === c.mes).reduce((a, r) => a + n(r.calendarizado), 0) : null;
  if (!fe.length && !previsto && D.proj === undefined) { D.proj = null; todas(() => sb.rpc('projecao_previsto', {})).then(r => { D.proj = r; if (D.aba === 'geral' && D.compId === c.id) visaoGeral(box, D, c, ant); }).catch(e => { D.proj = { erro: e.message }; }); }
  const potM = potencialMes(D, c);
  if (potM === undefined && !D.mapaCarregando) { D.mapaCarregando = true; carregarMapa(D, c).then(() => { D.mapaCarregando = false; if (D.aba === 'geral' && D.compId === c.id) visaoGeral(box, D, c, ant); }).catch(() => { D.mapaCarregando = false; }); }
  const economia = -desc + save;
  const semReal = !fe.length;
  const semRegistroPag = c.status === 'fechada' && !fe.some(r => r.pago_em);

  // Ano
  const ano = c.mes.slice(0, 4), mSel = +c.mes.slice(5, 7);
  const meses = D.comps.filter(x => x.mes.slice(0, 4) === ano);
  const serie = meses.map(x => ({ c: x, v: doMes(x.id).reduce((a, r) => a + total(r), 0), k: doMes(x.id).reduce((a, r) => a + n(r.kits), 0), p: prevDe(x.id).reduce((a, r) => a + n(r.previsto), 0) }));
  const acum = serie.filter(s => +s.c.mes.slice(5, 7) <= mSel).reduce((a, s) => a + s.v, 0);
  const comV = serie.filter(s => s.v > 0); const ultR = comV.length ? +comV[comV.length - 1].c.mes.slice(5, 7) : 0;
  const ultP = serie.filter(s => s.p > 0).slice(-1)[0];
  let futuro = 0; for (let m = ultR + 1; m <= 12; m++) { const s = serie.find(x => +x.c.mes.slice(5, 7) === m); futuro += s && s.p ? s.p : (ultP ? ultP.p : 0); }
  const proj = comV.reduce((a, s) => a + s.v, 0) + futuro;

  // Listas
  const porParc = fe.map(r => ({ id: r.parceiro_id, p: pm[r.parceiro_id] || {}, v: total(r), ant: fa.find(x => x.parceiro_id === r.parceiro_id) }));
  const top = porParc.slice().sort((a, b) => b.v - a.v).slice(0, 5);
  const varr = porParc.filter(x => x.ant).map(x => ({ ...x, d: x.v - total(x.ant) })).sort((a, b) => b.d - a.d).slice(0, 5).filter(x => x.d > 0);
  const acima = fe.filter(r => prevPor[r.parceiro_id] && n(r.malote) > prevPor[r.parceiro_id] * 1.1);
  const pend = parceirosMes - nFech;

  const comp = [['Malote', mal, 'var(--ink)'], ['Kits/Spot', kit, 'var(--brand)'], ['Serviços fora do Umov', foraPos, 'var(--brand-deep)'], [ATX, atx, 'var(--muted)'], ['Outros ajustes', outros - outNeg, 'var(--on-dark)']].filter(x => x[1] > 0.5);
  const base = comp.reduce((a, x) => a + x[1], 0) || 1;
  const maxS = Math.max(...serie.map(s => Math.max(s.v, s.p)), 1);
  const tile = (rot, val, sub, cls = '') => `<div class="gtile ${cls}"><small>${rot}</small><b>${val}</b><span>${sub}</span></div>`;

  box.innerHTML = `<div class="gwrap">
  <div class="ghero">
    <div class="ghero-main">
      <small>Custo de última milha · ${nomeMes(c.mes)}</small>
      <b>${semReal ? (previsto ? BRL(previsto) : projMes != null ? BRL(projMes) : '…') : BRL(custo)}</b>
      <span>${semReal ? (previsto ? 'Previsto (calendarizado) · mês em andamento, ainda sem fechamento' : projMes != null ? 'Previsto pela carteira atual · mês em andamento, base ainda não gerada' : 'calculando o previsto…') : `${ant && custoAnt ? `${pct(custo / custoAnt - 1)} sobre ${nomeMes(ant.mes)} (${BRL(custoAnt)})` : ''}`}</span>
    </div>
    <div class="ghero-side">
      <div><small>Finalização do fechamento</small><b>${pcFin}% · ${nFech} de ${parceirosMes} parceiros</b>
        <div class="gbar"><i style="width:${pcFin}%"></i></div></div>
      ${semRegistroPag ? `<div><small>Pagamento</small><b>Mês fechado</b><span style="font-size:13px;color:var(--on-dark)">pagamentos feitos antes do portal${adiantado ? ` · ${BRL(adiantado)} em adiantamentos` : ''}</span></div>`
      : `<div><small>Pagamento</small><b>${BRL(pago + adiantado)} pago · ${BRL(aPagar)} a pagar</b>
        <div class="gbar"><i style="width:${custo ? Math.min(100, Math.round(100 * (pago + adiantado + antecTot) / custo)) : 0}%"></i></div></div>`}
    </div>
  </div>
  ${semReal ? '' : `<section class="gres" data-gres style="cursor:pointer" title="Clique para ver por praça">
    <div class="gres-main"><small>Economia gerada pela GSM · ${nomeMes(c.mes)}</small><b>${BRL(G.total)}</b>
      <span>${custo ? `${pct(G.total / (custo + G.total)).replace('+', '')} do que seria pago sem a validação` : ''}</span>
      <span class="gres-ano">Acumulado ${c.mes.slice(0, 4)}: <b>${BRL(GA.total)}</b></span></div>
    <div class="gres-itens">
      <div><small>Validação do fechamento</small><b>${BRL(G.val)}</b><span>malote pago abaixo do previsto: só o realizado comprovado (${G.nAbaixo} parceiros${G.acima > 0.5 ? `; ${BRL(G.acima)} acima do previsto em ${G.nAcima}` : ''}) · ano ${BRL(GA.val)}</span></div>
      <div><small>Descontos aplicados</small><b>${BRL(G.desc)}</b><span>${catTxt(G) || 'repasses, penalidades e ajustes'} · ano ${BRL(GA.desc)}</span></div>
      <div><small>Adiantamentos e antecipações</small><b>${BRL(G.save)}</b><span>taxa cobrada para pagar antes · ano ${BRL(GA.save)}</span></div>
      <div class="gres-pot"><small>Ainda dá para reduzir</small><b>${potM === undefined ? '…' : potM === null ? '—' : BRL(potM)}</b><span>${potM === undefined ? 'calculando…' : potM === null ? 'sem execução do mês (Umov) para calcular' : 'fixo pago por atendimento previsto que não aconteceu'} · <a href="#" data-irmapa>ver no Mapa de custos</a></span></div>
    </div><span class="gres-mais">${D.gresAberto ? '▲ fechar detalhe por praça' : '▼ ver por praça'}</span></section>`}
  ${!semReal && D.gresAberto ? (() => { const per = D.gresPer || 'mes'; const ids = per === 'ano' ? mesesAno.map(x => x.id) : [c.id];
    const L = ganhosParc(ids).filter(x => Math.abs(x.total) > 0.5 || x.acima > 0.5); const [sk, sd] = D.gresSort || ['total', -1];
    L.sort((a, b) => sk === 'praca' ? sd * (a.p.regiao || '').localeCompare(b.p.regiao || '') : sd * (a[sk] - b[sk]));
    const T = k => L.reduce((a, x) => a + x[k], 0);
    const th = (k, t) => `<th class="n" data-gs="${k}" style="cursor:pointer;white-space:nowrap">${t}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    D.gresLista = { L, per };
    return `<section class="gcard" id="gresdet"><div class="linha" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Economia por praça · ${per === 'ano' ? 'acumulado ' + c.mes.slice(0, 4) + ' até ' + MES3[+c.mes.slice(5, 7) - 1] : nomeMes(c.mes)}</h3>
      <div class="linha"><div class="alterna" role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">${[['mes', 'Mês'], ['ano', 'Acumulado do ano']].map(([k, t]) => `<button type="button" data-gp="${k}" style="font:inherit;font-size:13px;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;${per === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${t}</button>`).join('')}</div><button class="btn sec peq" id="gresx">Baixar Excel</button></div></div>
      <div class="tabela" style="max-height:520px;overflow:auto"><table><thead><tr><th data-gs="praca" style="cursor:pointer">Praça${sk === 'praca' ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>${th('prev', 'Previsto')}${th('mal', 'Malote pago')}${th('abaixo', 'Abaixo do previsto')}${th('acima', 'Acima do previsto')}${th('desc', 'Descontos')}${th('save', 'Save')}${th('total', 'Economia')}</tr></thead><tbody>
      ${L.map(x => `<tr><td><b>${esc(x.p.regiao || '—')}</b><br><span style="font-size:12px;color:var(--muted)">${esc(x.p.nome || '')}${x.p.tipo ? ' · ' + esc(x.p.tipo) : ''}</span></td><td class="n">${x.prev ? BRL(x.prev) : '—'}</td><td class="n">${x.mal ? BRL(x.mal) : '—'}</td><td class="n eco">${x.abaixo > 0.5 ? BRL(x.abaixo) : '—'}</td><td class="n" style="color:${x.acima > 0.5 ? 'var(--brand-deep)' : 'inherit'}">${x.acima > 0.5 ? '−' + BRL(x.acima) : '—'}</td><td class="n eco">${x.desc > 0.5 ? BRL(x.desc) : '—'}</td><td class="n eco">${x.save > 0.5 ? BRL(x.save) : '—'}</td><td class="n"><b style="color:${x.total < 0 ? 'var(--brand-deep)' : 'var(--eco)'}">${BRL(x.total)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>Total (${L.length} praças)</b></td><td class="n"><b>${BRL(T('prev'))}</b></td><td class="n"><b>${BRL(T('mal'))}</b></td><td class="n eco"><b>${BRL(T('abaixo'))}</b></td><td class="n"><b>−${BRL(T('acima'))}</b></td><td class="n eco"><b>${BRL(T('desc'))}</b></td><td class="n eco"><b>${BRL(T('save'))}</b></td><td class="n eco"><b>${BRL(T('total'))}</b></td></tr></tfoot></table></div>
      <p class="nota" style="margin:6px 0 0">Economia = abaixo do previsto − acima do previsto + descontos (repasses, penalidades e ajustes) + save (taxa de adiantamentos e antecipações, lida na descrição dos descontos da base de fechamento). Praça em vermelho: pagou mais do que o previsto no período. Clique no título de uma coluna para ordenar.</p></section>`; })() : ''}
  <div class="gtiles">
    ${tile('Previsto (calendarizado)', previsto ? BRL(previsto) : '—', previsto ? 'fixo do contrato + pontos × valor unitário' : 'base do mês ainda não gerada')}
    ${tile('Malote realizado', semReal ? '—' : BRL(mal), !previsto || !prevComReal ? 'sem previsão no mês' : `${pct(difPrev / prevComReal)} sobre o previsto`)}
    ${tile('Kits/Spot', semReal ? '—' : BRL(kit), custo ? `${Math.round(100 * kit / custo)}% do custo do mês · sem fora do Umov` : '')}
    ${tile(`Acumulado ${ano}`, BRL(acum), `projeção do ano ${BRLk(proj)}`)}
  </div>
  <div class="ggrid">
    <section class="gcard"><h3>Composição do custo</h3>
      ${semReal ? '<p class="nota">Sem fechamento neste mês.</p>' : `<div class="gstack">${comp.map(x => `<i style="width:${100 * x[1] / base}%;background:${x[2]}" title="${x[0]}: ${BRL(x[1])}"></i>`).join('')}</div>
      <table class="gtab gpop"><tbody>${comp.map(x => `<tr data-pop="${x[0]}" title="Clique para abrir por cliente"><td><i class="gdot" style="background:${x[2]}"></i>${x[0]} <span class="gseta">›</span></td><td class="n">${BRL(x[1])}</td><td class="n gmut">${Math.round(100 * x[1] / base)}%</td></tr>`).join('')}
        <tr class="gtot"><td>Realizado no mês</td><td class="n">${BRL(comp.reduce((a, x) => a + x[1], 0))}</td><td></td></tr>
        ${ajNeg < -0.5 ? `<tr data-pop="Ajustes de fatura" title="Clique para ver por parceiro"><td><i class="gdot" style="background:var(--off)"></i>Ajustes de fatura e adiantamentos <span class="gseta">›</span></td><td class="n">${BRL(ajNeg)}</td><td></td></tr>` : ''}
        ${desc ? `<tr data-pop="Descontos" title="Clique para abrir por categoria"><td><i class="gdot" style="background:var(--eco)"></i>Descontos <span class="gseta">›</span></td><td class="n eco">${BRL(desc)}</td><td></td></tr>` : ''}
        <tr class="gtot"><td>Total</td><td class="n">${BRL(custo)}</td><td></td></tr></tbody></table>`}
    </section>
    <section class="gcard"><h3>Mês a mês · ${ano}</h3>
      <div class="gmeses">${serie.map(s => `<div class="gmes${s.c.id === c.id ? ' on' : ''}" data-comp="${s.c.id}" title="${nomeMes(s.c.mes)}: ${s.v ? BRL(s.v) + ' (malote ' + BRL(s.v - s.k) + ' + Kits/Spot ' + BRL(s.k) + ')' : 'sem fechamento'}${s.p ? ' · previsto ' + BRL(s.p) : ''}">
        <div class="gcol"><i class="gp" style="height:${100 * s.p / maxS}%"></i><i class="gv" style="height:${100 * s.v / maxS}%"></i><i class="gk" style="height:${100 * s.k / maxS}%"></i></div><span>${MES3[+s.c.mes.slice(5, 7) - 1]}</span></div>`).join('')}</div>
      <p class="nota" style="margin:6px 0 0"><i class="gdot" style="background:var(--ink);opacity:.8"></i>custo total <i class="gdot" style="background:var(--brand);margin-left:10px"></i>parte de Kits/Spot (na base da coluna) <i class="gdot" style="background:var(--surface);border:1px solid var(--ink);margin-left:10px"></i>previsto (malote) · clique no mês para trocar</p>
    </section>
    <section class="gcard"><h3>Maiores custos do mês</h3>
      <table class="gtab"><tbody>${top.map(x => `<tr><td>${esc(x.p.regiao || '—')}</td><td class="gbarc"><div class="gbar fina"><i style="width:${top[0] ? 100 * x.v / top[0].v : 0}%"></i></div></td><td class="n">${BRL(x.v)}</td><td class="n gmut">${custo ? Math.round(100 * x.v / custo) : 0}%</td></tr>`).join('') || '<tr><td class="nota">Sem fechamento.</td></tr>'}</tbody></table>
      ${top.length ? `<p class="nota" style="margin:6px 0 0">Os 5 maiores somam ${custo ? Math.round(100 * top.reduce((a, x) => a + x.v, 0) / custo) : 0}% do custo.</p>` : ''}
    </section>
    <section class="gcard"><h3>Pontos de atenção</h3>
      <ul class="gal">
        ${pend > 0 ? `<li><b>${pend}</b> parceiro(s) ainda sem fechamento</li>` : '<li class="ok">Todos os parceiros fechados</li>'}
        ${(D.quinz || []).filter(r => r.mes <= c.mes).map(r => `<li><b>Quinzena sem fechamento:</b> ${esc(pm[r.parceiro_id]?.regiao || '—')}, ${fmtD(r.de)} a ${fmtD(r.ate)} (${r.dias_uteis} dias úteis)</li>`).join('')}
        ${acima.length ? `<li><b>${acima.length}</b> parceiro(s) com malote mais de 10% acima do previsto: ${acima.slice(0, 4).map(r => esc(pm[r.parceiro_id]?.regiao || '—')).join(', ')}${acima.length > 4 ? '…' : ''}</li>` : semReal ? '' : '<li class="ok">Nenhum parceiro mais de 10% acima do previsto</li>'}
        ${varr.length ? `<li>Maiores aumentos sobre ${ant ? MES3[+ant.mes.slice(5, 7) - 1] : 'o mês anterior'}: ${varr.slice(0, 3).map(x => `${esc(x.p.regiao)} <b>+${BRL(x.d)}</b>`).join(' · ')}</li>` : ''}
        ${aPagar > 0.5 && !semReal && !semRegistroPag ? `<li><b>${BRL(aPagar)}</b> ainda a pagar neste mês</li>` : ''}
      </ul>
    </section>
  </div>
  <section class="gcard" id="gevol"></section></div>`;
  evolucaoPracas($('#gevol'), D, c);
  box.querySelectorAll('[data-comp]').forEach(e => e.onclick = () => { D.compId = e.dataset.comp; desenharDiretoria(box.closest('main') || $('#main')); });
  box.querySelectorAll('[data-irmapa]').forEach(e => e.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); D.aba = 'mapa'; desenharDiretoria(box.closest('main') || $('#main')); });
  const redes = () => visaoGeral(box, D, c, ant);
  box.querySelectorAll('[data-pop]').forEach(e => e.onclick = () => popComposicao(e.dataset.pop, D, c, ant));
  box.querySelectorAll('[data-gres]').forEach(e => e.onclick = () => { D.gresAberto = !D.gresAberto; redes(); if (D.gresAberto) setTimeout(() => { const d = $('#gresdet'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50); });
  box.querySelectorAll('[data-gp]').forEach(e => e.onclick = () => { D.gresPer = e.dataset.gp; redes(); });
  box.querySelectorAll('[data-gs]').forEach(e => e.onclick = () => { const k = e.dataset.gs; const [sk, sd] = D.gresSort || ['total', -1]; D.gresSort = [k, sk === k ? -sd : (k === 'praca' ? 1 : -1)]; redes(); });
  const gx = $('#gresx'); if (gx) gx.onclick = () => { const { L, per } = D.gresLista;
    baixarXlsx(`Economia_por_praca_${per === 'ano' ? c.mes.slice(0, 4) + '_ate_' + c.mes.slice(5, 7) : c.mes.slice(0, 7)}.xlsx`, { titulo: 'Economia gerada pela GSM por praça', sub: per === 'ano' ? `${c.mes.slice(0, 4)} até ${nomeMes(c.mes)}` : nomeMes(c.mes), abas: [{ nome: 'Economia por praça', linhas: L.map(x => ({ 'Praça': x.p.regiao, 'Parceiro': x.p.nome, 'Tipo': x.p.tipo, 'Previsto': +x.prev.toFixed(2), 'Malote pago': +x.mal.toFixed(2), 'Abaixo do previsto': +x.abaixo.toFixed(2), 'Acima do previsto': +x.acima.toFixed(2), 'Descontos': +x.desc.toFixed(2), 'Save': +x.save.toFixed(2), 'Economia': +x.total.toFixed(2) })) }] }); };
}

// Evolução mês a mês por praça (Visão geral): gráfico de linhas das praças escolhidas + tabela com o valor de cada mês
const EV_CORES = ['var(--ink)', 'var(--brand)', '#2F6DB5', '#4B5563', '#A87422', '#7A4FB0', '#0F8A8A', '#B5527A'];
function evolucaoPracas(box, D, c) {
  if (!box) return;
  const n = v => Number(v) || 0;
  const met = D.evMet || 'tudo', baseK = D.evBase || 'ant', esc_ = D.evEsc || 'rs';
  const val = r => met === 'malote' ? n(r.malote) : met === 'kits' ? n(r.kits) + n(r.fora_umov) : n(r.valor_aprovado ?? r.valor_final);
  const ano = c.mes.slice(0, 4), mSel = +c.mes.slice(5, 7);
  // meses do ano até o selecionado; se o mês selecionado ainda não tem fechamento, para no último que tem
  let meses = D.comps.filter(x => x.mes.slice(0, 4) === ano && +x.mes.slice(5, 7) <= mSel);
  while (meses.length > 1 && !D.fech.some(f => f.competencia_id === meses[meses.length - 1].id)) meses = meses.slice(0, -1);
  const mi = Object.fromEntries(meses.map((x, i) => [x.id, i]));
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p]));
  const R = {};
  D.fech.forEach(f => { const i = mi[f.competencia_id]; if (i == null) return; const x = R[f.parceiro_id] || (R[f.parceiro_id] = { id: f.parceiro_id, p: pm[f.parceiro_id] || {}, v: Array(meses.length).fill(null) }); x.v[i] = (x.v[i] || 0) + val(f); });
  // quem era o parceiro (nome e razão social) em cada mês, para mostrar as trocas na mesma praça
  const NM = {}; (D.nomesMes || []).forEach(r => { const i = mi[r.competencia_id]; if (i != null) (NM[r.parceiro_id] || (NM[r.parceiro_id] = []))[i] = r; });
  const nmDe = (id, i) => (NM[id] || [])[i] || null;
  const chave = r => r ? norm((r.nome || '') + '|' + (r.razao_social || '')) : '';
  const trocas = id => { const out = []; let ant = null; meses.forEach((m, i) => { const r = nmDe(id, i); if (!r) return; if (ant && chave(ant) !== chave(r)) out.push({ i, de: ant, para: r }); ant = r; }); return out; };
  const curto = t => String(t || '').split(/\s+/).slice(0, 2).join(' ');
  const rotTroca = t => norm(t.de.nome || '') !== norm(t.para.nome || '') ? `${t.de.nome} → ${t.para.nome}` : `${curto(t.de.razao_social)} → ${curto(t.para.razao_social)}`;
  const nmTxt = r => r ? `${esc(r.nome || '')}${r.razao_social && norm(r.razao_social) !== norm(r.nome || '') ? ' · ' + esc(r.razao_social) : ''}` : '';
  const iC = meses.length - 1; const mFim = MES3[+meses[iC].mes.slice(5, 7) - 1];
  let L = Object.values(R).map(x => {
    const atual = x.v[iC];
    const iB = baseK === 'ant' ? iC - 1 : x.v.findIndex(v => v > 0.5);
    const base = iB >= 0 && iB < iC ? x.v[iB] : null;
    const d = atual != null && base != null ? atual - base : null;
    return { ...x, atual, base, d, pc: d != null && base ? d / base : null, tot: x.v.reduce((a, v) => a + (v || 0), 0) };
  });
  const rotBase = baseK === 'ant' ? (meses[iC - 1] ? MES3[+meses[iC - 1].mes.slice(5, 7) - 1] : '—') : 'o 1º mês do ano';
  const sobe = L.filter(x => x.d > 0.5), desce = L.filter(x => x.d < -0.5);
  if (!D.evSel) D.evSel = L.filter(x => x.d != null).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5).map(x => x.id);
  const sel = D.evSel.filter(id => R[id]);
  if (D.evFiltro) { const f = norm(D.evFiltro); L = L.filter(x => norm((x.p.regiao || '') + ' ' + (x.p.nome || '')).includes(f)); }
  const [sk, sd] = D.evSort || ['abs', -1];
  const key = x => sk === 'praca' ? (x.p.regiao || '') : sk === 'abs' ? Math.abs(x.d ?? 0) : sk === 'd' ? (x.d ?? 0) : sk === 'pc' ? (x.pc ?? 0) : sk === 'tot' ? x.tot : sk.startsWith('m') ? (x.v[+sk.slice(1)] ?? -1e15) : 0;
  L.sort((a, b) => sk === 'praca' ? sd * key(a).localeCompare(key(b)) : sd * (key(a) - key(b)));
  const cor = id => EV_CORES[sel.indexOf(id) % EV_CORES.length];
  const MET = { tudo: 'Total', malote: 'Malote', kits: 'Kits/Spot' };
  const alt = (attr, opts, cur) => `<div class="alterna" role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">${opts.map(([k, t]) => `<button type="button" ${attr}="${k}" style="font:inherit;font-size:13px;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;${cur === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${t}</button>`).join('')}</div>`;
  const th = (k, t, cls = 'n') => `<th class="${cls}" data-es="${k}" style="cursor:pointer;white-space:nowrap">${t}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  // célula do mês: fundo pela variação sobre o mês anterior do mesmo parceiro
  const cel = (x, i) => { const v = x.v[i]; if (v == null) return '<td class="n gmut">—</td>'; const a = i > 0 ? x.v[i - 1] : null; const q = a ? v / a - 1 : 0;
    const k = Math.min(1, Math.abs(q) / 0.3); const bg = a && Math.abs(q) >= 0.02 ? `background:color-mix(in srgb, ${q > 0 ? 'var(--brand)' : 'var(--eco)'} ${Math.round(8 + 30 * k)}%, transparent)` : '';
    const nm = nmDe(x.id, i); const tr = trocas(x.id).some(t => t.i === i);
    return `<td class="n" style="${bg}${tr ? ';box-shadow:inset 3px 0 0 var(--ink)' : ''}" title="${esc(x.p.regiao || '')} · ${MES3[+meses[i].mes.slice(5, 7) - 1]}: ${BRL(v)}${a ? ` (${pct(q)} sobre o mês anterior)` : ''}${nm ? '\n' + esc(nm.nome || '') + ' · ' + esc(nm.razao_social || '') + (nm.cnpj ? ' · ' + esc(nm.cnpj) : '') : ''}${tr ? '\nTroca de parceiro neste mês' : ''}">${BRL(v)}</td>`; };
  box.innerHTML = `<div class="linha" style="justify-content:space-between;align-items:center;gap:10px"><h3>Evolução por praça · ${ano} até ${mFim}</h3>
    <div class="linha" style="gap:8px">${alt('data-em', Object.entries(MET), met)}${alt('data-eb', [['ant', 'Sobre o mês anterior'], ['inicio', 'Sobre o 1º mês']], baseK)}</div></div>
  <p class="sub" style="margin:0">${mFim} contra ${rotBase} (${MET[met].toLowerCase()}): <b style="color:var(--brand-deep)">${sobe.length} praça(s) aumentaram, +${BRL(sobe.reduce((a, x) => a + x.d, 0))}</b> · <b style="color:var(--eco)">${desce.length} reduziram, −${BRL(-desce.reduce((a, x) => a + x.d, 0))}</b>. Marque as praças na tabela para ver as linhas no gráfico.</p>
  <div class="linha" style="gap:6px;flex-wrap:wrap">${sel.map(id => `<button type="button" data-ex="${id}" style="font:inherit;font-size:13px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 10px;cursor:pointer"><i class="gdot" style="background:${cor(id)}"></i>${esc(R[id].p.regiao || '—')} ✕</button>`).join('')}${sel.length ? '<button type="button" data-exall style="font:inherit;font-size:13px;border:0;background:none;color:var(--muted);cursor:pointer;text-decoration:underline">limpar</button>' : ''}</div>
  <div class="linha" style="justify-content:flex-end">${alt('data-ee', [['rs', 'Gráfico em R$'], ['idx', 'Gráfico em % sobre o 1º mês']], esc_)}</div>
  <div id="evgraf" style="position:relative"></div>
  <div class="linha" style="justify-content:space-between;align-items:center"><input id="evfiltro" class="peq" placeholder="Filtrar praça ou parceiro" value="${esc(D.evFiltro || '')}" style="min-width:220px"><button class="btn sec peq" id="evx">Baixar Excel</button></div>
  <div class="tabela" style="max-height:560px;overflow:auto"><table class="gtab" style="font-size:13px"><thead><tr><th style="width:28px"></th>${th('praca', 'Praça', '')}${th('d', 'Variação R$')}${th('pc', 'Var. %')}${th('tot', `Total ${MES3[+meses[0].mes.slice(5, 7) - 1]}–${mFim}`)}${meses.map((x, i) => th('m' + i, MES3[+x.mes.slice(5, 7) - 1])).join('')}</tr></thead><tbody>
  ${L.map(x => `<tr data-er="${x.id}" style="cursor:pointer"><td><input type="checkbox" ${sel.includes(x.id) ? 'checked' : ''} aria-label="Mostrar no gráfico" style="accent-color:${sel.includes(x.id) ? cor(x.id) : 'var(--ink)'}"></td><td style="white-space:nowrap"><b>${esc(x.p.regiao || '—')}</b><br><span class="gmut">${esc(x.p.nome || '')}</span>${trocas(x.id).map(t => `<br><span class="pill" style="font-size:11px" title="${esc((t.de.razao_social || '') + ' → ' + (t.para.razao_social || ''))}">troca em ${MES3[+meses[t.i].mes.slice(5, 7) - 1]}: ${esc(rotTroca(t))}</span>`).join('')}</td>
    <td class="n" style="font-weight:600;white-space:nowrap;color:${x.d > 0.5 ? 'var(--brand-deep)' : x.d < -0.5 ? 'var(--eco)' : 'inherit'}">${x.d == null ? '—' : (x.d > 0 ? '+' : '') + BRL(x.d)}</td><td class="n" style="color:${x.d > 0.5 ? 'var(--brand-deep)' : x.d < -0.5 ? 'var(--eco)' : 'inherit'}">${pct(x.pc)}</td><td class="n" style="font-weight:600;border-right:1px solid var(--rule)">${BRL(x.tot)}</td>${meses.map((m, i) => cel(x, i)).join('')}</tr>`).join('')}
  </tbody><tfoot><tr><td></td><td><b>Total (${L.length})</b></td><td class="n"><b>${(() => { const t = L.reduce((a, x) => a + (x.d || 0), 0); return (t > 0 ? '+' : '') + BRL(t); })()}</b></td><td></td><td class="n" style="border-right:1px solid var(--rule)"><b>${BRL(L.reduce((a, x) => a + x.tot, 0))}</b></td>${meses.map((m, i) => `<td class="n"><b>${BRL(L.reduce((a, x) => a + (x.v[i] || 0), 0))}</b></td>`).join('')}</tr></tfoot></table></div>
  <p class="nota" style="margin:0">Cor da célula: variação sobre o mês anterior da mesma praça (vermelho subiu, verde caiu; mais forte = maior variação, até 30%). Variação = ${mFim} − ${baseK === 'ant' ? rotBase : 'primeiro mês com fechamento no ano'}. Barra preta à esquerda da célula e círculo no gráfico: troca de parceiro naquele mês. Passe o mouse para ver o parceiro e a razão social de cada mês. Clique na linha para incluir ou tirar a praça do gráfico; clique no título da coluna para ordenar.</p>`;
  // gráfico de linhas
  const g = box.querySelector('#evgraf');
  const series = sel.map(id => R[id]);
  if (!series.length) g.innerHTML = '<p class="nota" style="margin:0">Nenhuma praça marcada.</p>';
  else {
    const W = 900, H = 280, Lm = 70, Rm = 16, T = 16, B = 30;
    const idx = esc_ === 'idx';
    const pv = s => { if (!idx) return s.v; const b0 = s.v.find(v => v > 0.5); return s.v.map(v => v == null || !b0 ? null : (v / b0 - 1) * 100); };
    const PV = Object.fromEntries(series.map(s => [s.id, pv(s)]));
    const fmtY = t => idx ? (t > 0 ? '+' : '') + Math.round(t) + '%' : BRLk(t);
    const vals = series.flatMap(s => PV[s.id].filter(v => v != null)); let lo = Math.min(...vals, idx ? 0 : Infinity), hi = Math.max(...vals, idx ? 0 : -Infinity); if (hi - lo < 1) { hi += idx ? 5 : 500; lo -= idx ? 5 : 500; }
    const pad = (hi - lo) * 0.08; lo = idx ? lo - pad : Math.max(0, lo - pad); hi += pad;
    const xs = i => Lm + (meses.length === 1 ? (W - Lm - Rm) / 2 : i * (W - Lm - Rm) / (meses.length - 1)); const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const ticks = [lo, (lo + hi) / 2, hi];
    const path = s => { let d = '', pen = false; PV[s.id].forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
    g.innerHTML = `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:560px;height:auto;display:block" role="img" aria-label="Evolução mensal das praças marcadas">
      ${ticks.map(t => `<line x1="${Lm}" x2="${W - Rm}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)"/><text x="${Lm - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="var(--muted)" font-family="Poppins">${fmtY(t)}</text>`).join('')}
      ${idx ? `<line x1="${Lm}" x2="${W - Rm}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)"/>` : ''}
      ${meses.map((x, i) => `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="${i === iC ? 'var(--brand-deep)' : 'var(--muted)'}" font-weight="${i === iC ? 600 : 400}" font-family="Poppins">${MES3[+x.mes.slice(5, 7) - 1]}</text>`).join('')}
      <line id="evcur" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--on-dark)" stroke-dasharray="3 3" visibility="hidden"/>
      ${series.map(s => `<path d="${path(s)}" fill="none" stroke="${cor(s.id)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${PV[s.id].map((v, i) => v == null ? '' : `<circle cx="${xs(i)}" cy="${y(v)}" r="${i === iC ? 4.5 : 3}" fill="${cor(s.id)}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}`).join('')}
      ${series.flatMap(s => trocas(s.id).filter(t => PV[s.id][t.i] != null).map(t => `<g><circle cx="${xs(t.i)}" cy="${y(PV[s.id][t.i])}" r="8" fill="none" stroke="${cor(s.id)}" stroke-width="2"/><text x="${xs(t.i)}" y="${y(PV[s.id][t.i]) - 13}" text-anchor="middle" font-size="11" font-weight="600" fill="${cor(s.id)}" font-family="Poppins" stroke="var(--surface)" stroke-width="4" paint-order="stroke">troca: ${esc(rotTroca(t))}</text></g>`)).join('')}
      ${meses.map((x, i) => { const w = (W - Lm - Rm) / Math.max(1, meses.length - 1); return `<rect data-ei="${i}" x="${xs(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}" fill="transparent"/>`; }).join('')}
    </svg></div><div id="evtip" hidden style="position:absolute;pointer-events:none;background:var(--panel);color:var(--on-panel);font-size:13px;padding:8px 10px;border-radius:6px;white-space:nowrap;z-index:2"></div>`;
    const tip = g.querySelector('#evtip'), cur = g.querySelector('#evcur');
    g.querySelectorAll('rect[data-ei]').forEach(r => { r.onmousemove = e => { const i = +r.dataset.ei; cur.setAttribute('x1', xs(i)); cur.setAttribute('x2', xs(i)); cur.setAttribute('visibility', 'visible');
        tip.innerHTML = `<b>${nomeMes(meses[i].mes)}</b>` + series.slice().sort((a, b) => (b.v[i] ?? -1) - (a.v[i] ?? -1)).map(s => { const v = s.v[i], a = i > 0 ? s.v[i - 1] : null; const q = PV[s.id][i]; return `<br><i class="gdot" style="background:${cor(s.id)};box-shadow:0 0 0 1.5px #fff"></i>${esc(s.p.regiao || '—')}: ${v == null ? '—' : BRL(v)}${v != null && a ? ` <span style="color:var(--on-dark)">${pct(v / a - 1)} no mês</span>` : ''}${idx && q != null ? ` <span style="color:var(--on-dark)">· ${q > 0 ? '+' : ''}${q.toFixed(1).replace('.', ',')}% no ano</span>` : ''}${nmDe(s.id, i) ? `<br><span style="color:var(--on-dark);padding-left:16px">${nmTxt(nmDe(s.id, i))}</span>` : ''}${trocas(s.id).some(t => t.i === i) ? `<br><span style="color:#F0C2CC;padding-left:16px">↺ troca de parceiro neste mês (antes: ${nmTxt(trocas(s.id).find(t => t.i === i).de)})</span>` : ''}`; }).join('');
        tip.hidden = false; const b = g.getBoundingClientRect(); tip.style.left = Math.max(0, Math.min(e.clientX - b.left + 14, b.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = Math.max(0, e.clientY - b.top - tip.offsetHeight - 10) + 'px'; };
      r.onmouseleave = () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); }; });
  }
  const re = () => evolucaoPracas(box, D, c);
  box.querySelectorAll('[data-em]').forEach(b => b.onclick = () => { D.evMet = b.dataset.em; re(); });
  box.querySelectorAll('[data-eb]').forEach(b => b.onclick = () => { D.evBase = b.dataset.eb; re(); });
  box.querySelectorAll('[data-ee]').forEach(b => b.onclick = () => { D.evEsc = b.dataset.ee; re(); });
  box.querySelectorAll('[data-es]').forEach(b => b.onclick = () => { const k = b.dataset.es; D.evSort = [k, sk === k ? -sd : (k === 'praca' ? 1 : -1)]; re(); });
  box.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { D.evSel = sel.filter(id => id !== b.dataset.ex); re(); });
  box.querySelectorAll('[data-exall]').forEach(b => b.onclick = () => { D.evSel = []; re(); });
  box.querySelectorAll('[data-er]').forEach(tr => tr.onclick = () => { const id = tr.dataset.er; D.evSel = sel.includes(id) ? sel.filter(x => x !== id) : sel.concat(id).slice(-EV_CORES.length); re(); });
  const fi = box.querySelector('#evfiltro'); fi.oninput = () => { D.evFiltro = fi.value; const pos = fi.selectionStart; re(); const f2 = box.querySelector('#evfiltro'); f2.focus(); f2.setSelectionRange(pos, pos); };
  box.querySelector('#evx').onclick = () => baixarXlsx(`Evolucao_por_praca_${ano}_ate_${c.mes.slice(5, 7)}.xlsx`, { titulo: `Evolução por praça · ${MET[met]}`, sub: `${ano} até ${nomeMes(c.mes)} · variação sobre ${rotBase}`,
    abas: [{ nome: 'Evolução por praça', linhas: L.map(x => Object.assign({ 'Praça': x.p.regiao, 'Parceiro': x.p.nome, 'Trocas de parceiro': trocas(x.id).map(t => `${MES3[+meses[t.i].mes.slice(5, 7) - 1]}: ${t.de.nome} (${t.de.razao_social}) → ${t.para.nome} (${t.para.razao_social})`).join('; ') }, Object.fromEntries(meses.map((m, i) => [MES3[+m.mes.slice(5, 7) - 1], x.v[i] == null ? null : +x.v[i].toFixed(2)])), { 'Total do período': +x.tot.toFixed(2), 'Variação R$': x.d == null ? null : +x.d.toFixed(2), 'Variação %': x.pc == null ? null : +(x.pc * 100).toFixed(1) })) }] });
}

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
    ${(() => { const meses = D.comps.filter(k => k.mes.slice(0, 4) === ano && +k.mes.slice(5, 7) <= mesSel); const gm = ganhosMes(D, c.id); const ga = meses.map(k => ganhosMes(D, k.id)).reduce((a, g) => ({ total: a.total + g.total, val: a.val + g.val, desc: a.desc + g.desc, save: a.save + g.save }), { total: 0, val: 0, desc: 0, save: 0 });
      return `<div class="kpi eco"><small>Economia em ${MES3[mesSel - 1]}</small><b>${BRL(gm.total)}</b><span>validação ${kE(gm.val)} · descontos ${kE(gm.desc)} · save ${kE(gm.save)}</span></div>
    <div class="kpi eco"><small>Economia no ano (${MES3[0]}–${MES3[mesSel - 1]})</small><b>${BRL(ga.total)}</b><span>validação ${kE(ga.val)} · descontos ${kE(ga.desc)} · save ${kE(ga.save)}</span></div>`; })()}
  </div>
  <p class="nota">Projeção = valor realizado de ${MES3[0]} a ${MES3[ultimoReal - 1]} + calendarizado dos meses seguintes (${base.join(', ') || 'nenhum'}). O calendarizado cobre o malote; kits/spot e descontos dos meses futuros não entram até acontecerem.</p>`;
}

// Ponte de variação entre dois meses (Tudo)
function ponte(box, D, c, ant) {
  const cur = D.fech.filter(f => f.competencia_id === c.id); const prv = ant ? D.fech.filter(f => f.competencia_id === ant.id) : [];
  if (!ant || !cur.length || !prv.length) { box.innerHTML = `<p class="nota">${!cur.length ? 'Este mês ainda não tem fechamento.' : 'Não há mês anterior para comparar.'}</p>`; return; }
  const n = v => Number(v) || 0; const tot = r => valorOp(r, 'tudo'); const bruto = r => tot(r) - n(r.descontos);
  const outr = r => tot(r) - n(r.malote) - n(r.kits) - n(r.atend_extra) - n(r.descontos);
  const pA = Object.fromEntries(prv.map(r => [r.parceiro_id, r])); const pC = Object.fromEntries(cur.map(r => [r.parceiro_id, r]));
  const cont = cur.filter(r => pA[r.parceiro_id]);
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p])); const nomeP = id => pm[id]?.regiao || '—';
  const prevDe = id => Object.fromEntries(D.prev.filter(f => f.competencia_id === id && f.previsto != null).map(f => [f.parceiro_id, n(f.previsto)]));
  const ppA = prevDe(ant.id), ppC = prevDe(c.id);
  const mA = MES3[+ant.mes.slice(5, 7) - 1], mC = MES3[+c.mes.slice(5, 7) - 1];
  // contribuição de cada parceiro em cada passo (para a dica ao passar o mouse)
  const P = { prev: [], val: [], kits: [], atx: [], outros: [], desc: [], novos: [], sairam: [] };
  cont.forEach(r => { const a = pA[r.parceiro_id], id = r.parceiro_id; const dMal = n(r.malote) - n(a.malote);
    // validação: quanto o malote pago ficou abaixo do previsto (economia) mudou de um mês para o outro
    const val = ppA[id] != null && ppC[id] != null && fechado(r) && fechado(a) ? -((ppC[id] - n(r.malote)) - (ppA[id] - n(a.malote))) : 0;
    P.val.push([id, val]); P.prev.push([id, dMal - val]); P.kits.push([id, n(r.kits) - n(a.kits)]); P.atx.push([id, n(r.atend_extra) - n(a.atend_extra)]); P.outros.push([id, outr(r) - outr(a)]); });
  cur.forEach(r => P.desc.push([r.parceiro_id, n(r.descontos)]));
  cur.filter(r => !pA[r.parceiro_id]).forEach(r => P.novos.push([r.parceiro_id, bruto(r)]));
  prv.filter(r => !pC[r.parceiro_id]).forEach(r => P.sairam.push([r.parceiro_id, -bruto(r)]));
  const S_ = k => P[k].reduce((a, [, v]) => a + v, 0);
  const vA = prv.reduce((a, r) => a + tot(r), 0), vC = cur.reduce((a, r) => a + tot(r), 0);
  const dA = prv.reduce((a, r) => a + n(r.descontos), 0), vAb = vA - dA;
  const gA = ganhosMes(D, ant.id), gC = ganhosMes(D, c.id);
  const DEF = { prev: ['Malote: carteira e volume', 'Variação do malote sem o efeito da validação: pontos que entraram ou saíram, frequência, preço.'],
    val: ['Validação do malote', 'Mudança da economia por pagar só o realizado (previsto − malote pago), parceiros que fecharam nos dois meses.'],
    kits: ['Kits/Spot', 'Variação de kits e spots.'], atx: [ATX, 'Visitas além do contrato.'], outros: ['Outros ajustes', 'Serviços fora do Umov, ajustes e adiantamentos já pagos.'],
    desc: [`Descontos de ${mC}`, `Todos os descontos aplicados em ${mC} (repasses, penalidades, ajustes e antecipações).`],
    novos: [`Parceiros novos (${P.novos.length})`, `Parceiros com fechamento em ${mC} e não em ${mA} (sem descontos).`], sairam: [`Sem fechamento em ${mC} (${P.sairam.length})`, `Parceiros que fecharam em ${mA} e ainda não têm fechamento em ${mC} (sem descontos).`] };
  // vermelho (aumenta) de um lado, verde (reduz) do outro; descontos sempre por último
  const passos = Object.keys(DEF).filter(k => k !== 'desc').map(k => ({ k, v: S_(k) })).filter(x => Math.abs(x.v) >= 0.5)
    .sort((a, b) => (b.v > 0) - (a.v > 0) || Math.abs(b.v) - Math.abs(a.v));
  if (Math.abs(S_('desc')) >= 0.5) passos.push({ k: 'desc', v: S_('desc') });
  const barras = [{ rot: `${mA} sem descontos`, ini: 0, fim: vAb, tipo: 'total', k: 'iniA' }]; let acc = vAb;
  passos.forEach(x => { barras.push({ rot: DEF[x.k][0], ini: acc, fim: acc + x.v, tipo: x.v >= 0 ? 'sobe' : 'eco', v: x.v, k: x.k }); acc += x.v; });
  barras.push({ rot: mC, ini: 0, fim: vC, tipo: 'total', k: 'fimC' });
  const lo = Math.min(...barras.filter(b => b.tipo !== 'total').map(b => Math.min(b.ini, b.fim)), vAb, vC) * 0.97;
  const hi = Math.max(...barras.map(b => Math.max(b.ini, b.fim))) * 1.01;
  const W = 900, H = 290, L = 70, R = 12, T = 24, B = 58; const bw = (W - L - R) / barras.length; const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const cor = { total: 'var(--ink)', sobe: 'var(--brand)', eco: 'var(--eco)' };
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '') + BRL(Math.abs(v));
  const dG = gC.total - gA.total;
  box.innerHTML = `<div class="kpis" style="margin:0 0 6px">
    <div class="kpi eco"><small>Economia gerada em ${mA}</small><b>${BRL(gA.total)}</b><span>validação ${kE(gA.val)} · descontos ${kE(gA.desc)} · save ${kE(gA.save)}</span></div>
    <div class="kpi eco"><small>Economia gerada em ${mC}</small><b>${BRL(gC.total)}</b><span>validação ${kE(gC.val)} · descontos ${kE(gC.desc)} · save ${kE(gC.save)}</span></div>
    <div class="kpi ${dG >= 0 ? 'eco' : 'alerta'}"><small>Diferença na economia</small><b>${(dG > 0 ? '+' : '') + BRL(dG)}</b><span>${dG >= 0 ? 'a GSM economizou mais que no mês anterior' : 'a GSM economizou menos que no mês anterior'}</span></div></div>
  <p class="sub" style="margin:0">Variação do custo: <b>${sinal(vC - vA)}</b> (${pct(vC / vA - 1)}), de ${BRL(vA)} em ${mA} para ${BRL(vC)} em ${mC}. A cascata parte de ${mA} <b>sem descontos</b> (${BRL(vAb)}) para mostrar <b style="color:var(--eco)">todos os descontos de ${mC} (${BRL(S_('desc'))})</b>. <b style="color:var(--brand-deep)">Vermelho aumenta</b> o custo, <b style="color:var(--eco)">verde reduz</b>. Passe o mouse em cada barra para ver os parceiros.</p>
  <div style="position:relative" id="pwrap"><div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:680px;height:auto;display:block" role="img" aria-label="Ponte de variação">
    ${[lo, (lo + hi) / 2, hi].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="var(--muted)" font-family="Poppins">${BRLk(t)}</text>`).join('')}
    ${barras.map((b, i) => { const x = L + i * bw + bw * 0.16, w = bw * 0.68; const top = y(Math.max(b.ini, b.fim)), bot = b.tipo === 'total' ? y(lo) : y(Math.min(b.ini, b.fim));
      const lbl = b.tipo === 'total' ? BRLk(b.fim) : (b.v > 0 ? '+' + BRLk(b.v) : '−' + BRLk(-b.v));
      return `<g data-pi="${i}" style="cursor:pointer"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B + 40}" fill="transparent"/><rect x="${x}" y="${top}" width="${w}" height="${Math.max(2, bot - top)}" rx="3" fill="${cor[b.tipo]}"/>
        ${i < barras.length - 1 ? `<line x1="${x + w}" x2="${x + bw}" y1="${y(b.fim)}" y2="${y(b.fim)}" stroke="var(--on-dark)" stroke-dasharray="3 3"/>` : ''}
        <text x="${x + w / 2}" y="${top - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)" font-family="Poppins">${lbl}</text>
        <foreignObject x="${L + i * bw}" y="${H - B + 6}" width="${bw}" height="${B - 6}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:12px Poppins,sans-serif;color:var(--muted);text-align:center;line-height:1.2">${esc(b.rot)}</div></foreignObject></g>`; }).join('')}
  </svg></div><div id="ptip" hidden style="position:absolute;pointer-events:none;background:var(--panel);color:var(--on-panel);font-size:13px;padding:10px 12px;border-radius:8px;z-index:3;max-width:360px;box-shadow:0 4px 18px rgba(0,0,0,.25)"></div></div>
  ${(() => { const dif = cont.map(r => ({ p: pm[r.parceiro_id] || {}, d: tot(r) - tot(pA[r.parceiro_id]) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
    return `<div class="tabela"><table><thead><tr><th>Maiores variações por parceiro</th><th class="n">${mA}</th><th class="n">${mC}</th><th class="n">Diferença</th></tr></thead><tbody>
    ${dif.map(x => `<tr><td>${esc(x.p.regiao || '—')}</td><td class="n">${BRL(tot(pA[x.p.id]))}</td><td class="n">${BRL(tot(pC[x.p.id]))}</td><td class="n" style="color:${x.d > 0 ? 'var(--brand-deep)' : 'var(--eco)'}">${(x.d > 0 ? '+' : '') + BRL(x.d)}</td></tr>`).join('')}
    ${P.novos.map(([id, v]) => `<tr><td>${esc(nomeP(id))} <span class="pill">novo</span></td><td class="n">—</td><td class="n">${BRL(tot(pC[id]))}</td><td class="n" style="color:var(--brand-deep)">+${BRL(tot(pC[id]))}</td></tr>`).join('')}
    ${P.sairam.map(([id]) => `<tr><td>${esc(nomeP(id))} <span class="pill">sem fechamento em ${mC}</span></td><td class="n">${BRL(tot(pA[id]))}</td><td class="n">—</td><td class="n" style="color:var(--eco)">−${BRL(tot(pA[id]))}</td></tr>`).join('')}
    </tbody></table></div>`; })()}`;
  const tip = box.querySelector('#ptip'), wrap = box.querySelector('#pwrap');
  const conteudo = b => {
    if (b.k === 'iniA') return `<b>${mA}</b><br>Custo do mês: ${BRL(vA)}<br>Descontos de ${mA}: ${BRL(dA)}<br>Sem descontos: <b>${BRL(vAb)}</b>`;
    if (b.k === 'fimC') return `<b>${mC}</b><br>Custo do mês: <b>${BRL(vC)}</b><br>Descontos de ${mC}: ${BRL(S_('desc'))}<br>${sinal(vC - vA)} sobre ${mA} (${pct(vC / vA - 1)})`;
    const ls = P[b.k].filter(([, v]) => Math.abs(v) >= 0.5).sort((x, z) => Math.abs(z[1]) - Math.abs(x[1])); const sobe = ls.filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0), desce = ls.filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0);
    return `<b>${esc(DEF[b.k][0])}: ${sinal(b.v)}</b><br><span style="color:var(--on-dark)">${esc(DEF[b.k][1])}</span>${ls.length > 1 && sobe && desce ? `<br><span style="color:#F0C2CC">aumentos ${sinal(sobe)}</span> · <span style="color:#8FE0B0">reduções ${sinal(desce)}</span>` : ''}
      <div style="margin-top:6px;display:grid;grid-template-columns:1fr auto;gap:2px 14px">${ls.slice(0, 10).map(([id, v]) => `<span>${esc(nomeP(id))}</span><span style="text-align:right;color:${v > 0 ? '#F0C2CC' : '#8FE0B0'}">${sinal(v)}</span>`).join('')}</div>${ls.length > 10 ? `<span style="color:var(--on-dark)">e mais ${ls.length - 10} parceiro(s)</span>` : ''}`; };
  box.querySelectorAll('[data-pi]').forEach(g => { g.onmousemove = e => { tip.innerHTML = conteudo(barras[+g.dataset.pi]); tip.hidden = false; const r = wrap.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = Math.max(0, e.clientY - r.top - tip.offsetHeight - 12) + 'px'; };
    g.onmouseleave = () => { tip.hidden = true; }; });
}

// Custo por atendimento e execução do calendarizado (meses com Umov no portal)
// Lista de kits do Umov do mês, com o valor de cada um
async function listaKits(box, D, c) {
  D.kit = D.kit || {};
  if (!D.kit[c.id]) {
    box.innerHTML = '<div class="carregando">Carregando os kits do mês…</div>';
    try { D.kit[c.id] = await todas(() => sb.rpc('listagem_kits', { p_comp: c.id })); }
    catch (e) { box.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; return; }
  }
  const L = D.kit[c.id];
  if (!L.length) { box.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px">${togAtd(D)}<p class="nota">Nenhum kit do Umov neste mês.</p></div>`; ligarTogAtd(box, D, c); return; }
  const F = D.kitF = D.kitF || { parc: '', busca: '', so: 'todos' };
  const parcs = [...new Map(L.map(r => [r.parceiro_id || '', r.regiao])).entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  const vis = L.filter(r => (F.parc === '' || (r.parceiro_id || '-') === F.parc)
    && (F.so === 'todos' || (F.so === 'valor' ? Number(r.valor) > 0 : F.so === 'ajuste' ? r.valor_parceiro != null : F.so === 'semparc' ? !r.parceiro_id : r.situacao !== 'Retornada de Campo'))
    && (!F.busca || norm(`${r.id_umov || ''} ${r.grupo_cliente || ''} ${r.cliente || ''} ${r.cidade || ''} ${r.motorista || ''}`).includes(norm(F.busca))));
  const total = vis.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const porKit = {}; vis.forEach(r => { const k = r.grupo_cliente || '—'; const x = porKit[k] || (porKit[k] = { n: 0, v: 0 }); x.n++; x.v += Number(r.valor) || 0; });
  const top = Object.entries(porKit).sort((a, b) => b[1].v - a[1].v || b[1].n - a[1].n).slice(0, 4);
  const pag = vis.slice(0, 300);
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px">${togAtd(D)}
    <div class="linha" style="align-items:flex-end;justify-content:space-between">
      <div class="linha" style="align-items:flex-end"><label class="campo">Parceiro<select class="peq" id="kt-p" style="min-width:220px"><option value="">Todos (${parcs.length})</option>${parcs.map(([id, n]) => `<option value="${id || '-'}" ${F.parc === (id || '-') ? 'selected' : ''}>${esc(n || 'Sem parceiro')}</option>`).join('')}</select></label>
        <label class="campo">Mostrar<select class="peq" id="kt-so">${[['todos', 'Todos os kits'], ['valor', 'Com valor a pagar'], ['ajuste', 'Com valor informado pelo parceiro'], ['semparc', 'Sem parceiro'], ['naoret', 'Não retornados']].map(([k, n]) => `<option value="${k}" ${F.so === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="campo">Buscar<input class="peq" id="kt-b" placeholder="Ref. Umov, kit, cliente, cidade" value="${esc(F.busca)}" style="min-width:220px"></label></div>
      <button class="btn sec peq" id="kt-x">Baixar Excel (${fmtN(vis.length)} kits)</button></div>
    <div class="kpis">
      <div class="kpi neutro"><small>Kits</small><b>${fmtN(vis.length)}</b><span>${fmtN(vis.filter(r => r.situacao === 'Retornada de Campo').length)} retornados de campo</span></div>
      <div class="kpi"><small>Valor dos kits</small><b>${BRL(total)}</b><span>${vis.length ? 'média ' + BRL2(total / Math.max(1, vis.filter(r => Number(r.valor) > 0).length)) + ' por kit com valor' : '—'}</span></div>
      <div class="kpi neutro"><small>Maiores kits</small><b style="font-size:15px;line-height:1.4">${top.map(([k, x]) => `${esc(k)}: ${BRL(x.v)}`).join('<br>') || '—'}</b><span></span></div>
    </div>
    <div class="tabela"><table><thead><tr><th>Parceiro</th><th>Ref. Umov</th><th>Data</th><th>Kit / cliente</th><th>Cidade</th><th>Situação</th><th class="n">Valor</th><th>Origem do valor</th></tr></thead><tbody>
      ${pag.map(r => `<tr><td style="font-size:13px">${esc(r.regiao || 'Sem parceiro')}</td><td class="num">${esc(r.id_umov || '—')}</td><td style="font-size:13px">${fmtD(r.data)}</td><td style="font-size:13px"><b>${esc(r.grupo_cliente || '')}</b><br>${esc(r.cliente || '')}</td><td style="font-size:13px">${esc(r.cidade || '')}${r.uf ? ' - ' + esc(r.uf) : ''}</td>
        <td><span class="pill ${r.situacao === 'Retornada de Campo' ? '' : 'alerta'}">${esc(r.situacao || '—')}</span></td><td class="n"><b>${BRL2(r.valor)}</b>${r.valor_parceiro != null ? `<br><span class="nota">parceiro: ${BRL2(r.valor_parceiro)} (${esc(r.ajuste_situacao || '')})</span>` : ''}</td><td style="font-size:13px;color:var(--muted)">${esc(r.origem_valor || '')}</td></tr>`).join('')}
    </tbody></table></div>
    ${vis.length > pag.length ? `<p class="nota">Mostrando ${pag.length} de ${fmtN(vis.length)} kits. Use os filtros ou baixe o Excel com todos.</p>` : ''}
    <p class="nota">Valor: ticket médio do parceiro para kit retornado de campo; quando o parceiro informou outro valor e a GSM aceitou, vale o valor dele. Nos meses fechados antes do portal, o valor pago saiu da planilha (aba Extras) e pode diferir do ticket médio.</p></div>`;
  ligarTogAtd(box, D, c);
  const red = () => listaKits(box, D, c);
  $('#kt-p').onchange = e => { F.parc = e.target.value; red(); };
  $('#kt-so').onchange = e => { F.so = e.target.value; red(); };
  $('#kt-b').oninput = e => { F.busca = e.target.value; clearTimeout(D.kitT); D.kitT = setTimeout(() => red().then(() => { const i = $('#kt-b'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 350); };
  $('#kt-x').onclick = () => {
    const linhas = vis.map(r => ({ 'Mês': nomeMes(c.mes), 'Parceiro': r.parceiro, 'Região': r.regiao, 'Ref. Umov': r.id_umov, 'Data': r.data, 'Kit (grupo cliente)': r.grupo_cliente, 'Cliente': r.cliente, 'Cidade': r.cidade, 'UF': r.uf, 'Motorista': r.motorista,
      'Situação': r.situacao, 'Ticket médio': r.ticket != null ? Number(r.ticket) : null, 'Valor informado pelo parceiro': r.valor_parceiro != null ? Number(r.valor_parceiro) : null, 'Situação do ajuste': r.ajuste_situacao, 'Valor': Number(r.valor), 'Origem do valor': r.origem_valor }));
    baixarXlsx(`Kits_${c.mes.slice(0, 7)}${F.parc ? '_' + (parcs.find(x => (x[0] || '-') === F.parc)?.[1] || '').replace(/[^\w-]+/g, '_') : ''}.xlsx`, { titulo: 'Kits/Spot', sub: `Competência ${nomeMes(c.mes)}${F.parc ? ' · ' + (parcs.find(x => (x[0] || '-') === F.parc)?.[1] || '') : ''}`, abas: [{ nome: 'Kits', linhas }] });
  };
}

// Lista de atendimentos por ponto (igual à aba Atendimentos da base de fechamento)
const togAtd = D => `<div class="alterna" role="group" aria-label="Lista" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface);align-self:flex-start">${[['malote', 'Malote (pontos)'], ['kits', 'Kits/Spot']].map(([k, n]) => `<button type="button" data-atm="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;${(D.atdModo || 'malote') === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>`;
const ligarTogAtd = (box, D, c) => box.querySelectorAll('[data-atm]').forEach(b => b.onclick = () => { D.atdModo = b.dataset.atm; listaAtendimentos(box, D, c); });
async function listaAtendimentos(box, D, c) {
  if (D.atdModo === 'kits') return listaKits(box, D, c);
  D.atd = D.atd || {};
  if (!D.atd[c.id]) {
    box.innerHTML = '<div class="carregando">Carregando os pontos do mês…</div>';
    try { D.atd[c.id] = await todas(() => sb.rpc('listagem_atendimentos', { p_comp: c.id })); }
    catch (e) { box.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; return; }
  }
  const L = D.atd[c.id];
  if (!L.length) { box.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px">${togAtd(D)}<p class="nota">Este mês ainda não tem base de pontos no portal.</p></div>`; ligarTogAtd(box, D, c); return; }
  const F = D.atdF = D.atdF || { parc: '', busca: '', so: 'todos' };
  const parcs = [...new Map(L.map(r => [r.parceiro_id, r.regiao])).entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  const vis = L.filter(r => (!F.parc || r.parceiro_id === F.parc)
    && (F.so === 'todos' || (F.so === 'abaixo' ? r.realizado < r.previsto : F.so === 'acima' ? r.realizado > r.previsto : F.so === 'ajuste' ? r.ajuste_parceiro != null : r.realizado === 0))
    && (!F.busca || norm(`${r.cod_int} ${r.cliente} ${r.loja} ${r.cidade}`).includes(norm(F.busca))));
  const sm = k => vis.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const prev = sm('previsto'), real = sm('realizado'), vp = sm('valor_previsto'), vr = sm('valor_realizado');
  const pag = vis.slice(0, 300);
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px">${togAtd(D)}
    <div class="linha" style="align-items:flex-end;justify-content:space-between">
      <div class="linha" style="align-items:flex-end"><label class="campo">Parceiro<select class="peq" id="at-p" style="min-width:220px"><option value="">Todos (${parcs.length})</option>${parcs.map(([id, n]) => `<option value="${id}" ${F.parc === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="campo">Mostrar<select class="peq" id="at-so">${[['todos', 'Todos os pontos'], ['abaixo', 'Realizado abaixo do previsto'], ['acima', 'Realizado acima do previsto'], ['zero', 'Sem atendimento'], ['ajuste', 'Com ajuste do parceiro']].map(([k, n]) => `<option value="${k}" ${F.so === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="campo">Buscar<input class="peq" id="at-b" placeholder="Código, cliente, loja, cidade" value="${esc(F.busca)}" style="min-width:220px"></label></div>
      <button class="btn sec peq" id="at-x">Baixar Excel (${fmtN(vis.length)} pontos)</button></div>
    <div class="kpis">
      <div class="kpi neutro"><small>Pontos</small><b>${fmtN(vis.length)}</b><span>${F.parc ? esc(parcs.find(x => x[0] === F.parc)?.[1] || '') : 'todos os parceiros'}</span></div>
      <div class="kpi"><small>Atendimentos previstos x realizados</small><b>${fmtN(prev)} x ${fmtN(real)}</b><span>${prev ? pct(real / prev - 1) : '—'} · ${fmtN(real - prev)} atendimento(s)</span></div>
      <div class="kpi"><small>Valor previsto x realizado</small><b>${BRL(vp)} x ${BRL(vr)}</b><span>diferença ${BRL(vr - vp)}</span></div>
    </div>
    <div class="tabela"><table><thead><tr><th>Parceiro</th><th>Cliente / loja</th><th>Cód. Int</th><th>Cidade</th><th>Frequência</th><th class="n">V. unit</th><th class="n">Previsto</th><th class="n">Umov</th><th class="n">Realizado</th><th class="n">Valor previsto</th><th class="n">Valor realizado</th><th class="n">Diferença</th></tr></thead><tbody>
      ${pag.map(r => `<tr><td style="font-size:13px">${esc(r.regiao || '')}</td><td style="font-size:13px"><b>${esc(r.cliente || '')}</b><br>${esc(r.loja || '')}</td><td class="num">${esc(r.cod_int)}</td><td style="font-size:13px">${esc(r.cidade || '')}${r.uf ? ' - ' + esc(r.uf) : ''}</td><td style="font-size:13px">${esc(r.frequencia || '')}</td>
        <td class="n">${BRL2(r.v_unit)}</td><td class="n">${fmtN(r.previsto)}</td><td class="n">${fmtN(r.umov_retornados)}</td><td class="n" title="${esc(r.origem_realizado)}${r.ajuste_parceiro != null ? ` · parceiro informou ${r.ajuste_parceiro} (${esc(r.ajuste_situacao || '')})` : ''}"><b>${fmtN(r.realizado)}</b>${r.ajuste_parceiro != null ? `<br><span class="nota">ajuste ${esc(r.ajuste_situacao || '')}</span>` : ''}</td>
        <td class="n">${BRL2(r.valor_previsto)}</td><td class="n">${BRL2(r.valor_realizado)}</td><td class="n" style="color:${r.diferenca < 0 ? 'var(--ink)' : r.diferenca > 0 ? 'var(--brand-deep)' : 'var(--muted)'}">${r.diferenca ? (r.diferenca > 0 ? '+' : '') + BRL2(r.diferenca) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    ${vis.length > pag.length ? `<p class="nota">Mostrando ${pag.length} de ${fmtN(vis.length)} pontos. Use os filtros ou baixe o Excel com todos.</p>` : ''}
    <p class="nota">Realizado: da planilha de fechamento nos meses anteriores ao portal; nos meses do portal, o Umov (retornados de campo) ou o ajuste do parceiro quando a GSM aceitou. Parceiros de contrato fechado aparecem com V. unit zero: o valor deles é o fixo do contrato.</p></div>`;
  const red = () => listaAtendimentos(box, D, c);
  ligarTogAtd(box, D, c);
  $('#at-p').onchange = e => { F.parc = e.target.value; red(); };
  $('#at-so').onchange = e => { F.so = e.target.value; red(); };
  $('#at-b').oninput = e => { F.busca = e.target.value; clearTimeout(D.atdT); D.atdT = setTimeout(() => red().then(() => { const i = $('#at-b'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 350); };
  $('#at-x').onclick = () => {
    const linhas = vis.map(r => ({ 'Mês': nomeMes(c.mes), 'Parceiro': r.parceiro, 'Região': r.regiao, 'Tipo': r.tipo, 'Cliente': r.cliente, 'Cod. Int': r.cod_int, 'Loja': r.loja, 'Cidade': r.cidade, 'UF': r.uf, 'Frequência': r.frequencia,
      'V. Unit': Number(r.v_unit), 'Previsto (Qtd atend.)': r.previsto, 'Umov programados': r.umov_programados, 'Umov retornados': r.umov_retornados, 'Ajuste do parceiro': r.ajuste_parceiro, 'Situação do ajuste': r.ajuste_situacao,
      'Realizado': r.realizado, 'Origem do realizado': r.origem_realizado, 'V. Previsto': Number(r.valor_previsto), 'V. Realizado': Number(r.valor_realizado), 'Diferença': Number(r.diferenca) }));
    baixarXlsx(`Atendimentos_${c.mes.slice(0, 7)}${F.parc ? '_' + (parcs.find(x => x[0] === F.parc)?.[1] || '').replace(/[^\w-]+/g, '_') : ''}.xlsx`, { titulo: 'Atendimentos de malote', sub: `Competência ${nomeMes(c.mes)}${F.parc ? ' · ' + (parcs.find(x => x[0] === F.parc)?.[1] || '') : ''}`, abas: [{ nome: 'Atendimentos', linhas }] });
  };
}

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
  const antecTot = ls.reduce((a, t) => a + (t.antec || 0), 0);
  const save = adis.reduce((a, x) => a + Number(x.valor_desconto || 0), 0) + antecTot; const adiBruto = adis.reduce((a, x) => a + Number(x.valor || 0), 0);
  const g = {}; ls.forEach(t => { const x = g[t.dia] || (g[t.dia] = { n: 0, v: 0, adi: 0, pagos: 0, vp: 0, aberto: 0 }); x.n++; x.v += t.total; x.adi += t.adi; if (!t.fechado) x.aberto++; x.antec = (x.antec || 0) + (t.antec || 0); if (t.pago) { x.pagos++; x.vp += t.total - t.adi - (t.antec || 0); } });
  const ord = ['5º dia útil', 'Dia 15', 'Dia 20', 'Dia 30', 'Quinzenal', '—'];
  const lst = Object.entries(g).sort((a, b) => (ord.indexOf(a[0]) + 99) % 99 - (ord.indexOf(b[0]) + 99) % 99);
  const T = lst.reduce((a, [, x]) => ({ n: a.n + x.n, v: a.v + x.v, adi: a.adi + x.adi, vp: a.vp + x.vp, aberto: a.aberto + x.aberto }), { n: 0, v: 0, adi: 0, vp: 0, aberto: 0 });
  const saldo = T.v - T.adi - T.vp - antecTot;
  box.innerHTML = `<div class="kpis">
      <div class="kpi"><small>Valor do mês</small><b>${BRL(T.v)}</b><span>${T.n} parceiros${T.aberto ? ` · ${T.aberto} ainda não fechados` : ''}</span></div>
      <div class="kpi neutro"><small>Adiantamentos já pagos</small><b>${BRL(T.adi)}</b><span>${T.v ? pct(T.adi / T.v).replace('+', '') : '—'} do mês</span></div>
      <div class="kpi neutro"><small>Pago no fechamento</small><b>${BRL(T.vp)}</b><span>registrado no portal</span></div>
      <div class="kpi ${saldo > 0 ? 'alerta' : ''}"><small>Saldo a pagar</small><b>${BRL(saldo)}</b><span>valor − adiantado − pago</span></div>
      <div class="kpi eco"><small>Economia com adiantamentos e antecipações (save)</small><b>${BRL2(save)}</b><span>${adis.length ? `${adis.length} adiantamento(s) · ${BRL(adiBruto)} adiantados` : 'nenhum adiantamento com desconto'}${antecTot ? ` · ${BRL2(antecTot)} em antecipações` : ''}</span></div>
    </div>
    <div class="tabela"><table><thead><tr><th>Data de pagamento</th><th class="n">Parceiros</th><th class="n">Valor</th><th class="n">Adiantado</th><th class="n">Pago</th><th class="n">Saldo a pagar</th></tr></thead><tbody>
    ${lst.map(([k, x]) => { const sd = x.v - x.adi - x.vp - (x.antec || 0); return `<tr><td>${esc(k === '—' ? 'Sem data cadastrada' : k)}</td><td class="n">${x.n}</td><td class="n">${BRL(x.v)}</td><td class="n">${x.adi ? BRL(x.adi) : '—'}</td><td class="n">${x.vp ? BRL(x.vp) : '—'}</td>
      <td class="n"><b>${BRL(sd)}</b><div style="height:4px;background:var(--rule-soft);border-radius:2px;margin-top:4px"><div style="height:4px;width:${T.v ? Math.max(0, 100 * sd / T.v) : 0}%;background:var(--ink);border-radius:2px"></div></div></td></tr>`; }).join('')}
    </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${T.n}</b></td><td class="n"><b>${BRL(T.v)}</b></td><td class="n"><b>${BRL(T.adi)}</b></td><td class="n"><b>${BRL(T.vp)}</b></td><td class="n"><b>${BRL(saldo)}</b></td></tr></tfoot></table></div>
    <p class="nota">Datas fixas do cadastro de cada parceiro. Valores com descontos. "Pago" passa a aparecer quando o pagamento for registrado no portal (etapa do financeiro).</p>`;
}

async function clientesMes(box, compId, op, parceiroId) {
  let qr = sb.from(parceiroId ? 'historico_cliente' : 'dir_cliente_mes').select('cliente,operacao,valor,atendimentos,estimado').eq('competencia_id', compId);
  if (parceiroId) qr = qr.eq('parceiro_id', parceiroId).eq('vigente', true);
  if (op !== 'tudo') qr = qr.eq('operacao', op === 'malote' ? 'Malote' : 'Kits/Spot');
  const rows = await todas(() => qr);
  const g = {}; let est = false; rows.forEach(r => { const x = g[r.cliente] || (g[r.cliente] = { v: 0, a: 0 }); x.v += Number(r.valor) || 0; x.a += r.atendimentos || 0; est = est || r.estimado; });
  const lst = Object.entries(g).sort((a, b) => b[1].v - a[1].v); const max = lst[0]?.[1].v || 1;
  const tot = lst.reduce((a, [, x]) => a + x.v, 0);
  box.className = '';
  if (!lst.length) { box.innerHTML = `<p class="nota">Sem detalhe por cliente para este mês. O administrador carrega em "Histórico por cliente".</p>`; return; }
  const st = box._cli || (box._cli = { f: '', todos: false });
  box.innerHTML = `<div class="linha" style="justify-content:space-between;align-items:center;margin-bottom:10px"><input class="peq" data-clif placeholder="Buscar cliente (lista geral)" value="${esc(st.f)}" style="min-width:240px"><button type="button" class="btn sec peq" data-clit>${st.todos ? 'Ver só os 12 maiores' : `Ver todos (${lst.length})`}</button></div><div data-clil></div>`;
  const desenha = () => { const f = norm(st.f); const ls = f ? lst.filter(([nm]) => norm(nm).includes(f)) : st.todos ? lst : lst.slice(0, 12); const tf = ls.reduce((a, [, x]) => a + x.v, 0);
    box.querySelector('[data-clil]').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;${ls.length > 14 ? 'max-height:520px;overflow:auto;padding-right:6px' : ''}">${ls.map(([n, x]) => `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto auto;gap:10px;align-items:center;font-size:13px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(n)}">${esc(n)}</span>
      <span style="height:10px;background:var(--rule-soft);border-radius:5px"><span style="display:block;height:10px;width:${Math.max(0, 100 * x.v / max)}%;background:var(--brand);border-radius:5px"></span></span>
      <span class="num" style="min-width:86px;text-align:right">${BRL(x.v)}</span><span class="num" style="min-width:44px;text-align:right;color:var(--muted)">${tot ? (100 * x.v / tot).toFixed(1).replace('.', ',') + '%' : ''}</span></div>`).join('') || '<p class="nota">Nenhum cliente encontrado.</p>'}</div>
    <p class="nota">${f ? `${ls.length} cliente(s) encontrado(s) · ${BRL(tf)} · ` : st.todos ? '' : `Mostrando os 12 maiores (${BRL(tf)}) · `}${lst.length} clientes no mês · ${BRL(tot)}. ${est ? 'Malote por cliente é estimado: o valor de cada parceiro é dividido pela proporção de atendimentos de cada cliente.' : ''}</p>`; };
  desenha();
  box.querySelector('[data-clif]').oninput = e => { st.f = e.target.value; desenha(); };
  box.querySelector('[data-clit]').onclick = e => { st.todos = !st.todos; e.currentTarget.textContent = st.todos ? 'Ver só os 12 maiores' : `Ver todos (${lst.length})`; desenha(); };
}

// ---------- Movimentação de pontos (carteira: inclusões, cancelamentos, suspensões…) ----------
const TIPOS_MOV = [ // [chave, rótulo, grupo: entra | sai | freq | outro]
  ['inclus', 'Inclusão', 'entra'], ['aquisi', 'Aquisição de malote', 'entra'], ['reativ', 'Reativação', 'entra'],
  ['cancel', 'Cancelamento', 'sai'], ['suspens', 'Suspensão', 'sai'],
  ['redu', 'Redução de frequência', 'freq'], ['aument', 'Aumento de frequência', 'freq'], ['troca', 'Troca de frequência', 'freq'],
  ['altera', 'Alteração cadastral', 'outro'], ['esporad', 'Atendimento esporádico', 'outro']];
// Clientes cujas saídas NÃO entraram na última negociação do fixo: contam em "Onde negociar" qualquer que seja a data
const NAO_NEGOCIADOS = ['CASAS BAHIA'];
const ehNaoNeg = r => NAO_NEGOCIADOS.some(n => `${r.cliente || ''} ${r.loja || ''}`.toUpperCase().includes(n));
const tipoMov = t => { const u = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return TIPOS_MOV.find(([k]) => u.includes(k)) || ['outro', t || '—', 'outro']; };
function visitasMes(f) {
  const u = String(f || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/DIARI/.test(u)) return 21.7; if (/QUINZ/.test(u)) return 2; if (/MENSAL/.test(u)) return 1; if (/SEMANAL/.test(u)) return 4.33;
  const d = new Set((u.match(/\b(SEG|TER|QUA|QUI|SEX|SAB)/g) || [])); return (d.size || 1) * 4.33;
}
async function carteiraDir(box, D) {
  if (!D.cart) {
    box.innerHTML = '<div class="carregando">Carregando as movimentações da carteira…</div>';
    try { const [mov, st, imp, ativos, contratos, naoNegCad] = await Promise.all([todas(() => sb.rpc('dir_carteira_mov')), todas(() => sb.rpc('dir_carteira_status')), q(sb.from('carteira_importacoes').select('arquivo,importado_em').order('importado_em', { ascending: false }).limit(1)).catch(() => []),
        todas(() => sb.rpc('dir_carteira_ativos')).catch(() => []), q(sb.from('contratos').select('parceiro_id,valor_fixo,inicio,fim,observacao')).catch(() => []),
        todas(() => sb.from('cadastro_pontos').select('cod_int,cliente,loja,cidade,uf,frequencia,parceiro_id,v_unit,situacao').or(NAO_NEGOCIADOS.map(n => `loja.ilike.${n}%,cliente.ilike.%${n}%`).join(',')).order('cod_int')).catch(() => [])]);
      // atendimentos no Umov do último mês para os pontos não negociados (só os parados de verdade entram)
      const compU = (D.comps || []).find(cc => cc.mes === st[0]?.comp_ult); const atU = {};
      if (compU && naoNegCad.length) { const cods = naoNegCad.map(r => r.cod_int);
        for (let i = 0; i < cods.length; i += 150) (await q(sb.from('umov_por_ponto').select('cod_int,atendimentos').eq('competencia_id', compU.id).in('cod_int', cods.slice(i, i + 150))).catch(() => [])).forEach(u => { atU[u.cod_int] = (atU[u.cod_int] || 0) + Number(u.atendimentos || 0); }); }
      naoNegCad.forEach(r => { r.atend_ult = atU[r.cod_int] || 0; });
      D.cart = { mov, st, imp: imp[0], ativos, contratos, naoNeg: naoNegCad }; }
    catch (e) { box.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; return; }
    if (D.aba !== 'carteira') return;
  }
  const { mov, st, imp, ativos, contratos, naoNeg } = D.cart; const F = D.cartF || (D.cartF = { per: 12, tipo: 'todos', parc: '', busca: '', lim: 200 });
  const pm = Object.fromEntries((D.parcs || []).map(p => [p.id, p])); const nomeP = id => pm[id] ? pm[id].regiao : 'Sem parceiro (rota GSM)';
  const hoje = new Date().toISOString().slice(0, 10);
  const ultMes = mov.reduce((a, m) => m.data && m.data <= hoje && m.data > a ? m.data : a, '').slice(0, 7) || hoje.slice(0, 7);
  const meses = []; { let [y, m] = ultMes.split('-').map(Number); const n = F.per === 'ano' ? m : F.per; for (let i = 0; i < n; i++) { meses.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } } }
  const ini = meses[0] + '-01', fimM = meses[meses.length - 1];
  const R = mov.map(m => { const [k, rot, g] = tipoMov(m.tipo); return { ...m, k, rot, g, mes: (m.data || '').slice(0, 7), imp: (Number(m.v_unit) || 0) * visitasMes(m.frequencia || m.freq_cad) }; });
  const noPer = R.filter(r => r.data >= ini && r.mes <= fimM && (!F.parc || (F.parc === '_sem' ? !r.parceiro_id : r.parceiro_id === F.parc)));
  const futuros = R.filter(r => r.data > hoje);
  const soma = (rs, g) => rs.filter(r => r.g === g);
  const kp = k => noPer.filter(r => r.k === k).length;
  const ent = soma(noPer, 'entra'), sai = soma(noPer, 'sai'), frq = soma(noPer, 'freq');
  // Saldo líquido por ponto: compara a situação antes do período com a do fim do período (suspenso e reativado no período não conta)
  const fimData = (fimM + '-31') < hoje ? fimM + '-31' : hoje;
  const estado = r => r.g === 'entra' ? 'A' : r.k === 'cancel' ? 'C' : 'S';
  const porPonto = {}; R.filter(r => (r.g === 'entra' || r.g === 'sai') && r.cod_int && (!F.parc || (F.parc === '_sem' ? !r.parceiro_id : r.parceiro_id === F.parc))).sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id)
    .forEach(r => { const x = porPonto[r.cod_int] || (porPonto[r.cod_int] = { antes: null, primeiro: null, fim: null, r }); if (r.data < ini) x.antes = estado(r); else if (r.data <= fimData) { if (!x.primeiro) x.primeiro = r; x.fim = estado(r); x.r = r; } });
  const liq = { saiu: [], entrou: [], volta: [], entraSai: [] };
  Object.values(porPonto).forEach(x => { if (!x.primeiro) return;
    const antes = x.antes || (x.primeiro.g === 'sai' ? 'A' : 'X'); const ativoAntes = antes === 'A', ativoFim = x.fim === 'A';
    if (ativoAntes && !ativoFim) liq.saiu.push(x.r); else if (!ativoAntes && ativoFim) liq.entrou.push(x.r); else if (ativoAntes && ativoFim) liq.volta.push(x.r); else liq.entraSai.push(x.r); });
  const saldoLiq = liq.entrou.length - liq.saiu.length;
  const impE = ent.reduce((a, r) => a + r.imp, 0), impS = sai.reduce((a, r) => a + r.imp, 0);
  // gráfico mês a mês (entradas acima, saídas abaixo)
  const porMes = meses.map(m => { const rs = noPer.filter(r => r.mes === m); return { m, e: rs.filter(r => r.g === 'entra').length, s: rs.filter(r => r.g === 'sai').length, f: rs.filter(r => r.g === 'freq').length }; });
  const mx = Math.max(1, ...porMes.map(x => Math.max(x.e, x.s))); const W = 760, Hh = 110, bw = Math.min(46, (W - 40) / porMes.length - 8);
  const svg = `<svg viewBox="0 -18 ${W} ${Hh * 2 + 58}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="Entradas e saídas de pontos por mês">
    <line x1="30" x2="${W - 10}" y1="${Hh + 10}" y2="${Hh + 10}" stroke="var(--rule)"/>
    ${porMes.map((x, i) => { const cx = 40 + i * ((W - 50) / porMes.length); const he = Hh * x.e / mx, hs = Hh * x.s / mx;
      return `<g><title>${MES3[+x.m.slice(5) - 1]}/${x.m.slice(2, 4)}: ${x.e} entradas, ${x.s} saídas, ${x.f} mudanças de frequência</title>
      <rect x="${cx}" y="${Hh + 10 - he}" width="${bw}" height="${he}" fill="var(--ink)" rx="3"/><rect x="${cx}" y="${Hh + 10}" width="${bw}" height="${hs}" fill="var(--brand)" rx="3"/>
      ${x.e ? `<text x="${cx + bw / 2}" y="${Hh + 4 - he}" text-anchor="middle" font-size="11" fill="var(--ink)">${x.e}</text>` : ''}
      ${x.s ? `<text x="${cx + bw / 2}" y="${Hh + 24 + hs}" text-anchor="middle" font-size="11" fill="var(--brand-deep, var(--brand))">${x.s}</text>` : ''}
      <text x="${cx + bw / 2}" y="${Hh * 2 + 36}" text-anchor="middle" font-size="11" fill="var(--muted)">${MES3[+x.m.slice(5) - 1]}/${x.m.slice(2, 4)}</text></g>`; }).join('')}</svg>`;
  // situação hoje
  const stP = st.filter(r => !F.parc || (F.parc === '_sem' ? !r.parceiro_id : r.parceiro_id === F.parc));
  const susp = stP.filter(r => r.situacao === 'Suspenso'), suspAg = susp.filter(r => r.desde > hoje), suspHj = susp.filter(r => !(r.desde > hoje));
  const canc = stP.filter(r => r.situacao === 'Cancelado');
  const compUlt = st[0]?.comp_ult;
  const alertaUmov = stP.filter(r => r.atend_ult > 0 && !(r.desde > hoje) && r.desde && compUlt && r.desde < compUlt.slice(0, 8) + '01');
  const alertaCad = stP.filter(r => r.cad_situacao === 'Ativo' && !(r.desde > hoje));
  // agrupamentos
  const agrupa = key => { const g = {}; noPer.forEach(r => { const k = key(r); const x = g[k] || (g[k] = { k, e: 0, s: 0, f: 0, o: 0, impS: 0, impE: 0 }); x[r.g === 'entra' ? 'e' : r.g === 'sai' ? 's' : r.g === 'freq' ? 'f' : 'o']++; if (r.g === 'sai') x.impS += r.imp; if (r.g === 'entra') x.impE += r.imp; }); return Object.values(g).sort((a, b) => (b.e + b.s + b.f) - (a.e + a.s + a.f)); };
  const porCli = agrupa(r => (r.cliente || '—').trim().toUpperCase()), porParc = agrupa(r => r.parceiro_id || '_sem');
  const tabG = (lst, rot, nome, attr) => `<div class="tabela"><table><thead><tr><th>${rot}</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo</th><th class="n">Mud. frequência</th><th class="n" title="Custo mensal estimado com o parceiro: valor unitário × visitas por mês">Custo/mês saindo</th></tr></thead><tbody>
    ${lst.slice(0, 15).map(x => `<tr ${attr(x)} style="cursor:pointer"><td><b>${esc(nome(x))}</b></td><td class="n">${x.e || '—'}</td><td class="n" style="color:${x.s ? 'var(--brand-deep, var(--brand))' : ''}">${x.s || '—'}</td><td class="n"><b>${x.e - x.s > 0 ? '+' : ''}${x.e - x.s}</b></td><td class="n">${x.f || '—'}</td><td class="n">${x.impS ? BRL(x.impS) : '—'}</td></tr>`).join('')}</tbody></table></div>${lst.length > 15 ? `<p class="nota">Mostrando os 15 com mais movimentações de ${lst.length}.</p>` : ''}`;
  // lista
  let lista = noPer.filter(r => F.tipo === 'todos' || r.g === F.tipo || r.k === F.tipo);
  if (F.busca) { const b = F.busca.toLowerCase(); lista = lista.filter(r => `${r.cliente} ${r.loja} ${r.cidade} ${r.cod_int} ${nomeP(r.parceiro_id)}`.toLowerCase().includes(b)); }
  lista.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const pill = r => `<span class="pill ${r.g === 'sai' ? 'alerta' : r.g === 'entra' ? 'escuro' : ''}">${esc(r.rot)}</span>`;
  const parcsOp = [...new Set(R.map(r => r.parceiro_id).filter(Boolean))].map(id => [id, nomeP(id)]).sort((a, b) => a[1].localeCompare(b[1]));
  const kpi = (rot, n, sub, alvo) => `<button type="button" class="kpi" data-ftipo="${alvo}" style="text-align:left;cursor:pointer;border:1px solid ${F.tipo === alvo ? 'var(--ink)' : 'var(--rule)'};background:var(--surface);border-radius:10px;padding:12px 14px;min-width:140px;flex:1"><span style="font-size:12px;color:var(--muted)">${rot}</span><b style="display:block;font-size:24px">${n}</b><span style="font-size:12px;color:var(--muted)">${sub || '&nbsp;'}</span></button>`;
  // ---- Onde negociar: contratos fechados com pontos que saíram ----
  const ctr = {}; (contratos || []).forEach(c => { if (Number(c.valor_fixo) > 0 && (!c.fim || c.fim >= hoje) && (!ctr[c.parceiro_id] || c.inicio > ctr[c.parceiro_id].inicio)) ctr[c.parceiro_id] = c; });
  const visAt = {}, ptsAt = {}; (ativos || []).forEach(a => { visAt[a.parceiro_id] = (visAt[a.parceiro_id] || 0) + visitasMes(a.frequencia) * Number(a.pontos); ptsAt[a.parceiro_id] = (ptsAt[a.parceiro_id] || 0) + Number(a.pontos); });
  const neg = Object.entries(ctr).map(([pid, c]) => {
    const ref = c.inicio || '2026-01-01';
    const perd0 = st.filter(r => r.parceiro_id === pid && !(r.desde > hoje) && (r.desde >= ref || ehNaoNeg(r)) && !(r.retorno && r.retorno <= hoje));
    const jaTem = new Set(perd0.map(r => r.cod_int));
    const extra = (naoNeg || []).filter(r => r.parceiro_id === pid && !jaTem.has(r.cod_int) && r.situacao === 'Ativo' && !r.atend_ult).map(r => ({ ...r, situacao: 'Parado', desde: null, naoNeg: true }));
    // só pontos cobertos pelo fixo: ponto com valor unitário é pago por atendimento e, quando sai, o custo já cai sozinho
    const perdidos = perd0.map(r => ehNaoNeg(r) ? { ...r, naoNeg: true } : r).concat(extra).filter(r => !(Number(r.v_unit) > 0));
    const vp = perdidos.reduce((a, r) => a + visitasMes(r.frequencia), 0); const va = Math.max(0, (visAt[pid] || 0) - extra.reduce((a, r) => a + visitasMes(r.frequencia), 0));
    // Regra: custo por visita = fixo ÷ média mensal de atendimentos realizados (Umov) desde a negociação; redução = custo por visita × visitas/mês dos pontos que saíram
    const meses = (D.efic || []).filter(e => e.parceiro_id === pid && Number(e.atend_umov) > 0 && (D.comps || []).some(cc => cc.id === e.competencia_id && cc.mes >= ref.slice(0, 8) + '01'));
    const media = meses.length ? meses.reduce((a, e) => a + Number(e.atend_umov), 0) / meses.length : 0;
    const base = media || (va + vp); const cpv = Number(c.valor_fixo) / (base || 1);
    const red = Math.min(Number(c.valor_fixo), cpv * vp);
    return { pid, c, ref, perdidos, canc: perdidos.filter(r => r.situacao === 'Cancelado').length, susp: perdidos.filter(r => r.situacao === 'Suspenso').length, nn: perdidos.filter(r => r.naoNeg).length, vp, va, pa: ptsAt[pid] || 0, media, nMeses: meses.length, cpv, fr: red / Number(c.valor_fixo), red };
  }).filter(x => x.perdidos.length && (!F.parc || x.pid === F.parc)).sort((a, b) => b.red - a.red);
  const negTot = neg.reduce((a, x) => a + x.red, 0); const negAb = D.negAberto || {};
  const negociacaoHtml = `<section class="bloco"><h2>Onde negociar · contratos fechados com pontos que saíram</h2>
    <p class="sub">Parceiros com valor fixo de contrato que perderam pontos (cancelados ou suspensos e ainda sem reativação) desde a última negociação do fixo (data de início do contrato; hoje 01/09/2026 para todos). Não depende do período escolhido acima. Só entram pontos cobertos pelo fixo (sem valor unitário no cadastro); nos contratos mistos, os pontos com valor unitário ficam de fora porque já deixam de ser pagos quando saem. Exceção: os pontos da Casas Bahia ficaram fora da última negociação, então entram todos — os cancelados em qualquer data e os que ainda constam como ativos no cadastro mas não tiveram nenhum atendimento no Umov do último mês ("Parado"). Regra: custo por visita = fixo ÷ média de atendimentos por mês realizados no Umov desde a negociação; redução sugerida = custo por visita × visitas por mês dos pontos que saíram (pela frequência do ponto).</p>
    ${neg.length ? `<div class="linha" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">${kpi('Parceiros para negociar', neg.length, '', 'x')}${kpi('Redução potencial / mês', BRL(negTot), `≈ ${BRL(negTot * 12)} por ano`, 'x')}${kpi('Pontos que saíram', neg.reduce((a, x) => a + x.perdidos.length, 0), `${neg.reduce((a, x) => a + x.canc, 0)} cancelados · ${neg.reduce((a, x) => a + x.susp, 0)} suspensos`, 'x')}</div>
    <div class="tabela"><table><thead><tr><th>Parceiro</th><th class="n">Fixo do contrato</th><th class="n">Pontos ativos hoje</th><th class="n" title="Média de atendimentos por mês no Umov desde a negociação">Média atend./mês</th><th class="n">Custo por visita</th><th class="n">Saíram</th><th class="n" title="Visitas por mês dos pontos que saíram">Visitas/mês perdidas</th><th class="n">% do fixo</th><th class="n">Redução sugerida/mês</th><th class="n">Fixo sugerido</th></tr></thead><tbody>
    ${neg.map(x => `<tr data-negp="${x.pid}" style="cursor:pointer"><td><b>${negAb[x.pid] ? '▾' : '▸'} ${esc(nomeP(x.pid))}</b><br><span class="nota">saídas desde ${fmtD(x.ref)}${x.c.observacao ? ' · ' + esc(x.c.observacao.slice(0, 50)) : ''}</span></td><td class="n">${BRL(x.c.valor_fixo)}</td><td class="n">${fmtN(x.pa)}</td><td class="n">${x.media ? fmtN(Math.round(x.media)) + `<br><span class="nota">${x.nMeses} ${x.nMeses > 1 ? 'meses' : 'mês'}</span>` : `<span class="nota" title="Sem Umov no período: usa as visitas do cadastro">${fmtN(Math.round(x.va + x.vp))}*</span>`}</td><td class="n">${BRL2(x.cpv)}</td><td class="n">${x.perdidos.length}<br><span class="nota">${x.canc} canc. · ${x.susp} susp.${x.nn ? ` · ${x.nn} Casas Bahia` : ''}</span></td><td class="n">${fmtN(Math.round(x.vp))}</td><td class="n">${(x.fr * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td><td class="n"><b>${BRL(x.red)}</b></td><td class="n">${BRL(Number(x.c.valor_fixo) - x.red)}</td></tr>
      ${negAb[x.pid] ? `<tr><td colspan="10" style="background:var(--field);padding:6px 10px 12px 28px"><table style="width:100%;font-size:12px"><tbody>${x.perdidos.sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || ''))).map(r => `<tr><td style="width:90px">${r.desde ? fmtD(r.desde) : '—'}</td><td><span class="pill ${r.situacao === 'Cancelado' ? 'alerta' : ''}">${esc(r.situacao)}</span>${r.naoNeg ? ' <span class="pill">não negociado</span>' : ''}</td><td><b>${esc(r.loja || r.cod_int)}</b> <span class="nota">${esc(r.cod_int)} · ${esc([r.cidade, r.uf].filter(Boolean).join('/'))}</span></td><td>${esc(r.frequencia || '')}</td><td class="n">${fmtN(Math.round(visitasMes(r.frequencia) * 10) / 10)} vis./mês</td>${r.atend_ult ? `<td><span class="pill alerta">${r.atend_ult} atend. no Umov</span></td>` : '<td></td>'}</tr>`).join('')}</tbody></table></td></tr>` : ''}`).join('')}
    </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${BRL(neg.reduce((a, x) => a + Number(x.c.valor_fixo), 0))}</b></td><td colspan="6"></td><td class="n"><b>${BRL(negTot)}</b></td><td></td></tr></tfoot></table></div>
    <p class="nota">* Sem atendimento no Umov desde a negociação: a média usa as visitas por mês do cadastro (pontos ativos + os que saíram). Pontos com "atend. no Umov" ainda receberam visita no último mês: confirme com o parceiro antes de usar na negociação. Quando renegociar um fixo, atualize o início do contrato do parceiro para a conta recomeçar da data nova. O parceiro de cada ponto cancelado vem do cadastro ou, para pontos que já saíram do cadastro, das planilhas de fechamento de 2026.</p>`
      : '<p class="nota">Nenhum parceiro com contrato fixo perdeu pontos no período.</p>'}</section>`;
  const tabSt = (rs, extra) => rs.length ? `<div class="tabela"><table><thead><tr><th>Ponto</th><th>Parceiro</th><th>Desde</th>${extra[0]}</tr></thead><tbody>${rs.slice(0, 60).map(r => `<tr><td><b>${esc(r.loja || r.cod_int)}</b><br><span class="nota">${esc(r.cod_int)} · ${esc([r.cidade, r.uf].filter(Boolean).join('/'))}</span></td><td>${esc(nomeP(r.parceiro_id))}</td><td style="white-space:nowrap">${fmtD(r.desde)}</td>${extra[1](r)}</tr>`).join('')}</tbody></table></div>${rs.length > 60 ? `<p class="nota">+${rs.length - 60} pontos (no Excel).</p>` : ''}` : '<p class="nota">Nenhum.</p>';
  box.innerHTML = `
  <section class="bloco"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><div><h2 style="margin:0">Movimentação de pontos</h2>
      <p class="sub" style="margin:4px 0 0">Inclusões, cancelamentos, suspensões e mudanças de frequência da carteira (planilha de Inclusão e Cancelamento${imp ? `, importada em ${fmtDH(imp.importado_em)}` : ''}). Últimos dados: ${MES3[+ultMes.slice(5) - 1]}/${ultMes.slice(0, 4)}.</p></div>
    <div class="linha" style="gap:8px;flex-wrap:wrap">
      <div class="alterna" role="group" aria-label="Período" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${[[3, '3 meses'], [6, '6 meses'], [12, '12 meses'], ['ano', ultMes.slice(0, 4)]].map(([v, t]) => `<button type="button" class="btn ${F.per === v ? '' : 'sec'} peq" data-fper="${v}">${t}</button>`).join('')}</div>
      <select id="cart-parc" class="peq" style="max-width:240px"><option value="">Todos os parceiros</option>${parcsOp.map(([id, n]) => `<option value="${id}" ${F.parc === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="_sem" ${F.parc === '_sem' ? 'selected' : ''}>Sem parceiro (rota GSM)</option></select>
      <button class="btn sec peq" id="cart-xls">Baixar Excel</button></div></div>
    <div class="linha" style="gap:10px;flex-wrap:wrap;margin-top:14px">
      ${kpi('Entradas', ent.length, `${kp('inclus') + kp('aquisi')} inclusões · ${kp('reativ')} reativações`, 'entra')}
      ${kpi('Saídas', sai.length, `${kp('cancel')} cancelamentos · ${kp('suspens')} suspensões`, 'sai')}
      ${kpi('Saldo líquido de pontos', (saldoLiq > 0 ? '+' : '') + saldoLiq, `${liq.entrou.length} entraram · ${liq.saiu.length} saíram de vez · ${liq.volta.length} suspensos e já reativados (não contam)`, 'todos')}
      ${kpi('Mudanças de frequência', frq.length, `${kp('redu')} reduções · ${kp('aument')} aumentos · ${kp('troca')} trocas`, 'freq')}
      ${kpi('Alterações cadastrais', soma(noPer, 'outro').length, '', 'outro')}</div>
    <div style="margin-top:16px">${svg}</div>
    <p class="nota">Barras escuras: entradas (inclusão, aquisição de malote, reativação). Barras vermelhas: saídas (cancelamento, suspensão). Custo/mês é estimado só para os pontos com parceiro e valor unitário no cadastro: valor unitário × visitas por mês pela frequência.${futuros.length ? ` Há ${futuros.length} movimentações agendadas para depois de hoje.` : ''}</p></section>
  ${negociacaoHtml}
  <section class="bloco"><h2>Situação hoje</h2>
    <div class="linha" style="gap:10px;flex-wrap:wrap">
      ${kpi('Suspensos', suspHj.length, suspAg.length ? `+${suspAg.length} suspensões agendadas` : '', 'x')}
      ${kpi('Cancelados (histórico)', canc.length, `${canc.filter(r => r.desde >= ini).length} no período`, 'x')}
      ${kpi('Atenção: ainda com atendimento', alertaUmov.length, compUlt ? `no Umov de ${nomeMes(compUlt)}` : '', 'x')}
      ${kpi('Atenção: ativos no cadastro', alertaCad.length, 'cancelados/suspensos', 'x')}</div>
    ${alertaUmov.length ? `<h3 style="margin:18px 0 6px">Cancelados ou suspensos que ainda tiveram atendimento no Umov de ${compUlt ? nomeMes(compUlt) : '—'}</h3><p class="sub">Possível custo indevido: o cliente parou, mas o parceiro seguiu visitando (ou o ponto voltou e a planilha não registrou a reativação).</p>
      ${tabSt(alertaUmov.sort((a, b) => b.atend_ult - a.atend_ult), ['<th>Situação</th><th class="n">Atend. Umov</th><th class="n">Custo estimado</th>', r => `<td><span class="pill alerta">${esc(r.situacao)}</span></td><td class="n">${r.atend_ult}</td><td class="n">${r.v_unit ? BRL(r.atend_ult * r.v_unit) : '—'}</td>`])}` : ''}
    ${alertaCad.length ? `<h3 style="margin:18px 0 6px">Cancelados ou suspensos que continuam "Ativo" no cadastro de pontos</h3><p class="sub">Entram no previsto e na base do parceiro. Vale inativar no cadastro (ou confirmar que voltaram).</p>
      ${tabSt(alertaCad, ['<th>Situação</th><th class="n">V. Unit</th>', r => `<td><span class="pill alerta">${esc(r.situacao)}</span></td><td class="n">${r.v_unit != null ? BRL2(r.v_unit) : '—'}</td>`])}` : ''}
    <h3 style="margin:18px 0 6px">Suspensos</h3>${tabSt(susp.sort((a, b) => String(b.desde).localeCompare(String(a.desde))), ['<th></th>', r => `<td>${r.desde > hoje ? '<span class="pill">Agendada</span>' : ''}${r.retorno ? ` <span class="nota">retorno ${fmtD(r.retorno)}</span>` : ''}</td>`])}
  </section>
  <section class="bloco"><h2>Por cliente</h2>${tabG(porCli, 'Cliente', x => x.k, x => `data-fbusca="${esc(x.k)}"`)}</section>
  <section class="bloco"><h2>Por parceiro</h2>${tabG(porParc, 'Parceiro', x => nomeP(x.k === '_sem' ? null : x.k), x => `data-fparc="${x.k}"`)}</section>
  <section class="bloco"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Movimentações (${lista.length})</h2>
      <div class="linha" style="gap:8px;flex-wrap:wrap">${[['todos', 'Todas'], ['entra', 'Entradas'], ['sai', 'Saídas'], ['cancel', 'Cancelamentos'], ['suspens', 'Suspensões'], ['freq', 'Frequência']].map(([v, t]) => `<button type="button" class="btn ${F.tipo === v ? '' : 'sec'} peq" data-ftipo="${v}">${t}</button>`).join('')}
        <input id="cart-busca" class="peq" placeholder="Buscar cliente, loja, cidade, código" value="${esc(F.busca)}" style="min-width:240px"></div></div>
    <div class="tabela" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Movimento</th><th>Cliente / ponto</th><th>Cidade</th><th>Parceiro</th><th>Frequência</th><th class="n">Custo/mês</th></tr></thead><tbody>
      ${lista.slice(0, F.lim).map(r => `<tr><td style="white-space:nowrap">${fmtD(r.data)}${r.data > hoje ? '<br><span class="pill">Agendada</span>' : ''}</td><td>${pill(r)}</td><td><b>${esc(r.loja || r.cliente || '')}</b><br><span class="nota">${esc(r.cod_int || '')} · ${esc(r.cliente || '')}</span></td><td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}</td><td>${esc(nomeP(r.parceiro_id))}</td><td>${esc(r.frequencia || '')}</td><td class="n">${r.imp ? BRL(r.imp) : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="nota">Nenhuma movimentação com esses filtros.</td></tr>'}
    </tbody></table></div>${lista.length > F.lim ? `<button class="btn sec peq" id="cart-mais" style="margin-top:8px">Ver mais ${Math.min(200, lista.length - F.lim)}</button>` : ''}</section>`;
  const re = () => carteiraDir(box, D);
  box.querySelectorAll('[data-negp]').forEach(b => b.onclick = () => { D.negAberto = { ...negAb, [b.dataset.negp]: !negAb[b.dataset.negp] }; re(); });
  box.querySelectorAll('[data-fper]').forEach(b => b.onclick = () => { F.per = b.dataset.fper === 'ano' ? 'ano' : +b.dataset.fper; re(); });
  box.querySelectorAll('[data-ftipo]').forEach(b => b.onclick = () => { if (b.dataset.ftipo === 'x') return; F.tipo = b.dataset.ftipo; F.lim = 200; re(); });
  box.querySelectorAll('[data-fbusca]').forEach(b => b.onclick = () => { F.busca = b.dataset.fbusca; F.lim = 200; re(); box.querySelector('#cart-busca')?.scrollIntoView({ block: 'center' }); });
  box.querySelectorAll('[data-fparc]').forEach(b => b.onclick = () => { F.parc = b.dataset.fparc; re(); });
  box.querySelector('#cart-parc').onchange = e => { F.parc = e.target.value; re(); };
  let tmr; box.querySelector('#cart-busca').oninput = e => { clearTimeout(tmr); tmr = setTimeout(() => { F.busca = e.target.value; F.lim = 200; re(); const i = box.querySelector('#cart-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); };
  const mais = box.querySelector('#cart-mais'); if (mais) mais.onclick = () => { F.lim += 200; re(); };
  box.querySelector('#cart-xls').onclick = () => baixarXlsx(`Movimentacao_pontos_${meses[0]}_a_${fimM}.xlsx`, { titulo: 'Movimentação de pontos', sub: `${meses[0]} a ${fimM}${F.parc ? ' · ' + nomeP(F.parc === '_sem' ? null : F.parc) : ''}`, abas: [
    { nome: 'Movimentações', linhas: lista.map(r => ({ 'Data': fmtD(r.data), 'Movimento': r.rot, 'Grupo': { entra: 'Entrada', sai: 'Saída', freq: 'Frequência', outro: 'Outro' }[r.g], 'Cliente': r.cliente || '', 'Cód. Int': r.cod_int || '', 'Ponto': r.loja || '', 'Cidade': r.cidade || '', 'UF': r.uf || '', 'Parceiro': nomeP(r.parceiro_id), 'Frequência': r.frequencia || '', 'V. Unit parceiro': Number(r.v_unit) || 0, 'Custo/mês estimado': Math.round(r.imp * 100) / 100 })) },
    { nome: 'Por cliente', linhas: porCli.map(x => ({ 'Cliente': x.k, 'Entradas': x.e, 'Saídas': x.s, 'Saldo': x.e - x.s, 'Mud. frequência': x.f, 'Custo/mês saindo': Math.round(x.impS * 100) / 100 })) },
    { nome: 'Por parceiro', linhas: porParc.map(x => ({ 'Parceiro': nomeP(x.k === '_sem' ? null : x.k), 'Entradas': x.e, 'Saídas': x.s, 'Saldo': x.e - x.s, 'Mud. frequência': x.f, 'Custo/mês saindo': Math.round(x.impS * 100) / 100 })) },
    { nome: 'Onde negociar', linhas: neg.flatMap(x => x.perdidos.map(r => ({ 'Parceiro': nomeP(x.pid), 'Fixo do contrato': Number(x.c.valor_fixo), 'Contrato desde': fmtD(x.ref), 'Média atend./mês Umov': Math.round(x.media), 'Custo por visita': Math.round(x.cpv * 100) / 100, 'Redução sugerida (parceiro)': Math.round(x.red * 100) / 100, 'Situação': r.situacao + (r.naoNeg ? ' (não negociado)' : ''), 'Desde': r.desde ? fmtD(r.desde) : '', 'Cód. Int': r.cod_int, 'Ponto': r.loja || '', 'Cidade': r.cidade || '', 'UF': r.uf || '', 'Frequência': r.frequencia || '', 'Visitas/mês': Math.round(visitasMes(r.frequencia) * 10) / 10, 'Atend. Umov último mês': r.atend_ult || 0 }))) },
    { nome: 'Suspensos e cancelados', linhas: stP.map(r => ({ 'Situação': r.situacao + (r.desde > hoje ? ' (agendada)' : ''), 'Desde': fmtD(r.desde), 'Cód. Int': r.cod_int, 'Ponto': r.loja || '', 'Cliente': r.cliente || '', 'Cidade': r.cidade || '', 'UF': r.uf || '', 'Parceiro': nomeP(r.parceiro_id), 'Cadastro': r.cad_situacao || '', 'Atend. Umov último mês': r.atend_ult || 0, 'Retorno previsto': r.retorno ? fmtD(r.retorno) : '' })) }] });
}

// ---------- Pop-up da composição do custo ----------
function abrirPop(titulo, sub) {
  document.querySelectorAll('.pop-fundo').forEach(x => x.remove());
  const f = document.createElement('div'); f.className = 'pop-fundo';
  f.innerHTML = `<div class="pop-caixa" role="dialog" aria-modal="true"><div class="pop-topo"><div><h2 style="margin:0">${esc(titulo)}</h2>${sub ? `<p class="sub" style="margin:4px 0 0">${sub}</p>` : ''}</div><button type="button" class="btn" data-fechar aria-label="Fechar">✕</button></div><div class="pop-corpo carregando">Carregando…</div></div>`;
  const fechar = () => { f.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = ev => { if (ev.key === 'Escape') fechar(); };
  f.onclick = ev => { if (ev.target === f || ev.target.closest('[data-fechar]')) fechar(); };
  document.addEventListener('keydown', esc_); document.body.appendChild(f);
  return f.querySelector('.pop-corpo');
}
function popComposicao(item, D, c, ant) {
  const n = v => Number(v) || 0; const mes = nomeMes(c.mes);
  const pm = Object.fromEntries((D.parcs || []).map(p => [p.id, p]));
  const nomeP = id => pm[id] ? `${pm[id].regiao || ''}${pm[id].nome ? ' · ' + pm[id].nome : ''}` : '—';
  if (item === 'Kits/Spot') { spotPorCliente(abrirPop(`Kits/Spot por cliente · ${mes}`, 'Kits, spots e serviços fora do Umov. Clique no cliente para ver os parceiros e no parceiro para ver cada kit.'), c, ant); return; }
  if (item === 'Malote') { clientesMes(abrirPop(`Malote por cliente · ${mes}`, 'Valor do malote de cada parceiro dividido pelos atendimentos de cada cliente.'), c.id, 'malote', null); return; }
  const fe = D.fech.filter(f => f.competencia_id === c.id);
  const tabela = (box, linhas, cab, nota) => { box.className = ''; const tot = linhas.reduce((a, l) => a + l.v, 0); linhas.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const temItens = linhas.some(l => l.itens && l.itens.length);
    const sub = (l, ix) => (l.itens || []).slice().sort((a, b) => Math.abs(n(b.v)) - Math.abs(n(a.v))).map(t => `<tr class="pop-item" data-de="${ix}" hidden><td style="padding-left:28px">${esc(t.d || '—')}${t.x ? `<br><span class="nota">${esc(t.x)}</span>` : ''}</td><td class="n">${BRL2(n(t.v))}</td><td></td></tr>`).join('');
    box.innerHTML = linhas.length ? `${temItens ? '<p style="margin:0 0 8px"><button type="button" class="btn" data-abretudo>Abrir todos os lançamentos</button> <span class="nota">ou clique na linha para ver os lançamentos</span></p>' : ''}<div class="tabela"><table><thead><tr><th>${cab}</th><th class="n">Valor</th><th class="n">%</th></tr></thead><tbody>${linhas.map((l, ix) => `<tr ${l.itens && l.itens.length ? `data-abre="${ix}" style="cursor:pointer"` : ''}><td><b>${l.itens && l.itens.length ? '<span class="gseta" data-seta>›</span> ' : ''}${esc(l.k)}</b>${l.itens && l.itens.length ? ` <span class="nota">(${l.itens.length} lançamento${l.itens.length > 1 ? 's' : ''})</span>` : ''}${l.det ? `<br><span class="nota">${l.det}</span>` : ''}</td><td class="n">${BRL2(l.v)}</td><td class="n">${tot ? Math.round(100 * l.v / tot) : 0}%</td></tr>${sub(l, ix)}`).join('')}</tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${BRL2(tot)}</b></td><td></td></tr></tfoot></table></div>${nota ? `<p class="nota">${nota}</p>` : ''}` : '<p class="nota">Nada lançado neste mês.</p>';
    const abre = (ix, v) => { box.querySelectorAll(`[data-de="${ix}"]`).forEach(r => r.hidden = v === undefined ? !r.hidden : !v); const s = box.querySelector(`[data-abre="${ix}"] [data-seta]`); if (s) s.textContent = box.querySelector(`[data-de="${ix}"]`)?.hidden ? '›' : '⌄'; };
    box.querySelectorAll('[data-abre]').forEach(r => r.onclick = () => abre(r.dataset.abre));
    const bt = box.querySelector('[data-abretudo]'); if (bt) bt.onclick = () => { const abrir = bt.textContent.startsWith('Abrir'); box.querySelectorAll('[data-abre]').forEach(r => abre(r.dataset.abre, abrir)); bt.textContent = abrir ? 'Fechar todos' : 'Abrir todos os lançamentos'; }; };
  if (item === ATX) {
    const box = abrirPop(`${ATX} · ${mes}`, 'Atendimentos de malote além do contrato: 2ª visita de ponto mensal (ex.: Crefisa) e atendimentos extras lançados. Não contam como Kits/Spot.');
    (async () => { const D2 = S.dir; D2.spot = D2.spot || {}; let rs;
      try { rs = D2.spot[c.id] || (D2.spot[c.id] = await q(sb.rpc('dir_spot_cliente_j', { p_comp: c.id })) || []); } catch (e) { box.className = ''; box.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; return; }
      const g = {}; rs.filter(r => cliSpotDe(r, pm) === ATX).forEach(r => { const y = g[r.parceiro_id] || (g[r.parceiro_id] = { v: 0, n: 0, ls: [] }); y.v += n(r.valor); y.n += n(r.qtd) || 1; y.ls.push(r); });
      tabela(box, Object.entries(g).map(([pid, y]) => ({ k: nomeP(pid), v: y.v, itens: y.ls.map(l => ({ d: l.destino || l.cliente || 'Atendimento extra', v: l.valor, x: [l.cidade, l.data].filter(Boolean).join(' · ') })), det: y.ls.slice(0, 0).map(l => esc(l.origem === 'planilha' ? `${l.cliente} (planilha)` : (l.destino || l.cliente || ''))).join(' · ') + (y.ls.length > 1e9 ? ` · +${y.ls.length - 8}` : '') })), 'Parceiro', 'Antes ficavam em Kits/Spot como "Crefisa" e "Atendimento". O total do parceiro não muda.');
    })(); return;
  }
  if (item === 'Descontos') {
    const dd = (D.ddet || []).filter(x => x.competencia_id === c.id); const g = {};
    dd.forEach(x => { const k = x.categoria || 'Outros'; const y = g[k] || (g[k] = { k, v: 0, ps: {}, it: [] }); y.v += n(x.valor); y.ps[x.parceiro_id] = (y.ps[x.parceiro_id] || 0) + n(x.valor); y.it.push({ d: nomeP(x.parceiro_id), v: x.valor, x: [x.cliente, x.descricao].filter(Boolean).join(' · ') }); });
    const ls = Object.values(g).map(y => ({ k: y.k, v: y.v, itens: y.it }));
    tabela(abrirPop(`Descontos · ${mes}`, 'Por categoria, com os parceiros que mais tiveram desconto.'), ls.length ? ls : fe.filter(r => n(r.descontos)).map(r => ({ k: nomeP(r.parceiro_id), v: n(r.descontos) })), ls.length ? 'Categoria' : 'Parceiro');
    return;
  }
  const total = r => n(r.valor_aprovado ?? r.valor_final);
  if (item === 'Serviços fora do Umov' || item === 'Ajustes de fatura') {
    const pos = item === 'Serviços fora do Umov';
    const box = pos ? abrirPop(`Fora do Umov · ${mes}`, 'Serviços que o parceiro cobrou e que não passam pelo Umov: coletas de Fiorino/Van, corridas, rateio de fatura, armazenamento, taxas, transferências. Malote de cliente e 2ª visita de ponto mensal não entram aqui (estão em Malote e Atendimentos extras).')
      : abrirPop(`Ajustes de fatura e adiantamentos · ${mes}`, 'Lançamentos negativos: valor já pago por adiantamento em mês anterior, rateio de fatura entre praças e ajustes para bater com a NF do parceiro.');
    (async () => { const D2 = S.dir; D2.spot = D2.spot || {}; let rs;
      try { rs = D2.spot[c.id] || (D2.spot[c.id] = await q(sb.rpc('dir_spot_cliente_j', { p_comp: c.id })) || []); } catch (e) { box.className = ''; box.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; return; }
      const g = {};
      rs.filter(r => r.origem === 'fora').filter(r => { const k = cliSpotDe(r, pm); return !NAO_SPOT.has(k) && k !== ATX; })
        .forEach(r => { const y = g[r.parceiro_id] || (g[r.parceiro_id] = { v: 0, ls: [] }); y.v += n(r.valor); y.ls.push(r); });
      Object.keys(g).forEach(k => { if (pos ? g[k].v <= 0.005 : g[k].v >= -0.005) delete g[k]; });
      if (!pos) fe.forEach(r => { const o = total(r) - n(r.malote) - n(r.kits) - n(r.fora_umov) - n(r.atend_extra) - n(r.descontos); if (o < -0.5) { const y = g[r.parceiro_id] || (g[r.parceiro_id] = { v: 0, ls: [] }); y.v += o; y.ls.push({ destino: 'Acerto na aprovação (aprovado abaixo do calculado)', valor: o }); } });
      const desc = l => [l.cliente, l.destino].filter(x => x && !/^outro$/i.test(x)).join(' · ') || 'Serviço';
      tabela(box, Object.entries(g).map(([pid, y]) => ({ k: nomeP(pid), v: y.v, itens: y.ls.map(l => ({ d: desc(l), v: l.valor, x: [l.cidade, l.data ? fmtD(l.data) : ''].filter(Boolean).join(' · ') })) })), 'Parceiro',
        pos ? 'Lançados pelo parceiro no envio (ou pela GSM) e aceitos no fechamento.' : 'Não são descontos nem economia: só acertam o valor do mês com o que o parceiro faturou ou já recebeu.');
    })(); return;
  }
  const ls = fe.map(r => ({ k: nomeP(r.parceiro_id), v: total(r) - n(r.malote) - n(r.kits) - n(r.fora_umov) - n(r.atend_extra) - n(r.descontos) })).filter(l => Math.abs(l.v) > 0.5);
  tabela(abrirPop(`Outros ajustes · ${mes}`, 'Diferença entre o valor aprovado e malote + kits + fora do Umov − descontos, por parceiro.'), ls, 'Parceiro', 'Normalmente são acertos combinados na aprovação (valor aprovado diferente do calculado).');
}

// Classificação do extra: cliente de spot ou não (malote lançado como extra / ajuste)
function cliSpotDe(r, pm) {
  if (r.origem === 'planilha' && /^GSM$/i.test(String(r.cliente || '').trim())) return GSM_SPOT.test(pm[r.parceiro_id]?.nome || '') ? 'Extras sem cliente identificado' : 'Ajustes de malote e operacionais';
  const k = clienteSpot(r.cliente, r.destino);
  // Itaperuna (Elite): CIEE e as remessas com a GSM como remetente são a quinzena de malote do parceiro
  return k === 'CIEE' && /itaperuna/i.test(pm[r.parceiro_id]?.regiao || '') ? QUINZ : k;
}
// Na Diretoria, o que veio como extra mas não é spot sai de Kits/Spot: malote de cliente (Dass, Carmen, Vivara) vai para Malote; ajustes vão para Outros ajustes. O total do parceiro não muda.
function reclassificarSpot(fech, linhas, parcs) {
  const pm = Object.fromEntries((parcs || []).map(p => [p.id, p])); const aj = {};
  linhas.forEach(r => { const k = cliSpotDe(r, pm); if (!NAO_SPOT.has(k) && k !== ATX) return; const ch = r.competencia_id + '|' + r.parceiro_id; const x = aj[ch] || (aj[ch] = { mal: 0, aj: 0, atx: 0, kit: 0, fora: 0 });
    const v = Number(r.valor) || 0; if (k === ATX) x.atx += v; else if (k === 'Ajustes de malote e operacionais') x.aj += v; else x.mal += v; if (r.origem === 'fora') x.fora += v; else x.kit += v; });
  fech.forEach(f => { const x = aj[f.competencia_id + '|' + f.parceiro_id]; if (!x) return;
    f.malote_orig = f.malote; f.kits_orig = f.kits; f.fora_orig = f.fora_umov; f.naoSpot = x;
    f.malote = (Number(f.malote) || 0) + x.mal; f.kits = (Number(f.kits) || 0) - x.kit; f.fora_umov = (Number(f.fora_umov) || 0) - x.fora; f.atend_extra = x.atx; });
}

// ---------- Kits/Spot por cliente ----------
const ATX = 'Atendimentos extras';
const QUINZ = 'Quinzena de malote';
const CLI_SPOT = [[/SEM CLIENTE NA FATURA/, 'Sem cliente na fatura'], [/MAO COLORIDA/, 'Mão Colorida'], [/MOGK/, 'Mogk Máquinas'], [/LAV SERVICO/, 'LAV Serviço e Comunicação'], [/DUFRY/, 'Dufry'], [/PRINTMANN/, 'Printmann'], [/TRACK ?&? ?(AND |E )?FIELD|TRACKFIELD|\bTRACK\b/, 'Track&Field'], [/VIVARA/, 'Vivara'], [/MASSEI|LEADEC|\bJSL\b|OUTBACK|SODEXO|\bYPE\b|QUIMICA AMPARO/, 'Massei'], [/UNIDAS|BONECO|PEN ?DRIVE/, 'Unidas'], [/LOCALIZA/, 'Localiza'], [/AMALFIS|TELECOMUNICA|CLARO|EBAZAR/, 'Amalfis'],
  [/\bMAC\b|ELEGANCIA/, 'MAC'], [/SEPHORA/, 'Sephora'], [/COMBAG|\bMSL COMERCIO|L N DA SILVA|ECO ?BAG|\bS\.? ?V\.? ?C\.? ?LASER/, 'Combag'], [/SMART ?FIT/, 'Smart Fit'], [/CREFISA|^ATENDIMENTOS? EXTRA|^ATENDIMENTOS?\b/, 'Atendimentos extras'], [/SHIMADA/, 'Shimada'],
  [/AVELINO/, 'Avelino'], [/\bCIEE\b/, 'CIEE'], [/DAYCOVAL/, 'Daycoval'], [/ASSAI/, 'Assaí'], [/\bDASS\b/, 'Grupo Dass'],
  [/PEPPERONE/, 'Pepperone'], [/IFOOD/, 'iFood'], [/S\.? ?V\.? ?C\.? LASER/, 'SVC Laser'], [/\bZIO\b/, 'Zio Brindes'], [/\bARG\b/, 'ARG'],
  [/PRO VERDE/, 'Pro Verde'], [/ROAR/, 'Roar'], [/PERSONAL BRINDES/, '153 Personal'], [/IDEIA E COSTURA/, 'Ideia e Costura'],
  [/MERCANTIL/, 'Banco Mercantil'], [/EMBRACON/, 'Embracon'], [/CO[OR]PERCARGO/, 'Coopercargo'], [/\bCARMEN\b/, 'Carmen Steffens'],
  [/FIORINO|\bVAN\b/, 'Localiza'],
  [/\bGSM\b/, QUINZ], [/REDESPACHO|TRANSFER/, 'Redespacho / transferência']];
// clientes de malote que vieram lançados como extra: ficam fora do custo de spot (aparecem à parte)
// atendimentos de malote além do contrato (2ª visita de ponto mensal, Crefisa, "Atendimento extra"): composição própria
const NAO_SPOT = new Set(['Grupo Dass', 'Carmen Steffens', 'Vivara', 'Coopercargo', 'Embracon', 'Lider', QUINZ, 'Ajustes de malote e operacionais']);
// linhas "GSM" das planilhas: só Anjos (SC) e Cta (Curitiba) são entregas extras de spot (sem cliente informado); o resto é ajuste de malote, taxa ou acerto
const GSM_SPOT = /^(anjos|cta)$/i;
const GEN_SPOT = /^(OUTRO|OUTROS|SEM CLIENTE|SERVICO FORA DO UMOV|EXTRAS DO MES)?$/;
function clienteSpot(t, destino) {
  const N = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const u = N(t), dn = N(destino);
  const k = CLI_SPOT.find(([r]) => r.test(u)) || (GEN_SPOT.test(u) ? CLI_SPOT.find(([r]) => r.test(dn)) : null); if (k) return k[1];
  if (GEN_SPOT.test(u)) return u === 'SEM CLIENTE' && !dn ? 'Kit sem cliente informado' : 'Outros serviços';
  const w = u.replace(/^KITS? /, '').replace(/[(·].*$/, '').split(/[\s\-–]+/).filter(Boolean);
  if (!w.length) return 'Sem cliente';
  const n = (w[0].length <= 2 && w[1] ? w[0] + ' ' + w[1] : w[0]).toLowerCase();
  return n.replace(/(^|\s)\S/g, x => x.toUpperCase());
}
async function spotPorCliente(box, c, ant) {
  const D = S.dir; D.spot = D.spot || {};
  const pega = async id => D.spot[id] || (D.spot[id] = await q(sb.rpc('dir_spot_cliente_j', { p_comp: id })) || []);
  let atual, antes;
  try { [atual, antes] = await Promise.all([pega(c.id), ant ? pega(ant.id) : []]); }
  catch (e) { box.className = ''; box.innerHTML = `<div class="msg alerta">${esc(e.message)}</div>`; return; }
  if (S.dir.compId !== c.id) return;
  const pm = Object.fromEntries((D.parcs || []).map(p => [p.id, p]));
  const nomeP = id => pm[id] ? `${pm[id].regiao || ''}${pm[id].nome ? ' · ' + pm[id].nome : ''}` : '—';
  const agrupa = rs => { const g = {}; rs.forEach(r => { const k = r._cli || clienteSpot(r.cliente, r.destino); const x = g[k] || (g[k] = { v: 0, n: 0, parcs: {}, linhas: [] }); x.v += Number(r.valor) || 0; x.n += Number(r.qtd) || 0;
    const p = x.parcs[r.parceiro_id] || (x.parcs[r.parceiro_id] = { v: 0, n: 0, linhas: [], planilha: r.origem === 'planilha' }); p.v += Number(r.valor) || 0; p.n += Number(r.qtd) || 0; if (r.origem !== 'planilha') p.linhas.push(r); }); return g; };
  const pmS = Object.fromEntries((D.parcs || []).map(p => [p.id, p]));
  const cliDe = r => cliSpotDe(r, pmS);
  atual = atual.map(r => ({ ...r, _cli: cliDe(r) })); antes = antes.map(r => ({ ...r, _cli: cliDe(r) }));
  const ehSpot = r => !NAO_SPOT.has(r._cli) && r._cli !== ATX;
  const fora = {}; atual.filter(r => !ehSpot(r)).forEach(r => { const k = r._cli; fora[k] = (fora[k] || 0) + (Number(r.valor) || 0); });
  const foraTot = Object.values(fora).reduce((a, v) => a + v, 0);
  atual = atual.filter(ehSpot); antes = antes.filter(ehSpot);
  const parcial = c.status !== 'fechada'; const pAtual = new Set(atual.map(r => r.parceiro_id));
  const G = agrupa(atual), GA = agrupa(parcial ? antes.filter(r => pAtual.has(r.parceiro_id)) : antes);
  const lst = Object.entries(G).sort((a, b) => b[1].v - a[1].v);
  const tot = lst.reduce((a, [, x]) => a + x.v, 0), totA = Object.values(GA).reduce((a, x) => a + x.v, 0);
  box.className = '';
  if (!lst.length) { box.innerHTML = '<p class="nota">Nenhum kit ou spot lançado neste mês até agora.</p>'; return; }
  const max = lst[0][1].v || 1; const aberto = D.spotAberto || {}; const abertoP = D.spotParc || {};
  const varTxt = (v, va) => va ? `<span style="color:${v > va ? 'var(--brand)' : 'var(--muted)'}">${v >= va ? '+' : ''}${BRL(v - va)}</span>` : '<span class="nota">novo</span>';
  box.innerHTML = `<div class="linha" style="justify-content:space-between;margin-bottom:8px"><span class="nota">${lst.length} clientes · ${BRL(tot)} · ${pAtual.size} parceiros lançados${ant ? ` · ${nomeMes(ant.mes)}${parcial ? ', mesmos parceiros' : ''}: ${BRL(totA)}` : ''}</span><button class="btn" id="spot-xls">Baixar Excel</button></div>
    <div class="tabela"><table><thead><tr><th>Cliente</th><th></th><th class="n">Kits/Spot</th><th class="n">Valor</th><th class="n">Ticket</th><th class="n">${ant ? MES3[+ant.mes.slice(5, 7) - 1] : 'Mês ant.'}${parcial ? '*' : ''}</th><th class="n">Variação</th><th class="n">Parceiros</th></tr></thead><tbody>
    ${lst.map(([n, x]) => { const va = GA[n]?.v || 0; const ps = Object.entries(x.parcs).sort((a, b) => b[1].v - a[1].v);
      return `<tr data-spot="${esc(n)}" style="cursor:pointer"><td><b>${aberto[n] ? '▾' : '▸'} ${esc(n)}</b></td><td style="width:22%"><span style="display:block;height:10px;background:var(--rule-soft);border-radius:5px"><span style="display:block;height:10px;width:${100 * x.v / max}%;background:var(--brand);border-radius:5px"></span></span></td>
        <td class="n">${x.n ? fmtN(x.n) : '—'}</td><td class="n">${BRL2(x.v)}</td><td class="n">${x.n ? BRL2(x.v / x.n) : '—'}</td><td class="n">${va ? BRL2(va) : '—'}</td><td class="n">${varTxt(x.v, va)}</td><td class="n">${ps.length}</td></tr>
        ${aberto[n] ? ps.map(([pid, p]) => `<tr class="det" ${p.linhas.length ? `data-spotp="${esc(n)}|${pid}" style="background:var(--field);cursor:pointer"` : 'style="background:var(--field)"'}><td colspan="2" style="padding-left:28px">${p.linhas.length ? (abertoP[n + '|' + pid] ? '▾ ' : '▸ ') : ''}${esc(nomeP(pid))}${p.planilha ? ' <span class="nota">(planilha)</span>' : ''}</td><td class="n">${p.n ? fmtN(p.n) : '—'}</td><td class="n">${BRL2(p.v)}</td><td class="n">${p.n ? BRL2(p.v / p.n) : '—'}</td><td class="n">${GA[n]?.parcs[pid] ? BRL2(GA[n].parcs[pid].v) : '—'}</td><td colspan="2"></td></tr>
          ${p.linhas.length && abertoP[n + '|' + pid] ? `<tr class="det" style="background:var(--field)"><td colspan="8" style="padding:0 8px 10px 28px"><table style="width:100%;font-size:12px"><tbody>${p.linhas.sort((a, b) => String(a.data || '').localeCompare(String(b.data || ''))).map(l => `<tr><td style="width:80px">${l.data ? fmtD(l.data) : '—'}</td><td>${esc(l.cliente || '')}${l.destino && l.destino !== l.cliente ? ` <span class="nota">· ${esc(l.destino)}</span>` : ''}</td><td>${esc(l.cidade || '')}</td><td class="n">${BRL2(l.valor)}</td></tr>`).join('')}</tbody></table></td></tr>` : ''}`).join('') : ''}`; }).join('')}
    </tbody></table></div>
    ${foraTot ? `<p class="nota" style="margin-top:8px"><b>Fora do spot:</b> ${Object.entries(fora).map(([k, v]) => `${esc(k)} ${BRL2(v)}`).join(' · ')} (total ${BRL2(foraTot)}). Malotes lançados como extra e ajustes (tributação, peso extra, acertos de mês, taxas, retirada por atraso); continuam no valor do fechamento, mas na Diretoria não contam como Kits/Spot: malote de cliente (Dass, Carmen, Vivara, Coopercargo, Embracon) e a quinzena de malote de Itaperuna (CIEE e remessas com a GSM como remetente) entram em Malote, os atendimentos além do contrato (Crefisa, 2ª visita, "Atendimento extra") em Atendimentos extras e os ajustes em Outros ajustes. As entregas extras de Anjos (SC) e Cta (Curitiba) vêm num valor único; em setembro foram abertas por cliente a partir das faturas ("Sem cliente na fatura" = coletas da Anjos que trazem só o número da NF).</p>` : ''}
    <p class="nota">Meses até setembro vêm do histórico das planilhas (total por cliente e parceiro). A partir de outubro vêm dos relatórios lançados no portal, kit a kit; parceiro ainda não lançado não aparece. ${parcial ? `* Mês em aberto: a comparação com ${ant ? nomeMes(ant.mes) : 'o mês anterior'} usa só os parceiros já lançados, para não parecer queda.` : ''} O cliente é identificado pelo nome do kit (ex.: "KIT MASSEI…", Leadec, Sodexo, Outback e Ypê contam como Massei; Claro conta como Amalfis; coletas dedicadas de Fiorino/Van contam como Localiza).</p>`;
  box.querySelectorAll('tr[data-spot]').forEach(tr => tr.onclick = () => { const n = tr.dataset.spot; D.spotAberto = { ...(D.spotAberto || {}), [n]: !aberto[n] }; spotPorCliente(box, c, ant); });
  box.querySelectorAll('tr[data-spotp]').forEach(tr => tr.onclick = () => { const k = tr.dataset.spotp; D.spotParc = { ...abertoP, [k]: !abertoP[k] }; spotPorCliente(box, c, ant); });
  box.querySelector('#spot-xls').onclick = () => {
    const resumo = lst.map(([n, x]) => ({ 'Cliente': n, 'Kits/Spot': x.n, 'Valor': x.v, 'Ticket': x.n ? x.v / x.n : 0, [`Valor ${ant ? nomeMes(ant.mes) : 'mês anterior'}`]: GA[n]?.v || 0, 'Diferença': x.v - (GA[n]?.v || 0), 'Parceiros': Object.keys(x.parcs).length }));
    const det = []; lst.forEach(([n, x]) => Object.entries(x.parcs).forEach(([pid, p]) => { if (p.linhas.length) p.linhas.forEach(l => det.push({ 'Cliente': n, 'Parceiro': nomeP(pid), 'Data': l.data ? fmtD(l.data) : '', 'Kit / serviço': l.cliente || '', 'Destino': l.destino || '', 'Cidade': l.cidade || '', 'Qtd': Number(l.qtd) || 0, 'Valor': Number(l.valor) || 0 }));
      else det.push({ 'Cliente': n, 'Parceiro': nomeP(pid), 'Data': '', 'Kit / serviço': '(total da planilha)', 'Destino': '', 'Cidade': '', 'Qtd': p.n, 'Valor': p.v }); }));
    baixarXlsx(`Kits_Spot_por_cliente_${c.mes.slice(0, 7)}.xlsx`, { titulo: 'Kits/Spot por cliente', sub: nomeMes(c.mes), abas: [{ nome: 'Por cliente', linhas: resumo }, { nome: 'Detalhe', linhas: det }] });
  };
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
    <path d="M${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' L')}" fill="none" stroke="var(--ink)" stroke-width="2"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${p.atual ? 5 : 3}" fill="${p.atual ? 'var(--brand)' : 'var(--ink)'}" stroke="var(--field)" stroke-width="2"><title>${p.rot}: ${BRL(p.v)}</title></circle>
      <text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Poppins">${p.rot}</text>`).join('')}
    <text x="${x(pts.findIndex(p => p.atual))}" y="${y(pts.find(p => p.atual).v) - 9}" text-anchor="${pts.findIndex(p => p.atual) === pts.length - 1 ? 'end' : 'middle'}" font-size="12" font-weight="600" fill="var(--ink)" font-family="Poppins">${BRLk(pts.find(p => p.atual).v)}</text></svg>`;
  clientesMes(linha.querySelector('#dc'), c.id, op, pid);
}

// ---------- Histórico por cliente (carga das planilhas antigas) ----------
// ================= Cópia de segurança =================
const TAB_BACKUP = [
  ['parceiros', 'Parceiros', 'id'], ['contratos', 'Contratos', 'id'], ['rotas_depara', 'Rotas Umov', 'rota'], ['cidades_parceiro', 'Cidades por parceiro', null],
  ['cadastro_pontos', 'Carteira de pontos', 'cod_int'], ['cadastro_pontos_hist', 'Carteira - historico', 'id'], ['carteira_importacoes', 'Inclusao e cancelamento', 'id'],
  ['competencias', 'Competencias', 'mes'], ['competencia_eventos', 'Eventos do mes', 'id'], ['pontos_importacoes', 'Bases geradas', 'id'], ['pontos', 'Base de pontos por mes', 'id'],
  ['umov_importacoes', 'Importacoes Umov', 'id'], ['envios', 'Envios dos parceiros', 'id'], ['base_contestacoes', 'Ajustes dos parceiros', 'id'],
  ['divergencias', 'Itens da conferencia', 'id'], ['acoes_parceiro', 'Respostas dos parceiros', 'id'], ['ajustes', 'Ajustes e descontos GSM', 'id'],
  ['fechamento_parceiro', 'Fechamento por parceiro', null], ['fechamento_versoes', 'Versoes do fechamento', 'id'], ['adiantamentos', 'Adiantamentos', 'id'],
  ['notas_fiscais', 'Notas fiscais', 'id'], ['lotes_financeiro', 'Lotes de pagamento', 'id'], ['historico_cliente', 'Historico por cliente', 'id'],
  ['feriados', 'Feriados', 'data'], ['cadastro_log', 'Log do cadastro', 'id'],
];
async function vBackup() {
  const m = $('#main');
  m.innerHTML = `<div class="topo"><div><h1>Cópia de segurança</h1><p>Baixa um Excel com todas as tabelas do portal (uma aba por tabela) para guardar no OneDrive. No plano gratuito do Supabase não há backup diário; faça uma cópia ao fim de cada etapa importante do mês.</p></div></div>
    <section class="bloco"><h2>Gerar cópia</h2>
      <label class="linha"><input type="checkbox" id="bk-umov"> Incluir os atendimentos do Umov (cerca de 53 mil linhas por mês; o arquivo fica bem maior)</label>
      <div class="linha"><button class="btn marca" id="bk-ok">Baixar cópia de segurança</button></div><div id="bk-m"></div>
      <p class="nota">Os arquivos enviados (NFs em PDF, relatórios, comprovantes e as planilhas originais do Umov) continuam guardados no portal e não entram no Excel. Logins e senhas também não entram.</p></section>`;
  $('#bk-ok').onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true; const msg = $('#bk-m');
    try {
      const wb = XLSX.utils.book_new(); const resumo = [];
      const lista = TAB_BACKUP.concat($('#bk-umov').checked ? [['umov_vigente', 'Umov (importacao ativa)', 'id']] : []);
      for (const [t, nome, ord] of lista) {
        msg.innerHTML = `<div class="carregando">Baixando ${esc(nome)}… (${resumo.length + 1} de ${lista.length})</div>`;
        let rows;
        try { rows = await todas(() => { let qy = sb.from(t).select('*'); return ord ? qy.order(ord) : qy; }); }
        catch (e) { resumo.push({ Tabela: nome, Linhas: null, Obs: 'não lida: ' + e.message }); continue; }
        const plano = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v != null && typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : v])));
        XLSX.utils.book_append_sheet(wb, plano.length ? XLSX.utils.json_to_sheet(plano) : XLSX.utils.aoa_to_sheet([['(vazia)']]), nome.slice(0, 31));
        resumo.push({ Tabela: nome, Linhas: rows.length, Obs: '' });
      }
      const agora = new Date();
      const capa = XLSX.utils.json_to_sheet([{ Tabela: 'Cópia gerada em', Linhas: agora.toLocaleString('pt-BR'), Obs: `por ${S.user.email} · versão ${VERSAO}` }, ...resumo]);
      XLSX.utils.book_append_sheet(wb, capa, 'Resumo'); wb.SheetNames.unshift(wb.SheetNames.pop());
      const z = n => String(n).padStart(2, '0'); const stamp = `${agora.getFullYear()}${z(agora.getMonth() + 1)}${z(agora.getDate())}_${z(agora.getHours())}${z(agora.getMinutes())}`;
      XLSX.writeFile(wb, `Portal_Fechamento_copia_${stamp}.xlsx`, { compression: true });
      msg.innerHTML = `<div class="msg ok">Cópia baixada: ${resumo.length} tabelas, ${fmtN(resumo.reduce((a, r) => a + (r.Linhas || 0), 0))} linhas.${resumo.some(r => r.Linhas == null) ? ' Algumas tabelas não foram lidas; veja a aba Resumo.' : ''}</div>`;
    } catch (e) { msg.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
    b.disabled = false;
  };
}

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

// ================= Operação ao vivo (robô Umov no Supabase, de hora em hora) =================
const OP_CAT = { realizado: ['Realizado', 'var(--eco)'], ocorrencia: ['Com ocorrência', 'var(--alert)'], aberto: ['Falta baixa', 'var(--brand)'], cancelado: ['Cancelado', 'var(--off)'] };
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodoOp(k) { const h = new Date(); const d = n => { const x = new Date(h); x.setDate(x.getDate() + n); return isoDia(x); };
  if (k === 'hoje') return [d(0), d(0)]; if (k === 'ontem') return [d(-1), d(-1)]; if (k === '7d') return [d(-6), d(0)];
  return [isoDia(new Date(h.getFullYear(), h.getMonth(), 1)), d(0)]; }
async function vOperacao(el) {
  el = el || $('#main'); const O = S.oper || (S.oper = { per: 'hoje', parc: '', cli: '', lista: 'abertos', sort: ['aberto', -1], busca: '', bcli: '' });
  if (O.per !== 'custom') [O.de, O.ate] = periodoOp(O.per);
  el.innerHTML = '<div class="carregando">Carregando os atendimentos do Umov…</div>';
  const args = { p_de: O.de, p_ate: O.ate, p_parceiro: O.parc || null, p_cliente: O.cli || null };
  let R, PR, EX; try { [R, PR, EX] = await Promise.all([q(sb.rpc('umov_painel', args)), q(sb.rpc('umov_prev_real', args)).catch(e => ({ erro: e.message })),
    todas(() => sb.rpc('umov_extras', { p_de: O.de, p_ate: O.ate, p_parceiro: O.parc || null })).catch(e => ({ erro: e.message }))]); }
  catch (e) { el.innerHTML = `<div class="msg alerta">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
  O.R = R; O.PR = PR; O.EX = EX; desenharOperacao(el);
}
function desenharOperacao(el) {
  const O = S.oper, R = O.R || {}; const k = R.kpi || {}, ko = R.kpi_op || {};
  const ab = (k.atrasado || 0) + (k.em_campo || 0) + (k.pendente || 0); const prog = (k.realizado || 0) + (k.ocorrencia || 0) + ab;
  const pc = (a, b) => b ? Math.round(1000 * a / b) / 10 + '%' : '—';
  const umDia = O.de === O.ate; const hoje = isoDia(new Date());
  const per = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['mes', 'Mês atual']];
  const fP = (R.filtros?.parceiros || []).sort((a, b) => a.nome.localeCompare(b.nome)), fC = (R.filtros?.clientes || []).sort();
  const opTxt = (cat) => { const m = ko['malote_' + cat] || 0, kt = ko['kit_' + cat] || 0; return kt ? `${fmtN(m)} malote · ${fmtN(kt)} kits` : ''; };
  el.innerHTML = `
  <div class="topo"><div><h1>Operação ao vivo</h1><p>Atendimentos do Umov lidos pelo Robô Leitor do Umov a cada 2 horas. Atualizado em <b>${fmtDH(R.atualizado)}</b>.${R.sem_detalhe ? ` <span class="pill alerta">${fmtN(R.sem_detalhe)} atendimentos do período ainda sendo carregados</span>` : ''}</p></div>
    <div class="linha" style="flex-wrap:wrap;gap:8px">
      <div class="alterna" role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">
        ${per.map(([kk, n]) => `<button type="button" data-oper="${kk}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${O.per === kk ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
      <input type="date" id="op-de" value="${O.de}" style="min-height:44px"> <input type="date" id="op-ate" value="${O.ate}" style="min-height:44px">
      <button class="btn sec peq" id="op-xls" style="min-height:44px">Excel</button><button class="btn marca peq" id="op-tv" style="min-height:44px">Modo TV</button></div></div>
  <div class="linha" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <select id="op-parc" style="min-height:44px;max-width:340px"><option value="">Todos os parceiros</option>${fP.map(p => `<option value="${p.id}" ${O.parc === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
    <select id="op-cli" style="min-height:44px;max-width:300px"><option value="">Todos os clientes</option>${fC.map(c => `<option ${O.cli === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    ${O.parc || O.cli ? '<button class="btn sec peq" id="op-limpa" style="min-height:44px">Limpar filtros</button>' : ''}</div>
  <div class="kpis">
    <div class="kpi neutro"><small>Programados</small><b>${fmtN(prog)}</b><span>${opTxt('realizado') ? fmtN((ko.malote_realizado || 0) + (ko.malote_ocorrencia || 0) + ['atrasado', 'em_campo', 'pendente'].reduce((a, c) => a + (ko['malote_' + c] || 0), 0)) + ' malote' : 'sem os cancelados'}</span></div>
    <div class="kpi eco"><small>Realizados</small><b>${fmtN(k.realizado || 0)}</b><span>${pc(k.realizado || 0, prog)} dos programados</span></div>
    <div class="kpi ${k.ocorrencia ? 'alerta' : 'neutro'}"><small>Com ocorrência</small><b>${fmtN(k.ocorrencia || 0)}</b><span>${pc(k.ocorrencia || 0, prog)} · retornou sem atender</span></div>
    <div class="kpi"><small>Falta baixa</small><b>${fmtN((k.em_campo || 0) + (k.pendente || 0))}</b><span>${fmtN(k.em_campo || 0)} em campo · ${fmtN(k.pendente || 0)} não enviados</span></div>
    <div class="kpi ${k.atrasado ? 'alerta' : 'neutro'}"><small>Atrasados</small><b>${fmtN(k.atrasado || 0)}</b><span>dias anteriores sem baixa</span></div>
    <div class="kpi neutro"><small>Cancelados</small><b>${fmtN(k.cancelado || 0)}</b><span>no período</span></div>
  </div>
  <section class="bloco"><h2>Previsto x Realizado · Malote</h2><p class="sub"><b>Previsto</b>: carteira de pontos cadastrada hoje no portal (frequência de cada ponto nos dias úteis do período; quinzenal e mensal rateados pelos dias úteis do mês). <b>Realizado</b>: atendimentos retornados de campo no Umov, lidos pelo robô. Kits ficam fora.</p><div id="op-pr"></div></section>
  <section class="bloco" id="op-exb"><h2>Atendimentos fora do previsto</h2><p class="sub">Atendimentos no Umov que a carteira do portal não prevê: fora dos dias da frequência, acima do quinzenal/mensal, repetidos no dia, em ponto inativo ou fora da carteira. Mostra quem incluiu no Umov e por onde (painel web = inclusão manual, normalmente o SAC). Marque cada um como OK ou Não autorizado.</p><div id="op-ex"><div class="carregando">Carregando…</div></div></section>
  ${umDia ? '' : `<section class="bloco"><h2>Dia a dia</h2><div id="op-graf" style="position:relative"></div></section>`}
  <section class="bloco"><h2>Por parceiro</h2><p class="sub">Clique no parceiro para filtrar a tela. Ordene pelas colunas.</p><div id="op-parcs"></div></section>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:22px">
    <section class="bloco"><h2>Ocorrências</h2><p class="sub">Retornadas de campo sem a entrega/coleta. Entram no fechamento como visita.</p><div id="op-oc"></div></section>
    <section class="bloco"><h2>Por cliente</h2><input type="search" id="op-bcli" placeholder="Buscar cliente" value="${esc(O.bcli)}" style="width:100%;min-height:40px;margin-bottom:8px"><div id="op-clis"></div></section></div>
  <section class="bloco"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Atendimentos</h2>
    <div class="linha" style="gap:8px"><div class="alterna" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${[['abertos', 'Falta baixa e atrasados'], ['ocorr', 'Ocorrências']].map(([kk, n]) => `<button type="button" data-oplis="${kk}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${O.lista === kk ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
    <input type="search" id="op-busca" placeholder="Buscar ponto, cidade, agente" value="${esc(O.busca)}" style="min-height:40px;min-width:220px"></div></div><div id="op-lista" style="margin-top:10px"></div></section>`;
  const recarregar = () => vOperacao(el);
  el.querySelectorAll('[data-oper]').forEach(b => b.onclick = () => { O.per = b.dataset.oper; recarregar(); });
  ['op-de', 'op-ate'].forEach(id => el.querySelector('#' + id).onchange = () => { const de = el.querySelector('#op-de').value, ate = el.querySelector('#op-ate').value; if (!de || !ate) return; O.per = 'custom'; O.de = de <= ate ? de : ate; O.ate = de <= ate ? ate : de; recarregar(); });
  el.querySelector('#op-parc').onchange = e => { O.parc = e.target.value; recarregar(); };
  el.querySelector('#op-cli').onchange = e => { O.cli = e.target.value; recarregar(); };
  const lp = el.querySelector('#op-limpa'); if (lp) lp.onclick = () => { O.parc = ''; O.cli = ''; recarregar(); };
  el.querySelectorAll('[data-oplis]').forEach(b => b.onclick = () => { O.lista = b.dataset.oplis; desenharOperacao(el); });
  el.querySelector('#op-busca').oninput = e => { O.busca = e.target.value; listaOp(el); };
  el.querySelector('#op-bcli').oninput = e => { O.bcli = e.target.value; clientesOp(el); };
  el.querySelector('#op-xls').onclick = () => exportarOp().catch(e => alertaTopo(e.message));
  el.querySelector('#op-tv').onclick = () => { if (S.perfil.papel === 'admin') location.hash = '#tv'; else vTv(); };
  if (!umDia) graficoOp(el.querySelector('#op-graf'), R.dia || []);
  parceirosOp(el); clientesOp(el); listaOp(el); prevRealOp(el); extrasOp(el);
  const oc = R.ocorrencias || []; const mx = Math.max(1, ...oc.map(o => o.n));
  el.querySelector('#op-oc').innerHTML = oc.length ? oc.map(o => `<div style="display:grid;grid-template-columns:minmax(120px,190px) 1fr 54px;gap:8px;align-items:center;margin:5px 0;font-size:14px">
      <span title="${o.parceiros} parceiro(s)">${esc(o.status)}</span><span style="background:var(--rule-soft);border-radius:4px;height:14px"><span style="display:block;height:14px;border-radius:4px;background:var(--alert);width:${100 * o.n / mx}%"></span></span><b class="num" style="text-align:right">${fmtN(o.n)}</b></div>`).join('') : '<p class="nota">Nenhuma ocorrência no período.</p>';
}
function parceirosOp(el) {
  const O = S.oper; const [sk, sd] = O.sort;
  const L = (O.R.parceiros || []).map(p => { const prog = p.realizado + p.ocorrencia + p.aberto; return { ...p, prog, pr: prog ? p.realizado / prog : null }; })
    .sort((a, b) => (typeof a[sk] === 'string' ? (a[sk] || '').localeCompare(b[sk] || '') : (a[sk] ?? -1) - (b[sk] ?? -1)) * sd);
  const col = [['nome', 'Parceiro'], ['prog', 'Programados', 1], ['realizado', 'Realizados', 1], ['pr', '% realizado', 1], ['ocorrencia', 'Ocorrências', 1], ['aberto_hoje', 'Falta baixa', 1], ['atrasado', 'Atrasados', 1], ['kits', 'Kits', 1], ['ultima_baixa', 'Última baixa', 1]];
  const box = el.querySelector('#op-parcs');
  box.innerHTML = L.length ? `<div class="tabela"><table><thead><tr>${col.map(([kk, n, num]) => `<th class="${num ? 'n' : ''}" data-opsort="${kk}" style="cursor:pointer;white-space:nowrap">${n}${sk === kk ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${L.map(p => `<tr ${p.id ? `data-opp="${p.id}" style="cursor:pointer"` : ''}><td>${p.id ? '' : '<span class="pill alerta">sem parceiro</span> '}${esc(p.nome)}</td><td class="n">${fmtN(p.prog)}</td><td class="n eco">${fmtN(p.realizado)}</td>
      <td class="n"><b class="${p.pr != null && p.pr < .9 ? '' : 'eco'}" style="${p.pr != null && p.pr < .9 ? 'color:var(--alert)' : ''}">${p.pr == null ? '—' : Math.round(p.pr * 100) + '%'}</b></td>
      <td class="n" style="${p.ocorrencia ? 'color:var(--alert)' : ''}">${fmtN(p.ocorrencia)}</td><td class="n">${fmtN(p.aberto_hoje)}</td><td class="n">${p.atrasado ? `<span class="pill marca">${fmtN(p.atrasado)}</span>` : '0'}</td><td class="n">${fmtN(p.kits)}</td><td class="n" style="white-space:nowrap">${p.ultima_baixa ? fmtDH(p.ultima_baixa) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total (${L.length})</b></td>${['prog', 'realizado'].map(kk => `<td class="n"><b>${fmtN(L.reduce((a, p) => a + p[kk], 0))}</b></td>`).join('')}<td class="n"><b>${(() => { const a = L.reduce((s, p) => s + p.realizado, 0), b = L.reduce((s, p) => s + p.prog, 0); return b ? Math.round(100 * a / b) + '%' : '—'; })()}</b></td>${['ocorrencia', 'aberto_hoje', 'atrasado', 'kits'].map(kk => `<td class="n"><b>${fmtN(L.reduce((a, p) => a + p[kk], 0))}</b></td>`).join('')}<td></td></tr></tfoot></table></div>` : '<p class="nota">Nenhum atendimento no período.</p>';
  box.querySelectorAll('[data-opsort]').forEach(th => th.onclick = () => { const kk = th.dataset.opsort; O.sort = [kk, O.sort[0] === kk ? -O.sort[1] : (kk === 'nome' ? 1 : -1)]; parceirosOp(el); });
  box.querySelectorAll('[data-opp]').forEach(tr => tr.onclick = () => { O.parc = tr.dataset.opp; vOperacao(el); });
}
function clientesOp(el) {
  const O = S.oper; const f = norm(O.bcli || ''); const L = (O.R.clientes || []).filter(c => !f || norm(c.nome).includes(f));
  const box = el.querySelector('#op-clis');
  box.innerHTML = L.length ? `<div class="tabela" style="max-height:420px;overflow:auto"><table><thead><tr><th>Cliente</th><th class="n">Programados</th><th class="n">% realizado</th><th class="n">Ocorr.</th><th class="n">Falta baixa</th></tr></thead><tbody>
    ${L.map(c => { const prog = c.realizado + c.ocorrencia + c.aberto; return `<tr data-opc="${esc(c.nome)}" style="cursor:pointer"><td>${esc(c.nome)}</td><td class="n">${fmtN(prog)}</td><td class="n">${prog ? Math.round(100 * c.realizado / prog) + '%' : '—'}</td><td class="n">${fmtN(c.ocorrencia)}</td><td class="n">${fmtN(c.aberto)}${c.atrasado ? ` <span class="pill marca" title="atrasados">${c.atrasado}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="nota">Nenhum cliente encontrado.</p>';
  box.querySelectorAll('[data-opc]').forEach(tr => tr.onclick = () => { O.cli = tr.dataset.opc === '—' ? '' : tr.dataset.opc; vOperacao(el); });
}
function listaOp(el) {
  const O = S.oper; const ab = O.lista === 'abertos'; const f = norm(O.busca || '');
  const base = (ab ? O.R.abertos : O.R.lista_ocorr) || [];
  const L = base.filter(r => !f || norm([r.cod_int, r.local_desc, r.grupo_cliente, r.cidade, r.uf, r.agente, r.parceiro, r.status_gsm].join(' ')).includes(f));
  const SIT = { atrasado: ['Atrasado', 'marca'], em_campo: ['Em campo', ''], pendente: ['Não enviado', 'alerta'] };
  el.querySelector('#op-lista').innerHTML = L.length ? `<div class="tabela" style="max-height:560px;overflow:auto"><table><thead><tr><th>Data</th><th>${ab ? 'Situação' : 'Ocorrência'}</th><th>Ponto</th><th>Cliente</th><th>Cidade</th><th>Parceiro / agente</th></tr></thead><tbody>
    ${L.slice(0, 600).map(r => `<tr><td style="white-space:nowrap">${fmtD(r.data)}${r.hora ? ' ' + esc(r.hora.slice(0, 5)) : ''}</td>
      <td>${ab ? `<span class="pill ${SIT[r.cat]?.[1] || ''}">${SIT[r.cat]?.[0] || esc(r.situacao)}</span>${r.op === 'kit' ? ' <span class="pill">Kit</span>' : ''}` : `<span class="pill alerta">${esc(r.status_gsm)}</span>${r.obs ? `<br><span class="nota">${esc(r.obs)}</span>` : ''}`}</td>
      <td>${esc(r.cod_int || '')}<br><span class="nota">${esc(r.local_desc || '')}</span></td><td>${esc(r.grupo_cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td><td>${esc(r.parceiro)}<br><span class="nota">${esc(r.agente || '')}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="nota">${L.length > 600 ? `Mostrando 600 de ${fmtN(L.length)}. Use a busca ou o Excel para ver todos.` : `${fmtN(L.length)} atendimento(s).`}${base.length >= 1500 ? ' A lista traz no máximo 1.500 por vez: filtre por parceiro ou período.' : ''}</p>` : `<p class="nota">${ab ? 'Nada pendente de baixa no período.' : 'Nenhuma ocorrência no período.'}</p>`;
}
function graficoOp(box, dias) {
  if (!box) return; if (!dias.length) { box.innerHTML = '<p class="nota">Sem dados no período.</p>'; return; }
  const W = Math.max(640, box.clientWidth || 900), H = 240, pl = 44, pr = 10, pt = 14, pb = 34; const mx = Math.max(1, ...dias.map(d => d.realizado + d.ocorrencia + d.aberto));
  const bw = (W - pl - pr) / dias.length; const y = v => pt + (H - pt - pb) * (1 - v / mx);
  const ticks = [0, .25, .5, .75, 1].map(t => Math.round(mx * t));
  const seg = [['realizado', 'var(--eco)'], ['ocorrencia', 'var(--alert)'], ['aberto', 'var(--brand)']];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Atendimentos por dia">
    ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtN(t)}</text>`).join('')}
    ${dias.map((d, i) => { let acc = 0; const x = pl + i * bw + bw * .15, w = bw * .7; const dt = new Date(d.data + 'T12:00'); const fds = dt.getDay() === 0 || dt.getDay() === 6;
      return `<g data-opd="${i}">${seg.map(([kk, cor]) => { const v = d[kk]; if (!v) return ''; const y1 = y(acc + v), y0 = y(acc); acc += v; return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1)}" fill="${cor}"/>`; }).join('')}
        <rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>
        ${dias.length <= 31 ? `<text x="${x + w / 2}" y="${H - pb + 14}" text-anchor="middle" font-size="11" fill="${fds ? 'var(--off)' : 'var(--muted)'}">${d.data.slice(8, 10)}</text>` : ''}</g>`; }).join('')}
  </svg><div class="linha" style="gap:14px;font-size:13px;color:var(--muted)">${seg.map(([kk, cor]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cor};margin-right:5px"></i>${OP_CAT[kk === 'aberto' ? 'aberto' : kk][0]}</span>`).join('')}</div>
  <div id="op-tip" style="position:absolute;display:none;pointer-events:none;background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.12)"></div>`;
  const tip = box.querySelector('#op-tip');
  box.querySelectorAll('[data-opd]').forEach(g => { g.onmousemove = ev => { const d = dias[+g.dataset.opd]; const prog = d.realizado + d.ocorrencia + d.aberto; const r = box.getBoundingClientRect();
      tip.innerHTML = `<b>${fmtD(d.data)}</b><br>Programados: ${fmtN(prog)}<br><span class="eco">Realizados: ${fmtN(d.realizado)} (${prog ? Math.round(100 * d.realizado / prog) : 0}%)</span><br><span style="color:var(--alert)">Ocorrências: ${fmtN(d.ocorrencia)}</span><br><span style="color:var(--brand)">Falta baixa: ${fmtN(d.aberto)}</span>${d.cancelado ? `<br>Cancelados: ${fmtN(d.cancelado)}` : ''}`;
      tip.style.display = 'block'; const tx = ev.clientX - r.left + 14; tip.style.left = Math.min(tx, r.width - 200) + 'px'; tip.style.top = (ev.clientY - r.top - 10) + 'px'; };
    g.onmouseleave = () => tip.style.display = 'none'; });
}
async function exportarOp() {
  const O = S.oper, R = O.R; const per = O.de === O.ate ? fmtD(O.de) : `${fmtD(O.de)} a ${fmtD(O.ate)}`;
  const buf = await planilhaPadrao({ titulo: 'Operação ao vivo · Umov', sub: per, abas: [
    { nome: 'Previsto x Realizado', linhas: ((O.PR || {}).parceiros || []).map(p => ({ Parceiro: p.nome, Pontos: p.pontos, Previsto: Math.round(p.prev), Realizado: p.real, 'Atingido %': p.prev ? Math.round(100 * p.real / p.prev) : null, Ocorrencias: p.oc, 'Pontos sem atendimento': p.sem_atend, 'Fora da carteira': p.fora })) },
    { nome: 'Pontos fora do previsto', linhas: ((O.PR || {}).pontos || []).map(r => ({ Ponto: r.cod_int, Cliente: r.cliente, Loja: r.loja, Cidade: r.cidade, UF: r.uf, Frequencia: r.frequencia, Parceiro: r.parceiro, Previsto: r.prev, Realizado: r.real, Ocorrencias: r.oc, 'Sem baixa': r.ab })) },
    { nome: 'Fora da carteira', linhas: ((O.PR || {}).fora_lista || []).map(r => ({ Ponto: r.cod_int, Local: r.local, Cliente: r.cliente, Cidade: r.cidade, UF: r.uf, Parceiro: r.parceiro, Atendimentos: r.real })) },
    { nome: 'Parceiros', linhas: (R.parceiros || []).map(p => ({ Parceiro: p.nome, Programados: p.realizado + p.ocorrencia + p.aberto, Realizados: p.realizado, Ocorrencias: p.ocorrencia, 'Falta baixa': p.aberto_hoje, Atrasados: p.atrasado, Kits: p.kits })) },
    { nome: 'Clientes', linhas: (R.clientes || []).map(c => ({ Cliente: c.nome, Programados: c.realizado + c.ocorrencia + c.aberto, Realizados: c.realizado, Ocorrencias: c.ocorrencia, 'Falta baixa': c.aberto, Atrasados: c.atrasado })) },
    { nome: 'Falta baixa', linhas: (R.abertos || []).map(r => ({ Data: r.data, Situacao: r.situacao, Ponto: r.cod_int, Local: r.local_desc, Cliente: r.grupo_cliente, Cidade: r.cidade, UF: r.uf, Parceiro: r.parceiro, Agente: r.agente })) },
    { nome: 'Ocorrencias', linhas: (R.lista_ocorr || []).map(r => ({ Data: r.data, Ocorrencia: r.status_gsm, Observacao: r.obs, Ponto: r.cod_int, Local: r.local_desc, Cliente: r.grupo_cliente, Cidade: r.cidade, UF: r.uf, Parceiro: r.parceiro, Agente: r.agente })) },
    { nome: 'Por dia', linhas: (R.dia || []).map(d => ({ Data: d.data, Programados: d.realizado + d.ocorrencia + d.aberto, Realizados: d.realizado, Ocorrencias: d.ocorrencia, 'Falta baixa': d.aberto, Cancelados: d.cancelado })) }] });
  baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Operacao_Umov_${O.de}_${O.ate}.xlsx`);
}

// ================= Torre de controle: todos os robôs agendados no Supabase (pg_cron) =================
// Próxima execução a partir da expressão cron (o pg_cron usa horário UTC)
function proximaCron(expr, de = new Date()) {
  const [mi, ho, dm, me, ds] = String(expr || '').trim().split(/\s+/); if (ds == null) return null;
  const casa = (campo, v) => campo === '*' || campo.split(',').some(p => { const [faixa, passo] = p.split('/'); const st = +(passo || 1);
    let a, b; if (faixa === '*') { a = 0; b = 99; } else if (faixa.includes('-')) [a, b] = faixa.split('-').map(Number); else { a = +faixa; b = passo ? 99 : a; }
    return v >= a && v <= b && (v - a) % st === 0; });
  const t = new Date(de); t.setUTCSeconds(0, 0); t.setUTCMinutes(t.getUTCMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 40; i++, t.setUTCMinutes(t.getUTCMinutes() + 1))
    if (casa(mi, t.getUTCMinutes()) && casa(ho, t.getUTCHours()) && casa(dm, t.getUTCDate()) && casa(me, t.getUTCMonth() + 1) && casa(ds, t.getUTCDay())) return new Date(t);
  return null;
}
// execução cancelada por nós (ex.: para aplicar uma mudança) não é falha do robô
const RX_INTERROMPIDO = /due to user request|^job canceled/i;
function statusRobo(r, agora = new Date()) {
  const u = r.ultima || {};
  if (!r.active && /^umov-(backfill|outubro)/.test(r.jobname || '') && (r.ultima || {}).status === 'succeeded') return ['concluido', 'Concluído · carga terminada', 'var(--eco)'];
  if (!r.active) return ['pausado', 'Pausado', 'var(--off)'];
  if (u.status === 'running' || u.status === 'starting') return ['rodando', 'Rodando agora', 'var(--off2)'];
  if (u.status === 'failed' && RX_INTERROMPIDO.test(u.msg || '')) return ['interrompido', 'Interrompido manualmente', 'var(--alert)'];
  if (u.status === 'failed') return ['falha', 'Falhou na última execução', 'var(--brand)'];
  if (r.ultimo_ok && (agora - new Date(r.ultimo_ok)) / 60000 > r.tolerancia_min) return ['atrasado', 'Sem rodar no prazo', 'var(--alert)'];
  if (!u.status) return ['aguardando', 'Aguardando a 1ª execução', 'var(--muted)'];
  return ['ok', 'Funcionando', 'var(--eco)'];
}
const durTxt = s => s == null ? '—' : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`;
const haTxt = iso => { if (!iso) return '—'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}` : `há ${Math.floor(m / 1440)} dia(s)`; };
const emTxt = d => { if (!d) return '—'; const m = Math.round((d - Date.now()) / 60000); return m < 1 ? 'em instantes' : m < 60 ? `em ${m} min` : m < 1440 ? `em ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}` : `em ${Math.floor(m / 1440)} dia(s)`; };
async function vTorre() {
  const m = $('#main'); clearInterval(S.torreTimer);
  if (!m.querySelector('#torre')) m.innerHTML = `<div class="topo"><div><h1>Torre de controle</h1><p>Os robôs que trabalham sozinhos no portal: o que está funcionando, o que rodou nas últimas 24 horas e o que vem a seguir.</p></div>
    <div class="linha"><button class="btn marca peq" id="tr-tv" style="min-height:44px">Modo TV · operação</button><button class="btn marca peq" id="tr-tvd" style="min-height:44px">Modo TV · diretoria</button><button class="btn marca peq" id="tr-tvg" style="min-height:44px">Modo TV · carrossel geral</button><button class="btn sec peq" id="tr-atu" style="min-height:44px">Atualizar agora</button></div></div><div id="torre"><div class="carregando">Carregando…</div></div>`;
  $('#tr-atu').onclick = () => vTorre();
  $('#tr-tv').onclick = () => { location.hash = '#tv'; };
  $('#tr-tvd').onclick = () => { location.hash = '#tvdir'; };
  $('#tr-tvg').onclick = () => { location.hash = '#tvgeral'; };
  sb.rpc('uso_banco').then(r => { if (!r.error) { S.mem = r.data; const z = $('#tr-mem'); if (z) z.innerHTML = memoriaHtml(S.mem, true); } });
  let T; try { T = await q(sb.rpc('torre_robos')); } catch (e) { $('#torre').innerHTML = `<div class="msg alerta">Não foi possível ler os robôs: ${esc(e.message)}</div>`; return; }
  S.torre = T; desenharTorre();
  S.torreTimer = setInterval(() => { if (S.view !== 'torre' || !document.body.contains($('#torre'))) { clearInterval(S.torreTimer); return; } vTorre(); }, 60000);
}
// ---------- Memória do banco: alerta antes de chegar no limite do plano ----------
const MB = b => b == null ? '—' : b >= 1073741824 ? (b / 1073741824).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' GB' : Math.round(b / 1048576).toLocaleString('pt-BR') + ' MB';
function memNivel(M) { const p = Math.max(M.db_bytes / M.db_limite, M.storage_bytes / M.storage_limite) * 100; const d = M.dias_ate_limite_db;
  return p >= M.critico_pct || (d != null && d <= 20) ? 'critico' : p >= M.alerta_pct || (d != null && d <= 60) ? 'alerta' : 'ok'; }
function memoriaHtml(M, completo) {
  const pdb = 100 * M.db_bytes / M.db_limite, pst = 100 * M.storage_bytes / M.storage_limite, nv = memNivel(M);
  const cor = nv === 'critico' ? 'var(--brand)' : nv === 'alerta' ? 'var(--alert)' : 'var(--eco)';
  const barra = (pc, t, u, l) => `<div style="flex:1 1 260px"><div class="linha" style="justify-content:space-between"><b>${t}</b><span>${MB(u)} de ${MB(l)} · <b>${Math.round(pc)}%</b></span></div>
    <div style="height:10px;border-radius:99px;background:var(--rule);margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.min(100, pc).toFixed(1)}%;background:${pc >= M.critico_pct ? 'var(--brand)' : pc >= M.alerta_pct ? 'var(--alert)' : 'var(--eco)'}"></div></div></div>`;
  const d = M.dias_ate_limite_db; const quando = d != null ? new Date(Date.now() + d * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  return `<section class="bloco" style="border-left:5px solid ${cor};margin:0 0 14px">
    <div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Memória do banco</h2>
      <span class="pill" style="background:${cor};color:#fff;font-weight:600">${nv === 'critico' ? 'Crítico' : nv === 'alerta' ? 'Atenção' : 'Tudo certo'}</span></div>
    <div class="linha" style="gap:24px;flex-wrap:wrap;margin-top:12px">${barra(pdb, 'Banco de dados', M.db_bytes, M.db_limite)}${barra(pst, 'Arquivos (NFs, planilhas)', M.storage_bytes, M.storage_limite)}</div>
    <p class="sub" style="margin:12px 0 0">${M.cresc_db_dia ? `O banco cresce cerca de <b>${MB(M.cresc_db_dia * 30)} por mês</b>${M.estimado ? ' (estimativa; com 7 dias de registro passa a usar o crescimento real)' : ''}.` : ''}
      ${quando ? ` No ritmo atual, chega no limite por volta de <b>${quando}</b> (${d} dias).` : ''}
      ${M.sobra && M.sobra.linhas ? ` Há <b>${M.sobra.linhas.toLocaleString('pt-BR')} linhas</b> de bases que falharam, foram substituídas ou de teste que podem ser apagadas.` : ''}</p>
    ${completo ? `<p class="nota" style="margin:6px 0 0">Alerta amarelo a partir de ${M.alerta_pct}% ou 60 dias do limite; vermelho a partir de ${M.critico_pct}% ou 20 dias. No limite, o Supabase deixa o banco só para leitura: robôs param e ninguém envia base nem NF. Maiores tabelas: ${(M.maiores || []).map(t => `${esc(t.tabela)} (${MB(t.bytes)})`).join(', ')}.</p>` : ''}
  </section>`;
}
async function avisoMemoria() {
  if (!S.perfil || S.perfil.papel !== 'admin') return;
  if (!S.mem || Date.now() - (S.memEm || 0) > 3600000) { const r = await sb.rpc('uso_banco'); if (r.error) return; S.mem = r.data; S.memEm = Date.now(); }
  const nv = memNivel(S.mem); const m = $('#main'); if (!m || nv === 'ok' || S.view === 'torre' || $('#mem-aviso')) return;
  const d = S.mem.dias_ate_limite_db; m.insertAdjacentHTML('afterbegin', `<div id="mem-aviso" class="msg ${nv === 'critico' ? 'erro' : 'alerta'}" style="margin-bottom:14px">Memória do banco: <b>${Math.round(100 * S.mem.db_bytes / S.mem.db_limite)}%</b> usada${d != null ? `, limite em cerca de ${d} dias` : ''}. <a href="#torre">Ver na Torre de controle</a></div>`);
}
// ---------- Torre de controle: visual (painel, linha do tempo de 24 h, cartões e desligados) ----------
const COR_ST = { ok: 'var(--eco)', rodando: 'var(--off2)', falha: 'var(--brand)', atrasado: 'var(--alert)', interrompido: 'var(--alert)', aguardando: 'var(--muted)', pausado: 'var(--off)', concluido: 'var(--eco)' };
const COR_EXEC = ['var(--eco)', 'var(--brand)', 'var(--alert)', 'var(--off2)'];
const ICO_ROBO = j => /^uso-banco/.test(j) ? '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
  : /^anonimizar/.test(j) ? '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'
  : /base/.test(j) ? '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>'
  : /locais/.test(j) ? '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
  : '<path d="M20 12a8 8 0 01-14.3 4.9M4 12A8 8 0 0118.3 7.1"/><path d="M18 3v4.5h-4.5M6 21v-4.5h4.5"/>';
const icoRobo = (j, cor) => `<span class="tr-ico" style="color:${cor}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO_ROBO(j)}</svg></span>`;
const hhmm = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function anelTorre(ok, total, cor) {
  const r = 52, c = 2 * Math.PI * r, f = total ? ok / total : 1;
  return `<svg viewBox="0 0 130 130" width="130" height="130" role="img" aria-label="${ok} de ${total} robôs ativos funcionando">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--rule)" stroke-width="12"/>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="${cor}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/>
    <text x="65" y="64" text-anchor="middle" font-size="30" font-weight="700" fill="var(--ink)">${ok}/${total}</text>
    <text x="65" y="86" text-anchor="middle" font-size="12" fill="var(--muted)">robôs ok</text></svg>`;
}
// linha do tempo: 24 h para trás + 6 h para frente, uma faixa por robô ativo
function linhaTempoTorre(lista, agora) {
  const W0 = agora - 24 * 3600e3, W1 = agora + 6 * 3600e3, sp = W1 - W0, x = t => Math.max(0, Math.min(100, (t - W0) / sp * 100));
  const marcas = []; const h = new Date(W0); h.setMinutes(0, 0, 0); h.setHours(h.getHours() + 1);
  for (; +h < W1; h.setHours(h.getHours() + 1)) if (h.getHours() % 3 === 0) marcas.push(+h);
  const faixa = ({ r, s }) => {
    const L = r.linha24 || []; let ex = '';
    if (L.length > 150) { // robô de minuto em minuto: vira uma faixa contínua
      ex = `<span class="tr-band" style="left:${x(L[0][0] * 1000)}%;width:${x(L[L.length - 1][0] * 1000) - x(L[0][0] * 1000)}%" title="${fmtN(L.length)} execuções nas últimas 24 h"></span>`
        + L.filter(e => e[1] !== 0 && e[2] !== 0).map(e => `<span class="tr-ex" style="left:${x(e[0] * 1000)}%;background:${COR_EXEC[e[2]]}"></span>`).join('');
    } else ex = L.map(e => { const t = e[0] * 1000, w = Math.max(.35, e[1] * 1000 / sp * 100);
      return `<span class="tr-ex" style="left:${x(t)}%;width:${w}%;background:${COR_EXEC[e[2]]}" title="${esc(fmtDH(new Date(t).toISOString()) + ' · ' + ['ok', 'falhou', 'interrompida', 'rodando'][e[2]] + ' · ' + durTxt(e[1]))}"></span>`; }).join('');
    // próximas execuções (contorno)
    let fut = ''; if (r.active) { const P = []; let d = new Date(agora); for (let i = 0; i < 40; i++) { d = proximaCron(r.schedule, d); if (!d || +d > W1) break; P.push(+d); }
      fut = P.length >= 40 ? `<span class="tr-band fut" style="left:${x(agora)}%;width:${100 - x(agora)}%" title="roda a cada minuto"></span>` : P.map(t => `<span class="tr-fut" style="left:${x(t)}%" title="${esc('previsto ' + fmtDH(new Date(t).toISOString()))}"></span>`).join(''); }
    return `<div class="tr-lane"><div class="tr-lane-nome"><i class="tr-dot ${s[0]}" style="background:${s[2]}"></i><span title="${esc(r.titulo)}">${esc(r.titulo.replace(/^Umov · /, ''))}</span></div>
      <div class="tr-lane-trilho">${marcas.map(t => `<span class="tr-grade" style="left:${x(t)}%"></span>`).join('')}${ex}${fut}</div></div>`;
  };
  return `<section class="bloco tr-linha"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Últimas 24 horas</h2>
      <div class="tr-leg"><span><i style="background:var(--eco)"></i>ok</span><span><i style="background:var(--brand)"></i>falhou</span><span><i style="background:var(--alert)"></i>interrompida</span><span><i class="vazado"></i>próximas</span></div></div>
    <div class="tr-lanes">${lista.map(faixa).join('')}
      <div class="tr-lane tr-eixo"><div class="tr-lane-nome"></div><div class="tr-lane-trilho">${marcas.map(t => `<span class="tr-hora" style="left:${x(t)}%">${hhmm(t).slice(0, 2)}h</span>`).join('')}<span class="tr-agora-txt" style="left:${x(agora)}%">agora</span></div></div>
      <span class="tr-agora" style="left:calc(var(--tr-nome) + (100% - var(--tr-nome)) * ${(x(agora) / 100).toFixed(4)})"></span></div></section>`;
}
function cartaoRobo({ r, s }, agora) {
  const u = r.ultima || {}, prox = r.active ? proximaCron(r.schedule) : null, aberto = S.abertoRobo[r.jobid];
  const ini = u.inicio ? +new Date(u.inicio) : null, frac = ini && prox ? Math.max(0, Math.min(1, (agora - ini) / (+prox - ini))) : 0;
  const H = (r.historico || []).slice().reverse(), dmax = Math.max(1, ...H.map(h => h.fim ? (new Date(h.fim) - new Date(h.inicio)) / 1000 : 0));
  const barras = H.map(h => { const d = h.fim ? (new Date(h.fim) - new Date(h.inicio)) / 1000 : (agora - new Date(h.inicio)) / 1000; const it = h.status === 'failed' && RX_INTERROMPIDO.test(h.msg || '');
    return `<span style="height:${Math.max(8, Math.min(100, d / dmax * 100)).toFixed(0)}%;background:${h.status === 'succeeded' ? 'var(--eco)' : it ? 'var(--alert)' : h.status === 'failed' ? 'var(--brand)' : 'var(--off2)'}" title="${esc(fmtDH(h.inicio) + ' · ' + durTxt(d) + (h.status === 'failed' && h.msg ? ' · ' + h.msg : ''))}"></span>`; }).join('');
  return `<article class="tr-card${aberto ? ' aberto' : ''}" style="--st:${s[2]}">
    <header>${icoRobo(r.jobname, s[2])}<div style="flex:1;min-width:0"><h3>${esc(r.titulo)}</h3><span class="tr-st"><i class="tr-dot ${s[0]}" style="background:${s[2]}"></i>${s[1]}</span></div></header>
    <p class="tr-desc">${esc(r.descricao || '')}</p><p class="tr-freq">⏱ ${esc(r.frequencia || r.schedule)}</p>
    <div class="tr-prox"><div class="linha" style="justify-content:space-between;gap:8px"><small>Próxima execução</small><b>${s[0] === 'rodando' ? 'rodando há ' + durTxt((agora - ini) / 1000) : emTxt(prox)}</b></div>
      <div class="tr-barra"><span style="width:${(frac * 100).toFixed(1)}%"></span></div>
      <div class="tr-meta"><span>última ${ini ? hhmm(ini) : '—'}</span><span>${prox ? 'próxima ' + (prox - agora > 864e5 ? fmtDH(prox.toISOString()) : hhmm(prox)) : ''}</span></div></div>
    ${H.length ? `<div class="tr-mini" aria-label="Duração das últimas execuções">${barras}</div><div class="tr-meta" style="margin-top:-6px"><span>duração das últimas ${H.length} execuções</span><span>média ${durTxt(r.duracao_media_s)}</span></div>` : `<div class="tr-mini vazio">ainda não rodou</div>`}
    <div class="tr-nums"><div><b class="eco">${fmtN(r.ok_24h)}</b><small>ok em 24 h</small></div><div><b style="${r.falhas_24h ? 'color:var(--brand)' : ''}">${r.falhas_24h}</b><small>falha(s)</small></div><div><b>${haTxt(r.ultimo_ok)}</b><small>último sucesso</small></div></div>
    ${u.status === 'failed' ? (RX_INTERROMPIDO.test(u.msg || '') ? `<div class="msg alerta" style="margin:0">Última execução interrompida manualmente (para aplicar uma mudança). Não é falha; a próxima retoma de onde parou.</div>` : `<div class="msg erro" style="margin:0"><b>Erro:</b> ${esc(u.msg || 'sem mensagem')}</div>`) : ''}
    <footer><button class="btn sec peq" data-trh="${r.jobid}">${aberto ? 'Fechar histórico' : 'Histórico'}</button><button class="btn sec peq" data-tra="${r.jobid}" data-on="0">Pausar</button></footer>
    ${aberto ? `<div class="tabela"><table><thead><tr><th>Início</th><th class="n">Duração</th><th>Resultado</th><th>Mensagem</th></tr></thead><tbody>${(r.historico || []).map(h => { const it = h.status === 'failed' && RX_INTERROMPIDO.test(h.msg || '');
      return `<tr><td style="white-space:nowrap">${fmtDH(h.inicio)}</td><td class="n">${h.fim ? durTxt((new Date(h.fim) - new Date(h.inicio)) / 1000) : '—'}</td><td><span class="pill ${it ? 'alerta' : h.status === 'failed' ? 'marca' : h.status === 'succeeded' ? '' : 'alerta'}">${h.status === 'succeeded' ? 'OK' : it ? 'Interrompido' : h.status === 'failed' ? 'Falhou' : 'Rodando'}</span></td><td style="font-size:13px;max-width:460px;word-break:break-word">${esc(h.msg || '')}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
  </article>`;
}
function desenharTorre() {
  const T = S.torre, box = $('#torre'); if (!box) return; const R = T.robos || [], agora = Date.now();
  const st = R.map(r => ({ r, s: statusRobo(r) })); const cont = k => st.filter(x => x.s[0] === k).length;
  const ativos = st.filter(x => x.r.active), off = st.filter(x => !x.r.active);
  const prob = cont('falha') + cont('atrasado'); S.abertoRobo = S.abertoRobo || {};
  const okA = ativos.filter(x => ['ok', 'rodando', 'aguardando', 'interrompido'].includes(x.s[0])).length;
  const corG = cont('falha') ? 'var(--brand)' : cont('atrasado') ? 'var(--alert)' : 'var(--eco)';
  const fila = ativos.map(x => ({ x, p: proximaCron(x.r.schedule) })).filter(o => o.p && !/\* \* \* \* \*/.test(o.x.r.schedule)).sort((a, b) => a.p - b.p)[0];
  const U = T.umov || {}; const ul = (U.logs || [])[0];
  const chip = (k, n, t) => `<span class="tr-chip${n ? '' : ' zero'}"><i style="background:${COR_ST[k]}"></i><b>${n}</b> ${t}</span>`;
  box.innerHTML = `
  <section class="bloco tr-hero" style="--st:${corG}">
    ${anelTorre(okA, ativos.length, corG)}
    <div class="tr-hero-txt"><small class="eyebrow" style="color:var(--muted)">Situação dos robôs</small>
      <h2>${prob ? (prob > 1 ? `${prob} robôs precisam de atenção` : '1 robô precisa de atenção') : 'Tudo funcionando'}</h2>
      <p class="sub" style="margin:2px 0 10px">Verificado às ${hhmm(T.agora)} · a tela se atualiza sozinha a cada minuto${fila ? ` · próximo a rodar: <b>${esc(fila.x.r.titulo.replace(/^Umov · /, ''))}</b> ${emTxt(fila.p)}` : ''}</p>
      <div class="tr-chips">${chip('ok', cont('ok'), 'funcionando')}${chip('rodando', cont('rodando'), 'rodando agora')}${chip('falha', cont('falha'), 'com falha')}${chip('atrasado', cont('atrasado'), 'atrasado(s)')}${chip('pausado', off.length, 'desligado(s)')}</div></div>
    <div class="tr-hero-umov"><small>Robô Leitor do Umov · última leitura</small><b>${ul ? haTxt(ul.fim) : '—'}</b><span>${fmtN(U.total)} atendimentos lidos · fila ${fmtN(U.fila)}</span></div>
  </section>
  ${linhaTempoTorre(ativos, agora)}
  <div class="tr-grid">${ativos.map(o => cartaoRobo(o, agora)).join('')}</div>
  ${off.length ? `<details class="bloco tr-off"${S.trOffAberto ? ' open' : ''}><summary><h2 style="display:inline;margin:0">Robôs desligados</h2> <span class="nota">${off.length} · cargas que já terminaram ou robôs pausados</span></summary>
    <div class="tr-off-lista">${off.map(({ r, s }) => `<div class="tr-off-item">${icoRobo(r.jobname, s[2])}<div style="flex:1;min-width:0"><b>${esc(r.titulo)}</b><div class="nota">${s[1]} · última execução ${r.ultima ? haTxt(r.ultima.inicio) : '—'}</div></div><button class="btn sec peq" data-tra="${r.jobid}" data-on="1">Ativar</button></div>`).join('')}</div></details>` : ''}
  <div id="tr-mem">${S.mem ? memoriaHtml(S.mem, true) : ''}</div>
  <section class="bloco"><h2>Robô Leitor do Umov · o que já trouxe</h2>
    <div class="kpis" style="margin-top:8px">
      <div class="kpi neutro"><small>Atendimentos lidos</small><b>${fmtN(U.total)}</b><span>${fmtN(U.dias)} dia(s) com detalhe</span></div>
      <div class="kpi ${U.fila > 3000 ? 'alerta' : 'neutro'}"><small>Fila para detalhar</small><b>${fmtN(U.fila)}</b><span>${U.fila ? 'vão entrar nas próximas execuções' : 'em dia'}</span></div>
      <div class="kpi ${U.sem_parceiro ? 'alerta' : 'neutro'}"><small>Sem parceiro</small><b>${fmtN(U.sem_parceiro)}</b><span>ponto fora da carteira e agente sem vínculo</span></div>
      <div class="kpi neutro"><small>Última leitura</small><b>${ul ? haTxt(ul.fim) : '—'}</b><span>${ul ? `${fmtN(ul.chamadas)} consultas ao Umov` : ''}</span></div></div>
    ${(U.logs || []).length ? (() => { const L = U.logs.slice().reverse(), mx = Math.max(1, ...L.map(l => +l.listados || 0));
      return `<div class="tr-umov-graf">${L.map(l => `<div title="${esc(fmtDH(l.inicio) + ' · ' + fmtN(l.listados) + ' listados · ' + fmtN(l.detalhes) + ' detalhados' + (l.erros ? ' · erro: ' + l.erros : ''))}"><span class="lst" style="height:${(100 * (+l.listados || 0) / mx).toFixed(0)}%"><span class="det" style="height:${l.listados ? (100 * (+l.detalhes || 0) / l.listados).toFixed(0) : 0}%;background:${l.erros ? 'var(--brand)' : 'var(--eco)'}"></span></span><small>${hhmm(l.inicio)}</small></div>`).join('')}</div>
      <div class="tr-leg" style="margin-top:6px"><span><i style="background:var(--rule)"></i>atendimentos listados na leitura</span><span><i style="background:var(--eco)"></i>detalhados (novos ou alterados)</span><span><i style="background:var(--brand)"></i>leitura com erro</span></div>
      <details style="margin-top:10px"><summary class="nota" style="cursor:pointer">Ver tabela das leituras</summary><div class="tabela" style="margin-top:8px"><table><thead><tr><th>Execução</th><th>Datas lidas</th><th class="n">Duração</th><th class="n">Consultas</th><th class="n">Listados</th><th class="n">Detalhados</th><th>Erros</th></tr></thead><tbody>
      ${U.logs.map(l => `<tr><td style="white-space:nowrap">${fmtDH(l.inicio)}</td><td>${esc(l.datas || '')}</td><td class="n">${l.fim ? durTxt((new Date(l.fim) - new Date(l.inicio)) / 1000) : '—'}</td><td class="n">${fmtN(l.chamadas)}</td><td class="n">${fmtN(l.listados)}</td><td class="n">${fmtN(l.detalhes)}</td><td style="font-size:13px">${l.erros ? `<span style="color:var(--brand)">${esc(l.erros)}</span>` : '<span class="eco">sem erros</span>'}</td></tr>`).join('')}</tbody></table></div></details>`; })() : ''}
  </section>`;
  box.querySelectorAll('[data-trh]').forEach(b => b.onclick = () => { S.abertoRobo[b.dataset.trh] = !S.abertoRobo[b.dataset.trh]; desenharTorre(); });
  const dt = box.querySelector('.tr-off'); if (dt) dt.ontoggle = () => { S.trOffAberto = dt.open; };
  box.querySelectorAll('[data-tra]').forEach(b => b.onclick = async () => { const on = b.dataset.on === '1';
    if (!on && !confirm('Pausar este robô? Ele para de rodar até ser ativado de novo.')) return; b.disabled = true;
    try { await q(sb.rpc('robo_ativar', { p_jobid: +b.dataset.tra, p_ativo: on })); vTorre(); atualizarBadges(true); } catch (e) { b.disabled = false; alertaTopo(e.message); } });
}

// Previsto (carteira do portal) x Realizado (Umov)
function prevRealOp(el) {
  const O = S.oper, P = O.PR || {}, box = el.querySelector('#op-pr'); if (!box) return;
  if (P.erro) { box.innerHTML = `<div class="msg alerta">${esc(P.erro)}</div>`; return; }
  const t = P.tot || {}; const n1 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const pc = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const hoje = P.hoje; const dias = P.dia || []; const ateOntem = dias.filter(d => d.d < hoje);
  const pO = ateOntem.reduce((a, d) => a + d.prev, 0), rO = ateOntem.reduce((a, d) => a + d.real, 0);
  const temHoje = dias.some(d => d.d === hoje);
  O.prSort = O.prSort || ['prev', -1]; O.prLista = O.prLista || 'sem'; O.prBusca = O.prBusca || '';
  box.innerHTML = `<div class="kpis" style="margin-top:6px">
      <div class="kpi neutro"><small>Previsto · carteira</small><b>${n1(t.prev)}</b><span>${fmtN(t.pontos)} pontos ativos</span></div>
      <div class="kpi eco"><small>Realizado · Umov</small><b>${fmtN(t.real)}</b><span>${fmtN(t.oc)} com ocorrência · ${fmtN(t.ab)} sem baixa</span></div>
      <div class="kpi ${t.prev && t.real / t.prev < .9 ? 'alerta' : 'eco'}"><small>Atingido</small><b>${pc(t.real, t.prev)}</b><span>${temHoje && ateOntem.length ? `até ontem: ${pc(rO, pO)} (hoje em andamento)` : temHoje ? 'hoje ainda em andamento' : 'do previsto'}</span></div>
      <div class="kpi ${t.sem_atend ? 'alerta' : 'neutro'}"><small>Pontos sem atendimento</small><b>${fmtN(t.sem_atend)}</b><span>previsto ≥ 1 e nada no Umov</span></div>
      <div class="kpi ${t.fora ? 'alerta' : 'neutro'}"><small>Fora da carteira</small><b>${fmtN(t.fora)}</b><span>atendimentos em ${fmtN(t.fora_pontos)} ponto(s) não cadastrados</span></div></div>
    ${dias.length > 1 ? '<div id="op-prg" style="position:relative;margin-top:8px"></div>' : ''}
    <h3 style="margin:18px 0 6px">Por parceiro</h3><div id="op-prp"></div>
    <div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:18px"><h3 style="margin:0">Pontos</h3>
      <div class="linha" style="gap:8px"><div style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${[['sem', 'Sem atendimento'], ['abaixo', 'Abaixo do previsto'], ['acima', 'Acima do previsto'], ['fora', 'Fora da carteira']].map(([k, n]) => `<button type="button" data-prl="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${O.prLista === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
      <input type="search" id="op-prb" placeholder="Buscar ponto, cliente, cidade" value="${esc(O.prBusca)}" style="min-height:40px;min-width:220px"></div></div><div id="op-prl" style="margin-top:10px"></div>`;
  if (dias.length > 1) graficoPR(box.querySelector('#op-prg'), dias, hoje);
  box.querySelectorAll('[data-prl]').forEach(b => b.onclick = () => { O.prLista = b.dataset.prl; prevRealOp(el); });
  box.querySelector('#op-prb').oninput = e => { O.prBusca = e.target.value; listaPR(el); };
  parcPR(el); listaPR(el);
}
function parcPR(el) {
  const O = S.oper, P = O.PR || {}; const [sk, sd] = O.prSort; const n1 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const L = (P.parceiros || []).map(p => ({ ...p, nome: p.nome || '—', pr: p.prev ? p.real / p.prev : null, dif: p.real - p.prev }))
    .sort((a, b) => (typeof a[sk] === 'string' ? a[sk].localeCompare(b[sk]) : (a[sk] ?? -1e9) - (b[sk] ?? -1e9)) * sd);
  const col = [['nome', 'Parceiro'], ['pontos', 'Pontos', 1], ['prev', 'Previsto', 1], ['real', 'Realizado', 1], ['pr', '% atingido', 1], ['dif', 'Diferença', 1], ['oc', 'Ocorrências', 1], ['sem_atend', 'Pontos sem atend.', 1], ['fora', 'Fora da carteira', 1]];
  const box = el.querySelector('#op-prp'); const sum = k => L.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  box.innerHTML = L.length ? `<div class="tabela" style="max-height:620px;overflow:auto"><table><thead><tr>${col.map(([k, n, num]) => `<th class="${num ? 'n' : ''}" data-prs="${k}" style="cursor:pointer;white-space:nowrap">${n}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${L.map(p => `<tr data-prp="${p.id || ''}" style="cursor:pointer"><td>${esc(p.nome)}</td><td class="n">${fmtN(p.pontos)}</td><td class="n">${n1(p.prev)}</td><td class="n eco">${fmtN(p.real)}</td>
      <td class="n"><b style="color:${p.pr == null ? 'inherit' : p.pr < .9 ? 'var(--alert)' : 'var(--eco)'}">${p.pr == null ? '—' : Math.round(p.pr * 100) + '%'}</b></td>
      <td class="n" style="color:${p.dif < -0.5 ? 'var(--alert)' : 'inherit'}">${p.dif > 0 ? '+' : ''}${n1(p.dif)}</td><td class="n">${fmtN(p.oc)}</td>
      <td class="n">${p.sem_atend ? `<span class="pill alerta">${fmtN(p.sem_atend)}</span>` : '0'}</td><td class="n">${p.fora ? fmtN(p.fora) : '0'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total (${L.length})</b></td><td class="n"><b>${fmtN(sum('pontos'))}</b></td><td class="n"><b>${n1(sum('prev'))}</b></td><td class="n"><b>${fmtN(sum('real'))}</b></td><td class="n"><b>${sum('prev') ? Math.round(100 * sum('real') / sum('prev')) + '%' : '—'}</b></td><td class="n"><b>${n1(sum('real') - sum('prev'))}</b></td><td class="n"><b>${fmtN(sum('oc'))}</b></td><td class="n"><b>${fmtN(sum('sem_atend'))}</b></td><td class="n"><b>${fmtN(sum('fora'))}</b></td></tr></tfoot></table></div>` : '<p class="nota">Nenhum ponto na carteira para o filtro.</p>';
  box.querySelectorAll('[data-prs]').forEach(th => th.onclick = () => { const k = th.dataset.prs; O.prSort = [k, O.prSort[0] === k ? -O.prSort[1] : (k === 'nome' ? 1 : -1)]; parcPR(el); });
  box.querySelectorAll('[data-prp]').forEach(tr => tr.onclick = () => { if (!tr.dataset.prp) return; O.parc = tr.dataset.prp; vOperacao(el); });
}
function listaPR(el) {
  const O = S.oper, P = O.PR || {}; const f = norm(O.prBusca || ''); const k = O.prLista; const n1 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const box = el.querySelector('#op-prl'); if (!box) return;
  if (k === 'fora') {
    const L = (P.fora_lista || []).filter(r => !f || norm([r.cod_int, r.local, r.cliente, r.cidade, r.parceiro].join(' ')).includes(f));
    box.innerHTML = L.length ? `<div class="tabela" style="max-height:520px;overflow:auto"><table><thead><tr><th>Ponto</th><th>Cliente</th><th>Cidade</th><th>Parceiro / agente</th><th class="n">Atendimentos</th></tr></thead><tbody>
      ${L.map(r => `<tr><td>${esc(r.cod_int || '—')}<br><span class="nota">${esc(r.local || '')}</span></td><td>${esc(r.cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td><td>${esc(r.parceiro || '—')}</td><td class="n"><b>${fmtN(r.real)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="nota">Atendidos no Umov, mas o ponto não está na carteira do portal: cadastrar o ponto ou conferir se o atendimento é devido.</p>` : '<p class="nota">Nenhum atendimento fora da carteira.</p>';
    return; }
  const sel = { sem: r => r.prev >= 1 && r.real === 0, abaixo: r => r.real > 0 && r.real < Math.floor(r.prev), acima: r => r.real > Math.ceil(r.prev) }[k];
  const L = (P.pontos || []).filter(sel).filter(r => !f || norm([r.cod_int, r.cliente, r.loja, r.cidade, r.uf, r.parceiro].join(' ')).includes(f));
  box.innerHTML = L.length ? `<div class="tabela" style="max-height:520px;overflow:auto"><table><thead><tr><th>Ponto</th><th>Cliente</th><th>Cidade</th><th>Frequência</th><th>Parceiro</th><th class="n">Previsto</th><th class="n">Realizado</th><th class="n">Ocorr.</th><th class="n">Sem baixa</th></tr></thead><tbody>
    ${L.slice(0, 600).map(r => `<tr><td>${esc(r.cod_int)}<br><span class="nota">${esc(r.loja || '')}</span></td><td>${esc(r.cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td><td>${esc(r.frequencia || '—')}</td><td>${esc(r.parceiro || '—')}</td>
      <td class="n">${n1(r.prev)}</td><td class="n"><b>${fmtN(r.real)}</b></td><td class="n">${fmtN(r.oc)}</td><td class="n">${fmtN(r.ab)}</td></tr>`).join('')}</tbody></table></div>
    <p class="nota">${L.length > 600 ? `Mostrando 600 de ${fmtN(L.length)}; use a busca ou o filtro de parceiro.` : `${fmtN(L.length)} ponto(s).`} Quinzenal e mensal aparecem com previsto fracionado no meio do mês (rateio pelos dias úteis).</p>`
    : `<p class="nota">${{ sem: 'Todos os pontos previstos tiveram atendimento.', abaixo: 'Nenhum ponto abaixo do previsto.', acima: 'Nenhum ponto acima do previsto.' }[k]}</p>`;
}
function graficoPR(box, dias, hoje) {
  const W = Math.max(640, box.clientWidth || 900), H = 220, pl = 44, pr = 10, pt = 12, pb = 30; const mx = Math.max(1, ...dias.map(d => Math.max(d.prev, d.real + d.ab)));
  const bw = (W - pl - pr) / dias.length; const y = v => pt + (H - pt - pb) * (1 - v / mx); const ticks = [0, .5, 1].map(t => Math.round(mx * t));
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Previsto x realizado por dia">
    ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule-soft)"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtN(t)}</text>`).join('')}
    ${dias.map((d, i) => { const x = pl + i * bw; const w = bw * .36;
      return `<g data-prd="${i}"><rect x="${x + bw * .12}" y="${y(d.prev)}" width="${w}" height="${y(0) - y(d.prev)}" fill="var(--rule)"/>
        <rect x="${x + bw * .12 + w}" y="${y(d.real)}" width="${w}" height="${y(0) - y(d.real)}" fill="var(--eco)"/>
        ${d.ab ? `<rect x="${x + bw * .12 + w}" y="${y(d.real + d.ab)}" width="${w}" height="${y(d.real) - y(d.real + d.ab)}" fill="var(--brand)" opacity=".75"/>` : ''}
        <rect x="${x}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>
        ${dias.length <= 31 ? `<text x="${x + bw / 2}" y="${H - pb + 14}" text-anchor="middle" font-size="11" fill="var(--muted)" ${d.d === hoje ? 'font-weight="700"' : ''}>${d.d.slice(8, 10)}</text>` : ''}</g>`; }).join('')}
  </svg><div class="linha" style="gap:14px;font-size:13px;color:var(--muted)"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--rule);margin-right:5px"></i>Previsto (carteira)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--eco);margin-right:5px"></i>Realizado (Umov)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--brand);opacity:.75;margin-right:5px"></i>Ainda sem baixa</span></div>
  <div class="prtip" style="position:absolute;display:none;pointer-events:none;background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.12)"></div>`;
  const tip = box.querySelector('.prtip');
  box.querySelectorAll('[data-prd]').forEach(g => { g.onmousemove = ev => { const d = dias[+g.dataset.prd]; const r = box.getBoundingClientRect();
      tip.innerHTML = `<b>${fmtD(d.d)}</b>${d.d === hoje ? ' (hoje, em andamento)' : ''}<br>Previsto: ${(+d.prev).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}<br><span class="eco">Realizado: ${fmtN(d.real)}${d.prev ? ` (${Math.round(100 * d.real / d.prev)}%)` : ''}</span>${d.ab ? `<br><span style="color:var(--brand)">Sem baixa: ${fmtN(d.ab)}</span>` : ''}`;
      tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 220) + 'px'; tip.style.top = (ev.clientY - r.top - 10) + 'px'; };
    g.onmouseleave = () => tip.style.display = 'none'; });
}

// ===== Atendimentos fora do previsto (incluídos no Umov além da carteira) =====
const CANAL_CLS = { 'Painel web do Umov': 'marca', 'App do motorista': '', 'Importação da programação': 'escuro' };
function extrasOp(el) {
  const O = S.oper, box = el.querySelector('#op-ex'); if (!box) return; const X = O.EX;
  if (!X || X.erro) { box.innerHTML = `<div class="msg alerta">${esc(X?.erro || 'Sem dados.')}</div>`; return; }
  O.exF = O.exF || 'rever'; O.exCanal = O.exCanal ?? ''; O.exBusca = O.exBusca || ''; O.exSel = O.exSel || new Set();
  const rever = X.filter(r => !r.rev_situacao), web = X.filter(r => r.canal === 'Painel web do Umov'), nao = X.filter(r => r.rev_situacao === 'nao_autorizado');
  const canais = [...new Set(X.map(r => r.canal))].sort(); const f = norm(O.exBusca);
  const L = X.filter(r => O.exF === 'todos' || (O.exF === 'rever' ? !r.rev_situacao : O.exF === 'web' ? r.canal === 'Painel web do Umov' : r.rev_situacao))
    .filter(r => !O.exCanal || r.canal === O.exCanal)
    .filter(r => !f || norm([r.cod_int, r.local_desc, r.cliente, r.cidade, r.parceiro, r.inserido_por, r.inserido_login, r.motivo].join(' ')).includes(f));
  const motivos = {}; X.forEach(r => { const k = r.motivo.replace(/\s*\(.*$/, ''); motivos[k] = (motivos[k] || 0) + 1; });
  const quem = {}; X.filter(r => r.canal === 'Painel web do Umov').forEach(r => { const k = r.inserido_por || r.inserido_login || '—'; quem[k] = (quem[k] || 0) + 1; });
  const btn = (k, n) => `<button type="button" data-exf="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${O.exF === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`;
  box.innerHTML = `<div class="kpis" style="margin-top:6px">
      <div class="kpi ${X.length ? 'alerta' : 'neutro'}"><small>Fora do previsto</small><b>${fmtN(X.length)}</b><span>no período</span></div>
      <div class="kpi ${rever.length ? '' : 'neutro'}"><small>A revisar</small><b style="${rever.length ? 'color:var(--brand)' : ''}">${fmtN(rever.length)}</b><span>sem OK ou recusa</span></div>
      <div class="kpi ${web.length ? 'alerta' : 'neutro'}"><small>Incluídos à mão (painel web)</small><b>${fmtN(web.length)}</b><span>${Object.keys(quem).length} pessoa(s)</span></div>
      <div class="kpi neutro"><small>Não autorizados</small><b>${fmtN(nao.length)}</b><span>não pagar ao parceiro</span></div></div>
    ${X.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin:8px 0 14px">
      <div><h3 style="margin:0 0 6px">Por motivo</h3>${Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="linha" style="justify-content:space-between;font-size:14px;border-bottom:1px solid var(--rule-soft);padding:4px 0"><span>${esc(k)}</span><b>${fmtN(n)}</b></div>`).join('')}</div>
      <div><h3 style="margin:0 0 6px">Quem incluiu pelo painel web</h3>${Object.keys(quem).length ? Object.entries(quem).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="linha" style="justify-content:space-between;font-size:14px;border-bottom:1px solid var(--rule-soft);padding:4px 0"><span>${esc(k)}</span><b>${fmtN(n)}</b></div>`).join('') : '<p class="nota">Nenhuma inclusão manual no período.</p>'}</div></div>` : ''}
    <div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${btn('rever', `A revisar (${rever.length})`)}${btn('web', 'Painel web')}${btn('revisados', 'Revisados')}${btn('todos', 'Todos')}</div>
      <div class="linha" style="gap:8px"><select id="ex-canal" style="min-height:40px"><option value="">Todos os canais</option>${canais.map(k => `<option ${O.exCanal === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
      <input type="search" id="ex-busca" placeholder="Buscar ponto, parceiro, quem incluiu" value="${esc(O.exBusca)}" style="min-height:40px;min-width:240px"></div></div>
    <div class="linha" style="gap:8px;margin:10px 0" id="ex-acoes"><span class="nota" id="ex-nsel">${O.exSel.size ? O.exSel.size + ' selecionado(s)' : 'Selecione para marcar em lote'}</span>
      <button class="btn sec peq" data-exrev="ok" ${O.exSel.size ? '' : 'disabled'}>Marcar OK</button><button class="btn sec peq" data-exrev="nao_autorizado" ${O.exSel.size ? '' : 'disabled'}>Não autorizado</button><button class="btn sec peq" data-exrev="" ${O.exSel.size ? '' : 'disabled'}>Desfazer</button></div>
    ${L.length ? `<div class="tabela" style="max-height:620px;overflow:auto"><table><thead><tr><th><input type="checkbox" id="ex-all" aria-label="Selecionar todos"></th><th>Data</th><th>Ponto</th><th>Parceiro</th><th>Por que está fora</th><th>Quem incluiu</th><th>Situação no Umov</th><th>Revisão</th></tr></thead><tbody>
      ${L.slice(0, 500).map(r => `<tr><td><input type="checkbox" data-exid="${r.id}" ${O.exSel.has(String(r.id)) ? 'checked' : ''}></td><td style="white-space:nowrap">${fmtD(r.data)}</td>
        <td>${esc(r.cod_int || '—')}<br><span class="nota">${esc(r.local_desc || '')}${r.cidade ? ' · ' + esc(r.cidade) : ''}</span></td><td>${esc(r.parceiro)}<br><span class="nota">${esc(r.agente || '')}</span></td>
        <td><span class="pill alerta">${esc(r.motivo)}</span>${r.frequencia ? `<br><span class="nota">frequência: ${esc(r.frequencia)}</span>` : ''}</td>
        <td><b>${esc(r.inserido_por || '—')}</b>${r.inserido_login ? ` <span class="nota">(${esc(r.inserido_login)})</span>` : ''}<br><span class="pill ${CANAL_CLS[r.canal] ?? ''}">${esc(r.canal)}</span>${r.inserido_em ? ` <span class="nota">${fmtDH(r.inserido_em)}</span>` : ''}</td>
        <td>${esc(r.situacao || '—')}${r.status_gsm ? `<br><span class="nota">${esc(r.status_gsm)}</span>` : ''}</td>
        <td>${r.rev_situacao ? `<span class="pill ${r.rev_situacao === 'ok' ? '' : 'marca'}">${r.rev_situacao === 'ok' ? 'OK' : 'Não autorizado'}</span><br><span class="nota">${esc(r.rev_por || '')} ${fmtDH(r.rev_em)}${r.rev_obs ? ' · ' + esc(r.rev_obs) : ''}</span>` : '<span class="nota">a revisar</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="nota">${L.length > 500 ? `Mostrando 500 de ${fmtN(L.length)}; use a busca ou os filtros.` : `${fmtN(L.length)} atendimento(s).`} Quem incluiu e o canal aparecem conforme o robô relê cada atendimento no Umov.</p>`
      : `<p class="nota">${O.exF === 'rever' ? 'Nada a revisar no período.' : 'Nenhum atendimento nesse filtro.'}</p>`}`;
  box.querySelectorAll('[data-exf]').forEach(b => b.onclick = () => { O.exF = b.dataset.exf; O.exSel.clear(); extrasOp(el); });
  box.querySelector('#ex-canal').onchange = e => { O.exCanal = e.target.value; extrasOp(el); };
  const bx = box.querySelector('#ex-busca'); bx.oninput = e => { O.exBusca = e.target.value; extrasOp(el); const n = el.querySelector('#ex-busca'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  const marcar = () => { const n = O.exSel.size; box.querySelector('#ex-nsel').textContent = n ? n + ' selecionado(s)' : 'Selecione para marcar em lote'; box.querySelectorAll('[data-exrev]').forEach(b => b.disabled = !n); };
  box.querySelectorAll('[data-exid]').forEach(cb => cb.onchange = () => { cb.checked ? O.exSel.add(cb.dataset.exid) : O.exSel.delete(cb.dataset.exid); marcar(); });
  const all = box.querySelector('#ex-all'); if (all) all.onchange = () => { box.querySelectorAll('[data-exid]').forEach(cb => { cb.checked = all.checked; all.checked ? O.exSel.add(cb.dataset.exid) : O.exSel.delete(cb.dataset.exid); }); marcar(); };
  box.querySelectorAll('[data-exrev]').forEach(b => b.onclick = async () => { const sit = b.dataset.exrev || null; let obs = null;
    if (sit === 'nao_autorizado') { obs = prompt('Motivo (opcional): por que não foi autorizado?') ; if (obs === null) return; }
    b.disabled = true;
    try { await q(sb.rpc('revisar_umov_extra', { p_ids: [...O.exSel].map(Number), p_situacao: sit, p_obs: obs }));
      O.EX = await todas(() => sb.rpc('umov_extras', { p_de: O.de, p_ate: O.ate, p_parceiro: O.parc || null })); O.exSel.clear(); extrasOp(el); atualizarBadges(true); }
    catch (e) { b.disabled = false; alertaTopo(e.message); } });
}
// Aviso na conferência do parceiro: atendimentos fora do previsto no mês
async function avisoExtrasParceiro(m, c, p) {
  try {
    const fim = new Date(+c.mes.slice(0, 4), +c.mes.slice(5, 7), 0); const ate = isoDia(fim);
    const X = await todas(() => sb.rpc('umov_extras', { p_de: c.mes.slice(0, 10), p_ate: ate, p_parceiro: p.id })); if (!X.length) return;
    const web = X.filter(r => r.canal === 'Painel web do Umov'); const nao = X.filter(r => r.rev_situacao === 'nao_autorizado'); const rev = X.filter(r => !r.rev_situacao);
    const quem = [...new Set(web.map(r => r.inserido_por || r.inserido_login).filter(Boolean))];
    const d = document.createElement('div'); d.className = 'msg alerta'; d.style.marginBottom = '14px';
    d.innerHTML = `<b>${fmtN(X.length)} atendimento(s) fora do previsto no Umov em ${nomeMes(c.mes)}.</b> ${web.length ? `${fmtN(web.length)} incluído(s) à mão pelo painel web${quem.length ? ' por ' + quem.slice(0, 4).map(esc).join(', ') + (quem.length > 4 ? '…' : '') : ''}. ` : ''}${nao.length ? `<b>${fmtN(nao.length)} marcado(s) como não autorizado.</b> ` : ''}${rev.length ? `${fmtN(rev.length)} ainda a revisar. ` : ''}<a href="#" id="av-ex">Ver na Operação ao vivo</a>`;
    const topo = m.querySelector('.topo'); if (!topo || !document.body.contains(m)) return; topo.after(d);
    d.querySelector('#av-ex').onclick = ev => { ev.preventDefault(); S.oper = { ...(S.oper || {}), per: 'custom', de: c.mes.slice(0, 10), ate, parc: p.id, cli: '', lista: 'abertos', sort: ['aberto', -1], busca: '', bcli: '', exF: 'todos' }; location.hash = '#operacao'; };
  } catch (e) { /* aviso é só complemento */ }
}


// ================= Torre de controle · modo TV (tela cheia para monitor/TV) =================
const TV_META = 0.95;
function pararTv() { clearInterval(S.tvRelogio); clearInterval(S.tvDados); clearInterval(S.tvPagina); clearTimeout(S.tvTroca); clearInterval(S.tvBarraT); clearTimeout(S.tvRolar); S.tvRelogio = S.tvDados = S.tvPagina = S.tvTroca = null; }
// carrossel geral: operação (TV_GERAL_OP_SEG) → todas as lâminas da diretoria → operação…
const TV_GERAL_OP_SEG = 90;
function tvGeralSelo(fase) {
  if (!S.tvGeral) return; const m = document.querySelector('.tv-marca span'); if (m) m.innerHTML = `Carrossel geral · <b style="color:var(--tv-marca,#E8435F)">${fase === 'op' ? 'operação' : 'diretoria'}</b> → ${fase === 'op' ? 'diretoria' : 'operação'}`;
  const top = document.querySelector('.tv-top'); if (top && !$('#tv-gbar')) top.insertAdjacentHTML('beforeend', '<div id="tv-gbar" style="position:absolute;left:0;bottom:0;height:3px;background:var(--tv-marca,#E8435F);width:0;transition:width 1s linear"></div>');
  if (top) top.style.position = 'relative';
}
function tvGeralOp() {
  if (!S.tvGeral) return; tvGeralSelo('op'); clearTimeout(S.tvTroca); clearInterval(S.tvBarraT); clearTimeout(S.tvRolar); const t0 = Date.now();
  S.tvBarraT = setInterval(() => { const b = $('#tv-gbar'); if (b) b.style.width = Math.min(100, (Date.now() - t0) / (TV_GERAL_OP_SEG * 10)) + '%'; }, 1000);
  S.tvTroca = setTimeout(() => { if (S.tvGeral && S.view === 'tv') { S.tvSl = 0; vTvDir(); } }, TV_GERAL_OP_SEG * 1000);
}
function tvSair() { pararTv(); S.tvGeral = false; if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (S.perfil.papel === 'admin') location.hash = '#torre'; else location.reload(); }
async function vTv() {
  pararTv();
  app.innerHTML = `<div class="tv" id="tv">
    <header class="tv-top">
      <div class="tv-marca"><img src="logo_escuro.png" alt="GSM Log"><div><b>Torre de controle</b><span>Operação de última milha · malote</span></div></div>
      <div class="tv-aderencia" id="tv-ad">carregando…</div>
      <div class="tv-relogio"><b id="tv-hora">--:--:--</b><span id="tv-data"></span></div>
      <div class="tv-acoes"><span class="tv-robo" id="tv-robo" title="Robôs"></span><button type="button" id="tv-atu" title="Atualizar agora">↻</button><button type="button" id="tv-full" title="Tela cheia">⛶</button><button type="button" id="tv-sair" title="Sair do modo TV">✕</button></div>
    </header>
    <section class="tv-kpis" id="tv-kpis"></section>
    <section class="tv-meio"><div class="tv-card"><div class="tv-tit"><b>Previsto × realizado · dia a dia</b><span id="tv-g1s"></span></div><div id="tv-g1" class="tv-graf"></div></div>
      <div class="tv-card"><div class="tv-tit"><b>Baixas por hora · hoje × ontem</b><span id="tv-g2s"></span></div><div id="tv-g2" class="tv-graf"></div></div></section>
    <section class="tv-card tv-tab"><div class="tv-tit"><b>Parceiros · maior desvio primeiro</b><span id="tv-tabs"></span></div><div id="tv-tabela"></div></section>
    <footer class="tv-rodape" id="tv-rodape"></footer>
  </div>`;
  const relogio = () => { const d = new Date(); const h = $('#tv-hora'); if (!h) return pararTv();
    h.textContent = d.toLocaleTimeString('pt-BR'); $('#tv-data').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); };
  relogio(); S.tvRelogio = setInterval(relogio, 1000);
  $('#tv-sair').onclick = tvSair; $('#tv-atu').onclick = () => tvCarregar();
  $('#tv-full').onclick = () => { const t = $('#tv'); document.fullscreenElement ? document.exitFullscreen() : (t.requestFullscreen && t.requestFullscreen().catch(() => {})); };
  document.onkeydown = ev => { if (S.view === 'tv' && ev.key === 'Escape' && !document.fullscreenElement) tvSair(); };
  let rz; window.onresize = () => { if (S.view !== 'tv' && !$('#tv')) return; clearTimeout(rz); rz = setTimeout(() => { if (S.tvD && $('#tv')) tvDesenhar(); }, 250); };
  tvGeralSelo('op');
  await tvCarregar();
  S.tvDados = setInterval(tvCarregar, 5 * 60000);
  tvGeralOp();
}
async function tvCarregar() {
  const hoje = isoDia(new Date()); const on = new Date(); on.setDate(on.getDate() - 1); const ontem = isoDia(on);
  const ini = hoje.slice(0, 8) + '01'; const iniMes = ontem < ini ? ontem.slice(0, 8) + '01' : ini; const s7 = new Date(); s7.setDate(s7.getDate() - 6);
  const rpc = (f, a) => q(sb.rpc(f, a)).catch(e => ({ erro: e.message }));
  const [PH, PM, PA, EX, BH, TR] = await Promise.all([
    rpc('umov_prev_real', { p_de: hoje, p_ate: hoje }), rpc('umov_prev_real', { p_de: iniMes, p_ate: ontem }), rpc('umov_painel', { p_de: hoje, p_ate: hoje }),
    todas(() => sb.rpc('umov_extras', { p_de: isoDia(s7), p_ate: hoje })).catch(() => []), rpc('umov_baixas_hora', {}),
    S.perfil.papel === 'admin' ? rpc('torre_robos', {}) : Promise.resolve(null)]);
  if (!$('#tv')) return;
  if (PH.erro || PM.erro || PA.erro) { $('#tv-kpis').innerHTML = `<div class="tv-erro">Não foi possível atualizar: ${esc(PH.erro || PM.erro || PA.erro)}. Nova tentativa em 5 minutos.</div>`; return; }
  S.tvD = { hoje, PH, PM, PA, EX: Array.isArray(EX) ? EX : [], BH: Array.isArray(BH) ? BH : [], TR };
  tvDesenhar();
}
function tvDesenhar() {
  const { hoje, PH, PM, PA, EX, BH, TR } = S.tvD; const n0 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const pc = (a, b) => b ? Math.round(100 * a / b) : null; const k = PA.kpi || {};
  // aderência do mês até ontem
  const tm = PM.tot || {}; const ad = tm.prev ? tm.real / tm.prev : null; const adCor = ad == null ? 'neutro' : ad >= TV_META ? 'ok' : ad >= .85 ? 'atencao' : 'critico';
  $('#tv-ad').className = 'tv-aderencia ' + adCor;
  $('#tv-ad').innerHTML = `<b>${ad == null ? '—' : (ad * 100).toFixed(1).replace('.', ',') + '%'}</b> de aderência ao previsto no mês · meta ${Math.round(TV_META * 100)}%`;
  // robôs
  const rob = TR && !TR.erro ? (TR.robos || []).filter(r => r.active) : null; const prob = rob ? rob.filter(r => ['falha', 'atrasado'].includes(statusRobo(r)[0])).length : 0;
  $('#tv-robo').className = 'tv-robo ' + (rob == null ? '' : prob ? 'critico' : 'ok'); $('#tv-robo').textContent = rob == null ? '' : prob ? `● ${prob} robô(s) com problema` : '● Robôs ok';
  // série diária (mês até ontem) para sparklines
  const dias = (PM.dia || []).filter(d => d.prev > 0);
  const spark = (vals, cor) => { if (vals.length < 2) return ''; const mx = Math.max(...vals), mn = Math.min(...vals); const W = 150, H = 34;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(H - 3 - (mx === mn ? .5 : (v - mn) / (mx - mn)) * (H - 6)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="tv-spark" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`; };
  const th = PH.tot || {}; const abertos = (k.em_campo || 0) + (k.pendente || 0); const exRev = EX.filter(r => !r.rev_situacao); const exHoje = EX.filter(r => r.data === hoje);
  const kpi = (cls, tit, val, sub, extra = '') => `<div class="tv-kpi ${cls}"><small>${tit}</small><b>${val}</b><span>${sub}</span>${extra}</div>`;
  const realHoje = th.real || 0, prevHoje = th.prev || 0; const pHoje = pc(realHoje, prevHoje);
  $('#tv-kpis').innerHTML =
    kpi(adCor, 'Aderência no mês', ad == null ? '—' : (ad * 100).toFixed(1).replace('.', ',') + '%', `${n0(tm.real)} de ${n0(tm.prev)} previstos até ontem`, spark(dias.map(d => d.real / d.prev), 'var(--tv-ok)')) +
    kpi('neutro', 'Previsto hoje', n0(prevHoje), `${n0(th.pontos)} pontos na carteira`, spark(dias.map(d => d.prev), 'var(--tv-muted)')) +
    kpi(pHoje == null ? 'neutro' : 'ok', 'Realizado hoje', n0(realHoje), `${pHoje == null ? '—' : pHoje + '%'} do previsto · dia em andamento`, `<div class="tv-barra"><i style="width:${Math.min(100, pHoje || 0)}%"></i></div>`) +
    kpi(abertos ? 'atencao' : 'neutro', 'Falta baixa hoje', n0(abertos), `${n0(k.em_campo)} em campo · ${n0(k.pendente)} não enviados`) +
    kpi(k.atrasado ? 'critico' : 'ok', 'Atrasados', n0(k.atrasado), 'dias anteriores sem baixa') +
    kpi(exRev.length ? 'atencao' : 'ok', 'Fora do previsto', n0(exRev.length), `a revisar em 7 dias · ${n0(exHoje.length)} hoje`);
  // gráfico 1: previsto x realizado por dia
  const g1 = PM.dia || []; tvBarras($('#tv-g1'), g1.map(d => ({ rot: d.d.slice(8, 10), a: d.prev, b: d.real, lbl: d.prev ? pc(d.real, d.prev) + '%' : '' })), ['Previsto', 'Realizado'], d => d.lbl && parseInt(d.lbl) < 90 ? 'var(--tv-critico)' : 'var(--tv-ok)');
  $('#tv-g1s').textContent = `média ${ad == null ? '—' : (ad * 100).toFixed(1).replace('.', ',') + '%'} · meta ${Math.round(TV_META * 100)}%`;
  // gráfico 2: baixas por hora
  const hrs = BH.filter(h => h.hora >= 6 && h.hora <= 22); const tH = BH.reduce((a, h) => a + Number(h.hoje), 0), tO = BH.reduce((a, h) => a + Number(h.ontem), 0);
  const agora = new Date().getHours(); const tOate = BH.filter(h => h.hora <= agora).reduce((a, h) => a + Number(h.ontem), 0);
  tvBarras($('#tv-g2'), hrs.map(h => ({ rot: String(h.hora).padStart(2, '0') + 'h', a: Number(h.ontem), b: Number(h.hoje), lbl: '' })), ['Ontem', 'Hoje'], () => 'var(--tv-marca)');
  $('#tv-g2s').textContent = `hoje ${n0(tH)} baixas · ontem até esta hora ${n0(tOate)} (dia todo ${n0(tO)})`;
  // tabela de parceiros: aderência do mês até ontem + situação de hoje
  const pa = {}; (PA.parceiros || []).forEach(p => { if (p.id) pa[p.id] = p; }); const ph = {}; (PH.parceiros || []).forEach(p => { if (p.id) ph[p.id] = p; });
  const ex = {}; exRev.forEach(r => { ex[r.parceiro_id] = (ex[r.parceiro_id] || 0) + 1; });
  const L = (PM.parceiros || []).filter(p => p.id && p.prev >= 1).map(p => { const a = p.real / p.prev; const o = pa[p.id] || {}; const h = ph[p.id] || {};
    return { ...p, a, hp: h.prev || 0, hr: h.real || 0, fb: o.aberto_hoje || 0, atr: o.atrasado || 0, fora: ex[p.id] || 0,
      sit: a < .8 ? ['critico', 'Crítico'] : a < TV_META ? ['atencao', 'Atenção'] : ['ok', 'No previsto'] }; })
    .sort((x, y) => x.a - y.a);
  S.tvLinhas = L; S.tvPag = 0; tvTabela();
  clearInterval(S.tvPagina); S.tvPagina = setInterval(() => { S.tvPag++; tvTabela(); }, 12000);
  const nc = L.filter(p => p.sit[0] === 'critico').length, na = L.filter(p => p.sit[0] === 'atencao').length;
  $('#tv-tabs').textContent = `${L.length} parceiros · ${nc} críticos · ${na} em atenção · aderência do mês até ontem`;
  $('#tv-rodape').innerHTML = [
    ['ok', `${n0(tm.real)} realizados no mês`], ['neutro', `${n0(tm.prev)} previstos no mês`], ['critico', `${n0(tm.sem_atend)} pontos sem atendimento no mês`],
    ['atencao', `${n0(tm.oc)} ocorrências no mês`], ['atencao', `${n0(tm.fora)} atendimentos fora da carteira`],
    ['neutro', `Umov lido ${PA.atualizado ? fmtDH(PA.atualizado) : '—'} · próxima leitura ${proxLeituraUmov()} · tela atualiza a cada 5 min`]].map(([c, t]) => `<span class="${c}"><i></i>${t}</span>`).join('');
}
// leitura do Umov: a cada 2 horas, aos 5 minutos (horário de Brasília, jobs em UTC pares → horas ímpares em BRT)
function proxLeituraUmov() { const d = new Date(); const x = new Date(d); x.setMinutes(5, 0, 0); while (x <= d || x.getUTCHours() % 2) x.setHours(x.getHours() + 1); return x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function tvTabela() {
  const box = $('#tv-tabela'); if (!box) return pararTv(); const L = S.tvLinhas || [];
  const porPag = Math.max(5, Math.floor((box.clientHeight || 360) / 38) - 1); const pags = Math.max(1, Math.ceil(L.length / porPag)); const pg = S.tvPag % pags;
  const n0 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  box.innerHTML = `<table><thead><tr><th>Parceiro</th><th class="n">Previsto mês</th><th class="n">Realizado</th><th>Aderência</th><th class="n">Sem atend.</th><th class="n">Hoje prev.</th><th class="n">Hoje real.</th><th class="n">Falta baixa</th><th class="n">Atrasados</th><th class="n">Fora do prev.</th><th>Situação</th></tr></thead><tbody>
    ${L.slice(pg * porPag, (pg + 1) * porPag).map(p => `<tr><td>${esc(p.nome)}</td><td class="n">${n0(p.prev)}</td><td class="n">${n0(p.real)}</td>
      <td><div class="tv-ader ${p.sit[0]}"><i style="width:${Math.min(100, p.a * 100)}%"></i><span>${(p.a * 100).toFixed(1).replace('.', ',')}%</span></div></td>
      <td class="n">${p.sem_atend ? `<em class="critico">${n0(p.sem_atend)}</em>` : '0'}</td><td class="n">${n0(p.hp)}</td><td class="n">${n0(p.hr)}</td>
      <td class="n">${n0(p.fb)}</td><td class="n">${p.atr ? `<em class="critico">${n0(p.atr)}</em>` : '0'}</td><td class="n">${p.fora ? `<em class="atencao">${n0(p.fora)}</em>` : '0'}</td>
      <td><span class="tv-sit ${p.sit[0]}">${p.sit[1]}</span></td></tr>`).join('')}</tbody></table>
    ${pags > 1 ? `<div class="tv-pag">página ${pg + 1} de ${pags} · troca a cada 12 s</div>` : ''}`;
}
function tvBarras(box, D, nomes, corB, fmt = t => t.toLocaleString('pt-BR')) {
  if (!box) return; if (!D.length) { box.innerHTML = '<div class="tv-vazio">Sem dados no período.</div>'; return; }
  const mx = Math.max(1, ...D.map(d => Math.max(d.a, d.b))); const tk = [0, .5, 1].map(t => Math.round(mx * t));
  const W = Math.max(600, box.clientWidth || 800), H = Math.max(200, box.clientHeight || 260), pl = Math.max(40, 12 + 7 * Math.max(...tk.map(t => String(fmt(t)).length))), pr = 8, pt = 22, pb = 26;
  const bw = (W - pl - pr) / D.length; const y = v => pt + (H - pt - pb) * (1 - v / mx);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none" role="img">
    ${tk.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--tv-linha)"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--tv-muted)">${fmt(t)}</text>`).join('')}
    ${D.map((d, i) => { const x = pl + i * bw; const w = Math.max(2, bw * .34);
      return `<rect x="${x + bw * .14}" y="${y(d.a)}" width="${w}" height="${Math.max(0, y(0) - y(d.a))}" fill="var(--tv-cinza)" rx="2"/>
        <rect x="${x + bw * .14 + w + 2}" y="${y(d.b)}" width="${w}" height="${Math.max(0, y(0) - y(d.b))}" fill="${corB(d)}" rx="2"/>
        ${d.lbl && bw > 22 ? `<text x="${x + bw / 2}" y="${y(Math.max(d.a, d.b)) - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${corB(d)}">${d.lbl}</text>` : ''}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--tv-muted)">${d.rot}</text>`; }).join('')}
  </svg><div class="tv-leg"><span><i style="background:var(--tv-cinza)"></i>${nomes[0]}</span><span><i style="background:${corB(D[0]) === 'var(--tv-marca)' ? 'var(--tv-marca)' : 'var(--tv-ok)'}"></i>${nomes[1]}</span></div>`;
}


// ================= Portal do parceiro · acompanhamento em tempo real (Umov lido pelo robô) =================
function periodoAcomp(k) { const h = new Date(); const d = n => { const x = new Date(h); x.setDate(x.getDate() + n); return isoDia(x); };
  if (k === 'hoje') return [d(0), d(0)]; if (k === '7d') return [d(-6), d(0)];
  if (k === 'ant') { const a = new Date(h.getFullYear(), h.getMonth() - 1, 1), b = new Date(h.getFullYear(), h.getMonth(), 0); return [isoDia(a), isoDia(b)]; }
  return [isoDia(new Date(h.getFullYear(), h.getMonth(), 1)), d(0)]; }
async function vParceiroAcomp(el) {
  const A = S.pacomp || (S.pacomp = { per: 'mes', lista: 'pend', busca: '' }); [A.de, A.ate] = periodoAcomp(A.per);
  const pid = S.parc.id; const args = { p_de: A.de, p_ate: A.ate, p_parceiro: pid };
  el.innerHTML = '<div class="carregando">Carregando os seus atendimentos no Umov…</div>';
  let PA, PR, EX, PV;
  try { [PA, PR, EX, PV] = await Promise.all([q(sb.rpc('umov_painel', { ...args, p_cliente: null })), q(sb.rpc('umov_prev_real', { ...args, p_cliente: null })),
      todas(() => sb.rpc('umov_extras', args)), q(sb.rpc('parceiro_previa_valor', args)).catch(() => null)]); }
  catch (e) { el.innerHTML = `<div class="msg alerta">Não foi possível carregar o acompanhamento: ${esc(e.message)}</div>`; return; }
  A.PA = PA; A.PR = PR; A.EX = EX || []; A.PV = PV; desenharAcomp(el);
}
function desenharAcomp(el) {
  const A = S.pacomp, PA = A.PA || {}, PR = A.PR || {}, EX = A.EX, PV = A.PV; const k = PA.kpi || {}, t = PR.tot || {};
  const n0 = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); const pc = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const hoje = isoDia(new Date()); const naoAut = EX.filter(r => r.rev_situacao === 'nao_autorizado'), revisar = EX.filter(r => !r.rev_situacao);
  const tipo = PV?.tipo || S.parc.tipo || ''; const unit = tipo !== 'Fechado'; const tk = Number(PV?.ticket_medio) || 0;
  const previa = PV ? (tipo === 'Fechado' ? Number(PV.fixo) : tipo === 'Misto' ? Number(PV.fixo) + Number(PV.unit_realizado) : Number(PV.unit_realizado)) : null;
  const per = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês atual'], ['ant', 'Mês anterior']];
  // o que pode afetar o pagamento
  const imp = [
    { q: k.atrasado || 0, cor: 'marca', t: 'Atendimentos sem baixa de dias anteriores', e: 'Atendimento que não retornou de campo no Umov não entra no fechamento.', a: 'Dê a baixa no app do Umov ou avise a GSM do motivo.', v: unit ? (k.atrasado || 0) * tk : null },
    { q: t.sem_atend || 0, cor: 'marca', t: 'Pontos previstos sem nenhum atendimento', e: unit ? 'Ponto da sua carteira sem visita no período: não há o que pagar por ele.' : 'Ponto da sua carteira sem visita no período: é analisado pela GSM no fechamento.', a: 'Confira a rota desses pontos (lista abaixo).', v: null },
    { q: naoAut.length, cor: 'marca', t: 'Atendimentos fora do previsto não autorizados', e: 'A GSM analisou e não autorizou esses atendimentos: não entram no pagamento.', a: 'Fale com a GSM se discordar.', v: unit ? naoAut.length * tk : null },
    { q: revisar.length, cor: 'alerta', t: 'Atendimentos fora do previsto em análise', e: 'Atendimentos fora da frequência ou da carteira, ainda em análise pela GSM.', a: 'Se foi pedido pelo SAC ou pelo cliente, guarde a solicitação.', v: null },
    { q: t.fora || 0, cor: 'alerta', t: 'Atendimentos em pontos fora da sua carteira', e: 'O ponto não está cadastrado para você no portal: só é pago depois da validação da GSM.', a: 'Peça à GSM a inclusão do ponto, se for fixo.', v: null },
    { q: k.pendente || 0, cor: 'alerta', t: 'Atendimentos ainda não enviados para campo', e: 'Estão programados, mas ainda não foram para o app do motorista.', a: 'Confirme a rota do dia com a GSM.', v: null },
    { q: k.ocorrencia || 0, cor: '', t: 'Atendimentos com ocorrência', e: 'Retornaram de campo sem entrega/coleta (local fechado, sem coleta etc.). Contam como visita, mas ocorrências repetidas no mesmo ponto são acompanhadas pela GSM e pelo cliente.', a: 'Registre bem a ocorrência no app (foto e observação).', v: null }
  ].filter(x => x.q > 0);
  el.innerHTML = `
  <div class="topo"><div><h1>Acompanhamento em tempo real</h1><p>Os seus atendimentos no Umov, lidos pela GSM a cada 2 horas. Atualizado em <b>${PA.atualizado ? fmtDH(PA.atualizado) : '—'}</b>. É um acompanhamento: o valor oficial é o do fechamento aprovado pela GSM.</p></div>
    <div class="linha" style="gap:8px;flex-wrap:wrap"><div role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;background:var(--surface)">
      ${per.map(([kk, n]) => `<button type="button" data-apr="${kk}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${A.per === kk ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
      <button class="btn sec peq" id="ac-xls" style="min-height:44px">Excel</button></div></div>
  ${S.previa ? `<div class="msg alerta">Você está vendo o acompanhamento de <b>${esc(S.parc.regiao)} · ${esc(S.parc.nome)}</b>, como o parceiro vê.</div>` : ''}
  <div class="kpis">
    <div class="kpi neutro"><small>Previsto · sua carteira</small><b>${n0(t.prev)}</b><span>${n0(t.pontos)} pontos</span></div>
    <div class="kpi eco"><small>Realizados</small><b>${n0(t.real)}</b><span>${pc(t.real, t.prev)} do previsto</span></div>
    <div class="kpi ${(k.em_campo || 0) + (k.pendente || 0) ? '' : 'neutro'}"><small>Pendentes de baixa</small><b>${n0((k.em_campo || 0) + (k.pendente || 0))}</b><span>${n0(k.em_campo)} em campo · ${n0(k.pendente)} não enviados</span></div>
    <div class="kpi ${k.atrasado ? 'alerta' : 'neutro'}"><small>Atrasados</small><b>${n0(k.atrasado)}</b><span>dias anteriores sem baixa</span></div>
    <div class="kpi ${k.ocorrencia ? 'alerta' : 'neutro'}"><small>Ocorrências</small><b>${n0(k.ocorrencia)}</b><span>retornaram sem atender</span></div>
    ${previa != null ? `<div class="kpi"><small>Prévia do valor</small><b>${BRL2(previa)}</b><span>${tipo === 'Fechado' ? 'valor fixo do contrato' : tipo === 'Misto' ? `fixo ${BRL(Number(PV.fixo))} + atendimentos ${BRL(Number(PV.unit_realizado))}` : 'realizados × valor por atendimento'} · estimativa</span></div>` : ''}
  </div>
  <section class="bloco"><h2>O que pode afetar o seu pagamento</h2><p class="sub">Itens do período que, se não forem resolvidos, podem mudar o valor do seu fechamento.</p>
    ${imp.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">${imp.map(x => `<div style="border:1px solid var(--rule);border-left:4px solid ${x.cor === 'marca' ? 'var(--brand)' : x.cor === 'alerta' ? 'var(--alert)' : 'var(--rule)'};border-radius:8px;padding:12px 14px;background:var(--surface);display:flex;flex-direction:column;gap:6px">
        <div class="linha" style="justify-content:space-between;gap:8px;flex-wrap:nowrap"><b style="font-size:15px">${x.t}</b><b style="font-size:22px;${x.cor === 'marca' ? 'color:var(--brand)' : x.cor === 'alerta' ? 'color:var(--alert)' : ''}">${n0(x.q)}</b></div>
        <span style="font-size:13px">${x.e}</span><span class="nota">${x.a}${x.v ? ` · cerca de ${BRL(x.v)}` : ''}</span></div>`).join('')}</div>`
      : '<div class="msg ok">Nada pendente no período. Continue dando baixa no Umov no dia do atendimento.</div>'}
  </section>
  ${(PR.dia || []).length > 1 ? `<section class="bloco"><h2>Previsto x realizado por dia</h2><div id="ac-graf" style="position:relative"></div></section>` : ''}
  <section class="bloco"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Detalhe</h2>
    <div class="linha" style="gap:8px"><div role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px">${[['pend', 'Pendências'], ['pontos', 'Pontos sem atendimento'], ['fora', 'Fora do previsto'], ['oc', 'Ocorrências']].map(([kk, n]) => `<button type="button" data-alis="${kk}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${A.lista === kk ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
    <input type="search" id="ac-busca" placeholder="Buscar ponto, cliente, cidade" value="${esc(A.busca)}" style="min-height:40px;min-width:220px"></div></div>
    <div id="ac-lista" style="margin-top:10px"></div></section>`;
  el.querySelectorAll('[data-apr]').forEach(b => b.onclick = () => { A.per = b.dataset.apr; vParceiroAcomp(el); });
  el.querySelectorAll('[data-alis]').forEach(b => b.onclick = () => { A.lista = b.dataset.alis; desenharAcomp(el); });
  el.querySelector('#ac-busca').oninput = e => { A.busca = e.target.value; listaAcomp(el); };
  el.querySelector('#ac-xls').onclick = () => exportarAcomp().catch(e => alertaTopo(e.message));
  if ((PR.dia || []).length > 1) graficoPR(el.querySelector('#ac-graf'), PR.dia, hoje);
  listaAcomp(el);
}
function listaAcomp(el) {
  const A = S.pacomp, PA = A.PA || {}, PR = A.PR || {}; const f = norm(A.busca || ''); const box = el.querySelector('#ac-lista'); if (!box) return;
  const filt = (L, campos) => L.filter(r => !f || norm(campos(r).join(' ')).includes(f));
  const tab = (cab, linhas, vazio) => linhas.length ? `<div class="tabela" style="max-height:560px;overflow:auto"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.slice(0, 600).join('')}</tbody></table></div><p class="nota">${linhas.length > 600 ? `Mostrando 600 de ${fmtN(linhas.length)}; use a busca ou o Excel.` : `${fmtN(linhas.length)} item(ns).`}</p>` : `<p class="nota">${vazio}</p>`;
  const SIT = { atrasado: ['Atrasado · sem baixa', 'marca'], em_campo: ['Em campo', ''], pendente: ['Não enviado para campo', 'alerta'] };
  if (A.lista === 'pend') { const L = filt([...(PA.abertos || [])].sort((a, b) => (a.cat === 'atrasado' ? 0 : 1) - (b.cat === 'atrasado' ? 0 : 1) || a.data.localeCompare(b.data)), r => [r.cod_int, r.local_desc, r.grupo_cliente, r.cidade]);
    box.innerHTML = tab(['Data', 'Situação', 'Ponto', 'Cliente', 'Cidade'], L.map(r => `<tr><td style="white-space:nowrap">${fmtD(r.data)}</td><td><span class="pill ${SIT[r.cat]?.[1] || ''}">${SIT[r.cat]?.[0] || esc(r.situacao)}</span>${r.op === 'kit' ? ' <span class="pill">Kit</span>' : ''}</td><td>${esc(r.cod_int || '')}<br><span class="nota">${esc(r.local_desc || '')}</span></td><td>${esc(r.grupo_cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td></tr>`), 'Nenhuma pendência de baixa no período.'); return; }
  if (A.lista === 'pontos') { const L = filt((PR.pontos || []).filter(r => r.prev >= 1 && r.real === 0), r => [r.cod_int, r.cliente, r.loja, r.cidade]);
    box.innerHTML = tab(['Ponto', 'Cliente', 'Cidade', 'Frequência', 'Previsto', 'Realizado'], L.map(r => `<tr><td>${esc(r.cod_int)}<br><span class="nota">${esc(r.loja || '')}</span></td><td>${esc(r.cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td><td>${esc(r.frequencia || '—')}</td><td class="n">${(+r.prev).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td><td class="n"><b>0</b></td></tr>`), 'Todos os pontos previstos tiveram atendimento.'); return; }
  if (A.lista === 'fora') { const L = filt(A.EX, r => [r.cod_int, r.local_desc, r.cliente, r.cidade, r.motivo, r.inserido_por]);
    box.innerHTML = tab(['Data', 'Ponto', 'Por que está fora do previsto', 'Incluído por', 'Análise da GSM'], L.map(r => `<tr><td style="white-space:nowrap">${fmtD(r.data)}</td><td>${esc(r.cod_int || '—')}<br><span class="nota">${esc(r.local_desc || '')}${r.cidade ? ' · ' + esc(r.cidade) : ''}</span></td><td><span class="pill alerta">${esc(r.motivo)}</span></td><td>${esc(r.inserido_por || '—')}<br><span class="nota">${esc(r.canal || '')}</span></td>
      <td>${r.rev_situacao === 'ok' ? '<span class="pill">Autorizado</span>' : r.rev_situacao === 'nao_autorizado' ? `<span class="pill marca">Não autorizado</span>${r.rev_obs ? `<br><span class="nota">${esc(r.rev_obs)}</span>` : ''}` : '<span class="nota">em análise</span>'}</td></tr>`), 'Nenhum atendimento fora do previsto no período.'); return; }
  const L = filt(PA.lista_ocorr || [], r => [r.cod_int, r.local_desc, r.grupo_cliente, r.cidade, r.status_gsm]);
  box.innerHTML = tab(['Data', 'Ocorrência', 'Ponto', 'Cliente', 'Cidade'], L.map(r => `<tr><td style="white-space:nowrap">${fmtD(r.data)}</td><td><span class="pill alerta">${esc(r.status_gsm)}</span>${r.obs ? `<br><span class="nota">${esc(r.obs)}</span>` : ''}</td><td>${esc(r.cod_int || '')}<br><span class="nota">${esc(r.local_desc || '')}</span></td><td>${esc(r.grupo_cliente || '—')}</td><td>${esc(r.cidade || '')}${r.uf ? '/' + esc(r.uf) : ''}</td></tr>`), 'Nenhuma ocorrência no período.');
}
async function exportarAcomp() {
  const A = S.pacomp, PA = A.PA || {}, PR = A.PR || {}; const per = A.de === A.ate ? fmtD(A.de) : `${fmtD(A.de)} a ${fmtD(A.ate)}`;
  const buf = await planilhaPadrao({ titulo: `Acompanhamento · ${S.parc.regiao} · ${S.parc.nome}`, sub: per, abas: [
    { nome: 'Pendencias', linhas: (PA.abertos || []).map(r => ({ Data: r.data, Situacao: r.cat === 'atrasado' ? 'Atrasado' : r.situacao, Ponto: r.cod_int, Local: r.local_desc, Cliente: r.grupo_cliente, Cidade: r.cidade, UF: r.uf })) },
    { nome: 'Pontos sem atendimento', linhas: (PR.pontos || []).filter(r => r.prev >= 1 && r.real === 0).map(r => ({ Ponto: r.cod_int, Loja: r.loja, Cliente: r.cliente, Cidade: r.cidade, UF: r.uf, Frequencia: r.frequencia, Previsto: r.prev })) },
    { nome: 'Fora do previsto', linhas: A.EX.map(r => ({ Data: r.data, Ponto: r.cod_int, Local: r.local_desc, Motivo: r.motivo, 'Incluido por': r.inserido_por, Canal: r.canal, Analise: r.rev_situacao === 'ok' ? 'Autorizado' : r.rev_situacao === 'nao_autorizado' ? 'Não autorizado' : 'Em análise' })) },
    { nome: 'Ocorrencias', linhas: (PA.lista_ocorr || []).map(r => ({ Data: r.data, Ocorrencia: r.status_gsm, Observacao: r.obs, Ponto: r.cod_int, Local: r.local_desc, Cliente: r.grupo_cliente, Cidade: r.cidade })) },
    { nome: 'Por dia', linhas: (PR.dia || []).map(d => ({ Data: d.d, Previsto: d.prev, Realizado: d.real, 'Sem baixa': d.ab })) }] });
  baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Acompanhamento_${S.parc.regiao.replace(/\W+/g, '_')}_${A.de}_${A.ate}.xlsx`);
}


// ================= Carteira de pontos · alteração em massa =================
const MASSA_ACOES = [['cancelar', 'Cancelar pontos'], ['suspender', 'Suspender pontos'], ['reativar', 'Reativar pontos'], ['trocar_parceiro', 'Trocar de parceiro'], ['incluir', 'Incluir pontos']];
const MASSA_COLS = ['cod_int', 'cliente', 'loja', 'cidade', 'uf', 'frequencia', 'parceiro', 'v_unit'];
function massaPontos() {
  const box = $('#massa-corpo'); if (!box) return;
  const M = S.massa || (S.massa = { acao: 'cancelar', modo: 'filtro', sel: new Set(), lista: [], data: isoDia(new Date()), motivo: '' });
  const inc = M.acao === 'incluir'; const parcs = S.parceiros.filter(p => p.ativo !== false);
  const optP = sel => `<option value="">— escolher —</option>${parcs.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}</option>`).join('')}`;
  box.innerHTML = `
    <div class="linha" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
      <label class="campo" style="flex:1 1 220px">O que fazer<select id="ms-acao">${MASSA_ACOES.map(([k, n]) => `<option value="${k}" ${M.acao === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo" style="flex:0 1 180px">${inc || M.acao === 'reativar' ? 'Ativo a partir de' : M.acao === 'trocar_parceiro' ? 'Vale a partir de' : 'Inativo a partir de'}<input type="date" id="ms-data" value="${M.data}"></label>
      <label class="campo" style="flex:2 1 320px">Motivo (vai para o histórico de cada ponto)<input type="text" id="ms-motivo" value="${esc(M.motivo)}" placeholder="Ex.: Casas Bahia encerrou o contrato em 17/11"></label>
    </div>
    ${M.acao === 'trocar_parceiro' || inc ? `<div class="linha" style="gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:10px">
      <label class="campo" style="flex:2 1 300px">${inc ? 'Parceiro padrão (quando a linha não tiver)' : 'Novo parceiro'}<select id="ms-parc">${optP(M.parc)}</select></label>
      <label class="campo" style="flex:0 1 200px">${inc ? 'Valor unitário padrão' : 'Novo valor unitário (opcional)'}<input type="text" id="ms-vu" value="${esc(M.vu || '')}" placeholder="ex.: 25,00"></label></div>` : ''}
    ${inc ? `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        <b style="font-size:14px">Pontos a incluir</b>
        <span class="sub" style="margin:0">Cole as linhas do Excel (com ou sem cabeçalho) na ordem: <b>código de integração, cliente, loja, cidade, UF, frequência, parceiro, valor unitário</b>. O parceiro pode ser a região (ex.: "Bauru - SP"). Ou suba uma planilha com essas colunas. Se o código já existir, o ponto é atualizado e reativado.</span>
        <textarea id="ms-txt" rows="7" style="width:100%;font:13px ui-monospace,monospace;padding:10px;border:1px solid var(--rule);border-radius:6px;background:var(--field);color:var(--ink)" placeholder="123456789	CASAS BAHIA	CB 1124 MARINGA	MARINGA	PR	QUINZENAL	Maringa - PR	10">${esc(M.txt || '')}</textarea>
        <div class="linha" style="gap:8px"><label class="btn sec peq" style="cursor:pointer">Subir planilha<input type="file" id="ms-arq" accept=".xlsx,.xls,.csv" hidden></label><button class="btn sec peq" id="ms-modelo">Baixar modelo</button></div></div>`
    : `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        <div role="group" style="display:inline-flex;border:1px solid var(--rule);border-radius:8px;padding:3px;align-self:flex-start">${[['filtro', 'Escolher por filtro'], ['colar', 'Colar códigos']].map(([k, n]) => `<button type="button" data-msm="${k}" style="font:inherit;font-size:14px;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;${M.modo === k ? 'background:var(--btn);color:var(--on-btn);font-weight:600' : 'background:none;color:var(--muted)'}">${n}</button>`).join('')}</div>
        ${M.modo === 'filtro' ? `<div class="linha" style="gap:8px;flex-wrap:wrap">
            <input type="text" id="ms-cli" placeholder="Cliente (ex.: Casas Bahia)" value="${esc(M.fcli || '')}" style="flex:2 1 220px">
            <select id="ms-fparc" style="flex:2 1 220px"><option value="">Todos os parceiros</option>${S.parceiros.map(p => `<option value="${p.id}" ${M.fparc === p.id ? 'selected' : ''}>${esc(p.regiao)} · ${esc(p.nome)}${p.ativo === false ? ' (inativo)' : ''}</option>`).join('')}</select>
            <input type="text" id="ms-cid" placeholder="Cidade ou UF" value="${esc(M.fcid || '')}" style="flex:1 1 160px">
            <select id="ms-fsit" style="flex:0 1 140px">${['', 'Ativo', 'Suspenso', 'Cancelado'].map(x => `<option value="${x}" ${(M.fsit ?? 'Ativo') === x ? 'selected' : ''}>${x || 'Todas'}</option>`).join('')}</select>
            <button class="btn sec" id="ms-carregar">Carregar pontos</button></div><div id="ms-lista"></div>`
        : `<span class="sub" style="margin:0">Cole a coluna de códigos de integração (um por linha, direto do Excel).</span>
           <textarea id="ms-cods" rows="6" style="width:100%;font:13px ui-monospace,monospace;padding:10px;border:1px solid var(--rule);border-radius:6px;background:var(--field);color:var(--ink)">${esc(M.cods || '')}</textarea>`}
      </div>`}
    <div class="linha" style="gap:8px;margin-top:12px"><button class="btn sec" id="ms-previa">Ver prévia</button></div>
    <div id="ms-res" style="margin-top:10px"></div>`;
  const ler = () => { M.data = $('#ms-data').value; M.motivo = $('#ms-motivo').value; if ($('#ms-parc')) M.parc = $('#ms-parc').value; if ($('#ms-vu')) M.vu = $('#ms-vu').value;
    if ($('#ms-txt')) M.txt = $('#ms-txt').value; if ($('#ms-cods')) M.cods = $('#ms-cods').value;
    if ($('#ms-cli')) { M.fcli = $('#ms-cli').value; M.fparc = $('#ms-fparc').value; M.fcid = $('#ms-cid').value; M.fsit = $('#ms-fsit').value; } };
  $('#ms-acao').onchange = e => { ler(); M.acao = e.target.value; M.prev = null; massaPontos(); };
  box.querySelectorAll('[data-msm]').forEach(b => b.onclick = () => { ler(); M.modo = b.dataset.msm; massaPontos(); });
  if ($('#ms-carregar')) { $('#ms-carregar').onclick = async () => { ler(); await massaCarregar(); }; if (M.lista.length) massaDesenharLista(); }
  if ($('#ms-modelo')) $('#ms-modelo').onclick = () => { const ws = XLSX.utils.aoa_to_sheet([['codigo_integracao', 'cliente', 'loja', 'cidade', 'uf', 'frequencia', 'parceiro', 'valor_unitario'], ['123456789', 'CASAS BAHIA', 'CB 1124 - MARINGA', 'MARINGA', 'PR', 'QUINZENAL', 'Maringa - PR', '10']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inclusao'); XLSX.writeFile(wb, 'Modelo_inclusao_pontos.xlsx'); };
  if ($('#ms-arq')) $('#ms-arq').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const abas = await lerPlanilha(f); const linhas = Object.values(abas)[0] || [];
      ler(); M.txt = linhas.filter(l => l && l.some(c => c != null && String(c).trim() !== '')).map(l => l.map(c => c == null ? '' : String(c)).join('\t')).join('\n'); massaPontos(); } catch (er) { alertaTopo('Não consegui ler a planilha: ' + er.message); } };
  $('#ms-previa').onclick = () => { ler(); massaExecutar(true); };
  if (M.prev) massaMostrar(M.prev, true);
}
async function massaCarregar() {
  const M = S.massa; $('#ms-lista').innerHTML = '<div class="carregando">Buscando…</div>';
  if (!M.fcli && !M.fparc && !M.fcid) { $('#ms-lista').innerHTML = '<div class="msg alerta">Use pelo menos um filtro (cliente, parceiro ou cidade/UF).</div>'; return; }
  try {
    const L = await todas(() => { let qr = sb.from('cadastro_pontos').select('cod_int,cliente,loja,cidade,uf,frequencia,parceiro_id,situacao,v_unit').order('cliente').order('cod_int');
      if (M.fcli) qr = qr.ilike('cliente', `%${M.fcli.trim().replace(/[%,()*]/g, ' ')}%`);
      if (M.fparc) qr = qr.eq('parceiro_id', M.fparc);
      if (M.fcid) { const t = M.fcid.trim().replace(/[%,()*]/g, ' '); qr = t.length === 2 ? qr.ilike('uf', t) : qr.ilike('cidade', `%${t}%`); }
      if (M.fsit) qr = qr.eq('situacao', M.fsit); return qr; });
    M.lista = L; M.sel = new Set(L.map(p => p.cod_int)); M.prev = null; massaDesenharLista();
  } catch (e) { $('#ms-lista').innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
}
function massaDesenharLista() {
  const M = S.massa, L = M.lista; const box = $('#ms-lista'); if (!box) return; const pn = id => { const p = S.parceiros.find(x => x.id === id); return p ? p.regiao + ' · ' + p.nome : '—'; };
  if (!L.length) { box.innerHTML = '<p class="nota">Nenhum ponto com esses filtros.</p>'; return; }
  box.innerHTML = `<p style="font-size:14px;margin:4px 0"><b id="ms-nsel">${fmtN(M.sel.size)}</b> de ${fmtN(L.length)} pontos selecionados</p>
    <div class="tabela" style="max-height:420px;overflow:auto"><table><thead><tr><th><input type="checkbox" id="ms-all" ${M.sel.size === L.length ? 'checked' : ''} aria-label="Selecionar todos"></th><th>Código</th><th>Cliente · loja</th><th>Cidade</th><th>Frequência</th><th>Parceiro</th><th>Situação</th></tr></thead><tbody>
    ${L.slice(0, 1000).map(p => `<tr><td><input type="checkbox" data-mscod="${esc(p.cod_int)}" ${M.sel.has(p.cod_int) ? 'checked' : ''}></td><td class="num">${esc(p.cod_int)}</td><td>${esc(p.cliente || '')}<br><span class="nota">${esc(p.loja || '')}</span></td><td>${esc(p.cidade || '')}${p.uf ? '/' + esc(p.uf) : ''}</td><td>${esc(p.frequencia || '—')}</td><td>${esc(pn(p.parceiro_id))}</td><td><span class="pill ${p.situacao === 'Ativo' ? '' : 'alerta'}">${esc(p.situacao)}</span></td></tr>`).join('')}</tbody></table></div>
    ${L.length > 1000 ? `<p class="nota">Mostrando 1.000 de ${fmtN(L.length)} na tela; todos os selecionados entram na alteração.</p>` : ''}`;
  const cont = () => { $('#ms-nsel').textContent = fmtN(M.sel.size); M.prev = null; $('#ms-res').innerHTML = ''; };
  box.querySelectorAll('[data-mscod]').forEach(cb => cb.onchange = () => { cb.checked ? M.sel.add(cb.dataset.mscod) : M.sel.delete(cb.dataset.mscod); cont(); });
  $('#ms-all').onchange = e => { if (e.target.checked) L.forEach(p => M.sel.add(p.cod_int)); else M.sel.clear(); box.querySelectorAll('[data-mscod]').forEach(cb => cb.checked = e.target.checked); cont(); };
}
function massaItens() {
  const M = S.massa;
  if (M.acao !== 'incluir') return M.modo === 'filtro' ? [...M.sel] : (M.cods || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  const linhas = (M.txt || '').split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim())).filter(l => l.some(Boolean));
  if (!linhas.length) return [];
  let cols = MASSA_COLS; const cab = linhas[0].map(c => norm(c));
  if (cab.some(c => /COD|INTEGRA/.test(c))) { cols = cab.map(c => /COD|INTEGRA/.test(c) ? 'cod_int' : /CLIENTE/.test(c) ? 'cliente' : /LOJA|NOMENCL|LOCAL/.test(c) ? 'loja' : /CIDADE|MUNIC/.test(c) ? 'cidade' : /^UF$|ESTADO/.test(c) ? 'uf' : /FREQ/.test(c) ? 'frequencia' : /PARC|REGI/.test(c) ? 'parceiro' : /VALOR|UNIT|PRECO/.test(c) ? 'v_unit' : null); linhas.shift(); }
  return linhas.map(l => { const o = {}; cols.forEach((k, i) => { if (k && l[i] != null && l[i] !== '') o[k] = l[i]; }); return o; }).filter(o => o.cod_int);
}
async function massaExecutar(simular) {
  const M = S.massa; const itens = massaItens(); const res = $('#ms-res');
  if (!itens.length) { res.innerHTML = `<div class="msg alerta">${M.acao === 'incluir' ? 'Cole as linhas dos pontos a incluir ou suba a planilha.' : M.modo === 'filtro' ? 'Carregue e selecione os pontos.' : 'Cole os códigos de integração.'}</div>`; return; }
  const vu = M.vu ? Number(String(M.vu).replace(/\./g, '').replace(',', '.')) : null;
  res.innerHTML = `<div class="carregando">${simular ? 'Calculando a prévia…' : 'Gravando…'}</div>`;
  try {
    const r = await q(sb.rpc('alterar_pontos_massa', { p_acao: M.acao, p_pontos: itens, p_data: M.data, p_motivo: M.motivo, p_parceiro: M.parc || null, p_v_unit: Number.isFinite(vu) ? vu : null, p_simular: simular }));
    if (simular) { M.prev = r; M.prevItens = itens.length; } else { M.prev = null; M.lista = []; M.sel = new Set(); }
    massaMostrar(r, simular);
  } catch (e) { res.innerHTML = `<div class="msg erro">${esc(e.message)}</div>`; }
}
function massaMostrar(r, simular) {
  const M = S.massa, res = $('#ms-res'); if (!res) return; const acao = (MASSA_ACOES.find(a => a[0] === M.acao) || [])[1] || '';
  const c = comp(); const lembrete = c && c.status === 'aberta' ? ` Para valer na base de ${nomeMes(c.mes)}, use <b>Gerar base de ${nomeMes(c.mes)}</b> na rotina do mês.` : '';
  if (M.acao === 'incluir') {
    const erros = r.erros || [];
    res.innerHTML = `<div class="msg ${simular ? '' : 'ok'}"><b>${simular ? 'Prévia' : 'Gravado'} · ${acao}</b>: ${fmtN(r.informados)} linhas · ${fmtN(r.novos)} pontos novos · ${fmtN(r.atualizados)} já existiam (serão atualizados e reativados)${erros.length ? ` · <b>${fmtN(erros.length)} com erro</b> (não entram)` : ''}.${simular ? '' : lembrete}</div>
      ${erros.length ? `<div class="tabela" style="max-height:220px;overflow:auto;margin-top:8px"><table><thead><tr><th>Código</th><th>Problema</th></tr></thead><tbody>${erros.map(e => `<tr><td>${esc(e.cod_int || '—')}</td><td>${esc(e.erro)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${simular && (r.novos + r.atualizados) ? `<div class="linha" style="margin-top:10px"><button class="btn marca" id="ms-gravar">Confirmar e gravar ${fmtN(r.novos + r.atualizados)} pontos</button></div>` : ''}`;
  } else {
    const nf = r.nao_encontrados || [];
    res.innerHTML = `<div class="msg ${simular ? '' : 'ok'}"><b>${simular ? 'Prévia' : 'Gravado'} · ${acao}</b>: ${fmtN(r.informados)} códigos · ${fmtN(r.encontrados)} encontrados na carteira · <b>${fmtN(simular ? r.a_alterar : r.alterados)} ${simular ? 'serão alterados' : 'alterados'}</b>${r.ja_estavam ? ` · ${fmtN(r.ja_estavam)} já estavam assim` : ''}${nf.length ? ` · <b>${fmtN(nf.length)} não encontrados</b>` : ''}. Data efetiva ${fmtD(M.data)}.${simular ? '' : lembrete}</div>
      ${nf.length ? `<p class="nota" style="margin-top:6px">Não encontrados na carteira: ${nf.slice(0, 60).map(esc).join(', ')}${nf.length > 60 ? '…' : ''}</p>` : ''}
      ${simular && r.a_alterar ? `<div class="linha" style="margin-top:10px"><button class="btn marca" id="ms-gravar">Confirmar: ${acao.toLowerCase()} (${fmtN(r.a_alterar)})</button></div>` : ''}`;
  }
  const g = $('#ms-gravar'); if (g) g.onclick = async () => { if (!M.motivo || !M.motivo.trim()) { alertaTopo('Informe o motivo antes de gravar.'); return; }
    if (!confirm(`Confirmar: ${acao.toLowerCase()} com data efetiva ${fmtD(M.data)}?`)) return; g.disabled = true; await massaExecutar(false); carregarPend(); };
}


// ================= Modo TV · visão da diretoria e do financeiro =================
async function vTvDir() {
  pararTv();
  app.innerHTML = `<div class="tv" id="tv">
    <header class="tv-top">
      <div class="tv-marca"><img src="logo_escuro.png" alt="GSM Log"><div><b>Painel executivo</b><span>Custos de última milha · diretoria e financeiro</span></div></div>
      <div class="tv-aderencia" id="tv-ad">carregando…</div>
      <div class="tv-relogio"><b id="tv-hora">--:--:--</b><span id="tv-data"></span></div>
      <div class="tv-acoes"><button type="button" id="tv-atu" title="Atualizar agora">↻</button><button type="button" id="tv-full" title="Tela cheia">⛶</button><button type="button" id="tv-sair" title="Sair do modo TV">✕</button></div>
    </header>
    <section class="tv-kpis" id="tv-kpis"><div class="tv-vazio">Carregando os fechamentos…</div></section>
    <section class="tv-card tv-slides"><div class="tv-tit"><b id="tv-stit"></b><span class="tv-snav" id="tv-snav"></span></div><div class="tv-palco" id="tv-palco"></div></section>
    <footer class="tv-rodape" id="tv-rodape"></footer>
  </div>`;
  $('#tv').classList.add('tv-dir');
  const relogio = () => { const d = new Date(); const h = $('#tv-hora'); if (!h) return pararTv();
    h.textContent = d.toLocaleTimeString('pt-BR'); $('#tv-data').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); };
  relogio(); S.tvRelogio = setInterval(relogio, 1000);
  $('#tv-sair').onclick = tvSair; $('#tv-atu').onclick = () => tvDirCarregar();
  $('#tv-full').onclick = () => { const t = $('#tv'); document.fullscreenElement ? document.exitFullscreen() : (t.requestFullscreen && t.requestFullscreen().catch(() => {})); };
  document.onkeydown = ev => { if (S.view === 'tv' && ev.key === 'Escape' && !document.fullscreenElement) tvSair(); };
  let rz; window.onresize = () => { clearTimeout(rz); rz = setTimeout(() => { if (S.tvDir && $('#tv')) tvDirDesenhar(); }, 250); };
  tvGeralSelo('dir');
  await tvDirCarregar();
  S.tvDados = setInterval(tvDirCarregar, 10 * 60000);
}
// slides com os gráficos do portal (mesmas funções da visão da diretoria), girando sozinhos
const TV_SLIDES = [
  ['executivo', 'Resumo executivo'], ['geral', 'Visão geral do mês'], ['variacao', 'O que mudou sobre o mês anterior'], ['mapa', 'Mapa de custos'], ['evolucao', 'Evolução por praça'],
  ['previsto', 'Previsto pelo contrato × realizado · malote'], ['ano', 'Resumo do ano'], ['pagamentos', 'Pagamentos e praças com maior variação']];
const TV_SLIDE_SEG = 30;
function tvSlide(i) {
  const palco = $('#tv-palco'); if (!palco || !S.tvDir) return; const D = S.dir, c = S.tvDir.c; const idx = D.comps.findIndex(x => x.id === c.id); const ant = D.comps[idx - 1];
  S.tvSl = ((i % TV_SLIDES.length) + TV_SLIDES.length) % TV_SLIDES.length; const [k, t] = TV_SLIDES[S.tvSl];
  $('#tv-stit').textContent = `${t} · ${nomeMes(c.mes)}`;
  $('#tv-snav').innerHTML = `<button type="button" data-tvs="-1" title="Anterior">‹</button>${TV_SLIDES.map((x, j) => `<i data-tvi="${j}" class="${j === S.tvSl ? 'on' : ''}" title="${esc(x[1])}"></i>`).join('')}<button type="button" data-tvs="1" title="Próximo">›</button><button type="button" id="tv-pausa" title="${S.tvPausa ? 'Continuar' : 'Pausar'}">${S.tvPausa ? '▶' : '❚❚'}</button>`;
  $('#tv-snav').querySelectorAll('[data-tvs]').forEach(b => b.onclick = () => { tvSlide(S.tvSl + Number(b.dataset.tvs)); tvRodar(); });
  $('#tv-snav').querySelectorAll('[data-tvi]').forEach(b => b.onclick = () => { tvSlide(Number(b.dataset.tvi)); tvRodar(); });
  $('#tv-pausa').onclick = () => { S.tvPausa = !S.tvPausa; tvRodar(); tvSlide(S.tvSl); };
  palco.innerHTML = `<div class="tv-escala" id="tv-esc" data-sl="${k}"></div>`; const box = $('#tv-esc');
  D.compId = c.id; D.aba = k === 'geral' || k === 'executivo' ? k : D.aba; D.op = 'tudo';
  try {
    if (k === 'executivo') resumoExecutivo(box, D, c, ant);
    else if (k === 'geral') visaoGeral(box, D, c, ant);
    else if (k === 'variacao') { box.innerHTML = '<section class="bloco"><div id="tv-ponte" style="position:relative"></div></section>'; ponte($('#tv-ponte'), D, c, ant); }
    else if (k === 'mapa') { box.innerHTML = '<div id="tv-mapa"></div>'; mapaCustos($('#tv-mapa'), D, c); }
    else if (k === 'evolucao') { box.innerHTML = '<section class="gcard" id="tv-evol"></section>'; evolucaoPracas($('#tv-evol'), D, c); }
    else if (k === 'previsto') { const n = v => Number(v) || 0; const pts = D.comps.filter(x => x.mes <= c.mes).slice(-12).map(x => { const pr = D.prev.filter(f => f.competencia_id === x.id && f.previsto != null);
        const fe = D.fech.filter(f => f.competencia_id === x.id); return { c: x, p: pr.reduce((a, r) => a + n(r.previsto), 0), r: fe.length ? fe.reduce((a, r) => a + n(r.malote), 0) : null, origem: (pr[0] || {}).origem_previsao }; });
      box.innerHTML = '<section class="bloco"><div id="tv-gprev" style="position:relative"></div><div id="tv-tprev"></div></section>'; graficoPrev($('#tv-gprev'), $('#tv-tprev'), pts, c.id); }
    else if (k === 'ano') { const n = v => Number(v) || 0; const doMes = id => D.fech.filter(f => f.competencia_id === id);
      box.innerHTML = '<section class="bloco"><div id="tv-ano"></div></section><section class="bloco"><h2>Custo mês a mês</h2><div id="tv-graf" style="position:relative"></div></section>';
      blocoAno($('#tv-ano'), D, c); grafico($('#tv-graf'), D.comps.filter(x => x.mes.slice(0, 4) === c.mes.slice(0, 4) && x.mes <= c.mes).map(x => ({ rot: MES3[+x.mes.slice(5, 7) - 1], v: doMes(x.id).reduce((a, r) => a + n(r.valor_aprovado ?? r.valor_final), 0), atual: x.id === c.id, id: x.id }))); }
    else { box.innerHTML = `<div class="tv-duas"><div><h3 class="tv-h3">Lotes de pagamento</h3><div id="tv-lotes"></div></div><div><h3 class="tv-h3">Praças com maior variação</h3><div id="tv-tabela"></div></div></div>`; tvDirPagamentos(); }
  } catch (e) { box.innerHTML = `<div class="tv-erro">Não foi possível montar este gráfico: ${esc(e.message)}</div>`; }
  tvEncaixar();
}
// escala o conteúdo do slide para caber inteiro no palco (o portal é desenhado com 1500 px de largura)
// Todas as telas da TV na MESMA escala (largura fixa de 1600 px → letra do mesmo tamanho em todas).
// O que não cabe na altura rola devagar durante a tela, em vez de encolher.
const TV_LARG = 1600;
function tvEncaixar() {
  const palco = $('#tv-palco'), box = $('#tv-esc'); if (!palco || !box) return;
  let chave = '';
  const fit = () => { if (!box.isConnected) return;
    const w = palco.clientWidth, h = palco.clientHeight; const k = Math.min(w / TV_LARG, 1.25); const ih = box.scrollHeight || 1;
    const ck = `${w}x${h}x${Math.round(ih / 20)}`; if (ck === chave) return; chave = ck;
    clearTimeout(S.tvRolar); box.style.transition = 'none'; box.style.width = TV_LARG + 'px';
    box.style.left = Math.max(0, (w - TV_LARG * k) / 2) + 'px'; box.style.transform = `scale(${k})`;
    const sobra = ih * k - h + 16;
    if (sobra > 8 && !S.tvPausa) { const dur = Math.max(6, TV_SLIDE_SEG - 10);
      S.tvRolar = setTimeout(() => { box.style.transition = `transform ${dur}s linear`; box.style.transform = `translateY(${-sobra}px) scale(${k})`; }, 4000); } };
  fit(); if (S.tvRO) S.tvRO.disconnect(); if (window.ResizeObserver) { S.tvRO = new ResizeObserver(() => fit()); S.tvRO.observe(box); S.tvRO.observe(palco); }
  [400, 1500, 3500].forEach(ms => setTimeout(fit, ms));
}
function tvRodar() { clearInterval(S.tvPagina); if (S.tvPausa) return;
  const b = $('#tv-gbar'); if (S.tvGeral && b) { const tot = TV_SLIDES.length; b.style.width = (100 * (S.tvSl || 0) / tot) + '%'; }
  S.tvPagina = setInterval(() => { const prox = (S.tvSl || 0) + 1;
    if (S.tvGeral && prox >= TV_SLIDES.length) { clearInterval(S.tvPagina); S.tvSl = 0; return vTv(); }
    tvSlide(prox); const g = $('#tv-gbar'); if (S.tvGeral && g) g.style.width = (100 * prox / TV_SLIDES.length) + '%'; }, TV_SLIDE_SEG * 1000); }
async function tvDirCarregar() {
  try {
    const ok = await carregarDiretoria(); if (!$('#tv')) return;
    if (!ok) { $('#tv-kpis').innerHTML = '<div class="tv-erro">Ainda não há fechamentos registrados.</div>'; return; }
    const D = S.dir; const comFech = D.comps.filter(c => D.fech.some(f => f.competencia_id === c.id));
    const c = comFech[comFech.length - 1]; if (!c) { $('#tv-kpis').innerHTML = '<div class="tv-erro">Ainda não há fechamentos registrados.</div>'; return; }
    const lotes = await q(sb.from('lotes_financeiro').select('id,competencia_id,data_pagamento,rotulo,status,total,pago_em').eq('competencia_id', c.id).order('data_pagamento')).catch(() => []);
    const nfs = ['admin', 'financeiro'].includes(S.perfil.papel) ? await todas(() => sb.from('notas_fiscais').select('parceiro_id,status,tipo,adiantamento_id').eq('competencia_id', c.id)).catch(() => null) : null;
    S.tvDir = { c, lotes: (lotes || []).filter(l => l.status !== 'desfeito'), nfs };
    tvDirDesenhar();
  } catch (e) { if ($('#tv-kpis')) $('#tv-kpis').innerHTML = `<div class="tv-erro">Não foi possível atualizar: ${esc(e.message)}. Nova tentativa em 10 minutos.</div>`; }
}
function tvDirDesenhar() {
  const D = S.dir, T = S.tvDir, c = T.c; const n = v => Number(v) || 0; const pctTxt = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1).replace('.', ',') + '%';
  const idx = D.comps.findIndex(x => x.id === c.id); const ant = D.comps[idx - 1];
  const doMes = id => D.fech.filter(f => f.competencia_id === id); const valor = r => n(r.valor_aprovado ?? r.valor_final);
  const prevMes = id => D.prev.filter(f => f.competencia_id === id && f.previsto != null);
  const L = doMes(c.id); const total = L.reduce((a, r) => a + valor(r), 0);
  const totAnt = ant ? doMes(ant.id).reduce((a, r) => a + valor(r), 0) : 0; const varM = totAnt ? total / totAnt - 1 : null;
  const prevTot = prevMes(c.id).reduce((a, r) => a + n(r.previsto), 0); const malote = L.reduce((a, r) => a + n(r.malote), 0);
  const parcsMes = new Set([...L.map(r => r.parceiro_id), ...prevMes(c.id).map(r => r.parceiro_id)]);
  const aprov = L.filter(r => r.valor_aprovado != null).length; const pago = L.filter(r => r.pago_em).reduce((a, r) => a + n(r.a_pagar ?? r.valor_aprovado), 0);
  const emLote = L.filter(r => r.lote_id && !r.pago_em).reduce((a, r) => a + n(r.valor_aprovado), 0); const semLote = L.filter(r => r.valor_aprovado != null && !r.lote_id && !r.pago_em).reduce((a, r) => a + n(r.valor_aprovado), 0);
  const ano = c.mes.slice(0, 4); const doAno = D.comps.filter(x => x.mes.slice(0, 4) === ano && x.mes <= c.mes);
  const custoAno = doAno.reduce((a, x) => a + doMes(x.id).reduce((s, r) => s + valor(r), 0), 0); const mesesAno = doAno.filter(x => doMes(x.id).length).length;
  const g = ganhosMes(D, c.id); const gAno = doAno.reduce((a, x) => a + ganhosMes(D, x.id).total, 0);
  const ader = prevTot ? malote / prevTot : null;
  const atendDe = id => (D.efic || []).filter(e => e.competencia_id === id).reduce((a, e) => a + n(e.atend_umov), 0);
  const atM = atendDe(c.id), atA = ant ? atendDe(ant.id) : 0; const cpa = atM ? total / atM : null, cpaAnt = atA && totAnt ? totAnt / atA : null;
  $('#tv-ad').className = 'tv-aderencia ' + (varM == null ? 'neutro' : varM > 0.02 ? 'critico' : varM < 0 ? 'ok' : 'atencao');
  $('#tv-ad').innerHTML = `<b>${BRL(total)}</b> em ${nomeMes(c.mes)}${varM != null ? ` · ${pctTxt(varM)} sobre ${nomeMes(ant.mes)}` : ''} · ${c.status === 'fechada' ? 'mês fechado' : 'mês em andamento'}`;
  const kpi = (cls, tit, val, sub, extra = '') => `<div class="tv-kpi ${cls}"><small>${tit}</small><b>${val}</b><span>${sub}</span>${extra}</div>`;
  const bar = p => `<div class="tv-barra"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
  const nfConf = T.nfs ? new Set(T.nfs.filter(x => !x.adiantamento_id && x.status === 'conferida').map(x => x.parceiro_id)) : null;
  const semNf = nfConf ? L.filter(r => r.valor_aprovado != null && !r.pago_em && !nfConf.has(r.parceiro_id)).length : null;
  $('#tv-kpis').innerHTML =
    kpi(varM != null && varM > 0.02 ? 'critico' : 'neutro', `Custo · ${nomeMes(c.mes)}`, BRLk(total), varM != null ? `${pctTxt(varM)} sobre ${nomeMes(ant.mes)} (${BRLk(totAnt)})` : 'primeiro mês da série') +
    kpi(ader == null ? 'neutro' : ader <= 1 ? 'ok' : 'critico', 'Malote · previsto × realizado', ader == null ? '—' : (ader * 100).toFixed(1).replace('.', ',') + '%', `${BRLk(malote)} pagos de ${BRLk(prevTot)} previstos`) +
    kpi('ok', 'Economia gerada', BRLk(g.total), `no mês · ${BRLk(gAno)} no ano`) +
    kpi(aprov < parcsMes.size ? 'atencao' : 'ok', 'Fechamento', `${aprov} de ${parcsMes.size}`, `${Math.round(100 * aprov / Math.max(1, parcsMes.size))}% dos parceiros aprovados`, bar(100 * aprov / Math.max(1, parcsMes.size))) +
    kpi(pago >= total - 1 ? 'ok' : 'atencao', 'Pagamento', BRLk(pago), `pago · ${BRLk(emLote)} em lote${semLote ? ` · ${BRLk(semLote)} sem lote` : ''}${semNf ? ` · ${semNf} sem NF` : ''}`, bar(total ? 100 * pago / total : 0)) +
    kpi(cpa == null ? 'neutro' : cpaAnt && cpa > cpaAnt * 1.02 ? 'critico' : 'ok', 'Custo por atendimento', cpa == null ? '—' : cpa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), cpa == null ? 'sem a contagem de atendimentos' : `${atM.toLocaleString('pt-BR')} atendimentos${cpaAnt ? ` · ${pctTxt(cpa / cpaAnt - 1)} sobre ${nomeMes(ant.mes)}` : ''}`);
  // dados da lâmina de pagamentos e praças
  const pm = Object.fromEntries(D.parcs.map(p => [p.id, p])); const antPor = ant ? Object.fromEntries(doMes(ant.id).map(r => [r.parceiro_id, valor(r)])) : {};
  const prevPor = Object.fromEntries(prevMes(c.id).map(r => [r.parceiro_id, n(r.previsto)]));
  S.tvLinhasDir = L.map(r => { const v = valor(r), a = antPor[r.parceiro_id] ?? null; return { p: pm[r.parceiro_id], v, a, d: a == null ? null : v - a, prev: prevPor[r.parceiro_id], r }; })
    .filter(x => x.p).sort((x, y) => Math.abs(y.d ?? y.v) - Math.abs(x.d ?? x.v));
  S.tvSemLote = semLote; S.tvLotesMes = L;
  tvSlide(S.tvSl || 0); tvRodar();
  const desc = L.reduce((a, r) => a + n(r.descontos), 0); const kits = L.reduce((a, r) => a + n(r.kits), 0); const extras = L.reduce((a, r) => a + Math.max(0, n(r.fora_umov)), 0);
  $('#tv-rodape').innerHTML = [['neutro', `Malote ${BRLk(malote)}`], ['atencao', `Entregas avulsas (kits) ${BRLk(kits)}`], ['atencao', `Serviços extras ${BRLk(extras)}`], ['ok', `Descontos ${BRLk(Math.abs(desc))}`],
    ['neutro', `Custo no ano ${BRLk(custoAno)} · média ${BRLk(custoAno / Math.max(1, mesesAno))}/mês`], ['ok', `Economia no ano ${BRLk(gAno)}`], ['neutro', `Atualiza a cada 10 min · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`]].map(([cl, t]) => `<span class="${cl}"><i></i>${t}</span>`).join('');
}
function tvDirPagamentos() {
  const T = S.tvDir, L = S.tvLotesMes || []; const n = v => Number(v) || 0; const hoje = isoDia(new Date());
  const ST = { gerado: ['Gerado', 'atencao'], enviado: ['Com o financeiro', 'atencao'], pago: ['Pago', 'ok'] };
  $('#tv-lotes').innerHTML = T.lotes.length ? `<table><thead><tr><th>Data</th><th>Lote</th><th class="n">Parceiros</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
    ${T.lotes.map(l => { const nP = L.filter(r => r.lote_id === l.id).length; const st = ST[l.status] || [l.status, 'neutro']; const atras = l.status !== 'pago' && l.data_pagamento < hoje;
      return `<tr><td>${fmtD(l.data_pagamento)}</td><td>${esc(l.rotulo || '')}</td><td class="n">${nP}</td><td class="n">${BRL(n(l.total))}</td><td><span class="tv-sit ${atras ? 'critico' : st[1]}">${atras ? 'Vencido' : st[0]}</span></td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>Total em lotes</b></td><td class="n"><b>${BRL(T.lotes.reduce((a, l) => a + n(l.total), 0))}</b></td><td></td></tr></tfoot></table>
    ${S.tvSemLote ? `<p class="tv-pag" style="text-align:left">Aprovados ainda sem lote: ${BRL(S.tvSemLote)}</p>` : ''}` : '<div class="tv-vazio">Nenhum lote de pagamento gerado para o mês.</div>';
  S.tvPag = 0; tvDirTabela(14);
}
function tvDirTabela(porPagFixo) {
  const box = $('#tv-tabela'); if (!box) return; const L = S.tvLinhasDir || [];
  const porPag = porPagFixo || Math.max(5, Math.floor((box.clientHeight || 360) / 38) - 1); const pags = Math.max(1, Math.ceil(L.length / porPag)); const pg = S.tvPag % pags;
  const sit = r => r.pago_em ? ['ok', 'Pago'] : r.lote_id ? ['atencao', 'Em lote'] : r.valor_aprovado != null ? ['atencao', 'Aprovado'] : ['critico', 'Em fechamento'];
  box.innerHTML = `<table><thead><tr><th>Praça · parceiro</th><th>Tipo</th><th class="n">Mês anterior</th><th class="n">Este mês</th><th class="n">Variação</th><th class="n">Var. %</th><th class="n">Previsto</th><th class="n">% do previsto</th><th>Situação</th></tr></thead><tbody>
    ${L.slice(pg * porPag, (pg + 1) * porPag).map(x => { const s = sit(x.r); const vp = x.prev ? x.v / x.prev : null;
      return `<tr><td>${esc(x.p.regiao)} · ${esc(x.p.nome)}</td><td>${esc(x.p.tipo || '')}</td><td class="n">${x.a == null ? '—' : BRL(x.a)}</td><td class="n">${BRL(x.v)}</td>
      <td class="n">${x.d == null ? '<em class="atencao">novo</em>' : `<em class="${x.d > 0 ? 'critico' : x.d < 0 ? 'ok' : ''}" style="${x.d < 0 ? 'color:var(--tv-ok)' : ''}">${x.d > 0 ? '+' : ''}${BRL(x.d)}</em>`}</td>
      <td class="n">${x.a ? `${x.d > 0 ? '+' : ''}${(100 * x.d / x.a).toFixed(1).replace('.', ',')}%` : '—'}</td><td class="n">${x.prev ? BRL(x.prev) : '—'}</td>
      <td class="n">${vp == null ? '—' : `<em class="${vp > 1.02 ? 'critico' : ''}">${Math.round(vp * 100)}%</em>`}</td><td><span class="tv-sit ${s[0]}">${s[1]}</span></td></tr>`; }).join('')}</tbody></table>
    ${L.length > porPag ? `<div class="tv-pag">${porPag} maiores variações de ${L.length} praças</div>` : ''}`;
}
