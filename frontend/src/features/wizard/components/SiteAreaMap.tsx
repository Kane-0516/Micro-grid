import { useEffect, useMemo, useRef, useState } from 'react';
import L, { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchReverseGeocode } from '@/api/client';
import type { RectPosition } from '@/api/client';
import { optimizeLayout } from '@/api/client';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { formatCoordinate } from '@/utils/coordinateTransform';
import { detectCountryCodeForCoords } from '@/utils/geocodeHelpers';
import './SiteAreaMap.css';

type MeasureMode = 'select' | 'line' | 'polygon';

export interface SiteAreaMeasurementResult {
  grossAreaM2: number;
  usableAreaM2: number;
  perimeterM: number;
  vertexCount: number;
  installableSets: number;
  bracketSpacingM: number;
  layoutStrategy?: string;
}

interface SiteAreaMapProps {
  latitude?: number;
  longitude?: number;
  locationName?: string;
  availableAreaM2?: number;
  grossAreaM2?: number | null;
  maxBracketSetsByLayout?: number | null;
  onAreaMeasured?: (measurement: SiteAreaMeasurementResult) => void;
  onLocationSelected?: (coords: { latitude: number; longitude: number; locationName?: string }) => void;
}

interface LocalPoint {
  x: number;
  y: number;
}

interface LayoutRectangle {
  corners: LocalPoint[];
  center: LocalPoint;
}

const DEFAULT_CENTER = { lat: 25.0, lng: -80.2 };
const EARTH_RADIUS_M = 6_378_137;
const MEASURE_STROKE_WIDTH = 2;
const ANGLE_DEDUP_TOLERANCE_RAD = Math.PI / 90;
const LAYOUT_ANGLE_SCAN_STEP_RAD = Math.PI / 72;
const LAYOUT_OFFSET_SCAN_STEP_M = 1.0;
const LAYOUT_REFINE_ANGLE_WINDOW_RAD = Math.PI / 36;
const LAYOUT_REFINE_ANGLE_STEP_RAD = Math.PI / 360;
const METER_TO_FOOT = 3.28084;
const SQM_TO_SQFT = 10.7639;

function formatDistance(distanceM: number) {
  const distanceFt = distanceM * METER_TO_FOOT;
  return `${distanceFt.toFixed(1)} ft (${distanceM.toFixed(1)} m)`;
}

function formatArea(areaM2: number) {
  if (areaM2 >= 1_000_000) return `${(areaM2 / 1_000_000).toFixed(2)} km²`;
  if (areaM2 >= 10_000) return `${(areaM2 / 10_000).toFixed(2)} ha`;
  return `${areaM2.toFixed(0)} m²`;
}

function formatAreaDisplay(areaM2: number) {
  const areaFt2 = areaM2 * SQM_TO_SQFT;
  return `${areaFt2.toFixed(1)} ft² (${areaM2.toFixed(1)} m²)`;
}

function formatBracketFootprint(lengthM: number, widthM: number) {
  const lengthFt = lengthM * METER_TO_FOOT;
  const widthFt = widthM * METER_TO_FOOT;
  return `${lengthFt.toFixed(1)} ft × ${widthFt.toFixed(1)} ft (${lengthM.toFixed(1)} m × ${widthM.toFixed(1)} m)`;
}

function localizeLayoutStrategy(strategy: string, lang: 'en' | 'zh') {
  const normalized = strategy.trim().toLowerCase();
  if (lang === 'en') return strategy;

  if (normalized === 'single polygon') return '单个多边形';
  if (normalized.startsWith('auto-split')) {
    return strategy.replace(/auto-split/i, '自动分区').replace(/regions?/i, '个分区');
  }
  if (normalized === 'computing...') return '计算中...';
  if (normalized === 'backend unavailable') return '后端不可用';
  if (normalized === 'optimization failed') return '优化失败';
  if (normalized === 'milp mixed-orientation') return 'MILP 混合朝向优化';
  return strategy;
}

function formatReverseAddress(
  payload: {
    display_name?: string;
    formatted_address?: string;
    address?: Record<string, unknown>;
  },
  fallbackLabel: string,
) {
  const address = payload.address ?? {};
  const parts = [
    address.country,
    address.state,
    address.province,
    address.city || address.town || address.village || address.municipality,
    address.county || address.district || address.suburb,
    address.road || address.street,
    address.house_number || address.housenumber,
    address.postcode,
  ];

  const joined = parts
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => String(part).trim())
    .join(', ');

  return joined || payload.formatted_address || payload.display_name || fallbackLabel;
}

function toFriendlyGeocodeError(message: string, lang: 'en' | 'zh') {
  if (/Pelias geocoder is unavailable/i.test(message)) {
    return lang === 'en'
      ? 'Coordinates were updated, but Pelias is not running yet, so the address could not be resolved.'
      : '坐标已更新，但 Pelias 服务尚未启动，暂时无法解析地址。';
  }
  if (/External geocoder is unreachable from this machine/i.test(message)) {
    return lang === 'en'
      ? 'Coordinates were updated, but this machine cannot reach the geocoder right now.'
      : '坐标已更新，但当前设备暂时无法连接地理编码服务。';
  }
  return lang === 'en'
    ? `Coordinates were updated, but address lookup failed. ${message}`
    : `坐标已更新，但地址解析失败。${message}`;
}

function toLocalPoint(point: LatLng, origin: LatLng): LocalPoint {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const originLonRad = (origin.lng * Math.PI) / 180;
  const latRad = (point.lat * Math.PI) / 180;
  const lonRad = (point.lng * Math.PI) / 180;

  return {
    x: EARTH_RADIUS_M * (lonRad - originLonRad) * Math.cos(originLatRad),
    y: EARTH_RADIUS_M * (latRad - originLatRad),
  };
}

function toLatLng(point: LocalPoint, origin: LatLng): LatLng {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const lat = origin.lat + (point.y / EARTH_RADIUS_M) * (180 / Math.PI);
  const lng = origin.lng + (point.x / (EARTH_RADIUS_M * Math.cos(originLatRad))) * (180 / Math.PI);
  return L.latLng(lat, lng);
}

function getSignedArea(points: LocalPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function getAbsoluteArea(points: LocalPoint[]): number {
  return Math.abs(getSignedArea(points));
}

function distancePointToSegment(point: LocalPoint, start: LocalPoint, end: LocalPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function pointInPolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y + Number.EPSILON) + current.x;

    if (intersects) inside = !inside;
  }
  return inside;
}

