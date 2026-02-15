/* ============================================================
   Gym Tracker - app.js (FULL / VERBOSE)
   - Auth (register/login/logout) + token persist
   - Navegação por views
   - Calendário mensal (treino + suplementos por dia)
   - Lista de suplementos
   - Fotos do físico (upload + list)
   - Treinos (salvar + listar + ver)
   - Perfil/Estatísticas (altura/peso/biotipo + recomendação)
   - UI status + sidebar show/hide (setStatus)
============================================================ */


/* ============================================================
   0) CONFIGURAÇÃO
============================================================ */

const API_BASE = "https://zeraty-gym.onrender.com"; // backend (Render)

const STORAGE = {
  token: "gymtracker_token",
  month: "gymtracker_month_cursor", // YYYY-MM
};

const UI = {
  busyClass: "is-busy",
};


/* ============================================================
   1) HELPERS DE DOM / UTIL
============================================================ */

// helper de getElementById
function $(id) {
  return document.getElementById(id);
}

// helper para querySelector
function qs(sel, root = document) {
  return root.querySelector(sel);
}

// helper para querySelectorAll
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// cria elemento
function el(tag, className = "", text = "") {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null && text !== "") e.textContent = text;
  return e;
}

// limpa elemento
function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

// formatar data YYYY-MM-DD
function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymd(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

// mês cursor YYYY-MM
function ym(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  return `${y}-${m}`;
}

// parse YYYY-MM
function parseYM(str) {
  const [y, m] = (str || "").split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1);
}

// texto do mês pt-BR
function monthLabelPt(date) {
  try {
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return `${date.getMonth() + 1}/${date.getFullYear()}`;
  }
}

