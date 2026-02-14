import os
import json
import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from passlib.context import CryptContext
import jwt

from backend.db import init_db, conn, DATA_DIR

APP_SECRET = "dev_secret_change_me"
JWT_ALG = "HS256"
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Gym Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # projeto pessoal local ok
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pastas
PHOTOS_DIR = os.path.join(DATA_DIR, "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

init_db()

# ---------------- Auth helpers ----------------
def make_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=30)
    }
    return jwt.encode(payload, APP_SECRET, algorithm=JWT_ALG)

def auth_user(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sem token (faça login).")
    raw = authorization[7:]
    try:
        data = jwt.decode(raw, APP_SECRET, algorithms=[JWT_ALG])
        return int(data["sub"])
    except Exception:
        raise HTTPException(401, "Token inválido/expirado.")

# ---------------- Auth endpoints ----------------
@app.post("/api/register")
def register(email: str = Form(...), password: str = Form(...)):
    email = email.lower().strip()
    if len(password) < 4:
        raise HTTPException(400, "Senha muito curta.")
    with conn() as db:
        try:
            db.execute(
                "INSERT INTO users(email, password_hash) VALUES (?,?)",
                (email, pwd.hash(password))
            )
            db.commit()
        except Exception:
            raise HTTPException(400, "Email já existe.")
        user_id = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
    return {"token": make_token(int(user_id))}

@app.post("/api/login")
def login(email: str = Form(...), password: str = Form(...)):
    email = email.lower().strip()
    with conn() as db:
        row = db.execute("SELECT id, password_hash FROM users WHERE email=?", (email,)).fetchone()
    if not row or not pwd.verify(password, row["password_hash"]):
        raise HTTPException(401, "Login inválido.")
    return {"token": make_token(int(row["id"]))}

@app.get("/api/me")
def me(user_id: int = Depends(auth_user)):
    return {"user_id": user_id}

# ---------------- Stats/Profile ----------------
def compute_reco(height_cm: float, weight_kg: float, biotype: str, goal: str):
    h_m = (height_cm or 0) / 100.0
    bmi = (weight_kg / (h_m*h_m)) if h_m > 0 else None

    goal_l = (goal or "").lower()
    bio_l = (biotype or "").lower()

    if "hiper" in goal_l or "massa" in goal_l:
        treino = "4–6x/semana (Upper/Lower ou Push/Pull/Legs) + progressão de carga"
        reps = "6–12 (principais) e 12–20 (acessórios)"
        cardio = "2x leve/semana (saúde), sem exagerar"
    elif "emag" in goal_l or "defin" in goal_l or "cut" in goal_l:
        treino = "3–5x/semana (Full body ou Upper/Lower) + consistência"
        reps = "8–15 com volume moderado"
        cardio = "2–4x/semana (20–35min) + passos/dia"
    else:
        treino = "3–4x/semana (Full body ou Upper/Lower), técnica perfeita"
        reps = "8–12 (padrão)"
        cardio = "2x leve/semana"

    if "ecto" in bio_l:
        tip = "Foco em comer suficiente + força/básicos. Cardio baixo."
    elif "endo" in bio_l:
        tip = "Foco em déficit leve/moderado, passos/dia e sono."
    elif "meso" in bio_l:
        tip = "Responde bem a volume + progressão. Recuperação manda."
    else:
        tip = "Biotipo é referência. O que manda é consistência + progressão + dieta."

    return {
        "bmi": bmi,
        "recommendation": {
            "treino": treino,
            "repeticoes": reps,
            "cardio": cardio,
            "nota_biotipo": tip,
        }
    }

@app.post("/api/profile")
def save_profile(
    height_cm: float = Form(...),
    weight_kg: float = Form(...),
    biotype: str = Form(""),
    goal: str = Form(""),
    user_id: int = Depends(auth_user)
):
    with conn() as db:
        db.execute("""
        INSERT INTO profile(user_id, height_cm, weight_kg, biotype, goal, updated_at)
        VALUES(?,?,?,?,?,datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          height_cm=excluded.height_cm,
          weight_kg=excluded.weight_kg,
          biotype=excluded.biotype,
          goal=excluded.goal,
          updated_at=datetime('now')
        """, (user_id, height_cm, weight_kg, biotype, goal))
        db.commit()
    return compute_reco(height_cm, weight_kg, biotype, goal)

@app.get("/api/profile")
def get_profile(user_id: int = Depends(auth_user)):
    with conn() as db:
        p = db.execute("SELECT * FROM profile WHERE user_id=?", (user_id,)).fetchone()
    return dict(p) if p else {}

# ---------------- Supplements ----------------
@app.post("/api/supplements/add")
def add_supp(name: str = Form(...), user_id: int = Depends(auth_user)):
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "Nome inválido.")
    with conn() as db:
        db.execute("INSERT OR IGNORE INTO supplements(user_id, name) VALUES (?,?)", (user_id, name))
        db.commit()
    return {"ok": True}