function rotatePoint(point: LocalPoint, angleRad: number): LocalPoint {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: point.x * c - point.y * s,
    y: point.x * s + point.y * c,
  };
}

function normalizeAngle(angleRad: number): number {
  let normalized = angleRad % Math.PI;
  if (normalized < 0) normalized += Math.PI;
  return normalized;
}

function getCandidateAngles(polygon: LocalPoint[]): number[] {
  const angles: number[] = [0, Math.PI / 2];
  const sweepStep = LAYOUT_ANGLE_SCAN_STEP_RAD;

  for (let angle = 0; angle < Math.PI; angle += sweepStep) {
    angles.push(normalizeAngle(angle));
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    if (Math.hypot(dx, dy) < 1) continue;

    const edgeAngle = normalizeAngle(Math.atan2(dy, dx));
    angles.push(edgeAngle);
    angles.push(normalizeAngle(edgeAngle + Math.PI / 2));
  }

  const deduped: number[] = [];
  for (const angle of angles) {
    if (
      !deduped.some(existing =>
        Math.abs(existing - angle) < ANGLE_DEDUP_TOLERANCE_RAD ||
        Math.abs(Math.PI - Math.abs(existing - angle)) < ANGLE_DEDUP_TOLERANCE_RAD,
      )
    ) {
      deduped.push(angle);
    }
  }

  return deduped;
}

function getBoundingBox(points: LocalPoint[]) {
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function getRectangleCorners(center: LocalPoint, angleRad: number, lengthM: number, widthM: number): LocalPoint[] {
  const halfLength = lengthM / 2;
  const halfWidth = widthM / 2;
  const offsets: LocalPoint[] = [
    { x: -halfLength, y: -halfWidth },
    { x: halfLength, y: -halfWidth },
    { x: halfLength, y: halfWidth },
    { x: -halfLength, y: halfWidth },
  ];

  return offsets.map(offset => {
    const rotated = rotatePoint(offset, angleRad);
    return {
      x: center.x + rotated.x,
      y: center.y + rotated.y,
    };
  });
}

function getRectangleTestPoints(corners: LocalPoint[]): LocalPoint[] {
  const center = corners.reduce(
    (acc, corner) => ({ x: acc.x + corner.x / corners.length, y: acc.y + corner.y / corners.length }),
    { x: 0, y: 0 },
  );

  const edgeMidpoints = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return {
      x: (corner.x + next.x) / 2,
      y: (corner.y + next.y) / 2,
    };
  });

  return [...corners, ...edgeMidpoints, center];
}

function rectangleFitsInPolygon(rectangle: LocalPoint[], polygon: LocalPoint[]): boolean {
  return getRectangleTestPoints(rectangle).every(point => pointInPolygon(point, polygon));
}

function getPolygonCentroid(points: LocalPoint[]): LocalPoint {
  const signedArea = getSignedArea(points);
  if (Math.abs(signedArea) < 1e-9) {
    const average = points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 },
    );
    return average;
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
  }

  const scale = 1 / (6 * signedArea);
  return { x: cx * scale, y: cy * scale };
}

function searchBestLayoutForPolygonSet(polygons: LocalPoint[][], spacingM: number, bracketLengthM: number, bracketWidthM: number): LayoutRectangle[] {
  let combined: LayoutRectangle[] = [];
  for (const polygon of polygons) {
    const candidate = searchBestLayoutForPolygon(polygon, spacingM, bracketLengthM, bracketWidthM);
    combined = combined.concat(candidate);
  }
  return combined;
}

function searchBestLayoutForPolygon(polygon: LocalPoint[], spacingM: number, bracketLengthM: number, bracketWidthM: number): LayoutRectangle[] {
  const angles = getCandidateAngles(polygon);
  let bestLayout: LayoutRectangle[] = [];
  const scoredLayouts: Array<{ angle: number; count: number; swapped: boolean }> = [];

  for (const angle of angles) {
    // 朝向 1：长边沿 angle 方向
    const layout1 = evaluateLayoutAtAngle(polygon, spacingM, angle, LAYOUT_OFFSET_SCAN_STEP_M, bracketLengthM, bracketWidthM);
    scoredLayouts.push({ angle, count: layout1.length, swapped: false });
    if (layout1.length > bestLayout.length) {
      bestLayout = layout1;
    }
    // 朝向 2：短边沿 angle 方向（交换长宽）
    const layout2 = evaluateLayoutAtAngleSwapped(polygon, spacingM, angle, LAYOUT_OFFSET_SCAN_STEP_M, bracketLengthM, bracketWidthM);
    scoredLayouts.push({ angle, count: layout2.length, swapped: true });
    if (layout2.length > bestLayout.length) {
      bestLayout = layout2;
    }
  }

  const refinedCandidates = scoredLayouts
    .slice()
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.min(5, scoredLayouts.length));

  for (const candidate of refinedCandidates) {
    for (
      let refineAngle = candidate.angle - LAYOUT_REFINE_ANGLE_WINDOW_RAD;
      refineAngle <= candidate.angle + LAYOUT_REFINE_ANGLE_WINDOW_RAD + 1e-9;
      refineAngle += LAYOUT_REFINE_ANGLE_STEP_RAD
    ) {
      const evaluator = candidate.swapped ? evaluateLayoutAtAngleSwapped : evaluateLayoutAtAngle;
      const refinedLayout = evaluator(polygon, spacingM, normalizeAngle(refineAngle), LAYOUT_REFINE_ANGLE_STEP_RAD, bracketLengthM, bracketWidthM);
      if (refinedLayout.length > bestLayout.length) {
        bestLayout = refinedLayout;
      }
    }
  }

  return bestLayout;
}

