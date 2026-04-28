import { create } from 'zustand';

export type AppLanguage = 'ru' | 'en';

const LANGUAGE_LS_KEY = 'pinit_language';

const readStoredLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'ru';

  try {
    const stored = window.localStorage.getItem(LANGUAGE_LS_KEY);
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    // ignore
  }

  const browserLanguage = String(window.navigator.language || '').toLowerCase();
  return browserLanguage.startsWith('en') ? 'en' : 'ru';
};

const persistLanguage = (language: AppLanguage) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LANGUAGE_LS_KEY, language);
  } catch {
    // ignore
  }
};

type LanguageState = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readStoredLanguage(),
  setLanguage: (language) => {
    persistLanguage(language);
    set({ language });
  },
}));
