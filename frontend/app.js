/* ============================================================
   Gym Tracker - frontend/app.js (FULL)
   - Auth via x-www-form-urlencoded (FastAPI Form)
   - Token persistence (localStorage)
   - Calendar: workout + supplements per day
   - Profile + recommendations
   - Workouts CRUD-lite
   - Photos (optional endpoints)
============================================================ */

"use strict";

/* -----------------------------
   Config
----------------------------- */

// Se quiser trocar API sem alterar código:
// localStorage.setItem("API_BASE", "https://seu-backend.com/api")
const DEFAULT_API_BASE = "https://zeraty-gym.onrender.com/api"; // Render (backend)
const API = (localStorage.getItem("API_BASE") || DEFAULT_API_BASE).replace(/\/$/, "");

/* -----------------------------
   DOM helpers
----------------------------- */

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setText(el, txt) {
  if (!el) return;
  el.textContent = String(txt ?? "");
}

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html ?? "";
}

function show(el) {
  if (!el) return;
  el.classList.remove("hidden");
}

function hide(el) {
  if (!el) return;
  el.classList.add("hidden");
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmtMonthLabel(y, m) {
  const d = new Date(y, m, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m, d) {
  // m: 0-based
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function todayYMD() {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth(), t.getDate());
}

/* -----------------------------
   Token storage
----------------------------- */

const TOKEN_KEY = "GYM_TOKEN";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
function setToken(tok) {
  localStorage.setItem(TOKEN_KEY, tok);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/* -----------------------------
   Messaging
----------------------------- */

let authBusy = false;

function safeDetail(data) {
  // Tenta extrair erro do FastAPI
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.detail) {
    if (typeof data.detail === "string") return data.detail;
    // detail pode ser lista de erros
    if (Array.isArray(data.detail)) {
      // Formato Pydantic: [{loc:[...], msg:"...", type:"..."}]
      const msgs = data.detail.map((e) => e?.msg).filter(Boolean);
      if (msgs.length) return msgs.join(" | ");
      return JSON.stringify(data.detail);
    }
    return JSON.stringify(data.detail);
  }
  // qualquer outro objeto
  try { return JSON.stringify(data); } catch { return String(data); }
}

function setAuthMsg(msg, ok = false) {
  const el = $("authMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("err", !ok && !!msg);
}

function setAuthBusy(isBusy) {
  const b1 = $("btnLogin");
  const b2 = $("btnRegister");
  if (b1) b1.disabled = isBusy;
  if (b2) b2.disabled = isBusy;
}

/* -----------------------------
   HTTP helpers
----------------------------- */

async function apiFetch(path, opts = {}) {
  const { method = "GET", token = "", json = null, headers = {}, body = null } = opts;
  const h = { ...headers };
  if (token) h["Authorization"] = `Bearer ${token}`;

  let finalBody = body;
  if (json !== null) {
    h["Content-Type"] = "application/json";
    finalBody = JSON.stringify(json);
  }

  const res = await fetch(`${API}${path}`, { method, headers: h, body: finalBody });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

async function apiPostForm(path, fields, token = "") {
  const h = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  h["Content-Type"] = "application/x-www-form-urlencoded";

  const body = new URLSearchParams();
  Object.entries(fields || {}).forEach(([k, v]) => body.append(k, v ?? ""));

  const res = await fetch(`${API}${path}`, { method: "POST", headers: h, body });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

async function apiPostFormData(path, formData, token = "") {
  const h = {};
  if (token) h["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { method: "POST", headers: h, body: formData });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/* -----------------------------
   App state
----------------------------- */

let TOKEN = getToken();
let ME = null;

let state = {
  monthY: new Date().getFullYear(),
  monthM: new Date().getMonth(), // 0-based
  supplements: [], // [{id, name}]
  // checkins by ymd:
  // { "2026-02-14": { trained: true/false/null, supp: { [suppId]: true/false/null } } }
  monthCheckins: {},
  workouts: [], // list
  photos: [],   // list
  profile: null // {height_cm, weight_kg, biotype}
};

/* -----------------------------
   Views / Navigation
----------------------------- */

const VIEW_MAP = {
  dashboard: "dashboardView",
  calendar: "calendarView",
  photos: "photosView",
  workouts: "workoutsView",
  stats: "statsView"
};

function setTopbar(title, desc) {
  setText($("viewTitle"), title);
  setText($("viewDesc"), desc);
}

function setActiveNav(key) {
  $$(".nav-btn").forEach((b) => {
    const active = b.dataset.view === key;
    b.classList.toggle("active", active);
  });
}

function openAppView(key) {
  // only works if logged
  if (!$("appView") || $("appView").classList.contains("hidden")) return;

  setActiveNav(key);

  Object.entries(VIEW_MAP).forEach(([k, secId]) => {
    const sec = $(secId);
    if (!sec) return;
    if (k === key) show(sec);
    else hide(sec);
  });

  if (key === "dashboard") {
    setTopbar("Dashboard", "Resumo do mês e atalhos.");
    renderKPIs();
  } else if (key === "calendar") {
    setTopbar("Calendário", "Marque treino e suplementos dia a dia.");
    renderCalendar();
  } else if (key === "photos") {
    setTopbar("Físico (Fotos)", "Envie fotos e acompanhe evolução.");
    renderPhotos();
  } else if (key === "workouts") {
    setTopbar("Meu Treino", "Crie e salve seu treino.");
    renderWorkouts();
  } else if (key === "stats") {
    setTopbar("Estatísticas Gerais", "Preencha seus dados e receba recomendações.");
    renderProfile();
  }
}

/* -----------------------------
   Auth
----------------------------- */

async function doLogin() {
  if (authBusy) return;
  authBusy = true;
  setAuthBusy(true);
  setAuthMsg("");

  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";

  if (!email || !password) {
    setAuthMsg("Preencha email e senha.");
    authBusy = false;
    setAuthBusy(false);
    return;
  }

  try {
    const log = await apiPostForm("/login", { email, password });

    if (!log.ok) {
      setAuthMsg(safeDetail(log.data) || "Login inválido.");
      return;
    }
    if (!log.data?.token) {
      setAuthMsg("Servidor não retornou token.");
      return;
    }

    TOKEN = log.data.token;
    setToken(TOKEN);

    const me = await apiFetch("/me", { token: TOKEN });
    if (!me.ok) {
      clearToken();
      TOKEN = "";
      setAuthMsg("Sessão falhou. Tente novamente.");
      return;
    }

    ME = me.data || null;
    setAuthMsg("Logado ✅", true);
    await bootApp();
  } catch (e) {
    setAuthMsg("Erro ao conectar na API.");
  } finally {
    authBusy = false;
    setAuthBusy(false);
  }
}

async function doRegister() {
  if (authBusy) return;
  authBusy = true;
  setAuthBusy(true);
  setAuthMsg("");

  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";

  if (!email || !password) {
    setAuthMsg("Preencha email e senha.");
    authBusy = false;
    setAuthBusy(false);
    return;
  }

  try {
    const r = await apiPostForm("/register", { email, password });
    if (!r.ok) {
      setAuthMsg(safeDetail(r.data) || "Falha ao criar conta.");
      return;
    }

    // auto login
    const log = await apiPostForm("/login", { email, password });
    if (!log.ok || !log.data?.token) {
      setAuthMsg(safeDetail(log.data) || "Conta criada, mas falhou ao logar.");
      return;
    }

    TOKEN = log.data.token;
    setToken(TOKEN);

    const me = await apiFetch("/me", { token: TOKEN });
    if (!me.ok) {
      clearToken();
      TOKEN = "";
      setAuthMsg("Conta criada, mas sessão falhou. Tente login.");
      return;
    }

    ME = me.data || null;
    setAuthMsg("Conta criada e logada ✅", true);
    await bootApp();
  } catch (e) {
    setAuthMsg("Erro ao conectar na API.");
  } finally {
    authBusy = false;
    setAuthBusy(false);
  }
}

function doLogout() {
  clearToken();
  TOKEN = "";
  ME = null;

  // reset UI
  show($("authView"));
  hide($("appView"));
  setTopbar("Entrar", "Suas fotos e dados ficam salvos no servidor (não dependem do navegador).");
  setAuthMsg("");
  setStatus(false);

  // clear sensitive state
  state.monthCheckins = {};
  state.supplements = [];
  state.workouts = [];
  state.photos = [];
  state.profile = null;
}

/* -----------------------------
   Status UI
----------------------------- */

function setStatus(on) {
  const dot = $("statusDot");
  if (dot) {
    dot.classList.toggle("on", !!on);
    dot.classList.toggle("off", !on);
  }
}

/* -----------------------------
   Boot + initial load
----------------------------- */

async function bootApp() {
  // show app
  hide($("authView"));
  show($("appView"));
  setStatus(true);

  // month label sidebar
  setText($("monthLabel"), fmtMonthLabel(state.monthY, state.monthM));
  setText($("calendarMonth"), fmtMonthLabel(state.monthY, state.monthM));

  // load data
  await Promise.all([
    loadSupplements(),
    loadMonthCheckins(),
    loadWorkouts(),
    loadProfile(),
    loadPhotos()
  ]);

  // render initial view
  openAppView("dashboard");
}

/* -----------------------------
   Data loaders
----------------------------- */

async function loadSupplements() {
  const r = await apiFetch("/supplements", { token: TOKEN });
  if (r.ok && Array.isArray(r.data)) {
    state.supplements = r.data;
  } else {
    state.supplements = [];
  }
  renderSuppsChips();
}

async function loadMonthCheckins() {
  // expects /api/checkins?year=YYYY&month=MM (1-12) or similar
  // We'll try common patterns: ?year=&month=
  const year = state.monthY;
  const month = state.monthM + 1;

  let r = await apiFetch(`/checkins?year=${year}&month=${month}`, { token: TOKEN });

  // fallback: /checkins/{year}/{month}
  if (!r.ok) {
    r = await apiFetch(`/checkins/${year}/${month}`, { token: TOKEN });
  }

  if (r.ok && r.data && typeof r.data === "object") {
    // assume it returns dict-like {date: {trained:bool|null, supp:{id:bool|null}}}
    state.monthCheckins = r.data;
  } else {
    state.monthCheckins = {};
  }

  renderCalendar();
  renderKPIs();
}

async function loadWorkouts() {
  const r = await apiFetch("/workouts", { token: TOKEN });
  if (r.ok && Array.isArray(r.data)) state.workouts = r.data;
  else state.workouts = [];
  renderWorkouts();
}

async function loadProfile() {
  const r = await apiFetch("/profile", { token: TOKEN });
  if (r.ok && r.data) state.profile = r.data;
  else state.profile = null;
  renderProfile();
}

async function loadPhotos() {
  // optional endpoints
  let r = await apiFetch("/photos", { token: TOKEN });
  if (!r.ok) {
    // fallback maybe /physique/photos
    r = await apiFetch("/physique/photos", { token: TOKEN });
  }
  if (r.ok && Array.isArray(r.data)) state.photos = r.data;
  else state.photos = [];
  renderPhotos();
  renderKPIs();
}

/* -----------------------------
   Calendar rendering
----------------------------- */

function ensureDay(dateStr) {
  if (!state.monthCheckins[dateStr]) {
    state.monthCheckins[dateStr] = { trained: null, supp: {} };
  }
  if (!state.monthCheckins[dateStr].supp) state.monthCheckins[dateStr].supp = {};
  return state.monthCheckins[dateStr];
}

function daysInMonth(y, m0) {
  return new Date(y, m0 + 1, 0).getDate();
}

function firstDow(y, m0) {
  // 0=Sun..6=Sat
  return new Date(y, m0, 1).getDay();
}

function renderCalendar() {
  setText($("calendarMonth"), fmtMonthLabel(state.monthY, state.monthM));
  setText($("monthLabel"), fmtMonthLabel(state.monthY, state.monthM));

  const grid = $("calendarGrid");
  if (!grid) return;

  const y = state.monthY;
  const m = state.monthM;
  const totalDays = daysInMonth(y, m);
  const start = firstDow(y, m);

  // clear
  grid.innerHTML = "";

  // empty leading cells
  for (let i = 0; i < start; i++) {
    const cell = document.createElement("div");
    cell.className = "day empty";
    grid.appendChild(cell);
  }

  // day cells
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = ymd(y, m, d);
    const info = ensureDay(dateStr);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    if (dateStr === todayYMD()) cell.classList.add("today");

    const trained = info.trained;
    const trainedMark = trained === true ? "✅" : trained === false ? "❌" : "—";

    // count supplement marks for quick badge
    const suppVals = info.supp || {};
    let suppYes = 0, suppNo = 0;
    Object.values(suppVals).forEach((v) => {
      if (v === true) suppYes++;
      else if (v === false) suppNo++;
    });

    cell.innerHTML = `
      <div class="day-top">
        <span class="day-num">${d}</span>
        <span class="day-badge">${trainedMark}</span>
      </div>
      <div class="day-bottom muted">
        <span>Sup: ✅${suppYes} ❌${suppNo}</span>
      </div>
    `;

    cell.addEventListener("click", () => openDayModal(dateStr));
    grid.appendChild(cell);
  }
}

function openDayModal(dateStr) {
  // Modal simples via prompt/confirm, sem depender de CSS/modal pronto
  // (Mais tarde dá pra trocar por modal bonito.)
  const info = ensureDay(dateStr);

  // workout
  const currentTrained = info.trained;
  let trainedLabel = currentTrained === true ? "✅ Sim" : currentTrained === false ? "❌ Não" : "— Não marcado";

  const trainedChoice = prompt(
    `Dia: ${dateStr}\nTreinou? (digite: 1=✅, 0=❌, enter=manter)\nAtual: ${trainedLabel}`,
    ""
  );
  if (trainedChoice === "1") info.trained = true;
  else if (trainedChoice === "0") info.trained = false;

  // supplements
  if (state.supplements.length) {
    const lines = state.supplements.map((s, idx) => {
      const v = info.supp?.[s.id];
      const mark = v === true ? "✅" : v === false ? "❌" : "—";
      return `${idx + 1}. ${s.name} = ${mark}`;
    }).join("\n");

    const suppChoice = prompt(
      `Suplementos (${dateStr})\nEscolha: "n=✅", "n-=❌", "n0=limpar" (ex: 2=✅, 2-=❌)\n\n${lines}\n\nDigite uma opção (ou enter p/ pular):`,
      ""
    );

    if (suppChoice) {
      // parse like: "2", "2-", "20"
      const m = String(suppChoice).match(/^(\d+)(-?|0)$/);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const op = m[2];
        const s = state.supplements[idx];
        if (s) {
          if (!info.supp) info.supp = {};
          if (op === "-") info.supp[s.id] = false;
          else if (op === "0") delete info.supp[s.id];
          else info.supp[s.id] = true;
        }
      }
    }
  } else {
    alert("Você ainda não adicionou suplementos. Vá em Calendário → Suplementos.");
  }

  // persist to backend
  persistDay(dateStr).finally(() => {
    renderCalendar();
    renderKPIs();
  });
}

async function persistDay(dateStr) {
  const info = ensureDay(dateStr);

  // 1) workout checkin
  // endpoint: POST /api/checkin {date, trained} (json) OR Form? We'll send JSON.
  await apiFetch("/checkin", {
    method: "POST",
    token: TOKEN,
    json: { date: dateStr, trained: info.trained }
  });

  // 2) supplement checkins: POST /api/supp_checkin {date, supp_id, took}
  const suppObj = info.supp || {};
  const tasks = Object.entries(suppObj).map(([suppId, took]) => {
    return apiFetch("/supp_checkin", {
      method: "POST",
      token: TOKEN,
      json: { date: dateStr, supplement_id: suppId, took }
    });
  });
  await Promise.all(tasks);

  // refresh month from server (keeps consistent)
  await loadMonthCheckins();
}

/* -----------------------------
   Supplements UI + actions
----------------------------- */

function renderSuppsChips() {
  const wrap = $("suppList");
  if (!wrap) return;

  if (!state.supplements.length) {
    wrap.innerHTML = `<div class="muted">Nenhum suplemento ainda. Adicione acima.</div>`;
    return;
  }

  wrap.innerHTML = "";
  state.supplements.forEach((s) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span class="chip-name">${escapeHTML(s.name)}</span>
      <button type="button" class="chip-x" title="Remover">✕</button>
    `;
    chip.querySelector(".chip-x").addEventListener("click", () => removeSupplement(s.id));
    wrap.appendChild(chip);
  });
}

async function addSupplement() {
  const name = ($("suppName")?.value || "").trim();
  if (!name) return;

  const r = await apiFetch("/supplements/add", {
    method: "POST",
    token: TOKEN,
    json: { name }
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao adicionar suplemento.");
    return;
  }

  $("suppName").value = "";
  await loadSupplements();
  await loadMonthCheckins();
}

async function removeSupplement(suppId) {
  // Nem sempre existe endpoint delete; então só tenta alguns padrões
  let r = await apiFetch(`/supplements/${encodeURIComponent(suppId)}`, {
    method: "DELETE",
    token: TOKEN
  });
  if (!r.ok) {
    // fallback: /supplements/remove
    r = await apiFetch(`/supplements/remove`, {
      method: "POST",
      token: TOKEN,
      json: { id: suppId }
    });
  }

  if (!r.ok) {
    alert("Seu backend ainda não tem rota de remover suplemento. (Opcional)");
    return;
  }

  await loadSupplements();
  await loadMonthCheckins();
}

/* -----------------------------
   Dashboard KPIs
----------------------------- */

function renderKPIs() {
  // workouts in month = number of days trained true
  const days = Object.values(state.monthCheckins || {});
  const workoutDays = days.filter((d) => d?.trained === true).length;

  // supplements taken = count of all true marks for this month
  let suppTaken = 0;
  days.forEach((d) => {
    const supp = d?.supp || {};
    Object.values(supp).forEach((v) => { if (v === true) suppTaken++; });
  });

  setText($("kpiWorkouts"), workoutDays);
  setText($("kpiSupp"), suppTaken);
  setText($("kpiPhotos"), Array.isArray(state.photos) ? state.photos.length : 0);
}

/* -----------------------------
   Workouts
----------------------------- */

function renderWorkouts() {
  const list = $("workoutList");
  if (!list) return;

  if (!state.workouts.length) {
    list.innerHTML = `<div class="muted">Nenhum treino salvo ainda.</div>`;
    return;
  }

  list.innerHTML = "";
  state.workouts.forEach((w) => {
    const card = document.createElement("div");
    card.className = "item";
    const title = w.title || w.name || "Treino";
    const text = w.text || w.content || w.body || "";

    card.innerHTML = `
      <div class="item-head">
        <div class="item-title">${escapeHTML(title)}</div>
        <div class="row">
          <button type="button" class="btn ghost btn-sm" data-act="copy">Copiar</button>
        </div>
      </div>
      <pre class="item-body">${escapeHTML(text)}</pre>
    `;

    card.querySelector('[data-act="copy"]').addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${title}\n\n${text}`);
        alert("Copiado ✅");
      } catch {
        alert("Não deu pra copiar.");
      }
    });

    list.appendChild(card);
  });
}