@app.get("/api/supplements")
def list_supp(user_id: int = Depends(auth_user)):
    with conn() as db:
        rows = db.execute("SELECT name FROM supplements WHERE user_id=? ORDER BY name", (user_id,)).fetchall()
    return {"items": [r["name"] for r in rows]}

# ---------------- Checkins ----------------
@app.post("/api/checkin")
def set_checkin(day: str = Form(...), trained: int = Form(0), user_id: int = Depends(auth_user)):
    with conn() as db:
        db.execute("""
        INSERT INTO checkins(user_id, day, trained)
        VALUES(?,?,?)
        ON CONFLICT(user_id, day) DO UPDATE SET trained=excluded.trained
        """, (user_id, day, 1 if trained else 0))
        db.commit()
    return {"ok": True}

@app.post("/api/supp_checkin")
def set_supp_checkin(
    day: str = Form(...),
    supplement_name: str = Form(...),
    took: int = Form(0),
    user_id: int = Depends(auth_user)
):
    with conn() as db:
        db.execute("""
        INSERT INTO supplement_checkins(user_id, day, supplement_name, took)
        VALUES(?,?,?,?)
        ON CONFLICT(user_id, day, supplement_name) DO UPDATE SET took=excluded.took
        """, (user_id, day, supplement_name, 1 if took else 0))
        db.commit()
    return {"ok": True}

@app.get("/api/checkins")
def get_month_checkins(month: str, user_id: int = Depends(auth_user)):
    with conn() as db:
        c = db.execute(
            "SELECT day, trained FROM checkins WHERE user_id=? AND day LIKE ?",
            (user_id, f"{month}-%")
        ).fetchall()
        s = db.execute(
            "SELECT day, supplement_name, took FROM supplement_checkins WHERE user_id=? AND day LIKE ?",
            (user_id, f"{month}-%")
        ).fetchall()

    return {
        "trained": {r["day"]: r["trained"] for r in c},
        "supp": [{"day": r["day"], "name": r["supplement_name"], "took": r["took"]} for r in s]
    }

# ---------------- Workouts ----------------
@app.post("/api/workouts/save")
def save_workout(
    title: str = Form(...),
    split: str = Form(...),
    data_json: str = Form(...),
    user_id: int = Depends(auth_user)
):
    try:
        json.loads(data_json)
    except Exception:
        raise HTTPException(400, "data_json inválido.")
    with conn() as db:
        db.execute(
            "INSERT INTO workouts(user_id, title, split, data_json) VALUES (?,?,?,?)",
            (user_id, title, split, data_json)
        )
        db.commit()
    return {"ok": True}

@app.get("/api/workouts")
def list_workouts(user_id: int = Depends(auth_user)):
    with conn() as db:
        rows = db.execute(
            "SELECT id, title, split, created_at FROM workouts WHERE user_id=? ORDER BY id DESC",
            (user_id,)
        ).fetchall()
    return {"items": [dict(r) for r in rows]}

@app.get("/api/workouts/{workout_id}")
def get_workout(workout_id: int, user_id: int = Depends(auth_user)):
    with conn() as db:
        r = db.execute(
            "SELECT * FROM workouts WHERE id=? AND user_id=?",
            (workout_id, user_id)
        ).fetchone()
    if not r:
        raise HTTPException(404, "Treino não encontrado.")
    return dict(r)

# ---------------- Photos (SALVAS + PROTEGIDAS) ----------------
@app.post("/api/photos/upload")
def upload_photo(
    taken_day: str = Form(...),
    note: str = Form(""),
    file: UploadFile = File(...),
    user_id: int = Depends(auth_user)
):
    user_dir = os.path.join(PHOTOS_DIR, str(user_id))
    os.makedirs(user_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(400, "Envie jpg/png/webp.")

    # Limite simples (10MB)
    content = file.file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máx 10MB).")

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{taken_day}_{ts}{ext}"
    path = os.path.join(user_dir, safe_name)

    with open(path, "wb") as f:
        f.write(content)

    with conn() as db:
        db.execute(
            "INSERT INTO photos(user_id, filename, taken_day, note) VALUES (?,?,?,?)",
            (user_id, safe_name, taken_day, note)
        )
        db.commit()

    return {"ok": True}

@app.get("/api/photos")
def list_photos(user_id: int = Depends(auth_user)):
    with conn() as db:
        rows = db.execute("""
          SELECT id, filename, taken_day, note, created_at
          FROM photos WHERE user_id=?
          ORDER BY taken_day ASC, id ASC
        """, (user_id,)).fetchall()
    return {"items": [dict(r) for r in rows]}

@app.get("/api/photos/file/{filename}")
def get_photo_file(filename: str, user_id: int = Depends(auth_user)):
    user_dir = os.path.join(PHOTOS_DIR, str(user_id))
    path = os.path.join(user_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(404, "Foto não encontrada.")
    return FileResponse(path)
