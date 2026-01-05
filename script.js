// --- CONFIGURACIÓN Y VARIABLES ---
const COL_BG = "#000000";
const COL_GRID = "#3e2723";
const COL_TEXT = "#8d6e63";
const COL_HIT = "#ffffff";
const COL_HOLD = "#d32f2f";
const COL_PULSE = "#ffeb3b";
const COL_CURSOR = "#ffc107";
const COL_LOOP_AREA = "rgba(21, 101, 192, 0.3)";
const COL_LOOP_LINE = "#1565c0";

// State Variables
let currentRhythm = [];
let savedKatas = [];
let libraryWindow = null;
let currentKataId = null;
let state = 'idle'; // 'idle', 'recording', 'training', 'paused'
let startTime = 0;
let timerInterval, checkInterval;

let keyPressStart = 0;
let isKeyDown = false;
let tempPulses = [];

let loopStart = 0;
let loopEnd = 5;
let isLoopActive = false;
let cursorTime = 0;

// Loop State Variables
let loopTargetCount = 0;
let loopCurrentCount = 0;
let restDuration = 0;
let isResting = false;
let restStartTime = 0;
let lastBeepSecond = -1;

let animationFrameId;

// Elements references (some might be used here, others in ui_manager)
const btnRitmo = document.getElementById('btn-ritmo');
const btnPulse = document.getElementById('btn-pulse');

// --- INIT ---
window.onload = function () {
  loadLibraryFromStorage();
  resizeCanvas(); // From ui_manager.js

  // Audio Volume Init
  const volumeSlider = document.getElementById('volume-slider');
  if (volumeSlider) {
    document.getElementById('volume-percent').innerText = `${volumeSlider.value}%`;
    setMasterVolume(volumeSlider.value); // From audio_engine.js
  }

  window.addEventListener('resize', resizeCanvas);
  renderTimeline(); // From ui_manager.js
  setupTouchListeners();

  // SPLASH SCREEN LOGIC
  // SPLASH SCREEN LOGIC
  const btnEnter = document.getElementById('btn-enter-app');
  if (btnEnter) {
    btnEnter.addEventListener('click', async function () {
      const userIn = document.getElementById('login-user');
      const passIn = document.getElementById('login-pass');
      const errorMsg = document.getElementById('login-error');

      // Basic empty check
      if (!userIn || !passIn || userIn.value.trim() === "" || passIn.value.trim() === "") {
        showError(errorMsg);
        return;
      }

      // LOADING STATE
      const originalText = btnEnter.innerText;
      btnEnter.innerText = "VERIFICANDO...";
      btnEnter.disabled = true;
      btnEnter.style.opacity = "0.7";
      btnEnter.style.cursor = "wait";

      try {
        const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXSLHOkaKd2gtaf2qKdJgMdalcltYmFZY62Vw7HK31Tbdhg11LaleJTGlwk3yVBTeb-2eHxMjdRuUy/pubhtml/sheet?headers=false&gid=0';

        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error("Network response was not ok");
        const text = await response.text();

        // PARSE HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const rows = doc.querySelectorAll('tbody tr');

        let isAuthenticated = false;
        const inputUser = userIn.value.trim();
        const inputPass = passIn.value.trim();

        // Iterate rows (Skip headers usually at index 0 or 1, check structure)
        // Based on analysis: Row 0 is header. Data starts Row 1.
        for (let i = 0; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells.length >= 2) {
            const sheetUser = cells[0].innerText.trim(); // Column A
            const sheetPass = cells[1].innerText.trim(); // Column B

            // Sensitive Comparison
            if (sheetUser === inputUser && sheetPass === inputPass) {
              isAuthenticated = true;
              break;
            }
          }
        }

        if (isAuthenticated) {
          // SUCCESS
          initAudio(); // Unlock audio context
          const splash = document.getElementById('splash-screen');
          if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => {
              splash.style.display = 'none';
            }, 800);
          }
        } else {
          // FAILED AUTH
          showError(errorMsg);
          resetButton(btnEnter, originalText);
        }

      } catch (error) {
        console.error("Login Error:", error);
        alert("Error de conexión con la base de datos de usuarios.");
        resetButton(btnEnter, originalText);
      }
    });
  }
};

function showError(el) {
  if (el) {
    el.classList.add('visible');
    el.style.animation = 'none';
    el.offsetHeight; /* trigger reflow */
    el.style.animation = 'shake 0.4s ease-in-out';
  }
}

function resetButton(btn, text) {
  btn.innerText = text;
  btn.disabled = false;
  btn.style.opacity = "1";
  btn.style.cursor = "pointer";
}

