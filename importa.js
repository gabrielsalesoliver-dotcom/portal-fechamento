// Importa o relatório do parceiro em qualquer formato de planilha e casa cada linha com a base do mês:
// malote pelo código de integração ou por palavras-chave da loja; kits/spots pelo número (NF, pedido, kit) ou pelo nome.

const SEM_ACENTO = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const N = s => SEM_ACENTO(s).toLowerCase().replace(/\s+/g, ' ').trim();
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'sp', 'mg', 'pe', 'rj', 'ba', 'pr', 'sc', 'rs', 'go', 'df', 'es', 'ce', 'al', 'pb', 'rn', 'pi', 'ma', 'pa', 'am', 'mt', 'ms', 'se', 'to', 'ro',
  'ltda', 'sa', 'me', 'epp', 'eireli', 'lj', 'loja', 'filial', 'kit', 'kits', 'spot', 'malote', 'sn', 'cia', 'comercial', 'comercio', 'brasil', 'do brasil', 'servicos', 'shop', 'shopping']);
const tokens = s => N(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 2 && !PARADAS.has(t)).map(t => /^\d+$/.test(t) ? String(+t) : t.replace(/([a-z])0+(\d)/g, '$1$2'));
const numeros = s => [...new Set((N(s).match(/\d{3,}/g) || []).map(x => String(+x)))];

export function numBR(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/r\$|\s/gi, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? n : null;
}

// Cabeçalhos reconhecidos (comparados sem acento, em minúsculas)
const COLS = [
  ['cod', h => /^c[o]?d(igo)?\.?\s*(de\s*)?int/.test(h) || /^cod(igo)?\.?$/.test(h) || h === 'cod int' || /integra/.test(h)],
  ['vu', h => /(valor|v\.?)\s*unit/.test(h) || h === 'unitario'],
  ['qtd', h => /atend/.test(h) || /^qtd|^qtde|^quantidade|^realizado|^extra$|^volumes?$/.test(h)],
  ['total', h => /valor\s*(periodo|total|final|mensal)|^mensal$|^total( geral)?$|^valor a pagar/.test(h)],
  ['valor', h => /^valor$|^r\$$|^preco/.test(h)],
  ['nf', h => /^(nf|n\.?f\.?|nota|minutas?|pedido|ref|referencia|id umov)\b/.test(h)],
  ['loja', h => /^(loja|unidade|ponto|local|nome|descri|destinatario|estabelecimento)/.test(h)],
  ['cliente', h => /^cliente/.test(h)],
  ['cidade', h => /^(cidade|destino|municipio)/.test(h)],
  ['obs', h => /^obs/.test(h)],
  ['data', h => /^data/.test(h)],
];
function acharCabecalho(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i] || []; const map = {}; let n = 0;
    r.forEach((c, j) => { const h = N(c); if (!h) return; for (const [k, f] of COLS) if (map[k] == null && f(h)) { map[k] = j; n++; break; } });
    const temNome = map.loja != null || map.cliente != null;
    if (n >= 3 && temNome && (map.qtd != null || map.total != null || map.valor != null || map.vu != null)) return { linha: i, map };
  }
  return null;
}
const IGNORAR = /^(total|subtotal|contrato|operacao extra|valor total|soma)/;

export function lerLinhas(sheets, mesRef) {
  const abas = []; const linhas = [];
  for (const [nome, rows] of Object.entries(sheets)) {
    const cab = acharCabecalho(rows);
    if (!cab) { abas.push({ nome, reconhecida: false, linhas: 0 }); continue; }
    const m = cab.map; let n = 0; const meses = {};
    for (let i = cab.linha + 1; i < rows.length; i++) {
      const r = rows[i] || []; const g = k => m[k] == null ? null : r[m[k]];
      const loja = String(g('loja') ?? '').trim(), cliente = String(g('cliente') ?? '').trim();
      const nomeL = loja || cliente; const cod = g('cod') == null ? '' : String(g('cod')).trim().replace(/\.0$/, '');
      if (!nomeL && !cod) continue;
      if (IGNORAR.test(N(nomeL))) continue;
      let qtd = numBR(g('qtd')), vu = numBR(g('vu')), total = numBR(g('total')); const valor = numBR(g('valor'));
      if (vu == null && valor != null && (total != null || qtd != null)) vu = total != null && qtd == null ? null : valor;
      if (total == null && valor != null && vu == null) total = valor;
      if (qtd == null && vu && total != null) qtd = Math.round(total / vu * 100) / 100;
      if (total == null && qtd != null && vu != null) total = qtd * vu;
      if (vu == null && qtd && total != null) vu = total / qtd;
      if (total == null && qtd == null) continue;
      const nf = g('nf') == null ? '' : String(g('nf')).trim();
      const texto = [nomeL, loja && cliente && N(cliente) !== N(loja) ? cliente : '', nf].filter(Boolean).join(' · ');
      (N(texto).match(/\b(0?[1-9]|1[0-2])\/20\d\d\b/g) || []).forEach(x => { const k = x.replace(/^0/, ''); meses[k] = (meses[k] || 0) + 1; });
      linhas.push({ aba: nome, linha: i + 1, cod, loja: nomeL, cliente, nf, cidade: String(g('cidade') ?? '').trim(), qtd, vu, total: total ?? 0, obs: String(g('obs') ?? '').trim(), texto });
      n++;
    }
    const outro = mesRef ? Object.entries(meses).filter(([k]) => k !== mesRef).reduce((a, [, v]) => a + v, 0) : 0;
    abas.push({ nome, reconhecida: true, linhas: n, outroMes: outro >= Math.max(3, n * 0.3), colunas: Object.keys(m) });
  }
  return { abas, linhas };
}

