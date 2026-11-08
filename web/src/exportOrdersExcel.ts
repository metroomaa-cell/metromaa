// Zero-dependency native .xlsx (OpenXML) generator for METRROMA Orders
// Produces genuine Microsoft Excel (.xlsx) workbooks with:
// - Exact columns A to O (including Customer Name & Phone Number)
// - Full-row color coding based on Order Status
// - Preserved leading zeros on BD phone numbers (01XXXXXXXXX)
// - Real numeric cells for Sub Total, Delivery Charge, Discount, and Total (SUM-ready)
// - Frozen header row & auto-fitted column widths

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipStore(files: Array<{ name: string; content: string }>): Uint8Array {
  const enc = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralSize += 46 + e.nameBytes.length;
  }
  const totalSize = localSize + centralSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets: number[] = [];

  // Write Local File Headers + File Data (Method 0 = STORE)
  for (const e of entries) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true);     // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // General purpose bit flag (UTF-8 names)
    view.setUint16(offset + 8, 0, true);      // Compression method (0 = stored)
    view.setUint16(offset + 10, 0, true);     // Last mod file time
    view.setUint16(offset + 12, 0x21, true);  // Last mod file date
    view.setUint32(offset + 14, e.crc, true); // CRC-32
    view.setUint32(offset + 18, e.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, e.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, e.nameBytes.length, true); // File name length
    view.setUint16(offset + 28, 0, true);     // Extra field length
    out.set(e.nameBytes, offset + 30);
    out.set(e.dataBytes, offset + 30 + e.nameBytes.length);
    offset += 30 + e.nameBytes.length + e.dataBytes.length;
  }

  const centralStart = offset;

  // Write Central Directory Headers
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    view.setUint32(offset, 0x02014b50, true); // Central file header signature
    view.setUint16(offset + 4, 20, true);     // Version made by
    view.setUint16(offset + 6, 20, true);     // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(offset + 10, 0, true);     // Compression method (0 = stored)
    view.setUint16(offset + 12, 0, true);     // Last mod file time
    view.setUint16(offset + 14, 0x21, true);  // Last mod file date
    view.setUint32(offset + 16, e.crc, true); // CRC-32
    view.setUint32(offset + 20, e.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 24, e.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 28, e.nameBytes.length, true); // File name length
    view.setUint16(offset + 30, 0, true);     // Extra field length
    view.setUint16(offset + 32, 0, true);     // File comment length
    view.setUint16(offset + 34, 0, true);     // Disk number start
    view.setUint16(offset + 36, 0, true);     // Internal file attributes
    view.setUint32(offset + 38, 0, true);     // External file attributes
    view.setUint32(offset + 42, localOffsets[i], true); // Relative offset of local header
    out.set(e.nameBytes, offset + 46);
    offset += 46 + e.nameBytes.length;
  }

  // Write End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true);      // Number of this disk
  view.setUint16(offset + 6, 0, true);      // Disk where central directory starts
  view.setUint16(offset + 8, entries.length, true);  // Total entries on this disk
  view.setUint16(offset + 10, entries.length, true); // Total entries
  view.setUint32(offset + 12, centralSize, true);    // Size of central directory
  view.setUint32(offset + 16, centralStart, true);   // Offset of central directory
  view.setUint16(offset + 20, 0, true);              // Comment length

  return out;
}

