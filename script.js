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

// DEFAULT_KATAS removed. Data is fetched from DojoKuma_Katas.json

let currentRhythm = [];
let savedKatas = [];
let libraryWindow = null;
let currentKataId = null;
let state = 'idle';
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
let lastBeepSecond = -1; // New variable for countdown

// Timer Display Overrides
let timerOverride = null;
let timerStyleClass = null;

let audioCtx;
let masterGainNode;
let droneOscillator = null;

const canvas = document.getElementById('timelineCanvas');
const ctx = canvas.getContext('2d');
let animationFrameId;

const btnRitmo = document.getElementById('btn-ritmo');
const btnPulse = document.getElementById('btn-pulse');

window.onload = function () {
    loadLibraryFromStorage();
    resizeCanvas();
    const initialVolume = document.getElementById('volume-slider').value;
    document.getElementById('volume-percent').innerText = `${initialVolume}%`;
    setMasterVolume(initialVolume);
    window.addEventListener('resize', resizeCanvas);
    renderTimeline();
    setupTouchListeners();
};

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    renderTimeline();
}

// --- MANEJO TÁCTIL Y TECLADO (Funcionalidad de Grabación) ---

function setupTouchListeners() {
    function handleRitmoDown(e) {
        e.preventDefault();
        if (state !== 'recording' || isKeyDown) return;
        isKeyDown = true;
        keyPressStart = (Date.now() - startTime) / 1000;
        tempPulses = [];
        document.getElementById('visual-feedback').classList.add('fb-active');
        btnRitmo.classList.add('active', 'active-press');
        playDrone(true);
    }

    function handleRitmoUp(e) {
        if (state !== 'recording' || !isKeyDown) return;
        if (e.type === 'touchend' && e.touches.length > 0) return;
        btnRitmo.classList.remove('active-press');
        finalizeRhythmMove();
    }

    btnRitmo.addEventListener('touchstart', handleRitmoDown, { passive: false });
    btnRitmo.addEventListener('touchend', handleRitmoUp);
    btnRitmo.addEventListener('mousedown', handleRitmoDown, { passive: false });
    btnRitmo.addEventListener('mouseup', handleRitmoUp);
    btnRitmo.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    function handlePulseDown(e) {
        e.preventDefault();
        if (state === 'recording' && isKeyDown) {
            let pulseTime = ((Date.now() - startTime) / 1000) - keyPressStart;
            tempPulses.push(pulseTime);
            playTone('pulse');
            btnPulse.classList.add('active-press');
        }
    }
    function handlePulseUp() {
        btnPulse.classList.remove('active-press');
    }

    btnPulse.addEventListener('touchstart', handlePulseDown, { passive: false });
    btnPulse.addEventListener('touchend', handlePulseUp);
    btnPulse.addEventListener('mousedown', handlePulseDown, { passive: false });
    btnPulse.addEventListener('mouseup', handlePulseUp);
    btnPulse.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
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
// --- CONTROL PRINCIPAL (Ajustado el Scroll) ---

function startRecording() {
    initAudio();
    stopSystem();
    state = 'recording';
    toggleViewMode('list'); // Ensure list is visible for recording
    if (currentRhythm.length === 0) currentKataId = null;

    // updateLog() hará el scroll interno al final del log
    updateLog();
    startTime = Date.now();
    timerInterval = setInterval(updateTimerUI, 30);
    renderLoop();
    updateStatus("🔴 GRABANDO");
    // Se eliminó la llamada a scrollToBottom()
}

function stopSystem() {
    state = 'idle';
    toggleViewMode('list'); // Show editor when stopped
    clearInterval(timerInterval);
    clearInterval(checkInterval);
    cancelAnimationFrame(animationFrameId);
    playDrone(false);
    isKeyDown = false;
    document.getElementById('visual-feedback').classList.remove('fb-active');
    if (btnRitmo) btnRitmo.classList.remove('active', 'active-press');

    // Clear overrides
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
    cancelAnimationFrame(animationFrameId);
    playDrone(false);

    toggleViewMode('list'); // Show editor when paused (to see where we are in list)

    if (btnRitmo) btnRitmo.classList.remove('active', 'active-press');

    cursorTime = (Date.now() - startTime) / 1000;
    state = 'paused';
    updateStatus("⏸ PAUSADO");
    renderTimeline();
}

function startTraining() {
    if (currentRhythm.length === 0) { alert("El ritmo está vacío."); return; }
    initAudio();

    toggleViewMode('focus'); // Show Focus Display when training

    let startOffset = cursorTime;

    if (isLoopActive) {
        // Force start at Loop A if active (unless resuming inside loop)
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
        cancelAnimationFrame(animationFrameId);
    }

    currentRhythm.forEach(p => {
        if (p.start >= startOffset - 0.1) {
            p.played = false;
            p.playedPulses = [];
        }
    });

    startTime = Date.now() - (startOffset * 1000);

    // Init Loop Counters
    // Init Loop Counters
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
    renderLoop();

    // Initial Rest Check
    if (isLoopActive && restDuration > 0) {
        isResting = true;
        restStartTime = Date.now();
        updateStatus(`⏳ Preparando: ${restDuration}s`);
    } else {
        isResting = false;
        updateStatus("🥋 ENTRENANDO desde " + startOffset.toFixed(1) + "s");
    }
    // Se eliminó la llamada a scrollToBottom()
}

function finishTraining() {
    stopSystem();
    updateStatus("🎉 ENTRENAMIENTO COMPLETADO");

    // YAMEEE Override
    timerOverride = "YAMEEE!";
    timerStyleClass = 'timer-message';
    document.getElementById('main-timer').classList.add('timer-message'); // Ensure class applied immediately if paused
    document.getElementById('main-timer').innerText = "YAMEEE!";

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

// --- LOOP Y AUDIO (Mantenidos) ---
function setLoopPoint(point) {
    if (point === 'A') { loopStart = getCurrentTime(); updateStatus(`Inicio del Loop (A) fijado en ${loopStart.toFixed(2)}s`); }
    else { loopEnd = getCurrentTime(); updateStatus(`Fin del Loop (B) fijado en ${loopEnd.toFixed(2)}s`); }
    if (loopStart > loopEnd) { let temp = loopStart; loopStart = loopEnd; loopEnd = temp; }
    renderTimeline();
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

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!masterGainNode) {
        masterGainNode = audioCtx.createGain(); masterGainNode.connect(audioCtx.destination);
        const initialVolume = document.getElementById('volume-slider').value; setMasterVolume(initialVolume);
    }
}
function setMasterVolume(value) {
    const volumePercent = parseInt(value, 10);
    document.getElementById('volume-percent').innerText = `${volumePercent}%`;
    if (masterGainNode) {
        const gainValue = volumePercent / 100.0;
        masterGainNode.gain.setValueAtTime(gainValue, audioCtx.currentTime);
    }
}
function playTone(type) {
    if (!audioCtx || !masterGainNode) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(masterGainNode);

    if (type === 'hit') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.2);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(3.5, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
    } else if (type === 'pulse') {
        osc.type = 'square'; osc.frequency.setValueAtTime(1200, t);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(4.0, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.09);
    }
}
function playDrone(active) {
    if (!audioCtx || !masterGainNode) return;
    if (active) {
        if (droneOscillator) return;
        const t = audioCtx.currentTime;
        droneOscillator = audioCtx.createOscillator();
        droneGain = audioCtx.createGain();
        droneOscillator.type = 'triangle'; droneOscillator.frequency.setValueAtTime(180, t);
        const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
        droneOscillator.connect(filter); filter.connect(droneGain); droneGain.connect(masterGainNode);
        droneGain.gain.setValueAtTime(0, t); droneGain.gain.linearRampToValueAtTime(3.0, t + 0.05);
        droneOscillator.start(t);
    } else {
        if (droneOscillator) {
            const t = audioCtx.currentTime;
            try {
                droneGain.gain.cancelScheduledValues(t); droneGain.gain.setValueAtTime(droneGain.gain.value, t);
                droneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                droneOscillator.stop(t + 0.2);
            } catch (e) { }
            droneOscillator = null;
        }
    }
}

