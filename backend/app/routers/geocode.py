"""Proxy routes for forward and reverse geocoding services."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from httpx import AsyncClient, HTTPError

from app.core.config import (
    GEOCODER_API_URL,
    GEOCODER_API_URL_CN,
    GEOCODER_API_URL_US,
    GEOCODER_DEFAULT_REGION,
    GEOCODER_REVERSE_API_URL,
    GEOCODER_REVERSE_API_URL_CN,
    GEOCODER_REVERSE_API_URL_US,
)

router = APIRouter(prefix="/api", tags=["geocode"])

DEFAULT_GEOCODER_HEADERS = {
    "Accept": "application/json",
    # Keep an explicit User-Agent for easier debugging of local proxy traffic.
    "User-Agent": "MicroGridAdvisor/2.0 (local geocoder proxy)",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


@dataclass(frozen=True)
class LocalPlace:
    country: str
    state: str
    city: str
    lat: float
    lon: float
    aliases: tuple[str, ...] = ()


LOCAL_CN_PLACES: tuple[LocalPlace, ...] = (
    LocalPlace("中国", "北京", "北京", 39.9042, 116.4074, ("北京", "北京市")),
    LocalPlace("中国", "上海", "上海", 31.2304, 121.4737, ("上海", "上海市")),
    LocalPlace("中国", "天津", "天津", 39.3434, 117.3616, ("天津", "天津市")),
    LocalPlace("中国", "重庆", "重庆", 29.5630, 106.5516, ("重庆", "重庆市")),
    LocalPlace("中国", "浙江", "杭州", 30.2741, 120.1551, ("浙江杭州", "杭州市", "杭州")),
    LocalPlace("中国", "浙江", "宁波", 29.8683, 121.5440, ("浙江宁波", "宁波市", "宁波")),
    LocalPlace("中国", "浙江", "温州", 27.9949, 120.6994, ("浙江温州", "温州市", "温州")),
    LocalPlace("中国", "浙江", "嘉兴", 30.7461, 120.7555, ("浙江嘉兴", "嘉兴市", "嘉兴")),
    LocalPlace("中国", "浙江", "绍兴", 30.0303, 120.5802, ("浙江绍兴", "绍兴市", "绍兴")),
    LocalPlace("中国", "江苏", "南京", 32.0603, 118.7969, ("江苏南京", "南京市", "南京")),
    LocalPlace("中国", "江苏", "苏州", 31.2989, 120.5853, ("江苏苏州", "苏州市", "苏州")),
    LocalPlace("中国", "江苏", "无锡", 31.4912, 120.3119, ("江苏无锡", "无锡市", "无锡")),
    LocalPlace("中国", "江苏", "常州", 31.8107, 119.9741, ("江苏常州", "常州市", "常州")),
    LocalPlace("中国", "广东", "广州", 23.1291, 113.2644, ("广东广州", "广州市", "广州")),
    LocalPlace("中国", "广东", "深圳", 22.5431, 114.0579, ("广东深圳", "深圳市", "深圳")),
    LocalPlace("中国", "广东", "东莞", 23.0207, 113.7518, ("广东东莞", "东莞市", "东莞")),
    LocalPlace("中国", "广东", "佛山", 23.0215, 113.1214, ("广东佛山", "佛山市", "佛山")),
    LocalPlace("中国", "广东", "珠海", 22.2710, 113.5767, ("广东珠海", "珠海市", "珠海")),
    LocalPlace("中国", "福建", "福州", 26.0745, 119.2965, ("福建福州", "福州市", "福州")),
    LocalPlace("中国", "福建", "厦门", 24.4798, 118.0894, ("福建厦门", "厦门市", "厦门")),
    LocalPlace("中国", "山东", "济南", 36.6512, 117.1201, ("山东济南", "济南市", "济南")),
    LocalPlace("中国", "山东", "青岛", 36.0671, 120.3826, ("山东青岛", "青岛市", "青岛")),
    LocalPlace("中国", "山东", "烟台", 37.4638, 121.4479, ("山东烟台", "烟台市", "烟台")),
    LocalPlace("中国", "河南", "郑州", 34.7473, 113.6249, ("河南郑州", "郑州市", "郑州")),
    LocalPlace("中国", "湖北", "武汉", 30.5928, 114.3055, ("湖北武汉", "武汉市", "武汉")),
    LocalPlace("中国", "湖南", "长沙", 28.2282, 112.9388, ("湖南长沙", "长沙市", "长沙")),
    LocalPlace("中国", "安徽", "合肥", 31.8206, 117.2272, ("安徽合肥", "合肥市", "合肥")),
    LocalPlace("中国", "江西", "南昌", 28.6820, 115.8579, ("江西南昌", "南昌市", "南昌")),
    LocalPlace("中国", "河北", "石家庄", 38.0428, 114.5149, ("河北石家庄", "石家庄市", "石家庄")),
    LocalPlace("中国", "山西", "太原", 37.8706, 112.5489, ("山西太原", "太原市", "太原")),
    LocalPlace("中国", "陕西", "西安", 34.3416, 108.9398, ("陕西西安", "西安市", "西安")),
    LocalPlace("中国", "四川", "成都", 30.5728, 104.0668, ("四川成都", "成都市", "成都")),
    LocalPlace("中国", "云南", "昆明", 25.0389, 102.7183, ("云南昆明", "昆明市", "昆明")),
    LocalPlace("中国", "贵州", "贵阳", 26.6470, 106.6302, ("贵州贵阳", "贵阳市", "贵阳")),
    LocalPlace("中国", "广西", "南宁", 22.8170, 108.3669, ("广西南宁", "南宁市", "南宁")),
    LocalPlace("中国", "海南", "海口", 20.0442, 110.1999, ("海南海口", "海口市", "海口")),
    LocalPlace("中国", "辽宁", "沈阳", 41.8057, 123.4315, ("辽宁沈阳", "沈阳市", "沈阳")),
    LocalPlace("中国", "吉林", "长春", 43.8171, 125.3235, ("吉林长春", "长春市", "长春")),
    LocalPlace("中国", "黑龙江", "哈尔滨", 45.8038, 126.5349, ("黑龙江哈尔滨", "哈尔滨市", "哈尔滨")),
    LocalPlace("中国", "内蒙古", "呼和浩特", 40.8426, 111.7492, ("内蒙古呼和浩特", "呼和浩特市", "呼和浩特")),
    LocalPlace("中国", "甘肃", "兰州", 36.0611, 103.8343, ("甘肃兰州", "兰州市", "兰州")),
    LocalPlace("中国", "青海", "西宁", 36.6171, 101.7782, ("青海西宁", "西宁市", "西宁")),
    LocalPlace("中国", "宁夏", "银川", 38.4872, 106.2309, ("宁夏银川", "银川市", "银川")),
    LocalPlace("中国", "新疆", "乌鲁木齐", 43.8256, 87.6168, ("新疆乌鲁木齐", "乌鲁木齐市", "乌鲁木齐")),
    LocalPlace("中国", "西藏", "拉萨", 29.6520, 91.1721, ("西藏拉萨", "拉萨市", "拉萨")),
)

CN_SUFFIXES = (
    "中华人民共和国", "中国", "特别行政区", "自治区", "自治州", "自治县",
    "省", "市", "区", "县", "镇", "乡", "街道", "地区", "盟",
)


def _normalize_cn_query(query: str) -> str:
    normalized = re.sub(r"[\s,，/]+", "", query.strip().lower())
    for suffix in CN_SUFFIXES:
        normalized = normalized.replace(suffix, "")
    return normalized


def _place_to_result(place: LocalPlace) -> dict[str, Any]:
    display_name = f"{place.country}, {place.state}, {place.city}"
    formatted_address = f"{place.state}{place.city}"
    return {
        "lat": f"{place.lat:.6f}",
        "lon": f"{place.lon:.6f}",
        "display_name": display_name,
        "formatted_address": formatted_address,
        "address": {
            "country": place.country,
            "state": place.state,
            "province": place.state,
            "city": place.city,
        },
        "source": "local_cn_fallback",
    }


def _local_cn_geocode(query: str) -> list[dict[str, Any]]:
    normalized = _normalize_cn_query(query)
    if not normalized:
        return []

    scored: list[tuple[int, LocalPlace]] = []
    for place in LOCAL_CN_PLACES:
        terms = {_normalize_cn_query(place.state), _normalize_cn_query(place.city)}
        terms.update(_normalize_cn_query(alias) for alias in place.aliases)
        score = 0
        for term in terms:
            if not term:
                continue
            if normalized == term:
                score = max(score, 100)
            elif normalized in term or term in normalized:
                score = max(score, min(len(term), len(normalized)) * 10)
        if score:
            scored.append((score, place))

    scored.sort(key=lambda item: (-item[0], item[1].state, item[1].city))
    return [_place_to_result(place) for _, place in scored[:5]]


def _provider_unavailable_detail(url: str) -> str:
    if "/v1/search" in url or "/v1/reverse" in url or "pelias" in url.lower():
        return "Pelias geocoder is unavailable. Start the Pelias API service and make sure its data import completed."
    if "nominatim.openstreetmap.org" in url:
        return (
            "External geocoder is unreachable from this machine. "
            "Address search requires internet access, or you need to configure a local geocoder service."
        )
    return f"Geocoder request failed: {url}"


def _resolve_region(country_code: str | None) -> str:
    normalized = (country_code or GEOCODER_DEFAULT_REGION or "cn").strip().lower()
    return "us" if normalized == "us" else "cn"


def _resolve_geocoder_urls(country_code: str | None) -> tuple[str, str, str]:
    region = _resolve_region(country_code)
    if region == "us":
        return region, GEOCODER_API_URL_US, GEOCODER_REVERSE_API_URL_US
    return region, GEOCODER_API_URL_CN, GEOCODER_REVERSE_API_URL_CN


def _pick_first_text(values: list[Any]) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _is_pelias_url(url: str) -> bool:
    normalized = url.lower()
    return "/v1/search" in normalized or "/v1/reverse" in normalized or "pelias" in normalized


US_STATE_ALIASES: dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}


def _us_geocode_fallback_queries(query: str) -> list[str]:
    """Use coarse US place searches when Pelias address/street queries fail."""
    cleaned = re.sub(r"\b(usa|united states|united states of america)\b", " ", query, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(suite|ste|unit|apt|apartment|floor|fl)\s+[A-Za-z0-9-]+\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned.replace(",", " ")).strip()
    if not cleaned:
        return []

    tokens = cleaned.split()
    candidates: list[str] = []
    state_pattern = re.compile(r"\b(" + "|".join(re.escape(code) for code in US_STATE_ALIASES.values()) + r")\b", re.IGNORECASE)
    match = state_pattern.search(cleaned)
    if match:
        state = match.group(1).upper()
        before_state = cleaned[:match.start()].strip()
        words = before_state.split()
        if words:
            city = " ".join(words[-3:])
            candidates.append(f"{city} {state}")
            if len(words) >= 2:
                candidates.append(f"{' '.join(words[-2:])} {state}")

    lowered = cleaned.lower()
    for state_name, state_code in US_STATE_ALIASES.items():
        idx = lowered.rfind(state_name)
        if idx >= 0:
            before_state = cleaned[:idx].strip()
            words = before_state.split()
            if words:
                candidates.append(f"{' '.join(words[-3:])} {state_code}")
                candidates.append(f"{' '.join(words[-3:])} {state_name}")
            break

    if len(tokens) >= 3:
        candidates.append(" ".join(tokens[-3:]))
    if len(tokens) >= 2:
        candidates.append(" ".join(tokens[-2:]))

    unique: list[str] = []
    for candidate in candidates:
        normalized = re.sub(r"\s+", " ", candidate).strip(" ,")
        if normalized and normalized.lower() not in {item.lower() for item in unique}:
            unique.append(normalized)
    return unique[:4]


def _normalize_forward_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        results: list[dict[str, Any]] = []
        for feature in payload["features"]:
            if not isinstance(feature, dict):
                continue
            props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
            geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
            coordinates = geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else []
            lon = coordinates[0] if len(coordinates) > 0 else None
            lat = coordinates[1] if len(coordinates) > 1 else None
            if lat is None or lon is None:
                continue

            display_name = _pick_first_text([
                props.get("label"),
                props.get("name"),
                props.get("display_name"),
            ])
            formatted_address = _pick_first_text([
                props.get("label"),
                props.get("name"),
            ])
            address = {
                "country": props.get("country"),
                "state": props.get("state") or props.get("region"),
                "province": props.get("region") or props.get("state"),
                "city": props.get("city") or props.get("locality") or props.get("county"),
                "district": props.get("county") or props.get("borough"),
                "street": props.get("street"),
                "house_number": props.get("housenumber"),
                "postcode": props.get("postalcode"),
            }
            results.append({
                "lat": str(lat),
                "lon": str(lon),
                "display_name": display_name,
                "formatted_address": formatted_address,
                "address": address,
                "raw": feature,
            })
        return results

    raise HTTPException(status_code=502, detail="Unsupported geocoder response")


def _normalize_reverse_payload(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("display_name"), str):
        address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
        parts = [
            address.get("country"),
            address.get("state"),
            address.get("city") or address.get("town") or address.get("village") or address.get("municipality"),
            address.get("county") or address.get("district") or address.get("suburb"),
            address.get("road"),
            address.get("house_number"),
            address.get("postcode"),
        ]
        formatted = ", ".join(str(part).strip() for part in parts if isinstance(part, str) and part.strip())
        return {
            "display_name": payload["display_name"].strip(),
            "formatted_address": formatted or payload["display_name"].strip(),
            "address": address,
            "raw": payload,
        }

    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        features = payload["features"]
        if not features:
            raise HTTPException(status_code=404, detail="No reverse geocoding result")

        first = features[0] if isinstance(features[0], dict) else {}
        props = first.get("properties") if isinstance(first.get("properties"), dict) else {}
        formatted = _pick_first_text([props.get("label"), props.get("name")])
        parts = [
            props.get("country"),
            props.get("state"),
            props.get("city"),
            props.get("district") or props.get("county"),
            props.get("street"),
            props.get("housenumber"),
            props.get("postcode"),
        ]
        joined = ", ".join(str(part).strip() for part in parts if isinstance(part, str) and part.strip())
        return {
            "display_name": formatted or joined,
            "formatted_address": joined or formatted,
            "address": props,
            "raw": payload,
        }

    raise HTTPException(status_code=502, detail="Unsupported reverse geocoder response")


@router.get("/geocode")
async def geocode(request: Request, q: str = Query(...), country_code: str | None = Query(default=None)):
    region, geocoder_api_url, _ = _resolve_geocoder_urls(country_code)
    params: dict[str, Any] = dict(request.query_params)
    params.setdefault("q", q)
    params.setdefault("limit", params.get("limit", "5"))
    params.pop("country_code", None)

    if not _is_pelias_url(geocoder_api_url):
        raise HTTPException(status_code=500, detail="Only Pelias geocoder URLs are supported.")

    params["text"] = params.pop("q", q)
    params.pop("format", None)
    params.setdefault("lang", "zh" if region == "cn" else "en")

    async with AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                geocoder_api_url,
                params=params,
                headers=DEFAULT_GEOCODER_HEADERS,
            )
            response.raise_for_status()
        except HTTPError as exc:
            if region == "cn":
                fallback = _local_cn_geocode(q)
                if fallback:
                    return fallback
            raise HTTPException(
                status_code=503,
                detail=_provider_unavailable_detail(geocoder_api_url),
            ) from exc
    payload = _normalize_forward_payload(response.json())
    if region == "cn" and not payload:
        fallback = _local_cn_geocode(q)
        if fallback:
            return fallback
    return payload


@router.get("/reverse-geocode")
async def reverse_geocode(
    lat: float = Query(...),
    lon: float = Query(...),
    zoom: int = Query(18),
    country_code: str | None = Query(default=None),
):
    region, _, geocoder_reverse_api_url = _resolve_geocoder_urls(country_code)
    params: dict[str, Any] = {
        "lat": lat,
        "lon": lon,
        "zoom": zoom,
    }

    if not _is_pelias_url(geocoder_reverse_api_url):
        raise HTTPException(status_code=500, detail="Only Pelias geocoder URLs are supported.")

    params["point.lat"] = params.pop("lat")
    params["point.lon"] = params.pop("lon")
    params.pop("zoom", None)
    params.setdefault("size", 1)
    params.setdefault("lang", "zh" if region == "cn" else "en")

    async with AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                geocoder_reverse_api_url,
                params=params,
                headers=DEFAULT_GEOCODER_HEADERS,
            )
            response.raise_for_status()
        except HTTPError as exc:
            raise HTTPException(
                status_code=503,
                detail=_provider_unavailable_detail(geocoder_reverse_api_url),
            ) from exc

    return _normalize_reverse_payload(response.json())
