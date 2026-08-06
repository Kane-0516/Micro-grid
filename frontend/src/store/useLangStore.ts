/**
 * store/useLangStore.ts — 全局语言状态（替代 LangContext）
 *
 * 用法：
 *   const { lang, t, toggle } = useLangStore();
 */
import { create } from 'zustand';
import dict from '@/i18n/translations';

export type Lang = 'zh' | 'en';

interface LangStore {
  lang: Lang;
  toggle: () => void;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

export const useLangStore = create<LangStore>((set, get) => ({
  lang: 'en',

  toggle: () =>
    set(s => ({ lang: s.lang === 'zh' ? 'en' : 'zh' })),

  setLang: (l: Lang) => set({ lang: l }),

  t: (key: string): string => {
    const entry = dict[key];
    if (!entry) return key;
    return entry[get().lang] ?? key;
  },
}));

/** 向后兼容 hook（原 useLang() 调用无需改动） */
export const useLang = () => useLangStore();
