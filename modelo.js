// Gera o modelo GSM do relatório mensal do parceiro (ExcelJS, no navegador).
// Células rosa = o parceiro preenche. Células bege = vêm da GSM e ficam travadas.
export const VERSAO_MODELO = 'GSM-REL-2';
const SENHA = 'GSM2026';
const C = { ink: 'FF121112', brand: 'FFDB2242', wash: 'FFFBEAEE', paper: 'FFF6F5F2', rule: 'FFDDDCDA', muted: 'FF6E6E72', white: 'FFFFFFFF' };
const FONT = 'Poppins';
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const borda = { bottom: { style: 'thin', color: { argb: C.rule } } };
const SERVICOS = ['Redespacho', 'Diária', 'Reversa', 'Embarque', 'Outro'];

function cabecalho(ws, cols, linha) {
  const r = ws.getRow(linha);
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    cell.value = c.t;
    cell.font = { name: FONT, bold: true, color: { argb: C.white }, size: 10 };
    cell.fill = fill(C.ink);
    cell.alignment = { vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = c.w;
  });
  r.height = 30;
}
function titulo(ws, texto, sub) {
  ws.getCell('A1').value = texto;
  ws.getCell('A1').font = { name: FONT, bold: true, size: 15, color: { argb: C.ink } };
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { name: FONT, size: 10, color: { argb: C.muted } };
}
function celula(cell, entrada, fmt) {
  cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
  cell.fill = fill(entrada ? C.wash : C.paper);
  cell.border = borda;
  cell.protection = { locked: !entrada };
  if (fmt) cell.numFmt = fmt;
}
const BRL = '"R$" #,##0.00';

