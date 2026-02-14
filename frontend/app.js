/* =========================================================
   Gym Tracker - frontend/app.js (INTEIRO)
   - Auth (register/login) sem double request
   - Mensagens sem [object Object]
   - App completo: dashboard, calendário, suplementos, fotos, treino, stats
   ========================================================= */

/* =========================
   CONFIG
   ========================= */
const API_BASE = "https://zeraty-gym.onrender.com";
const API = `${API_BASE}/api`;

/* =========================
   HELPERS
   ========================= */
const $ = (id) => document.getElementById(id);

function safeText(x) {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return JSON.stringify(x);
}

function safeDetail(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.detail !== undefined) return safeText(data.detail);
  if (data.message !== undefined) return safeText(data.message);
  return safeText(data);
}

function monthLabelPT(dateObj) {
  const mm = dateObj.toLocaleString("pt-BR", { month: "long" });
  return `${mm[0].toUpperCase() + mm.slice(1)} ${dateObj.getFullYear()}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function setVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

/* =========================
   AUTH STORAGE
   ========================= */
function getToken() {
  return localStorage.getItem("gym_token") || "";
}
function setToken(t) {
  localStorage.setItem("gym_token", t);
}
function clearToken() {
  localStorage.removeItem("gym_token");
}

/* =========================
   UI: AUTH MESSAGES / BUSY
   ========================= */
function setAuthMsg(text, ok = false) {
  const el = $("authMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.opacity = text ? "1" : "0";
  el.style.color = ok ? "#b7ffcf" : "#ffb7c7";
}

function setAuthBusy(busy) {
  const btnL = $("btnLogin");
  const btnR = $("btnRegister");
  if (btnL) btnL.disabled = busy;
  if (btnR) btnR.disabled = busy;
}

/* =========================
   HTTP CLIENT
   ========================= */
async function apiFetch(path, { method = "GET", body = null, token = "", isForm = false } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : null,
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  return { ok: res.ok, status: res.status, data };
}

/* =========================
   GLOBAL STATE
   ========================= */
let TOKEN = getToken();
let ME = null;

let currentMonth = new Date();
currentMonth.setDate(1);

let SUPPLEMENTS = [];
let CHECKINS_MAP = {};     // date -> did_train (0/1)
let SUPP_MAP = {};         // "date::suppId" -> took (0/1)
let WORKOUTS = [];
let PHOTOS = [];
let PROFILE = null;

let booted = false;

/* =========================
   UI ELEMENTS
   ========================= */
const authView = $("authView");
const appView = $("appView");

const statusDot = $("statusDot");
const monthPill = $("monthLabel");

const navBtns = Array.from(document.querySelectorAll(".nav-btn"));

const viewTitle = $("viewTitle");
const viewDesc = $("viewDesc");

const dashboardView = $("dashboardView");
const calendarView = $("calendarView");
const photosView = $("photosView");
const workoutsView = $("workoutsView");
const statsView = $("statsView");

// dashboard kpis
const kpiWorkouts = $("kpiWorkouts");
const kpiSupp = $("kpiSupp");
const kpiPhotos = $("kpiPhotos");

// calendar
const prevMonthBtn = $("prevMonth");
const nextMonthBtn = $("nextMonth");
const calendarMonthEl = $("calendarMonth");
const calendarGrid = $("calendarGrid");

// supplements
const suppName = $("suppName");
const btnAddSupp = $("btnAddSupp");
const suppList = $("suppList");

// photos
const photoFile = $("photoFile");
const photoNote = $("photoNote");
const btnUploadPhoto = $("btnUploadPhoto");
const photoGrid = $("photoGrid");

// workouts
const workoutTitle = $("workoutTitle");
const workoutText = $("workoutText");
const btnSaveWorkout = $("btnSaveWorkout");
const workoutList = $("workoutList");

// stats
const heightEl = $("height");
const weightEl = $("weight");
const biotypeEl = $("biotype");
const btnSaveProfile = $("btnSaveProfile");
const recommendationEl = $("recommendation");

// logout
const btnLogout = $("btnLogout");

/* =========================
   VIEW / NAV
   ========================= */
function showAuth() {
  setVisible(authView, true);
  setVisible(appView, false);
  if (statusDot) {
    statusDot.classList.remove("on");
    statusDot.classList.add("off");
  }
}

function showApp() {
  setVisible(authView, false);
  setVisible(appView, true);
  if (statusDot) {
    statusDot.classList.remove("off");
    statusDot.classList.add("on");
  }
}

function setActiveNav(key) {
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === key));

  setVisible(dashboardView, key === "dashboard");
  setVisible(calendarView, key === "calendar");
  setVisible(photosView, key === "photos");
  setVisible(workoutsView, key === "workouts");
  setVisible(statsView, key === "stats");

  const map = {
    dashboard: ["Dashboard", "Resumo do mês e consistência."],
    calendar: ["Calendário", "Marque treino e suplementos por dia."],
    photos: ["Físico (Fotos)", "Envie e acompanhe suas fotos."],
    workouts: ["Meu Treino", "Crie e salve seus treinos."],
    stats: ["Estatísticas Gerais", "Altura, peso e recomendações automáticas."],
  };

  const [t, d] = map[key] || ["Gym Tracker", ""];
  if (viewTitle) viewTitle.textContent = t;
  if (viewDesc) viewDesc.textContent = d;
}

/* =========================
   AUTH (NO DOUBLE REQUEST)
   ========================= */
let authBusy = false;

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
    const r = await apiFetch("/register", { method: "POST", body: { email, password } });
    if (!r.ok) {
      setAuthMsg(safeDetail(r.data) || "Falha ao criar conta.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    // auto-login depois de criar
    const log = await apiFetch("/login", { method: "POST", body: { email, password } });
    if (!log.ok || !log.data?.token) {
      setAuthMsg(safeDetail(log.data) || "Conta criada, mas falhou ao logar.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    TOKEN = log.data.token;
    setToken(TOKEN);

    const me = await apiFetch("/me", { token: TOKEN });
    if (!me.ok) {
      clearToken();
      TOKEN = "";
      setAuthMsg("Conta criada, mas sessão falhou. Tente login.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    setAuthMsg("Conta criada e logada ✅", true);
    await bootApp();
  } catch (e) {
    setAuthMsg("Erro ao conectar na API.");
  } finally {
    authBusy = false;
    setAuthBusy(false);
  }
}

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
    const log = await apiFetch("/login", { method: "POST", body: { email, password } });
    if (!log.ok) {
      setAuthMsg(safeDetail(log.data) || "Login inválido.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    if (!log.data?.token) {
      setAuthMsg("Servidor não retornou token.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    TOKEN = log.data.token;
    setToken(TOKEN);

    const me = await apiFetch("/me", { token: TOKEN });
    if (!me.ok) {
      clearToken();
      TOKEN = "";
      setAuthMsg("Sessão falhou. Tente novamente.");
      authBusy = false;
      setAuthBusy(false);
      return;
    }

    setAuthMsg("Logado ✅", true);
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
  // limpa caches
  SUPPLEMENTS = [];
  CHECKINS_MAP = {};
  SUPP_MAP = {};
  WORKOUTS = [];
  PHOTOS = [];
  PROFILE = null;

  showAuth();
  setAuthMsg("");
}

/* =========================
   DATA LOADERS
   ========================= */
async function loadMe() {
  const r = await apiFetch("/me", { token: TOKEN });
  if (!r.ok) return false;
  ME = r.data;
  return true;
}

async function loadSupplements() {
  const r = await apiFetch("/supplements", { token: TOKEN });
  if (!r.ok) {
    SUPPLEMENTS = [];
    return;
  }
  SUPPLEMENTS = Array.isArray(r.data) ? r.data : [];
}

async function loadMonthCheckins() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth() + 1;

  const r = await apiFetch(`/checkins?year=${y}&month=${m}`, { token: TOKEN });
  CHECKINS_MAP = {};
  if (r.ok && Array.isArray(r.data)) {
    r.data.forEach(row => {
      if (row?.date) CHECKINS_MAP[row.date] = row.did_train;
    });
  }
}

async function loadMonthSuppCheckins() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth() + 1;

  // seu backend tem POST /api/supp_checkin e provavelmente GET /api/supp_checkins
  const r = await apiFetch(`/supp_checkins?year=${y}&month=${m}`, { token: TOKEN });
  SUPP_MAP = {};
  if (r.ok && Array.isArray(r.data)) {
    r.data.forEach(row => {
      const k = `${row.date}::${row.supplement_id}`;
      SUPP_MAP[k] = row.took;
    });
  }
}

async function loadWorkouts() {
  const r = await apiFetch("/workouts", { token: TOKEN });
  WORKOUTS = (r.ok && Array.isArray(r.data)) ? r.data : [];
}

async function loadProfile() {
  const r = await apiFetch("/profile", { token: TOKEN });
  PROFILE = r.ok ? (r.data || null) : null;
}

async function loadPhotos() {
  // Essas rotas podem ou não existir no backend.
  // Se não existir, não quebra o app.
  const r = await apiFetch("/photos", { token: TOKEN });
  if (!r.ok) {
    PHOTOS = [];
    return { ok: false, status: r.status, detail: safeDetail(r.data) };
  }
  PHOTOS = Array.isArray(r.data) ? r.data : [];
  return { ok: true };
}

/* =========================
   RENDERERS
   ========================= */
function renderSuppList() {
  if (!suppList) return;
  suppList.innerHTML = "";

  if (!SUPPLEMENTS.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nenhum suplemento ainda. Adicione acima.";
    suppList.appendChild(empty);
    return;
  }

  SUPPLEMENTS.forEach(s => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${safeText(s.name || "Suplemento")}</span><button title="remover">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      alert("Remover suplemento ainda não implementado no backend.");
    });
    suppList.appendChild(chip);
  });
}

function addTag(container, text) {
  const t = document.createElement("span");
  t.className = "tag";
  t.textContent = text;
  container.appendChild(t);
}

function renderCalendar() {
  if (calendarMonthEl) calendarMonthEl.textContent = monthLabelPT(currentMonth);
  if (monthPill) monthPill.textContent = monthLabelPT(currentMonth);

  if (!calendarGrid) return;
  calendarGrid.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // domingo = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startDay; i++) {
    const pad = document.createElement("div");
    pad.className = "day";
    pad.style.opacity = "0.22";
    pad.style.pointerEvents = "none";
    calendarGrid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = isoDate(d);

    const el = document.createElement("div");
    el.className = "day";

    el.innerHTML = `
      <div class="dnum">${day}</div>
      <div class="tags"></div>
    `;

    const tags = el.querySelector(".tags");

    // treino
    const tr = CHECKINS_MAP[key];
    if (tr === 1) addTag(tags, "Treino ✅");
    if (tr === 0) addTag(tags, "Treino ❌");

    // suplementos
    SUPPLEMENTS.forEach(s => {
      const v = SUPP_MAP[`${key}::${s.id}`];
      if (v === 1) addTag(tags, `${s.name} ✅`);
      if (v === 0) addTag(tags, `${s.name} ❌`);
    });

    // clique: abre “mini menu” simples via prompt
    el.addEventListener("click", async () => {
      const choose = prompt(
        `Dia ${key}\n\nDigite:\n1 = Treinou ✅\n0 = Não treinou ❌\n\nOu suplemento: "whey 1" / "creatina 0"\n(ex: "1" ou "whey 1")`
      );
      if (!choose) return;

      // treino
      if (choose.trim() === "1" || choose.trim() === "0") {
        const did_train = choose.trim() === "1" ? 1 : 0;
        const r = await apiFetch("/checkin", {
          method: "POST",
          token: TOKEN,
          body: { date: key, did_train }
        });
        if (!r.ok) {
          alert(safeDetail(r.data) || "Falha ao salvar check-in.");
          return;
        }
        await refreshCalendarAndDashboard();
        return;
      }

      // suplemento: "nome valor"
      const parts = choose.trim().split(/\s+/);
      if (parts.length >= 2) {
        const val = parts[parts.length - 1];
        const took = val === "1" ? 1 : 0;
        const name = parts.slice(0, -1).join(" ").toLowerCase();

        const supp = SUPPLEMENTS.find(s => String(s.name || "").toLowerCase() === name);
        if (!supp) {
          alert("Suplemento não encontrado. Use exatamente o nome que aparece na lista.");
          return;
        }

        const r = await apiFetch("/supp_checkin", {
          method: "POST",
          token: TOKEN,
          body: { date: key, supplement_id: supp.id, took }
        });

        if (!r.ok) {
          alert(safeDetail(r.data) || "Falha ao salvar suplemento.");
          return;
        }

        await refreshCalendarAndDashboard();
        return;
      }

      alert("Formato inválido.");
    });

    calendarGrid.appendChild(el);
  }
}

function renderDashboard() {
  if (monthPill) monthPill.textContent = monthLabelPT(currentMonth);

  // kpis:
  const trainedCount = Object.values(CHECKINS_MAP).filter(v => v === 1).length;
  const suppTakenCount = Object.values(SUPP_MAP).filter(v => v === 1).length;
  const photosCount = Array.isArray(PHOTOS) ? PHOTOS.length : 0;

  if (kpiWorkouts) kpiWorkouts.textContent = String(trainedCount);
  if (kpiSupp) kpiSupp.textContent = String(suppTakenCount);
  if (kpiPhotos) kpiPhotos.textContent = String(photosCount);
}

function renderWorkouts() {
  if (!workoutList) return;
  workoutList.innerHTML = "";

  if (!WORKOUTS.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nenhum treino salvo ainda.";
    workoutList.appendChild(empty);
    return;
  }

  WORKOUTS.forEach(w => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <strong>${safeText(w.title || "Treino")}</strong>
      <pre style="white-space:pre-wrap; margin:10px 0 0; color:rgba(255,255,255,.8)">${safeText(w.text || "")}</pre>
    `;
    workoutList.appendChild(item);
  });
}

