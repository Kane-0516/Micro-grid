export function getLocalizedProductLabel(
  item: {
    displayName?: string;
    displayNameEn?: string;
    displayNameZh?: string;
  } | null | undefined,
  lang: 'zh' | 'en',
): string {
  if (!item) return '';
  if (lang === 'zh') {
    return item.displayNameZh || item.displayName || item.displayNameEn || '';
  }
  return item.displayNameEn || item.displayName || item.displayNameZh || '';
}
