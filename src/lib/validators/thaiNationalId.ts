/**
 * Validate Thai National ID (13 digits) using the official checksum algorithm.
 * Sum of (digit_i * (13 - i)) for i=0..11, mod 11, then (11 - mod) % 10 must equal digit 13.
 */
export function isValidThaiNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id.charAt(i), 10) * (13 - i);
  }
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id.charAt(12), 10);
}