// debounce simples
function debounce(fn, ms = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// trava de clique (previne double request)
function onceBusy(btn, promiseFn) {
  if (!btn) return promiseFn();
  if (btn.dataset.busy === "1") return; // ignore
  btn.dataset.busy = "1";
  btn.disabled = true;

  const end = () => {
    btn.dataset.busy = "0";
    btn.disabled = false;
  };

  try {
    const p = promiseFn();
    Promise.resolve(p).finally(end);
    return p;
  } catch (e) {
    end();
    throw e;
  }
}

// toast simples (usa #authMsg se existir, senão console)
function showMsg(text, type = "info") {
  const msg = $("authMsg") || $("msg");
  if (msg) {
    msg.textContent = text || "";
    msg.classList.remove("ok", "err");
    if (type === "ok") msg.classList.add("ok");
    if (type === "err") msg.classList.add("err");
  } else {
    if (type === "err") console.error(text);
    else console.log(text);
  }
}


/* ============================================================
   2) STATUS UI (SUA FUNÇÃO, DO JEITO QUE VOCÊ MANDOU)
============================================================ */

function setStatus(on) {
  const dot = $("statusDot");
  const pill = $("statusPill");
  const txt = $("statusText");

  if (dot) {
    dot.classList.toggle("on", !!on);
    dot.classList.toggle("off", !on);
  }
  if (txt) txt.textContent = on ? "Conectado" : "Desconectado";

  // sidebar aparece só quando logado
  const sb = $("sidebar");
  if (sb) {
    if (on) sb.classList.remove("hidden");
    else sb.classList.add("hidden");
  }
}


/* ============================================================
   3) TOKEN / AUTH STORAGE
============================================================ */

function getToken() {
  return localStorage.getItem(STORAGE.token) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(STORAGE.token, token);
  else localStorage.removeItem(STORAGE.token);
}

function isLogged() {
  return !!getToken();
}


/* ============================================================
   4) FETCH WRAPPER (API)
============================================================ */

async function apiFetch(path, opts = {}) {
  const url = API_BASE + path;

  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const config = Object.assign({}, opts, { headers });

  const res = await fetch(url, config);

  // tenta ler json, se falhar, lê texto
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    const t = await res.text().catch(() => "");
    data = t ? { detail: t } : null;
  }

  if (!res.ok) {
    // padroniza erro
    const msg =
      (data && (data.detail || data.message)) ||
      `Erro HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function apiGet(path) {
  return apiFetch(path, { method: "GET" });
}

async function apiPost(path, body) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body || {}) });
}

// upload multipart (fotos)
async function apiUpload(path, formData) {
  const url = API_BASE + path;

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else data = { detail: await res.text().catch(() => "") };

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      `Erro HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}


/* ============================================================
   5) ESTADO GLOBAL DO APP
============================================================ */

const state = {
  me: null,

  // mês atual (Date do primeiro dia)
  monthCursor: null,

  // suplementos cadastrados (array de {id, name})
  supplements: [],

  // checkins do mês (map date-> { trained: bool, supp: {suppId: bool} })
  checkins: {},

  // treinos do usuário
  workouts: [],

  // fotos
  photos: [],

  // view atual
  view: "dashboard",
};


/* ============================================================
   6) VIEW / NAVEGAÇÃO
============================================================ */

function setView(viewName) {
  state.view = viewName;

  // ativa botão
  qsa(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === viewName);
  });

  // views
  const map = {
    dashboard: "dashboardView",
    calendar: "calendarView",
    photos: "photosView",
    workouts: "workoutsView",
    stats: "statsView",
  };

  Object.values(map).forEach((id) => {
    const node = $(id);
    if (node) node.classList.add("hidden");
  });

  const toShow = map[viewName];
  if (toShow && $(toShow)) $(toShow).classList.remove("hidden");

  // títulos
  const title = $("viewTitle");
  const desc = $("viewDesc");

  if (title && desc) {
    if (viewName === "dashboard") {
      title.textContent = "Dashboard";
      desc.textContent = "Resumo do mês e atalhos.";
    } else if (viewName === "calendar") {
      title.textContent = "Calendário";
      desc.textContent = "Marque treinos e suplementos por dia.";
    } else if (viewName === "photos") {
      title.textContent = "Físico (Fotos)";
      desc.textContent = "Envie fotos e acompanhe sua evolução.";
    } else if (viewName === "workouts") {
      title.textContent = "Meu Treino";
      desc.textContent = "Crie e salve seus treinos.";
    } else if (viewName === "stats") {
      title.textContent = "Estatísticas Gerais";
      desc.textContent = "Altura, peso, biotipo e recomendação automática.";
    }
  }

  // renderizações específicas
  if (viewName === "calendar") renderCalendar();
  if (viewName === "dashboard") renderDashboard();
  if (viewName === "photos") renderPhotos();
  if (viewName === "workouts") renderWorkouts();
  if (viewName === "stats") renderRecommendation();
}

function bindNavButtons() {
  qsa(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
}


/* ============================================================
   7) AUTH (REGISTER / LOGIN / LOGOUT)
============================================================ */

async function doRegister() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();

  if (!email || !password) {
    showMsg("Preencha email e senha.", "err");
    return;
  }

  // backend espera JSON: {email, password}
  try {
    showMsg("Criando conta...", "info");
    await apiPost("/api/register", { email, password });
    showMsg("Conta criada! Agora faça login.", "ok");
  } catch (e) {
    showMsg(e.message || "Erro ao criar conta.", "err");
  }
}

async function doLogin() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();

  if (!email || !password) {
    showMsg("Preencha email e senha.", "err");
    return;
  }

  try {
    showMsg("Entrando...", "info");
    const data = await apiPost("/api/login", { email, password });

    // padrão: {access_token: "..."}
    const token = data?.access_token || data?.token;
    if (!token) {
      showMsg("Login retornou sem token. Verifique o backend.", "err");
      return;
    }

    setToken(token);
    showMsg("Logado com sucesso!", "ok");

    await bootstrapAfterLogin();
  } catch (e) {
    showMsg(e.message || "Login inválido.", "err");
    setStatus(false);
    showAuthOnly();
  }
}

function doLogout() {
  setToken("");
  state.me = null;
  state.supplements = [];
  state.checkins = {};
  state.workouts = [];
  state.photos = [];
  setStatus(false);
  showAuthOnly();
  showMsg("Você saiu.", "info");
}

