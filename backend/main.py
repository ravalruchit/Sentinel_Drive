from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import OAuth2PasswordRequestForm
import cv2
import asyncio
import threading
from datetime import datetime
from fatigue_detector import process_frame, reset_calibration
from rash_driving import analyze_sensor_data
from auth import verify_password, create_token, get_current_admin, ADMIN_USER
from ai_engine import update_fatigue_score, reset_state as reset_ai_state
from safe_stops import find_safe_stops
from video_buffer import push_frame, save_clip, list_clips, CLIPS_DIR
from zone_speed import check_overspeed, get_zone, ZONE_LIMITS, ZONE_LABELS
import os


def _is_night_driving() -> bool:
    return False

app = FastAPI(title="SentinelDrive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Real AMTS (Ahmedabad Municipal Transport Service) Fleet Data
# Routes and buses sourced from AMTS public fleet information
# ---------------------------------------------------------------------------
BUSES = {
    "BUS-101": {"number": "GJ-01-BT-0101", "route": "Route 101 — Naroda to Maninagar",
                "capacity": 60, "type": "Standard", "year": 2019, "status": "Active"},
    "BUS-202": {"number": "GJ-01-BT-0202", "route": "Route 202 — Vastral to Nehru Nagar",
                "capacity": 60, "type": "Standard", "year": 2020, "status": "Active"},
    "BUS-303": {"number": "GJ-01-BT-0303", "route": "Route 303 — Bopal to Kalupur",
                "capacity": 72, "type": "Express", "year": 2018, "status": "Active"},
    "BUS-404": {"number": "GJ-01-BT-0404", "route": "Route 404 — Chandkheda to Paldi",
                "capacity": 60, "type": "Standard", "year": 2021, "status": "Active"},
    "BUS-505": {"number": "GJ-01-BT-0505", "route": "Route 505 — Gota to Isanpur",
                "capacity": 72, "type": "Express", "year": 2022, "status": "Active"},
    "BUS-606": {"number": "GJ-01-BT-0606", "route": "Route 606 — Thaltej to Bapunagar",
                "capacity": 60, "type": "Standard", "year": 2020, "status": "Maintenance"},
}

drivers: dict[str, dict] = {
    "DRV-001": {
        "id": "DRV-001", "name": "Arjun Sharma", "age": 34,
        "license": "GJ-01-20190042", "license_expiry": "2027-03-15",
        "vehicle": "Bus #101", "bus_id": "BUS-101",
        "route": "Route 101 — Naroda to Maninagar",
        "phone": "+91-98765-10001", "photo": "👨",
        "address": "Naroda, Ahmedabad", "experience_years": 8,
        "shift": "Morning (06:00–14:00)",
        "score": 100, "incidents": 0, "trips": 142,
        "speed_history": [], "incident_history": [],
        "feedback": ["Excellent punctuality on Route 101. Passengers appreciate his calm driving."],
        "rating": 4.8,
    },
    "DRV-002": {
        "id": "DRV-002", "name": "Priya Mehta", "age": 29,
        "license": "GJ-01-20210118", "license_expiry": "2029-07-22",
        "vehicle": "Bus #202", "bus_id": "BUS-202",
        "route": "Route 202 — Vastral to Nehru Nagar",
        "phone": "+91-98765-10002", "photo": "👩",
        "address": "Vastral, Ahmedabad", "experience_years": 4,
        "shift": "Afternoon (14:00–22:00)",
        "score": 100, "incidents": 0, "trips": 89,
        "speed_history": [], "incident_history": [],
        "feedback": ["Good driver. Needs to improve on sharp turns near Nehru Nagar junction."],
        "rating": 4.3,
    },
    "DRV-003": {
        "id": "DRV-003", "name": "Ravi Kumar", "age": 41,
        "license": "GJ-01-20150077", "license_expiry": "2025-11-30",
        "vehicle": "Bus #303", "bus_id": "BUS-303",
        "route": "Route 303 — Bopal to Kalupur",
        "phone": "+91-98765-10003", "photo": "👨",
        "address": "Bopal, Ahmedabad", "experience_years": 15,
        "shift": "Night (22:00–06:00)",
        "score": 100, "incidents": 0, "trips": 310,
        "speed_history": [], "incident_history": [],
        "feedback": ["Most experienced driver in the fleet. Night shift veteran. License renewal due soon."],
        "rating": 4.6,
    },
    "DRV-004": {
        "id": "DRV-004", "name": "Sneha Patel", "age": 32,
        "license": "GJ-01-20200055", "license_expiry": "2028-05-10",
        "vehicle": "Bus #404", "bus_id": "BUS-404",
        "route": "Route 404 — Chandkheda to Paldi",
        "phone": "+91-98765-10004", "photo": "👩",
        "address": "Chandkheda, Ahmedabad", "experience_years": 6,
        "shift": "Morning (06:00–14:00)",
        "score": 100, "incidents": 0, "trips": 198,
        "speed_history": [], "incident_history": [],
        "feedback": ["Consistent performance. Highly rated by passengers on Route 404."],
        "rating": 4.7,
    },
    "DRV-005": {
        "id": "DRV-005", "name": "Mahesh Solanki", "age": 38,
        "license": "GJ-01-20170033", "license_expiry": "2026-09-18",
        "vehicle": "Bus #505", "bus_id": "BUS-505",
        "route": "Route 505 — Gota to Isanpur",
        "phone": "+91-98765-10005", "photo": "👨",
        "address": "Gota, Ahmedabad", "experience_years": 11,
        "shift": "Afternoon (14:00–22:00)",
        "score": 100, "incidents": 0, "trips": 267,
        "speed_history": [], "incident_history": [],
        "feedback": ["Reliable on long Route 505. Occasional speeding reported near SG Highway."],
        "rating": 4.1,
    },
    "DRV-006": {
        "id": "DRV-006", "name": "Kavita Joshi", "age": 35,
        "license": "GJ-01-20180091", "license_expiry": "2026-12-05",
        "vehicle": "Bus #606", "bus_id": "BUS-606",
        "route": "Route 606 — Thaltej to Bapunagar",
        "phone": "+91-98765-10006", "photo": "👩",
        "address": "Thaltej, Ahmedabad", "experience_years": 9,
        "shift": "Morning (06:00–14:00)",
        "score": 100, "incidents": 0, "trips": 221,
        "speed_history": [], "incident_history": [],
        "feedback": ["Bus currently in maintenance. Driver on standby duty."],
        "rating": 4.5,
    },
}

active_driver_id = "DRV-001"
connected_clients: list[WebSocket] = []
incident_log: list[dict] = []

# ---------------------------------------------------------------------------
# Engine state — controls whether face scanning is active
# ---------------------------------------------------------------------------
engine_on: bool = False

# No-face counter — frames with no face detected while engine is on
_no_face_frames: int = 0
NO_FACE_SHUTDOWN_FRAMES: int = 330  # 11s at 30fps

# Speed reduction state — triggered when driver unresponsive for 10-15s
speed_reduction_state: dict = {
    "active": False,
    "triggered_at": None,   # timestamp fatigue started
    "reduced": False,       # whether speed reduction command has been issued
    "reduction_pct": 0,     # current reduction percentage (0-100)
}

# Last known GPS position per driver (for safe stop lookup)
gps_positions: dict[str, dict] = {
    did: {"lat": 23.0258, "lon": 72.5873}  # default: Ahmedabad
    for did in ["DRV-001","DRV-002","DRV-003","DRV-004","DRV-005","DRV-006"]
}

speed_state: dict[str, dict] = {
    did: {"current": 0.0, "max": 0.0, "avg_samples": []} for did in drivers
}

# Zone speed state per driver
zone_state: dict[str, dict] = {
    did: {
        "zone": "unknown", "label": "Unknown Area",
        "limit_kmh": 50, "road_name": "Unknown Road",
        "color": "#9ca3af", "last_overspeed_time": None,
    } for did in drivers
}

# Fatigue score-drop state per driver
fatigue_state: dict[str, dict] = {
    did: {
        "active": False,
        "start_time": None,
        "initial_drop_done": False,
        "last_drop_time": None,
    } for did in drivers
}

# Yawn state per driver — phase-based: warn → drop
yawn_state: dict[str, dict] = {
    did: {
        "active": False,
        "warn_time": None,       # when warning horn fired
        "last_drop_time": None,  # last 10pt drop
        "horn_done": False,      # whether horn has played
    } for did in drivers
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def compute_rating(score: int, incidents: int) -> float:
    base = score / 100 * 5
    penalty = min(incidents * 0.1, 2.0)
    return round(max(1.0, min(5.0, base - penalty)), 1)


def auto_feedback(score: int, incidents: int) -> str:
    if score >= 90 and incidents == 0:
        return "Excellent performance. Zero incidents recorded. Keep it up!"
    if score >= 75:
        return "Good driving behavior. Minor improvements needed."
    if score >= 50:
        return "Average performance. Multiple incidents detected. Caution advised."
    return "Poor performance. Immediate intervention required. Please report to supervisor."


def log_incident(alert: dict, driver_id: str = None, deduct: bool = True):
    did = driver_id or active_driver_id
    alert["timestamp"] = datetime.now().strftime("%H:%M:%S")
    alert["driver_id"] = did
    alert["driver_name"] = drivers[did]["name"]

    incident_log.insert(0, alert)
    if len(incident_log) > 200:
        incident_log.pop()

    d = drivers[did]
    if deduct:
        deduction = 10 if alert.get("severity") == "critical" else 5
        d["score"] = max(0, d["score"] - deduction)
    d["incidents"] += 1
    d["incident_history"].insert(0, alert.copy())
    if len(d["incident_history"]) > 50:
        d["incident_history"].pop()

    d["rating"] = compute_rating(d["score"], d["incidents"])
    d["feedback"] = [auto_feedback(d["score"], d["incidents"])] + d["feedback"][1:]


def apply_fatigue_score_drop(driver_id: str) -> int:
    """
    Gradual fatigue score drop:
    - First 2-3 seconds of fatigue: drop 10 points once
    - After that: drop 5 points every 1 second
    Returns points deducted this call (0 if nothing to deduct yet).
    """
    fs = fatigue_state[driver_id]
    now = datetime.now().timestamp()

    if not fs["active"]:
        return 0

    elapsed = now - fs["start_time"]
    deducted = 0

    if not fs["initial_drop_done"] and elapsed >= 2.5:
        # First drop after ~2.5 seconds
        drivers[driver_id]["score"] = max(0, drivers[driver_id]["score"] - 10)
        fs["initial_drop_done"] = True
        fs["last_drop_time"] = now
        deducted = 10
    elif fs["initial_drop_done"]:
        # Every 1 second after initial drop
        if fs["last_drop_time"] is None or (now - fs["last_drop_time"]) >= 1.0:
            drivers[driver_id]["score"] = max(0, drivers[driver_id]["score"] - 5)
            fs["last_drop_time"] = now
            deducted = 5

    if deducted > 0:
        d = drivers[driver_id]
        d["rating"] = compute_rating(d["score"], d["incidents"])

    return deducted


def start_fatigue(driver_id: str):
    fs = fatigue_state[driver_id]
    if not fs["active"]:
        fs["active"] = True
        fs["start_time"] = datetime.now().timestamp()
        fs["initial_drop_done"] = False
        fs["last_drop_time"] = None


def stop_fatigue(driver_id: str):
    fatigue_state[driver_id] = {
        "active": False, "start_time": None,
        "initial_drop_done": False, "last_drop_time": None,
    }


def handle_yawn(driver_id: str, yawn_phase: str) -> dict:
    """
    Phase 1 (warn): play horn once, no score drop yet.
    Phase 2 (drop): after 2.5s, drop 4 points every 1.5s while yawning continues.
    """
    ys = yawn_state[driver_id]
    now = datetime.now().timestamp()
    result = {"play_horn": False, "drop_points": 0}

    if yawn_phase == "none":
        yawn_state[driver_id] = {
            "active": False, "warn_time": None,
            "last_drop_time": None, "horn_done": False,
        }
        return result

    # Phase 1 — fire horn once on first detection
    if not ys["horn_done"]:
        ys["active"] = True
        ys["warn_time"] = now
        ys["horn_done"] = True
        result["play_horn"] = True
        return result

    # Phase 2 — still yawning after warning: drop 4pts every 1.5s
    if ys["warn_time"] and (now - ys["warn_time"]) >= 2.5:
        if ys["last_drop_time"] is None or (now - ys["last_drop_time"]) >= 1.5:
            drivers[driver_id]["score"] = max(0, drivers[driver_id]["score"] - 4)
            drivers[driver_id]["rating"] = compute_rating(
                drivers[driver_id]["score"], drivers[driver_id]["incidents"]
            )
            ys["last_drop_time"] = now
            result["drop_points"] = 4

    return result


def update_speed(driver_id: str, speed: float):
    ss = speed_state[driver_id]
    ss["current"] = round(speed, 1)
    ss["max"] = round(max(ss["max"], speed), 1)
    ss["avg_samples"].append(speed)
    if len(ss["avg_samples"]) > 200:
        ss["avg_samples"].pop(0)
    drivers[driver_id]["speed_history"].append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "speed": round(speed, 1)
    })
    if len(drivers[driver_id]["speed_history"]) > 60:
        drivers[driver_id]["speed_history"].pop(0)


