// --- MOTOR DE AUDIO (Audio Engine) ---

let audioCtx;
let masterGainNode;
let droneOscillator = null;
let droneGain = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!masterGainNode) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.connect(audioCtx.destination);
        const volumeSlider = document.getElementById('volume-slider');
        const initialVolume = volumeSlider ? volumeSlider.value : 50;
        setMasterVolume(initialVolume);
    }
}

function setMasterVolume(value) {
    const volumePercent = parseInt(value, 10);
    const volDisplay = document.getElementById('volume-percent');
    if (volDisplay) volDisplay.innerText = `${volumePercent}%`;

    if (masterGainNode) {
        // Use exponential-like curve for better volume control feel if desired, 
        // but linear is kept for consistency with original code unless requested.
        const gainValue = volumePercent / 100.0;
        if (audioCtx) {
            masterGainNode.gain.setValueAtTime(gainValue, audioCtx.currentTime);
        }
    }
}

function playTone(type) {
    if (!audioCtx || !masterGainNode) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGainNode);

    if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.2);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(3.5, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
    } else if (type === 'pulse') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(4.0, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.09);
    }
}

function playDrone(active) {
    if (!audioCtx || !masterGainNode) return;
    if (active) {
        if (droneOscillator) return;
        const t = audioCtx.currentTime;
        droneOscillator = audioCtx.createOscillator();
        droneGain = audioCtx.createGain();
        droneOscillator.type = 'triangle';
        droneOscillator.frequency.setValueAtTime(180, t);
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        droneOscillator.connect(filter);
        filter.connect(droneGain);
        droneGain.connect(masterGainNode);
        droneGain.gain.setValueAtTime(0, t);
        droneGain.gain.linearRampToValueAtTime(3.0, t + 0.05);
        droneOscillator.start(t);
    } else {
        if (droneOscillator) {
            const t = audioCtx.currentTime;
            try {
                droneGain.gain.cancelScheduledValues(t);
                droneGain.gain.setValueAtTime(droneGain.gain.value, t);
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
        osc.connect(g);
        g.connect(masterGainNode);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.start(t);
        osc.stop(t + 2.0);
    });
}
