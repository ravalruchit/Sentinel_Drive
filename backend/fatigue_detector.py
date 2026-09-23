import cv2
import numpy as np
import base64
import os
import urllib.request
import collections

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python.vision import (
    FaceLandmarker, FaceLandmarkerOptions, RunningMode,
)

# ---------------------------------------------------------------------------
# Model download
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)
if not os.path.exists(MODEL_PATH):
    print("Downloading face_landmarker.task model...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model ready.")

_options = FaceLandmarkerOptions(
    base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=RunningMode.IMAGE,
    num_faces=1,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)
_detector = FaceLandmarker.create_from_options(_options)

# ---------------------------------------------------------------------------
# Landmark indices
# ---------------------------------------------------------------------------
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]
MOUTH     = [61,  291, 39,  181, 0,   17,  269, 405]
NOSE_TIP    = 4
CHIN        = 152
LEFT_EYE_L  = 33
RIGHT_EYE_R = 263

FACE_OVAL         = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10]
LEFT_EYE_CONTOUR  = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362]
RIGHT_EYE_CONTOUR = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33]
LIPS_CONTOUR      = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]

# ---------------------------------------------------------------------------
# Thresholds — fixed fallback values (before calibration)
# ---------------------------------------------------------------------------
EAR_OPEN_DEFAULT    = 0.28   # slightly conservative open-eye baseline
EAR_CLOSED_RATIO    = 0.72   # closed = 72% of open → threshold ~0.20
MAR_NEUTRAL_DEFAULT = 0.30   # closed-mouth baseline
MAR_YAWN_RATIO      = 1.7    # yawn = 170% of neutral → threshold ~0.51
MAR_YAWN_FRAMES     = 60     # 2s at 30fps
CONSEC_FRAMES       = 15     # 0.5s of closed eyes = drowsy

# Head pose
HEAD_TILT_LIMIT  = 28.0
HEAD_NOD_LIMIT   = 22.0
HEAD_NOD_FRAMES  = 25

# Distraction
HEAD_UP_LIMIT       = -18.0
HEAD_AWAY_LIMIT     = 35.0
DISTRACTION_FRAMES  = 20

# ---------------------------------------------------------------------------
# Adaptive calibration
# ---------------------------------------------------------------------------
CALIB_FRAMES = 60

_calib_ear_samples   = []
_calib_mar_samples   = []
_calib_pitch_samples = []
_calib_roll_samples  = []
_calibrated          = False

_ear_threshold   = EAR_OPEN_DEFAULT * EAR_CLOSED_RATIO
_mar_threshold   = MAR_NEUTRAL_DEFAULT * MAR_YAWN_RATIO
_head_nod_limit  = HEAD_NOD_LIMIT
_head_tilt_limit = HEAD_TILT_LIMIT
_head_up_limit   = HEAD_UP_LIMIT


def reset_calibration():
    global _calib_ear_samples, _calib_mar_samples, _calib_pitch_samples
    global _calib_roll_samples, _calibrated
    global _ear_threshold, _mar_threshold, _head_nod_limit, _head_tilt_limit, _head_up_limit
    global _ear_history, _eyewear_warned
    _calib_ear_samples   = []
    _calib_mar_samples   = []
    _calib_pitch_samples = []
    _calib_roll_samples  = []
    _calibrated          = False
    _ear_history.clear()
    _eyewear_warned      = False
    _ear_threshold   = EAR_OPEN_DEFAULT * EAR_CLOSED_RATIO
    _mar_threshold   = MAR_NEUTRAL_DEFAULT * MAR_YAWN_RATIO
    _head_nod_limit  = HEAD_NOD_LIMIT
    _head_tilt_limit = HEAD_TILT_LIMIT
    _head_up_limit   = HEAD_UP_LIMIT


