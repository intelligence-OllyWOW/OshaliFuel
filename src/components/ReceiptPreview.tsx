import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { buildThermalReceipt, type ReceiptData } from '../lib/printThermalReceipt';

interface Props {
  data: ReceiptData;
  onClose: () => void;
}

export default function ReceiptPreview({ data, onClose }: Props) {
  const receiptText = buildThermalReceipt(data);

  function handlePrint() {
    window.print();
  }

  return createPortal(
    <div className="receipt-portal fixed inset-0 z-[9999] flex flex-col bg-gray-900/80 backdrop-blur-sm">
      <div className="receipt-toolbar flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl active:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
          Close
        </button>
        <span className="text-sm font-semibold text-gray-500">Receipt Preview</span>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#1B2D5B] rounded-xl active:bg-[#152347] transition-colors"
        >
          <Printer className="w-4 h-4" strokeWidth={2.5} />
          Print
        </button>
      </div>

      <div className="receipt-scroll flex-1 overflow-auto flex justify-center py-8 px-4">
        <div className="receipt-paper bg-white rounded-lg shadow-2xl w-[48mm] min-h-fit shrink-0 self-start">
          <pre className="receipt-content font-mono text-[10px] leading-[1.3] text-black whitespace-pre p-[2mm] m-0">
            {receiptText}
          </pre>
        </div>
      </div>
    </div>,
    document.body
  );
}
