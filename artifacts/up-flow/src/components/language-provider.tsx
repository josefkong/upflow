"use client";

import * as React from "react";

import { translations, type Language } from "@/lib/i18n/translations";
import { formatActionTranslation } from "@/lib/i18n/action-title-case";

type TranslationVars = Record<string, string | number>;

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, vars?: TranslationVars) => string;
}

const STORAGE_KEY = "upflow.language";


const LanguageContext = React.createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => null,
  toggleLanguage: () => null,
  t: (key) => key,
});

function normalizeLanguage(value: string | null): Language | null {
  if (value === "en" || value === "pt-BR") return value;
  return null;
}

function interpolate(value: string, vars?: TranslationVars) {
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`,
  );
}

function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>("en");

  React.useEffect(() => {
    try {
      const stored = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
      if (stored) {
        applyDocumentLanguage(stored);
        setLanguageState(stored);
      }
    } catch {
      // localStorage can be unavailable in privacy modes; English stays as default.
    }
  }, []);

  const setLanguage = React.useCallback((next: Language) => {
    applyDocumentLanguage(next);
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-persistent language selection is still usable for the current session.
    }
  }, []);

  React.useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const value = React.useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage(language === "en" ? "pt-BR" : "en"),
      t: (key, vars) => {
        const localized = translations[language][key] ?? translations.en[key] ?? key;
        return interpolate(formatActionTranslation(key, localized, language), vars);
      },
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return React.useContext(LanguageContext);
}