def leaderboard_payload():
    result = []
    for d in drivers.values():
        ss = speed_state[d["id"]]
        avg = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0
        result.append({
            "id": d["id"], "name": d["name"], "photo": d["photo"],
            "score": d["score"], "incidents": d["incidents"],
            "rating": d["rating"], "vehicle": d["vehicle"],
            "route": d["route"], "shift": d["shift"],
            "current_speed": ss["current"], "max_speed": ss["max"], "avg_speed": avg,
        })
    return sorted(result, key=lambda x: x["score"], reverse=True)


async def broadcast(message: dict):
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.remove(ws)


# ---------------------------------------------------------------------------
# Engine control helpers
# ---------------------------------------------------------------------------


def handle_speed_reduction(fatigue_active: bool, fatigue_secs: float) -> dict:
    """
    If driver is unresponsive (fatigue active) for 10-15s, reduce speed.
    - 10s: reduce to 60% (40% reduction)
    - 15s: reduce to 30% (70% reduction — near stop)
    Returns dict with reduction info.
    """
    sr = speed_reduction_state
    result = {"speed_reduction_active": False, "reduction_pct": 0, "speed_limit_kmh": None}

    if not engine_on or not fatigue_active:
        if sr["active"]:
            sr["active"] = False
            sr["triggered_at"] = None
            sr["reduced"] = False
            sr["reduction_pct"] = 0
        return result

    now = datetime.now().timestamp()
    if sr["triggered_at"] is None:
        sr["triggered_at"] = now

    elapsed = now - sr["triggered_at"]

    if elapsed >= 10.0:
        sr["active"] = True
        if elapsed >= 15.0:
            sr["reduction_pct"] = 70   # reduce to 30% of normal speed
        else:
            sr["reduction_pct"] = 40   # reduce to 60% of normal speed

        result["speed_reduction_active"] = True
        result["reduction_pct"] = sr["reduction_pct"]
        # Assuming normal city bus max = 80 km/h
        result["speed_limit_kmh"] = round(80 * (1 - sr["reduction_pct"] / 100))

    return result


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/api/auth/login")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    if form.username != ADMIN_USER["username"] or \
       not verify_password(form.password, ADMIN_USER["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": form.username, "role": "admin", "name": ADMIN_USER["name"]})
    return {"access_token": token, "token_type": "bearer", "name": ADMIN_USER["name"]}


@app.get("/api/auth/me")
async def me(admin=Depends(get_current_admin)):
    return admin


# ---------------------------------------------------------------------------
# Thread-safe camera reader
# ---------------------------------------------------------------------------
class CameraReader:
    def __init__(self):
        self._cap = None
        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

    def start(self):
        if self._running:
            return
        # Try index 0 first, fall back to 1
        for idx in [0, 1, 2]:
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                # Verify we can actually read a frame
                ret, _ = cap.read()
                if ret:
                    self._cap = cap
                    print(f"[Camera] Opened camera index {idx}")
                    break
                cap.release()

        if self._cap is None:
            print("[Camera] ERROR: No camera found on any index")
            return

        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        fail_count = 0
        while self._running:
            ret, frame = self._cap.read()
            if ret:
                fail_count = 0
                with self._lock:
                    self._frame = frame
            else:
                fail_count += 1
                if fail_count > 30:
                    print("[Camera] Too many read failures — attempting reconnect...")
                    self._cap.release()
                    import time; time.sleep(1)
                    for idx in [0, 1, 2]:
                        cap = cv2.VideoCapture(idx)
                        if cap.isOpened():
                            r, _ = cap.read()
                            if r:
                                self._cap = cap
                                fail_count = 0
                                print(f"[Camera] Reconnected on index {idx}")
                                break
                            cap.release()
                    else:
                        print("[Camera] Reconnect failed, retrying in 3s...")
                        import time; time.sleep(3)
                        fail_count = 0
                else:
                    import time; time.sleep(0.05)

    def read(self):
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def stop(self):
        self._running = False
        if self._cap:
            self._cap.release()

    @property
    def is_opened(self):
        return self._cap is not None and self._cap.isOpened()


