// --- GESTOR DE INTERFAZ (UI Manager) ---

const canvas = document.getElementById('timelineCanvas');
const ctx = canvas.getContext('2d');

let timerOverride = null;
let timerStyleClass = null;

// --- UTILS ---
// Helper to get time provided by script.js via a global function or variable
// NOTE: script.js must define getCurrentTime() or we need to pass it.
// To avoid cyclical dependencies in this simple architecture, we rely on the global scope.

function resizeCanvas() {
    if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        renderTimeline();
    }
}

function updateTimerUI() {
    const timerEl = document.getElementById('main-timer');
    if (!timerEl) return;

    // Remove override classes first
    timerEl.classList.remove('timer-yellow', 'timer-message');

    if (timerOverride !== null) {
        timerEl.innerText = timerOverride;
        if (timerStyleClass) timerEl.classList.add(timerStyleClass);
    } else {
        // getCurrentTime() must be available globally from script.js
        let sec = typeof getCurrentTime === 'function' ? getCurrentTime() : 0;
        let m = Math.floor(sec / 60);
        let s = Math.floor(sec % 60);
        let ms = Math.floor((sec % 1) * 10);
        timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    }
}

function updateStatus(m) {
    const el = document.getElementById('status-display');
    if (el) el.innerText = m;
}

function renderLoop() {
    renderTimeline();
    // 'state' is global from script.js
    if (typeof state !== 'undefined' && (state === 'recording' || state === 'training')) {
        requestAnimationFrame(renderLoop);
    }
}

function renderTimeline() {
    // Globals required: COL_BG, COL_GRID, etc. (we will define them here or expect them)
    // and currentRhythm, loopStart, loopEnd, isLoopActive, state

    // Safety check for globals
    if (typeof currentRhythm === 'undefined') return;

    ctx.fillStyle = typeof COL_BG !== 'undefined' ? COL_BG : "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let maxTime = 10;
    if (currentRhythm.length > 0) {
        let last = currentRhythm[currentRhythm.length - 1];
        maxTime = Math.max(maxTime, last.start + last.duration + 2);
    }

    // We access global state variables
    const safeState = typeof state !== 'undefined' ? state : 'idle';
    const safeLoopActive = typeof isLoopActive !== 'undefined' ? isLoopActive : false;
    const safeLoopEnd = typeof loopEnd !== 'undefined' ? loopEnd : 5;
    const safeLoopStart = typeof loopStart !== 'undefined' ? loopStart : 0;

    if (safeState === 'recording') {
        const now = typeof getCurrentTime === 'function' ? getCurrentTime() : 0;
        maxTime = Math.max(maxTime, now + 2);
    }
    if (safeLoopActive) maxTime = Math.max(maxTime, safeLoopEnd + 2);

    const scale = canvas.width / maxTime;
    const centerY = canvas.height / 2;

    // Grid
    ctx.strokeStyle = typeof COL_GRID !== 'undefined' ? COL_GRID : "#3e2723";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = 0; t <= maxTime; t += 1) {
        let x = t * scale;
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, 0);
        if (t % 5 === 0) {
            ctx.fillStyle = typeof COL_TEXT !== 'undefined' ? COL_TEXT : "#8d6e63";
            ctx.font = '10px monospace';
            ctx.fillText(t + 's', x + 3, canvas.height - 5);
        }
    }
    ctx.stroke();

    // Loop Area
    if (safeLoopActive || (safeLoopStart !== 0 || safeLoopEnd !== 5)) {
        let ax = safeLoopStart * scale;
        let bx = safeLoopEnd * scale;
        ctx.fillStyle = typeof COL_LOOP_AREA !== 'undefined' ? COL_LOOP_AREA : "rgba(21, 101, 192, 0.3)";
        ctx.fillRect(ax, 0, bx - ax, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = typeof COL_LOOP_LINE !== 'undefined' ? COL_LOOP_LINE : "#1565c0";

        ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, canvas.height); ctx.stroke();
        ctx.fillStyle = typeof COL_LOOP_LINE !== 'undefined' ? COL_LOOP_LINE : "#1565c0";
        ctx.fillText("A", ax + 2, 12);

        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, canvas.height); ctx.stroke();
        ctx.fillStyle = typeof COL_LOOP_LINE !== 'undefined' ? COL_LOOP_LINE : "#1565c0";
        ctx.fillText("B", bx - 10, 12);
    }

    // Rhythm Points
    currentRhythm.forEach((p) => {
        let x = p.start * scale;
        let w = Math.max(3, p.duration * scale);

        const colHit = typeof COL_HIT !== 'undefined' ? COL_HIT : "#ffffff";
        const colHold = typeof COL_HOLD !== 'undefined' ? COL_HOLD : "#d32f2f";
        const colPulse = typeof COL_PULSE !== 'undefined' ? COL_PULSE : "#ffeb3b";

        if (p.type === 'hit') {
            ctx.fillStyle = colHit;
            ctx.fillRect(x, centerY - 20, 3, 40);
            ctx.beginPath();
            ctx.moveTo(x + 1.5, centerY - 25);
            ctx.lineTo(x - 3, centerY - 30);
            ctx.lineTo(x + 6, centerY - 30);
            ctx.fill();
        } else {
            ctx.fillStyle = colHold;
            ctx.fillRect(x, centerY - 10, w, 20);
            if (p.pulses) {
                ctx.fillStyle = colPulse;
                p.pulses.forEach(pt => {
                    let px = (p.start + pt) * scale;
                    ctx.fillRect(px, centerY - 10, 2, 20);
                });
            }
        }
    });

    // Cursor
    let cursorToDraw = typeof getCurrentTime === 'function' ? getCurrentTime() : 0;
    let nowX = cursorToDraw * scale;
    ctx.strokeStyle = typeof COL_CURSOR !== 'undefined' ? COL_CURSOR : "#ffc107";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, canvas.height);
    ctx.stroke();
}

