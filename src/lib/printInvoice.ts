import { format } from 'date-fns';

interface PrintableInvoice {
  invoice_number: string;
  delivery_note_number: string;
  customer_name: string;
  liters_sold: number;
  selling_price_per_liter: number;
  total_amount: number;
  status: string;
  created_at: string;
  company_name?: string;
}

export function printInvoice(invoice: PrintableInvoice) {
  const date = format(new Date(invoice.created_at), 'dd/MM/yyyy');
  const time = format(new Date(invoice.created_at), 'HH:mm');
  const liters = invoice.liters_sold.toFixed(2);
  const pricePerLiter = invoice.selling_price_per_liter.toFixed(2);
  const totalAmount = invoice.total_amount.toFixed(2);
  const companyName = invoice.company_name || 'Oshali Fuel';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${invoice.invoice_number}</title>
<style>
@media print {
  @page {
    size: 210mm 297mm;
    margin: 10mm;
  }
  body { margin: 0; padding: 0; }
}

body {
  margin: 0;
  padding: 0;
  background: #fff;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
}

.container {
  max-width: 8.5in;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 3px solid #1a1a2e;
  padding-bottom: 20px;
}

.company-info {
  flex: 1;
}

.company-name {
  font-size: 24px;
  font-weight: 900;
  color: #1a1a2e;
  margin-bottom: 5px;
}

.invoice-title {
  text-align: right;
  font-size: 28px;
  font-weight: bold;
  color: #1a1a2e;
}

.invoice-number {
  text-align: right;
  font-size: 14px;
  color: #666;
  margin-top: 5px;
}

.info-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
}

.info-block {
  font-size: 13px;
}

.info-label {
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}

.info-value {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.bill-to {
  grid-column: 1 / 2;
}

.invoice-details {
  grid-column: 2 / 3;
}

.items-section {
  margin-bottom: 30px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.items-table thead {
  background-color: #f5f5f5;
  border-top: 2px solid #1a1a2e;
  border-bottom: 2px solid #1a1a2e;
}

.items-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #333;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.items-table td {
  padding: 12px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.items-table tbody tr:last-child td {
  border-bottom: 2px solid #1a1a2e;
}

.text-right {
  text-align: right;
}

.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  margin-bottom: 40px;
}

.totals-box {
  width: 300px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px solid #eee;
}

.total-amount {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  font-size: 16px;
  font-weight: bold;
  color: #1a1a2e;
  border-top: 2px solid #1a1a2e;
  margin-top: 8px;
}

.footer {
  text-align: center;
  font-size: 11px;
  color: #999;
  padding-top: 20px;
  border-top: 1px solid #ddd;
  margin-top: 40px;
}

.no-print {
  text-align: center;
  padding: 12px;
  background: #f0f0f0;
  font-family: sans-serif;
  font-size: 14px;
  margin-bottom: 20px;
}

.no-print button {
  background: #1a1a2e;
  color: #fff;
  border: none;
  padding: 10px 32px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  margin: 0 8px;
}

.no-print button:hover {
  background: #333;
}

@media print {
  .no-print { display: none !important; }
  .container {
    padding: 0;
  }
}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">Print Invoice</button>
  <button onclick="window.close()">Close</button>
</div>

<div class="container">
  <div class="header">
    <div class="company-info">
      <div class="company-name">${esc(companyName)}</div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">#${esc(invoice.invoice_number)}</div>
    </div>
  </div>

  <div class="info-section">
    <div class="info-block bill-to">
      <div class="info-label">Bill To</div>
      <div class="info-value">${esc(invoice.customer_name)}</div>
    </div>
    <div class="info-block invoice-details">
      <div class="info-label">Invoice Date</div>
      <div class="info-value">${date}</div>
      <div style="margin-top: 15px;">
        <div class="info-label">Delivery Note</div>
        <div class="info-value">#${esc(invoice.delivery_note_number)}</div>
      </div>
      <div style="margin-top: 15px;">
        <div class="info-label">Status</div>
        <div class="info-value" style="text-transform: capitalize;">${esc(invoice.status)}</div>
      </div>
    </div>
  </div>

  <div class="items-section">
    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Diesel Fuel</td>
          <td class="text-right">${liters} L</td>
          <td class="text-right">N\$${pricePerLiter}</td>
          <td class="text-right">N\$${totalAmount}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row">
        <span>Subtotal</span>
        <span>N\$${totalAmount}</span>
      </div>
      <div class="total-row">
        <span>Tax</span>
        <span>N\$0.00</span>
      </div>
      <div class="total-amount">
        <span>Total Amount Due</span>
        <span>N\$${totalAmount}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>This invoice was generated on ${date} at ${time}</p>
    <p>Thank you for your business</p>
  </div>
</div>

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
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 1000);
    };
    document.body.appendChild(iframe);
  }
}

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