async function apiMe() {
  return apiGet("/api/me");
}


/* ============================================================
   8) UI: MOSTRAR AUTH VS APP
============================================================ */

function showAuthOnly() {
  const auth = $("authView");
  const app = $("appView");
  if (auth) auth.classList.remove("hidden");
  if (app) app.classList.add("hidden");
  setStatus(false);
}

function showAppOnly() {
  const auth = $("authView");
  const app = $("appView");
  if (auth) auth.classList.add("hidden");
  if (app) app.classList.remove("hidden");
  setStatus(true);
}


/* ============================================================
   9) BOOTSTRAP APÓS LOGIN
============================================================ */

async function bootstrapAfterLogin() {
  // valida token
  state.me = await apiMe();

  // define mês
  initMonthCursor();

  // carrega tudo necessário
  await Promise.all([
    loadSupplements(),
    loadMonthCheckins(),
    loadWorkouts(),
    loadPhotos(),
    loadProfile(),
  ]);

  // render
  showAppOnly();
  updateMonthLabels();
  setView(state.view || "dashboard");
}


/* ============================================================
   10) MÊS (cursor) + botões prev/next
============================================================ */

function initMonthCursor() {
  // tenta recuperar do storage
  const saved = localStorage.getItem(STORAGE.month);
  const parsed = parseYM(saved);
  if (parsed) {
    state.monthCursor = parsed;
    return;
  }

  // default: mês atual
  const now = new Date();
  state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
}

function saveMonthCursor() {
  if (!state.monthCursor) return;
  localStorage.setItem(STORAGE.month, ym(state.monthCursor));
}

function moveMonth(delta) {
  if (!state.monthCursor) initMonthCursor();
  const d = new Date(state.monthCursor);
  d.setMonth(d.getMonth() + delta);
  d.setDate(1);
  state.monthCursor = d;
  saveMonthCursor();
  updateMonthLabels();
  // recarrega checkins do mês
  loadMonthCheckins().then(() => {
    renderCalendar();
    renderDashboard();
  });
}

function updateMonthLabels() {
  const label = $("calendarMonth");
  const label2 = $("monthLabel");
  const text = monthLabelPt(state.monthCursor || new Date());

  if (label) label.textContent = text;
  if (label2) label2.textContent = text;
}


/* ============================================================
   11) SUPLEMENTOS
============================================================ */

async function loadSupplements() {
  try {
    const list = await apiGet("/api/supplements");
    state.supplements = Array.isArray(list) ? list : (list?.items || []);
  } catch (e) {
    // se der erro, não derruba o app
    console.warn("loadSupplements error:", e);
    state.supplements = [];
  }
  renderSuppList();
}

async function addSupplement() {
  const name = ($("suppName")?.value || "").trim();
  if (!name) {
    showMsg("Digite um nome de suplemento.", "err");
    return;
  }

  try {
    await apiPost("/api/supplements/add", { name });
    $("suppName").value = "";
    await loadSupplements();
    await loadMonthCheckins();
    renderCalendar();
    renderDashboard();
    showMsg("Suplemento adicionado.", "ok");
  } catch (e) {
    showMsg(e.message || "Erro ao adicionar suplemento.", "err");
  }
}

async function removeSupplement(id) {
  // se seu backend não tiver delete, a gente só desabilita no front
  // (mas vou tentar um endpoint comum)
  try {
    await apiPost("/api/supplements/remove", { id });
    await loadSupplements();
    await loadMonthCheckins();
    renderCalendar();
    renderDashboard();
  } catch (e) {
    // fallback: remove só do front
    state.supplements = state.supplements.filter((s) => s.id !== id);
    renderSuppList();
    showMsg("Seu backend não tem /remove (removi só do front).", "err");
  }
}

