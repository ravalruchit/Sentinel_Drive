"""
Circular frame buffer — keeps last N seconds of frames.
Saves incident clips with descriptive names per event type.
"""
import collections
import cv2
import os
import threading
from datetime import datetime

BUFFER_SECONDS = 20
FPS = 10
CLIPS_DIR = os.path.join(os.path.dirname(__file__), "incident_clips")
os.makedirs(CLIPS_DIR, exist_ok=True)

_buffer: collections.deque = collections.deque(maxlen=BUFFER_SECONDS * FPS)
_lock = threading.Lock()
_frame_counter = 0

# Human-readable labels for each event type
EVENT_LABELS = {
    "DROWSINESS":         "Eye-Closure-Fatigue",
    "YAWNING":            "Prolonged-Yawn",
    "YAWN_WARN":          "Yawn-Warning",
    "HEAD_NOD":           "Head-Nod-Tilt",
    "HARSH_BRAKING":      "Harsh-Braking",
    "HARSH_ACCELERATION": "Harsh-Acceleration",
    "SHARP_TURN":         "Sharp-Turn",
    "OVERSPEED":          "Overspeed",
}

# Cooldown per driver+event — avoid saving duplicate clips within 30s
_last_saved: dict[str, float] = {}
COOLDOWN_SECONDS = 30


def push_frame(frame):
    """Call every frame from the camera loop. Stores at ~10fps."""
    global _frame_counter
    _frame_counter += 1
    if _frame_counter % 3 == 0:
        with _lock:
            _buffer.append(frame.copy())


def save_clip(driver_id: str, event_type: str, driver_name: str = "") -> str | None:
    """
    Save buffered frames as an MP4.
    Filename format: DriverName_EventLabel_YYYYMMDD_HHMMSS.mp4
    Returns filename or None if skipped/failed.
    """
    import time
    cooldown_key = f"{driver_id}_{event_type}"
    now = time.time()

    # Skip if saved same event for same driver within cooldown window
    if cooldown_key in _last_saved and (now - _last_saved[cooldown_key]) < COOLDOWN_SECONDS:
        return None

    with _lock:
        frames = list(_buffer)

    if len(frames) < 5:
        return None

    label = EVENT_LABELS.get(event_type, event_type.replace("_", "-"))
    name_part = driver_name.replace(" ", "-") if driver_name else driver_id
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{name_part}_{label}_{ts}.mp4"
    filepath = os.path.join(CLIPS_DIR, filename)

    h, w = frames[0].shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(filepath, fourcc, FPS, (w, h))
    for f in frames:
        writer.write(f)
    writer.release()

    _last_saved[cooldown_key] = now
    print(f"[VideoBuffer] Saved: {filename}")
    return filename


def list_clips() -> list[dict]:
    """Return metadata for all saved clips, newest first."""
    clips = []
    try:
        files = sorted(os.listdir(CLIPS_DIR), reverse=True)
    except Exception:
        return []

    for f in files:
        if not f.endswith('.mp4'):
            continue
        path = os.path.join(CLIPS_DIR, f)
        try:
            size_kb = round(os.path.getsize(path) / 1024)
        except Exception:
            size_kb = 0

        # Parse: DriverName_EventLabel_YYYYMMDD_HHMMSS.mp4
        # Split from right to safely handle names with underscores
        base = f.replace('.mp4', '')
        parts = base.rsplit('_', 2)   # split last 2 underscores → [name_event, date, time]

        if len(parts) == 3:
            name_event, date_part, time_part = parts
            # Further split name_event: last hyphenated segment is the event label
            ne_parts = name_event.rsplit('_', 1)
            driver_part = ne_parts[0] if len(ne_parts) == 2 else name_event
            event_part  = ne_parts[1] if len(ne_parts) == 2 else "Unknown"
            # Format timestamp nicely
            try:
                dt = datetime.strptime(f"{date_part}{time_part}", "%Y%m%d%H%M%S")
                ts_display = dt.strftime("%d %b %Y, %H:%M:%S")
            except Exception:
                ts_display = f"{date_part} {time_part}"
        else:
            driver_part = base
            event_part  = "Incident"
            ts_display  = "—"

        # Determine event icon
        event_clean = event_part.replace('-', ' ')
        icon = "😴" if "Eye" in event_part or "Fatigue" in event_part else \
               "🥱" if "Yawn" in event_part else \
               "🤕" if "Head" in event_part else \
               "🛑" if "Brake" in event_part else \
               "🚀" if "Accel" in event_part else \
               "↩️" if "Turn" in event_part else \
               "⚡" if "Speed" in event_part else "⚠️"

        clips.append({
            "filename": f,
            "driver": driver_part.replace('-', ' '),
            "event": event_clean,
            "event_raw": event_part,
            "icon": icon,
            "timestamp": ts_display,
            "size_kb": size_kb,
        })

    return clips[:30]
