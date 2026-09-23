from datetime import datetime

# Thresholds (m/s² equivalent units)
HARSH_BRAKE_THRESHOLD = -8.0
HARSH_ACCEL_THRESHOLD = 8.0
SHARP_TURN_THRESHOLD = 7.0
OVERSPEED_THRESHOLD = 80.0  # km/h


def analyze_sensor_data(data: dict) -> list:
    """
    Expects data keys: acceleration, braking, lateral_g, speed
    Returns list of alert dicts
    """
    alerts = []
    ts = datetime.now().strftime("%H:%M:%S")

    accel = data.get("acceleration", 0)
    braking = data.get("braking", 0)
    lateral = data.get("lateral_g", 0)
    speed = data.get("speed", 0)

    if accel > HARSH_ACCEL_THRESHOLD:
        alerts.append({
            "type": "HARSH_ACCELERATION",
            "message": f"Harsh acceleration detected: {accel} m/s²",
            "severity": "warning",
            "timestamp": ts
        })

    if braking < HARSH_BRAKE_THRESHOLD:
        alerts.append({
            "type": "HARSH_BRAKING",
            "message": f"Harsh braking detected: {braking} m/s²",
            "severity": "critical",
            "timestamp": ts
        })

    if abs(lateral) > SHARP_TURN_THRESHOLD:
        alerts.append({
            "type": "SHARP_TURN",
            "message": f"Sharp turn detected: {lateral} m/s²",
            "severity": "warning",
            "timestamp": ts
        })

    if speed > OVERSPEED_THRESHOLD:
        alerts.append({
            "type": "OVERSPEED",
            "message": f"Overspeeding: {speed} km/h",
            "severity": "critical",
            "timestamp": ts
        })

    return alerts