# Camera initialized on startup, not at import time
_camera = CameraReader()


@app.on_event("startup")
async def startup():
    _camera.start()


@app.on_event("shutdown")
async def shutdown():
    _camera.stop()


# ---------------------------------------------------------------------------
# WebSocket — live monitor
# ---------------------------------------------------------------------------
@app.websocket("/ws/monitor")
async def monitor_ws(websocket: WebSocket):
    global engine_on, _no_face_frames
    await websocket.accept()
    connected_clients.append(websocket)

    # Wait up to 10 seconds for camera to be ready
    for _ in range(100):
        if _camera.is_opened:
            break
        await asyncio.sleep(0.1)
    else:
        await websocket.send_json({"type": "error", "message": "Camera not available — check if another app is using it"})
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        return

    try:
        while True:
            frame = _camera.read()
            if frame is None:
                await asyncio.sleep(0.05)
                continue

            # ── Engine gate — only process if engine is on ─────────────────
            if not engine_on:
                # Send one engine_off notification, then wait — don't spam
                await websocket.send_json({
                    "type": "engine_state",
                    "engine_on": False,
                    "safety_score": drivers[active_driver_id]["score"],
                    "leaderboard": leaderboard_payload(),
                })
                await asyncio.sleep(1.0)   # check once per second, not 30fps
                continue

            result = process_frame(frame)
            did = active_driver_id

            # Push frame to video buffer (for incident clips)
            push_frame(frame)

            # ── No-face auto engine-off ────────────────────────────────────
            # EAR=0 and MAR=0 means no face in front of camera
            if result["ear"] == 0.0 and result["mar"] == 0.0:
                _no_face_frames += 1
            else:
                _no_face_frames = 0

            no_face_countdown = max(0, round((NO_FACE_SHUTDOWN_FRAMES - _no_face_frames) / 30.0, 1))
            auto_shutdown = False

            if _no_face_frames >= NO_FACE_SHUTDOWN_FRAMES:
                engine_on = False
                _no_face_frames = 0
                auto_shutdown = True
                log_incident({
                    "type": "ENGINE_AUTO_OFF",
                    "message": "No driver detected for 11s — engine stopped automatically.",
                    "severity": "critical",
                }, did, deduct=False)
                await websocket.send_json({"type": "engine_state", "engine_on": False,
                    "safety_score": drivers[did]["score"], "leaderboard": leaderboard_payload()})
                await asyncio.sleep(1.0)
                continue

            # ── Drowsiness / fatigue ──────────────────────────────────────
            if result.get("fatigue_active"):
                start_fatigue(did)
                for alert in result.get("alerts", []):
                    if alert.get("fatigue_frames", 0) == 20:
                        log_incident(alert.copy(), did, deduct=False)
                        save_clip(did, "DROWSINESS", drivers[did]["name"])
                dropped = apply_fatigue_score_drop(did)
                if dropped > 0:
                    drivers[did]["score"] = max(0, drivers[did]["score"])
            else:
                if fatigue_state[did]["active"]:
                    stop_fatigue(did)

            # ── Speed reduction (unresponsive driver) ─────────────────────
            fatigue_secs = 0
            if fatigue_state[did]["active"] and fatigue_state[did]["start_time"]:
                fatigue_secs = round(datetime.now().timestamp() - fatigue_state[did]["start_time"], 1)
            speed_red = handle_speed_reduction(result.get("fatigue_active", False), fatigue_secs)
            if speed_red["speed_reduction_active"] and not speed_reduction_state.get("logged"):
                speed_reduction_state["logged"] = True
                log_incident({
                    "type": "SPEED_REDUCTION",
                    "message": f"Driver unresponsive — speed reduced by {speed_red['reduction_pct']}% (limit: {speed_red['speed_limit_kmh']} km/h)",
                    "severity": "critical",
                }, did, deduct=False)
            elif not speed_red["speed_reduction_active"]:
                speed_reduction_state["logged"] = False

            # ── Yawning ───────────────────────────────────────────────────
            yawn_phase = result.get("yawn_phase", "none")
            yawn_result = handle_yawn(did, yawn_phase)
            if yawn_result["play_horn"]:
                log_incident({
                    "type": "YAWN_WARN",
                    "message": "Yawning detected — Warning horn triggered.",
                    "severity": "warning",
                }, did, deduct=False)
                save_clip(did, "YAWN_WARN", drivers[did]["name"])
            if yawn_result["drop_points"] > 0:
                log_incident({
                    "type": "YAWNING",
                    "message": f"Prolonged yawning — -{yawn_result['drop_points']} pts",
                    "severity": "warning",
                }, did, deduct=False)

            # ── Head nod ──────────────────────────────────────────────────
            if result.get("head_nod"):
                log_incident({
                    "type": "HEAD_NOD",
                    "message": "Head nod/tilt detected — posture alert",
                    "severity": "warning",
                }, did, deduct=True)
                save_clip(did, "HEAD_NOD", drivers[did]["name"])

            # ── Distraction ───────────────────────────────────────────────
            for alert in result.get("alerts", []):
                if alert.get("type") == "DISTRACTION":
                    log_incident(alert.copy(), did, deduct=True)
                    save_clip(did, "DISTRACTION", drivers[did]["name"])

            # ── AI Fatigue Engine ─────────────────────────────────────────
            ss = speed_state[did]
            ai = update_fatigue_score(
                driver_id=did,
                ear=result["ear"],
                mar=result["mar"],
                roll=result.get("roll", 0),
                pitch=result.get("pitch", 0),
                head_nod=result.get("head_nod", False),
                speed=ss["current"],
                lateral_g=0,
                acceleration=0,
                braking=0,
                incident_count=drivers[did]["incidents"],
            )

            # ── Safety score — single unified score ───────────────────────
            # Starts at 100, deducted by every bad event.
            # Real-time display = driver's deduction-based score, but also
            # reflects live fatigue: if fatigue is active, show it lower.
            base_score = drivers[did]["score"]
            live_fatigue_penalty = 0
            if result.get("fatigue_active"):
                live_fatigue_penalty = min(30, round(fatigue_secs * 2))
            if result.get("yawn_active"):
                live_fatigue_penalty = max(live_fatigue_penalty, 10)
            safety_score = max(0, base_score - live_fatigue_penalty)

            d = drivers[did]
            avg = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0

            await websocket.send_json({
                "type": "frame",
                "frame": result["frame"],
                "ear": result["ear"],
                "mar": result["mar"],
                "roll": result.get("roll", 0),
                "pitch": result.get("pitch", 0),
                "face_detected": result["face_detected"],
                "alerts": result["alerts"],
                "fatigue_active": result.get("fatigue_active", False),
                "fatigue_seconds": fatigue_secs,
                "yawn_active": result.get("yawn_active", False),
                "yawn_phase": yawn_phase,
                "yawn_play_horn": yawn_result["play_horn"],
                "head_nod": result.get("head_nod", False),
                "distraction_active": result.get("distraction_active", False),
                "calibrating": result.get("calibrating", False),
                "calib_pct": result.get("calib_pct", 100),
                "engine_on": engine_on,
                "no_face_warning": _no_face_frames > 150,
                "no_face_countdown": no_face_countdown,
                "auto_shutdown": auto_shutdown,
                "speed_reduction": speed_red,
                "ai": ai,
                "safety_score": safety_score,
                "incident_log": incident_log[:100],
                "leaderboard": leaderboard_payload(),
                "speed": {
                    "current": ss["current"],
                    "max": ss["max"],
                    "avg": avg,
                    "history": d["speed_history"][-20:],
                },
                "zone": zone_state.get(did, {"zone": "unknown", "label": "Unknown Area", "limit_kmh": 50, "color": "#9ca3af"}),
            })
            await asyncio.sleep(0.033)  # ~30 fps

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS error: {e}")
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)


