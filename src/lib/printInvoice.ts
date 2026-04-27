import { format } from 'date-fns';

interface Invoice {
  id: string;
  invoice_number: string;
  delivery_note_number: string;
  client_id: string | null;
  vehicle_id: string | null;
  liters_sold: number;
  tank_id: string;
  selling_price_per_liter: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  item_description: string | null;
  created_at: string;
  settled_at?: string | null;
  client?: {
    id: string;
    name: string;
    cell_number: string | null;
    po_box?: string | null;
    email: string | null;
  } | null;
}


function esc(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PrintConfig {
  company_name:        string;
  company_address:     string;
  company_tel:         string;
  company_vat:         string;
  company_email:       string;
  invoice_footer_text: string;
  vat_percentage:      number;
  vat_label:           string;
  invoice_title:       string;
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  company_name:        'Oshali Fuel',
  company_address:     'Oshali Village, B1 Road, Ondangwa',
  company_tel:         '',
  company_vat:         '',
  company_email:       '',
  invoice_footer_text: 'Thank you for your business! Goods once sold are not returnable. E&OE.',
  vat_percentage:      15,
  vat_label:           'Incl VAT (15%)',
  invoice_title:       'INVOICE',
};

export function buildInvoiceHTML(
  invoice: Invoice,
  config: PrintConfig = DEFAULT_PRINT_CONFIG,
  driverName = '',
  attendantName = ''
): string {
  // LAYOUT MAP (mm within container; container left=-10mm in print)
  // §A: left=0,  top=13mm,  w=100mm, h=34mm
  // §B: left=108,top=13mm,  w=75mm,  h=34mm
  // §C: left=0,  top=56mm,  w=100mm, h=37mm
  // §D: left=108,top=56mm,  w=75mm,  h=37mm
  // §E: left=0,  top=97mm,  w=181mm, h=14mm
  // §F: left=0,  top=113mm, w=181mm, h=55mm
  // §G: left=0,  top=178mm, w=108mm, h=37mm
  // §iL:left=88, top=178mm, w=38mm,  h=37mm
  // §iR:left=126,top=178mm, w=35mm,  h=37mm

  const date = format(new Date(invoice.created_at), 'dd/MM/yyyy');
  const time = format(new Date(invoice.created_at), 'HH:mm');

  const totalAmount = Number(invoice.total_amount) || 0;
  const netAmount   = totalAmount / (1 + config.vat_percentage / 100);
  const vatAmount   = totalAmount - netAmount;

  const fmt = (n: number): string =>
    'N$ ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // STEP 5 — compact single-token QTY, never wraps
  const qtyDisplay = Math.round(invoice.liters_sold).toLocaleString() + 'L';

  const clientName = invoice.client?.name       ?? 'Walk-in Customer';
  const clientTel  = invoice.client?.cell_number ?? '';
  const clientAcc  = invoice.client?.id ? invoice.client.id.slice(0, 8).toUpperCase() : 'CASH';
  const desc       = invoice.item_description || 'Diesel Fuel';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${esc(invoice.invoice_number)}</title>
<style>
@media print {
  @page {
    size: 195mm 202mm;
    margin: 10mm 10mm 1.5mm 1.5mm;
  }
  body { margin: 0; padding: 0; background: #fff; }
  .no-print { display: none !important; }
  .page {
    position: fixed;
    top: 0;
    left: -10mm;
    width: 181mm;
    height: 210mm;
    margin-top: 3mm;
    margin-left: 0mm;
    overflow: visible;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10.5pt;
    font-weight: 900;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

body {
  margin: 0; padding: 0; background: #fff;
  font-family: 'Courier New', Courier, monospace;
  color: #000;
}

.no-print {
  text-align: center; padding: 12px;
  background: #f0f0f0; font-family: sans-serif; font-size: 14px;
}
.no-print button {
  background: #1a1a2e; color: #fff; border: none;
  padding: 10px 32px; font-size: 15px; font-weight: 600;
  border-radius: 6px; cursor: pointer; margin: 0 8px;
}
.no-print button:hover { background: #333; }

.page {
  position: relative;
  width: 181mm;
  height: 210mm;
  margin: 0 auto;
  overflow: visible;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
}

/* §A — Company / Seller */
#p-a {
  position: absolute;
  left: 0mm;
  top: 13mm;
  width: 100mm;
  height: 34mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.5;
}

/* §B — Invoice Info */
#p-b {
  position: absolute;
  left: 108mm;
  top: 13mm;
  width: 75mm;
  height: 34mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.5;
}

/* §C — Bill To */
#p-c {
  position: absolute;
  left: 0mm;
  top: 56mm;
  width: 100mm;
  height: 37mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.5;
}

/* §D — Deliver To */
#p-d {
  position: absolute;
  left: 108mm;
  top: 56mm;
  width: 75mm;
  height: 37mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.5;
}

/* §E — Column Headers */
#p-e {
  position: absolute;
  left: 0mm;
  top: 97mm;
  width: 181mm;
  height: 14mm;
  padding: 1.5mm;
  display: flex;
  align-items: center;
  background: #e8e8e8;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10pt;
  font-weight: 900;
  color: #000;
}

/* §F — Line Items */
#p-f {
  position: absolute;
  left: 0mm;
  top: 113mm;
  width: 181mm;
  height: 55mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.6;
}