export async function gerarModelo({ parceiro, comp, nomeMes, pontos, umovPonto, kits, contrato }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal de Fechamento GSM';
  wb.created = new Date();

  // Leia-me / Resumo
  const lm = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: C.brand } }, views: [{ showGridLines: false }] });
  lm.getColumn(1).width = 34; lm.getColumn(2).width = 22; lm.getColumn(3).width = 60;
  titulo(lm, `Relatório mensal · ${nomeMes}`, `${parceiro.codigo} · ${parceiro.regiao} · ${parceiro.nome}`);
  const linhasResumo = [
    ['Malote · valor fixo do contrato', contrato || 0, 'Valor fixo cadastrado na GSM (0 quando não há).'],
    ['Malote · atendimentos', { formula: "SUM(Malote!K:K)" }, 'Soma da coluna Valor da aba Malote.'],
    ['Kits/Spot', { formula: "SUM('Kits-Spot'!H:H)" }, 'Soma da coluna Valor da aba Kits-Spot.'],
    ['Fora do Umov', { formula: "SUM('Fora do Umov'!F:F)" }, 'Redespacho, diária, reversa, embarque e outros.'],
    ['Total do relatório', { formula: 'SUM(B4:B7)' }, 'Valor que você está informando para o mês.'],
  ];
  linhasResumo.forEach((l, i) => {
    const r = lm.getRow(4 + i);
    r.getCell(1).value = l[0]; r.getCell(2).value = l[1]; r.getCell(3).value = l[2];
    [1, 2, 3].forEach(c => celula(r.getCell(c), false));
    r.getCell(2).numFmt = BRL;
    r.getCell(3).font = { name: FONT, size: 9, color: { argb: C.muted } };
    if (i === 4) { r.getCell(1).font = { name: FONT, bold: true, size: 11 }; r.getCell(2).font = { name: FONT, bold: true, size: 11 }; }
  });
  const instr = [
    'Como preencher',
    '1. Malote: confira a coluna "Realizado". Ela já vem com o que o Umov registrou como retornado de campo. Altere só se você fez diferente e explique em "Observação".',
    '2. Kits-Spot: os kits que o Umov registrou para você já estão listados. Preencha volumes e valor. Kits que não aparecem no Umov vão nas linhas em branco, com a referência ou o comprovante.',
    '3. Fora do Umov: serviços que não passam pelo Umov (redespacho, diária, reversa, embarque). Use uma linha por serviço.',
    '4. Preencha apenas as células rosa. Não mude nomes de abas nem a ordem das colunas.',
    '5. Salve e envie este mesmo arquivo pelo portal. A conferência com o Umov é automática.',
  ];
  instr.forEach((t, i) => {
    const c = lm.getCell(`A${11 + i}`); c.value = t;
    c.font = i === 0 ? { name: FONT, bold: true, size: 11 } : { name: FONT, size: 10 };
    lm.mergeCells(`A${11 + i}:C${11 + i}`); c.alignment = { wrapText: true, vertical: 'top' };
    lm.getRow(11 + i).height = i === 0 ? 20 : 30;
  });

  // Malote
  const ml = wb.addWorksheet('Malote', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titulo(ml, 'Malote', 'Pontos da sua carteira no mês. "No Umov" = atendimentos retornados de campo.');
  cabecalho(ml, [
    { t: 'Cod. Int', w: 13 }, { t: 'Cliente', w: 22 }, { t: 'Loja', w: 34 }, { t: 'Cidade', w: 18 }, { t: 'UF', w: 5 },
    { t: 'Frequência', w: 16 }, { t: 'Previsto', w: 9 }, { t: 'No Umov', w: 9 }, { t: 'V. Unit', w: 11 },
    { t: 'Realizado', w: 10 }, { t: 'Valor', w: 12 }, { t: 'Observação', w: 34 },
  ], 4);
  pontos.forEach((p, i) => {
    const n = 5 + i; const r = ml.getRow(n);
    const umov = umovPonto[p.cod_int] ?? 0;
    const vals = [p.cod_int, p.cliente, p.loja, p.cidade, p.uf, p.frequencia, p.previsto, umov, Number(p.v_unit) || 0, umov, { formula: `J${n}*I${n}` }, null];
    vals.forEach((v, c) => { r.getCell(c + 1).value = v; celula(r.getCell(c + 1), c === 9 || c === 11, c === 8 || c === 10 ? BRL : null); });
  });

  // Kits-Spot
  const kt = wb.addWorksheet('Kits-Spot', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titulo(kt, 'Kits e Spot', 'As primeiras linhas vêm do Umov. Use as linhas em branco para kits que não aparecem lá.');
  cabecalho(kt, [
    { t: 'Ref. Umov', w: 13 }, { t: 'Data', w: 11 }, { t: 'Kit / Cliente', w: 30 }, { t: 'Destino', w: 36 }, { t: 'Cidade', w: 18 },
    { t: 'Status no Umov', w: 20 }, { t: 'Volumes', w: 9 }, { t: 'Valor', w: 12 }, { t: 'Comprovante', w: 22 }, { t: 'Observação', w: 30 },
  ], 4);
  let n = 5;
  kits.forEach(k => {
    const r = kt.getRow(n);
    const data = k.data_final || k.data_prevista;
    const vals = [k.id_umov, data ? new Date(data) : null, k.grupo_cliente, k.cliente, k.cidade, k.status_gsm, null, null, null, null];
    vals.forEach((v, c) => { r.getCell(c + 1).value = v; celula(r.getCell(c + 1), c >= 6, c === 1 ? 'dd/mm/yyyy' : c === 7 ? BRL : null); });
    n++;
  });
  for (let i = 0; i < 150; i++, n++) {
    const r = kt.getRow(n);
    for (let c = 1; c <= 10; c++) { celula(r.getCell(c), c !== 6, c === 2 ? 'dd/mm/yyyy' : c === 8 ? BRL : null); }
  }

  // Fora do Umov
  const fu = wb.addWorksheet('Fora do Umov', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titulo(fu, 'Fora do Umov', 'Serviços que não passam pelo Umov. Um serviço por linha, com comprovante.');
  cabecalho(fu, [
    { t: 'Data', w: 11 }, { t: 'Serviço', w: 14 }, { t: 'Descrição', w: 40 }, { t: 'Quantidade', w: 11 },
    { t: 'Valor unit.', w: 12 }, { t: 'Valor total', w: 13 }, { t: 'Comprovante', w: 22 }, { t: 'Observação', w: 30 },
  ], 4);
  for (let i = 0; i < 80; i++) {
    const m = 5 + i; const r = fu.getRow(m);
    for (let c = 1; c <= 8; c++) celula(r.getCell(c), c !== 6, c === 1 ? 'dd/mm/yyyy' : (c === 5 || c === 6) ? BRL : null);
    r.getCell(6).value = { formula: `IF(D${m}="","",D${m}*E${m})` };
    r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${SERVICOS.join(',')}"`] };
  }

  // Identificação (oculta) para o portal reconhecer o arquivo
  const id = wb.addWorksheet('_gsm', { state: 'veryHidden' });
  [['modelo', VERSAO_MODELO], ['parceiro_id', parceiro.id], ['parceiro_codigo', parceiro.codigo], ['competencia_id', comp.id],
   ['competencia', comp.mes], ['gerado_em', new Date().toISOString()], ['pontos', pontos.length], ['kits_umov', kits.length]]
    .forEach((l, i) => { id.getCell(`A${i + 1}`).value = l[0]; id.getCell(`B${i + 1}`).value = String(l[1]); });

  for (const ws of [lm, ml, kt, fu]) {
    await ws.protect(SENHA, { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, autoFilter: true, sort: false });
  }
  ml.autoFilter = { from: 'A4', to: 'L4' };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