// --- TOUCH & KEYBOARD HANDLERS ---

function setupTouchListeners() {
  function handleRitmoDown(e) {
    e.preventDefault();
    if (state !== 'recording' || isKeyDown) return;
    initAudio(); // Ensure audio context is ready
    isKeyDown = true;
    keyPressStart = (Date.now() - startTime) / 1000;
    tempPulses = [];
    document.getElementById('visual-feedback').classList.add('fb-active');
    if (btnRitmo) btnRitmo.classList.add('active', 'active-press');
    playDrone(true); // From audio_engine.js
  }

  function handleRitmoUp(e) {
    if (state !== 'recording' || !isKeyDown) return;
    if (e.type === 'touchend' && e.touches.length > 0) return;
    if (btnRitmo) btnRitmo.classList.remove('active-press');
    finalizeRhythmMove();
  }

  if (btnRitmo) {
    btnRitmo.addEventListener('touchstart', handleRitmoDown, { passive: false });
    btnRitmo.addEventListener('touchend', handleRitmoUp);
    btnRitmo.addEventListener('mousedown', handleRitmoDown, { passive: false });
    btnRitmo.addEventListener('mouseup', handleRitmoUp);
    btnRitmo.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  }

  function handlePulseDown(e) {
    e.preventDefault();
    if (state === 'recording' && isKeyDown) {
      let pulseTime = ((Date.now() - startTime) / 1000) - keyPressStart;
      tempPulses.push(pulseTime);
      playTone('pulse'); // From audio_engine.js
      if (btnPulse) btnPulse.classList.add('active-press');
    }
  }
  function handlePulseUp() {
    if (btnPulse) btnPulse.classList.remove('active-press');
  }

  if (btnPulse) {
    btnPulse.addEventListener('touchstart', handlePulseDown, { passive: false });
    btnPulse.addEventListener('touchend', handlePulseUp);
    btnPulse.addEventListener('mousedown', handlePulseDown, { passive: false });
    btnPulse.addEventListener('mouseup', handlePulseUp);
    btnPulse.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  }
}

function finalizeRhythmMove() {
  isKeyDown = false;
  document.getElementById('visual-feedback').classList.remove('fb-active');
  if (btnRitmo) btnRitmo.classList.remove('active');

  playDrone(false);

  let releaseTime = (Date.now() - startTime) / 1000;
  let duration = releaseTime - keyPressStart;
  let type = duration < 0.25 ? 'hit' : 'hold';
  let finalDur = duration < 0.25 ? 0 : duration;

  currentRhythm.push({ type: type, start: keyPressStart, duration: finalDur, name: '', pulses: tempPulses });
  updateLog();
  renderTimeline();
  if (currentKataId) syncChangesToStorage();
}

document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'INPUT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'recording' && !isKeyDown) {
      initAudio();
      isKeyDown = true;
      keyPressStart = (Date.now() - startTime) / 1000;
      tempPulses = [];
      document.getElementById('visual-feedback').classList.add('fb-active');
      playDrone(true);
    }
  }

  if (e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'recording' && isKeyDown) {
      let pulseTime = ((Date.now() - startTime) / 1000) - keyPressStart;
      tempPulses.push(pulseTime);
      playTone('pulse');
    }
  }
});

document.addEventListener('keyup', function (e) {
  if (e.target.tagName === 'INPUT') return;

  if (e.code === 'Space' && state === 'recording') {
    if (!isKeyDown) return;
    finalizeRhythmMove();
  }
});

// --- CORE CONTROL ---

function startRecording() {
  initAudio();
  stopSystem();
  state = 'recording';
  toggleViewMode('list');
  if (currentRhythm.length === 0) currentKataId = null;

  updateLog();
  startTime = Date.now();
  timerInterval = setInterval(updateTimerUI, 30);
  renderLoop(); // Loop render logic defined in ui_manager.js (calls requestAnimationFrame recursively if state matches)
  updateStatus("🔴 GRABANDO");
}

function stopSystem() {
  state = 'idle';
  toggleViewMode('list');
  clearInterval(timerInterval);
  clearInterval(checkInterval);
  cancelAnimationFrame(animationFrameId); // If managed locally? No, renderLoop in ui_manager handles recursive calls based on state.
  playDrone(false);
  isKeyDown = false;
  document.getElementById('visual-feedback').classList.remove('fb-active');
  if (btnRitmo) btnRitmo.classList.remove('active', 'active-press');

  timerOverride = null;
  timerStyleClass = null;

  cursorTime = 0;
  if (isLoopActive) cursorTime = loopStart;

  updateTimerUI();
  renderTimeline();
  document.querySelectorAll('.active-row').forEach(e => e.classList.remove('active-row'));
  updateStatus("⏹ Detenido y Reseteado.");
}

