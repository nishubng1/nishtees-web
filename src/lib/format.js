/** Paise (integer) -> a rupee string for display. 99900 -> "₹999" */
export function formatPaise(paise) {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}
