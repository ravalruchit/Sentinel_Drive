"""
AI Fatigue Prediction + Multi-Sensor Fusion Engine
Combines: EAR, MAR, head pose, speed inconsistency, steering zigzag,
          drive duration, time of day → single AI Fatigue Score + prediction
"""
import math
import collections
from datetime import datetime


# ---------------------------------------------------------------------------
# Per-driver AI state
# ---------------------------------------------------------------------------
class DriverAIState:
    def __init__(self, driver_id: str):
        self.driver_id = driver_id
        self.session_start = datetime.now().timestamp()

        # Rolling windows
        self.ear_history    = collections.deque(maxlen=90)   # 3s at 30fps
        self.mar_history    = collections.deque(maxlen=90)
        self.speed_history  = collections.deque(maxlen=20)   # last 20 speed readings
        self.lateral_history= collections.deque(maxlen=20)
        self.incident_times = collections.deque(maxlen=50)   # timestamps of incidents

        # Fatigue score components (0–100, higher = more fatigued)
        self.eye_score      = 0.0
        self.yawn_score     = 0.0
        self.head_score     = 0.0
        self.driving_score  = 0.0   # from sensor data
        self.time_score     = 0.0   # time-of-day + duration risk

        # Composite
        self.fatigue_score  = 0.0   # 0–100
        self.alert_level    = "normal"  # normal / mild / medium / critical
        self.prediction_minutes = None  # estimated minutes until fatigue

        # Steering zigzag detection
        self.lateral_sign_changes = 0
        self.last_lateral_sign    = 0

        # Speed inconsistency
        self.speed_variance = 0.0

    def drive_duration_minutes(self) -> float:
        return (datetime.now().timestamp() - self.session_start) / 60.0


# Global state per driver
_ai_states: dict[str, DriverAIState] = {}


def get_state(driver_id: str) -> DriverAIState:
    if driver_id not in _ai_states:
        _ai_states[driver_id] = DriverAIState(driver_id)
    return _ai_states[driver_id]


def reset_state(driver_id: str):
    _ai_states[driver_id] = DriverAIState(driver_id)