def _do_calibration():
    global _calibrated, _ear_threshold, _mar_threshold
    global _head_nod_limit, _head_tilt_limit, _head_up_limit

    if len(_calib_ear_samples) < 20:
        return

    ear_baseline   = float(np.median(_calib_ear_samples))
    mar_baseline   = float(np.median(_calib_mar_samples))
    pitch_baseline = float(np.median(_calib_pitch_samples))
    roll_baseline  = float(np.median(_calib_roll_samples))

    _ear_threshold = float(np.clip(ear_baseline * EAR_CLOSED_RATIO, 0.17, 0.25))
    # MAR: yawn threshold = 170% of neutral closed-mouth baseline
    # Clamp 0.42–0.62 so it's always reachable with a real yawn
    _mar_threshold = float(np.clip(mar_baseline * MAR_YAWN_RATIO, 0.42, 0.62))

    _head_nod_limit  = abs(pitch_baseline) + 18.0
    _head_tilt_limit = abs(roll_baseline)  + 22.0
    _head_up_limit   = pitch_baseline - 15.0

    _calibrated = True
    print(f"[Calibration] EAR={_ear_threshold:.3f} MAR={_mar_threshold:.3f}")


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
# EAR variance history — detects suspiciously stable EAR (sunglasses/goggles)
_ear_history = collections.deque(maxlen=300)  # last 10s at 30fps
_eyewear_warned = False

ear_counter = 0
mar_counter = 0
fatigue_active = False
fatigue_frame_count = 0

yawn_active = False
yawn_frame_count = 0
yawn_warned = False

head_pitch_history = collections.deque(maxlen=30)
head_roll_history  = collections.deque(maxlen=30)
head_nod_counter   = 0
head_nod_active    = False

distraction_counter = 0
distraction_active  = False


def _dist(p1, p2):
    return np.linalg.norm(np.array(p1) - np.array(p2))

def _ear(lm, idx, w, h):
    pts = [(lm[i].x * w, lm[i].y * h) for i in idx]
    A = _dist(pts[1], pts[5]); B = _dist(pts[2], pts[4]); C = _dist(pts[0], pts[3])
    return (A + B) / (2.0 * C)

def _mar(lm, idx, w, h):
    # Normalized coords so MAR is scale-independent (0.0–~1.0)
    pts = [(lm[i].x, lm[i].y) for i in idx]
    A = _dist(pts[2], pts[6]); B = _dist(pts[3], pts[7]); C = _dist(pts[0], pts[1])
    if C < 1e-6:
        return 0.0
    return (A + B) / (2.0 * C)

def _head_pose(lm, w, h):
    nose  = np.array([lm[NOSE_TIP].x * w,   lm[NOSE_TIP].y * h])
    chin  = np.array([lm[CHIN].x * w,        lm[CHIN].y * h])
    leye  = np.array([lm[LEFT_EYE_L].x * w,  lm[LEFT_EYE_L].y * h])
    reye  = np.array([lm[RIGHT_EYE_R].x * w, lm[RIGHT_EYE_R].y * h])
    eye_vec  = reye - leye
    face_vec = chin - nose
    roll  = float(np.degrees(np.arctan2(eye_vec[1], eye_vec[0])))
    pitch = float(np.degrees(np.arctan2(face_vec[0], face_vec[1])))
    return roll, pitch

def _draw_contour(frame, lm, indices, color, w, h, thickness=1):
    pts = [(int(lm[i].x * w), int(lm[i].y * h)) for i in indices]
    for j in range(len(pts) - 1):
        cv2.line(frame, pts[j], pts[j+1], color, thickness, cv2.LINE_AA)

def _draw_mesh(frame, lm, w, h):
    for landmark in lm:
        cv2.circle(frame, (int(landmark.x*w), int(landmark.y*h)), 1, (0,200,180), -1)
    _draw_contour(frame, lm, FACE_OVAL,         (0,212,255), w, h, 1)
    _draw_contour(frame, lm, LEFT_EYE_CONTOUR,  (0,255,150), w, h, 1)
    _draw_contour(frame, lm, RIGHT_EYE_CONTOUR, (0,255,150), w, h, 1)
    _draw_contour(frame, lm, LIPS_CONTOUR,      (255,100,100), w, h, 1)