function xmlEscape(val: any): string {
  return String(val ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(idx0: number): string {
  let n = idx0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface StatusTheme {
  key: string;
  bg: string;   // ARGB 8-hex without '#'
  fg: string;   // ARGB 8-hex without '#'
}

const STATUS_THEMES: StatusTheme[] = [
  { key: 'delivered',  bg: 'FFDCFCE7', fg: 'FF14532D' }, // Soft Green
  { key: 'confirmed',  bg: 'FFDBEAFE', fg: 'FF1E3A8A' }, // Soft Blue
  { key: 'approved',   bg: 'FFCCFBF1', fg: 'FF115E59' }, // Soft Teal
  { key: 'shipped',    bg: 'FFF3E8FF', fg: 'FF581C87' }, // Soft Purple
  { key: 'pending',    bg: 'FFFEF9C3', fg: 'FF713F12' }, // Soft Yellow / Amber
  { key: 'hold',       bg: 'FFFFEDD5', fg: 'FF9A3412' }, // Soft Orange
  { key: 'cancelled',  bg: 'FFFEE2E2', fg: 'FF991B1B' }, // Soft Red
  { key: 'return',     bg: 'FFFCE7F3', fg: 'FF9D174D' }, // Soft Rose / Pink
  { key: 'incomplete', bg: 'FFF1F5F9', fg: 'FF334155' }, // Soft Slate Gray
];

export function exportOrdersExcel(
  orders: any[],
  prodMap?: Record<string, any>,
  landingMap?: Record<string, any>,
  filePrefix = 'metrroma-orders'
) {
  if (!Array.isArray(orders) || orders.length === 0) {
    alert('কোনো অর্ডার পাওয়া যায়নি।');
    return;
  }

  // Exact 15 columns (A through O):
  // A. Date | B. Order ID | C. Courier ID | D. Courier Name | E. Product Name | F. Product SKU
  // G. Name | H. Phone Number | I. Address | J. Sub Total | K. Delivery Charge | L. Discount | M. Coupon | N. Total | O. Status
  const headers = [
    'Date',
    'Order ID',
    'Courier ID',
    'Courier Name',
    'Product Name',
    'Product SKU',
    'Name',
    'Phone Number',
    'Address',
    'Sub Total',
    'Delivery Charge',
    'Discount',
    'Coupon',
    'Total',
    'Status',
  ];

  const colWidths = [
    20, // A: Date
    16, // B: Order ID
    18, // C: Courier ID
    16, // D: Courier Name
    36, // E: Product Name
    16, // F: Product SKU
    20, // G: Name
    16, // H: Phone Number
    38, // I: Address
    13, // J: Sub Total
    15, // K: Delivery Charge
    12, // L: Discount
    14, // M: Coupon
    14, // N: Total
    14, // O: Status
  ];

  const allProds = prodMap ? Object.values(prodMap) : [];

  const formatDate = (iso: any) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d
      .toLocaleString('en-GB', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(',', '')
      .toUpperCase();
  };

  const resolveSkuForItem = (o: any, it: any): string => {
    if (it?.sku) return String(it.sku).trim();
    const cleanId = String(it?.id || '').trim();
    const baseId = it?.productId || (cleanId.startsWith('mm-') ? cleanId.split('-').slice(0, 2).join('-') : cleanId);
    const pDirect = (prodMap && (prodMap[cleanId] || prodMap[baseId])) || null;
    if (pDirect) {
      if (it?.variantId && Array.isArray(pDirect.variations)) {
        const v = pDirect.variations.find((x: any) => x.id === it.variantId);
        if (v?.sku) return String(v.sku).trim();
      }
      if (pDirect.sku) return String(pDirect.sku).trim();
    }
    const rawSource = String(o?.source || '').trim();
    const lpSlug =
      String(o?.landing || '').trim() ||
      (rawSource.startsWith('landing_') ? rawSource.slice(8) : rawSource.startsWith('l/') ? rawSource.slice(2) : '');
    const lp = (landingMap && lpSlug && landingMap[lpSlug]) || null;
    if (lp) {
      if (Array.isArray(lp.variants)) {
        const lv = lp.variants.find((v: any) => v.id === it?.variantId || v.id === cleanId);
        if (lv?.sku) return String(lv.sku).trim();
      }
      if (Array.isArray(lp.packages)) {
        const pk = lp.packages.find((k: any) => k.id === cleanId);
        if (pk?.sku) return String(pk.sku).trim();
      }
      if (Array.isArray(lp.productIds) && prodMap) {
        for (const pid of lp.productIds) {
          if (prodMap[pid]?.sku) return String(prodMap[pid].sku).trim();
        }
      }
    }
    const itName = String(it?.name || '').trim().toLowerCase();
    const itImg = String(it?.image || '').trim();
    if (allProds.length > 0) {
      const pMatch = allProds.find(
        (x: any) =>
          (itName && String(x.name || '').trim().toLowerCase() === itName) ||
          (itImg && (x.image === itImg || (Array.isArray(x.images) && x.images.includes(itImg))))
      );
      if (pMatch?.sku) return String(pMatch.sku).trim();
    }
    return '';
  };

  // Build styles.xml
  // Fonts:
  // 0: Default
  // 1: Header (Bold White)
  // For each theme i (0..8):
  //   fontId = 2 + i*2     (normal colored fg)
  //   fontId = 2 + i*2 + 1 (bold colored fg for Total & Status)
  const fontXmlList: string[] = [
    `<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,
  ];
  for (const t of STATUS_THEMES) {
    fontXmlList.push(`<font><sz val="11"/><color rgb="${t.fg}"/><name val="Calibri"/></font>`);
    fontXmlList.push(`<font><b/><sz val="11"/><color rgb="${t.fg}"/><name val="Calibri"/></font>`);
  }

  // Fills:
  // 0: none (mandatory OOXML)
  // 1: gray125 (mandatory OOXML)
  // 2: Header dark indigo (#1E1B4B)
  // 3 + i: Status theme background
  const fillXmlList: string[] = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1E1B4B"/><bgColor indexed="64"/></patternFill></fill>`,
  ];
  for (const t of STATUS_THEMES) {
    fillXmlList.push(
      `<fill><patternFill patternType="solid"><fgColor rgb="${t.bg}"/><bgColor indexed="64"/></patternFill></fill>`
    );
  }

  // CellXfs:
  // 0: Default
  // 1: Header style
  // For each theme i (0..8), 4 style variants at base = 2 + i*4:
  //   base + 0: Normal text cell (left, v-center)
  //   base + 1: Wrapped text cell for Product Name & Address (left, v-center, wrapText)
  //   base + 2: Number cell (right, v-center, #,##0)
  //   base + 3: Bold cell for Total & Status (right/center, v-center, bold)
  //   (Actually let's give Total bold number base+3 and Status bold centered text base+4 -> 5 per theme!)
  const xfXmlList: string[] = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`,
  ];
  for (let i = 0; i < STATUS_THEMES.length; i++) {
    const normFont = 2 + i * 2;
    const boldFont = 2 + i * 2 + 1;
    const fillId = 3 + i;
    // +0: Standard text
    xfXmlList.push(
      `<xf numFmtId="0" fontId="${normFont}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
    );
    // +1: Wrapped text (Product Name, Address)
    xfXmlList.push(
      `<xf numFmtId="0" fontId="${normFont}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>`
    );
    // +2: Currency / integer number (Sub Total, Delivery, Discount)
    xfXmlList.push(
      `<xf numFmtId="3" fontId="${normFont}" fillId="${fillId}" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
    );
    // +3: Bold number (Total)
    xfXmlList.push(
      `<xf numFmtId="3" fontId="${boldFont}" fillId="${fillId}" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
    );
    // +4: Bold centered status badge text (Status)
    xfXmlList.push(
      `<xf numFmtId="0" fontId="${boldFont}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
    );
  }

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="${fontXmlList.length}">${fontXmlList.join('')}</fonts>
  <fills count="${fillXmlList.length}">${fillXmlList.join('')}</fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${xfXmlList.length}">${xfXmlList.join('')}</cellXfs>
</styleSheet>`;

  // Build sheet1.xml
  const colsXml = colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const headerCellsXml = headers
    .map((h, cIdx) => {
      const ref = `${colLetter(cIdx)}1`;
      return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(h)}</t></is></c>`;
    })
    .join('');

  const dataRowsXml = orders.map((o, rIdx) => {
    const excelRow = rIdx + 2;
    const rawStatus = String(o?.status || 'pending').trim().toLowerCase();
    let themeIdx = STATUS_THEMES.findIndex((t) => t.key === rawStatus);
    if (themeIdx < 0) themeIdx = 4; // fallback to pending amber
    const sBase = 2 + themeIdx * 5;
    const sText = sBase + 0;
    const sWrap = sBase + 1;
    const sNum = sBase + 2;
    const sBoldNum = sBase + 3;
    const sStatus = sBase + 4;

    const items = Array.isArray(o?.items) ? o.items : [];
    const prodNames = items
      .map((it: any) => {
        const nm = String(it?.name || '').trim();
        if (!nm) return '';
        const q = Number(it?.qty) || 1;
        return q > 1 ? `${nm} (x${q})` : nm;
      })
      .filter(Boolean)
      .join('; ');
    const prodSkus = items
      .map((it: any) => resolveSkuForItem(o, it))
      .filter(Boolean)
      .join('; ');

    const custName = String(o?.customer?.name || '').trim();
    const custPhone = [o?.customer?.phone, o?.customer?.phone2]
      .map((p) => String(p || '').trim())
      .filter(Boolean)
      .join(' / ');

    const rawAddr = String(o?.customer?.address || '').trim();
    const thana = String(o?.customer?.thana || '').trim();
    const district = String(o?.customer?.district || '').trim();
    const addrParts: string[] = [];
    if (rawAddr) addrParts.push(rawAddr);
    if (thana && !rawAddr.toLowerCase().includes(thana.toLowerCase())) addrParts.push(thana);
    if (district && !rawAddr.toLowerCase().includes(district.toLowerCase())) addrParts.push(district);
    const fullAddress = addrParts.join(', ');

    const computedSub = items.reduce((s: number, it: any) => s + (Number(it?.price) || 0) * (Number(it?.qty) || 1), 0);
    const subTotal = Number(o?.itemsTotal ?? computedSub ?? o?.total ?? 0) || 0;
    const deliveryCharge = Number(o?.delivery ?? 0) || 0;
    const discountAmt = Number(o?.discount ?? 0) || 0;
    const couponCode = String(o?.coupon || '').trim();
    const grandTotal = Number(o?.total ?? 0) || 0;
    const statusLabel = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : '';

    const strCell = (cIdx: number, val: string, style: number) =>
      `<c r="${colLetter(cIdx)}${excelRow}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`;
    const numCell = (cIdx: number, val: number, style: number) =>
      `<c r="${colLetter(cIdx)}${excelRow}" s="${style}"><v>${Number.isFinite(val) ? val : 0}</v></c>`;

    const cells = [
      strCell(0, formatDate(o?.createdAt), sText),            // A. Date
      strCell(1, String(o?.id || ''), sText),                 // B. Order ID
      strCell(2, String(o?.courier?.consignment || ''), sText), // C. Courier ID
      strCell(3, String(o?.courier?.name || ''), sText),      // D. Courier Name
      strCell(4, prodNames, sWrap),                           // E. Product Name
      strCell(5, prodSkus, sText),                            // F. Product SKU
      strCell(6, custName, sText),                            // G. Name
      strCell(7, custPhone, sText),                           // H. Phone Number
      strCell(8, fullAddress, sWrap),                         // I. Address
      numCell(9, subTotal, sNum),                             // J. Sub Total
      numCell(10, deliveryCharge, sNum),                      // K. Delivery Charge
      numCell(11, discountAmt, sNum),                         // L. Discount
      strCell(12, couponCode, sText),                         // M. Coupon
      numCell(13, grandTotal, sBoldNum),                      // N. Total
      strCell(14, statusLabel, sStatus),                      // O. Status
    ].join('');

    return `<row r="${excelRow}" ht="22" customHeight="1">${cells}</row>`;
  });

  const lastRef = `${colLetter(headers.length - 1)}${orders.length + 1}`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>
    <row r="1" ht="26" customHeight="1">${headerCellsXml}</row>
    ${dataRowsXml.join('\n    ')}
  </sheetData>
</worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Orders" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zipBytes = buildZipStore([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ]);

  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