function renderStats() {
  // preenche inputs se tiver profile
  if (PROFILE) {
    if (heightEl) heightEl.value = PROFILE.height ?? "";
    if (weightEl) weightEl.value = PROFILE.weight ?? "";
    if (biotypeEl) biotypeEl.value = PROFILE.biotype ?? "";
    renderRecommendation(PROFILE);
  } else {
    if (recommendationEl) recommendationEl.textContent = "Preencha seus dados para gerar recomendações.";
  }
}

function renderRecommendation(p) {
  if (!recommendationEl) return;

  const height = Number(p?.height || 0);
  const weight = Number(p?.weight || 0);
  const biotype = String(p?.biotype || "").toLowerCase();

  if (!height || !weight || !biotype) {
    recommendationEl.textContent = "Preencha seus dados para gerar recomendações.";
    return;
  }

  const h = height / 100;
  const imc = weight / (h * h);

  let foco = "";
  if (imc < 18.5) foco = "Ganho de massa (superávit calórico + progressão de cargas).";
  else if (imc < 25) foco = "Recomposição (manter/leve superávit + treino consistente).";
  else foco = "Definição (déficit leve + treino pesado + cardio moderado).";

  let treino = "";
  if (biotype === "ectomorfo") treino = "Básicos, cargas altas, menos volume, descanso maior. 3–5x/sem.";
  else if (biotype === "mesomorfo") treino = "Volume moderado/alto + progressão semanal. 4–6x/sem.";
  else treino = "Consistência + dieta + cardio leve/moderado + força. 4–6x/sem.";

  recommendationEl.innerHTML = `
    <div>IMC estimado: <b>${imc.toFixed(1)}</b></div>
    <div style="margin-top:8px;"><b>Foco:</b> ${foco}</div>
    <div style="margin-top:8px;"><b>Treino:</b> ${treino}</div>
  `;
}

