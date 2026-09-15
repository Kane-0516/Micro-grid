import type { ProductAdminCategory, ProductAdminItem, ProductAdminSettingKey } from '@/api/client';

type Lang = 'en' | 'zh';
type SortMode = 'name' | 'key';

export interface FieldDef {
  key: string;
  labelEn: string;
  labelZh: string;
  type: 'text' | 'number' | 'textarea' | 'json';
  helpEn?: string;
  helpZh?: string;
}

export interface SettingDef {
  key: ProductAdminSettingKey;
  labelEn: string;
  labelZh: string;
  type: 'text' | 'number' | 'json';
  groupEn: string;
  groupZh: string;
  helpEn?: string;
  helpZh?: string;
  advanced?: boolean;
}

export interface StructuredSubField {
  path: string;
  labelEn: string;
  labelZh: string;
  type: 'text' | 'number' | 'string-list';
  advanced?: boolean;
}

function localize(lang: Lang, en: string, zh: string): string {
  return { en, zh }[lang];
}

function isProductFieldRequired(field: FieldDef) {
  return field.key !== 'description';
}

function workingLabel(lang: Lang, en: string, zh: string, isBusy: boolean) {
  if (isBusy) return lang === 'en' ? 'Working...' : '处理中...';
  return localize(lang, en, zh);
}

