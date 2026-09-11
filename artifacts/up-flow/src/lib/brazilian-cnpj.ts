export function cnpjDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function formatBrazilianCnpj(value: string) {
  const digits = cnpjDigits(value);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function checkDigit(base: string, weights: number[]) {
  const total = base
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isBrazilianCnpj(value: string) {
  const digits = cnpjDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}
