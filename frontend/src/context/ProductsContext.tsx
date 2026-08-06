/**
 * context/ProductsContext.tsx — 向后兼容垫片
 * 保持原有 import 路径不变，内部委托给 Zustand store
 */
export { useProducts } from '@/store/useProductsStore';
export type { DieselGenerator, ProductsCatalog } from '@/store/useProductsStore';

// ProductsProvider 已无必要（Zustand 自动初始化），保留空实现
import type { ReactNode } from 'react';
export function ProductsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
