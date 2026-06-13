export function normalizeCedula(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function validateEcuadorianCedula(value: string): boolean {
  const cedula = normalizeCedula(value);
  if (cedula.length !== 10 || !/^\d{10}$/.test(cedula)) return false;

  const province = Number(cedula.slice(0, 2));
  if (province < 1 || province > 24) return false;

  const third = Number(cedula[2]);
  if (third >= 6) return false;

  const digits = cedula.split("").map(Number);
  const coeffs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let val = digits[i] * coeffs[i];
    if (val >= 10) val -= 9;
    sum += val;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[9];
}