/* §G — Notes */
#p-g {
  position: absolute;
  left: 0mm;
  top: 178mm;
  width: 108mm;
  height: 37mm;
  padding: 1.5mm;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.5;
}

/* §i Left — Totals Labels */
#p-il {
  position: absolute;
  left: 116mm;
  top: 180mm;
  width: 38mm;
  height: 37mm;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  text-align: right;
  padding: 1mm 1mm 1mm 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9.5pt;
  font-weight: 900;
  color: #000;
}

/* §i Right — Totals Values */
#p-ir {
  position: absolute;
  left: 147mm;
  top: 180mm;
  width: 35mm;
  height: 37mm;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  text-align: right;
  padding: 1mm 2mm 1mm 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9.5pt;
  font-weight: 900;
  color: #000;
}

.psec-hdr {
  font-weight: 900;
  font-size: 11pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1mm;
  color: #000;
}

.inv-title {
  font-weight: 900;
  font-size: 13pt;
  color: #000;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1mm;
}

.lbl {
  font-weight: 700;
  font-size: 9.5pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #000;
}

/* STEP 2 — column grid: QTY | DESCRIPTION | UNIT | NET */
.cgrid {
  display: grid;
  grid-template-columns: 28mm 1fr 32mm 35mm;
  gap: 0 2mm;
  width: 100%;
  font-size: 10pt;
  font-weight: 900;
}
.cr { text-align: right; }
.irow { border-top: 0.3pt solid #ccc; padding: 0.5mm 0; }
.irow:first-child { border-top: none; }
.irow span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.num { font-weight: 900; font-size: 10pt; }

.piline {
  font-size: 9.5pt;
  font-weight: 900;
  color: #000;
  padding: 0.5mm 0;
}

.pitot {
  font-size: 9.5pt !important;
  font-weight: 900 !important;
  color: #000 !important;
  border-top: 1pt solid #000;
  padding-top: 1.5mm;
  margin-top: 1mm;
}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">Print Invoice</button>
  <button onclick="window.close()">Close</button>
</div>

<div class="page">

  <!-- §A Company / Seller -->
  <div id="p-a">
    <img src="/oshali-logo.png" alt="Oshali Fuel" style="max-height:55px; width:auto; display:block; margin-bottom:2mm;" onerror="this.style.display='none'" />
    <div class="psec-hdr" style="border-bottom: none;">${config?.company_name ?? 'OSHALI FUEL'}</div>
    <div>${esc(config.company_address)}</div>
    <div><span class="lbl">Tel: </span>${config.company_tel ? esc(config.company_tel) : '—'}</div>
    <div><span class="lbl">VAT No: </span>${config.company_vat ? esc(config.company_vat) : '—'}</div>
  </div>

  <!-- §B Invoice Details -->
  <div id="p-b">
    <div class="inv-title">${esc(config.invoice_title)}</div>
    <div><span class="lbl">No: </span>${esc(invoice.invoice_number)}</div>
    <div><span class="lbl">Date: </span>${date} ${time}</div>
    <div><span class="lbl">DN: </span>${esc(invoice.delivery_note_number)}</div>
  </div>

  <!-- §C Bill To -->
  <div id="p-c">
    <div class="psec-hdr">Bill To</div>
    <div>${esc(clientName)}</div>
    ${clientTel ? `<div><span class="lbl">Tel: </span>${esc(clientTel)}</div>` : ''}
    <div><span class="lbl">Acc: </span>${esc(clientAcc)}</div>
  </div>

  <!-- §D Deliver To -->
  <div id="p-d">
    <div class="psec-hdr">Deliver To</div>
    <div>${esc(clientName)}</div>
    <div><span class="lbl">DN: </span>${esc(invoice.delivery_note_number)}</div>
  </div>

  <!-- §E Column Headers -->
  <div id="p-e">
    <div class="cgrid">
      <span>QTY</span>
      <span>DESCRIPTION</span>
      <span class="cr" style="border-right: 1pt solid #666; padding-right: 2mm; margin-right: 1mm;">UNIT</span>
      <span class="cr">NET</span>
    </div>
  </div>

  <!-- §F Line Items -->
  <div id="p-f">
    <div class="cgrid irow">
      <span class="num" style="white-space: nowrap;">${qtyDisplay}</span>
      <span>${esc(desc)}</span>
      <span class="cr num" style="border-right: 1pt solid #666; padding-right: 2mm; margin-right: 1mm;">${fmt(invoice.selling_price_per_liter)}</span>
      <span class="cr num">${fmt(netAmount)}</span>
    </div>
  </div>

  <!-- §logo — between §F (ends 168mm) and §G (starts 178mm) -->
  <div id="p-logo" style="position:absolute;left:0mm;top:135mm;width:181mm;height:60mm;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;">
    <img src="${window.location.origin}/oshali-logo.png" style="width:100%;height:100%;max-width:181mm;max-height:60mm;object-fit:contain;object-position:center;opacity:0.18;" onerror="this.style.display='none'" />
  </div>

  <!-- §G Acknowledgement -->
  <div id="p-g">
    <div class="psec-hdr">Acknowledgement</div>
    <div style="display:flex; gap:6mm; margin-top:2mm;">
      <div style="flex:1;">
        <div class="lbl">Driver Name</div>
        <div style="font-weight:900; min-height:4mm; line-height:1.4;">${esc(driverName)}</div>
        <div style="margin-top:6mm; border-top:0.8pt solid #000; padding-top:1mm; font-size:8.5pt; font-weight:700; color:#000;">Driver Signature</div>
      </div>
      <div style="flex:1;">
        <div class="lbl">Attendant Name</div>
        <div style="font-weight:900; min-height:4mm; line-height:1.4;">${esc(attendantName)}</div>
        <div style="margin-top:6mm; border-top:0.8pt solid #000; padding-top:1mm; font-size:8.5pt; font-weight:700; color:#000;">Attendant Signature</div>
      </div>
    </div>
  </div>

  <!-- §i Labels (unconditional) -->
  <div id="p-il">
    <div class="piline">Sub Total:</div>
    <div class="piline">${esc(config.vat_label)}:</div>
    <div class="piline pitot">TOTAL:</div>
  </div>

  <!-- §i Values — STEP 4: unconditional -->
  <div id="p-ir">
    <div class="piline">${fmt(netAmount)}</div>
    <div class="piline">${fmt(vatAmount)}</div>
    <div class="piline pitot">${fmt(totalAmount)}</div>
  </div>

</div>

</body>
</html>`;

  return html;
}

export function printInvoice(invoice: Invoice, config: PrintConfig = DEFAULT_PRINT_CONFIG, driverName = '', attendantName = ''): void {
  const html = buildInvoiceHTML(invoice, config, driverName, attendantName);

  console.log('[printInvoice] §G present:', html.includes('id="p-g"'));
  console.log('[printInvoice] §i-labels present:', html.includes('id="p-il"'));
  console.log('[printInvoice] §i-values present:', html.includes('id="p-ir"'));
  console.log('[printInvoice] netAmount:', html.includes('N$'));

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      URL.revokeObjectURL(url);
      printWindow.addEventListener('afterprint', () => printWindow.close());
      printWindow.print();
    };
  } else {
    URL.revokeObjectURL(url);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:0;height:0';
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 1000);
    };
    document.body.appendChild(iframe);
  }
}