function evaluateLayoutAtAngle(
  polygon: LocalPoint[],
  spacingM: number,
  angle: number,
  offsetStepHintM: number,
  bracketLengthM: number,
  bracketWidthM: number,
): LayoutRectangle[] {
  const rotatedPolygon = polygon.map(point => rotatePoint(point, -angle));
  const bbox = getBoundingBox(rotatedPolygon);
  const pitchX = bracketLengthM + spacingM;
  const pitchY = bracketWidthM + spacingM;
  const xOffsetStep = Math.max(0.25, Math.min(offsetStepHintM, pitchX / 4));
  const yOffsetStep = Math.max(0.25, Math.min(offsetStepHintM, pitchY / 4));
  const xOffsets = new Set<number>();
  const yOffsets = new Set<number>();

  for (let offset = 0; offset <= pitchX / 2 + 1e-6; offset += xOffsetStep) {
    xOffsets.add(Number(offset.toFixed(4)));
  }
  for (let offset = 0; offset <= pitchY / 2 + 1e-6; offset += yOffsetStep) {
    yOffsets.add(Number(offset.toFixed(4)));
  }

  for (const point of rotatedPolygon) {
    const xRemainder = ((point.x - bbox.minX - bracketLengthM / 2) % pitchX + pitchX) % pitchX;
    const yRemainder = ((point.y - bbox.minY - bracketWidthM / 2) % pitchY + pitchY) % pitchY;
    if (xRemainder <= pitchX / 2 + 1e-6) {
      xOffsets.add(Number(xRemainder.toFixed(4)));
    } else {
      xOffsets.add(Number((pitchX - xRemainder).toFixed(4)));
    }
    if (yRemainder <= pitchY / 2 + 1e-6) {
      yOffsets.add(Number(yRemainder.toFixed(4)));
    } else {
      yOffsets.add(Number((pitchY - yRemainder).toFixed(4)));
    }
  }

  for (let i = 0; i < rotatedPolygon.length; i += 1) {
    const current = rotatedPolygon[i];
    const next = rotatedPolygon[(i + 1) % rotatedPolygon.length];
    const midpoint = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    };

    const xRemainder = ((midpoint.x - bbox.minX - bracketLengthM / 2) % pitchX + pitchX) % pitchX;
    const yRemainder = ((midpoint.y - bbox.minY - bracketWidthM / 2) % pitchY + pitchY) % pitchY;
    if (xRemainder <= pitchX / 2 + 1e-6) {
      xOffsets.add(Number(xRemainder.toFixed(4)));
    } else {
      xOffsets.add(Number((pitchX - xRemainder).toFixed(4)));
    }
    if (yRemainder <= pitchY / 2 + 1e-6) {
      yOffsets.add(Number(yRemainder.toFixed(4)));
    } else {
      yOffsets.add(Number((pitchY - yRemainder).toFixed(4)));
    }
  }

  const sortedXOffsets = Array.from(xOffsets).sort((left, right) => left - right);
  const sortedYOffsets = Array.from(yOffsets).sort((left, right) => left - right);
  let bestLayout: LayoutRectangle[] = [];

  for (const xOffset of sortedXOffsets) {
    for (const yOffset of sortedYOffsets) {
      const forwardLayout = buildAxisAlignedLayout(
        polygon,
        bbox,
        angle,
        pitchX,
        pitchY,
        xOffset,
        yOffset,
        1,
        1,
        bracketLengthM,
        bracketWidthM,
      );
      if (forwardLayout.length > bestLayout.length) {
        bestLayout = forwardLayout;
      }

      const mirroredLayout = buildAxisAlignedLayout(
        polygon,
        bbox,
        angle,
        pitchX,
        pitchY,
        xOffset,
        yOffset,
        -1,
        -1,
        bracketLengthM,
        bracketWidthM,
      );
      if (mirroredLayout.length > bestLayout.length) {
        bestLayout = mirroredLayout;
      }
    }
  }

  return bestLayout;
}

/**
 * 交换长宽方向的排布评估（竖放支架）。
 * 在某些多边形形状下，将支架短边沿主方向放置可以获得更多套数。
 */
function evaluateLayoutAtAngleSwapped(
  polygon: LocalPoint[],
  spacingM: number,
  angle: number,
  offsetStepHintM: number,
  bracketLengthM: number,
  bracketWidthM: number,
): LayoutRectangle[] {
  const rotatedPolygon = polygon.map(point => rotatePoint(point, -angle));
  const bbox = getBoundingBox(rotatedPolygon);
  // 交换：X 方向放短边，Y 方向放长边
  const pitchX = bracketWidthM + spacingM;
  const pitchY = bracketLengthM + spacingM;
  const xOffsetStep = Math.max(0.25, Math.min(offsetStepHintM, pitchX / 4));
  const yOffsetStep = Math.max(0.25, Math.min(offsetStepHintM, pitchY / 4));
  const xOffsets = new Set<number>();
  const yOffsets = new Set<number>();

  for (let offset = 0; offset <= pitchX / 2 + 1e-6; offset += xOffsetStep) {
    xOffsets.add(Number(offset.toFixed(4)));
  }
  for (let offset = 0; offset <= pitchY / 2 + 1e-6; offset += yOffsetStep) {
    yOffsets.add(Number(offset.toFixed(4)));
  }

  for (const point of rotatedPolygon) {
    const xRemainder = ((point.x - bbox.minX - bracketWidthM / 2) % pitchX + pitchX) % pitchX;
    const yRemainder = ((point.y - bbox.minY - bracketLengthM / 2) % pitchY + pitchY) % pitchY;
    if (xRemainder <= pitchX / 2 + 1e-6) {
      xOffsets.add(Number(xRemainder.toFixed(4)));
    } else {
      xOffsets.add(Number((pitchX - xRemainder).toFixed(4)));
    }
    if (yRemainder <= pitchY / 2 + 1e-6) {
      yOffsets.add(Number(yRemainder.toFixed(4)));
    } else {
      yOffsets.add(Number((pitchY - yRemainder).toFixed(4)));
    }
  }

  const sortedXOffsets = Array.from(xOffsets).sort((left, right) => left - right);
  const sortedYOffsets = Array.from(yOffsets).sort((left, right) => left - right);
  let bestLayout: LayoutRectangle[] = [];

  for (const xOffset of sortedXOffsets) {
    for (const yOffset of sortedYOffsets) {
      const forwardLayout = buildAxisAlignedLayoutCustom(
        polygon,
        bbox,
        angle,
        pitchX,
        pitchY,
        bracketWidthM,
        bracketLengthM,
        xOffset,
        yOffset,
        1,
        1,
        bracketLengthM,
        bracketWidthM,
      );
      if (forwardLayout.length > bestLayout.length) {
        bestLayout = forwardLayout;
      }

      const mirroredLayout = buildAxisAlignedLayoutCustom(
        polygon,
        bbox,
        angle,
        pitchX,
        pitchY,
        bracketWidthM,
        bracketLengthM,
        xOffset,
        yOffset,
        -1,
        -1,
        bracketLengthM,
        bracketWidthM,
      );
      if (mirroredLayout.length > bestLayout.length) {
        bestLayout = mirroredLayout;
      }
    }
  }

  return bestLayout;
}

