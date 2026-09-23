from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = "sentineldrive-secret-key-2024-admin"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Pre-hash at module load (avoids passlib wrap-bug detection on Python 3.14)
_PLAIN_PASSWORD = "sentinel@2024"
try:
    _HASHED = pwd_context.hash(_PLAIN_PASSWORD[:72])
except Exception:
    import hashlib
    _HASHED = None  # fallback handled in verify_password

# Single admin account
ADMIN_USER = {
    "username": "admin",
    "hashed_password": _HASHED,
    "plain_password": _PLAIN_PASSWORD,  # fallback only
    "role": "admin",
    "name": "Fleet Administrator",
}


def verify_password(plain: str, hashed: str) -> bool:
    # Fallback: plain comparison if bcrypt hashing failed at startup
    if hashed is None:
        return plain == ADMIN_USER.get("plain_password", "")
    try:
        return pwd_context.verify(plain[:72], hashed)
    except Exception:
        return plain == ADMIN_USER.get("plain_password", "")


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def get_current_admin(token: str = Depends(oauth2_scheme)) -> dict:
    payload = decode_token(token)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload
