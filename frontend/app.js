const API = "https://zeraty-gym.onrender.com";
let token = localStorage.getItem("gym_token") || "";
let currentMonth = new Date().toISOString().slice(0,7);
let supplements = [];
let workoutDraft = {}; // {A:[{ex,series,reps,rest}], ...}

const $ = (id) => document.getElementById(id);

function setAuthUI(isAuthed){
  $("authBox").style.display = isAuthed ? "none" : "block";
  document.querySelectorAll(".tab").forEach(t => t.style.display = isAuthed ? "block" : "none");
  $("btnLogout").style.display = isAuthed ? "inline-flex" : "none";
}

function headers(){
  return token ? { "Authorization": "Bearer " + token } : {};
}

async function postForm(url, data){
  const fd = new FormData();
  Object.entries(data).forEach(([k,v]) => fd.append(k, v));
  const res = await fetch(url, { method:"POST", body: fd, headers: headers() });
  const j = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(j.detail || "Erro");
  return j;
}

async function getJSON(url){
  const res = await fetch(url, { headers: headers() });
  const j = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(j.detail || "Erro");
  return j;
}

function showTab(tabId){
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  $(tabId).classList.remove("hidden");
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click", ()=> showTab(btn.dataset.tab));
});

$("btnLogout").onclick = ()=>{
  token = "";
  localStorage.removeItem("gym_token");
  setAuthUI(false);
};

// Auth
$("btnLogin").onclick = async ()=>{
  $("authMsg").textContent = "";
  try{
    const j = await postForm(API + "/login", { email: $("email").value, password: $("password").value });
    token = j.token;
    localStorage.setItem("gym_token", token);
    await boot();
  }catch(e){ $("authMsg").textContent = e.message; }
};

$("btnRegister").onclick = async ()=>{
  $("authMsg").textContent = "";
  try{
    const j = await postForm(API + "/register", { email: $("email").value, password: $("password").value });
    token = j.token;
    localStorage.setItem("gym_token", token);
    await boot();
  }catch(e){ $("authMsg").textContent = e.message; }
};

// Month picker
$("monthPicker").value = currentMonth;
$("monthPicker").onchange = async ()=>{
  currentMonth = $("monthPicker").value;
  $("miniMonth").textContent = currentMonth;
  await refreshAll();
};

// Supplements
$("btnAddSupp").onclick = async ()=>{
  try{
    await postForm(API + "/supplements/add", { name: $("suppName").value });
    $("suppName").value = "";
    await loadSupplements();
    await loadCalendar();
    await refreshDashboard(true);
  }catch(e){ alert(e.message); }
};

