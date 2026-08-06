/**
 * MicrogridTopology.tsx — 微电网拓扑图
 * ESS 居中，设备图片表示 PV/Load/ESS/Diesel，描述与设备保持距离
 * 使用动态折线连接，随分辨率变化自动适配：PV右侧→ESS上侧，Load右侧→ESS下侧，Diesel上侧→ESS右侧
 */
import { useRef, useState, useLayoutEffect } from 'react';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/context/ProductsContext';
import pvImg from '@/assets/images/PV.png';
import loadImg from '@/assets/images/Load.png';
import essImg from '@/assets/images/ESS.png';
import dieselImg from '@/assets/images/Diesel.png';
import { formatAreaDual } from '@/utils/unitFormat';
import './MicrogridTopology.css';

export interface TopologyMetric {
  name: string;
  value: string | number;
  unit: string;
}

export interface TopologyData {
  pv: {
    title: string;
    capacity: TopologyMetric;
    sets?: TopologyMetric;
    panelModel?: string;
    areaM2?: number;
    /** 自定义展示项（用于 DIY 等场景，若存在则优先展示） */
    customItems?: TopologyMetric[];
  };
  load: {
    title: string;
    annualKwh: TopologyMetric;
    loadType?: string;
    peakKw?: number;
    customItems?: TopologyMetric[];
  };
  ess: {
    title: string;
    capacity: TopologyMetric;
    storageDays?: TopologyMetric;
    packModel?: string;
    customItems?: TopologyMetric[];
  };
  diesel: {
    title: string;
    capacity: TopologyMetric;
    isNew?: boolean;
    customItems?: TopologyMetric[];
  };
}

export interface TopologyVisibility {
  pv: boolean;
  load: boolean;
  ess: boolean;
  diesel: boolean;
}

interface MicrogridTopologyProps {
  className?: string;
  data?: Partial<TopologyData>;
  visibility?: Partial<TopologyVisibility>;
  /** wizard: 向导内尺寸 | standard: 标准化产品页更大尺寸 */
  variant?: 'wizard' | 'standard';
  /** config: 配置过程 Diesel 卡片右侧 | schematic/standard: Diesel 卡片左侧 */
  layoutMode?: 'config' | 'schematic' | 'standard';
  /** 已知负载：PV 卡片始终显示 4 项（最大光伏容量、最大支架套数、组件型号、最大占地面积），未选显示 — */
  pvFullFields?: boolean;
}

const DEFAULT_VISIBILITY: TopologyVisibility = {
  pv: true,
  load: true,
  ess: true,
  diesel: true,
};

const COLORS = {
  pv: '#f59e0b',
  load: '#3b82f6',
  ess: '#10b981',
  diesel: '#6366f1',
};

const DEVICE_IMAGES: Record<string, string> = {
  pv: pvImg,
  load: loadImg,
  ess: essImg,
  diesel: dieselImg,
};

/** 连接线路径数据：多段折线，基于容器内百分比坐标 0-100 */
interface LinePaths {
  pv: string;
  load: string;
  diesel: string;
}

