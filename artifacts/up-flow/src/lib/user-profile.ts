export function normalizePhone(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value ? value : null;
}

export function formatPersonName(input: string): string {
  return input
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s'-])(\p{L})/gu, (_, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase("pt-BR")}`,
    );
}

export function formatBrazilianMobilePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;

  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (subscriber.length <= 5) return `(${areaCode}) ${subscriber}`;

  return `(${areaCode}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
}

export function isValidBrazilianMobilePhone(input: string): boolean {
  return /^\(\d{2}\) \d{5}-\d{4}$/.test(input);
}

export function isPhoneLikeName(input: string | null | undefined): boolean {
  const value = input?.trim();
  if (!value) return false;

  const digits = value.replace(/\D/g, "");
  const letters = value.replace(/[^a-zA-ZÀ-ÿ]/g, "");

  return digits.length >= 7 && letters.length === 0;
}

export function normalizeDisplayName(
  input: string | null | undefined,
  email: string,
  phone?: string | null,
): string {
  const value = input?.trim();
  const emailFallback = email.split("@")[0] || email;
  const sameAsPhone =
    Boolean(value && phone) && value!.replace(/\D/g, "") === phone!.replace(/\D/g, "");

  if (!value || isPhoneLikeName(value) || sameAsPhone) {
    return emailFallback;
  }

  return value;
}
