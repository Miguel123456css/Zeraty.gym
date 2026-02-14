// =========================
// Config
// =========================
const API = "https://zeraty-gym.onrender.com/api";

// =========================
// DOM helpers
// =========================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const authView = $("authView");
const appView = $("appView");

const emailEl = $("email");
const passEl = $("password");
const msgEl = $("authMsg");
const btnLogin = $("btnLogin");
const btnRegister = $("btnRegister");

const statusDot = $("statusDot");
const monthLabel = $("monthLabel");

// Views
const viewTitle = $("viewTitle");
const viewDesc = $("viewDesc");
const dashboardView = $("dashboardView");
const calendarView = $("calendarView");
const photosView = $("photosView");
const workoutsView = $("workoutsView");
const statsView = $("statsView");

const navBtns = $$(".nav-btn");

// Calendar
const prevMonthBtn = $("prevMonth");
const nextMonthBtn = $("nextMonth");
const calendarMonth = $("calendarMonth");
const calendarGrid = $("calendarGrid");

// Supplements
const suppName = $("suppName");
const btnAddSupp = $("btnAddSupp");
const suppList = $("suppList");

// Photos
const photoFile = $("photoFile");
const photoNote = $("photoNote");
const btnUploadPhoto = $("btnUploadPhoto");
const photoGrid = $("photoGrid");

// Workouts
const workoutTitle = $("workoutTitle");
const workoutText = $("workoutText");
const btnSaveWorkout = $("btnSaveWorkout");
const workoutList = $("workoutList");

// Stats
const heightEl = $("height");
const weightEl = $("weight");
const biotypeEl = $("biotype");
const btnSaveProfile = $("btnSaveProfile");
const recommendationEl = $("recommendation");

// KPIs
const kpiWorkouts = $("kpiWorkouts");
const kpiSupp = $("kpiSupp");
const kpiPhotos = $("kpiPhotos");

// Logout
const btnLogout = $("btnLogout");

// =========================
// State
// =========================
let authBusy = false;
let token = localStorage.getItem("gym_token") || "";
let me = null;

let currentMonth = new Date();
currentMonth.setDate(1);

// =========================
// UI helpers
// =========================
function setAuthMsg(text, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.opacity = text ? "1" : "0";
  msgEl.style.color = ok ? "#b7ffcf" : "#ffb7c7";
}

function setAuthBusyState(busy) {
  authBusy = busy;
  if (btnLogin) btnLogin.disabled = busy;
  if (btnRegister) btnRegister.disabled = busy;
}

function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  statusDot.classList.remove("on");
  statusDot.classList.add("off");
}

function showApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  statusDot.classList.remove("off");
  statusDot.classList.add("on");
}

function setActiveNav(viewKey) {
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === viewKey));

  dashboardView.classList.toggle("hidden", viewKey !== "dashboard");
  calendarView.classList.toggle("hidden", viewKey !== "calendar");
  photosView.classList.toggle("hidden", viewKey !== "photos");
  workoutsView.classList.toggle("hidden", viewKey !== "workouts");
  statsView.classList.toggle("hidden", viewKey !== "stats");

  const titleMap = {
    dashboard: ["Dashboard", "Resumo do mês e consistência."],
    calendar: ["Calendário", "Marque treino e suplementos por dia."],
    photos: ["Físico (Fotos)", "Envie e acompanhe suas fotos."],
    workouts: ["Meu Treino", "Crie e salve seus treinos."],
    stats: ["Estatísticas Gerais", "Altura, peso e recomendações automáticas."]
  };

  const [t, d] = titleMap[viewKey] || ["Gym Tracker", "—"];
  viewTitle.textContent = t;
  viewDesc.textContent = d;
}

// =========================
// HTTP
// =========================
async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = headers["Content-Type"] || "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });

  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