function renderSuppList() {
  const wrap = $("suppList");
  if (!wrap) return;

  clear(wrap);

  if (!state.supplements.length) {
    wrap.appendChild(el("div", "muted", "Nenhum suplemento cadastrado ainda."));
    return;
  }

  state.supplements.forEach((s) => {
    const chip = el("div", "chip");
    const name = el("span", "", s.name || s.title || "Suplemento");
    const x = el("button", "chip-x", "×");
    x.title = "Remover (se o backend suportar)";
    x.addEventListener("click", () => removeSupplement(s.id));

    chip.appendChild(name);
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}


/* ============================================================
   12) CHECKINS DO MÊS (TREINO + SUP)
============================================================ */

async function loadMonthCheckins() {
  const base = state.monthCursor || new Date();
  const y = base.getFullYear();
  const m = base.getMonth() + 1;

  try {
    const data = await apiGet(`/api/checkins?year=${y}&month=${m}`);
    // esperado: { "2026-02-14": { trained: true, supp: {"1": true} } }
    state.checkins = data || {};
  } catch (e) {
    console.warn("loadMonthCheckins error:", e);
    state.checkins = {};
  }
}

function getDayState(dateStr) {
  if (!state.checkins[dateStr]) {
    state.checkins[dateStr] = { trained: false, supp: {} };
  }
  if (!state.checkins[dateStr].supp) state.checkins[dateStr].supp = {};
  return state.checkins[dateStr];
}

async function toggleTrained(dateStr) {
  const st = getDayState(dateStr);
  const next = !st.trained;

  try {
    await apiPost("/api/checkin", { date: dateStr, trained: next });
    st.trained = next;
    renderCalendar();
    renderDashboard();
  } catch (e) {
    showMsg(e.message || "Erro ao marcar treino.", "err");
  }
}

async function toggleSupp(dateStr, suppId) {
  const st = getDayState(dateStr);
  const cur = !!st.supp[String(suppId)];
  const next = !cur;

  try {
    await apiPost("/api/supp_checkin", {
      date: dateStr,
      supplement_id: suppId,
      taken: next,
    });

    st.supp[String(suppId)] = next;
    renderCalendar();
    renderDashboard();
  } catch (e) {
    showMsg(e.message || "Erro ao marcar suplemento.", "err");
  }
}


/* ============================================================
   13) CALENDÁRIO UI
============================================================ */

function daysInMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return d.getDate();
}

function firstWeekday(date) {
  // 0=domingo, 1=seg...
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.getDay();
}

function isToday(dateObj) {
  const n = new Date();
  return (
    dateObj.getFullYear() === n.getFullYear() &&
    dateObj.getMonth() === n.getMonth() &&
    dateObj.getDate() === n.getDate()
  );
}

function renderCalendar() {
  const grid = $("calendarGrid");
  if (!grid) return;

  clear(grid);

  const base = state.monthCursor || new Date();
  const total = daysInMonth(base);
  const startDow = firstWeekday(base);

  // espaços vazios antes do 1º dia
  for (let i = 0; i < startDow; i++) {
    const empty = el("div", "day empty");
    empty.innerHTML = "&nbsp;";
    grid.appendChild(empty);
  }

  // dias
  for (let d = 1; d <= total; d++) {
    const dateObj = new Date(base.getFullYear(), base.getMonth(), d);
    const dateStr = ymd(dateObj);

    const card = el("div", "day");
    if (isToday(dateObj)) card.classList.add("today");

    const top = el("div", "day-top");
    const num = el("div", "day-num", String(d));
    const badge = el("div", "day-badge", "");
    top.appendChild(num);
    top.appendChild(badge);

    const bottom = el("div", "day-bottom");

    const st = getDayState(dateStr);

    // resumo: treino ✅/❌
    const treinoTxt = st.trained ? "Treino ✅" : "Treino ❌";

    // suplementos: conta quantos ✅ no dia
    let takenCount = 0;
    const suppKeys = Object.keys(st.supp || {});
    suppKeys.forEach((k) => {
      if (st.supp[k]) takenCount++;
    });

    const suppTxt = state.supplements.length
      ? `Suplementos ✅ ${takenCount}/${state.supplements.length}`
      : "Sem suplementos";

    bottom.innerHTML = `<div>${treinoTxt}</div><div>${suppTxt}</div>`;

    card.appendChild(top);
    card.appendChild(bottom);

    // clique abre "modal" simples via confirm/choose
    card.addEventListener("click", () => openDayEditor(dateStr));

    grid.appendChild(card);
  }
}

function openDayEditor(dateStr) {
  // editor simples (sem modal pesado):
  // 1) toggle treino via confirm
  const st = getDayState(dateStr);
  const wantToggleTrain = confirm(
    `Dia ${dateStr}\n\nTreino está: ${st.trained ? "✅" : "❌"}\n\nOK = Alternar Treino\nCancelar = Continuar`
  );

  if (wantToggleTrain) {
    toggleTrained(dateStr);
    return;
  }

  // suplementos (se houver)
  if (!state.supplements.length) return;

  // escolhe suplemento por prompt (simples e funcional)
  let menu = `Dia ${dateStr}\n\nEscolha um suplemento para alternar:\n`;
  state.supplements.forEach((s, idx) => {
    const taken = !!st.supp[String(s.id)];
    menu += `${idx + 1}) ${s.name}  [${taken ? "✅" : "❌"}]\n`;
  });

  const ans = prompt(menu + "\nDigite o número (ou deixe vazio):");
  const n = Number(ans);
  if (!n || n < 1 || n > state.supplements.length) return;

  const chosen = state.supplements[n - 1];
  toggleSupp(dateStr, chosen.id);
}


/* ============================================================
   14) DASHBOARD
============================================================ */

function renderDashboard() {
  // KPIs
  const kpiWorkouts = $("kpiWorkouts");
  const kpiSupp = $("kpiSupp");
  const kpiPhotos = $("kpiPhotos");

  // contar treinos do mês
  let treinoCount = 0;

  // contar suplementos ✅ do mês
  let suppTaken = 0;

  Object.keys(state.checkins || {}).forEach((dateStr) => {
    const st = state.checkins[dateStr];
    if (st?.trained) treinoCount++;
    const supp = st?.supp || {};
    Object.keys(supp).forEach((k) => {
      if (supp[k]) suppTaken++;
    });
  });

  if (kpiWorkouts) kpiWorkouts.textContent = String(treinoCount);
  if (kpiSupp) kpiSupp.textContent = String(suppTaken);
  if (kpiPhotos) kpiPhotos.textContent = String(state.photos?.length || 0);

  // suplement list chips
  renderSuppList();
}


/* ============================================================
   15) WORKOUTS (TREINOS)
============================================================ */

async function loadWorkouts() {
  try {
    const data = await apiGet("/api/workouts");
    state.workouts = Array.isArray(data) ? data : (data?.items || []);
  } catch (e) {
    console.warn("loadWorkouts error:", e);
    state.workouts = [];
  }
  renderWorkouts();
}

async function saveWorkout() {
  const title = ($("workoutTitle")?.value || "").trim();
  const text = ($("workoutText")?.value || "").trim();

  if (!title || !text) {
    showMsg("Preencha nome e treino.", "err");
    return;
  }

  try {
    await apiPost("/api/workouts/save", { title, text });
    $("workoutTitle").value = "";
    $("workoutText").value = "";
    await loadWorkouts();
    showMsg("Treino salvo!", "ok");
  } catch (e) {
    showMsg(e.message || "Erro ao salvar treino.", "err");
  }
}

function renderWorkouts() {
  const wrap = $("workoutList");
  if (!wrap) return;

  clear(wrap);

  if (!state.workouts.length) {
    wrap.appendChild(el("div", "muted", "Nenhum treino salvo ainda."));
    return;
  }

  state.workouts.forEach((w) => {
    const card = el("div", "item");

    const head = el("div", "item-head");
    const title = el("div", "item-title", w.title || "Treino");
    const btn = el("button", "btn btn-sm ghost", "Ver");
    head.appendChild(title);
    head.appendChild(btn);

    const body = el("pre", "item-body");
    body.textContent = "";
    body.classList.add("hidden");

    btn.addEventListener("click", () => {
      body.classList.toggle("hidden");
      if (!body.textContent) body.textContent = w.text || "";
      btn.textContent = body.classList.contains("hidden") ? "Ver" : "Fechar";
    });

    card.appendChild(head);
    card.appendChild(body);

    wrap.appendChild(card);
  });
}


/* ============================================================
   16) PHOTOS (FÍSICO)
============================================================ */

async function loadPhotos() {
  try {
    const data = await apiGet("/api/photos");
    state.photos = Array.isArray(data) ? data : (data?.items || []);
  } catch (e) {
    console.warn("loadPhotos error:", e);
    state.photos = [];
  }
  renderPhotos();
}

async function uploadPhoto() {
  const fileInput = $("photoFile");
  const noteInput = $("photoNote");

  const file = fileInput?.files?.[0];
  const note = (noteInput?.value || "").trim();

  if (!file) {
    showMsg("Selecione uma imagem.", "err");
    return;
  }

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", note);

    await apiUpload("/api/photos/upload", fd);

    // reset
    fileInput.value = "";
    if (noteInput) noteInput.value = "";

    await loadPhotos();
    renderDashboard();
    showMsg("Foto enviada!", "ok");
  } catch (e) {
    showMsg(e.message || "Erro ao enviar foto.", "err");
  }
}

