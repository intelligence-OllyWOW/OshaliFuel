import { format } from 'date-fns';

interface PrintableDeliveryNote {
  note_number: string;
  customer_name: string;
  vehicle_registration: string;
  driver_name: string;
  meter_reading_a: number;
  meter_reading_b: number;
  litres_dispensed: number;
  litres_reading: number;
  attendant_name: string;
  created_at: string;
}

export function printDeliveryNote(note: PrintableDeliveryNote) {
  const date = format(new Date(note.created_at), 'dd/MM/yyyy');
  const time = format(new Date(note.created_at), 'HH:mm');
  const litres = note.litres_dispensed.toFixed(2);
  const litresReading = (note.litres_reading || 0).toFixed(2);
  const meterA = note.meter_reading_a.toFixed(2);
  const meterB = note.meter_reading_b.toFixed(2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Delivery Note ${note.note_number}</title>
<style>
@media print {
  @page {
    size: 191.15mm 212.15mm;
    margin: 10mm 10mm 1.5mm 1.5mm;
  }
  body { margin: 0; padding: 0; }
}

body {
  margin: 0;
  padding: 0;
  background: #fff;
  font-family: 'Courier New', Courier, monospace;
  color: #000;
}

.page {
  position: relative;
  width: 181mm;
  height: 200mm;
  overflow: hidden;
  margin: 0 auto;
}

.sec {
  position: absolute;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  color: #000;
  font-size: 10.5pt;
  font-weight: 700;
  line-height: 1.5;
  padding: 1.5mm;
}

.sec-hdr {
  font-weight: 900;
  font-size: 12pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1mm;
  border-bottom: 0.4pt solid #000;
  padding-bottom: 1mm;
}

.sec-hdr-lg {
  font-weight: 900;
  font-size: 14pt;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5mm;
}

.label {
  font-size: 8pt;
  font-weight: 400;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.value {
  font-size: 11pt;
  font-weight: 700;
}

.value-lg {
  font-size: 16pt;
  font-weight: 900;
}

.row {
  margin-bottom: 1.5mm;
}

#sec-a  { left: 0;     top: 0;     width: 104mm; height: 34mm; }
#sec-b  { left: 108mm; top: 0;     width: 73mm;  height: 34mm; }
#sec-c  { left: 0;     top: 38mm;  width: 104mm; height: 34mm; }
#sec-d  { left: 108mm; top: 38mm;  width: 73mm;  height: 34mm; }
#sec-e  { left: 0;     top: 76mm;  width: 181mm; height: 12mm; background: #eee; display: flex; align-items: center; font-weight: 900; font-size: 9pt; letter-spacing: 0.04em; }
#sec-f  { left: 0;     top: 89mm;  width: 181mm; height: 52mm; }
#sec-g  { left: 0;     top: 145mm; width: 181mm; height: 55mm; }

.detail-grid {
  display: grid;
  grid-template-columns: 45mm 45mm 45mm 45mm;
  gap: 0;
  width: 100%;
}

.detail-cell {
  padding: 2mm 3mm;
  border-bottom: 0.3pt solid #ccc;
}

.header-grid {
  display: grid;
  grid-template-columns: 45mm 45mm 45mm 45mm;
  gap: 0;
  width: 100%;
  font-weight: 900;
}

.header-cell {
  padding: 2mm 3mm;
  text-transform: uppercase;
  font-size: 9pt;
  letter-spacing: 0.04em;
}

.sig-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8mm;
  padding-top: 4mm;
}

.sig-box {
  border-top: 0.4pt solid #000;
  padding-top: 2mm;
  margin-top: 12mm;
}

.sig-label {
  font-size: 8pt;
  font-weight: 400;
  color: #555;
  text-transform: uppercase;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 1.5mm 0;
  border-bottom: 0.3pt solid #ddd;
}

.summary-row.total {
  border-bottom: none;
  border-top: 0.6pt solid #000;
  padding-top: 2mm;
  margin-top: 1mm;
}

.no-print {
  text-align: center;
  padding: 12px;
  background: #f0f0f0;
  font-family: sans-serif;
  font-size: 14px;
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
  .page {
    position: fixed;
    top: 13mm;
    left: 5mm;
  }
}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">Print Delivery Note</button>
  <button onclick="window.close()">Close</button>
</div>

<div class="page">
  <!-- Section A: Title / Company -->
  <div class="sec" id="sec-a">
    <div class="sec-hdr-lg">DELIVERY NOTE</div>
    <div class="row">
      <div class="label">Fuel Dispensing Record</div>
    </div>
    <div style="margin-top: 4mm;">
      <div class="label">Printed</div>
      <div class="value">${date} at ${time}</div>
    </div>
  </div>

  <!-- Section B: Note Info -->
  <div class="sec" id="sec-b">
    <div class="sec-hdr">Note Details</div>
    <div class="row">
      <div class="label">Note No.</div>
      <div class="value">${esc(note.note_number)}</div>
    </div>
    <div class="row">
      <div class="label">Date</div>
      <div class="value">${date}</div>
    </div>
    <div class="row">
      <div class="label">Time</div>
      <div class="value">${time}</div>
    </div>
  </div>

  <!-- Section C: Customer -->
  <div class="sec" id="sec-c">
    <div class="sec-hdr">Customer</div>
    <div class="row">
      <div class="label">Name</div>
      <div class="value">${esc(note.customer_name)}</div>
    </div>
    <div class="row">
      <div class="label">Vehicle Registration</div>
      <div class="value">${esc(note.vehicle_registration)}</div>
    </div>
  </div>

  <!-- Section D: Driver / Attendant -->
  <div class="sec" id="sec-d">
    <div class="sec-hdr">Personnel</div>
    <div class="row">
      <div class="label">Driver</div>
      <div class="value">${esc(note.driver_name)}</div>
    </div>
    <div class="row">
      <div class="label">Attendant</div>
      <div class="value">${esc(note.attendant_name)}</div>
    </div>
  </div>

  <!-- Section E: Column Headers -->
  <div class="sec" id="sec-e">
    <div class="header-grid">
      <div class="header-cell">METER A (START)</div>
      <div class="header-cell">METER B (END)</div>
      <div class="header-cell">LITRES DISPENSED</div>
      <div class="header-cell">PUMP READING</div>
    </div>
  </div>

  <!-- Section F: Meter Details -->
  <div class="sec" id="sec-f">
    <div class="detail-grid">
      <div class="detail-cell">
        <div class="value-lg">${meterA}</div>
      </div>
      <div class="detail-cell">
        <div class="value-lg">${meterB}</div>
      </div>
      <div class="detail-cell">
        <div class="value-lg">${litres} L</div>
      </div>
      <div class="detail-cell">
        <div class="value-lg">${litresReading} L</div>
      </div>
    </div>

    <div style="margin-top: 6mm; padding: 3mm; border: 0.4pt solid #000;">
      <div class="summary-row">
        <span class="label">Meter Difference (B - A)</span>
        <span class="value">${litres} Litres</span>
      </div>
      <div class="summary-row">
        <span class="label">Pump Meter Reading</span>
        <span class="value">${litresReading} Litres</span>
      </div>
      <div class="summary-row total">
        <span style="font-size: 11pt; font-weight: 900;">TOTAL LITRES DISPENSED</span>
        <span style="font-size: 14pt; font-weight: 900;">${litres} L</span>
      </div>
    </div>
  </div>

  <!-- Section G: Signatures -->
  <div class="sec" id="sec-g">
    <div class="sec-hdr">Acknowledgement</div>
    <div class="sig-grid">
      <div>
        <div class="label">Driver Name: ${esc(note.driver_name)}</div>
        <div class="sig-box">
          <div class="sig-label">Driver Signature</div>
        </div>
      </div>
      <div>
        <div class="label">Attendant: ${esc(note.attendant_name)}</div>
        <div class="sig-box">
          <div class="sig-label">Attendant Signature</div>
        </div>
      </div>
    </div>
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
