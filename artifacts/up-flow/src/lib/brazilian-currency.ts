const MAX_INTEGER_DIGITS = 14;

export function brazilianCurrencyDigits(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MAX_INTEGER_DIGITS);
}

export function normalizeBrazilianCurrencyInteger(
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return String(Math.round(numeric));
  }
  return brazilianCurrencyDigits(value);
}

export function formatBrazilianCurrencyInteger(
  value: string | number | null | undefined,
) {
  const digits = brazilianCurrencyDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number(digits));
}

export function formatBrazilianCurrencyText(
  value: string | number | null | undefined,
) {
  const normalized = normalizeBrazilianCurrencyInteger(value);
  return normalized ? `R$ ${formatBrazilianCurrencyInteger(normalized)}` : "";
}
