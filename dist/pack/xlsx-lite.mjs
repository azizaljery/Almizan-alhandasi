// كاتب XLSX صغير بلا مكتبات (نقي: بلا DOM): يولّد أجزاء OOXML (SpreadsheetML) نصوصًا تُجمع في ZIP عبر zip-lite.
// يدعم: أوراقًا متعددة، اتجاه من اليمين لليسار، عرض الأعمدة، تجميد الترويسة، أرقامًا كأرقام، معادلات، وأنماطًا محدودة.
// الخلية: رقم | نص | null | { v?, f?, s? } — f معادلة بلا «=»، وs اسم نمط من STYLES. المعادلات تُكتب بلا قيمة مخزّنة ويحسبها
// البرنامج عند الفتح (fullCalcOnLoad).
import { zipBuild } from './zip-lite.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
/** أسماء الأنماط → فهرس cellXfs. */
export const STYLES = Object.freeze({ default: 0, head: 1, text: 2, num: 3, int: 4, total: 5, totalText: 6, input: 7, note: 8, title: 9, key: 10 });
export const colName = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
export const cellRef = (col, row) => colName(col) + (row + 1);
const sheetName = s => String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF6B6559"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF0F3D33"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F3D33"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE6D2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB9AE98"/></left><right style="thin"><color rgb="FFB9AE98"/></right><top style="thin"><color rgb="FFB9AE98"/></top><bottom style="thin"><color rgb="FFB9AE98"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1" readingOrder="2"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1" readingOrder="2"/></xf>
<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment readingOrder="2"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1" readingOrder="2"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * @param {{name:string, rtl?:boolean, cols?:number[], freezeRows?:number, rows:Array<Array<any>>, merges?:string[]}[]} sheets
 * @returns {{ parts: {name:string, text:string}[] }} أجزاء الملف بترتيب OOXML ([Content_Types].xml أولًا)
 */
export function xlsxParts(sheets, { title = '', creator = 'الميزان الهندسي', created = new Date() } = {}) {
  if (!sheets?.length) throw new Error('XLSX: لا أوراق');
  const strings = [], index = new Map(); let refs = 0;
  const sst = s => { const k = String(s); refs++; if (!index.has(k)) { index.set(k, strings.length); strings.push(k); } return index.get(k); };
  const names = []; for (const s of sheets) { let n = sheetName(s.name), k = 2; while (names.includes(n)) n = sheetName(s.name).slice(0, 28) + ' ' + k++; names.push(n); }
  const sheetXml = s => {
    const rowsXml = s.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return '';
        const o = typeof cell === 'object' ? cell : { v: cell }, ref = cellRef(c, r);
        const isNum = typeof o.v === 'number' && Number.isFinite(o.v);
        const st = STYLES[o.s] ?? (o.f || isNum ? STYLES.num : STYLES.text), sa = st ? ` s="${st}"` : '';
        if (o.f) return `<c r="${ref}"${sa}><f>${esc(o.f)}</f></c>`;
        if (isNum) return `<c r="${ref}"${sa}><v>${o.v}</v></c>`;
        if (o.v === null || o.v === undefined || o.v === '') return `<c r="${ref}"${sa}/>`;
        return `<c r="${ref}"${sa} t="s"><v>${sst(o.v)}</v></c>`;
      }).join('');
      return `<row r="${r + 1}"${s.heights?.[r] ? ` ht="${s.heights[r]}" customHeight="1"` : ''}>${cells}</row>`;
    }).join('');
    const fr = s.freezeRows || 0;
    const view = `<sheetViews><sheetView workbookViewId="0"${s.rtl === false ? '' : ' rightToLeft="1"'}>${fr ? `<pane ySplit="${fr}" topLeftCell="A${fr + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>` : ''}</sheetView></sheetViews>`;
    const cols = s.cols?.length ? `<cols>${s.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rowsXml}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/></worksheet>`;
  };
  const sheetsXml = sheets.map(sheetXml); // يملأ جدول النصوص المشتركة
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', iso = (created instanceof Date ? created : new Date(created)).toISOString().replace(/\.\d+Z$/, 'Z');
  const parts = [
    { name: '[Content_Types].xml', text: X + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', text: X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'docProps/core.xml', text: X + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', text: X + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Al-Mizan Al-Handasi</Application></Properties>` },
    { name: 'xl/workbook.xml', text: X + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    ...sheetsXml.map((text, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text })),
    { name: 'xl/styles.xml', text: STYLES_XML },
    { name: 'xl/sharedStrings.xml', text: X + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${refs}" uniqueCount="${strings.length}">${strings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>` },
  ];
  return { parts, sheetNames: names };
}
/** ملف xlsx كاملًا (Uint8Array). */
export async function xlsxBuild(sheets, opts = {}) {
  const { parts } = xlsxParts(sheets, opts);
  return zipBuild(parts.map(p => ({ name: p.name, text: p.text })), { date: opts.created instanceof Date ? opts.created : new Date() });
}
export default { xlsxParts, xlsxBuild, STYLES, colName, cellRef };
