const LOCALES: Record<string, string> = { en: 'en-US', gu: 'gu-IN', hi: 'hi-IN' }

/** BCP 47 locale for date/number formatting in the given app language. */
export function localeFor(language: string): string {
  return LOCALES[language] ?? LOCALES.en
}