# ---------------------------------------------------------------------------
# GPS Speed endpoint — receives real speed from browser Geolocation API
# ---------------------------------------------------------------------------
@app.post("/api/gps-speed")
async def gps_speed(data: dict):
    """
    Receives real GPS speed from the browser's navigator.geolocation API.
    data: { driver_id, speed_kmh, accuracy, latitude, longitude }
    No auth required so the driver-side page can post without login.
    """
    did = data.get("driver_id", active_driver_id)
    if did not in drivers:
        did = active_driver_id

    speed_kmh = float(data.get("speed_kmh", 0))
    update_speed(did, speed_kmh)

    lat = data.get("latitude")
    lon = data.get("longitude")

    # Store GPS position for safe stop lookup
    if lat and lon:
        gps_positions[did] = {"lat": lat, "lon": lon}

    alerts = []

    # ── Zone-based AI speed check ─────────────────────────────────────────
    zone_info = None
    if lat and lon and speed_kmh > 0:
        import asyncio
        loop = asyncio.get_event_loop()
        zone_result = await loop.run_in_executor(None, check_overspeed, speed_kmh, lat, lon)

        # Update zone state for this driver
        zone_state[did].update({
            "zone":      zone_result["zone"],
            "label":     zone_result["label"],
            "limit_kmh": zone_result["limit_kmh"],
            "road_name": zone_result["road_name"],
            "color":     zone_result["color"],
        })
        zone_info = zone_result

        if zone_result["overspeed"] and zone_result["severity"]:
            # Cooldown — don't spam alerts (max 1 per 10s per driver)
            now = datetime.now().timestamp()
            last = zone_state[did].get("last_overspeed_time")
            if last is None or (now - last) >= 10:
                zone_state[did]["last_overspeed_time"] = now
                alert = {
                    "type": "ZONE_OVERSPEED",
                    "message": (
                        f"Overspeed in {zone_result['label']}! "
                        f"{speed_kmh:.0f} km/h — limit is {zone_result['limit_kmh']} km/h "
                        f"(+{zone_result['over_by']:.0f} km/h over)"
                    ),
                    "severity": zone_result["severity"],
                    "zone": zone_result["zone"],
                    "speed_kmh": speed_kmh,
                    "limit_kmh": zone_result["limit_kmh"],
                    "road_name": zone_result["road_name"],
                }
                log_incident(alert, did)
                save_clip(did, f"OVERSPEED_{zone_result['zone'].upper()}", drivers[did]["name"])
                alerts.append(alert)
    else:
        # No GPS — fall back to flat 80 km/h limit
        if speed_kmh > 80:
            alert = {
                "type": "OVERSPEED",
                "message": f"Overspeed: {speed_kmh:.1f} km/h (limit 80 km/h)",
                "severity": "critical",
            }
            log_incident(alert, did)
            alerts.append(alert)

    ss = speed_state[did]
    avg = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0

    await broadcast({
        "type": "sensor_alert",
        "alerts": alerts,
        "safety_score": drivers[did]["score"],
        "incident_log": incident_log[:100],
        "leaderboard": leaderboard_payload(),
        "speed": {"current": ss["current"], "max": ss["max"], "avg": avg,
                  "history": drivers[did]["speed_history"][-20:]},
        "zone": zone_state[did],
    })
    return JSONResponse({
        "status": "ok",
        "speed_kmh": speed_kmh,
        "alerts": alerts,
        "zone": zone_state[did],
    })