function renderPhotos() {
  const grid = $("photoGrid");
  if (!grid) return;

  clear(grid);

  if (!state.photos.length) {
    grid.appendChild(el("div", "muted", "Nenhuma foto enviada ainda."));
    return;
  }

  state.photos.forEach((p) => {
    const card = el("div", "photo-card");

    const imgWrap = el("div", "photo-img");
    const img = document.createElement("img");

    // esperado: p.url ou endpoint /api/photos/{id}
    img.src = p.url || `${API_BASE}/api/photos/${p.id}`;
    img.alt = p.note || "Foto";

    imgWrap.appendChild(img);

    const meta = el("div", "photo-meta");
    const dateTxt = p.created_at ? String(p.created_at).slice(0, 10) : "";
    meta.innerHTML = `<div><b>${dateTxt}</b></div><div class="muted">${p.note || ""}</div>`;

    card.appendChild(imgWrap);
    card.appendChild(meta);
    grid.appendChild(card);
  });
}


/* ============================================================
   17) PROFILE / STATS + RECOMENDAÇÃO
============================================================ */

async function loadProfile() {
  try {
    const data = await apiGet("/api/profile");
    // esperado: {height_cm, weight_kg, biotype}
    if (data) {
      if ($("height")) $("height").value = data.height_cm ?? "";
      if ($("weight")) $("weight").value = data.weight_kg ?? "";
      if ($("biotype")) $("biotype").value = data.biotype ?? "";
    }
  } catch (e) {
    // ok se não existir ainda
  }
  renderRecommendation();
}

