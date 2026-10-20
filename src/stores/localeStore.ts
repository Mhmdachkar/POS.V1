import { create } from 'zustand'

export type Locale = 'fr' | 'en'

const STORAGE_KEY = 'vhm-pos-locale'

function readStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'en' || value === 'fr') return value
  } catch {
    /* private mode */
  }
  return 'fr'
}

function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* private mode */
  }
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: readStoredLocale(),
  setLocale: (locale) => {
    writeStoredLocale(locale)
    set({ locale })
  },
}))