# ---------------------------------------------------------------------------
# Core fusion function — call every frame
# ---------------------------------------------------------------------------
def update_fatigue_score(
    driver_id: str,
    ear: float,
    mar: float,
    roll: float,
    pitch: float,
    head_nod: bool,
    speed: float,
    lateral_g: float,
    acceleration: float,
    braking: float,
    incident_count: int,
) -> dict:
    s = get_state(driver_id)

    # ── 1. Eye score (EAR-based) ──────────────────────────────────────────
    s.ear_history.append(ear)
    if len(s.ear_history) > 10:
        avg_ear = sum(s.ear_history) / len(s.ear_history)
        # EAR 0.35 = fully open, 0.20 = nearly closed
        eye_fatigue = max(0, (0.35 - avg_ear) / 0.15) * 100
        s.eye_score = min(100, eye_fatigue)

    # ── 2. Yawn score (MAR-based) ─────────────────────────────────────────
    s.mar_history.append(mar)
    if len(s.mar_history) > 10:
        # Use a conservative threshold — only count clearly open mouth frames
        # normalized MAR: closed ~0.25-0.35, talking ~0.35-0.45, yawning ~0.50+
        yawn_threshold = 0.50
        yawn_frames = sum(1 for m in s.mar_history if m > yawn_threshold)
        s.yawn_score = min(100, (yawn_frames / len(s.mar_history)) * 200)

    # ── 3. Head pose score ────────────────────────────────────────────────
    head_fatigue = 0.0
    if abs(roll) > 10:
        head_fatigue += min(50, (abs(roll) - 10) * 3)
    if abs(pitch) > 10:
        head_fatigue += min(50, (abs(pitch) - 10) * 3)
    if head_nod:
        head_fatigue += 30
    s.head_score = min(100, head_fatigue)

    # ── 4. Driving behaviour score ────────────────────────────────────────
    s.speed_history.append(speed)
    s.lateral_history.append(lateral_g)

    driving_fatigue = 0.0

    # Speed inconsistency — fatigued drivers have erratic speed
    if len(s.speed_history) >= 5:
        speeds = list(s.speed_history)
        mean_s = sum(speeds) / len(speeds)
        variance = sum((x - mean_s) ** 2 for x in speeds) / len(speeds)
        s.speed_variance = round(math.sqrt(variance), 1)
        if s.speed_variance > 8:
            driving_fatigue += min(40, s.speed_variance * 2)

    # Steering zigzag — lateral sign changes
    if lateral_g != 0:
        sign = 1 if lateral_g > 0 else -1
        if s.last_lateral_sign != 0 and sign != s.last_lateral_sign:
            s.lateral_sign_changes += 1
        s.last_lateral_sign = sign

    if s.lateral_sign_changes > 5:
        driving_fatigue += min(40, s.lateral_sign_changes * 3)

    # Harsh events add to driving fatigue
    if braking < -8:
        driving_fatigue += 15
    if abs(lateral_g) > 7:
        driving_fatigue += 10

    s.driving_score = min(100, driving_fatigue)

    # ── 5. Time-of-day + duration risk ───────────────────────────────────
    hour = datetime.now().hour
    duration = s.drive_duration_minutes()

    # Night driving (22:00–06:00) is highest risk
    if 22 <= hour or hour < 6:
        time_risk = 20
    elif 13 <= hour <= 15:   # post-lunch dip
        time_risk = 10
    else:
        time_risk = 0   # daytime = no baseline risk

    # Duration risk — only increases after 2 hours of driving
    duration_risk = min(30, max(0, (duration - 120) * 0.3))

    # Incident rate risk
    incident_risk = min(15, incident_count * 2)

    s.time_score = min(100, time_risk + duration_risk + incident_risk)

    # ── 6. Weighted composite fatigue score ───────────────────────────────
    # Eye closure is the strongest signal
    s.fatigue_score = round(
        s.eye_score    * 0.35 +
        s.yawn_score   * 0.20 +
        s.head_score   * 0.15 +
        s.driving_score* 0.15 +
        s.time_score   * 0.15,
        1
    )

    # ── 7. Alert level ────────────────────────────────────────────────────
    if s.fatigue_score >= 70:
        s.alert_level = "critical"
    elif s.fatigue_score >= 45:
        s.alert_level = "medium"
    elif s.fatigue_score >= 20:
        s.alert_level = "mild"
    else:
        s.alert_level = "normal"

    # ── 8. Prediction — minutes until likely fatigue ──────────────────────
    # Simple linear extrapolation: if score is rising, estimate time to 70
    s.prediction_minutes = _predict_fatigue_minutes(s)

    return {
        "fatigue_score": s.fatigue_score,
        "alert_level": s.alert_level,
        "prediction_minutes": s.prediction_minutes,
        "components": {
            "eye": round(s.eye_score, 1),
            "yawn": round(s.yawn_score, 1),
            "head": round(s.head_score, 1),
            "driving": round(s.driving_score, 1),
            "time_risk": round(s.time_score, 1),
        },
        "drive_duration_min": round(duration, 1),
        "speed_variance": s.speed_variance,
        "zigzag_count": s.lateral_sign_changes,
    }


def _predict_fatigue_minutes(s: DriverAIState) -> int | None:
    """
    Estimate minutes until fatigue score hits 70 (critical).
    Uses current score + time-based risk growth rate.
    """
    if s.fatigue_score >= 70:
        return 0

    # Base growth rate: time_score grows ~0.3pts/min after 2h drive
    # Eye/yawn scores grow faster if already elevated
    growth_rate = 0.3  # pts per minute baseline

    if s.eye_score > 30:
        growth_rate += 0.5
    if s.yawn_score > 20:
        growth_rate += 0.3
    if s.head_score > 20:
        growth_rate += 0.2

    hour = datetime.now().hour
    if 22 <= hour or hour < 6:
        growth_rate *= 1.8   # night driving accelerates fatigue
    elif 13 <= hour <= 15:
        growth_rate *= 1.3

    if growth_rate <= 0:
        return None

    minutes_to_critical = (70 - s.fatigue_score) / growth_rate
    return max(1, round(minutes_to_critical))
