/**
 * hooks/useProducts.ts — 向后兼容 hook
 * 原 import { useProducts } from '@/context/ProductsContext' → 改为本文件即可
 */
export { useProducts, useProductsStore } from '@/store/useProductsStore';
export type { DieselGenerator, ProductsCatalog } from '@/store/useProductsStore';