function splitPolygonForLayout(polygon: LocalPoint[], depth: number): LocalPoint[][] {
  if (polygon.length < 4) return [polygon];

  const centroid = getPolygonCentroid(polygon);
  const bbox = getBoundingBox(polygon);
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  const verticalSplit = width >= height;
  const splitValue = verticalSplit ? centroid.x : centroid.y;
  const epsilon = 1e-6;

  const leftOrBottom = clipPolygonToHalfPlane(polygon, verticalSplit, splitValue, true, epsilon);
  const rightOrTop = clipPolygonToHalfPlane(polygon, verticalSplit, splitValue, false, epsilon);
  const splits: LocalPoint[][] = [];

  if (leftOrBottom.length >= 3) {
    splits.push(leftOrBottom);
  }
  if (rightOrTop.length >= 3) {
    splits.push(rightOrTop);
  }

  if (depth >= 1 || splits.length === 0) {
    return splits.length > 0 ? splits : [polygon];
  }

  const refined: LocalPoint[][] = [];
  for (const split of splits) {
    const nested = splitPolygonForLayout(split, depth + 1);
    refined.push(...nested);
  }

  return refined.length > 0 ? refined : splits;
}

function clipPolygonToHalfPlane(
  polygon: LocalPoint[],
  verticalSplit: boolean,
  splitValue: number,
  keepLowerOrLeft: boolean,
  epsilon: number,
): LocalPoint[] {
  const output: LocalPoint[] = [];

  const isInside = (point: LocalPoint) =>
    verticalSplit
      ? keepLowerOrLeft
        ? point.x <= splitValue + epsilon
        : point.x >= splitValue - epsilon
      : keepLowerOrLeft
        ? point.y <= splitValue + epsilon
        : point.y >= splitValue - epsilon;

  const intersect = (start: LocalPoint, end: LocalPoint): LocalPoint | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (verticalSplit) {
      if (Math.abs(dx) < epsilon) return null;
      const t = (splitValue - start.x) / dx;
      if (t < -epsilon || t > 1 + epsilon) return null;
      return { x: splitValue, y: start.y + t * dy };
    }

    if (Math.abs(dy) < epsilon) return null;
    const t = (splitValue - start.y) / dy;
    if (t < -epsilon || t > 1 + epsilon) return null;
    return { x: start.x + t * dx, y: splitValue };
  };

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside && nextInside) {
      output.push(next);
      continue;
    }

    if (currentInside && !nextInside) {
      const point = intersect(current, next);
      if (point) output.push(point);
      continue;
    }

    if (!currentInside && nextInside) {
      const point = intersect(current, next);
      if (point) output.push(point);
      output.push(next);
    }
  }

  return dedupePolygonVertices(output, epsilon);
}

function dedupePolygonVertices(points: LocalPoint[], epsilon: number): LocalPoint[] {
  if (points.length === 0) return points;

  const deduped: LocalPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > epsilon) {
      deduped.push(point);
    }
  }

  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (first && last && Math.hypot(first.x - last.x, first.y - last.y) <= epsilon) {
    deduped.pop();
  }

  return deduped;
}