function DeviceBlock({
  id,
  title,
  color,
  items,
  visible = true,
  note,
  variant = 'wizard',
}: {
  id: string;
  title: string;
  color: string;
  items: { label: string; value: string | number; unit?: string }[];
  visible?: boolean;
  note?: string;
  variant?: 'wizard' | 'standard';
}) {
  if (!visible) return null;

  const imgSrc = DEVICE_IMAGES[id];

  return (
    <div className={`topology-device topology-device--${id} topology-device--${variant}`} data-device={id}>
      {/* 连接线连接主体：仅图片，不含卡片 */}
      <div className="topology-device__img-wrap" style={{ background: imgSrc ? 'transparent' : color }}>
        {imgSrc ? (
          <img src={imgSrc} alt={title} className="topology-device__img" />
        ) : (
          <span className="topology-device__label">{title}</span>
        )}
      </div>
      {/* 描述卡片：绝对定位，不参与连接 */}
      <div className="topology-device__info" style={{ borderLeftColor: color }}>
        <div className="topology-device__info-title">{title}</div>
        <div className="topology-device__info-items">
          {items.map((item, i) => (
            <div key={i} className="topology-device__info-row">
              <span className="topology-device__info-label">{item.label}</span>
              <span className="topology-device__info-value">
                {item.value}
                {item.unit && <span className="topology-device__info-unit">{item.unit}</span>}
              </span>
            </div>
          ))}
          {note && (
            <div className="topology-device__info-note">{note}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 根据设备矩形计算折线路径（百分比坐标 0-100） */
function computeLinePaths(
  container: DOMRect,
  pv: DOMRect | null,
  load: DOMRect | null,
  ess: DOMRect | null,
  diesel: DOMRect | null,
): LinePaths {
  const toPct = (x: number, y: number) => ({
    x: ((x - container.left) / container.width) * 100,
    y: ((y - container.top) / container.height) * 100,
  });
  const empty = { pv: '', load: '', diesel: '' };
  if (!ess) return empty;

  const essCx = (ess.left + ess.right) / 2;
  const essCy = (ess.top + ess.bottom) / 2;
  const essTop = ess.top;
  const essBottom = ess.bottom;
  const essRight = ess.right;

  const pvPath = pv
    ? (() => {
        const pvRight = pv.right;
        const pvCy = pv.top + pv.height / 2;
        const a = toPct(pvRight, pvCy);
        const b = toPct(essCx, pvCy);
        const c = toPct(essCx, essTop);
        return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`;
      })()
    : '';
  const loadPath = load
    ? (() => {
        const loadRight = load.right;
        const loadCy = load.top + load.height / 2;
        const a = toPct(loadRight, loadCy);
        const b = toPct(essCx, loadCy);
        const c = toPct(essCx, essBottom);
        return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`;
      })()
    : '';
  const dieselPath = diesel
    ? (() => {
        const dieselCx = diesel.left + diesel.width / 2;
        const dieselTop = diesel.top;
        const a = toPct(dieselCx, dieselTop);
        const b = toPct(dieselCx, essCy);
        const c = toPct(essRight, essCy);
        return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`;
      })()
    : '';

  return { pv: pvPath, load: loadPath, diesel: dieselPath };
}

export default function MicrogridTopology({ className = '', data, visibility, variant = 'wizard', layoutMode = 'schematic', pvFullFields = false }: MicrogridTopologyProps) {
  const { lang } = useLang();
  const { defaultPanelModel, defaultBatteryModel, defaultBracketModel, calcPvKw, getBracketByModel, homeBgDefaults } = useProducts();
  const containerRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<LinePaths>({ pv: '', load: '', diesel: '' });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const container = el.getBoundingClientRect();
      if (container.width === 0 || container.height === 0) return;
      const pvWrap = el.querySelector('.topology-device--pv .topology-device__img-wrap') as HTMLElement | null;
      const loadWrap = el.querySelector('.topology-device--load .topology-device__img-wrap') as HTMLElement | null;
      const essWrap = el.querySelector('.topology-device--ess .topology-device__img-wrap') as HTMLElement | null;
      const dieselWrap = el.querySelector('.topology-device--diesel .topology-device__img-wrap') as HTMLElement | null;
      const pv = pvWrap?.getBoundingClientRect() ?? null;
      const load = loadWrap?.getBoundingClientRect() ?? null;
      const ess = essWrap?.getBoundingClientRect() ?? null;
      const diesel = dieselWrap?.getBoundingClientRect() ?? null;
      setPaths(computeLinePaths(container, pv, load, ess, diesel));
    };
    update();
    // 首次打开时图片可能未加载，布局未就绪，需延迟重测以适配图片加载完成后的正确尺寸
    const t1 = requestAnimationFrame(() => update());
    const t2 = window.setTimeout(update, 100);
    const t3 = window.setTimeout(update, 400);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // 监听容器内所有图片加载完成
    const imgs = el.querySelectorAll('.topology-device__img');
    const onImgLoad = () => update();
    imgs.forEach((img) => {
      if ((img as HTMLImageElement).complete) onImgLoad();
      else img.addEventListener('load', onImgLoad);
    });
    return () => {
      cancelAnimationFrame(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      imgs.forEach((img) => img.removeEventListener('load', onImgLoad));
    };
  }, [visibility?.pv, visibility?.load, visibility?.ess, visibility?.diesel]);

  const vis = { ...DEFAULT_VISIBILITY, ...visibility };
  const defaultBracket = getBracketByModel(defaultBracketModel);
  const defaultSets = 4;
  const defaultPvKw = calcPvKw(defaultSets, defaultPanelModel, defaultBracketModel);
  const DEFAULT_DATA: TopologyData = {
    pv: {
      title: lang === 'en' ? 'PV' : '??',
      capacity: { name: lang === 'en' ? 'Max PV Capacity' : '??????', value: defaultPvKw, unit: 'kW' },
      sets: { name: lang === 'en' ? 'Max Bracket Sets' : '??????', value: defaultSets, unit: lang === 'en' ? 'sets' : '?' },
      panelModel: defaultPanelModel,
      areaM2: +(defaultBracket.areaM2 * defaultSets).toFixed(1),
    },
    load: {
      title: lang === 'en' ? 'Load' : '??',
      annualKwh: { name: lang === 'en' ? 'Annual Load' : '????', value: homeBgDefaults.annualLoadKwh, unit: 'kWh' },
      loadType: lang === 'en' ? 'Industrial' : '??',
      peakKw: 50,
    },
    ess: {
      title: 'ESS',
      capacity: { name: lang === 'en' ? 'Battery Capacity' : '????', value: homeBgDefaults.batteryKwh, unit: 'kWh' },
      storageDays: { name: lang === 'en' ? 'Storage Days' : '????', value: homeBgDefaults.storageDays, unit: lang === 'en' ? 'day' : '?' },
      packModel: defaultBatteryModel,
    },
    diesel: {
      title: lang === 'en' ? 'Diesel' : '?????',
      capacity: { name: lang === 'en' ? 'Generator Capacity' : '?????', value: homeBgDefaults.dieselKw, unit: 'kW' },
      isNew: false,
    },
  };
  const d = {
    pv: { ...DEFAULT_DATA.pv, ...data?.pv },
    load: { ...DEFAULT_DATA.load, ...data?.load },
    ess: { ...DEFAULT_DATA.ess, ...data?.ess },
    diesel: { ...DEFAULT_DATA.diesel, ...data?.diesel },
  };

  const metricToItem = (m: TopologyMetric) => ({
    label: m.name,
    value: m.value,
    unit: m.unit,
  });

  const pvItems = d.pv.customItems && d.pv.customItems.length > 0
    ? d.pv.customItems.map(metricToItem)
    : pvFullFields
    ? [
        { label: lang === 'en' ? 'Max PV Capacity' : '最大光伏容量', value: d.pv.capacity.value, unit: d.pv.capacity.unit },
        { label: lang === 'en' ? 'Max Bracket Sets' : '最大支架套数', value: d.pv.sets?.value ?? '—', unit: d.pv.sets?.unit ?? '' },
        { label: lang === 'en' ? 'Panel Model' : '组件型号', value: d.pv.panelModel ?? '—', unit: '' },
        { label: lang === 'en' ? 'Max Area' : '最大占地面积', value: formatAreaDual(d.pv.areaM2, lang).combined, unit: '' },
      ]
    : [
        { label: lang === 'en' ? 'Max PV Capacity' : '最大光伏容量', value: d.pv.capacity.value, unit: d.pv.capacity.unit },
        ...(d.pv.sets ? [{ label: lang === 'en' ? 'Max Bracket Sets' : '最大支架套数', value: d.pv.sets.value, unit: d.pv.sets.unit }] : []),
        ...(d.pv.panelModel ? [{ label: lang === 'en' ? 'Panel Model' : '组件型号', value: d.pv.panelModel, unit: '' }] : []),
        ...(d.pv.areaM2 ? [{ label: lang === 'en' ? 'Max Area' : '最大占地面积', value: formatAreaDual(d.pv.areaM2, lang).combined, unit: '' }] : []),
      ];

  const loadTypeMap: Record<string, { zh: string; en: string }> = {
    residential: { zh: '住宅', en: 'Residential' },
    commercial:  { zh: '商业', en: 'Commercial' },
    industrial:  { zh: '工业', en: 'Industrial' },
  };
  const loadTypeLabel = d.load.loadType
    ? (loadTypeMap[d.load.loadType as string]?.[lang as 'zh' | 'en'] ?? d.load.loadType)
    : null;
  const loadItems = d.load.customItems && d.load.customItems.length > 0
    ? d.load.customItems.map(metricToItem)
    : [
        { label: lang === 'en' ? 'Annual Load' : '年用电量', value: d.load.annualKwh.value, unit: d.load.annualKwh.unit },
        ...(loadTypeLabel ? [{ label: lang === 'en' ? 'Load Type' : '负载类型', value: loadTypeLabel, unit: '' }] : []),
        ...(d.load.peakKw != null ? [{ label: lang === 'en' ? 'Peak Load' : '峰值负荷', value: d.load.peakKw, unit: 'kW' }] : []),
      ];

  const essItems = d.ess.customItems && d.ess.customItems.length > 0
    ? d.ess.customItems.map(metricToItem)
    : [
        { label: lang === 'en' ? 'Battery Capacity' : '储能容量', value: d.ess.capacity.value, unit: d.ess.capacity.unit },
        { label: lang === 'en' ? 'Storage Days' : '储能天数', value: d.ess.storageDays?.value ?? '—', unit: d.ess.storageDays?.unit ?? '' },
        { label: lang === 'en' ? 'Pack Model' : '电池包型号', value: d.ess.packModel ?? '—', unit: '' },
      ];

  const dieselItems = d.diesel.customItems && d.diesel.customItems.length > 0
    ? d.diesel.customItems.map(metricToItem)
    : [
        { label: lang === 'en' ? 'Generator Capacity' : '发电机容量', value: d.diesel.capacity.value, unit: d.diesel.capacity.unit },
        ...(d.diesel.isNew != null ? [{ label: lang === 'en' ? 'Status' : '状态', value: d.diesel.isNew ? (lang === 'en' ? 'New' : '新购') : (lang === 'en' ? 'Existing' : '已有'), unit: '' }] : []),
      ];

  const layoutClass = `microgrid-topology--layout-${layoutMode}`;
  return (
    <div ref={containerRef} className={`microgrid-topology ${layoutClass} ${className}`.trim()}>
      {/* 动态折线连接：PV右侧→ESS上侧，Load右侧→ESS下侧，Diesel上侧→ESS右侧，随分辨率变化自动适配 */}
      <svg className="topology-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="line-pv" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="line-load" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="line-diesel" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        {vis.pv && paths.pv && (
          <path className="topology-line topology-line--pv" d={paths.pv} fill="none" stroke="url(#line-pv)" strokeWidth="0.5" />
        )}
        {vis.load && paths.load && (
          <path className="topology-line topology-line--load" d={paths.load} fill="none" stroke="url(#line-load)" strokeWidth="0.5" />
        )}
        {vis.diesel && paths.diesel && (
          <path className="topology-line topology-line--diesel" d={paths.diesel} fill="none" stroke="url(#line-diesel)" strokeWidth="0.5" />
        )}
      </svg>

      <DeviceBlock id="pv" title={d.pv.title} color={COLORS.pv} items={pvItems} visible={vis.pv} variant={variant} />
      <DeviceBlock id="load" title={d.load.title} color={COLORS.load} items={loadItems} visible={vis.load} variant={variant} />
      <DeviceBlock id="ess" title={d.ess.title} color={COLORS.ess} items={essItems} visible={vis.ess} variant={variant} />
      <DeviceBlock
        id="diesel"
        title={d.diesel.title}
        color={COLORS.diesel}
        items={dieselItems}
        visible={vis.diesel}
        variant={variant}
      />
    </div>
  );
}