function renderPhotosUI(status) {
  if (!photoGrid) return;
  photoGrid.innerHTML = "";

  if (!status?.ok) {
    const box = document.createElement("div");
    box.className = "muted";
    box.textContent =
      "Fotos ainda não estão disponíveis no backend (rota /api/photos). " +
      "Quando você adicionar as rotas, aqui vai listar automaticamente.";
    photoGrid.appendChild(box);
    if (kpiPhotos) kpiPhotos.textContent = "0";
    return;
  }

  if (!PHOTOS.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nenhuma foto ainda. Envie a primeira acima.";
    photoGrid.appendChild(empty);
    if (kpiPhotos) kpiPhotos.textContent = "0";
    return;
  }

  PHOTOS.forEach(p => {
    const card = document.createElement("div");
    card.className = "photo";
    // backend pode devolver: {url, date, note} ou {path,...}
    const url = p.url || p.path || "";
    const date = p.date || p.created_at || "";
    const note = p.note || "";

    card.innerHTML = `
      <img src="${url}" alt="foto" />
      <div class="meta">${safeText(date)}${note ? " • " + safeText(note) : ""}</div>
    `;
    photoGrid.appendChild(card);
  });

  if (kpiPhotos) kpiPhotos.textContent = String(PHOTOS.length);
}