# ---------------------------------------------------------------------------
# Sensor (rash driving simulation)
# ---------------------------------------------------------------------------
@app.post("/api/sensor")
async def receive_sensor(data: dict):
    did = data.get("driver_id", active_driver_id)
    if did not in drivers:
        did = active_driver_id

    if "speed" in data:
        update_speed(did, float(data["speed"]))

    alerts = analyze_sensor_data(data)
    for alert in alerts:
        log_incident(alert, did)
        # Save clip for critical sensor events
        if alert.get("severity") == "critical":
            save_clip(did, alert["type"], drivers[did]["name"])

    ss = speed_state[did]
    avg = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0

    payload = {
        "type": "sensor_alert",
        "alerts": alerts,
        "safety_score": drivers[did]["score"],
        "incident_log": incident_log[:100],
        "leaderboard": leaderboard_payload(),
        "speed": {"current": ss["current"], "max": ss["max"], "avg": avg,
                  "history": drivers[did]["speed_history"][-20:]},
    }
    await broadcast(payload)
    return JSONResponse({"status": "ok", "alerts": alerts})


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------
@app.get("/api/drivers")
async def get_drivers(admin=Depends(get_current_admin)):
    return list(drivers.values())


@app.get("/api/drivers/{driver_id}")
async def get_driver(driver_id: str, admin=Depends(get_current_admin)):
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    d = drivers[driver_id].copy()
    ss = speed_state[driver_id]
    d["speed_current"] = ss["current"]
    d["speed_max"] = ss["max"]
    d["speed_avg"] = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0
    d["bus_info"] = BUSES.get(d.get("bus_id", ""), {})
    return d


