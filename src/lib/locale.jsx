import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { formatTranslation, getTranslation, SUPPORTED_LANGUAGES } from "@/lib/i18n";

const LOCALE_STORAGE_KEY = "studybridge.locale";

const LocaleContext = createContext(null);

function getStoredLanguage() {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(LOCALE_STORAGE_KEY) || "en";
}

export function LocaleProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState(getStoredLanguage());

  useEffect(() => {
    const preferred = user?.preferred_language || user?.language;
    if (preferred && preferred !== language) {
      setLanguageState(preferred);
    }
  }, [user?.preferred_language, user?.language, language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => {
    const t = (key, vars = {}, fallback = "") => formatTranslation(getTranslation(language, key, fallback), vars);

    return {
      language,
      setLanguage: setLanguageState,
      supportedLanguages: SUPPORTED_LANGUAGES,
      t,
    };
  }, [language]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
