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

export function printInvoice(invoice: Invoice): void {
  const date = format(new Date(invoice.created_at), 'dd/MM/yyyy');
  const time = format(new Date(invoice.created_at), 'HH:mm');

  // VAT: total_amount already includes VAT (15%)
  const net     = invoice.total_amount / 1.15;
  const vat     = invoice.total_amount - net;
  const inclVat = invoice.total_amount;
  const qtyDisplay = Number(invoice.liters_sold) % 1 === 0
    ? Number(invoice.liters_sold).toLocaleString() + 'L'
    : invoice.liters_sold.toLocaleString() + 'L';
  const fmt = (n: number) => 'N$ ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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
  body { margin:0; padding:0; background:#fff; }
  .no-print { display:none !important; }
  .page {
    position:fixed;
    top:3mm; left:0mm;
    width:181mm; height:182mm;
    overflow:hidden;
    font-family:'Courier New',Courier,monospace;
    font-size:10.5pt;
    font-weight:900;
    color:#000;
    background:#fff;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
}

body {
  margin:0; padding:0; background:#fff;
  font-family:'Courier New',Courier,monospace;
  color:#000;
}

.no-print {
  text-align:center; padding:12px;
  background:#f0f0f0; font-family:sans-serif; font-size:14px;
}
.no-print button {
  background:#1a1a2e; color:#fff; border:none;
  padding:10px 32px; font-size:15px; font-weight:600;
  border-radius:6px; cursor:pointer; margin:0 8px;
}
.no-print button:hover { background:#333; }

.page {
  position:relative;
  width:181mm; height:182mm;
  margin:0 auto;
  overflow:hidden;
  font-family:'Courier New',Courier,monospace;
  font-size:10.5pt;
  font-weight:900;
  color:#000;
}

/* All sections: heavy weight for impact printing */
.sec {
  position:absolute;
  overflow:hidden;
  padding:1.5mm;
  font-family:'Courier New',Courier,monospace;
  font-size:10.5pt;
  font-weight:900;
  line-height:1.4;
  color:#000 !important;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

/* Section headers */
.sec-hdr {
  font-weight:900;
  font-size:12pt;
  color:#000 !important;
  text-transform:uppercase;
  letter-spacing:0.05em;
  margin-bottom:1mm;
  border-bottom:.4pt solid #000;
  padding-bottom:.5mm;
}

/* §B INVOICE title */
.inv-title {
  font-weight:900;
  font-size:13pt;
  color:#000 !important;
  text-transform:uppercase;
  letter-spacing:0.05em;
  margin-bottom:1mm;
}

/* Small uppercase labels */
.lbl {
  font-weight:700;
  font-size:9.5pt;
  text-transform:uppercase;
  letter-spacing:0.06em;
  color:#000 !important;
}

/* §A positions */
#sa { left:0;    top:13mm; width:104mm; height:34mm; }
/* §B positions */
#sb { left:101mm; top:13mm; width:73mm;  height:34mm; }
/* §C positions */
#sc { left:0;     top:56mm; width:104mm; height:37mm; }
/* §D positions */
#sd { left:101mm; top:56mm; width:73mm;  height:37mm; }

/* §E Column headers — shaded */
#se {
  left:0; top:97mm; width:178mm; height:15mm;
  overflow:hidden;
  background:#eeeeee;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
  display:flex; align-items:center;
  font-weight:900; font-size:9.5pt; letter-spacing:.04em;
}

/* §F Line items */
#sf { left:0; top:113mm; width:178mm; height:62mm; overflow:hidden; }

/* §G Notes */
#sg { left:0; top:179mm; width:113mm; height:30mm; padding:1.5mm; overflow:hidden; }

/* §i Left labels */
#sil {
  left:116mm; top:179mm; width:34mm; height:30mm;
  display:flex; flex-direction:column; justify-content:space-around;
  text-align:right; padding:1mm;
  font-family:'Courier New',Courier,monospace;
  font-size:9.5pt; font-weight:900; line-height:1.3;
}

/* §i Right values */
#sir {
  left:150mm; top:179mm; width:31mm; height:30mm;
  display:flex; flex-direction:column; justify-content:space-around;
  text-align:right; padding:1mm;
  font-family:'Courier New',Courier,monospace;
  font-size:9.5pt; font-weight:900; line-height:1.3;
}

/* Column grid — 5 columns, no CODE */
.cgrid {
  display:grid;
  grid-template-columns:28mm 1fr 26mm 26mm 26mm;
  gap:0 2mm;
  width:100%;
  font-size:10pt;
  font-weight:900;
}
.cr { text-align:right; }
.irow { border-top:.3pt solid #ccc; padding:.5mm 0; white-space:nowrap; overflow:hidden; }
.irow:first-child { border-top:none; }
.irow span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Totals rows */
.iline { padding-top:.5mm; font-size:9.5pt; font-weight:900; color:#000 !important; }
.pitot { font-weight:900 !important; font-size:11pt !important; color:#000 !important; border-top:0.5pt solid #000; padding-top:1mm; }

/* Numeric values */
.num { font-weight:900; font-size:10pt; }
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">Print Invoice</button>
  <button onclick="window.close()">Close</button>
</div>

<div class="page">

  <!-- §A Company / Seller -->
  <div class="sec" id="sa">
    <div class="sec-hdr">Oshali Fuel</div>
    <div>Windhoek, Namibia</div>
    <div><span class="lbl">Tel: </span>—</div>
    <div><span class="lbl">VAT No: </span>—</div>
  </div>

  <!-- §B Invoice Details -->
  <div class="sec" id="sb">
    <div class="inv-title">INVOICE</div>
    <div><span class="lbl">No: </span>${esc(invoice.invoice_number)}</div>
    <div><span class="lbl">Date: </span>${date} ${time}</div>
    <div><span class="lbl">DN: </span>${esc(invoice.delivery_note_number)}</div>
  </div>

  <!-- §C Bill To -->
  <div class="sec" id="sc">
    <div class="sec-hdr">Bill To</div>
    <div>${esc(clientName)}</div>
    ${clientTel ? `<div><span class="lbl">Tel: </span>${esc(clientTel)}</div>` : ''}
    <div><span class="lbl">Acc: </span>${esc(clientAcc)}</div>
  </div>

  <!-- §D Deliver To -->
  <div class="sec" id="sd">
    <div class="sec-hdr">Deliver To</div>
    <div>${esc(clientName)}</div>
    <div><span class="lbl">DN: </span>${esc(invoice.delivery_note_number)}</div>
  </div>

  <!-- §E Column Headers -->
  <div class="sec" id="se">
    <div class="cgrid">
      <span>QTY</span>
      <span>DESCRIPTION</span>
      <span class="cr">UNIT</span>
      <span class="cr">NET</span>
      <span></span>
    </div>
  </div>

  <!-- §F Line Items -->
  <div class="sec" id="sf">
    <div class="cgrid irow">
      <span class="num" style="white-space:nowrap; overflow:hidden; font-size:9.5pt;">${qtyDisplay}</span>
      <span style="overflow:hidden; text-overflow:ellipsis; display:inline-block; max-width:100%;">${esc(desc)}</span>
      <span class="cr num">${fmt(invoice.selling_price_per_liter)}</span>
      <span class="cr num">${fmt(net)}</span>
      <span></span>
    </div>
  </div>

  <!-- §G Notes -->
  <div class="sec" id="sg">
    <div class="sec-hdr">NOTES</div>
    <div style="white-space:pre-wrap; font-weight:900; font-size:9.5pt; line-height:1.4; color:#000;">Thank you for your business!
Goods once sold are not returnable. E&amp;OE.</div>
  </div>

  <!-- §i Labels -->
  <div class="sec" id="sil">
    <div class="iline">Sub Total:</div>
    <div class="iline">Incl VAT (15%):</div>
    <div class="pitot">TOTAL:</div>
  </div>

  <!-- §i Values -->
  <div class="sec" id="sir">
    <div class="iline">${fmt(net)}</div>
    <div class="iline">${fmt(vat)}</div>
    <div class="pitot">${fmt(inclVat)}</div>
  </div>

</div>

<script>
  setTimeout(() => window.print(), 400);
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => URL.revokeObjectURL(url);
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
