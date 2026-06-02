import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@vpn/types';
import { ru } from './locales/ru';
import { tr } from './locales/tr';
import { tk } from './locales/tk';

export const DEFAULT_LANGUAGE: Language = 'ru';

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    tr: { translation: tr },
    tk: { translation: tk },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export async function changeLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
}

export default i18n;
