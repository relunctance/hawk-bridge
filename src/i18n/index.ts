// i18n utility — reads language from HawkConfig.i18n.lang (default: zh)
import zh from './zh.json';
import en from './en.json';
import type { HawkConfig } from '../types.js';

const TRANSLATIONS: Record<string, Record<string, string>> = { zh, en };

export type SupportedLang = 'zh' | 'en';

export function getLang(config?: Partial<HawkConfig>): SupportedLang {
  return (config?.i18n?.lang as SupportedLang) || 'zh';
}

/**
 * Translate a key to the current language.
 * Falls back to Chinese if key not found in target language.
 */
export function t(key: string, lang: SupportedLang = 'zh'): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['zh']?.[key] ?? key;
}

/**
 * Translate multiple keys at once.
 */
export function tpl(keys: string[], lang: SupportedLang = 'zh'): string[] {
  return keys.map(k => t(k, lang));
}