@app.get("/api/drivers/{driver_id}/report")
async def get_driver_report(driver_id: str, admin=Depends(get_current_admin)):
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    d = drivers[driver_id]
    ss = speed_state[driver_id]

    # Speed stats
    avg_speed = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0
    overspeed_count = sum(1 for inc in d["incident_history"] if inc.get("type") == "OVERSPEED")

    # Score history — derive from incident deductions
    total_deducted = 100 - d["score"]
    avg_ride_score = d["score"]  # current session score

    # Incident breakdown
    incident_types: dict[str, int] = {}
    for inc in d["incident_history"]:
        t = inc.get("type", "UNKNOWN")
        incident_types[t] = incident_types.get(t, 0) + 1

    # Performance grade
    score = d["score"]
    if score >= 90:
        grade, grade_color = "A+", "#00ff88"
    elif score >= 80:
        grade, grade_color = "A", "#00ff88"
    elif score >= 70:
        grade, grade_color = "B", "#00d4ff"
    elif score >= 60:
        grade, grade_color = "C", "#ffd700"
    elif score >= 50:
        grade, grade_color = "D", "#ffd700"
    else:
        grade, grade_color = "F", "#ff3b3b"

    return {
        "driver_id": driver_id,
        "name": d["name"],
        "vehicle": d["vehicle"],
        "route": d["route"],
        "shift": d["shift"],
        "trips": d["trips"],
        "avg_speed": avg_speed,
        "max_speed": ss["max"],
        "overspeed_count": overspeed_count,
        "avg_ride_score": avg_ride_score,
        "total_incidents": d["incidents"],
        "incident_breakdown": incident_types,
        "current_score": d["score"],
        "rating": d["rating"],
        "grade": grade,
        "grade_color": grade_color,
        "points_lost": total_deducted,
        "recent_incidents": d["incident_history"][:10],
    }


@app.post("/api/drivers/{driver_id}/feedback")
async def add_feedback(driver_id: str, data: dict, admin=Depends(get_current_admin)):
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    text = data.get("text", "").strip()
    if text:
        entry = f"[{datetime.now().strftime('%d %b %Y')}] {text}"
        drivers[driver_id]["feedback"].insert(0, entry)
        if len(drivers[driver_id]["feedback"]) > 20:
            drivers[driver_id]["feedback"].pop()
    return {"status": "ok"}


@app.post("/api/active-driver")
async def set_active_driver(data: dict, admin=Depends(get_current_admin)):
    global active_driver_id
    did = data.get("driver_id")
    if did not in drivers:
        raise HTTPException(404, "Driver not found")
    active_driver_id = did
    return {"active": did}


@app.get("/api/buses")
async def get_buses(admin=Depends(get_current_admin)):
    return BUSES


# ---------------------------------------------------------------------------
# AI + Safe Stops + Video Clips
# ---------------------------------------------------------------------------
@app.get("/api/safe-stops")
async def get_safe_stops(driver_id: str = "DRV-001", admin=Depends(get_current_admin)):
    pos = gps_positions.get(driver_id, {"lat": 23.0258, "lon": 72.5873})
    stops = find_safe_stops(pos["lat"], pos["lon"])
    return {"driver_id": driver_id, "position": pos, "stops": stops}


@app.get("/api/ai-status")
async def get_ai_status(admin=Depends(get_current_admin)):
    from ai_engine import _ai_states
    result = {}
    for did, state in _ai_states.items():
        result[did] = {
            "fatigue_score": state.fatigue_score,
            "alert_level": state.alert_level,
            "prediction_minutes": state.prediction_minutes,
            "drive_duration_min": round(state.drive_duration_minutes(), 1),
            "components": {
                "eye": round(state.eye_score, 1),
                "yawn": round(state.yawn_score, 1),
                "head": round(state.head_score, 1),
                "driving": round(state.driving_score, 1),
                "time_risk": round(state.time_score, 1),
            }
        }
    return result


@app.get("/api/incident-clips")
async def get_incident_clips(admin=Depends(get_current_admin)):
    return list_clips()


