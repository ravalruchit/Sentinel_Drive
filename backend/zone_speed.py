"""
AI Zone-Based Speed Limit System
Detects road type from GPS coordinates using OpenStreetMap Overpass API
and enforces zone-specific speed limits in real time.

Zone limits (India road safety standards):
  highway   → 80 km/h  (national/state highway)
  city      → 50 km/h  (urban arterial road)
  local     → 30 km/h  (residential / local street)
  village   → 25 km/h  (rural village road)
  unknown   → 50 km/h  (default safe fallback)
"""

import urllib.request
import urllib.parse
import json
import math
from datetime import datetime

# ---------------------------------------------------------------------------
# Zone speed limits (km/h)
# ---------------------------------------------------------------------------
ZONE_LIMITS = {
    "highway": 80,
    "city":    50,
    "local":   30,
    "village": 25,
    "unknown": 50,
}

ZONE_LABELS = {
    "highway": "Highway",
    "city":    "City Area",
    "local":   "Local Area",
    "village": "Village Area",
    "unknown": "Unknown Area",
}

ZONE_COLORS = {
    "highway": "#00d4ff",
    "city":    "#00ff88",
    "local":   "#ffd700",
    "village": "#ff9500",
    "unknown": "#9ca3af",
}

# OSM highway tags → our zone categories
_HIGHWAY_TO_ZONE = {
    # Highways
    "motorway": "highway", "motorway_link": "highway",
    "trunk": "highway",    "trunk_link": "highway",
    "primary": "highway",  "primary_link": "highway",
    # City roads
    "secondary": "city",   "secondary_link": "city",
    "tertiary": "city",    "tertiary_link": "city",
    "road": "city",
    # Local / residential
    "residential": "local", "living_street": "local",
    "unclassified": "local", "service": "local",
    "pedestrian": "local",
    # Village / rural
    "track": "village", "path": "village",
    "footway": "village", "cycleway": "village",
}

# ---------------------------------------------------------------------------
# Cache — avoid hammering Overpass API every second
# ---------------------------------------------------------------------------
_cache: dict = {}          # (lat_r, lon_r) → {"zone": ..., "road": ..., "ts": ...}
_CACHE_RADIUS = 0.002      # ~200m grid cell
_CACHE_TTL    = 120        # seconds before re-querying


def _round_coord(val: float, step: float = _CACHE_RADIUS) -> float:
    return round(round(val / step) * step, 6)


def _cache_key(lat: float, lon: float):
    return (_round_coord(lat), _round_coord(lon))


def _is_fresh(entry: dict) -> bool:
    return (datetime.now().timestamp() - entry["ts"]) < _CACHE_TTL


# ---------------------------------------------------------------------------
# Overpass query — find nearest road within 50m
# ---------------------------------------------------------------------------
def _query_overpass(lat: float, lon: float) -> tuple[str, str]:
    """Returns (zone, road_name). Falls back to 'unknown' on any error."""
    query = f"""
[out:json][timeout:5];
way(around:50,{lat},{lon})[highway];
out tags 1;
"""
    url = "https://overpass-api.de/api/interpreter"
    try:
        data = urllib.parse.urlencode({"data": query}).encode()
        req = urllib.request.Request(url, data=data,
                                     headers={"User-Agent": "SentinelDrive/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())

        elements = result.get("elements", [])
        if not elements:
            return "unknown", "Unknown Road"

        tags = elements[0].get("tags", {})
        hw_type = tags.get("highway", "")
        road_name = tags.get("name") or tags.get("ref") or hw_type.replace("_", " ").title()
        zone = _HIGHWAY_TO_ZONE.get(hw_type, "unknown")
        return zone, road_name

    except Exception:
        return "unknown", "Unknown Road"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_zone(lat: float, lon: float) -> dict:
    """
    Returns zone info for given GPS coordinates.
    Uses cache to avoid repeated API calls.
    """
    key = _cache_key(lat, lon)
    if key in _cache and _is_fresh(_cache[key]):
        return _cache[key]

    zone, road = _query_overpass(lat, lon)
    entry = {
        "zone":       zone,
        "road_name":  road,
        "limit_kmh":  ZONE_LIMITS[zone],
        "label":      ZONE_LABELS[zone],
        "color":      ZONE_COLORS[zone],
        "ts":         datetime.now().timestamp(),
    }
    _cache[key] = entry
    return entry


def check_overspeed(speed_kmh: float, lat: float, lon: float) -> dict:
    """
    Check if current speed exceeds zone limit.
    Returns dict with overspeed info or None if within limit.
    """
    zone_info = get_zone(lat, lon)
    limit = zone_info["limit_kmh"]
    over_by = round(speed_kmh - limit, 1)

    result = {
        "zone":      zone_info["zone"],
        "label":     zone_info["label"],
        "road_name": zone_info["road_name"],
        "limit_kmh": limit,
        "speed_kmh": round(speed_kmh, 1),
        "color":     zone_info["color"],
        "overspeed": over_by > 0,
        "over_by":   max(0, over_by),
        "severity":  None,
    }

    if over_by > 20:
        result["severity"] = "critical"
    elif over_by > 5:
        result["severity"] = "warning"

    return result