function ProductFieldInput({
  field,
  lang,
  value,
  error,
  onChange,
  onBlur,
}: Readonly<{
  field: FieldDef;
  lang: Lang;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}>) {
  const isWide = field.type === 'textarea' || field.type === 'json';
  return (
    <label className={`product-config-page__field${isWide ? ' full' : ''}`}>
      <span>
        {localize(lang, field.labelEn, field.labelZh)}
        {isProductFieldRequired(field) ? <em className="product-config-page__required">*</em> : null}
      </span>
      {field.type === 'number' && (
        <small className="product-config-page__field-help">
          {localize(lang, 'Use a non-negative numeric value.', '请输入大于或等于 0 的数值。')}
        </small>
      )}
      {field.type === 'json' && (
        <small className="product-config-page__field-help">
          {localize(lang, 'JSON format is required.', '请输入有效的 JSON 格式。')}
        </small>
      )}
      {isWide ? (
        <textarea
          className={error ? 'product-config-page__input-error' : ''}
          rows={field.type === 'json' ? 5 : 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <input
          className={error ? 'product-config-page__input-error' : ''}
          type={field.type === 'number' ? 'number' : 'text'}
          step={field.type === 'number' ? 'any' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      )}
      {error ? <small className="product-config-page__field-error">{error}</small> : null}
    </label>
  );
}

function StructuredSettingBlock({
  def,
  lang,
  structuredFields,
  settingsValues,
  settingsFieldErrors,
  getStructuredSettingValue,
  onStructuredChange,
  onStructuredBlur,
}: Readonly<{
  def: SettingDef;
  lang: Lang;
  structuredFields: StructuredSubField[];
  settingsValues: Record<ProductAdminSettingKey, string>;
  settingsFieldErrors: Record<string, string>;
  getStructuredSettingValue: (key: ProductAdminSettingKey, rawValue: string, path: string) => string;
  onStructuredChange: (key: ProductAdminSettingKey, subField: StructuredSubField, rawValue: string) => void;
  onStructuredBlur: (key: ProductAdminSettingKey, subField: StructuredSubField) => void;
}>) {
  return (
    <div className="product-config-page__field full">
      <span>{localize(lang, def.labelEn, def.labelZh)}<em className="product-config-page__required">*</em></span>
      {def.helpEn || def.helpZh ? (
        <small className="product-config-page__field-help">{localize(lang, def.helpEn ?? '', def.helpZh ?? '')}</small>
      ) : null}
      <div className="product-config-page__structured-grid">
        {structuredFields.map((subField) => {
          const errorKey = `${def.key}.${subField.path}`;
          return (
            <label key={errorKey} className="product-config-page__field">
              <span>
                {localize(lang, subField.labelEn, subField.labelZh)}
                {subField.advanced ? <small> {lang === 'en' ? '(Advanced)' : '（高级）'}</small> : null}
                <em className="product-config-page__required">*</em>
              </span>
              <input
                className={settingsFieldErrors[errorKey] ? 'product-config-page__input-error' : ''}
                type={subField.type === 'number' ? 'number' : 'text'}
                step={subField.type === 'number' ? 'any' : undefined}
                placeholder={subField.type === 'string-list' ? 'item_a, item_b' : undefined}
                value={getStructuredSettingValue(def.key, settingsValues[def.key] ?? '', subField.path)}
                onChange={(e) => onStructuredChange(def.key, subField, e.target.value)}
                onBlur={() => onStructuredBlur(def.key, subField)}
              />
              {settingsFieldErrors[errorKey] ? <small className="product-config-page__field-error">{settingsFieldErrors[errorKey]}</small> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PlainSettingField({
  def,
  lang,
  value,
  error,
  onChange,
  onBlur,
}: Readonly<{
  def: SettingDef;
  lang: Lang;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}>) {
  return (
    <label className={`product-config-page__field${def.type === 'json' ? ' full' : ''}`}>
      <span>
        {localize(lang, def.labelEn, def.labelZh)}
        {def.advanced ? <small> {lang === 'en' ? '(Advanced)' : '（高级）'}</small> : null}
        <em className="product-config-page__required">*</em>
      </span>
      {def.helpEn || def.helpZh ? (
        <small className="product-config-page__field-help">{localize(lang, def.helpEn ?? '', def.helpZh ?? '')}</small>
      ) : null}
      {def.type === 'json' ? (
        <textarea
          className={error ? 'product-config-page__input-error' : ''}
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <input
          className={error ? 'product-config-page__input-error' : ''}
          type={def.type === 'number' ? 'number' : 'text'}
          step={def.type === 'number' ? 'any' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      )}
      {error ? <small className="product-config-page__field-error">{error}</small> : null}
    </label>
  );
}

function editorPanelTitle(lang: Lang, isNew: boolean): string {
  if (isNew) return lang === 'en' ? 'Create Item' : '新增条目';
  return lang === 'en' ? 'Edit Item' : '编辑条目';
}

function saveButtonLabel(lang: Lang, saving: boolean): string {
  if (saving) return lang === 'en' ? 'Saving...' : '保存中...';
  return lang === 'en' ? 'Save' : '保存';
}

function listCountLabel(lang: Lang, loading: boolean, count: number): string {
  if (loading) return lang === 'en' ? 'Loading...' : '加载中...';
  const unit = lang === 'en' ? 'items' : '项';
  return `${count} ${unit}`;
}

function ProductItemListPanel({
  lang,
  categoryLabel,
  filteredItems,
  selectedKey,
  isNew,
  loading,
  searchTerm,
  sortMode,
  onSearchChange,
  onSortChange,
  onRefresh,
  onDuplicate,
  onStartNew,
  onOpenItem,
}: Readonly<{
  lang: Lang;
  categoryLabel: string;
  filteredItems: ProductAdminItem[];
  selectedKey: string | null;
  isNew: boolean;
  loading: boolean;
  searchTerm: string;
  sortMode: SortMode;
  onSearchChange: (value: string) => void;
  onSortChange: (mode: SortMode) => void;
  onRefresh: () => void;
  onDuplicate: () => void;
  onStartNew: () => void;
  onOpenItem: (item: ProductAdminItem) => void;
}>) {
  const emptyMessage = searchTerm
    ? (lang === 'en' ? 'No matching items.' : '没有匹配的条目。')
    : (lang === 'en' ? 'No items in this category yet.' : '当前分类还没有条目。');

  return (
    <section className="product-config-page__list">
      <div className="product-config-page__panel-header">
        <h2>{categoryLabel}</h2>
        <span>{listCountLabel(lang, loading, filteredItems.length)}</span>
      </div>
      <div className="product-config-page__toolbar product-config-page__toolbar--stack">
        <div className="product-config-page__filter-row">
          <input
            className="product-config-page__search"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={localize(lang, 'Search by name or key', '按名称或 key 搜索')}
          />
          <select className="product-config-page__select" value={sortMode} onChange={(e) => onSortChange(e.target.value as SortMode)}>
            <option value="name">{localize(lang, 'Sort by name', '按名称排序')}</option>
            <option value="key">{localize(lang, 'Sort by key', '按 key 排序')}</option>
          </select>
        </div>
        <div className="product-config-page__action-row">
          <button className="product-config-page__ghost-btn" type="button" onClick={onRefresh}>{localize(lang, 'Refresh', '刷新')}</button>
          <button className="product-config-page__ghost-btn" type="button" onClick={onDuplicate} disabled={!selectedKey}>{localize(lang, 'Duplicate', '复制新增')}</button>
          <button className="product-config-page__primary-btn" type="button" onClick={onStartNew}>{localize(lang, 'Add New', '新增')}</button>
        </div>
      </div>
      <div className="product-config-page__cards">
        {filteredItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`product-config-page__item-card${selectedKey === item.key && !isNew ? ' active' : ''}`}
            onClick={() => onOpenItem(item)}
          >
            <div className="product-config-page__item-title">{getCardTitle(item)}</div>
            <div className="product-config-page__item-key">{item.key}</div>
          </button>
        ))}
        {!filteredItems.length && !loading && <div className="product-config-page__empty">{emptyMessage}</div>}
      </div>
    </section>
  );
}

function ProductItemEditorPanel({
  lang,
  isNew,
  selectedKey,
  fields,
  formKey,
  formValues,
  formErrors,
  error,
  notice,
  saving,
  onFormKeyChange,
  onFieldChange,
  onFieldBlur,
  onReset,
  onDelete,
  onSave,
}: Readonly<{
  lang: Lang;
  isNew: boolean;
  selectedKey: string | null;
  fields: FieldDef[];
  formKey: string;
  formValues: Record<string, string>;
  formErrors: Record<string, string>;
  error: string | null;
  notice: string | null;
  saving: boolean;
  onFormKeyChange: (value: string) => void;
  onFieldChange: (field: FieldDef, value: string) => void;
  onFieldBlur: (field: FieldDef) => void;
  onReset: () => void;
  onDelete: () => void;
  onSave: () => void;
}>) {
  return (
    <section className="product-config-page__editor">
      <div className="product-config-page__panel-header">
        <h2>{editorPanelTitle(lang, isNew)}</h2>
        {!isNew && selectedKey && <span>{selectedKey}</span>}
      </div>
      <label className="product-config-page__field">
        <span>{localize(lang, 'Key / Model ID', '唯一标识 / 型号 ID')}</span>
        <input
          value={formKey}
          onChange={(e) => onFormKeyChange(e.target.value)}
          placeholder={localize(lang, 'e.g. 655W or small', '例如 655W 或 small')}
          disabled={!isNew}
        />
      </label>
      <div className="product-config-page__form-grid">
        {fields.map((field) => (
          <ProductFieldInput
            key={field.key}
            field={field}
            lang={lang}
            value={formValues[field.key] ?? ''}
            error={formErrors[field.key]}
            onChange={(value) => onFieldChange(field, value)}
            onBlur={() => onFieldBlur(field)}
          />
        ))}
      </div>
      {error && <div className="product-config-page__alert error">{error}</div>}
      {notice && <div className="product-config-page__alert success">{notice}</div>}
      <div className="product-config-page__editor-actions">
        <button className="product-config-page__ghost-btn" type="button" onClick={onReset} disabled={saving}>{localize(lang, 'Reset', '重置')}</button>
        {!isNew && (
          <button className="product-config-page__danger-btn" type="button" onClick={onDelete} disabled={saving || !formKey}>{localize(lang, 'Delete', '删除')}</button>
        )}
        <button className="product-config-page__primary-btn" type="button" onClick={onSave} disabled={saving}>
          {saveButtonLabel(lang, saving)}
        </button>
      </div>
    </section>
  );
}

export function ProductRecordsView({
  lang,
  categoryOrder,
  categoryLabels,
  category,
  categoryLabel,
  filteredItems,
  selectedKey,
  isNew,
  loading,
  searchTerm,
  sortMode,
  fields,
  formKey,
  formValues,
  formErrors,
  error,
  notice,
  saving,
  onCategoryChange,
  onSearchChange,
  onSortChange,
  onRefresh,
  onDuplicate,
  onStartNew,
  onOpenItem,
  onFormKeyChange,
  onFieldChange,
  onFieldBlur,
  onReset,
  onDelete,
  onSave,
}: Readonly<{
  lang: Lang;
  categoryOrder: ProductAdminCategory[];
  categoryLabels: Record<ProductAdminCategory, { en: string; zh: string }>;
  category: ProductAdminCategory;
  categoryLabel: string;
  filteredItems: ProductAdminItem[];
  selectedKey: string | null;
  isNew: boolean;
  loading: boolean;
  searchTerm: string;
  sortMode: SortMode;
  fields: FieldDef[];
  formKey: string;
  formValues: Record<string, string>;
  formErrors: Record<string, string>;
  error: string | null;
  notice: string | null;
  saving: boolean;
  onCategoryChange: (category: ProductAdminCategory) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (mode: SortMode) => void;
  onRefresh: () => void;
  onDuplicate: () => void;
  onStartNew: () => void;
  onOpenItem: (item: ProductAdminItem) => void;
  onFormKeyChange: (value: string) => void;
  onFieldChange: (field: FieldDef, value: string) => void;
  onFieldBlur: (field: FieldDef) => void;
  onReset: () => void;
  onDelete: () => void;
  onSave: () => void;
}>) {
  return (
    <div className="product-config-page__layout">
      <aside className="product-config-page__categories">
        {categoryOrder.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`product-config-page__category-btn${entry === category ? ' active' : ''}`}
            onClick={() => onCategoryChange(entry)}
          >
            {categoryLabels[entry][lang]}
          </button>
        ))}
      </aside>

      <ProductItemListPanel
        lang={lang}
        categoryLabel={categoryLabel}
        filteredItems={filteredItems}
        selectedKey={selectedKey}
        isNew={isNew}
        loading={loading}
        searchTerm={searchTerm}
        sortMode={sortMode}
        onSearchChange={onSearchChange}
        onSortChange={onSortChange}
        onRefresh={onRefresh}
        onDuplicate={onDuplicate}
        onStartNew={onStartNew}
        onOpenItem={onOpenItem}
      />

      <ProductItemEditorPanel
        lang={lang}
        isNew={isNew}
        selectedKey={selectedKey}
        fields={fields}
        formKey={formKey}
        formValues={formValues}
        formErrors={formErrors}
        error={error}
        notice={notice}
        saving={saving}
        onFormKeyChange={onFormKeyChange}
        onFieldChange={onFieldChange}
        onFieldBlur={onFieldBlur}
        onReset={onReset}
        onDelete={onDelete}
        onSave={onSave}
      />
    </div>
  );
}

function settingsGroupLabel(lang: Lang, loading: boolean, count: number): string {
  if (loading) return lang === 'en' ? 'Loading...' : '加载中...';
  const unit = lang === 'en' ? 'fields' : '项';
  return `${count} ${unit}`;
}

function settingsSaveLabel(lang: Lang, saving: boolean): string {
  if (saving) return lang === 'en' ? 'Saving...' : '保存中...';
  return lang === 'en' ? 'Save Settings' : '保存设置';
}

function SettingGroupCard({
  groupName,
  defs,
  lang,
  settingsLoading,
  structuredSettingFields,
  settingsValues,
  settingsFieldErrors,
  getStructuredSettingValue,
  onStructuredChange,
  onStructuredBlur,
  onSettingChange,
  onSettingBlur,
}: Readonly<{
  groupName: string;
  defs: SettingDef[];
  lang: Lang;
  settingsLoading: boolean;
  structuredSettingFields: Partial<Record<ProductAdminSettingKey, StructuredSubField[]>>;
  settingsValues: Record<ProductAdminSettingKey, string>;
  settingsFieldErrors: Record<string, string>;
  getStructuredSettingValue: (key: ProductAdminSettingKey, rawValue: string, path: string) => string;
  onStructuredChange: (key: ProductAdminSettingKey, subField: StructuredSubField, rawValue: string) => void;
  onStructuredBlur: (key: ProductAdminSettingKey, subField: StructuredSubField) => void;
  onSettingChange: (key: ProductAdminSettingKey, rawValue: string) => void;
  onSettingBlur: (def: SettingDef) => void;
}>) {
  return (
    <section className="product-config-page__settings-card">
      <div className="product-config-page__panel-header">
        <h2>{groupName}</h2>
        <span>{settingsGroupLabel(lang, settingsLoading, defs.length)}</span>
      </div>
      <div className="product-config-page__form-grid product-config-page__form-grid--single">
        {defs.map((def) => {
          const structuredFields = structuredSettingFields[def.key];
          if (structuredFields) {
            return (
              <StructuredSettingBlock
                key={def.key}
                def={def}
                lang={lang}
                structuredFields={structuredFields}
                settingsValues={settingsValues}
                settingsFieldErrors={settingsFieldErrors}
                getStructuredSettingValue={getStructuredSettingValue}
                onStructuredChange={onStructuredChange}
                onStructuredBlur={onStructuredBlur}
              />
            );
          }
          return (
            <PlainSettingField
              key={def.key}
              def={def}
              lang={lang}
              value={settingsValues[def.key] ?? ''}
              error={settingsFieldErrors[def.key]}
              onChange={(value) => onSettingChange(def.key, value)}
              onBlur={() => onSettingBlur(def)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function CatalogSettingsView({
  lang,
  settingGroups,
  structuredSettingFields,
  settingsValues,
  settingsFieldErrors,
  settingsLoading,
  settingsSaving,
  settingsError,
  settingsNotice,
  getStructuredSettingValue,
  onRefresh,
  onSave,
  onSettingChange,
  onSettingBlur,
  onStructuredChange,
  onStructuredBlur,
}: Readonly<{
  lang: Lang;
  settingGroups: [string, SettingDef[]][];
  structuredSettingFields: Partial<Record<ProductAdminSettingKey, StructuredSubField[]>>;
  settingsValues: Record<ProductAdminSettingKey, string>;
  settingsFieldErrors: Record<string, string>;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string | null;
  settingsNotice: string | null;
  getStructuredSettingValue: (key: ProductAdminSettingKey, rawValue: string, path: string) => string;
  onRefresh: () => void;
  onSave: () => void;
  onSettingChange: (key: ProductAdminSettingKey, rawValue: string) => void;
  onSettingBlur: (def: SettingDef) => void;
  onStructuredChange: (key: ProductAdminSettingKey, subField: StructuredSubField, rawValue: string) => void;
  onStructuredBlur: (key: ProductAdminSettingKey, subField: StructuredSubField) => void;
}>) {
  return (
    <div className="product-config-page__settings-view">
      <div className="product-config-page__settings-header">
        <div>
          <h2>{localize(lang, 'Catalog Settings', '产品库设置')}</h2>
          <p>
            {lang === 'en'
              ? 'These settings control default selections, layout rules, and shared pricing or simulation parameters.'
              : '这些设置用于控制默认选项、布局规则，以及共享的价格和仿真参数。'}
          </p>
        </div>
        <div className="product-config-page__header-actions">
          <button className="product-config-page__ghost-btn" type="button" onClick={onRefresh}>{localize(lang, 'Refresh Settings', '刷新设置')}</button>
          <button className="product-config-page__primary-btn" type="button" onClick={onSave} disabled={settingsSaving}>
            {settingsSaveLabel(lang, settingsSaving)}
          </button>
        </div>
      </div>
      {settingsError && <div className="product-config-page__alert error">{settingsError}</div>}
      {settingsNotice && <div className="product-config-page__alert success">{settingsNotice}</div>}
      <div className="product-config-page__settings-grid">
        {settingGroups.map(([groupName, defs]) => (
          <SettingGroupCard
            key={groupName}
            groupName={groupName}
            defs={defs}
            lang={lang}
            settingsLoading={settingsLoading}
            structuredSettingFields={structuredSettingFields}
            settingsValues={settingsValues}
            settingsFieldErrors={settingsFieldErrors}
            getStructuredSettingValue={getStructuredSettingValue}
            onStructuredChange={onStructuredChange}
            onStructuredBlur={onStructuredBlur}
            onSettingChange={onSettingChange}
            onSettingBlur={onSettingBlur}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductConfigHeader({
  lang,
  view,
  porting,
  onExport,
  onImportClick,
  onViewChange,
}: Readonly<{
  lang: Lang;
  view: 'products' | 'settings';
  porting: boolean;
  onExport: () => void;
  onImportClick: () => void;
  onViewChange: (view: 'products' | 'settings') => void;
}>) {
  return (
    <div className="product-config-page__header">
      <div>
        <h1 className="product-config-page__title">{localize(lang, 'Product Configuration', '产品配置')}</h1>
        <p className="product-config-page__subtitle">
          {lang === 'en'
            ? 'Maintain product records, bilingual names, package definitions, and shared catalog settings in one workspace.'
            : '在同一个页面中维护产品记录、双语名称、标准套餐和共享产品库设置。'}
        </p>
      </div>
      <div className="product-config-page__header-actions">
        <button className="product-config-page__ghost-btn" type="button" onClick={onExport} disabled={porting}>
          {workingLabel(lang, 'Export Catalog', '导出产品库', porting)}
        </button>
        <button className="product-config-page__ghost-btn" type="button" onClick={onImportClick} disabled={porting}>
          {localize(lang, 'Import Catalog', '导入产品库')}
        </button>
        <button className={`product-config-page__view-tab${view === 'products' ? ' active' : ''}`} type="button" onClick={() => onViewChange('products')}>
          {localize(lang, 'Product Records', '产品条目')}
        </button>
        <button className={`product-config-page__view-tab${view === 'settings' ? ' active' : ''}`} type="button" onClick={() => onViewChange('settings')}>
          {localize(lang, 'Catalog Settings', '产品库设置')}
        </button>
      </div>
    </div>
  );
}

function getCardTitle(item: ProductAdminItem): string {
  const data = item.data as Record<string, unknown>;
  return String(data.display_name_en || data.display_name || item.key);
}

export { getCardTitle };
