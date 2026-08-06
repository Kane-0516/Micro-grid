/**
 * context/LangContext.tsx — 向后兼容垫片
 * 保持原有 import 路径不变，内部委托给 Zustand store
 */
export { useLang } from '@/store/useLangStore';
export type { Lang } from '@/store/useLangStore';

// LangProvider 已无必要，保留空实现避免现有代码报错
import type { ReactNode } from 'react';
export function LangProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