function toggleViewMode(mode) {
    const log = document.getElementById('rhythm-log');
    const focus = document.getElementById('focus-display');
    if (log && focus) {
        if (mode === 'focus') {
            log.style.display = 'none';
            focus.style.display = 'flex';
        } else {
            log.style.display = 'block';
            focus.style.display = 'none';
        }
    }
}

function updateLog() {
    const logDiv = document.getElementById('rhythm-log');
    if (!logDiv) return;

    // Safety
    if (typeof currentRhythm === 'undefined') return;

    let html = '';
    let list = [...currentRhythm].sort((a, b) => a.start - b.start);

    if (list.length === 0) {
        logDiv.innerHTML = '<div style="text-align:center; color:#5d4037; margin-top:20px;">Sin datos</div>';
        return;
    }

    list.forEach((p, index) => {
        let originalIndex = currentRhythm.indexOf(p); // Assuming references match
        let typeIcon = p.type === 'hit' ? '★' : '↔';
        let typeStyle = p.type === 'hit' ? 'item-hit' : 'item-hold';

        let durHtml = p.type === 'hold' ?
            `<span class="lbl">D:</span><input type="number" step="0.1" class="num-input-dur" value="${p.duration.toFixed(2)}" onchange="editVal(${originalIndex}, 'duration', this.value)">` :
            `<span style="width:75px;"></span>`;

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

    if (typeof state !== 'undefined' && state === 'recording') {
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

function highlightLog(idx) {
    document.querySelectorAll('.active-row').forEach(e => e.classList.remove('active-row'));
    const el = document.getElementById(`log-${idx}`);
    const container = document.getElementById('rhythm-log');

    // isUserScrolling global variable from script.js logic if maintained
    // We'll check for it safely
    const userScrolling = (typeof isUserScrolling !== 'undefined') ? isUserScrolling : false;

    if (el && container) {
        el.classList.add('active-row');
        if (!userScrolling) {
            const topPos = el.offsetTop;
            container.scrollTop = topPos - (container.clientHeight / 2) + (el.clientHeight / 2);
        }
    }
}

function updateFocusDisplay(tech) {
    const focusName = document.getElementById('focus-name');
    const focusInfo = document.getElementById('focus-info');
    const focusIcon = document.getElementById('focus-icon');

    if (focusName && focusInfo && focusIcon) {
        if (tech) {
            const idx = (typeof currentRhythm !== 'undefined') ? currentRhythm.indexOf(tech) : -1;
            focusName.innerText = tech.name || "Técnica " + (idx + 1);
            focusInfo.innerText = `${tech.start.toFixed(1)}s` + (tech.type === 'hold' ? ` -> ${(tech.start + tech.duration).toFixed(1)}s` : '');
            focusIcon.innerText = tech.type === 'hit' ? '💥' : '🥋';
            focusIcon.style.transform = "scale(1.2)";
        } else {
            focusIcon.style.transform = "scale(1)";
        }
    }
}

// Library Modal
function openLibraryWindow() {
    const modal = document.getElementById('library-modal');
    if (modal) modal.style.display = 'block';
    updateLibraryList();
}

function closeLibraryWindow() {
    const modal = document.getElementById('library-modal');
    if (modal) modal.style.display = 'none';
}

function updateLibraryList() {
    const listDiv = document.getElementById('modal-list-container');
    if (!listDiv) return;

    if (typeof savedKatas === 'undefined') return;

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