// =========================
// Auth
// =========================
async function doRegister() {
  if (authBusy) return;
  setAuthMsg("");

  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";
  if (!email || !password) return setAuthMsg("Preencha email e senha.");

  setAuthBusyState(true);
  try {
    const reg = await apiFetch("/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (!reg.ok) return setAuthMsg(reg.data?.detail || "Não foi possível criar conta.");

    // auto-login depois do register
    const log = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (!log.ok) return setAuthMsg("Conta criada, mas falhou ao logar.");

    token = log.data.token;
    localStorage.setItem("gym_token", token);
    setAuthMsg("Conta criada e logada ✅", true);

    await boot();
  } catch (e) {
    setAuthMsg("Erro ao conectar na API.");
  } finally {
    setAuthBusyState(false);
  }
}

async function doLogin() {
  if (authBusy) return;
  setAuthMsg("");

  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";
  if (!email || !password) return setAuthMsg("Preencha email e senha.");

  setAuthBusyState(true);
  try {
    const log = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (!log.ok) return setAuthMsg(log.data?.detail || "Login inválido.");

    token = log.data.token;
    localStorage.setItem("gym_token", token);
    setAuthMsg("Logado ✅", true);

    await boot();
  } catch (e) {
    setAuthMsg("Erro ao conectar na API.");
  } finally {
    setAuthBusyState(false);
  }
}

function doLogout() {
  localStorage.removeItem("gym_token");
  token = "";
  me = null;
  showAuth();
  setAuthMsg("");
}

// Bind auth buttons
btnLogin?.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
btnRegister?.addEventListener("click", (e) => { e.preventDefault(); doRegister(); });
btnLogout?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

// =========================
// App logic
// =========================
function monthStr(d) {
  const mm = d.toLocaleString("pt-BR", { month: "long" });
  return `${mm[0].toUpperCase() + mm.slice(1)} ${d.getFullYear()}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderCalendar(checkinsMap = {}, suppCheckinsMap = {}, supplements = []) {
  calendarMonth.textContent = monthStr(currentMonth);
  monthLabel.textContent = monthStr(currentMonth);

  calendarGrid.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // padding (seg=1... dom=0). Vamos usar domingo como primeira coluna.
  for (let i = 0; i < startDay; i++) {
    const pad = document.createElement("div");
    pad.className = "day";
    pad.style.opacity = "0.25";
    pad.style.pointerEvents = "none";
    calendarGrid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = isoDate(d);

    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.innerHTML = `
      <div class="dnum">${day}</div>
      <div class="tags" id="tags-${key}"></div>
    `;

    const tags = dayEl.querySelector(`#tags-${CSS.escape(key)}`);

    // treino
    if (checkinsMap[key] === 1) addTag(tags, "Treino ✅");
    if (checkinsMap[key] === 0) addTag(tags, "Treino ❌");

    // suplementos
    supplements.forEach(s => {
      const skey = `${key}::${s.id}`;
      if (suppCheckinsMap[skey] === 1) addTag(tags, `${s.name} ✅`);
      if (suppCheckinsMap[skey] === 0) addTag(tags, `${s.name} ❌`);
    });

    dayEl.addEventListener("click", async () => {
      // Toggle treino: null -> 1 -> 0 -> null
      const cur = checkinsMap[key];
      const next = (cur === undefined) ? 1 : (cur === 1 ? 0 : undefined);

      if (next === undefined) {
        // sem endpoint de delete; então setamos 0 (ou 1) e pronto
        await apiFetch("/checkin", { method: "POST", body: JSON.stringify({ date: key, did_train: 0 }) });
        checkinsMap[key] = 0;
      } else {
        await apiFetch("/checkin", { method: "POST", body: JSON.stringify({ date: key, did_train: next }) });
        checkinsMap[key] = next;
      }

      // re-render (simples)
      await loadCalendar();
      await loadDashboard();
    });

    calendarGrid.appendChild(dayEl);
  }
}

function addTag(container, text) {
  const t = document.createElement("span");
  t.className = "tag";
  t.textContent = text;
  container.appendChild(t);
}

async function loadSupplements() {
  const r = await apiFetch("/supplements");
  if (!r.ok) return [];
  return r.data || [];
}

function renderSuppList(list) {
  suppList.innerHTML = "";
  list.forEach(s => {
    const el = document.createElement("div");
    el.className = "chip";
    el.innerHTML = `<span>${s.name}</span><button title="remover">✕</button>`;
    el.querySelector("button").addEventListener("click", async () => {
      // se não existir endpoint de delete, só ignora (não vou inventar rota)
      alert("Remover suplemento ainda não implementado no backend.");
    });
    suppList.appendChild(el);
  });
}

btnAddSupp?.addEventListener("click", async () => {
  const name = (suppName.value || "").trim();
  if (!name) return;

  const r = await apiFetch("/supplements/add", {
    method: "POST",
    body: JSON.stringify({ name })
  });

  if (r.ok) {
    suppName.value = "";
    await loadCalendar();
    await loadDashboard();
  } else {
    alert(r.data?.detail || "Falha ao adicionar suplemento.");
  }
});

prevMonthBtn?.addEventListener("click", async () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  await loadCalendar();
});
nextMonthBtn?.addEventListener("click", async () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  await loadCalendar();
});

// Photos upload (se seu backend suportar)
btnUploadPhoto?.addEventListener("click", async () => {
  if (!photoFile.files || !photoFile.files[0]) return alert("Escolha uma imagem.");
  const file = photoFile.files[0];
  const note = (photoNote.value || "").trim();

  const fd = new FormData();
  fd.append("file", file);
  fd.append("note", note);

  const res = await fetch(`${API}/photos/upload`, {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: fd
  });

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch {}
    alert(data?.detail || "Falha ao enviar foto.");
    return;
  }

  photoFile.value = "";
  photoNote.value = "";
  await loadPhotos();
  await loadDashboard();
});

async function loadPhotos() {
  const r = await apiFetch("/photos");
  if (!r.ok) return;
  const list = r.data || [];
  photoGrid.innerHTML = "";
  list.forEach(p => {
    const el = document.createElement("div");
    el.className = "photo";
    el.innerHTML = `
      <img src="${p.url}" alt="foto" />
      <div class="meta">${p.date || ""}${p.note ? " • " + p.note : ""}</div>
    `;
    photoGrid.appendChild(el);
  });
  kpiPhotos.textContent = String(list.length);
}

btnSaveWorkout?.addEventListener("click", async () => {
  const title = (workoutTitle.value || "").trim();
  const text = (workoutText.value || "").trim();
  if (!title || !text) return alert("Preencha nome e conteúdo do treino.");

  const r = await apiFetch("/workouts/save", {
    method: "POST",
    body: JSON.stringify({ title, text })
  });

  if (!r.ok) return alert(r.data?.detail || "Falha ao salvar treino.");

  workoutTitle.value = "";
  workoutText.value = "";
  await loadWorkouts();
});

async function loadWorkouts() {
  const r = await apiFetch("/workouts");
  if (!r.ok) return;
  const list = r.data || [];
  workoutList.innerHTML = "";
  list.forEach(w => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<strong>${w.title}</strong><pre style="white-space:pre-wrap; margin:10px 0 0; color:rgba(255,255,255,.8)">${w.text}</pre>`;
    workoutList.appendChild(el);
  });
}

btnSaveProfile?.addEventListener("click", async () => {
  const height = Number(heightEl.value || 0);
  const weight = Number(weightEl.value || 0);
  const biotype = biotypeEl.value || "";

  const r = await apiFetch("/profile", {
    method: "POST",
    body: JSON.stringify({ height, weight, biotype })
  });

  if (!r.ok) return alert(r.data?.detail || "Falha ao salvar.");

  renderRecommendation({ height, weight, biotype });
  alert("Salvo ✅");
});

function renderRecommendation(p) {
  const height = Number(p.height || 0);
  const weight = Number(p.weight || 0);
  const biotype = (p.biotype || "").toLowerCase();

  if (!height || !weight || !biotype) {
    recommendationEl.textContent = "Preencha seus dados para gerar recomendações.";
    return;
  }

  const h = height / 100;
  const imc = weight / (h*h);

  let foco = "";
  if (imc < 18.5) foco = "Ganho de massa (superávit calórico + progressão de cargas).";
  else if (imc < 25) foco = "Recomposição (manter/leve superávit + treino consistente).";
  else foco = "Definição (déficit leve + treino pesado + cardio moderado).";

  let treino = "";
  if (biotype === "ectomorfo") treino = "Foque em básicos, poucas séries, cargas altas, descanso maior. 3–5x/sem.";
  else if (biotype === "mesomorfo") treino = "Boa resposta: volume moderado/alto, progressão semanal. 4–6x/sem.";
  else treino = "Priorize consistência, volume moderado, cardio leve e dieta bem controlada. 4–6x/sem.";

  recommendationEl.innerHTML = `
    <div>IMC estimado: <b>${imc.toFixed(1)}</b></div>
    <div style="margin-top:8px;"><b>Foco:</b> ${foco}</div>
    <div style="margin-top:8px;"><b>Treino:</b> ${treino}</div>
  `;
}

// Dashboard
async function loadDashboard() {
  // checkins do mês
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth() + 1;
  const r = await apiFetch(`/checkins?year=${y}&month=${m}`);
  if (r.ok) {
    const days = r.data || [];
    const trained = days.filter(d => d.did_train === 1).length;
    kpiWorkouts.textContent = String(trained);
  } else {
    kpiWorkouts.textContent = "—";
  }

  const supps = await loadSupplements();
  // contagem simples (se backend expõe /supp_checkins do mês)
  const r2 = await apiFetch(`/supp_checkins?year=${y}&month=${m}`);
  if (r2.ok) {
    const rows = r2.data || [];
    const taken = rows.filter(x => x.took === 1).length;
    kpiSupp.textContent = String(taken);
  } else {
    kpiSupp.textContent = "—";
  }

  // fotos em loadPhotos atualiza kpiPhotos
}

// Calendar load
async function loadCalendar() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth() + 1;

  const supplements = await loadSupplements();
  renderSuppList(supplements);

  const checkinsResp = await apiFetch(`/checkins?year=${y}&month=${m}`);
  const suppCheckResp = await apiFetch(`/supp_checkins?year=${y}&month=${m}`);

  const checkinsMap = {};
  if (checkinsResp.ok) {
    (checkinsResp.data || []).forEach(r => { checkinsMap[r.date] = r.did_train; });
  }

  const suppMap = {};
  if (suppCheckResp.ok) {
    (suppCheckResp.data || []).forEach(r => { suppMap[`${r.date}::${r.supplement_id}`] = r.took; });
  }

  renderCalendar(checkinsMap, suppMap, supplements);
}

// Navigation
navBtns.forEach(btn => {
  btn.addEventListener("click", async () => {
    const key = btn.dataset.view;
    setActiveNav(key);

    if (key === "dashboard") {
      await loadDashboard();
      await loadPhotos();
    }
    if (key === "calendar") {
      await loadCalendar();
    }
    if (key === "photos") {
      await loadPhotos();
    }
    if (key === "workouts") {
      await loadWorkouts();
    }
    if (key === "stats") {
      // tenta carregar profile
      const r = await apiFetch("/profile");
      if (r.ok) {
        const p = r.data || {};
        heightEl.value = p.height || "";
        weightEl.value = p.weight || "";
        biotypeEl.value = p.biotype || "";
        renderRecommendation(p);
      }
    }
  });
});

// =========================
// Boot
// =========================
async function boot() {
  if (!token) {
    showAuth();
    monthLabel.textContent = monthStr(currentMonth);
    return;
  }

  const r = await apiFetch("/me");
  if (!r.ok) {
    // token inválido/expirado
    doLogout();
    return;
  }

  me = r.data;
  showApp();

  setActiveNav("dashboard");
  monthLabel.textContent = monthStr(currentMonth);

  await loadDashboard();
  await loadCalendar();
  await loadPhotos();
  await loadWorkouts();

  // tenta profile
  const p = await apiFetch("/profile");
  if (p.ok) renderRecommendation(p.data || {});
}

boot();