function pauseSystem() {
  if (state !== 'training' && state !== 'recording') return;

  clearInterval(timerInterval);
  clearInterval(checkInterval);
  // cancelAnimationFrame handled by state check in renderLoop
  playDrone(false);

  toggleViewMode('list');

  if (btnRitmo) btnRitmo.classList.remove('active', 'active-press');

  cursorTime = (Date.now() - startTime) / 1000;
  state = 'paused';
  updateStatus("⏸ PAUSADO");
  renderTimeline();
}

function startTraining() {
  if (currentRhythm.length === 0) { alert("El ritmo está vacío."); return; }
  initAudio();

  toggleViewMode('focus');

  let startOffset = cursorTime;

  if (isLoopActive) {
    if (state === 'paused' && cursorTime >= loopStart && cursorTime < loopEnd) {
      startOffset = cursorTime;
    } else {
      startOffset = loopStart;
    }
  } else if (state === 'idle' && cursorTime === 0) {
    startOffset = 0;
  }

  if (state !== 'paused') {
    clearInterval(timerInterval);
    clearInterval(checkInterval);
  }

  currentRhythm.forEach(p => {
    if (p.start >= startOffset - 0.1) {
      p.played = false;
      p.playedPulses = [];
    }
  });

  startTime = Date.now() - (startOffset * 1000);

  loopTargetCount = parseInt(document.getElementById('loop-reps-input').value) || 0;
  restDuration = parseFloat(document.getElementById('loop-rest-input').value) || 0;
  loopCurrentCount = 0;

  if (loopTargetCount > 0) {
    document.getElementById('loop-counter-display').innerText = `1/${loopTargetCount}`;
  } else {
    document.getElementById('loop-counter-display').innerText = "Inf";
  }

  state = 'training';
  timerInterval = setInterval(updateTimerUI, 30);
  checkInterval = setInterval(trainingLoop, 20);
  renderLoop(); // Starts the loop

  if (isLoopActive && restDuration > 0) {
    isResting = true;
    restStartTime = Date.now();
    updateStatus(`⏳ Preparando: ${restDuration}s`);
  } else {
    isResting = false;
    updateStatus("🥋 ENTRENANDO desde " + startOffset.toFixed(1) + "s");
  }
}

function finishTraining() {
  stopSystem();
  updateStatus("🎉 ENTRENAMIENTO COMPLETADO");

  timerOverride = "YAMEEE!";
  timerStyleClass = 'timer-message';
  const timerEl = document.getElementById('main-timer');
  if (timerEl) {
    timerEl.classList.add('timer-message');
    timerEl.innerText = "YAMEEE!";
  }

  playVictorySound();
}

function clearCurrent() {
  if (confirm("¿Borrar todo el área de trabajo? (No borra biblioteca)")) {
    stopSystem();
    currentRhythm = [];
    currentKataId = null;
    document.getElementById('kata-name-input').value = "";
    updateLog();
    cursorTime = 0;
    renderTimeline();
    document.getElementById('main-timer').innerText = "00:00.0";
  }
}

// --- LOOP LOGIC ---

function setLoopPoint(point) {
  if (point === 'A') { loopStart = getCurrentTime(); updateStatus(`Inicio del Loop (A) fijado en ${loopStart.toFixed(2)}s`); }
  else { loopEnd = getCurrentTime(); updateStatus(`Fin del Loop (B) fijado en ${loopEnd.toFixed(2)}s`); }
  if (loopStart > loopEnd) { let temp = loopStart; loopStart = loopEnd; loopEnd = temp; }
  renderTimeline(); // from ui_manager
}

function toggleLoop() {
  isLoopActive = !isLoopActive;
  const btn = document.getElementById('btn-loop-toggle');
  if (isLoopActive) {
    btn.classList.add('loop-active');
    btn.innerText = "Loop: ON";
    updateStatus(`Loop activado entre ${loopStart.toFixed(2)}s y ${loopEnd.toFixed(2)}s`);
  } else {
    btn.classList.remove('loop-active');
    btn.innerText = "Loop: OFF";
    updateStatus("Loop desactivado.");
  }
  renderTimeline();
}

// Helper needed for UI
function getCurrentTime() {
  if (state === 'idle' || state === 'paused') { return cursorTime; }
  else { return Math.max(0, (Date.now() - startTime) / 1000); }
}