async function saveProfile() {
  const height = Number(($("height")?.value || "").trim());
  const weight = Number(($("weight")?.value || "").trim());
  const biotype = ($("biotype")?.value || "").trim();

  if (!height || !weight || !biotype) {
    showMsg("Preencha altura, peso e biotipo.", "err");
    return;
  }

  try {
    await apiPost("/api/profile", {
      height_cm: height,
      weight_kg: weight,
      biotype: biotype,
    });
    showMsg("Dados salvos!", "ok");
    renderRecommendation();
  } catch (e) {
    showMsg(e.message || "Erro ao salvar perfil.", "err");
  }
}

function renderRecommendation() {
  const out = $("recommendation");
  if (!out) return;

  const height = Number(($("height")?.value || "").trim());
  const weight = Number(($("weight")?.value || "").trim());
  const biotype = ($("biotype")?.value || "").trim();

  if (!height || !weight || !biotype) {
    out.textContent = "Preencha seus dados para gerar.";
    return;
  }

  // IMC
  const hM = height / 100;
  const bmi = weight / (hM * hM);

  // sugestão por biotipo (heurística simples)
  let focus = "";
  let freq = "";
  let cardio = "";
  let volume = "";

  if (biotype === "ectomorfo") {
    focus = "Hipertrofia com progressão de carga e superávit calórico.";
    freq = "4–5x/semana";
    cardio = "Baixo (1–2x leve) para não atrapalhar ganho de massa.";
    volume = "Volume moderado/alto, descanso 90–150s em compostos.";
  } else if (biotype === "mesomorfo") {
    focus = "Hipertrofia + força (periodização).";
    freq = "4–6x/semana";
    cardio = "Moderado (2–3x) para condicionamento.";
    volume = "Volume moderado, foco em execução perfeita e progressão.";
  } else if (biotype === "endomorfo") {
    focus = "Recomposição: força/hipertrofia + controle calórico.";
    freq = "4–6x/semana";
    cardio = "Moderado/alto (3–5x) conforme recuperação.";
    volume = "Volume moderado, densidade (descanso menor) + passos diários.";
  }

  const bmiClass =
    bmi < 18.5 ? "Abaixo do peso" :
    bmi < 25 ? "Peso normal" :
    bmi < 30 ? "Sobrepeso" :
    "Obesidade";

  out.textContent =
`📌 Estatística automática

Altura: ${height} cm
Peso: ${weight} kg
IMC: ${bmi.toFixed(1)} (${bmiClass})
Biotipo: ${biotype}

🎯 Foco recomendado:
- ${focus}

📅 Frequência:
- ${freq}

🏃 Cardio:
- ${cardio}

🏋️ Volume/descanso:
- ${volume}

✅ Observação:
- Isso é uma recomendação geral (não substitui profissional). Ajuste conforme recuperação e objetivo.`;
}


