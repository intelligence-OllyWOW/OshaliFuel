export function formatCurrency(amount: number): string {
  return `N$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatNumber(num: number): string {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}${random}`.substring(0, 8).toUpperCase();
}

export function generatePRNumber(): string {
  const year = new Date().getFullYear();
  const uniqueId = generateUniqueId();
  return `PR-${year}-${uniqueId}`;
}

export function generatePONumber(): string {
  const year = new Date().getFullYear();
  const uniqueId = generateUniqueId();
  return `PO-${year}-${uniqueId}`;
}

export function generateGRNumber(): string {
  const year = new Date().getFullYear();
  const uniqueId = generateUniqueId();
  return `GR-${year}-${uniqueId}`;
}

export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const uniqueId = generateUniqueId();
  return `INV-${year}-${uniqueId}`;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
