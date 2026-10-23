// CSV export helpers. Cells that start with = + - @ (or a tab / carriage return) are prefixed with an apostrophe,
// because a spreadsheet would otherwise run them as formulas, and asset names are typed by users.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows: array of objects; columns: [{ label, value: (row) => cell }] */
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename, text) {
  const blob = new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