// Pontuação por palavras-chave: números pesam mais; número do relatório que não aparece no ponto derruba a nota
function nota(rt, alvoSet) {
  let peso = 0, ok = 0, numFalta = false;
  for (const t of rt) { const w = /^\d+$/.test(t) ? (t.length >= 3 ? 3 : 1.5) : 1; peso += w;
    if (alvoSet.has(t)) ok += w;
    else if (/^\d{3,}$/.test(t)) numFalta = true;
    else if (t.length >= 3 && !/^\d+$/.test(t) && [...alvoSet].some(a => a.length > t.length && a.includes(t))) ok += w * 0.75; }
  if (!peso) return 0; const s = ok / peso; return numFalta ? s * 0.5 : s;
}

export function casar(linhas, ctx) {
  const { pontos, kits } = ctx;
  const ptsTok = pontos.map(p => ({ p, set: new Set(tokens(`${p.loja} ${p.cliente} ${p.cidade}`)) }));
  const porCod = Object.fromEntries(pontos.map(p => [String(p.cod_int), p]));
  const kitsU = []; const visto = new Set(); kits.forEach(k => { if (!visto.has(k.id_umov)) { visto.add(k.id_umov); kitsU.push(k); } });
  const kitNum = kitsU.map(k => ({ k, nums: new Set([...numeros(k.cliente), String(+k.id_umov)]), set: new Set(tokens(`${k.cliente} ${k.cidade}`)) }));
  const usoPonto = {}, usoKit = {};
  const res = linhas.map(l => {
    const r = { ...l, tipo: null, alvo: null, conf: null, kitsExtra: [], aviso: [] };
    const t = N(`${l.loja} ${l.cliente} ${l.nf} ${l.aba}`);
    const pareceSpot = /\b(kit|kits|spot|minuta|ecobag|brinde)\b/.test(t) || /spot|kit|extra/i.test(l.aba) || (numeros(l.nf).length > 0 && !/malote/.test(N(l.nf)));
    // 1) malote
    if (!pareceSpot) {
      const p = l.cod ? (porCod[l.cod] || porCod[String(+l.cod)]) : null;
      if (p) { r.tipo = 'malote'; r.alvo = p; r.conf = 'código'; }
      else {
        const rt = tokens(`${l.loja} ${l.cliente} ${l.cidade}`);
        const sc = ptsTok.map(x => ({ p: x.p, s: nota(rt, x.set) })).sort((a, b) => b.s - a.s);
        if (sc[0] && sc[0].s >= 0.7 && (!sc[1] || sc[1].s <= sc[0].s - 0.1)) { r.tipo = 'malote'; r.alvo = sc[0].p; r.conf = sc[0].s >= 0.9 ? 'nome' : 'nome (conferir)'; }
        else if (sc[0] && sc[0].s >= 0.7) { r.aviso.push(`parecido com mais de um ponto (ex.: ${sc[0].p.loja} / ${sc[1].p.loja})`); }
      }
      if (r.tipo === 'malote') {
        const cod = r.alvo.cod_int; if (usoPonto[cod]) { r.tipo = 'duplicado'; r.aviso.push(`ponto já cobrado na linha ${usoPonto[cod]}`); } else usoPonto[cod] = `${l.aba}:${l.linha}`;
        return r;
      }
      r.tipo = 'fora'; return r; // linha de malote sem ponto na carteira: nunca vira kit
    }
    // 2) kit do Umov pelo número (NF, pedido, kit) ou pelo nome
    const nums = numeros(`${l.loja} ${l.cliente} ${l.nf}`);
    let achados = nums.length ? kitNum.filter(x => [...x.nums].some(n => nums.includes(n))).map(x => x.k) : [];
    if (!achados.length) {
      const rt = tokens(`${l.loja} ${l.cliente} ${l.cidade}`);
      const sc = kitNum.filter(x => !usoKit[x.k.id_umov]).map(x => ({ k: x.k, s: nota(rt, x.set) })).sort((a, b) => b.s - a.s);
      if (sc[0] && sc[0].s >= 0.8 && (!sc[1] || sc[1].s <= sc[0].s - 0.1)) { achados = [sc[0].k]; r.conf = 'nome (conferir)'; }
    } else r.conf = 'número';
    if (achados.length) {
      const livres = achados.filter(k => !usoKit[k.id_umov]);
      if (!livres.length) { r.tipo = 'duplicado'; r.alvo = achados[0]; r.aviso.push(`kit já cobrado na linha ${usoKit[achados[0].id_umov]}`); return r; }
      r.tipo = 'kit'; r.alvo = livres[0]; r.kitsExtra = livres.slice(1);
      livres.forEach(k => usoKit[k.id_umov] = `${l.aba}:${l.linha}`);
      if (livres.some(k => k.situacao !== 'Retornada de Campo')) r.aviso.push('kit ainda não retornado no Umov');
      if (livres.length < achados.length) r.aviso.push('parte dos kits já cobrada em outra linha');
      return r;
    }
    // 3) sem par na base
    r.tipo = pareceSpot ? 'extra' : 'fora';
    return r;
  });
  const naoCobrados = kitsU.filter(k => !usoKit[k.id_umov]);
  return { itens: res, naoCobrados };
}
