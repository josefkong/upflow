const BRAZILIAN_MOBILE_DIGITS = 11;

export function brazilianMobileDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  const withoutCountryCode =
    digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
  return withoutCountryCode.slice(0, BRAZILIAN_MOBILE_DIGITS);
}

export function formatBrazilianMobile(value: string) {
  const digits = brazilianMobileDigits(value);
  const areaCode = digits.slice(0, 2);
  const firstPart = digits.slice(2, 7);
  const lastPart = digits.slice(7, 11);

  if (digits.length <= 2) return areaCode;
  if (digits.length <= 7) return `${areaCode} ${firstPart}`;
  return `${areaCode} ${firstPart}-${lastPart}`;
}

export function isBrazilianMobile(value: string) {
  return brazilianMobileDigits(value).length === BRAZILIAN_MOBILE_DIGITS;
}
