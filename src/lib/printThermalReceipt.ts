import { format } from 'date-fns';

interface ReceiptData {
  noteNumber: string;
  customerName: string;
  vehicleRegistration: string;
  driverName: string;
  meterA: number;
  meterB: number;
  litersDispensed: number;
  litersReading: number;
  pricePerLiter: number;
  attendantName: string;
  createdAt: string;
  companyName: string;
  companyAddress: string;
  companyTel: string;
}

const LINE_WIDTH = 32;

function center(text: string): string {
  const trimmed = text.slice(0, LINE_WIDTH);
  const pad = Math.max(0, Math.floor((LINE_WIDTH - trimmed.length) / 2));
  return ' '.repeat(pad) + trimmed;
}

function leftRight(left: string, right: string): string {
  const maxLeft = LINE_WIDTH - right.length - 1;
  const l = left.slice(0, maxLeft);
  const gap = LINE_WIDTH - l.length - right.length;
  return l + ' '.repeat(Math.max(1, gap)) + right;
}

function dashes(): string {
  return '-'.repeat(LINE_WIDTH);
}

function doubleLine(): string {
  return '='.repeat(LINE_WIDTH);
}

function wrapText(text: string, indent = 0): string[] {
  const lines: string[] = [];
  const maxW = LINE_WIDTH - indent;
  const prefix = ' '.repeat(indent);
  let remaining = text;
  while (remaining.length > maxW) {
    let breakAt = remaining.lastIndexOf(' ', maxW);
    if (breakAt <= 0) breakAt = maxW;
    lines.push(prefix + remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length > 0) lines.push(prefix + remaining);
  return lines;
}

export function buildThermalReceipt(data: ReceiptData): string {
  const date = format(new Date(data.createdAt), 'dd/MM/yyyy');
  const time = format(new Date(data.createdAt), 'HH:mm');
  const totalAmount = data.litersReading * data.pricePerLiter;

  const lines: string[] = [];

  lines.push('');
  lines.push(center(data.companyName.toUpperCase()));
  if (data.companyAddress) {
    wrapText(data.companyAddress, 0).forEach(l => lines.push(center(l.trim())));
  }
  if (data.companyTel) {
    lines.push(center('Tel: ' + data.companyTel));
  }
  lines.push('');
  lines.push(doubleLine());
  lines.push(center('FUEL RECEIPT'));
  lines.push(doubleLine());

  lines.push(leftRight('Ref:', data.noteNumber));
  lines.push(leftRight('Date:', date));
  lines.push(leftRight('Time:', time));
  lines.push(dashes());

  lines.push('Customer:');
  wrapText(data.customerName, 2).forEach(l => lines.push(l));
  lines.push(leftRight('Vehicle:', data.vehicleRegistration));
  lines.push(leftRight('Driver:', data.driverName.slice(0, 20)));
  lines.push(dashes());

  lines.push(leftRight('Meter A:', data.meterA.toFixed(2)));
  lines.push(leftRight('Meter B:', data.meterB.toFixed(2)));
  lines.push(leftRight('Litres:', data.litersReading.toFixed(2) + ' L'));
  lines.push(dashes());

  lines.push('');
  lines.push(leftRight('Diesel Fuel', ''));
  lines.push(leftRight('  Qty:', data.litersReading.toFixed(2) + ' L'));
  lines.push(leftRight('  Price/L:', 'N$ ' + data.pricePerLiter.toFixed(2)));
  lines.push('');
  lines.push(doubleLine());
  lines.push(leftRight('TOTAL:', 'N$ ' + totalAmount.toFixed(2)));
  lines.push(doubleLine());
  lines.push('');

  lines.push(leftRight('Attendant:', data.attendantName.slice(0, 18)));
  lines.push('');
  lines.push(dashes());
  lines.push(center('Thank you for'));
  lines.push(center('choosing Oshali!'));
  lines.push(dashes());
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReceiptHtml(data: ReceiptData): string {
  const receiptText = buildThermalReceipt(data);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt ${escapeHtml(data.noteNumber)}</title>
<style>
  @page {
    size: 48mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 48mm;
    max-width: 48mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    line-height: 1.3;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  pre {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre;
    padding: 2mm;
    margin: 0;
    word-break: keep-all;
    overflow: hidden;
  }
  @media screen {
    html, body {
      max-width: 48mm;
      margin: 0 auto;
    }
  }
</style>
</head>
<body>
<pre>${escapeHtml(receiptText)}</pre>
</body>
</html>`;
}

export function printThermalReceipt(data: ReceiptData) {
  const html = buildReceiptHtml(data);
  const isAndroid = /android/i.test(navigator.userAgent);

  if (isAndroid) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:48mm;height:0;border:none;visibility:hidden;';
    iframe.src = url;

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch {
          window.open(url, '_blank');
        }
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 3000);
      }, 400);
    };

    document.body.appendChild(iframe);
  } else {
    const printWindow = window.open('', '_blank', 'width=280,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onafterprint = () => printWindow.close();
      setTimeout(() => printWindow.print(), 300);
    }
  }
}
