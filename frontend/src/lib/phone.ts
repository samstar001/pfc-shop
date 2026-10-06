// Turn a Nigerian phone number into the digits-only format wa.me needs (08012345678 → 2348012345678)
export function toWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}
