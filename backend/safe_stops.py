"""
Nearest safe stop finder using OpenStreetMap Overpass API.
No API key required. Returns bus stops, petrol pumps, rest areas near a GPS point.
"""
import urllib.request
import urllib.parse
import json
import math


OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Ahmedabad fallback stops (used when GPS not available or API fails)
FALLBACK_STOPS = [
    {"name": "Naroda Bus Depot", "type": "bus_stop", "lat": 23.0469, "lon": 72.6693, "distance_m": 0},
    {"name": "Vastral BRTS Stop", "type": "bus_stop", "lat": 23.0156, "lon": 72.6603, "distance_m": 0},
    {"name": "Kalupur Bus Station", "type": "bus_stop", "lat": 23.0258, "lon": 72.5873, "distance_m": 0},
    {"name": "HP Petrol Pump, SG Highway", "type": "fuel", "lat": 23.0395, "lon": 72.5079, "distance_m": 0},
    {"name": "Indian Oil, Bopal", "type": "fuel", "lat": 23.0019, "lon": 72.4694, "distance_m": 0},
    {"name": "Ahmedabad Rest Area, NH-48", "type": "rest_area", "lat": 22.9784, "lon": 72.5012, "distance_m": 0},
]

TYPE_ICONS = {
    "bus_stop": "🚌",
    "fuel":     "⛽",
    "rest_area":"🛑",
    "amenity":  "🏪",
}


def haversine(lat1, lon1, lat2, lon2) -> float:
    """Distance in metres between two GPS points."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def find_safe_stops(lat: float, lon: float, radius_m: int = 3000) -> list[dict]:
    """
    Query OpenStreetMap for nearest bus stops, petrol pumps, rest areas.
    Falls back to Ahmedabad hardcoded stops if API unreachable.
    """
    query = f"""
    [out:json][timeout:10];
    (
      node["highway"="bus_stop"](around:{radius_m},{lat},{lon});
      node["amenity"="fuel"](around:{radius_m},{lat},{lon});
      node["highway"="rest_area"](around:{radius_m},{lat},{lon});
      node["amenity"="rest_area"](around:{radius_m},{lat},{lon});
    );
    out body 10;
    """
    try:
        data = urllib.parse.urlencode({"data": query}).encode()
        req = urllib.request.Request(OVERPASS_URL, data=data,
                                     headers={"User-Agent": "SentinelDrive/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = json.loads(resp.read())

        stops = []
        for el in result.get("elements", []):
            tags = el.get("tags", {})
            name = tags.get("name") or tags.get("operator") or "Unnamed Stop"
            stop_type = "bus_stop" if tags.get("highway") == "bus_stop" else \
                        "fuel"     if tags.get("amenity") == "fuel" else "rest_area"
            dist = haversine(lat, lon, el["lat"], el["lon"])
            stops.append({
                "name": name,
                "type": stop_type,
                "icon": TYPE_ICONS.get(stop_type, "📍"),
                "lat": round(el["lat"], 6),
                "lon": round(el["lon"], 6),
                "distance_m": round(dist),
                "distance_text": _fmt_dist(dist),
                "maps_url": f"https://www.google.com/maps/dir/?api=1&destination={el['lat']},{el['lon']}",
            })

        stops.sort(key=lambda x: x["distance_m"])
        return stops[:6]

    except Exception as e:
        print(f"[SafeStops] OSM API failed ({e}), using fallback")
        # Return fallback stops with computed distances
        for s in FALLBACK_STOPS:
            s["distance_m"] = round(haversine(lat, lon, s["lat"], s["lon"]))
            s["distance_text"] = _fmt_dist(s["distance_m"])
            s["icon"] = TYPE_ICONS.get(s["type"], "📍")
            s["maps_url"] = f"https://www.google.com/maps/dir/?api=1&destination={s['lat']},{s['lon']}"
        return sorted(FALLBACK_STOPS, key=lambda x: x["distance_m"])[:6]


def _fmt_dist(metres: float) -> str:
    if metres < 1000:
        return f"{round(metres)} m"
    return f"{metres/1000:.1f} km"