/* ============================================================
   18) BIND DE BOTÕES (evitar handlers duplicados)
============================================================ */

function bindAuthButtons() {
  const bLogin = $("btnLogin");
  const bReg = $("btnRegister");

  if (bLogin) {
    bLogin.addEventListener("click", () => {
      onceBusy(bLogin, doLogin);
    });
  }

  if (bReg) {
    bReg.addEventListener("click", () => {
      onceBusy(bReg, doRegister);
    });
  }
}

function bindMonthButtons() {
  const prev = $("prevMonth");
  const next = $("nextMonth");

  if (prev) prev.addEventListener("click", () => moveMonth(-1));
  if (next) next.addEventListener("click", () => moveMonth(+1));
}

function bindSupplementButtons() {
  const btn = $("btnAddSupp");
  if (btn) {
    btn.addEventListener("click", () => onceBusy(btn, addSupplement));
  }
}

function bindWorkoutButtons() {
  const btn = $("btnSaveWorkout");
  if (btn) {
    btn.addEventListener("click", () => onceBusy(btn, saveWorkout));
  }
}

function bindPhotoButtons() {
  const btn = $("btnUploadPhoto");
  if (btn) {
    btn.addEventListener("click", () => onceBusy(btn, uploadPhoto));
  }
}

function bindProfileButtons() {
  const btn = $("btnSaveProfile");
  if (btn) {
    btn.addEventListener("click", () => onceBusy(btn, saveProfile));
  }

  const live = debounce(renderRecommendation, 180);
  if ($("height")) $("height").addEventListener("input", live);
  if ($("weight")) $("weight").addEventListener("input", live);
  if ($("biotype")) $("biotype").addEventListener("change", live);
}

function bindLogout() {
  const btn = $("btnLogout");
  if (btn) btn.addEventListener("click", doLogout);
}


/* ============================================================
   19) INIT (quando carrega a página)
============================================================ */

async function initApp() {
  // bind geral
  bindNavButtons();
  bindAuthButtons();
  bindMonthButtons();
  bindSupplementButtons();
  bindWorkoutButtons();
  bindPhotoButtons();
  bindProfileButtons();
  bindLogout();

  // mês
  initMonthCursor();
  updateMonthLabels();

  // se tem token, tenta logar silencioso
  if (getToken()) {
    try {
      await bootstrapAfterLogin();
      return;
    } catch (e) {
      console.warn("Silent login failed:", e);
      setToken("");
      showAuthOnly();
      showMsg("Faça login novamente.", "err");
      return;
    }
  }

  // sem token
  showAuthOnly();
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});


/* ============================================================
   FIM DO ARQUIVO
============================================================ */
