import * as Localization from 'expo-localization';
import { LANGUAGES, type Language } from '@vpn/types';

/**
 * Picks the app language from the device locale without ever asking the user
 * (CLAUDE.md §6 — frictionless entry). Turkmenistan-first: a TM region or a `tk`
 * locale → Turkmen; otherwise the device language if we support it; else Russian.
 */
export function detectLanguage(): Language {
  const locale = Localization.getLocales()[0];
  const lang = (locale?.languageCode ?? '').toLowerCase();
  const region = (locale?.regionCode ?? '').toUpperCase();

  if (lang === 'tk' || region === 'TM') return 'tk';
  if ((LANGUAGES as readonly string[]).includes(lang)) return lang as Language;
  return 'ru';
}
