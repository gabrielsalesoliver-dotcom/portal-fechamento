// Leitura dos arquivos (roda no navegador; também é testado no computador com Node).
// Nada aqui altera o arquivo original: só lê e devolve as linhas organizadas.

export function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// CSV com ; (ou , / tab), respeitando aspas
export function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

const pad = n => String(n).padStart(2, '0');

// Número de série do Excel -> data
function serialToParts(n) {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes() };
}

// "dd/mm/aaaa hh:mm" (ou série do Excel / Date) -> ISO com fuso de Brasília
export function brDateTime(v) {
  if (v == null || v === '') return null;
  let p;
  if (v instanceof Date) p = { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), H: v.getHours(), M: v.getMinutes() };
  else if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; p = serialToParts(v); }
  else {
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (!m) return null;
    p = { d: +m[1], m: +m[2], y: +m[3], H: +(m[4] || 0), M: +(m[5] || 0) };
  }
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31) return null;
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.H)}:${pad(p.M)}:00-03:00`;
}

// Só a data (aaaa-mm-dd). Devolve null quando é texto livre.
export function brDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; const p = serialToParts(v); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function codigo(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim().replace(/\.0+$/, '');
}

// ---------- Umov: Listagem de atendimentos ----------
const UMOV_COLS = {
  motorista: ['motorista'],
  grupo: ['grupo cliente'],
  ident: ['identificador alternativo'],
  cliente: ['cliente'],
  prevista: ['data hora prevista inicial'],
  final: ['data hora real final'],
  situacao: ['situacao'],
  status: ['status gsm'],
  cidade: ['cidade'],
  bairro: ['bairro'],
  uf: ['estado'],
  responsavel: ['responsavel'],
  frequencia: ['frequencia'],
};
const UMOV_OBRIG = ['motorista', 'grupo', 'ident', 'cliente', 'situacao'];

export function parseUmov(rows) {
  const hi = rows.findIndex(r => r.map(norm).includes('motorista') && r.map(norm).includes('grupo cliente'));
  if (hi < 0) return { erro: 'Não encontrei o cabeçalho do Umov (colunas "Motorista" e "Grupo Cliente").' };
  const head = rows[hi].map(norm);
  const idx = {};
  for (const [k, names] of Object.entries(UMOV_COLS)) idx[k] = head.findIndex(h => names.includes(h));
  const faltando = UMOV_OBRIG.filter(k => idx[k] < 0);
  if (faltando.length) return { erro: 'Faltam colunas obrigatórias no arquivo: ' + faltando.map(k => UMOV_COLS[k][0]).join(', ') };
  const get = (r, k) => (idx[k] >= 0 ? r[idx[k]] : null);
  const txt = (r, k) => { const v = get(r, k); return v == null ? null : (String(v).trim() || null); };
  const out = []; const avisos = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const grupo = txt(r, 'grupo') || '';
    const ident = codigo(get(r, 'ident'));
    const tipo = grupo.toUpperCase().startsWith('KIT') ? 'kit' : 'carteira';
    const prev = brDateTime(get(r, 'prevista'));
    if (!ident) avisos.push(`Linha ${i + 1}: sem Identificador Alternativo`);
    if (get(r, 'prevista') && !prev) avisos.push(`Linha ${i + 1}: data prevista ilegível (${get(r, 'prevista')})`);
    out.push({
      linha: i + 1,
      tipo,
      id_umov: ident || null,
      cod_int: tipo === 'carteira' ? (ident || null) : null,
      motorista: txt(r, 'motorista'),
      grupo_cliente: grupo || null,
      cliente: txt(r, 'cliente'),
      data_prevista: prev,
      data_final: brDateTime(get(r, 'final')),
      situacao: txt(r, 'situacao'),
      status_gsm: txt(r, 'status'),
      cidade: txt(r, 'cidade'),
      bairro: txt(r, 'bairro'),
      uf: txt(r, 'uf'),
      responsavel: txt(r, 'responsavel'),
      frequencia: txt(r, 'frequencia'),
    });
  }
  return { registros: out, avisos, cabecalho: hi + 1 };
}

export function resumoUmov(regs, rotaMap) {
  const meses = {}; const rotas = {};
  let malote = 0, kits = 0, ret = 0, semParc = 0;
  for (const r of regs) {
    if (r.tipo === 'kit') kits++; else malote++;
    if (r.situacao === 'Retornada de Campo') ret++;
    const mes = r.data_prevista ? r.data_prevista.slice(0, 7) : 'sem data';
    meses[mes] = (meses[mes] || 0) + 1;
    const key = (r.motorista || '').toUpperCase().trim();
    const rt = rotas[key] || (rotas[key] = { rota: key, n: 0, kits: 0, parceiro: rotaMap ? rotaMap[key] : undefined });
    rt.n++; if (r.tipo === 'kit') rt.kits++;
    if (rotaMap && !rotaMap[key]?.parceiro_id) semParc++;
  }
  return { total: regs.length, malote, kits, ret, semParc, meses, rotas: Object.values(rotas).sort((a, b) => b.n - a.n) };
}

// ---------- Planilha de fechamento: aba Atendimentos (pontos do mês) ----------
// Colunas: Chave, Mês, Cliente, Cod. Int, Loja, Cidade, UF, Frequência, V. Unit, V. Periodo, Qtd atend., Correção, Total, ..., Parceiros, Região
export function parseAtendimentos(rows, regiaoMap) {
  const hi = rows.findIndex(r => r && r.map(norm).includes('cod. int') && r.map(norm).includes('regiao'));
  if (hi < 0) return { erro: 'Não encontrei o cabeçalho da aba Atendimentos (colunas "Cod. Int" e "Região").' };
  const head = rows[hi].map(norm);
  const col = n => head.indexOf(n);
  const I = { cliente: col('cliente'), cod: col('cod. int'), loja: col('loja'), cidade: col('cidade'), uf: col('uf'),
    freq: col('frequencia'), vunit: col('v. unit'), vper: col('v. periodo'), qtd: col('qtd atend.'), corr: col('correcao'), reg: col('regiao') };
  const num = v => (v == null || v === '' ? null : (typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))));
  const txt = v => (v == null ? null : (String(v).trim() || null));
  const pontos = []; const semRegiao = {}; let semCodigo = 0; const vistos = new Set(); let duplicados = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const cod = codigo(r[I.cod]); const reg = txt(r[I.reg]);
    if (!cod && !reg) continue;
    if (!cod) { semCodigo++; continue; }
    const parc = reg ? regiaoMap[norm(reg)] : null;
    if (!parc) { semRegiao[reg || '(vazio)'] = (semRegiao[reg || '(vazio)'] || 0) + 1; continue; }
    const k = parc + '|' + cod;
    if (vistos.has(k)) { duplicados++; continue; }
    vistos.add(k);
    pontos.push({ linha: i + 1, parceiro_id: parc, cod_int: cod, cliente: txt(r[I.cliente]), loja: txt(r[I.loja]), cidade: txt(r[I.cidade]),
      uf: txt(r[I.uf]), frequencia: txt(r[I.freq]), v_unit: num(r[I.vunit]) || 0, v_periodo: num(r[I.vper]),
      previsto: num(r[I.qtd]) == null ? null : Math.round(num(r[I.qtd])), correcao_planilha: num(r[I.corr]) == null ? null : Math.round(num(r[I.corr])),
      regiao_planilha: reg });
  }
  return { pontos, semRegiao, semCodigo, duplicados, cabecalho: hi + 1 };
}

// ---------- Histórico por cliente (planilha de fechamento de um mês) ----------
// Atendimentos: Cliente, Total, Região -> peso de cada cliente no malote do parceiro
// Extras: Tipo (Outros/Malotes = Kits/Spot), Cliente, Custo, Parceiro (nome)
export function parseHistorico(atendRows, extrasRows, regiaoMap, nomeMap) {
  const atend = {}; const kits = {}; const semParceiro = {}; let kitsSem = 0;
  const hiA = atendRows.findIndex(r => r && r.map(norm).includes('cod. int') && r.map(norm).includes('regiao'));
  if (hiA < 0) return { erro: 'Não encontrei o cabeçalho da aba Atendimentos.' };
  const hA = atendRows[hiA].map(norm);
  const ia = { cli: hA.indexOf('cliente'), tot: hA.indexOf('total'), reg: hA.indexOf('regiao') };
  for (let i = hiA + 1; i < atendRows.length; i++) {
    const r = atendRows[i]; if (!r) continue;
    const reg = r[ia.reg]; const cli = String(r[ia.cli] ?? '').trim().toUpperCase(); const t = Number(r[ia.tot]) || 0;
    if (!reg || !cli) continue;
    const p = regiaoMap[norm(reg)];
    if (!p) { semParceiro[reg] = (semParceiro[reg] || 0) + 1; continue; }
    (atend[p] || (atend[p] = {}))[cli] = ((atend[p] || {})[cli] || 0) + t;
  }
  if (extrasRows) {
    const hiE = extrasRows.findIndex(r => r && r.map(norm).includes('custo') && r.map(norm).includes('parceiro'));
    if (hiE >= 0) {
      const hE = extrasRows[hiE].map(norm);
      const ie = { tipo: hE.indexOf('tipo'), cli: hE.indexOf('cliente'), custo: hE.indexOf('custo'), par: hE.indexOf('parceiro') };
      for (let i = hiE + 1; i < extrasRows.length; i++) {
        const r = extrasRows[i]; if (!r) continue;
        const tipo = norm(r[ie.tipo]); const v = Number(r[ie.custo]) || 0;
        if (!v || !(tipo === 'outros' || tipo === 'malotes')) continue;
        const p = nomeMap[norm(r[ie.par])] || regiaoMap[norm(r[ie.par])];
        if (!p) { kitsSem += v; continue; }
        const cli = String(r[ie.cli] ?? '').trim().toUpperCase() || '(sem cliente)';
        (kits[p] || (kits[p] = {}))[cli] = ((kits[p] || {})[cli] || 0) + v;
      }
    }
  }
  return { atend, kits, semParceiro, kitsSem };
}

// ---------- Inclusão e Cancelamento ----------
const CART_COLS = {
  cod_int: c => c.startsWith('codigo de integra'),
  cliente: c => c === 'cliente',
  nomenclatura: c => c === 'nomenclatura',
  tipo_mov: c => c.startsWith('inclusao ou cancelamento'),
  frequencia: c => c === 'frequencia',
  data_solicitacao: c => c.startsWith('data solicita'),
  data_efetiva: c => c.startsWith('data efetiva'),
  uf: c => c === 'uf',
  cidade: c => c === 'cidade',
};

export function parseCarteira(sheets) {
  const movs = []; const vistos = new Set(); const porAba = {}; let duplicadas = 0; let semCodigo = 0; const ignoradas = [];
  for (const [aba, rows] of Object.entries(sheets)) {
    const hi = rows.findIndex(r => r.some(c => norm(c).startsWith('codigo de integra')));
    if (hi < 0) { ignoradas.push(aba); continue; }
    const head = rows[hi].map(norm);
    const idx = {};
    for (const [k, f] of Object.entries(CART_COLS)) idx[k] = head.findIndex(f);
    const st = porAba[aba] = { lidas: 0, gravadas: 0, duplicadas: 0, sem_codigo: 0, alertas: 0 };
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.some(v => v != null && String(v).trim() !== '')) continue;
      st.lidas++;
      const g = k => (idx[k] >= 0 ? r[idx[k]] : null);
      const t = k => { const v = g(k); return v == null ? null : (String(v).replace(/\s+/g, ' ').trim() || null); };
      const cod = codigo(g('cod_int'));
      if (!cod) { st.sem_codigo++; semCodigo++; continue; }
      const dsRaw = g('data_solicitacao'), deRaw = g('data_efetiva');
      const ds = brDate(dsRaw), de = brDate(deRaw);
      const alertas = [];
      let dataTexto = null;
      if (deRaw != null && String(deRaw).trim() !== '' && !de) { dataTexto = String(deRaw).trim(); alertas.push('Data efetiva escrita como texto'); }
      if (dsRaw != null && String(dsRaw).trim() !== '' && !ds) alertas.push('Data de solicitação escrita como texto: ' + String(dsRaw).trim());
      if (!de && !dataTexto) alertas.push('Sem data efetiva');
      const tipo = t('tipo_mov');
      if (!tipo) alertas.push('Sem tipo de movimento');
      const mov = {
        aba, linha: i + 1, cod_int: cod, cliente: t('cliente'), nomenclatura: t('nomenclatura'),
        tipo_mov: tipo, frequencia: t('frequencia'), data_solicitacao: ds, data_efetiva: de, data_texto: dataTexto,
        uf: t('uf'), cidade: t('cidade'), alerta: alertas.length ? alertas.join('; ') : null,
      };
      const chave = [cod, norm(tipo), ds, de, dataTexto, norm(mov.frequencia)].join('|');
      if (vistos.has(chave)) { st.duplicadas++; duplicadas++; continue; }
      vistos.add(chave);
      mov.chave = chave;
      if (mov.alerta) st.alertas++;
      st.gravadas++;
      movs.push(mov);
    }
  }
  return { movimentos: movs, porAba, duplicadas, semCodigo, ignoradas };
}
