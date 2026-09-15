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

interface DeviceItem {
  label: string;
  value: string | number;
  unit?: string;
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
  items: DeviceItem[];
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

function useTopologyPaths(
  containerRef: React.RefObject<HTMLDivElement | null>,
  visibility?: Partial<TopologyVisibility>,
) {
  const [paths, setPaths] = useState<LinePaths>({ pv: '', load: '', diesel: '' });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const container = el.getBoundingClientRect();
      if (container.width === 0 || container.height === 0) return;
      const getRect = (selector: string) => (
        (el.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect() ?? null
      );
      setPaths(computeLinePaths(
        container,
        getRect('.topology-device--pv .topology-device__img-wrap'),
        getRect('.topology-device--load .topology-device__img-wrap'),
        getRect('.topology-device--ess .topology-device__img-wrap'),
        getRect('.topology-device--diesel .topology-device__img-wrap'),
      ));
    };
    update();
    const t1 = requestAnimationFrame(update);
    const t2 = window.setTimeout(update, 100);
    const t3 = window.setTimeout(update, 400);
    const ro = new ResizeObserver(update);
    ro.observe(el);
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
  }, [containerRef, visibility?.pv, visibility?.load, visibility?.ess, visibility?.diesel]);

  return paths;
}

function metricToItem(metric: TopologyMetric): DeviceItem {
  return { label: metric.name, value: metric.value, unit: metric.unit };
}

const PV_LABELS = {
  zh: {
    capacity: '最大光伏容量',
    sets: '最大支架套数',
    panel: '组件型号',
    area: '最大占地面积',
  },
  en: {
    capacity: 'Max PV Capacity',
    sets: 'Max Bracket Sets',
    panel: 'Panel Model',
    area: 'Max Area',
  },
};

function getPvItems(pv: TopologyData['pv'], lang: 'zh' | 'en', fullFields: boolean): DeviceItem[] {
  if (pv.customItems?.length) return pv.customItems.map(metricToItem);
  const labels = PV_LABELS[lang];
  const capacity = { label: labels.capacity, value: pv.capacity.value, unit: pv.capacity.unit };
  if (fullFields) {
    return [
      capacity,
      { label: labels.sets, value: pv.sets?.value ?? '—', unit: pv.sets?.unit ?? '' },
      { label: labels.panel, value: pv.panelModel ?? '—', unit: '' },
      { label: labels.area, value: formatAreaDual(pv.areaM2, lang).combined, unit: '' },
    ];
  }
  const items: DeviceItem[] = [capacity];
  if (pv.sets) items.push({ label: labels.sets, value: pv.sets.value, unit: pv.sets.unit });
  if (pv.panelModel) items.push({ label: labels.panel, value: pv.panelModel });
  if (pv.areaM2) items.push({ label: labels.area, value: formatAreaDual(pv.areaM2, lang).combined });
  return items;
}

const LOAD_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  residential: { zh: '住宅', en: 'Residential' },
  commercial: { zh: '商业', en: 'Commercial' },
  industrial: { zh: '工业', en: 'Industrial' },
};

function getLoadItems(load: TopologyData['load'], lang: 'zh' | 'en'): DeviceItem[] {
  if (load.customItems?.length) return load.customItems.map(metricToItem);
  const items: DeviceItem[] = [
    { label: lang === 'en' ? 'Annual Load' : '年用电量', value: load.annualKwh.value, unit: load.annualKwh.unit },
  ];
  if (load.loadType) {
    items.push({
      label: lang === 'en' ? 'Load Type' : '负载类型',
      value: LOAD_TYPE_LABELS[load.loadType]?.[lang] ?? load.loadType,
    });
  }
  if (load.peakKw != null) items.push({ label: lang === 'en' ? 'Peak Load' : '峰值负荷', value: load.peakKw, unit: 'kW' });
  return items;
}

function getEssItems(ess: TopologyData['ess'], lang: 'zh' | 'en'): DeviceItem[] {
  if (ess.customItems?.length) return ess.customItems.map(metricToItem);
  return [
    { label: lang === 'en' ? 'Battery Capacity' : '储能容量', value: ess.capacity.value, unit: ess.capacity.unit },
    { label: lang === 'en' ? 'Storage Days' : '储能天数', value: ess.storageDays?.value ?? '—', unit: ess.storageDays?.unit ?? '' },
    { label: lang === 'en' ? 'Pack Model' : '电池包型号', value: ess.packModel ?? '—' },
  ];
}

function getDieselItems(diesel: TopologyData['diesel'], lang: 'zh' | 'en'): DeviceItem[] {
  if (diesel.customItems?.length) return diesel.customItems.map(metricToItem);
  const items: DeviceItem[] = [
    { label: lang === 'en' ? 'Generator Capacity' : '发电机容量', value: diesel.capacity.value, unit: diesel.capacity.unit },
  ];
  if (diesel.isNew != null) {
    const status = diesel.isNew
      ? (lang === 'en' ? 'New' : '新购')
      : (lang === 'en' ? 'Existing' : '已有');
    items.push({ label: lang === 'en' ? 'Status' : '状态', value: status });
  }
  return items;
}

function TopologyLines({ paths, visibility }: { paths: LinePaths; visibility: TopologyVisibility }) {
  const lines = [
    { id: 'pv', path: paths.pv, visible: visibility.pv },
    { id: 'load', path: paths.load, visible: visibility.load },
    { id: 'diesel', path: paths.diesel, visible: visibility.diesel },
  ];
  return (
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
      {lines.filter(line => line.visible && line.path).map(line => (
        <path
          key={line.id}
          className={`topology-line topology-line--${line.id}`}
          d={line.path}
          fill="none"
          stroke={`url(#line-${line.id})`}
          strokeWidth="0.5"
        />
      ))}
    </svg>
  );
}

export default function MicrogridTopology({ className = '', data, visibility, variant = 'wizard', layoutMode = 'schematic', pvFullFields = false }: MicrogridTopologyProps) {
  const { lang } = useLang();
  const { defaultPanelModel, defaultBatteryModel, defaultBracketModel, calcPvKw, getBracketByModel, homeBgDefaults } = useProducts();
  const containerRef = useRef<HTMLDivElement>(null);
  const paths = useTopologyPaths(containerRef, visibility);

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

  const pvItems = getPvItems(d.pv, lang, pvFullFields);
  const loadItems = getLoadItems(d.load, lang);
  const essItems = getEssItems(d.ess, lang);
  const dieselItems = getDieselItems(d.diesel, lang);

  const layoutClass = `microgrid-topology--layout-${layoutMode}`;
  return (
    <div ref={containerRef} className={`microgrid-topology ${layoutClass} ${className}`.trim()}>
      {/* 动态折线连接：PV右侧→ESS上侧，Load右侧→ESS下侧，Diesel上侧→ESS右侧，随分辨率变化自动适配 */}
      <TopologyLines paths={paths} visibility={vis} />

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