// --- Workout builder ---
function renderBuilder(){
  const box = $("builderPreview");
  box.innerHTML = "";

  const keys = Object.keys(workoutDraft);
  if(!keys.length){
    box.innerHTML = `<div class="list-item"><span>Nenhum exercício ainda.</span></div>`;
    return;
  }

  for(const day of ["A","B","C","D","E"]){
    if(!workoutDraft[day]?.length) continue;

    const header = document.createElement("div");
    header.className = "list-item";
    header.innerHTML = `<span><b>Treino ${day}</b></span><span class="pill">${workoutDraft[day].length} ex</span>`;
    box.appendChild(header);

    workoutDraft[day].forEach((it, idx)=>{
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <span>${it.ex} <span class="muted">— ${it.series}x ${it.reps} • ${it.rest}s</span></span>
        <button class="btn ghost" data-day="${day}" data-idx="${idx}">Remover</button>
      `;
      row.querySelector("button").onclick = (e)=>{
        const d = e.target.dataset.day;
        const i = Number(e.target.dataset.idx);
        workoutDraft[d].splice(i,1);
        if(workoutDraft[d].length === 0) delete workoutDraft[d];
        renderBuilder();
      };
      box.appendChild(row);
    });
  }
}

$("btnAddExercise").onclick = ()=>{
  const day = $("dayKey").value;
  const ex = ($("exName").value || "").trim();
  const series = Number($("exSets").value || 3);
  const reps = ($("exReps").value || "8-12").trim();
  const rest = Number($("exRest").value || 90);
  if(!ex) return;

  workoutDraft[day] = workoutDraft[day] || [];
  workoutDraft[day].push({ ex, series, reps, rest });
  $("exName").value = "";
  renderBuilder();
};

$("btnClearWorkout").onclick = ()=>{
  workoutDraft = {};
  renderBuilder();
};

$("btnSaveWorkout").onclick = async ()=>{
  $("workMsg").textContent = "";
  try{
    if(!Object.keys(workoutDraft).length) return $("workMsg").textContent = "Adicione pelo menos 1 exercício.";

    await postForm(API + "/workouts/save", {
      title: $("workTitle").value || "Meu treino",
      split: $("workSplit").value || "—",
      data_json: JSON.stringify(workoutDraft)
    });

    $("workMsg").textContent = "Treino salvo ✅";
    workoutDraft = {};
    renderBuilder();
    await loadWorkouts();
  }catch(e){ $("workMsg").textContent = e.message; }
};

// Stats
$("btnSaveProfile").onclick = async ()=>{
  $("statsMsg").textContent = "";
  try{
    const j = await postForm(API + "/profile", {
      height_cm: $("heightCm").value,
      weight_kg: $("weightKg").value,
      biotype: $("biotype").value,
      goal: $("goal").value
    });

    const bmi = j.bmi ? j.bmi.toFixed(1) : "—";
    const r = j.recommendation;

    $("statsOut").textContent =
`IMC (aprox): ${bmi}

Treino recomendado:
- ${r.treino}

Repetições:
- ${r.repeticoes}

Cardio:
- ${r.cardio}

Nota biotipo:
- ${r.nota_biotipo}
`;
    $("statsMsg").textContent = "Gerado ✅";
  }catch(e){ $("statsMsg").textContent = e.message; }
};

// Photos (protegidas via blob)
async function fetchImgObjectUrl(filename){
  const res = await fetch(`${API}/photos/file/${encodeURIComponent(filename)}`, { headers: headers() });
  if(!res.ok) throw new Error("Falha ao carregar foto");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

$("btnUploadPhoto").onclick = async ()=>{
  $("photoMsg").textContent = "";
  const file = $("photoFile").files[0];
  if(!file) return $("photoMsg").textContent = "Selecione uma imagem.";
  const day = $("photoDay").value || new Date().toISOString().slice(0,10);

  const fd = new FormData();
  fd.append("taken_day", day);
  fd.append("note", $("photoNote").value || "");
  fd.append("file", file);

  const res = await fetch(API + "/photos/upload", { method:"POST", body: fd, headers: headers() });
  const j = await res.json().catch(()=> ({}));
  if(!res.ok) return $("photoMsg").textContent = (j.detail || "Erro ao enviar");

  $("photoMsg").textContent = "Foto salva ✅";
  $("photoFile").value = "";
  await loadPhotos();
  await refreshDashboard(true);
};

// Calendar helpers
function daysInMonth(ym){
  const [y,m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function mkSwitch(on, cb){
  const el = document.createElement("div");
  el.className = "switch" + (on ? " on" : "");
  el.onclick = ()=> {
    el.classList.toggle("on");
    cb(el.classList.contains("on"));
  };
  return el;
}

async function loadSupplements(){
  const j = await getJSON(API + "/supplements");
  supplements = j.items || [];
}

async function loadCalendar(){
  $("calendarGrid").innerHTML = "";
  const max = daysInMonth(currentMonth);
  const data = await getJSON(API + "/checkins?month=" + currentMonth);

  for(let d=1; d<=max; d++){
    const dayStr = `${currentMonth}-${String(d).padStart(2,"0")}`;
    const card = document.createElement("div");
    card.className = "day";

    const head = document.createElement("div");
    head.className = "dhead";
    head.innerHTML = `<span>Dia</span><span>${d}</span>`;
    card.appendChild(head);

    const toggles = document.createElement("div");
    toggles.className = "toggles";

    // Treino
    const trainedOn = (data.trained?.[dayStr] || 0) === 1;
    const t = document.createElement("div");
    t.className = "toggle";
    t.innerHTML = `<span>Treinou?</span>`;
    t.appendChild(mkSwitch(trainedOn, async (val)=>{
      await postForm(API + "/checkin", { day: dayStr, trained: val ? 1 : 0 });
      await refreshDashboard(true);
    }));
    toggles.appendChild(t);

    // Suplementos
    for(const s of supplements){
      const took = (data.supp || []).find(x => x.day===dayStr && x.name===s)?.took === 1;
      const row = document.createElement("div");
      row.className = "toggle";
      row.innerHTML = `<span>Tomou ${s}?</span>`;
      row.appendChild(mkSwitch(!!took, async (val)=>{
        await postForm(API + "/supp_checkin", { day: dayStr, supplement_name: s, took: val ? 1 : 0 });
        await refreshDashboard(true);
      }));
      toggles.appendChild(row);
    }

    card.appendChild(toggles);
    $("calendarGrid").appendChild(card);
  }
}

function renderMonthLines(trainedMap, suppList){
  const max = daysInMonth(currentMonth);
  const lines = [];

  lines.push({
    title:"Treinou?",
    marks: Array.from({length:max}, (_,i)=>{
      const dayStr = `${currentMonth}-${String(i+1).padStart(2,"0")}`;
      return (trainedMap?.[dayStr] || 0) === 1;
    })
  });

  for(const s of supplements){
    lines.push({
      title:`Tomou ${s}?`,
      marks: Array.from({length:max}, (_,i)=>{
        const dayStr = `${currentMonth}-${String(i+1).padStart(2,"0")}`;
        return (suppList || []).some(x => x.day===dayStr && x.name===s && x.took===1);
      })
    });
  }

  $("monthLines").innerHTML = "";
  for(const ln of lines){
    const row = document.createElement("div");
    row.className = "line";
    const left = document.createElement("div");
    left.className = "line-title";
    left.textContent = ln.title;

    const marks = document.createElement("div");
    marks.className = "marks";
    ln.marks.forEach(v=>{
      const m = document.createElement("div");
      m.className = "mark " + (v ? "ok":"no");
      m.textContent = v ? "✓" : "×";
      marks.appendChild(m);
    });

    row.appendChild(left);
    row.appendChild(marks);
    $("monthLines").appendChild(row);
  }
}

async function loadPhotos(){
  const j = await getJSON(API + "/photos");
  const items = j.items || [];
  $("photoGrid").innerHTML = "";

  $("kpiPhotos").textContent = String(items.length);

  if(items.length){
    $("imgFirst").src = await fetchImgObjectUrl(items[0].filename);
    $("imgLast").src  = await fetchImgObjectUrl(items[items.length-1].filename);
  } else {
    $("imgFirst").removeAttribute("src");
    $("imgLast").removeAttribute("src");
  }

  for(const p of items.slice().reverse()){
    const box = document.createElement("div");
    box.className = "photo-item";
    const img = document.createElement("img");
    img.src = await fetchImgObjectUrl(p.filename);

    const meta = document.createElement("div");
    meta.className = "photo-meta";
    meta.textContent = `${p.taken_day}${p.note ? " • " + p.note : ""}`;

    box.appendChild(img);
    box.appendChild(meta);
    $("photoGrid").appendChild(box);
  }
}

async function loadWorkouts(){
  const j = await getJSON(API + "/workouts");
  const items = j.items || [];
  $("workoutList").innerHTML = "";

  for(const w of items){
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${w.title} <span class="muted">(${w.split})</span></span><span class="pill">#${w.id}</span>`;
    $("workoutList").appendChild(row);
  }
}

async function refreshDashboard(reload=true){
  if(!reload) return;

  const monthData = await getJSON(API + "/checkins?month=" + currentMonth);
  const trainedMap = monthData.trained || {};
  const suppList = monthData.supp || [];

  const trainCount = Object.values(trainedMap).filter(v=>v===1).length;
  const suppCount = suppList.filter(x=>x.took===1).length;

  $("kpiTrain").textContent = String(trainCount);
  $("kpiSupp").textContent = String(suppCount);

  renderMonthLines(trainedMap, suppList);
}

async function refreshAll(){
  await loadSupplements();
  await loadCalendar();
  await loadPhotos();
  await loadWorkouts();
  await refreshDashboard(true);
}

async function boot(){
  try{
    const me = await getJSON(API + "/me");
    $("miniUser").textContent = "ID " + me.user_id;
    $("miniMonth").textContent = currentMonth;
    setAuthUI(true);
    showTab("tab-dashboard");
    renderBuilder();
    await refreshAll();
  }catch{
    setAuthUI(false);
  }
}

boot();