function playVictorySound() {
    if (!audioCtx || !masterGainNode) return;
    const t = audioCtx.currentTime;

    // Acorde Triunfal (Do Mayor)
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.connect(g); g.connect(masterGainNode);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.start(t);
        osc.stop(t + 2.0);
    });
}

// --- TRAINING LOOP Y LOG (Ajustado el Resaltado) ---

function startLoopCycle() {
    // Reset for next Cycle
    startTime = Date.now() - (loopStart * 1000);
    playDrone(false);

    // Strictly reset all played flags in the loop range
    currentRhythm.forEach(p => {
        // Reset points that are effectively within or just before the loop start to ensure they play
        if (p.start >= loopStart - 0.1 && p.start < loopEnd) {
            p.played = false;
            p.playedPulses = [];
        }
    });

    // UI Reset
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) overlay.style.display = 'none';
    isResting = false;
    lastBeepSecond = -1;

    // Hajime Flash
    timerOverride = "¡HAJIME!";
    timerStyleClass = 'timer-message';
    setTimeout(() => { timerOverride = null; timerStyleClass = null; }, 1000);

    updateStatus("🥋 GO!");
}

function trainingLoop() {
    const now = getCurrentTime();

    // Lógica de Descanso (Rest)
    if (state === 'training' && isResting) {
        let elapsedRest = (Date.now() - restStartTime) / 1000;
        let remaining = Math.max(0, restDuration - elapsedRest);

        // Rest Countdown on Timer
        timerOverride = Math.ceil(remaining).toString();
        timerStyleClass = 'timer-yellow';

        updateStatus(`⏳ DESCANSO: ${remaining.toFixed(1)}s`);

        // Countdown Beeps (3, 2, 1) & Giant Overlay
        let remInt = Math.ceil(remaining);

        if (remInt <= 3 && remInt > 0) {
            const overlay = document.getElementById('countdown-overlay');
            if (remInt !== lastBeepSecond) {
                playTone('pulse');
                lastBeepSecond = remInt;

                // Show Overlay & Animate
                overlay.style.display = 'block';
                overlay.innerText = remInt;
                overlay.classList.remove('pivot-anim');
                void overlay.offsetWidth; // Trigger reflow
                overlay.classList.add('pivot-anim');
            }
        } else {
            document.getElementById('countdown-overlay').style.display = 'none';
        }

        if (elapsedRest >= restDuration) {
            startLoopCycle();
        }
        return; // No procesar hits durante descanso
    }

    if (state === 'training' && isLoopActive && now >= loopEnd) {
        // Fin de Loop Iteration
        loopCurrentCount++;

        // Actualizar UI Contador
        if (loopTargetCount > 0) {
            document.getElementById('loop-counter-display').innerText = `${Math.min(loopCurrentCount + 1, loopTargetCount + 1)}/${loopTargetCount}`; // Muestra el siguiente ciclo
        }

        // Check Victory
        if (loopTargetCount > 0 && loopCurrentCount >= loopTargetCount) {
            finishTraining();
            return;
        }

        // Check Rest
        if (restDuration > 0) {
            isResting = true;
            restStartTime = Date.now();
            playDrone(false);
            return;
        }

        // Normal Loop Restart
        startLoopCycle();
        if (loopTargetCount > 0) document.getElementById('loop-counter-display').innerText = `${loopCurrentCount + 1}/${loopTargetCount}`;
        return;
    }

    let activeTech = null;

    currentRhythm.forEach((p, index) => {
        // Resaltar la fila en el Log
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

    // Actualizar Vista Focus
    updateFocusDisplay(activeTech);
}

function updateFocusDisplay(tech) {
    const focusName = document.getElementById('focus-name');
    const focusInfo = document.getElementById('focus-info');
    const focusIcon = document.getElementById('focus-icon');

    if (tech) {
        focusName.innerText = tech.name || "Técnica " + (currentRhythm.indexOf(tech) + 1);
        focusInfo.innerText = `${tech.start.toFixed(1)}s` + (tech.type === 'hold' ? ` -> ${(tech.start + tech.duration).toFixed(1)}s` : '');
        focusIcon.innerText = tech.type === 'hit' ? '💥' : '🥋';
        focusIcon.style.transform = "scale(1.2)";
    } else {
        focusIcon.style.transform = "scale(1)";
        // Mantener el último o mostrar "..."
    }
}

function toggleViewMode(mode) {
    const log = document.getElementById('rhythm-log');
    const focus = document.getElementById('focus-display');
    if (mode === 'focus') {
        log.style.display = 'none';
        focus.style.display = 'flex';
    } else {
        log.style.display = 'block';
        focus.style.display = 'none';
    }
}
// --- EDICIÓN Y SINCRONIZACIÓN (Mantenidos) ---
function updateLog() {
    const logDiv = document.getElementById('rhythm-log');
    let html = ''; let list = [...currentRhythm].sort((a, b) => a.start - b.start);
    if (list.length === 0) { logDiv.innerHTML = '<div style="text-align:center; color:#5d4037; margin-top:20px;">Sin datos</div>'; return; }
    list.forEach((p, index) => {
        let originalIndex = currentRhythm.indexOf(p);
        let typeIcon = p.type === 'hit' ? '★' : '↔';
        let typeStyle = p.type === 'hit' ? 'item-hit' : 'item-hold';
        let durHtml = p.type === 'hold' ? `<span class="lbl">D:</span><input type="number" step="0.1" class="num-input-dur" value="${p.duration.toFixed(2)}" onchange="editVal(${originalIndex}, 'duration', this.value)">` : `<span style="width:75px;"></span>`;
        let pulsesBadge = (p.pulses && p.pulses.length > 0) ? `<span class="pulse-badge">⚡${p.pulses.length}</span>` : '';
        html += `<div class="log-item" id="log-${originalIndex}">
            <span class="log-index">#${index + 1}</span> <span class="item-type ${typeStyle}">${typeIcon}</span>
            <span class="lbl">T:</span> <input type="number" step="0.1" class="num-input" value="${p.start.toFixed(2)}" onchange="editVal(${originalIndex}, 'start', this.value)">
            ${durHtml} ${pulsesBadge}
            <input type="text" class="move-name-input" placeholder="Nombre de Técnica (Ej: Oi Zuki)" value="${p.name || ''}" oninput="editVal(${originalIndex}, 'name', this.value)">
            <button class="btn-x" onclick="deleteMove(${originalIndex})">✕</button>
        </div>`;
    });
    logDiv.innerHTML = html;
    // SCROLL INTERNO AL GRABAR
    if (state === 'recording') {
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// Detectar si el usuario está interactuando con el log para no interrumpir su scroll
let isUserScrolling = false;
const logContainer = document.getElementById('rhythm-log');

if (logContainer) {
    logContainer.addEventListener('mouseenter', () => { isUserScrolling = true; });
    logContainer.addEventListener('mouseleave', () => { isUserScrolling = false; });
    logContainer.addEventListener('touchstart', () => { isUserScrolling = true; }, { passive: true });
    logContainer.addEventListener('touchend', () => { setTimeout(() => isUserScrolling = false, 2000); }); // Delay para móvil
}

// Resaltar la fila de la técnica actual (La que corre)
function highlightLog(idx) {
    document.querySelectorAll('.active-row').forEach(e => e.classList.remove('active-row'));
    const el = document.getElementById(`log-${idx}`);
    const container = document.getElementById('rhythm-log');

    if (el && container) {
        el.classList.add('active-row');

        // Solo auto-scrollear si el usuario NO está interactuando
        if (!isUserScrolling) {
            // SCROLL INTERNO MANUAL: Centramos el elemento.
            const topPos = el.offsetTop;
            container.scrollTop = topPos - (container.clientHeight / 2) + (el.clientHeight / 2);
        }
    }
}

// --- DEMÁS HELPERS (Mantenidos) ---

function getCurrentTime() {
    if (state === 'idle' || state === 'paused') { return cursorTime; }
    else { return Math.max(0, (Date.now() - startTime) / 1000); }
}

function updateTimerUI() {
    const timerEl = document.getElementById('main-timer');

    // Remove override classes first
    timerEl.classList.remove('timer-yellow', 'timer-message');

    if (timerOverride !== null) {
        timerEl.innerText = timerOverride;
        if (timerStyleClass) timerEl.classList.add(timerStyleClass);
    } else {
        let sec = getCurrentTime(); let m = Math.floor(sec / 60); let s = Math.floor(sec % 60); let ms = Math.floor((sec % 1) * 10);
        timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    }
}
function updateStatus(m) {
    const el = document.getElementById('status-display');
    if (el) el.innerText = m;
}

function renderLoop() { renderTimeline(); if (state === 'recording' || state === 'training') requestAnimationFrame(renderLoop); }

function renderTimeline() {
    ctx.fillStyle = COL_BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let maxTime = 10;
    if (currentRhythm.length > 0) { let last = currentRhythm[currentRhythm.length - 1]; maxTime = Math.max(maxTime, last.start + last.duration + 2); }
    if (state === 'recording') maxTime = Math.max(maxTime, getCurrentTime() + 2);
    if (isLoopActive) maxTime = Math.max(maxTime, loopEnd + 2);

    const scale = canvas.width / maxTime; const centerY = canvas.height / 2;

    ctx.strokeStyle = COL_GRID; ctx.lineWidth = 1; ctx.beginPath();
    for (let t = 0; t <= maxTime; t += 1) {
        let x = t * scale; ctx.moveTo(x, canvas.height); ctx.lineTo(x, 0);
        if (t % 5 === 0) { ctx.fillStyle = COL_TEXT; ctx.font = '10px monospace'; ctx.fillText(t + 's', x + 3, canvas.height - 5); }
    } ctx.stroke();

    if (isLoopActive || (loopStart !== 0 || loopEnd !== 5)) {
        let ax = loopStart * scale;
        let bx = loopEnd * scale;
        ctx.fillStyle = COL_LOOP_AREA; ctx.fillRect(ax, 0, bx - ax, canvas.height);
        ctx.lineWidth = 2; ctx.strokeStyle = COL_LOOP_LINE;
        ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, canvas.height); ctx.stroke();
        ctx.fillStyle = COL_LOOP_LINE; ctx.fillText("A", ax + 2, 12);
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, canvas.height); ctx.stroke();
        ctx.fillStyle = COL_LOOP_LINE; ctx.fillText("B", bx - 10, 12);
    }

    currentRhythm.forEach((p) => {
        let x = p.start * scale; let w = Math.max(3, p.duration * scale);
        if (p.type === 'hit') {
            ctx.fillStyle = COL_HIT; ctx.fillRect(x, centerY - 20, 3, 40);
            ctx.beginPath(); ctx.moveTo(x + 1.5, centerY - 25); ctx.lineTo(x - 3, centerY - 30); ctx.lineTo(x + 6, centerY - 30); ctx.fill();
        } else {
            ctx.fillStyle = COL_HOLD; ctx.fillRect(x, centerY - 10, w, 20);
            if (p.pulses) {
                ctx.fillStyle = COL_PULSE;
                p.pulses.forEach(pt => { let px = (p.start + pt) * scale; ctx.fillRect(px, centerY - 10, 2, 20); });
            }
        }
    });

    let cursorToDraw = getCurrentTime();
    let nowX = cursorToDraw * scale;
    ctx.strokeStyle = COL_CURSOR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, canvas.height); ctx.stroke();
}

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

// --- EDICIÓN Y SINCRONIZACIÓN (Mantenidos) ---
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

// Funciones de Biblioteca (Separada en Ventana)
function openLibraryWindow() {
    document.getElementById('library-modal').style.display = 'block';
    updateLibraryList();
}

function closeLibraryWindow() {
    document.getElementById('library-modal').style.display = 'none';
}

function loadLibraryFromStorage() {
    const d = localStorage.getItem('dojoKumaDB');
    if (d) {
        savedKatas = JSON.parse(d);
        updateLibraryList();
    } else {
        // Data integrated directly
        if (typeof DEFAULT_KATAS !== 'undefined') {
            savedKatas = JSON.parse(JSON.stringify(DEFAULT_KATAS));
            saveToStorage();
            updateLibraryList();
            updateStatus("Katas por defecto cargados.");
        } else {
            console.error("DEFAULT_KATAS no definido.");
            updateStatus("Error: Datos corruptos.");
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

function updateLibraryList() {
    const listDiv = document.getElementById('modal-list-container');
    if (!listDiv) return;

    let html = '';
    if (savedKatas.length === 0) {
        html = "<div style='color:#8d6e63; text-align:center;'>Vacío</div>";
    } else {
        savedKatas.forEach(k => {
            html += `<div class="kata-list-item">
                <span style="font-weight:bold;">${k.name}</span>
                <div class="kata-actions">
                    <button class="btn-load" style="background-color: #388e3c;" onclick="loadKata(${k.id})">▶</button>
                    <button class="btn-del" style="background-color: #b71c1c;" onclick="deleteKata(${k.id})">✕</button>
                </div>
            </div>`;
        });
    }
    listDiv.innerHTML = html;
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
                if (confirm("¿Fusionar con biblioteca actual? (Cancelar reemplaza todo)")) {
                    const ids = new Set(savedKatas.map(k => k.id));
                    importedData.forEach(k => { if (!ids.has(k.id)) savedKatas.push(k); });
                } else {
                    savedKatas = importedData; currentKataId = null; currentRhythm = []; updateLog();
                }
                saveToStorage(); alert("Importado con éxito."); updateLibraryList();
            } else { alert("Formato incorrecto."); }
        } catch (err) { alert("Error al leer archivo."); }
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
const DEFAULT_KATAS =  
[
  {
    "id": 1765411322123,
    "name": "Gankaku",
    "points": [
      {
        "type": "hold",
        "start": 1.795,
        "duration": 4.968,
        "name": "Ryosho-awase-uke",
        "pulses": [
          3.8180000000000005
        ],
        "played": true,
        "playedPulses": [
          0
        ]
      },
      {
        "type": "hold",
        "start": 7.541,
        "duration": 5.767999999999999,
        "name": "Ryosho-juji-osae-uke / Tsuki (sokumen-zuki) / gyaku-zuki",
        "pulses": [
          4.889999999999999,
          5.187999999999999
        ],
        "played": true,
        "playedPulses": [
          0,
          1
        ]
      },
      {
        "type": "hold",
        "start": 13.621,
        "duration": 2.4739999999999984,
        "name": "Gedan-barai /  kaisho-kosa-uke (ryosho-juji-uke)",
        "pulses": [
          0.20199999999999996,
          0.8989999999999991
        ],
        "played": true,
        "playedPulses": [
          0,
          1
        ]
      },
      {
        "type": "hold",
        "start": 16.519,
        "duration": 7.407,
        "name": "Ryoken-mune-mae-kosa / nidan-geri & ryoken-kosa (juji)-uke / ryoken-kosa (juji)-uke",
        "pulses": [
          4.4410000000000025,
          4.791,
          5.303000000000001,
          6.676000000000002
        ],
        "played": true,
        "playedPulses": [
          0,
          1,
          2,
          3
        ]
      },
      {
        "type": "hold",
        "start": 24.406,
        "duration": 7.1640000000000015,
        "name": "Gedan-uke / Shuto-uke /ryosho-kakiwake-uke",
        "pulses": [
          0.1930000000000014,
          0.5750000000000028
        ],
        "played": true,
        "playedPulses": [
          0,
          1
        ]
      },
      {
        "type": "hold",
        "start": 32.055,
        "duration": 3.246000000000002,
        "name": "Ryosho-kakiwake-uke",
        "pulses": [],
        "played": true,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 36.413,
        "duration": 10.891000000000005,
        "name": "Ryoken-kakiwake-uke",
        "pulses": [
          7.535000000000004,
          8.909000000000006,
          9.306000000000004,
          10.213000000000001
        ],
        "played": "playing",
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 48.522,
        "duration": 3.433,
        "name": "uchi-uke / gedan-uke (manji-uke) / ",
        "pulses": [],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 52.838,
        "duration": 8.458999999999996,
        "name": "ryoken-kosa (juji)-uke",
        "pulses": [
          6.734999999999999,
          6.9879999999999995
        ],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 62.324,
        "duration": 4.099000000000004,
        "name": "",
        "pulses": [],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 66.557,
        "duration": 11.147999999999996,
        "name": "",
        "pulses": [
          9.489000000000004,
          9.847999999999999,
          10.495999999999995
        ],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 80.061,
        "duration": 11.794999999999987,
        "name": "",
        "pulses": [
          10.535999999999987,
          10.903999999999996
        ],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 93.277,
        "duration": 10.733000000000004,
        "name": "",
        "pulses": [
          9.796999999999997,
          10.251000000000005
        ],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 104.62,
        "duration": 2.3699999999999903,
        "name": "",
        "pulses": [
          0.10299999999999443,
          0.7419999999999902,
          0.914999999999992
        ],
        "played": false,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 107.253,
        "duration": 12.117000000000004,
        "name": "",
        "pulses": [
          5.1059999999999945,
          5.507000000000005
        ],
        "played": false,
        "playedPulses": []
      }
    ]
  },
  {
    "id": 1765423876346,
    "name": "JION",
    "points": [
      {
        "type": "hold",
        "start": 2.339,
        "duration": 5.183999999999999,
        "name": "",
        "pulses": [
          4.452
        ]
      },
      {
        "type": "hold",
        "start": 8.947,
        "duration": 6.844000000000001,
        "name": "",
        "pulses": [
          4.552000000000001,
          4.876000000000001,
          5.644,
          5.800000000000001
        ]
      },
      {
        "type": "hold",
        "start": 17.199,
        "duration": 11.735999999999997,
        "name": "",
        "pulses": [
          4.308,
          4.623999999999999,
          5.331999999999997,
          5.539999999999999,
          7.103999999999999,
          7.351999999999997,
          7.52,
          8.415999999999997,
          8.779999999999998,
          8.936,
          9.744,
          10.387999999999998
        ]
      },
      {
        "type": "hold",
        "start": 29.395,
        "duration": 2.9079999999999977,
        "name": "",
        "pulses": [
          0.1999999999999993,
          0.379999999999999,
          2.007999999999999,
          2.155999999999999
        ]
      },
      {
        "type": "hold",
        "start": 32.843,
        "duration": 6.159999999999997,
        "name": "",
        "pulses": [
          0.10799999999999699,
          2.391999999999996,
          3.8519999999999968,
          5.067999999999998
        ]
      },
      {
        "type": "hold",
        "start": 39.371,
        "duration": 3.308,
        "name": "",
        "pulses": [
          0.27599999999999625,
          0.4519999999999982,
          2.0959999999999965,
          2.259999999999998
        ]
      },
      {
        "type": "hold",
        "start": 43.487,
        "duration": 15.219999999999999,
        "name": "",
        "pulses": [
          7.955999999999996,
          8.491999999999997,
          9.375999999999998,
          10.271999999999998,
          11.759999999999998,
          11.943999999999996,
          12.707999999999998,
          12.86,
          13.967999999999996,
          14.519999999999996
        ]
      },
      {
        "type": "hold",
        "start": 59.175,
        "duration": 3.456000000000003,
        "name": "",
        "pulses": [
          0.16400000000000148,
          0.7160000000000011,
          2.9000000000000057
        ]
      },
      {
        "type": "hold",
        "start": 63.115,
        "duration": 5.124000000000002,
        "name": "",
        "pulses": [
          1.1199999999999974,
          1.5799999999999912,
          2.7959999999999994,
          3.1600000000000037,
          4.059999999999995,
          4.475999999999992
        ]
      },
      {
        "type": "hold",
        "start": 68.679,
        "duration": 4.304000000000002,
        "name": "",
        "pulses": [
          2.951999999999998
        ]
      },
      {
        "type": "hold",
        "start": 73.731,
        "duration": 12.652000000000001,
        "name": "",
        "pulses": [
          0.980000000000004,
          5.076000000000008,
          8.364000000000004
        ]
      }
    ]
  },
  {
    "id": 1765576842241,
    "name": "Sochin",
    "points": [
      {
        "type": "hold",
        "start": 2.58,
        "duration": 4.386,
        "name": "",
        "pulses": [],
        "played": true,
        "playedPulses": []
      },
      {
        "type": "hold",
        "start": 8.282,
        "duration": 8.425,
        "name": "",
        "pulses": [
          5.872,
          6.02,
          6.9670000000000005,
          7.272
        ],
        "played": true,
        "playedPulses": [
          0,
          1,
          2,
          3
        ]
      },
      {
        "type": "hold",
        "start": 17.788,
        "duration": 6.734999999999999,
        "name": "",
        "pulses": [
          4.733999999999998,
          4.873999999999999,
          5.661000000000001,
          6.288
        ],
        "played": true,
        "playedPulses": [
          0,
          1,
          2,
          3
        ]
      },
      {
        "type": "hold",
        "start": 26.212,
        "duration": 20.096,
        "name": "",
        "pulses": [
          4.725000000000001,
          4.966999999999999,
          5.824000000000002,
          6.584999999999997,
          7.382999999999999,
          8.09,
          9.244000000000003,
          10.970000000000002,
          12.434000000000001,
          14.084,
          14.328999999999997,
          14.683000000000003,
          15.288,
          15.973000000000003,
          16.166999999999998,
          16.587999999999997,
          16.974,
          19.098000000000003
        ],
        "played": true,
        "playedPulses": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17
        ]
      },
      {
        "type": "hold",
        "start": 47.121,
        "duration": 17.73,
        "name": "",
        "pulses": [
          0.35199999999999676,
          0.8769999999999953,
          2.461999999999996,
          2.988999999999997,
          4.503999999999998,
          4.674999999999997,
          5.9510000000000005,
          10.693999999999996,
          10.96
        ],
        "played": true,
        "playedPulses": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8
        ]
      }
    ]
  },
  {
    "id": 1765647820717,
    "name": "Kankusho",
    "points": [
      {
        "type": "hold",
        "start": 1.354,
        "duration": 6.503,
        "name": "",
        "pulses": [
          1.339,
          2.351,
          2.644,
          3.7510000000000003,
          3.9459999999999997,
          4.967,
          5.134,
          5.485
        ]
      },
      {
        "type": "hold",
        "start": 9.594,
        "duration": 7.602000000000002,
        "name": "",
        "pulses": [
          4.377000000000001,
          4.618,
          5.713000000000001,
          6.4030000000000005,
          6.605000000000002,
          6.9620000000000015
        ]
      },
      {
        "type": "hold",
        "start": 18.429,
        "duration": 3.8290000000000006,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 22.87,
        "duration": 7.593,
        "name": "",
        "pulses": [
          4.593999999999998,
          4.855999999999998,
          5.5539999999999985,
          6.318999999999999,
          6.491999999999997,
          6.875
        ]
      },
      {
        "type": "hold",
        "start": 31.372,
        "duration": 3.905999999999999,
        "name": "",
        "pulses": [
          0.40700000000000003
        ]
      },
      {
        "type": "hold",
        "start": 36.068,
        "duration": 2.710000000000001,
        "name": "",
        "pulses": [
          0.7040000000000006,
          0.865000000000002,
          1.017000000000003,
          1.8250000000000028,
          1.975999999999999,
          2.112000000000002
        ]
      },
      {
        "type": "hold",
        "start": 39.149,
        "duration": 8.475000000000001,
        "name": "",
        "pulses": [
          6.113999999999997,
          6.707000000000001,
          7.592999999999996
        ]
      },
      {
        "type": "hold",
        "start": 47.763,
        "duration": 2.780999999999999,
        "name": "",
        "pulses": [
          0.13700000000000045,
          0.382000000000005,
          1.2020000000000053,
          1.4200000000000017
        ]
      },
      {
        "type": "hold",
        "start": 52.117,
        "duration": 7.323,
        "name": "",
        "pulses": [
          4.169000000000004,
          4.538000000000004,
          5.241,
          6.018000000000001,
          6.179000000000002
        ]
      },
      {
        "type": "hold",
        "start": 60.274,
        "duration": 6.209999999999994,
        "name": "",
        "pulses": [
          5.466999999999999
        ]
      },
      {
        "type": "hold",
        "start": 66.872,
        "duration": 8.301000000000002,
        "name": "",
        "pulses": [
          1.5100000000000051,
          2.4539999999999935,
          4.007000000000005,
          4.549999999999997,
          5.543999999999997,
          6.149000000000001
        ]
      }
    ]
  },
  {
    "id": 1765649710926,
    "name": "Gojushijosho",
    "points": [
      {
        "type": "hold",
        "start": 0.667,
        "duration": 3.3660000000000005,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 5.14,
        "duration": 3.609000000000001,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 9.575,
        "duration": 3.630000000000001,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 14.287,
        "duration": 7.214999999999998,
        "name": "",
        "pulses": [
          5.337999999999999,
          5.505000000000001,
          6.136999999999999,
          6.327
        ]
      },
      {
        "type": "hold",
        "start": 22.537,
        "duration": 7.536000000000001,
        "name": "",
        "pulses": [
          4.617000000000001,
          4.797000000000001,
          5.515000000000001,
          5.699999999999999,
          6.673000000000002
        ]
      },
      {
        "type": "hold",
        "start": 31.184,
        "duration": 7.047999999999998,
        "name": "",
        "pulses": [
          5.1080000000000005,
          5.441999999999997,
          6.145999999999997,
          6.404999999999998
        ]
      },
      {
        "type": "hold",
        "start": 39.087,
        "duration": 8.165999999999997,
        "name": "",
        "pulses": [
          5.439999999999998,
          5.650999999999996,
          6.375999999999998,
          6.645999999999994,
          7.3799999999999955
        ]
      },
      {
        "type": "hold",
        "start": 48.129,
        "duration": 4.134,
        "name": "",
        "pulses": [
          2.5279999999999987,
          2.7660000000000053,
          3.199000000000005
        ]
      },
      {
        "type": "hold",
        "start": 52.965,
        "duration": 3.2099999999999937,
        "name": "",
        "pulses": [
          2.2749999999999986,
          2.411999999999999
        ]
      },
      {
        "type": "hold",
        "start": 57.917,
        "duration": 7.122,
        "name": "",
        "pulses": [
          4.132999999999996,
          4.500999999999998,
          5.3729999999999976,
          5.573999999999998,
          6.108000000000004
        ]
      },
      {
        "type": "hold",
        "start": 66.053,
        "duration": 5.124000000000009,
        "name": "",
        "pulses": [
          4.474000000000004
        ]
      },
      {
        "type": "hold",
        "start": 72.042,
        "duration": 6.259,
        "name": "",
        "pulses": [
          3.924999999999997,
          4.179000000000002,
          4.611999999999995,
          5.0859999999999985,
          5.700999999999993
        ]
      },
      {
        "type": "hold",
        "start": 79.289,
        "duration": 7.114000000000004,
        "name": "",
        "pulses": [
          4.780999999999992,
          4.992000000000004,
          6.0930000000000035,
          6.3089999999999975,
          6.664999999999992
        ]
      },
      {
        "type": "hold",
        "start": 87.442,
        "duration": 4.236000000000004,
        "name": "",
        "pulses": [
          2.7730000000000103,
          2.946000000000012,
          3.236000000000004,
          3.6100000000000136
        ]
      },
      {
        "type": "hold",
        "start": 92.553,
        "duration": 3.582000000000008,
        "name": "",
        "pulses": [
          2.4009999999999962,
          2.5619999999999976,
          3.031000000000006
        ]
      },
      {
        "type": "hold",
        "start": 97.628,
        "duration": 6.992000000000004,
        "name": "",
        "pulses": [
          4.715999999999994,
          5.588999999999999,
          6.337000000000003
        ]
      },
      {
        "type": "hold",
        "start": 106.235,
        "duration": 6.075000000000003,
        "name": "",
        "pulses": [
          4.963999999999999,
          5.192000000000007,
          5.504000000000005
        ]
      },
      {
        "type": "hold",
        "start": 113.453,
        "duration": 10.375,
        "name": "",
        "pulses": [
          7.986999999999995,
          8.563000000000002
        ]
      },
      {
        "type": "hold",
        "start": 124.015,
        "duration": 6.779000000000011,
        "name": "",
        "pulses": []
      }
    ]
  },
  {
    "id": 1765652623570,
    "name": "Gojushiho Dai",
    "points": [
      {
        "type": "hold",
        "start": 2.012,
        "duration": 3.7369999999999997,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 6.839,
        "duration": 4.574,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 12.457,
        "duration": 4.6839999999999975,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 17.768,
        "duration": 6.978999999999999,
        "name": "",
        "pulses": [
          5.277999999999999,
          5.495000000000001,
          5.968999999999998,
          6.2010000000000005
        ]
      },
      {
        "type": "hold",
        "start": 26.278,
        "duration": 7.608000000000004,
        "name": "",
        "pulses": [
          4.543000000000003,
          4.806000000000001,
          5.207000000000001,
          5.498000000000001,
          6.1739999999999995,
          6.858000000000004
        ]
      },
      {
        "type": "hold",
        "start": 35.304,
        "duration": 3.3470000000000013,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 38.895,
        "duration": 5.690999999999995,
        "name": "",
        "pulses": [
          3.503999999999998,
          4.525999999999996,
          4.778999999999996
        ]
      },
      {
        "type": "hold",
        "start": 45.442,
        "duration": 3.192,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 49.327,
        "duration": 6.460000000000001,
        "name": "",
        "pulses": [
          4.225999999999999,
          4.469999999999999,
          5.323,
          5.504000000000005,
          5.801000000000002
        ]
      },
      {
        "type": "hold",
        "start": 56.894,
        "duration": 3.611000000000004,
        "name": "",
        "pulses": [
          2.25,
          2.753,
          3.0560000000000045
        ]
      },
      {
        "type": "hold",
        "start": 61.503,
        "duration": 3.450000000000003,
        "name": "",
        "pulses": [
          2.158999999999999,
          2.528000000000006
        ]
      },
      {
        "type": "hold",
        "start": 66.111,
        "duration": 2.3429999999999893,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 69.449,
        "duration": 6.061000000000007,
        "name": "",
        "pulses": [
          3.7510000000000048,
          4.662000000000006,
          4.951000000000008,
          5.277000000000001
        ]
      },
      {
        "type": "hold",
        "start": 76.64,
        "duration": 4.840999999999994,
        "name": "",
        "pulses": [
          4.165000000000006
        ]
      },
      {
        "type": "hold",
        "start": 82.392,
        "duration": 5.996000000000009,
        "name": "",
        "pulses": [
          3.6920000000000073,
          4.75500000000001,
          5.135000000000005
        ]
      },
      {
        "type": "hold",
        "start": 89.502,
        "duration": 3.0520000000000067,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 92.839,
        "duration": 5.540999999999997,
        "name": "",
        "pulses": [
          3.5559999999999974,
          4.3089999999999975,
          4.635000000000005,
          4.923000000000002
        ]
      },
      {
        "type": "hold",
        "start": 99.782,
        "duration": 3.76100000000001,
        "name": "",
        "pulses": [
          2.3400000000000034,
          2.4740000000000038,
          2.8359999999999985,
          3.2210000000000036
        ]
      },
      {
        "type": "hold",
        "start": 104.682,
        "duration": 3.6670000000000016,
        "name": "",
        "pulses": [
          2.1580000000000013,
          2.2819999999999965,
          2.6159999999999997
        ]
      },
      {
        "type": "hold",
        "start": 109.173,
        "duration": 6.787999999999997,
        "name": "",
        "pulses": [
          4.846000000000004,
          5.429999999999993,
          6.158999999999992
        ]
      },
      {
        "type": "hold",
        "start": 116.7,
        "duration": 7.037999999999997,
        "name": "",
        "pulses": [
          5.563000000000002,
          5.807000000000002,
          6.247
        ]
      },
      {
        "type": "hold",
        "start": 124.445,
        "duration": 10.420000000000016,
        "name": "",
        "pulses": [
          8.099000000000018,
          8.245000000000005
        ]
      },
      {
        "type": "hold",
        "start": 134.995,
        "duration": 5.048000000000002,
        "name": "",
        "pulses": []
      }
    ]
  },
  {
    "id": 1765915749594,
    "name": "NijushiHO",
    "points": [
      {
        "type": "hold",
        "start": 1.514,
        "duration": 9.433,
        "name": "",
        "pulses": [
          6.735,
          7.196000000000001
        ]
      },
      {
        "type": "hold",
        "start": 11.355,
        "duration": 4.205,
        "name": "",
        "pulses": [
          0.3829999999999991,
          0.9019999999999992,
          1.3989999999999991,
          1.9290000000000003
        ]
      },
      {
        "type": "hold",
        "start": 16.278,
        "duration": 2.025000000000002,
        "name": "",
        "pulses": [
          0.47600000000000264,
          0.8070000000000022
        ]
      },
      {
        "type": "hold",
        "start": 19.183,
        "duration": 5.7940000000000005,
        "name": "",
        "pulses": [
          4.5809999999999995,
          5.144000000000002
        ]
      },
      {
        "type": "hold",
        "start": 25.835,
        "duration": 5.890999999999998,
        "name": "",
        "pulses": [
          4.413,
          5.184999999999999
        ]
      },
      {
        "type": "hold",
        "start": 32.266,
        "duration": 7.371000000000002,
        "name": "",
        "pulses": [
          6.073,
          6.751000000000005
        ]
      },
      {
        "type": "hold",
        "start": 39.873,
        "duration": 1.0530000000000044,
        "name": "",
        "pulses": [
          0.17099999999999937,
          0.38400000000000034
        ]
      },
      {
        "type": "hold",
        "start": 44.251,
        "duration": 6.206000000000003,
        "name": "",
        "pulses": [
          4.739000000000004,
          5.300000000000004,
          5.698
        ]
      },
      {
        "type": "hold",
        "start": 53.16,
        "duration": 5.801000000000002,
        "name": "",
        "pulses": [
          5.048000000000002,
          5.280000000000001
        ]
      },
      {
        "type": "hold",
        "start": 61.416,
        "duration": 6.602000000000004,
        "name": "",
        "pulses": [
          4.874000000000009,
          5.846000000000004,
          6.076999999999998
        ]
      },
      {
        "type": "hold",
        "start": 68.688,
        "duration": 1.9050000000000011,
        "name": "",
        "pulses": [
          0.2560000000000002,
          0.8329999999999984
        ]
      },
      {
        "type": "hold",
        "start": 71.198,
        "duration": 2.535000000000011,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 75.161,
        "duration": 6.346000000000004,
        "name": "",
        "pulses": []
      }
    ]
  },
  {
    "id": 1765981672386,
    "name": "Enpi",
    "points": [
      {
        "type": "hold",
        "start": 0.23,
        "duration": 5.297999999999999,
        "name": "",
        "pulses": [
          2.472,
          3.42,
          4.659999999999999,
          4.968999999999999
        ]
      },
      {
        "type": "hold",
        "start": 5.921,
        "duration": 1.2359999999999998,
        "name": "",
        "pulses": [
          0.4289999999999994,
          0.7439999999999998
        ]
      },
      {
        "type": "hold",
        "start": 7.369,
        "duration": 2.261000000000001,
        "name": "",
        "pulses": [
          0.23300000000000054,
          1.4329999999999998,
          1.7599999999999998
        ]
      },
      {
        "type": "hold",
        "start": 9.98,
        "duration": 3.237,
        "name": "",
        "pulses": [
          0.08999999999999986,
          1.2379999999999995,
          2.1239999999999988,
          2.4779999999999998
        ]
      },
      {
        "type": "hold",
        "start": 14.065,
        "duration": 8.897,
        "name": "",
        "pulses": [
          7.892000000000001
        ]
      },
      {
        "type": "hold",
        "start": 24.297,
        "duration": 6.815999999999999,
        "name": "",
        "pulses": [
          5.8679999999999986,
          6.312999999999999
        ]
      },
      {
        "type": "hold",
        "start": 31.44,
        "duration": 5.212999999999997,
        "name": "",
        "pulses": [
          0.12099999999999866,
          0.49299999999999855,
          1.3169999999999966,
          2.2809999999999953,
          2.7390000000000008,
          3.173999999999996,
          4.1889999999999965,
          4.629999999999999
        ]
      },
      {
        "type": "hold",
        "start": 36.839,
        "duration": 2.5549999999999997,
        "name": "",
        "pulses": [
          0.1700000000000017,
          1.5279999999999987,
          1.8740000000000023
        ]
      },
      {
        "type": "hold",
        "start": 41.379,
        "duration": 10.178000000000004,
        "name": "",
        "pulses": [
          5.574000000000005
        ]
      },
      {
        "type": "hold",
        "start": 51.757,
        "duration": 5.044000000000004,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 57.038,
        "duration": 14.75800000000001,
        "name": "",
        "pulses": [
          6.108000000000004,
          6.435000000000002,
          8.14800000000001,
          9.204000000000008
        ]
      }
    ]
  },
  {
    "id": 1765982635805,
    "name": "Unsu",
    "points": [
      {
        "type": "hold",
        "start": 0.575,
        "duration": 4.685,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 6.069,
        "duration": 3.8999999999999995,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 11.017,
        "duration": 4.714,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 16.302,
        "duration": 9.139,
        "name": "",
        "pulses": [
          0.25900000000000034,
          0.41199999999999903,
          7.928000000000001
        ]
      },
      {
        "type": "hold",
        "start": 26.049,
        "duration": 6.9609999999999985,
        "name": "",
        "pulses": [
          6.282000000000004
        ]
      },
      {
        "type": "hold",
        "start": 33.566,
        "duration": 5.335000000000001,
        "name": "",
        "pulses": [
          0.38400000000000034,
          0.5359999999999943,
          1.7389999999999972,
          1.9159999999999968,
          2.271000000000001,
          2.434999999999995,
          2.7419999999999973,
          2.9069999999999965,
          3.5,
          3.718999999999994,
          4.449999999999996,
          4.607999999999997
        ]
      },
      {
        "type": "hold",
        "start": 41.141,
        "duration": 2.1370000000000005,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 43.905,
        "duration": 5.856999999999999,
        "name": "",
        "pulses": [
          5.013999999999996,
          5.304000000000002
        ]
      },
      {
        "type": "hold",
        "start": 50.042,
        "duration": 5.987000000000002,
        "name": "",
        "pulses": [
          0.24799999999999756,
          0.5309999999999988,
          0.9399999999999977,
          1.823999999999998,
          2.286999999999999,
          2.7830000000000013,
          3.7789999999999964,
          4.128
        ]
      },
      {
        "type": "hold",
        "start": 56.701,
        "duration": 4.850000000000001,
        "name": "",
        "pulses": []
      },
      {
        "type": "hold",
        "start": 62.272,
        "duration": 7.146000000000008,
        "name": "",
        "pulses": [
          5.384999999999998,
          6.473999999999997,
          6.705999999999996
        ]
      },
      {
        "type": "hold",
        "start": 70.094,
        "duration": 7.299000000000007,
        "name": "",
        "pulses": [
          4.795000000000002,
          5.868000000000009,
          6.200000000000003,
          6.548000000000002
        ]
      },
      {
        "type": "hold",
        "start": 77.682,
        "duration": 3.4599999999999937,
        "name": "",
        "pulses": [
          0.08799999999999386,
          0.4449999999999932,
          1.6069999999999993,
          1.968999999999994,
          2.6839999999999975
        ]
      },
      {
        "type": "hold",
        "start": 81.914,
        "duration": 7.147000000000006,
        "name": "",
        "pulses": [
          6.647000000000006
        ]
      },
      {
        "type": "hold",
        "start": 89.957,
        "duration": 6.104000000000013,
        "name": "",
        "pulses": [
          3.024000000000001
        ]
      },
      {
        "type": "hold",
        "start": 97.977,
        "duration": 11.016999999999996,
        "name": "",
        "pulses": [
          0.42499999999999716,
          5.6839999999999975,
          6.040999999999997
        ]
      }
    ]
  }
];  
