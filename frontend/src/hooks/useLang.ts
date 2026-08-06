/**
 * hooks/useLang.ts — 向后兼容 hook
 * 原 import { useLang } from '@/context/LangContext' → 改为本文件即可
 */
export { useLang, useLangStore } from '@/store/useLangStore';
export type { Lang } from '@/store/useLangStore';