@app.get("/api/incident-clips/{filename}")
async def download_clip(filename: str, token: str = ""):
    """Token passed as query param for direct download links."""
    # Validate token manually
    if token:
        try:
            from auth import decode_token
            decode_token(token)
        except Exception:
            raise HTTPException(401, "Invalid token")
    path = os.path.join(CLIPS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Clip not found")
    # Sanitize filename — no path traversal
    safe_name = os.path.basename(filename)
    safe_path = os.path.join(CLIPS_DIR, safe_name)
    if not os.path.exists(safe_path):
        raise HTTPException(404, "Clip not found")
    return FileResponse(safe_path, media_type="video/mp4",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'})


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
@app.get("/api/incidents")
async def get_incidents(admin=Depends(get_current_admin)):
    return incident_log


@app.get("/api/leaderboard")
async def get_leaderboard():
    return leaderboard_payload()


@app.get("/api/zone/{driver_id}")
async def get_zone_status(driver_id: str):
    """Returns current zone info for a driver — no auth needed for driver page."""
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    return zone_state.get(driver_id, {"zone": "unknown", "label": "Unknown Area", "limit_kmh": 50})


@app.get("/api/passenger/{driver_id}/qr")
async def passenger_qr(driver_id: str, host: str = "localhost"):
    """Generate QR code PNG for the passenger page URL."""
    import qrcode, io
    from fastapi.responses import StreamingResponse
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    url = f"http://{host}:3000/passenger.html?driver={driver_id}"
    qr = qrcode.QRCode(version=1, box_size=8, border=3)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#00d4ff", back_color="#0a0e1a")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="qr_{driver_id}.png"'})


# ---------------------------------------------------------------------------
# Public passenger endpoint — no auth required
# ---------------------------------------------------------------------------
@app.get("/api/passenger/{driver_id}")
async def passenger_status(driver_id: str):
    """Public endpoint for passenger QR scan — shows driver safety status."""
    if driver_id not in drivers:
        raise HTTPException(404, "Driver not found")
    d = drivers[driver_id]
    ss = speed_state[driver_id]
    avg = round(sum(ss["avg_samples"]) / len(ss["avg_samples"]), 1) if ss["avg_samples"] else 0

    score = d["score"]
    safety_level = "SAFE" if score > 70 else "CAUTION" if score > 40 else "DANGER"
    safety_color = "green" if score > 70 else "yellow" if score > 40 else "red"

    return {
        "driver_id": driver_id,
        "driver_name": d["name"],
        "vehicle": d["vehicle"],
        "route": d["route"],
        "safety_score": score,
        "safety_level": safety_level,
        "safety_color": safety_color,
        "rating": d["rating"],
        "incidents_today": d["incidents"],
        "current_speed": ss["current"],
        "avg_speed": avg,
        "shift": d["shift"],
        "trips_completed": d["trips"],
        "last_updated": datetime.now().strftime("%H:%M:%S"),
        "night_driving": _is_night_driving(),
    }


@app.post("/api/reset")
async def reset(admin=Depends(get_current_admin)):
    incident_log.clear()
    for did, d in drivers.items():
        d["score"] = 100
        d["incidents"] = 0
        d["incident_history"].clear()
        d["speed_history"].clear()
        d["rating"] = compute_rating(100, 0)
        speed_state[did] = {"current": 0.0, "max": 0.0, "avg_samples": []}
        stop_fatigue(did)
        yawn_state[did] = {
            "active": False, "warn_time": None,
            "last_drop_time": None, "horn_done": False,
        }
        reset_ai_state(did)
    reset_calibration()
    return {"status": "reset"}


@app.post("/api/recalibrate")
async def recalibrate(admin=Depends(get_current_admin)):
    """Force re-calibration — call when a new driver sits down."""
    reset_calibration()
    return {"status": "calibration_reset"}


# ---------------------------------------------------------------------------
# Engine control endpoints
# ---------------------------------------------------------------------------
@app.post("/api/engine/start")
async def engine_start(admin=Depends(get_current_admin)):
    global engine_on, _no_face_frames
    engine_on = True
    _no_face_frames = 0
    did = active_driver_id
    # Reset this driver's session — score back to 100, clear incidents/speed
    drivers[did]["score"] = 100
    drivers[did]["incidents"] = 0
    drivers[did]["incident_history"].clear()
    drivers[did]["rating"] = compute_rating(100, 0)
    drivers[did]["feedback"] = [auto_feedback(100, 0)] + drivers[did]["feedback"][1:]
    speed_state[did] = {"current": 0.0, "max": 0.0, "avg_samples": []}
    drivers[did]["speed_history"].clear()
    stop_fatigue(did)
    yawn_state[did] = {"active": False, "warn_time": None, "last_drop_time": None, "horn_done": False}
    reset_calibration()
    reset_ai_state(did)
    await broadcast({"type": "engine_state", "engine_on": True, "safety_score": 100, "leaderboard": leaderboard_payload()})
    return {"engine_on": True}


@app.post("/api/engine/stop")
async def engine_stop(admin=Depends(get_current_admin)):
    global engine_on, _no_face_frames
    engine_on = False
    _no_face_frames = 0
    speed_reduction_state["active"] = False
    speed_reduction_state["triggered_at"] = None
    speed_reduction_state["reduced"] = False
    speed_reduction_state["reduction_pct"] = 0
    await broadcast({"type": "engine_state", "engine_on": False})
    return {"engine_on": False}


@app.get("/api/engine/status")
async def engine_status():
    return {
        "engine_on": engine_on,
        "speed_reduction": speed_reduction_state,
    }