function startLoopCycle() {
  startTime = Date.now() - (loopStart * 1000);
  playDrone(false);

  currentRhythm.forEach(p => {
    if (p.start >= loopStart - 0.1 && p.start < loopEnd) {
      p.played = false;
      p.playedPulses = [];
    }
  });

  const overlay = document.getElementById('countdown-overlay');
  if (overlay) overlay.style.display = 'none';
  isResting = false;
  lastBeepSecond = -1;

  timerOverride = "¡HAJIME!";
  timerStyleClass = 'timer-message';
  setTimeout(() => { timerOverride = null; timerStyleClass = null; }, 1000);

  updateStatus("🥋 GO!");
}

function trainingLoop() {
  const now = getCurrentTime();

  // Rest Logic
  if (state === 'training' && isResting) {
    let elapsedRest = (Date.now() - restStartTime) / 1000;
    let remaining = Math.max(0, restDuration - elapsedRest);

    timerOverride = Math.ceil(remaining).toString();
    timerStyleClass = 'timer-yellow';

    updateStatus(`⏳ DESCANSO: ${remaining.toFixed(1)}s`);

    let remInt = Math.ceil(remaining);

    if (remInt <= 3 && remInt > 0) {
      const overlay = document.getElementById('countdown-overlay');
      if (remInt !== lastBeepSecond) {
        playTone('pulse');
        lastBeepSecond = remInt;

        overlay.style.display = 'block';
        overlay.innerText = remInt;
        overlay.classList.remove('pivot-anim');
        void overlay.offsetWidth;
        overlay.classList.add('pivot-anim');
      }
    } else {
      const overlay = document.getElementById('countdown-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    if (elapsedRest >= restDuration) {
      startLoopCycle();
    }
    return;
  }

  // Loop End Logic
  if (state === 'training' && isLoopActive && now >= loopEnd) {
    loopCurrentCount++;

    if (loopTargetCount > 0) {
      document.getElementById('loop-counter-display').innerText = `${Math.min(loopCurrentCount + 1, loopTargetCount + 1)}/${loopTargetCount}`;
    }

    if (loopTargetCount > 0 && loopCurrentCount >= loopTargetCount) {
      finishTraining();
      return;
    }

    if (restDuration > 0) {
      isResting = true;
      restStartTime = Date.now();
      playDrone(false);
      return;
    }

    startLoopCycle();
    if (loopTargetCount > 0) document.getElementById('loop-counter-display').innerText = `${loopCurrentCount + 1}/${loopTargetCount}`;
    return;
  }

  let activeTech = null;

  currentRhythm.forEach((p, index) => {
    // Highlight
    if (now >= p.start && now < (p.start + (p.type === 'hold' ? p.duration : 0.2))) {
      highlightLog(currentRhythm.indexOf(p));
      activeTech = p;
    } else if (p.played === true && index === currentRhythm.length - 1) {
      document.querySelectorAll('.active-row').forEach(e => e.classList.remove('active-row'));
    }

    if (!p.played && now >= p.start) {
      if (p.type === 'hit') { playTone('hit'); p.played = true; }
      else if (p.type === 'hold') { playDrone(true); p.played = 'playing'; p.playedPulses = []; }
    }
    if (p.type === 'hold' && p.played === 'playing') {
      if (p.pulses && p.pulses.length > 0) {
        p.pulses.forEach((pulseTime, pIdx) => {
          if (now >= (p.start + pulseTime) && !p.playedPulses.includes(pIdx)) {
            playTone('pulse'); p.playedPulses.push(pIdx);
          }
        });
      }
      if (now >= (p.start + p.duration)) { playDrone(false); p.played = true; }
    }
  });

  updateFocusDisplay(activeTech);
}

// User Interaction with Canvas (Clicking on timeline)
// Canvas is global from ui_manager
canvas.addEventListener('click', function (e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;

  let maxTime = 10;
  if (currentRhythm.length > 0) { let last = currentRhythm[currentRhythm.length - 1]; maxTime = Math.max(maxTime, last.start + last.duration + 2); }
  if (isLoopActive) maxTime = Math.max(maxTime, loopEnd + 2);

  const scale = canvas.width / maxTime;
  cursorTime = clickX / scale;

  if (state === 'idle' || state === 'paused') {
    updateTimerUI();
    renderTimeline();
  }
});

// Detect User Scroll on Log (to pause auto-scroll)
let isUserScrolling = false;
const logContainer = document.getElementById('rhythm-log');
if (logContainer) {
  logContainer.addEventListener('mouseenter', () => { isUserScrolling = true; });
  logContainer.addEventListener('mouseleave', () => { isUserScrolling = false; });
  logContainer.addEventListener('touchstart', () => { isUserScrolling = true; }, { passive: true });
  logContainer.addEventListener('touchend', () => { setTimeout(() => isUserScrolling = false, 2000); });
}

// --- DATA & LIBRARY ---

function editVal(idx, field, val) {
  if (currentRhythm[idx]) {
    if (field === 'name') currentRhythm[idx].name = val;
    else currentRhythm[idx][field] = parseFloat(val);
    renderTimeline();
    if (currentKataId) syncChangesToStorage();
  }
}

function deleteMove(idx) {
  currentRhythm.splice(idx, 1); updateLog(); renderTimeline();
  if (currentKataId) syncChangesToStorage();
}

function loadLibraryFromStorage() {
  const d = localStorage.getItem('dojoKumaDB');
  if (d) {
    savedKatas = JSON.parse(d);
    // Merge potential new defaults if not present? 
    // For now, simpler: if storage exists, load it.
    // OPTIONAL: Check if DEFAULT_KATAS has items not in savedKatas and add them?
    // Let's keep it simple: initial load.
    if (savedKatas.length === 0 && typeof DEFAULT_KATAS !== 'undefined') {
      savedKatas = JSON.parse(JSON.stringify(DEFAULT_KATAS));
      saveToStorage();
    }
    updateLibraryList();
  } else {
    if (typeof DEFAULT_KATAS !== 'undefined') {
      savedKatas = JSON.parse(JSON.stringify(DEFAULT_KATAS));
      saveToStorage();
      updateLibraryList();
      updateStatus("Katas por defecto cargados.");
    } else {
      console.error("DEFAULT_KATAS no definido.");
      updateStatus("Error: Datos no encontrados.");
    }
  }
}

function saveToStorage() { localStorage.setItem('dojoKumaDB', JSON.stringify(savedKatas)); updateLibraryList(); }

function syncChangesToStorage() {
  const k = savedKatas.find(x => x.id === currentKataId);
  if (k) { k.points = currentRhythm; const nameInput = document.getElementById('kata-name-input').value; if (nameInput) k.name = nameInput; saveToStorage(); }
}

function saveKataToLibrary() {
  if (currentRhythm.length === 0) return;
  if (currentKataId) {
    if (confirm("¿Sobrescribir el Kata actual? (Cancelar para guardar como NUEVO)")) { syncChangesToStorage(); alert("Actualizado."); return; }
  }
  const n = document.getElementById('kata-name-input').value.trim() || `Kata ${savedKatas.length + 1}`;
  currentRhythm.sort((a, b) => a.start - b.start);
  const newId = Date.now();
  savedKatas.push({ id: newId, name: n, points: JSON.parse(JSON.stringify(currentRhythm)) });
  saveToStorage();
  currentKataId = newId;
  alert("Guardado como nuevo Kata.");
}

function loadKata(id) {
  const k = savedKatas.find(x => x.id === id);
  if (k) {
    stopSystem(); currentRhythm = JSON.parse(JSON.stringify(k.points));
    currentKataId = k.id; document.getElementById('kata-name-input').value = k.name;
    updateLog(); renderTimeline();
    closeLibraryWindow();
    updateStatus("Cargado: " + k.name);
  }
}

function deleteKata(id) {
  if (confirm("¿Eliminar de la biblioteca?")) {
    savedKatas = savedKatas.filter(x => x.id !== id);
    saveToStorage(); if (currentKataId === id) currentKataId = null;
  }
}

function exportLibrary() {
  if (savedKatas.length === 0) { alert("La biblioteca está vacía."); return; }
  const dataStr = JSON.stringify(savedKatas, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = "DojoKuma_Katas.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function importLibrary(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (Array.isArray(importedData)) {

        // VALIDATION
        const isValid = importedData.every(k => k.id && k.name && Array.isArray(k.points));
        if (!isValid) {
          alert("Error: El archivo contiene datos con formato incorrecto o corrupto.");
          return;
        }

        if (confirm("¿Fusionar con biblioteca actual? (Cancelar reemplaza todo)")) {
          const ids = new Set(savedKatas.map(k => k.id));
          importedData.forEach(k => { if (!ids.has(k.id)) savedKatas.push(k); });
        } else {
          savedKatas = importedData; currentKataId = null; currentRhythm = []; updateLog();
        }
        saveToStorage(); alert("Importado con éxito."); updateLibraryList();
      } else { alert("Formato incorrecto (No es una lista)."); }
    } catch (err) { alert("Error al leer archivo (JSON inválido)."); }
  };
  reader.readAsText(file); input.value = '';
}

function adjInput(id, val) {
  const input = document.getElementById(id);
  if (!input) return;
  let current = parseFloat(input.value) || 0;
  current += val;
  if (current < 0) current = 0;
  input.value = current;
}