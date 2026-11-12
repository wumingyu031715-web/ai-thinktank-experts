// Domain-only parsing. Free-form Word recognition belongs to the future backend service.
export function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('CSV 引号不完整，请检查文件。');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function toCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => { let v = String(value ?? ''); if (/^[=+@\t\r-]/.test(v)) v = "'" + v; return '"' + v.replaceAll('"', '""') + '"'; }).join(',')).join('\r\n');
}
export function normalizePeople(input, seed, experts, singleId) {
  const people = Array.isArray(input) ? input : input?.people;
  if (!Array.isArray(people) || !people.length) throw new Error('文件中未找到人员与成果，请使用下载的模板。');
  if (people.length > 300) throw new Error('单次最多导入 300 人。');
  let count = 0;
  return people.map(person => {
    const name = singleId ? experts.find(e => e.id === singleId)?.name : String(person.name || '').trim().slice(0, 100);
    if (!name) throw new Error('人员姓名不能为空。');
    const matches = experts.filter(e => e.name === name);
    const entries = (person.entries || []).map(entry => {
      if (++count > 3000) throw new Error('单次最多导入 3000 条成果。');
      if (!seed.order.includes(entry.type)) throw new Error(`未知成果类别：${entry.type}`);
      return { type: entry.type, fields: seed.schemas[entry.type].map((_, i) => String(entry.fields?.[i] ?? '').slice(0, 10000)), enabled: entry.enabled !== false, needsReview: !!entry.needsReview, reviewReason: String(entry.reviewReason || ''), reviewed: !!entry.reviewed };
    });
    return { name, entries, matchedId: singleId || (matches.length === 1 ? matches[0].id : ''), enabled: person.enabled !== false, ambiguous: !singleId && (!!person.ambiguous || !!person.sameFileDuplicate || matches.length > 1) };
  });
}
export function rowsToPeople(rows, seed, singleName) {
  if (rows.length < 2) throw new Error('文件至少需要表头和一行成果。');
  const [headers, ...data] = rows;
  const index = name => headers.findIndex(h => String(h).trim() === name);
  const nameIndex = index('姓名'); const typeIndex = index('成果类别');
  if (nameIndex < 0 && !singleName) throw new Error('模板缺少「姓名」列。');
  if (typeIndex < 0) throw new Error('模板缺少「成果类别」列。');
  const groups = new Map();
  for (const row of data) {
    const name = singleName || String(row[nameIndex] || '').trim();
    if (!name) throw new Error('姓名不能为空。');
    const type = seed.order.find(t => t === row[typeIndex] || seed.names[t] === row[typeIndex]);
    if (!type) throw new Error(`「${name}」的成果类别无效：${row[typeIndex] || '空'}`);
    const fields = seed.schemas[type].map((label, i) => { const pos = index(label); return String(row[pos >= 0 ? pos : index('字段' + (i + 1))] || '').trim(); });
    if (!groups.has(name)) groups.set(name, { name, entries: [] });
    groups.get(name).entries.push({ type, fields });
  }
  return [...groups.values()];
}
export async function parseFile(file, seed, experts, singleId) {
  if (file.size > 10 * 1024 * 1024) throw new Error('单个文件请控制在 10MB 以内。');
  const extension = file.name.split('.').pop().toLowerCase();
  let people;
  if (extension === 'json') people = JSON.parse(await file.text());
  else if (extension === 'csv') people = rowsToPeople(parseCSV(await file.text()), seed, experts.find(e => e.id === singleId)?.name);
  else if (extension === 'xlsx' && globalThis.ExcelJS) {
    const workbook = new globalThis.ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
    const rows = []; workbook.worksheets[0]?.eachRow(row => rows.push(row.values.slice(1).map(v => v?.text || v?.result || v || '')));
    people = rowsToPeople(rows, seed, experts.find(e => e.id === singleId)?.name);
  } else throw new Error('此预览支持模板 CSV、JSON 和 XLSX。Word 与旧版 XLS 的智能识别需接入后台，可点击「体验示例流程」。');
  return normalizePeople(people, seed, experts, singleId);
}
