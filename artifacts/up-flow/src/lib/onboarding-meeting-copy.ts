const SHARED_MEETING_DEPARTMENT_BY_KEY = new Map<string, string>([
  ["shared_onboarding:scheduling:01:support-finance-admin", "Suporte"],
  ["shared_onboarding:scheduling:02:performance", "Performance"],
  ["shared_onboarding:scheduling:03:creative", "Criação"],
]);
const DEPARTMENT_SMALL_WORDS = new Set([
  "a",
  "as",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "para",
  "por",
]);
const DEPARTMENT_WORD_PATTERN =
  /[\p{L}\p{M}\p{N}]+(?:[-’'][\p{L}\p{M}\p{N}]+)*/gu;

function titleCaseDepartment(value: string) {
  let wordIndex = 0;
  return value.replace(DEPARTMENT_WORD_PATTERN, (word) => {
    const currentIndex = wordIndex++;
    const normalized = word.toLocaleLowerCase("pt-BR");
    if (currentIndex > 0 && DEPARTMENT_SMALL_WORDS.has(normalized)) {
      return normalized;
    }
    if (/\p{Lu}/u.test(word.slice(1))) return word;
    return `${word.charAt(0).toLocaleUpperCase("pt-BR")}${word.slice(1)}`;
  });
}

export function onboardingMeetingDepartment(input: {
  automationKey?: string | null;
  department?: string | null;
}) {
  const sharedDepartment = input.automationKey
    ? SHARED_MEETING_DEPARTMENT_BY_KEY.get(input.automationKey)
    : null;
  const department = sharedDepartment ?? input.department?.trim() ?? "";
  if (!department) return "Onboarding";

  if (/^(?:technical support|suporte t[eé]cnico)$/i.test(department)) {
    return "Suporte";
  }

  return titleCaseDepartment(department);
}

export function onboardingMeetingName(input: {
  automationKey?: string | null;
  department?: string | null;
}) {
  return `${onboardingMeetingDepartment(input)} Onboarding Meeting`;
}

export function onboardingMeetingTitle(input: {
  companyName?: string | null;
  automationKey?: string | null;
  department?: string | null;
}) {
  const meetingName = onboardingMeetingName(input);
  const companyName = input.companyName?.trim();
  return companyName ? `${companyName} - ${meetingName}` : meetingName;
}
