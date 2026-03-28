export function formatCurrency(amount: number): string {
  return `N$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatNumber(num: number): string {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function generatePONumber(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const uniqueId = `${timestamp}${random}`.substring(0, 8).toUpperCase();
  return `PO-${new Date().getFullYear()}-${uniqueId}`;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
