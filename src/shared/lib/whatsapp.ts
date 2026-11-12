/** One-tap WhatsApp message helpers (rent reminders & receipts). */

function cleanPhone(mobile: string): string {
  const d = mobile.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  return d;
}

export function openWhatsApp(mobile: string, message: string): void {
  const phone = cleanPhone(mobile);
  if (!phone) {
    window.alert('No phone number saved for this member, so WhatsApp cannot open.');
    return;
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

export function rentReminderMessage(input: {
  name: string;
  branchLabel: string;
  room: string;
  balance: number;
  cycleDate: string;
  rent: number;
  paid: number;
}): string {
  return (
    `Namaste ${input.name}, reminder from Golden Nest PG (${input.branchLabel}, Room ${input.room}). ` +
    `Your rent balance of ₹${input.balance} for the cycle starting ${input.cycleDate} is pending ` +
    `(Total Rent: ₹${input.rent}, Paid: ₹${input.paid}). Kindly pay via UPI or Cash. Thank you!`
  );
}

export function paymentReceiptMessage(input: {
  name: string;
  branchLabel: string;
  room: string;
  cash: number;
  upi: number;
  card: number;
  total: number;
  balance: number;
  date: string;
}): string {
  const parts: string[] = [];
  if (input.cash) parts.push(`Cash ₹${input.cash}`);
  if (input.upi) parts.push(`UPI ₹${input.upi}`);
  if (input.card) parts.push(`Card ₹${input.card}`);
  const balanceLine =
    input.balance > 0
      ? `Balance still due: ₹${input.balance}.`
      : `No balance due — rent settled in full. Thank you!`;
  return (
    `Golden Nest PG — Payment Receipt\n` +
    `Member: ${input.name} (${input.branchLabel}, Room ${input.room})\n` +
    `Date: ${input.date}\n` +
    `Received: ${parts.join(' + ')} = ₹${input.total}\n` +
    balanceLine
  );
}
