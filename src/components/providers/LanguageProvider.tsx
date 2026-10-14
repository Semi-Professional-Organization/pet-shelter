"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore, useMemo } from "react";
import { Language, TranslationDictionary, TranslationKey, translations } from "@/lib/i18n/translations";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
  dictionary: TranslationDictionary;
  isMs: boolean;
}

const STORAGE_KEY = "hope_for_strays_lang";

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("languagechange", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("languagechange", callback);
  };
}

function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "en" || stored === "ms") return stored;
  } catch {
    // Ignore localStorage access errors in private browsing
  }
  return null;
}

function getServerSnapshot(): Language | null {
  return null;
}

/**
 * Resolves a dictionary path for a language: the active dictionary, then
 * English, then the caller's fallback text, then the path itself; then fills
 * `{name}` placeholders from `params`.
 *
 * One implementation for both `t`s. The provider's and the no-provider
 * fallback in `useLanguage` used to be separate copies, and they had
 * diverged: outside a provider a fallback string was returned *ahead of* the
 * dictionary — the reverse of the real `t` — and params were never
 * interpolated, so `Footer` rendered without a provider printed
 * "ROS Reg: {regNo}" in place of the shelter's registration number.
 */
function translate(
  language: Language,
  path: string,
  fallbackOrParams?: string | Record<string, string | number>,
  params?: Record<string, string | number>,
): string {
  let fallbackText = "";
  let interpolationParams: Record<string, string | number> | undefined = undefined;

  if (typeof fallbackOrParams === "string") {
    fallbackText = fallbackOrParams;
    interpolationParams = params;
  } else if (typeof fallbackOrParams === "object") {
    interpolationParams = fallbackOrParams;
  }

  const dict = translations[language] || translations.en;
  const fallbackDict = translations.en;

  const keys = path.split(".");
  let current: unknown = dict;
  let currentFallback: unknown = fallbackDict;

  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      current = undefined;
    }

    if (currentFallback && typeof currentFallback === "object" && k in currentFallback) {
      currentFallback = (currentFallback as Record<string, unknown>)[k];
    } else {
      currentFallback = undefined;
    }
  }

  let result = typeof current === "string" ? current : typeof currentFallback === "string" ? currentFallback : fallbackText || path;

  if (interpolationParams) {
    Object.entries(interpolationParams).forEach(([paramKey, paramVal]) => {
      result = result.replace(new RegExp(`{${paramKey}}`, "g"), String(paramVal));
    });
  }

  return result;
}

export function LanguageProvider({
  children,
  defaultLanguage = "en",
}: {
  children: React.ReactNode;
  defaultLanguage?: Language;
}) {
  const storeLanguage = useSyncExternalStore(
    subscribe,
    getStoredLanguage,
    getServerSnapshot
  );
  const [explicitLanguage, setExplicitLanguage] = useState<Language | null>(null);
  const language = explicitLanguage ?? storeLanguage ?? defaultLanguage;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((newLang: Language) => {
    setExplicitLanguage(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.cookie = `${STORAGE_KEY}=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLang;
      }
      window.dispatchEvent(new Event("languagechange"));
    } catch {
      // Ignore cookie or storage errors
    }
  }, []);

  const t = useCallback(
    (
      path: string,
      fallbackOrParams?: string | Record<string, string | number>,
      params?: Record<string, string | number>
    ): string => translate(language, path, fallbackOrParams, params),
    [language]
  );

  const value: LanguageContextValue = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      dictionary: translations[language] || translations.en,
      isMs: language === "ms",
    }),
    [language, setLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return a safe fallback context for tests or isolated component usage
    const fallbackLang: Language = "en";
    const dict = translations.en;
    return {
      language: fallbackLang,
      setLanguage: () => {},
      t: (path, fallbackOrParams, params) => translate(fallbackLang, path, fallbackOrParams, params),
      dictionary: dict,
      isMs: false,
    };
  }
  return context;
}

/**
 * `t`, restricted to keys that exist in the dictionary.
 *
 * `useLanguage().t` takes a plain `string` and, as its last resort, returns
 * the path it was handed. So a key that is renamed, misspelled or never added
 * type-checks clean and renders as literal text — `home.step1Title` as a card
 * heading. Calling through this hook makes that a compile error instead.
 *
 * Why a second hook rather than typing `t` itself: typing `t` was tried and
 * produced 38 errors in nine files. Twenty are dynamic keys that need
 * threading through as `TranslationKey`; eighteen are keys that exist in
 * neither dictionary, and so already render English on the Malay site — see
 * `tasks/open/translation-keys-the-dictionary-does-not-have.md`. Components
 * move to this hook one at a time; once nothing still needs the untyped form,
 * `t` itself should take `TranslationKey` and this hook should go.
 */
export function useTypedTranslation(): {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  isMs: boolean;
} {
  // Returns `isMs` too, so a component reads the context once rather than
  // calling `useLanguage()` again beside this. Params pass through, so a key
  // with `{placeholders}` — `footer.rosReg` — can use the typed form.
  //
  // ceiling: `params` is optional for every key, so `t("footer.rosReg")` with
  // no params type-checks and renders "ROS Reg: {regNo}". Requiring params for
  // exactly the keys that contain a placeholder needs the dictionary's values
  // visible to the type system, and `TranslationDictionary` types them as
  // `string`. Upgrade path: declare the dictionaries `as const satisfies
  // TranslationDictionary` and derive a placeholder map from the values.
  const { t, isMs } = useLanguage();
  const typed = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      params ? t(key, params) : t(key),
    [t],
  );
  return { t: typed, isMs };
}