def process_frame(frame):
    global ear_counter, mar_counter, fatigue_active, fatigue_frame_count
    global yawn_active, yawn_frame_count, yawn_warned
    global head_nod_counter, head_nod_active
    global distraction_counter, distraction_active
    global _calib_ear_samples, _calib_mar_samples, _calib_pitch_samples, _calib_roll_samples
    global _ear_history, _eyewear_warned

    h, w = frame.shape[:2]

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = _detector.detect(mp_image)

    alerts = []
    ear_val = 0.0
    mar_val = 0.0
    roll_deg = 0.0
    pitch_deg = 0.0
    head_nod = False
    face_detected = bool(result.face_landmarks)

    if face_detected:
        lm = result.face_landmarks[0]
        _draw_mesh(frame, lm, w, h)

        ear_val   = round((_ear(lm, LEFT_EYE, w, h) + _ear(lm, RIGHT_EYE, w, h)) / 2.0, 3)
        mar_val   = round(_mar(lm, MOUTH, w, h), 3)
        roll_deg, pitch_deg = _head_pose(lm, w, h)
        roll_deg  = round(roll_deg, 1)
        pitch_deg = round(pitch_deg, 1)

        head_pitch_history.append(pitch_deg)
        head_roll_history.append(roll_deg)

        # ── Calibration ───────────────────────────────────────────────────
        if not _calibrated:
            if abs(roll_deg) < 15 and abs(pitch_deg) < 15 and ear_val > 0.2:
                _calib_ear_samples.append(ear_val)
                _calib_mar_samples.append(mar_val)
                _calib_pitch_samples.append(pitch_deg)
                _calib_roll_samples.append(roll_deg)

            if len(_calib_ear_samples) >= CALIB_FRAMES:
                _do_calibration()

            pct = min(100, int(len(_calib_ear_samples) / CALIB_FRAMES * 100))
            bar_w = int((w - 20) * pct / 100)
            cv2.rectangle(frame, (10, h-30), (w-10, h-15), (30,30,30), -1)
            cv2.rectangle(frame, (10, h-30), (10+bar_w, h-15), (0,212,255), -1)
            cv2.putText(frame, f"Calibrating... {pct}%", (10, h-35),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,212,255), 1)

            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            return {
                "frame": base64.b64encode(buffer).decode('utf-8'),
                "ear": ear_val, "mar": mar_val,
                "roll": roll_deg, "pitch": pitch_deg,
                "face_detected": True,
                "alerts": [],
                "fatigue_active": False, "fatigue_frames": 0,
                "yawn_active": False, "yawn_phase": "none",
                "head_nod": False, "distraction_active": False,
                "calibrating": True, "calib_pct": pct,
            }

        # ── EAR / Drowsiness ──────────────────────────────────────────────
        # Eyewear detection — if EAR variance is suspiciously low for 10s,
        # driver may be wearing sunglasses/goggles blocking eye detection
        _ear_history.append(ear_val)
        eyewear_suspected = False
        if len(_ear_history) >= 150 and _calibrated:  # 5s of data
            ear_std = float(np.std(list(_ear_history)))
            # Normal blinking causes EAR std > 0.015; sunglasses = near 0
            if ear_std < 0.008 and ear_val > _ear_threshold:
                eyewear_suspected = True
                if not _eyewear_warned:
                    _eyewear_warned = True
                    alerts.append({
                        "type": "EYEWEAR_DETECTED",
                        "message": "⚠ Eye tracking unreliable — driver may be wearing sunglasses or goggles. Monitoring via head pose & yawning.",
                        "severity": "warning",
                        "fatigue_frames": 0,
                    })
            else:
                _eyewear_warned = False

        if ear_val < _ear_threshold:
            ear_counter += 1
            fatigue_frame_count += 1
            if ear_counter >= CONSEC_FRAMES:
                fatigue_active = True
                alerts.append({
                    "type": "DROWSINESS",
                    "message": "Eye closure detected — Driver may be drowsy!",
                    "severity": "critical",
                    "fatigue_frames": fatigue_frame_count,
                })
        else:
            ear_counter = 0
            fatigue_active = False
            fatigue_frame_count = 0

        # ── MAR / Yawn ────────────────────────────────────────────────────
        if mar_val > _mar_threshold:
            mar_counter += 1
            yawn_frame_count += 1

            if mar_counter >= MAR_YAWN_FRAMES and not yawn_active:
                yawn_active = True
                yawn_warned = False

            if yawn_active and not yawn_warned:
                alerts.append({
                    "type": "YAWN_WARN",
                    "message": "Yawning detected — Are you tired? Please stay alert.",
                    "severity": "warning",
                    "yawn_phase": "warn",
                    "yawn_frames": yawn_frame_count,
                })
                yawn_warned = True
            elif yawn_active and yawn_warned:
                alerts.append({
                    "type": "YAWNING",
                    "message": "Prolonged yawning — Fatigue confirmed. Score dropping.",
                    "severity": "warning",
                    "yawn_phase": "drop",
                    "yawn_frames": yawn_frame_count,
                })
        else:
            # Mouth closed — immediately reset everything
            mar_counter = 0
            yawn_frame_count = 0
            yawn_active = False
            yawn_warned = False

        # ── Head Nod / Tilt ───────────────────────────────────────────────
        severe_tilt = abs(pitch_deg) > _head_nod_limit or abs(roll_deg) > _head_tilt_limit
        if severe_tilt:
            head_nod_counter += 1
            if head_nod_counter >= HEAD_NOD_FRAMES:
                head_nod_active = True
                head_nod = True
                alerts.append({
                    "type": "HEAD_NOD",
                    "message": f"Head tilt detected (roll:{roll_deg}° pitch:{pitch_deg}°) — Posture alert!",
                    "severity": "warning",
                    "fatigue_frames": 0,
                })
        else:
            head_nod_counter = max(0, head_nod_counter - 3)
            if head_nod_counter == 0:
                head_nod_active = False

        # ── Distraction ───────────────────────────────────────────────────
        is_distracted = (pitch_deg < _head_up_limit) or (abs(roll_deg) > HEAD_AWAY_LIMIT)
        if is_distracted:
            distraction_counter += 1
            if distraction_counter >= DISTRACTION_FRAMES:
                distraction_active = True
                reason = "looking up (phone/mirror)" if pitch_deg < _head_up_limit else "looking away from road"
                alerts.append({
                    "type": "DISTRACTION",
                    "message": f"Driver distracted — {reason}! Eyes on road!",
                    "severity": "warning",
                    "fatigue_frames": 0,
                })
        else:
            distraction_counter = max(0, distraction_counter - 2)
            if distraction_counter == 0:
                distraction_active = False

        # ── Overlay ───────────────────────────────────────────────────────
        cv2.putText(frame, f"EAR:{ear_val:.3f}(t:{_ear_threshold:.3f})", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,255,200), 1)
        cv2.putText(frame, f"MAR:{mar_val:.3f}(t:{_mar_threshold:.3f}) C:{mar_counter}", (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,255,200), 1)
        cv2.putText(frame, f"R:{roll_deg} P:{pitch_deg}", (10, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,200,255), 1)

        if fatigue_active:
            cv2.putText(frame, "FATIGUE ALERT!", (w//2-90, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,0,255), 3)
            _draw_contour(frame, lm, LEFT_EYE_CONTOUR,  (0,0,255), w, h, 2)
            _draw_contour(frame, lm, RIGHT_EYE_CONTOUR, (0,0,255), w, h, 2)
        if yawn_active:
            col = (0,165,255) if not yawn_warned else (0,100,255)
            cv2.putText(frame, "YAWNING!", (w//2-60, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.9, col, 2)
            _draw_contour(frame, lm, LIPS_CONTOUR, col, w, h, 2)
        if head_nod_active:
            cv2.putText(frame, "HEAD NOD!", (w//2-60, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,165,255), 2)
        if distraction_active:
            cv2.putText(frame, "DISTRACTED!", (w//2-75, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,200,255), 2)
    else:
        fatigue_active = False; fatigue_frame_count = 0; ear_counter = 0
        yawn_active = False; yawn_warned = False; yawn_frame_count = 0; mar_counter = 0
        head_nod_counter = 0; head_nod_active = False
        distraction_counter = 0; distraction_active = False

    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    frame_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "frame": frame_b64,
        "ear": ear_val, "mar": mar_val,
        "roll": roll_deg, "pitch": pitch_deg,
        "face_detected": face_detected,
        "alerts": alerts,
        "fatigue_active": fatigue_active,
        "fatigue_frames": fatigue_frame_count,
        "yawn_active": yawn_active,
        "yawn_phase": "drop" if (yawn_active and yawn_warned) else ("warn" if yawn_active else "none"),
        "head_nod": head_nod,
        "distraction_active": distraction_active,
    }
