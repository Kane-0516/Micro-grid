import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './product-config-shell.css'
import { ProductConfigPage } from '@/features/product-config'
import { useLangStore } from '@/store/useLangStore'
import { useProductsStore } from '@/store/useProductsStore'

function ProductAdminApp() {
  const { lang, setLang } = useLangStore()
  const { isLoading, loadError, retry, init } = useProductsStore()

  React.useEffect(() => {
    init()
  }, [init])

  return (
    <div className="product-config-shell">
      <header className="product-config-shell__header">
        <div className="product-config-shell__brand">
          <h1>{lang === 'zh' ? '产品配置控制台' : 'Product Configuration Console'}</h1>
          <p>
            {lang === 'zh'
              ? '用于维护产品目录、标准套餐与全局参数，不面向顾客端。'
              : 'Manage the product catalog, standard packages, and global settings for engineers only.'}
          </p>
        </div>

        <div className="product-config-shell__actions">
          <a className="product-config-shell__link" href="/">
            {lang === 'zh' ? '返回顾客端工具' : 'Back to customer tool'}
          </a>
          <button
            type="button"
            className="product-config-shell__lang-btn"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          >
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>
      </header>

      <main className="product-config-shell__main">
        {isLoading ? (
          <section className="product-config-shell__state-card">
            <h2>{lang === 'zh' ? '产品目录加载中' : 'Loading product catalog'}</h2>
            <p>
              {lang === 'zh'
                ? '正在读取后端产品库，请稍候。'
                : 'Reading the backend product catalog. Please wait.'}
            </p>
          </section>
        ) : loadError ? (
          <section className="product-config-shell__state-card product-config-shell__state-card--error">
            <h2>{lang === 'zh' ? '产品目录加载失败' : 'Failed to load product catalog'}</h2>
            <p>{loadError}</p>
            <button type="button" className="product-config-shell__retry-btn" onClick={retry}>
              {lang === 'zh' ? '重新加载产品库' : 'Reload catalog'}
            </button>
          </section>
        ) : (
          <ProductConfigPage />
        )}
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProductAdminApp />
  </React.StrictMode>,
)