function buildAxisAlignedLayout(
  polygon: LocalPoint[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  angle: number,
  pitchX: number,
  pitchY: number,
  xOffset: number,
  yOffset: number,
  xDirection: 1 | -1,
  yDirection: 1 | -1,
  bracketLengthM: number,
  bracketWidthM: number,
): LayoutRectangle[] {
  const layout: LayoutRectangle[] = [];
  const startX =
    xDirection > 0
      ? bbox.minX + bracketLengthM / 2 + xOffset
      : bbox.maxX - bracketLengthM / 2 - xOffset;
  const startY =
    yDirection > 0
      ? bbox.minY + bracketWidthM / 2 + yOffset
      : bbox.maxY - bracketWidthM / 2 - yOffset;
  const endX = xDirection > 0 ? bbox.maxX - bracketLengthM / 2 : bbox.minX + bracketLengthM / 2;
  const endY = yDirection > 0 ? bbox.maxY - bracketWidthM / 2 : bbox.minY + bracketWidthM / 2;

  for (
    let y = startY;
    yDirection > 0 ? y <= endY + 1e-6 : y >= endY - 1e-6;
    y += yDirection * pitchY
  ) {
    for (
      let x = startX;
      xDirection > 0 ? x <= endX + 1e-6 : x >= endX - 1e-6;
      x += xDirection * pitchX
    ) {
      const center = rotatePoint({ x, y }, angle);
      const corners = getRectangleCorners(center, angle, bracketLengthM, bracketWidthM);
      if (!rectangleFitsInPolygon(corners, polygon)) continue;
      layout.push({ corners, center });
    }
  }

  return layout;
}

/**
 * 自定义长宽的排布构建器，用于支持交换朝向（竖放）。
 * gridLengthM/gridWidthM 是网格方向上的尺寸，
 * 但实际矩形仍按 bracketLengthM × bracketWidthM 绘制。
 */
function buildAxisAlignedLayoutCustom(
  polygon: LocalPoint[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  angle: number,
  pitchX: number,
  pitchY: number,
  gridLengthM: number,
  gridWidthM: number,
  xOffset: number,
  yOffset: number,
  xDirection: 1 | -1,
  yDirection: 1 | -1,
  bracketLengthM: number,
  bracketWidthM: number,
): LayoutRectangle[] {
  const layout: LayoutRectangle[] = [];
  const startX =
    xDirection > 0
      ? bbox.minX + gridLengthM / 2 + xOffset
      : bbox.maxX - gridLengthM / 2 - xOffset;
  const startY =
    yDirection > 0
      ? bbox.minY + gridWidthM / 2 + yOffset
      : bbox.maxY - gridWidthM / 2 - yOffset;
  const endX = xDirection > 0 ? bbox.maxX - gridLengthM / 2 : bbox.minX + gridLengthM / 2;
  const endY = yDirection > 0 ? bbox.maxY - gridWidthM / 2 : bbox.minY + gridWidthM / 2;

  // 竖放时旋转 90°
  const rectAngle = angle + Math.PI / 2;

  for (
    let y = startY;
    yDirection > 0 ? y <= endY + 1e-6 : y >= endY - 1e-6;
    y += yDirection * pitchY
  ) {
    for (
      let x = startX;
      xDirection > 0 ? x <= endX + 1e-6 : x >= endX - 1e-6;
      x += xDirection * pitchX
    ) {
      const center = rotatePoint({ x, y }, angle);
      const corners = getRectangleCorners(center, rectAngle, bracketLengthM, bracketWidthM);
      if (!rectangleFitsInPolygon(corners, polygon)) continue;
      layout.push({ corners, center });
    }
  }

  return layout;
}

function generateBestLayoutResult(polygon: LocalPoint[], spacingM: number, bracketLengthM: number, bracketWidthM: number): { layout: LayoutRectangle[]; strategy: string } {
  const originalLayout = searchBestLayoutForPolygon(polygon, spacingM, bracketLengthM, bracketWidthM);
  let bestLayout = originalLayout;
  let strategy = 'single polygon';

  const splitLayouts = splitPolygonForLayout(polygon, 0);
  if (splitLayouts.length > 1) {
    const combinedSplitLayout = searchBestLayoutForPolygonSet(splitLayouts, spacingM, bracketLengthM, bracketWidthM);
    if (combinedSplitLayout.length > bestLayout.length) {
      bestLayout = combinedSplitLayout;
      strategy = `auto-split (${splitLayouts.length} regions)`;
    }
  }

  return { layout: bestLayout, strategy };
}

function formatCoordinateLabel(lat: number, lon: number) {
  return `${formatCoordinate(lat)}, ${formatCoordinate(lon)}`;
}

export default function SiteAreaMap({
  latitude,
  longitude,
  locationName,
  availableAreaM2,
  grossAreaM2,
  maxBracketSetsByLayout,
  onAreaMeasured,
  onLocationSelected,
}: SiteAreaMapProps) {
  const { lang } = useLang();
  const { getBracketByModel, defaultBracketModel, bracketSpacingM, siteLayout } = useProducts();
  const defaultBracket = getBracketByModel(defaultBracketModel);
  const BRACKET_LENGTH_M = defaultBracket.footprintLengthM;
  const BRACKET_WIDTH_M = defaultBracket.footprintWidthM;
  const BRACKET_SPACING = bracketSpacingM;

  const text = useMemo(
    () => {
      const spacingFt = (BRACKET_SPACING * METER_TO_FOOT).toFixed(0);
      const lenM = BRACKET_LENGTH_M;
      const widM = BRACKET_WIDTH_M;
      const lenFt = (lenM * METER_TO_FOOT).toFixed(1);
      const widFt = (widM * METER_TO_FOOT).toFixed(1);
      return lang === 'en'
        ? {
            selectedSite: 'Selected site',
            projectSite: 'Project site',
            setSite: 'Set Site',
            measureLine: 'Measure Line',
            measureArea: 'Measure Area',
            finishArea: 'Finish Area',
            reset: 'Reset',
            mapTools: 'Map Tools',
            coordinates: 'Coordinates',
            lineDistance: 'Line distance',
            measuredArea: 'Measured site area',
            usableArea: 'Usable area',
            installableSets: 'Maximum installable sets',
            perimeter: 'Perimeter',
            setback: 'Bracket spacing',
            bracketFootprint: 'Bracket footprint',
            vertices: 'Vertices',
            loadingMap: 'Loading map...',
            hintSelect: 'Click the map or drag the blue marker to set the project site.',
            hintLine: 'Click two points to measure straight-line distance. The preview remains dashed until the second point is fixed.',
            hintPolygon:
              `Click three or more points to sketch an area. Bracket sets are laid out fully inside the polygon, with ${spacingFt} ft spacing kept between neighboring sets.`,
            savedNote:
              `Polygon results keep the full measured site boundary. The system lays out ${lenM} m × ${widM} m bracket footprints inside the polygon and keeps ${spacingFt} ft spacing between neighboring sets before writing the installable set count back to the form.`,
            totalSetsLabel: 'Installable',
            totalSetsUnit: 'sets',
            totalSetsCaption: 'layout total',
          }
        : {
            selectedSite: '已选站点',
            projectSite: '项目位置',
            setSite: '设置位置',
            measureLine: '线条测距',
            measureArea: '多边形框选',
            finishArea: '完成框选',
            reset: '重置',
            mapTools: '地图工具',
            coordinates: '坐标',
            lineDistance: '线长',
            measuredArea: '框选毛面积',
            usableArea: '可用净面积',
            installableSets: '可安装套数',
            perimeter: '周长',
            setback: '支架间距',
            bracketFootprint: '单套支架尺寸',
            vertices: '顶点数',
            loadingMap: '地图加载中...',
            hintSelect: '点击地图或拖动蓝色标记，以设置项目位置。',
            hintLine: '点击两个点测量直线距离。在第二个点确认前，预览线会保持虚线。',
            hintPolygon: `点击三个及以上点绘制区域。系统会让每套支架完整落在多边形内，并在相邻支架之间保留 ${spacingFt} 英尺间距。`,
            savedNote: `地图框选结果会保留完整场地边界，并按 ${lenFt} ft × ${widFt} ft（${lenM} 米 × ${widM} 米）的单套支架尺寸在多边形内排布，同时在相邻支架之间保留 ${spacingFt} 英尺间距，结果套数会自动回填到表单。`,
            totalSetsLabel: '可安装',
            totalSetsUnit: '套',
            totalSetsCaption: '排布总数',
          };
    },
    [lang, BRACKET_LENGTH_M, BRACKET_WIDTH_M, BRACKET_SPACING],
  );

  const labels = useMemo(
    () =>
      lang === 'en'
        ? {
            measuredArea: text.measuredArea,
            usableArea: text.usableArea,
            installableSets: text.installableSets,
            perimeter: text.perimeter,
            setback: text.setback,
            bracketFootprint: text.bracketFootprint,
            vertices: text.vertices,
            layoutStrategy: 'Layout strategy',
          }
        : {
            measuredArea: '框选场地面积',
            usableArea: '可用面积',
            installableSets: '最大可安装套数',
            perimeter: '周长',
            setback: '支架间距',
            bracketFootprint: '单套支架尺寸',
            vertices: '顶点数',
            layoutStrategy: '布局策略',
          },
    [lang, text],
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const draftRef = useRef<L.Polyline | null>(null);
  const layoutLayerRef = useRef<L.LayerGroup | null>(null);
  const lineStartRef = useRef<LatLng | null>(null);
  const polygonPointsRef = useRef<LatLng[]>([]);
  const polygonClosedRef = useRef(false);
  const modeRef = useRef<MeasureMode>('select');
  const handleSiteSelectionRef = useRef<(latlng: LatLng) => Promise<void>>(async () => {});

  const [mode, setMode] = useState<MeasureMode>('select');
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready'>('loading');
  const [geoError, setGeoError] = useState('');
  const [lineMeasurement, setLineMeasurement] = useState<number | null>(null);
  const [polygonMeasurement, setPolygonMeasurement] = useState<SiteAreaMeasurementResult | null>(null);
  const [polygonDraftCount, setPolygonDraftCount] = useState(0);
  const [currentSiteLabel, setCurrentSiteLabel] = useState(locationName || text.selectedSite);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [areaLimitWarning, setAreaLimitWarning] = useState<string | null>(null);

  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  const center = useMemo(() => {
    if (hasCoords) {
      return { lat: latitude as number, lng: longitude as number };
    }
    return DEFAULT_CENTER;
  }, [hasCoords, latitude, longitude]);

  const manualIcon = useMemo(
    () =>
      L.divIcon({
        className: 'site-area-map__placement-marker',
        html: '<span class="site-area-map__manual-marker"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [],
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (locationName?.trim()) {
      setCurrentSiteLabel(locationName.trim());
      return;
    }

    setCurrentSiteLabel(previous => {
      if (!previous || previous === 'Selected site' || previous === '已选站点') {
        return text.selectedSite;
      }
      return previous;
    });
  }, [locationName, text.selectedSite]);

  const clearLayoutOverlay = () => {
    layoutLayerRef.current?.remove();
    layoutLayerRef.current = null;
  };

  const clearMeasurements = () => {
    lineStartRef.current = null;
    polygonPointsRef.current = [];
    polygonClosedRef.current = false;
    setLineMeasurement(null);
    setPolygonMeasurement(null);
    setPolygonDraftCount(0);

    lineRef.current?.remove();
    lineRef.current = null;
    polygonRef.current?.remove();
    polygonRef.current = null;
    draftRef.current?.remove();
    draftRef.current = null;
    clearLayoutOverlay();
  };

  const switchMode = (nextMode: MeasureMode) => {
    modeRef.current = nextMode;
    if (nextMode === 'line' || nextMode === 'polygon') {
      clearMeasurements();
    }
    setMode(nextMode);
  };

  const updateDraftPolyline = (cursor?: LatLng | null) => {
    const map = mapRef.current;
    const points = polygonPointsRef.current;
    if (!map || points.length === 0) {
      draftRef.current?.remove();
      draftRef.current = null;
      return;
    }

    const previewPoints = cursor ? [...points, cursor] : points;
    draftRef.current?.remove();
    draftRef.current = L.polyline(previewPoints, {
      color: '#22c55e',
      weight: MEASURE_STROKE_WIDTH,
      dashArray: '6 6',
    }).addTo(map);
  };

  const renderLayout = (layout: LayoutRectangle[], origin: LatLng, centroid: LocalPoint, installableSets: number) => {
    const map = mapRef.current;
    if (!map) return;

    clearLayoutOverlay();
    const layerGroup = L.layerGroup().addTo(map);

    layout.forEach((rectangle, index) => {
      L.polygon(
        rectangle.corners.map(corner => toLatLng(corner, origin)),
        {
          color: '#0f766e',
          weight: 1,
          fillColor: '#5eead4',
          fillOpacity: 0.12,
          interactive: false,
        },
      ).addTo(layerGroup);

      L.marker(toLatLng(rectangle.center, origin), {
        interactive: false,
        icon: L.divIcon({
          className: 'site-area-map__set-label',
          html: `<span>${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(layerGroup);
    });

    L.marker(toLatLng(centroid, origin), {
      interactive: false,
      pane: 'site-area-count-pane',
      zIndexOffset: -1000,
      icon: L.divIcon({
        className: 'site-area-map__count-badge',
        html: `<span><strong>${installableSets}</strong>${text.totalSetsUnit}<em>${text.totalSetsCaption}</em></span>`,
        iconSize: [110, 56],
        iconAnchor: [55, 28],
      }),
    }).addTo(layerGroup);

    layoutLayerRef.current = layerGroup;
  };

  const finishPolygon = async () => {
    const map = mapRef.current;
    const points = polygonPointsRef.current;
    if (!map || points.length < 3) return;

    // 计算基本几何量（面积、周长）— 本地即可完成
    const origin = points[0];
    const local = points.map(point => toLocalPoint(point, origin));
    const grossAreaM2 = getAbsoluteArea(local);

    let perimeterM = 0;
    for (let i = 0; i < local.length; i += 1) {
      const current = local[i];
      const next = local[(i + 1) % local.length];
      perimeterM += Math.hypot(next.x - current.x, next.y - current.y);
    }

    const centroid = getPolygonCentroid(local);

    polygonClosedRef.current = true;
    draftRef.current?.remove();
    draftRef.current = null;
    polygonRef.current?.remove();

    polygonRef.current = L.polygon(points, {
      color: '#22c55e',
      weight: MEASURE_STROKE_WIDTH,
      fillColor: '#22c55e',
      fillOpacity: 0.18,
    }).addTo(map);

    // 先显示面积信息，排布结果等后端返回
    const prelimMeasurement: SiteAreaMeasurementResult = {
      grossAreaM2,
      usableAreaM2: grossAreaM2,
      perimeterM,
      vertexCount: points.length,
      installableSets: 0,
      bracketSpacingM: BRACKET_SPACING,
      layoutStrategy: 'computing...',
    };
    setPolygonMeasurement(prelimMeasurement);
    setPolygonDraftCount(points.length);
    setLayoutLoading(true);

    // 调后端 MILP 求解
    try {
      // 面积上限校验
      const maxAreaM2 = siteLayout.maxLayoutAreaM2;
      if (grossAreaM2 > maxAreaM2) {
        const effectivePerSet = (BRACKET_LENGTH_M + BRACKET_SPACING) * (BRACKET_WIDTH_M + BRACKET_SPACING);
        const maxSetsEstimate = Math.floor(maxAreaM2 / effectivePerSet);
        const limitMsg = lang === 'en'
          ? `The selected area is too large for layout optimization. The system supports up to approximately ${maxSetsEstimate} bracket sets. Please reduce the selection area and try again.`
          : `框选面积过大，超出布局优化的计算范围。系统最多支持约 ${maxSetsEstimate} 套支架的排布计算，请缩小框选范围后重试。`;
        setAreaLimitWarning(limitMsg);
        const limitMeasurement: SiteAreaMeasurementResult = {
          grossAreaM2,
          usableAreaM2: grossAreaM2,
          perimeterM,
          vertexCount: points.length,
          installableSets: 0,
          bracketSpacingM: BRACKET_SPACING,
          layoutStrategy: 'area exceeded',
        };
        setPolygonMeasurement(limitMeasurement);
        onAreaMeasured?.(limitMeasurement);
        setLayoutLoading(false);
        return;
      }

      const polygon = local.map(p => [p.x, p.y]);
      const result = await optimizeLayout({ polygon, timeLimitS: 120 });

      if (result.success && result.rectangles) {
        const layoutRects: LayoutRectangle[] = result.rectangles.map(
          (r: RectPosition) => ({
            center: { x: r.centerX, y: r.centerY },
            corners: r.corners.map((c: number[]) => ({ x: c[0], y: c[1] })),
          }),
        );

        const finalMeasurement: SiteAreaMeasurementResult = {
          grossAreaM2,
          usableAreaM2: grossAreaM2,
          perimeterM,
          vertexCount: points.length,
          installableSets: result.maxSystems,
          bracketSpacingM: BRACKET_SPACING,
          layoutStrategy: result.strategy,
        };
        setPolygonMeasurement(finalMeasurement);
        renderLayout(layoutRects, origin, centroid, result.maxSystems);
        onAreaMeasured?.(finalMeasurement);
      } else {
        // API 失败，回退到 0
        const fallbackMeasurement: SiteAreaMeasurementResult = {
          grossAreaM2,
          usableAreaM2: grossAreaM2,
          perimeterM,
          vertexCount: points.length,
          installableSets: 0,
          bracketSpacingM: BRACKET_SPACING,
          layoutStrategy: result.error || 'optimization failed',
        };
        setPolygonMeasurement(fallbackMeasurement);
        onAreaMeasured?.(fallbackMeasurement);
      }
    } catch (err) {
      // 网络错误等，回退
      const errorMeasurement: SiteAreaMeasurementResult = {
        grossAreaM2,
        usableAreaM2: grossAreaM2,
        perimeterM,
        vertexCount: points.length,
        installableSets: 0,
        bracketSpacingM: BRACKET_SPACING,
        layoutStrategy: 'backend unavailable',
      };
      setPolygonMeasurement(errorMeasurement);
      onAreaMeasured?.(errorMeasurement);
    } finally {
      setLayoutLoading(false);
    }
  };

  const handleSiteSelection = async (latlng: LatLng) => {
    const marker = markerRef.current;
    if (!marker) return;

    marker.setLatLng(latlng);
    const fallbackLabel = formatCoordinateLabel(latlng.lat, latlng.lng);
    setCurrentSiteLabel(fallbackLabel);
    setGeoError('');

    onLocationSelected?.({
      latitude: latlng.lat,
      longitude: latlng.lng,
      locationName: fallbackLabel,
    });

    try {
      const result = await fetchReverseGeocode(latlng.lat, latlng.lng, detectCountryCodeForCoords(latlng.lat, latlng.lng));
      const nextLabel = formatReverseAddress(result, text.selectedSite);
      setCurrentSiteLabel(nextLabel);
      onLocationSelected?.({
        latitude: latlng.lat,
        longitude: latlng.lng,
        locationName: nextLabel,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGeoError(toFriendlyGeocodeError(message, lang === 'en' ? 'en' : 'zh'));
    }
  };

  useEffect(() => {
    handleSiteSelectionRef.current = handleSiteSelection;
  }, [handleSiteSelection]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: hasCoords ? 15 : 5,
      zoomControl: true,
      attributionControl: false,
    });

    mapRef.current = map;
    map.createPane('site-area-count-pane');
    const countPane = map.getPane('site-area-count-pane');
    if (countPane) {
      countPane.style.zIndex = '350';
      countPane.style.pointerEvents = 'none';
    }

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
    }).addTo(map);

    markerRef.current = L.marker(center, {
      title: locationName || text.projectSite,
      icon: manualIcon,
      draggable: true,
    }).addTo(map);

    const onMapClick = (event: L.LeafletMouseEvent) => {
      if (modeRef.current === 'select') {
        void handleSiteSelectionRef.current(event.latlng);
        return;
      }

      if (modeRef.current === 'line') {
        if (!lineStartRef.current) {
          lineStartRef.current = event.latlng;
          lineRef.current?.remove();
          lineRef.current = L.polyline([event.latlng], {
            color: '#f59e0b',
            weight: MEASURE_STROKE_WIDTH,
            dashArray: '6 6',
          }).addTo(map);
          setLineMeasurement(null);
          return;
        }

        const points = [lineStartRef.current, event.latlng];
        lineRef.current?.setLatLngs(points);
        lineRef.current?.setStyle({ dashArray: undefined });
        setLineMeasurement(lineStartRef.current.distanceTo(event.latlng));
        lineStartRef.current = null;
        return;
      }

      if (polygonClosedRef.current) {
        polygonClosedRef.current = false;
        polygonPointsRef.current = [];
        polygonRef.current?.remove();
        polygonRef.current = null;
        draftRef.current?.remove();
        draftRef.current = null;
        clearLayoutOverlay();
        setPolygonMeasurement(null);
        setPolygonDraftCount(0);
      }

      polygonPointsRef.current = [...polygonPointsRef.current, event.latlng];
      setPolygonDraftCount(polygonPointsRef.current.length);
      setPolygonMeasurement(null);
      updateDraftPolyline();
    };

    const onMapMouseMove = (event: L.LeafletMouseEvent) => {
      if (modeRef.current === 'line' && lineStartRef.current) {
        const start = lineStartRef.current;
        lineRef.current?.setLatLngs([start, event.latlng]);
        setLineMeasurement(start.distanceTo(event.latlng));
        return;
      }

      if (modeRef.current === 'polygon' && polygonPointsRef.current.length > 0 && !polygonClosedRef.current) {
        updateDraftPolyline(event.latlng);
      }
    };

    const onMarkerDragEnd = () => {
      if (modeRef.current !== 'select' || !markerRef.current) return;
      void handleSiteSelectionRef.current(markerRef.current.getLatLng());
    };

    map.on('click', onMapClick);
    map.on('mousemove', onMapMouseMove);
    markerRef.current.on('dragend', onMarkerDragEnd);
    setMapStatus('ready');

    return () => {
      markerRef.current?.off('dragend', onMarkerDragEnd);
      map.off('click', onMapClick);
      map.off('mousemove', onMapMouseMove);
      clearLayoutOverlay();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      lineRef.current = null;
      polygonRef.current = null;
      draftRef.current = null;
    };
  }, [center, hasCoords, locationName, manualIcon, text.projectSite]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const markerElement = markerRef.current.getElement();
    if (markerElement) {
      markerElement.title = locationName?.trim() || text.projectSite;
    }
    markerRef.current.options.title = locationName?.trim() || text.projectSite;

    if (!hasCoords) return;

    const next = L.latLng(latitude as number, longitude as number);
    markerRef.current.setLatLng(next);
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 15));
    if (locationName?.trim()) setCurrentSiteLabel(locationName.trim());
  }, [hasCoords, latitude, longitude, locationName, text.projectSite]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const container = map.getContainer();
    const markerElement = marker.getElement();
    const selectMode = mode === 'select';

    container.style.cursor = selectMode ? '' : 'crosshair';

    if (selectMode) {
      marker.dragging?.enable();
      if (markerElement) markerElement.style.pointerEvents = 'auto';
    } else {
      marker.dragging?.disable();
      if (markerElement) markerElement.style.pointerEvents = 'none';
    }
  }, [mode]);

  const hint =
    mode === 'select'
      ? text.hintSelect
      : mode === 'line'
        ? text.hintLine
        : text.hintPolygon;
  const showLayoutArea =
    polygonMeasurement != null
      ? Math.abs(polygonMeasurement.usableAreaM2 - polygonMeasurement.grossAreaM2) > 0.5
      : availableAreaM2 != null && grossAreaM2 != null
        ? Math.abs((availableAreaM2 as number) - (grossAreaM2 as number)) > 0.5
        : availableAreaM2 != null;

  return (
    <div className="site-area-map">
      <div ref={mapContainerRef} className="site-area-map__canvas" />

      <div className="site-area-map__toolbar">
        <button
          type="button"
          className={`site-area-map__tool ${mode === 'select' ? 'is-active' : ''}`}
          onClick={() => switchMode('select')}
        >
          {text.setSite}
        </button>
        <button
          type="button"
          className={`site-area-map__tool ${mode === 'line' ? 'is-active' : ''}`}
          onClick={() => switchMode('line')}
        >
          {text.measureLine}
        </button>
        <button
          type="button"
          className={`site-area-map__tool ${mode === 'polygon' ? 'is-active' : ''}`}
          onClick={() => switchMode('polygon')}
        >
          {text.measureArea}
        </button>
        {mode === 'polygon' && (
          <button
            type="button"
            className="site-area-map__tool is-secondary"
            onClick={finishPolygon}
            disabled={polygonDraftCount < 3 || layoutLoading}
          >
            {layoutLoading ? (lang === 'en' ? 'Optimizing...' : '求解中...') : text.finishArea}
          </button>
        )}
        <button type="button" className="site-area-map__tool is-secondary" onClick={clearMeasurements}>
          {text.reset}
        </button>
      </div>

      <div className="site-area-map__panel">
        <div className="site-area-map__panel-title">{text.mapTools}</div>

        <div className="site-area-map__metrics">
          <div>
            <span>{text.selectedSite}</span>
            <strong>{currentSiteLabel}</strong>
          </div>
          {hasCoords && (
            <div>
              <span>{text.coordinates}</span>
              <strong>{formatCoordinateLabel(latitude as number, longitude as number)}</strong>
            </div>
          )}
          {lineMeasurement != null && (
            <div>
              <span>{text.lineDistance}</span>
              <strong>{formatDistance(lineMeasurement)}</strong>
            </div>
          )}
          {(polygonMeasurement || grossAreaM2 != null) && (
            <div>
                <span>{labels.measuredArea}</span>
                <strong>{formatAreaDisplay(polygonMeasurement?.grossAreaM2 ?? (grossAreaM2 as number))}</strong>
            </div>
          )}
          {showLayoutArea && (polygonMeasurement || availableAreaM2 != null) && (
            <div>
                <span>{labels.usableArea}</span>
                <strong>{formatAreaDisplay(polygonMeasurement?.usableAreaM2 ?? (availableAreaM2 as number))}</strong>
            </div>
          )}
          {(polygonMeasurement || maxBracketSetsByLayout != null) && (
            <div>
                <span>{labels.installableSets}</span>
              <strong>{polygonMeasurement?.installableSets ?? maxBracketSetsByLayout}</strong>
            </div>
          )}
          {polygonMeasurement && (
            <div>
                <span>{labels.perimeter}</span>
              <strong>{formatDistance(polygonMeasurement.perimeterM)}</strong>
            </div>
          )}
          {polygonMeasurement && (
            <div>
                <span>{labels.setback}</span>
              <strong>{formatDistance(polygonMeasurement.bracketSpacingM)}</strong>
            </div>
          )}
          {polygonMeasurement && (
            <div>
                <span>{labels.bracketFootprint}</span>
                <strong>{formatBracketFootprint(BRACKET_LENGTH_M, BRACKET_WIDTH_M)}</strong>
            </div>
          )}
          {polygonMeasurement && (
            <div>
                <span>{labels.vertices}</span>
              <strong>{polygonMeasurement.vertexCount}</strong>
            </div>
          )}
          {polygonMeasurement?.layoutStrategy && (
            <div>
                <span>{labels.layoutStrategy}</span>
                <strong>{localizeLayoutStrategy(polygonMeasurement.layoutStrategy, lang as 'en' | 'zh')}</strong>
            </div>
          )}
        </div>

        {geoError && <div className="site-area-map__geo-error">{geoError}</div>}

        {!geoError && <div className="site-area-map__saved">{text.savedNote}</div>}
      </div>

      <div className="site-area-map__hint">{hint}</div>

      {mapStatus === 'loading' && (
        <div className="site-area-map__state">
          <div>{text.loadingMap}</div>
        </div>
      )}

      {layoutLoading && (
        <div className="site-area-map__state" style={{ background: 'rgba(0,0,0,0.35)', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{
            width: '280px',
            background: 'rgba(255,255,255,0.92)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.5rem', textAlign: 'center' }}>
              {lang === 'en' ? 'Optimizing layout...' : '正在求解排布方案...'}
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: '#e2e8f0',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: '40%',
                height: '100%',
                background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
                borderRadius: '3px',
                animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
              }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: '#718096', marginTop: '0.4rem', textAlign: 'center' }}>
              {lang === 'en'
                ? 'MILP optimization in progress, may take up to 2 min'
                : 'MILP 精确求解中，最多需要 2 分钟'}
            </div>
          </div>
        </div>
      )}

      {areaLimitWarning && (
        <div className="site-area-map__state" style={{ background: 'rgba(0,0,0,0.35)', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{
            width: '320px',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem' }}>⚠️</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c05621' }}>
                {lang === 'en' ? 'Area Too Large' : '框选面积过大'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#4a5568', lineHeight: 1.6, marginBottom: '1rem' }}>
              {areaLimitWarning}
            </div>
            <button
              onClick={() => setAreaLimitWarning(null)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#ed8936',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {lang === 'en' ? 'OK' : '知道了'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