/* =========================
   ACTIONS
   ========================= */
let addSuppBusy = false;
async function addSupplement() {
  if (addSuppBusy) return;
  addSuppBusy = true;

  const name = (suppName?.value || "").trim();
  if (!name) { addSuppBusy = false; return; }

  const r = await apiFetch("/supplements/add", {
    method: "POST",
    token: TOKEN,
    body: { name }
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao adicionar suplemento.");
    addSuppBusy = false;
    return;
  }

  if (suppName) suppName.value = "";
  await refreshCalendarAndDashboard();
  addSuppBusy = false;
}

let workoutBusy = false;
async function saveWorkout() {
  if (workoutBusy) return;
  workoutBusy = true;

  const title = (workoutTitle?.value || "").trim();
  const text = (workoutText?.value || "").trim();

  if (!title || !text) {
    alert("Preencha nome e conteúdo do treino.");
    workoutBusy = false;
    return;
  }

  const r = await apiFetch("/workouts/save", {
    method: "POST",
    token: TOKEN,
    body: { title, text }
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao salvar treino.");
    workoutBusy = false;
    return;
  }

  if (workoutTitle) workoutTitle.value = "";
  if (workoutText) workoutText.value = "";

  await loadWorkouts();
  renderWorkouts();

  workoutBusy = false;
}

let profileBusy = false;
async function saveProfile() {
  if (profileBusy) return;
  profileBusy = true;

  const height = clampInt(heightEl?.value || 0, 0, 300);
  const weight = Number(weightEl?.value || 0);
  const biotype = biotypeEl?.value || "";

  const r = await apiFetch("/profile", {
    method: "POST",
    token: TOKEN,
    body: { height, weight, biotype }
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao salvar perfil.");
    profileBusy = false;
    return;
  }

  PROFILE = { height, weight, biotype };
  renderRecommendation(PROFILE);
  alert("Salvo ✅");
  profileBusy = false;
}

let uploadBusy = false;
async function uploadPhoto() {
  if (uploadBusy) return;
  uploadBusy = true;

  if (!photoFile?.files || !photoFile.files[0]) {
    alert("Escolha uma imagem.");
    uploadBusy = false;
    return;
  }

  const file = photoFile.files[0];
  const note = (photoNote?.value || "").trim();

  const fd = new FormData();
  fd.append("file", file);
  fd.append("note", note);

  // rota esperada: POST /api/photos/upload
  const r = await apiFetch("/photos/upload", {
    method: "POST",
    token: TOKEN,
    body: fd,
    isForm: true
  });

  if (!r.ok) {
    alert(safeDetail(r.data) || "Falha ao enviar foto (rota /api/photos/upload).");
    uploadBusy = false;
    return;
  }

  if (photoFile) photoFile.value = "";
  if (photoNote) photoNote.value = "";

  const st = await loadPhotos();
  renderPhotosUI(st);
  renderDashboard();

  uploadBusy = false;
}

/* =========================
   REFRESH HELPERS
   ========================= */
async function refreshCalendarAndDashboard() {
  await loadSupplements();
  await loadMonthCheckins();
  await loadMonthSuppCheckins();
  renderSuppList();
  renderCalendar();
  renderDashboard();
}

/* =========================
   MONTH NAV
   ========================= */
async function prevMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  await refreshCalendarAndDashboard();
}
async function nextMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  await refreshCalendarAndDashboard();
}

/* =========================
   BOOT APP
   ========================= */
async function bootApp() {
  const ok = await loadMe();
  if (!ok) {
    // token inválido
    doLogout();
    setAuthMsg("Sessão inválida. Faça login novamente.");
    return;
  }

  showApp();

  // carrega tudo de uma vez (sequencial para ficar previsível)
  await loadSupplements();
  await loadMonthCheckins();
  await loadMonthSuppCheckins();
  await loadWorkouts();
  await loadProfile();
  const photosStatus = await loadPhotos();

  // render
  renderSuppList();
  renderCalendar();
  renderWorkouts();
  renderStats();
  renderPhotosUI(photosStatus);
  renderDashboard();

  // view padrão
  setActiveNav("dashboard");

  booted = true;
}

/* =========================
   EVENTS / BINDINGS
   ========================= */
function bindUI() {
  // auth buttons
  $("btnLogin")?.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
  $("btnRegister")?.addEventListener("click", (e) => { e.preventDefault(); doRegister(); });

  // logout
  btnLogout?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

  // nav
  navBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.view;
      setActiveNav(key);

      if (!booted) return;

      // quando entrar numa tela, atualiza dados dela
      if (key === "dashboard") {
        renderDashboard();
      }

      if (key === "calendar") {
        renderCalendar();
      }

      if (key === "photos") {
        const st = await loadPhotos();
        renderPhotosUI(st);
        renderDashboard();
      }

      if (key === "workouts") {
        await loadWorkouts();
        renderWorkouts();
      }

      if (key === "stats") {
        await loadProfile();
        renderStats();
      }
    });
  });

  // month nav
  prevMonthBtn?.addEventListener("click", (e) => { e.preventDefault(); prevMonth(); });
  nextMonthBtn?.addEventListener("click", (e) => { e.preventDefault(); nextMonth(); });

  // supplements
  btnAddSupp?.addEventListener("click", (e) => { e.preventDefault(); addSupplement(); });

  // workouts
  btnSaveWorkout?.addEventListener("click", (e) => { e.preventDefault(); saveWorkout(); });

  // profile
  btnSaveProfile?.addEventListener("click", (e) => { e.preventDefault(); saveProfile(); });

  // photos
  btnUploadPhoto?.addEventListener("click", (e) => { e.preventDefault(); uploadPhoto(); });
}

/* =========================
   START
   ========================= */
async function start() {
  bindUI();

  // Mostra mês no status mesmo antes de logar
  if (monthPill) monthPill.textContent = monthLabelPT(currentMonth);

  TOKEN = getToken();

  if (!TOKEN) {
    showAuth();
    return;
  }

  // tenta bootar direto
  await bootApp();
}

start();