async function saveWorkout() {
  const title = ($("workoutTitle")?.value || "").trim();
  const text = ($("workoutText")?.value || "").trim();

  if (!title || !text) {
    alert("Preencha nome e conteúdo do treino.");
    return;
  }

  const r = await apiFetch("/workouts/save", {
    method: "POST",
    token: TOKEN,
    json: { title, text }
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao salvar treino.");
    return;
  }

  $("workoutTitle").value = "";
  $("workoutText").value = "";
  await loadWorkouts();
}

/* -----------------------------
   Profile + Recommendations
----------------------------- */

function getProfileFromInputs() {
  const h = parseInt(($("height")?.value || "").trim(), 10);
  const w = parseFloat(($("weight")?.value || "").trim());
  const b = ($("biotype")?.value || "").trim();

  const height_cm = Number.isFinite(h) ? h : null;
  const weight_kg = Number.isFinite(w) ? w : null;
  const biotype = b || null;

  return { height_cm, weight_kg, biotype };
}

function fillProfileInputs(p) {
  if (!p) return;
  if ($("height")) $("height").value = p.height_cm ?? "";
  if ($("weight")) $("weight").value = p.weight_kg ?? "";
  if ($("biotype")) $("biotype").value = p.biotype ?? "";
}

function calcRecommendation(p) {
  // Simples, mas profissional: IMC + foco por biotipo
  if (!p?.height_cm || !p?.weight_kg) {
    return "Preencha altura e peso para calcular IMC e recomendações.";
  }

  const h = p.height_cm / 100;
  const imc = p.weight_kg / (h * h);

  let imcClass = "";
  if (imc < 18.5) imcClass = "Abaixo do peso";
  else if (imc < 25) imcClass = "Peso normal";
  else if (imc < 30) imcClass = "Sobrepeso";
  else imcClass = "Obesidade";

  let focus = "";
  let split = "";
  let cardio = "";
  let reps = "";
  let diet = "";

  const bio = (p.biotype || "").toLowerCase();

  if (bio === "ectomorfo") {
    focus = "Hipertrofia com progressão de carga (ganho de massa).";
    split = "Sugestão: Upper/Lower 4x/sem ou ABC 5x/sem.";
    cardio = "Cardio moderado (2x/sem 15–20min) só para condicionamento.";
    reps = "Priorize 6–12 reps, compostos pesados + acessórios.";
    diet = "Superávit calórico leve e proteína consistente.";
  } else if (bio === "mesomorfo") {
    focus = "Hipertrofia + força (equilíbrio).";
    split = "Sugestão: Push/Pull/Legs ou Upper/Lower.";
    cardio = "Cardio 2–3x/sem 15–25min.";
    reps = "Misture blocos de força (3–6 reps) e hipertrofia (8–12).";
    diet = "Manutenção/superávit leve conforme objetivo.";
  } else if (bio === "endomorfo") {
    focus = "Recomposição (força + hipertrofia) com controle de gordura.";
    split = "Sugestão: Fullbody 3–4x/sem ou Upper/Lower 4x/sem.";
    cardio = "Cardio 3–4x/sem 20–35min (LISS ou intervalado leve).";
    reps = "8–15 reps, descanso controlado e muita consistência.";
    diet = "Déficit leve/controle de carbo e proteína alta.";
  } else {
    focus = "Defina o biotipo para recomendações mais específicas.";
    split = "Sugestão geral: Upper/Lower 4x/sem.";
    cardio = "Cardio 2–3x/sem 20min.";
    reps = "8–12 reps na maioria dos exercícios.";
    diet = "Ajuste calorias conforme objetivo.";
  }

  return [
    `IMC: ${imc.toFixed(1)} (${imcClass}).`,
    "",
    `Foco: ${focus}`,
    split,
    reps,
    cardio,
    `Nutrição: ${diet}`,
    "",
    "Obs: isso é uma recomendação geral. Se tiver lesões/condições, ajuste com profissional."
  ].join("\n");
}

function renderProfile() {
  // fill inputs
  fillProfileInputs(state.profile);

  // calc recommendation
  const p = state.profile || getProfileFromInputs();
  setText($("recommendation"), calcRecommendation(p));
}

async function saveProfile() {
  const p = getProfileFromInputs();

  if (!p.height_cm || !p.weight_kg) {
    alert("Altura e peso são obrigatórios.");
    return;
  }

  const r = await apiFetch("/profile", {
    method: "POST",
    token: TOKEN,
    json: p
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao salvar perfil.");
    return;
  }

  state.profile = r.data || p;
  renderProfile();
  alert("Perfil salvo ✅");
}

/* -----------------------------
   Photos (optional endpoints)
----------------------------- */

function renderPhotos() {
  const grid = $("photoGrid");
  if (!grid) return;

  if (!state.photos || !state.photos.length) {
    grid.innerHTML = `
      <div class="muted">
        Nenhuma foto ainda. Envie acima.
        <br><br>
        <small>Se o backend não tiver /api/photos, esta área fica só no frontend (não recomendado).</small>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  state.photos.forEach((p) => {
    // esperamos algo como {url, created_at, note}
    const url = p.url || p.path || "";
    const note = p.note || "";
    const when = p.created_at || p.date || "";

    const card = document.createElement("div");
    card.className = "photo-card";

    card.innerHTML = `
      <div class="photo-img">
        ${url ? `<img src="${escapeAttr(url)}" alt="foto" />` : `<div class="muted">Sem URL</div>`}
      </div>
      <div class="photo-meta">
        <div class="muted">${escapeHTML(String(when || ""))}</div>
        <div>${escapeHTML(note)}</div>
      </div>
    `;

    grid.appendChild(card);
  });
}

async function uploadPhoto() {
  const fileInput = $("photoFile");
  const noteInput = $("photoNote");
  const file = fileInput?.files?.[0] || null;
  const note = (noteInput?.value || "").trim();

  if (!file) {
    alert("Selecione uma imagem.");
    return;
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("note", note);

  // try /photos/upload
  let r = await apiPostFormData("/photos/upload", fd, TOKEN);
  if (!r.ok) {
    // fallback
    r = await apiPostFormData("/physique/photos/upload", fd, TOKEN);
  }

  if (!r.ok) {
    alert("Seu backend ainda não tem endpoint de upload de fotos (/api/photos/upload).");
    return;
  }

  if (noteInput) noteInput.value = "";
  if (fileInput) fileInput.value = "";

  await loadPhotos();
  alert("Foto enviada ✅");
}

/* -----------------------------
   Month nav
----------------------------- */

function prevMonth() {
  state.monthM -= 1;
  if (state.monthM < 0) {
    state.monthM = 11;
    state.monthY -= 1;
  }
  loadMonthCheckins();
}

function nextMonth() {
  state.monthM += 1;
  if (state.monthM > 11) {
    state.monthM = 0;
    state.monthY += 1;
  }
  loadMonthCheckins();
}

/* -----------------------------
   Escaping
----------------------------- */

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  return escapeHTML(s).replaceAll("`", "&#096;");
}

/* -----------------------------
   Bind events
----------------------------- */

function bindEvents() {
  // Auth
  $("btnLogin")?.addEventListener("click", doLogin);
  $("btnRegister")?.addEventListener("click", doRegister);
  $("btnLogout")?.addEventListener("click", doLogout);

  // Sidebar nav
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.view;
      openAppView(key);
    });
  });

  // Calendar month nav
  $("prevMonth")?.addEventListener("click", prevMonth);
  $("nextMonth")?.addEventListener("click", nextMonth);

  // Supplements
  $("btnAddSupp")?.addEventListener("click", addSupplement);
  $("suppName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSupplement();
  });

  // Workouts
  $("btnSaveWorkout")?.addEventListener("click", saveWorkout);

  // Profile
  $("btnSaveProfile")?.addEventListener("click", saveProfile);
  ["height", "weight", "biotype"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      // live preview recommendation (client-side)
      const p = getProfileFromInputs();
      setText($("recommendation"), calcRecommendation(p));
    });
  });

  // Photos
  $("btnUploadPhoto")?.addEventListener("click", uploadPhoto);
}

/* -----------------------------
   Init
----------------------------- */

async function init() {
  bindEvents();

  // initial topbar
  setTopbar("Entrar", "Suas fotos e dados ficam salvos no servidor (não dependem do navegador).");

  // if token exists, auto-login
  if (TOKEN) {
    setAuthMsg("Restaurando sessão...", true);
    const me = await apiFetch("/me", { token: TOKEN });

    if (me.ok) {
      ME = me.data || null;
      await bootApp();
      return;
    }

    // token invalid
    clearToken();
    TOKEN = "";
    ME = null;
    setAuthMsg("Sessão expirada. Faça login novamente.");
  } else {
    setAuthMsg("");
  }

  // show auth
  show($("authView"));
  hide($("appView"));
  setStatus(false);

  // month labels
  setText($("monthLabel"), fmtMonthLabel(state.monthY, state.monthM));
  setText($("calendarMonth"), fmtMonthLabel(state.monthY, state.monthM));
}

document.addEventListener("DOMContentLoaded", init);
