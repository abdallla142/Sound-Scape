import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let raycaster, mouse;
let audioContext;
const tiles = [];
const activeTiles = [];
let particleSystem, particleVelocities;

const soundKits = {
    "Bell Tone": { type: 'sine', attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.8 },
    "Synth Pad": { type: 'triangle', attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.5 },
    "Percussive": { type: 'square', attack: 0.01, decay: 0.15, sustain: 0.0, release: 0.1 },
    "Wobble": { type: 'sawtooth', attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.3 }
};
let currentKit = soundKits["Bell Tone"];

const themes = {
    "Oceanic Blue": { "--primary-color": "#3498db", "--background-start": "#0f2027", "--background-end": "#203a43", "--particle-color": "#3498db", "--tile-color": "#34495e" },
    "Cosmic Purple": { "--primary-color": "#9b59b6", "--background-start": "#1a0a2e", "--background-end": "#0d0517", "--particle-color": "#9b59b6", "--tile-color": "#3e2a5b" },
    "Forest Green": { "--primary-color": "#2ecc71", "--background-start": "#134e5e", "--background-end": "#71b280", "--particle-color": "#2ecc71", "--tile-color": "#27ae60" },
    "Sunset Orange": { "--primary-color": "#e67e22", "--background-start": "#ff4e50", "--background-end": "#f9d423", "--particle-color": "#e67e22", "--tile-color": "#e88d2d" }
};

let isRecording = false, isPlaying = false;
let recordingStartTime = 0, recordedSequence = [], playbackTimeouts = [];

let recordBtn, playBtn, stopBtn, clearBtn, kitSelect, shareBtn, downloadBtn, enterBtn;
let welcomeScreen, mainUI, shareModal, closeModalBtn, copyLinkBtn, shareUrlInput, themeSwitcher;

function init() {
    setupDOM();
    enterBtn.addEventListener('click', enterWorld, { once: true });
}

function enterWorld() {
    welcomeScreen.style.opacity = '0';
    setTimeout(() => {
        welcomeScreen.classList.add('hidden');
        mainUI.classList.remove('hidden');
    }, 800);

    setupScene();
    setupUI();
    checkForSharedState();
    animate();
}

function setupDOM() {
    welcomeScreen = document.getElementById('welcome-screen');
    mainUI = document.getElementById('main-ui');
    enterBtn = document.getElementById('enter-btn');
    shareModal = document.getElementById('share-modal');
    recordBtn = document.getElementById('record-btn');
    playBtn = document.getElementById('play-btn');
    stopBtn = document.getElementById('stop-btn');
    clearBtn = document.getElementById('clear-btn');
    kitSelect = document.getElementById('kit-select');
    shareBtn = document.getElementById('share-btn');
    downloadBtn = document.getElementById('download-btn');
    closeModalBtn = document.getElementById('close-modal-btn');
    copyLinkBtn = document.getElementById('copy-link-btn');
    shareUrlInput = document.getElementById('share-url-input');
    themeSwitcher = document.getElementById('theme-switcher');
}

function setupScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 25, 35);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('webgl-container').appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 10;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2.2;
    createTileGrid();
    createAtmosphere();
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    const initAudio = () => { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); };
    document.body.addEventListener('mousedown', initAudio, { once: true });
    renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false);
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('keydown', onKeyDown, false);
}

function setupUI() {
    const kitNames = Object.keys(soundKits);
    kitNames.forEach(kitName => {
        const option = document.createElement('option');
        option.value = kitName;
        option.textContent = kitName;
        kitSelect.appendChild(option);
    });

    Object.entries(themes).forEach(([name, colors]) => {
        const dot = document.createElement('div');
        dot.className = 'theme-dot';
        dot.style.backgroundColor = colors['--primary-color'];
        dot.title = name;
        dot.addEventListener('click', () => applyTheme(name));
        themeSwitcher.appendChild(dot);
    });

    kitSelect.addEventListener('change', (e) => selectKit(e.target.value));
    recordBtn.addEventListener('click', toggleRecording);
    playBtn.addEventListener('click', playSequence);
    stopBtn.addEventListener('click', stopAll);
    clearBtn.addEventListener('click', clearSequence);
    shareBtn.addEventListener('click', openShareModal);
    downloadBtn.addEventListener('click', downloadAsMp3);
    closeModalBtn.addEventListener('click', () => shareModal.classList.add('hidden'));
    copyLinkBtn.addEventListener('click', copyShareLink);
    
    applyTheme(Object.keys(themes)[0]);
}

function applyTheme(name) {
    const theme = themes[name];
    if (!theme) return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) {
        root.style.setProperty(key, value);
    }
    
    if (scene) {
        scene.background = new THREE.Color(theme['--background-start']);
        particleSystem.material.color.set(theme['--particle-color']);
        tiles.forEach(tile => tile.material.color.set(theme['--tile-color']));
    }

    document.querySelectorAll('.theme-dot').forEach(dot => dot.classList.remove('active'));
    document.querySelector(`.theme-dot[title="${name}"]`).classList.add('active');
}

function createTileGrid() {
    const gridSize = 25;
    const tileSize = 4;
    const tileGroup = new THREE.Group();
    const tileGeometry = new THREE.BoxGeometry(tileSize, 0.2, tileSize);
    const defaultThemeName = Object.keys(themes)[0];
    const defaultTileColor = themes[defaultThemeName]['--tile-color'];

    for (let i = 0; i < gridSize * gridSize; i++) {
        const material = new THREE.MeshStandardMaterial({ color: defaultTileColor, emissive: 0x000000 });
        const tile = new THREE.Mesh(tileGeometry, material);
        const x = (i % gridSize - Math.floor(gridSize / 2)) * (tileSize + 0.2);
        const z = (Math.floor(i / gridSize) - Math.floor(gridSize / 2)) * (tileSize + 0.2);
        tile.position.set(x, 0, z);
        tile.userData.id = i;
        tileGroup.add(tile);
        tiles.push(tile);
    }
    scene.add(tileGroup);
}

function createAtmosphere() {
    const particles = 10000;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    particleVelocities = [];
    const defaultThemeName = Object.keys(themes)[0];
    const defaultParticleColor = themes[defaultThemeName]['--particle-color'];

    for (let i = 0; i < particles; i++) {
        const x = (Math.random() - 0.5) * 200;
        const y = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 200;
        positions.push(x, y, z);
        particleVelocities.push(0, 0, 0.1 + Math.random() * 0.2);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        size: 0.15,
        color: defaultParticleColor,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
    });
    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

function onKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.metaKey || event.ctrlKey) return;
    const key = event.key.toUpperCase();
    if (key === 'R') toggleRecording();
    else if (key === 'P') playBtn.click();
    else if (key === 'S') stopBtn.click();
    else if (key === 'C') clearBtn.click();
    else if (!isNaN(parseInt(event.key)) && parseInt(event.key) >= 1 && parseInt(event.key) <= 4) {
        const kitName = Object.keys(soundKits)[parseInt(event.key) - 1];
        selectKit(kitName);
    }
}

function selectKit(kitName) {
    currentKit = soundKits[kitName];
    kitSelect.value = kitName;
}

function onDocumentMouseDown(event) {
    if (isPlaying) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tiles);
    if (intersects.length > 0) {
        const tile = intersects[0].object;
        triggerNote(tile);
        if (isRecording) {
            recordedSequence.push({ i: tile.userData.id, t: performance.now() - recordingStartTime, p: tile.position });
        }
    }
}

function triggerNote(tile, isPlayback = false) {
    playSound(tile.position);
    activateTile(tile, isPlayback);
}

function playSound(position) {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const kit = currentKit;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = kit.type;
    const freq = THREE.MathUtils.mapLinear(position.z, -50, 50, 150, 600);
    oscillator.frequency.setValueAtTime(freq, now);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + kit.attack);
    gainNode.gain.linearRampToValueAtTime(0.4 * kit.sustain, now + kit.attack + kit.decay);
    gainNode.gain.setValueAtTime(0.4 * kit.sustain, now + kit.attack + kit.decay + kit.release);
    gainNode.gain.linearRampToValueAtTime(0, now + kit.attack + kit.decay + kit.release + 0.1);
    oscillator.start(now);
    oscillator.stop(now + kit.attack + kit.decay + kit.release + 0.5);
}

function activateTile(tile, isPlayback = false) {
    const hue = tile.position.x / 100 + 0.5;
    const color = new THREE.Color().setHSL(hue, 1.0, 0.5);
    tile.material.emissive.copy(color);
    if(isPlayback) {
        tile.position.y = 0.2;
        setTimeout(() => { tile.position.y = 0; }, 100);
    }
    if (!activeTiles.find(t => t.tile === tile)) {
        activeTiles.push({ tile: tile, color: new THREE.Color(0x000000) });
    }
}

function toggleRecording() {
    if (isRecording) {
        isRecording = false;
        recordBtn.classList.remove('recording');
    } else {
        if(isPlaying) stopAll();
        clearSequence();
        isRecording = true;
        recordingStartTime = performance.now();
        recordBtn.classList.add('recording');
    }
    updateButtonStates();
}

function playSequence() {
    if (recordedSequence.length === 0) return;
    isPlaying = true;
    updateButtonStates();
    let lastTime = 0;
    recordedSequence.forEach(note => {
        const tile = tiles[note.i];
        const timeoutId = setTimeout(() => { if (isPlaying) triggerNote(tile, true); }, note.t);
        playbackTimeouts.push(timeoutId);
        lastTime = Math.max(lastTime, note.t);
    });
    const finalTimeout = setTimeout(() => { isPlaying = false; updateButtonStates(); }, lastTime + 1000);
    playbackTimeouts.push(finalTimeout);
}

function stopAll() {
    isRecording = false;
    recordBtn.classList.remove('recording');

    if (isPlaying) {
        isPlaying = false;
        playbackTimeouts.forEach(clearTimeout);
        playbackTimeouts = [];
    }
    updateButtonStates();
}

function clearSequence() {
    stopAll();
    recordedSequence = [];
    updateButtonStates();
}

function updateButtonStates() {
    const hasSequence = recordedSequence.length > 0;
    recordBtn.disabled = isPlaying;
    playBtn.disabled = isPlaying || isRecording || !hasSequence;
    stopBtn.disabled = !isPlaying && !isRecording;
    clearBtn.disabled = isPlaying || isRecording || !hasSequence;
    shareBtn.disabled = isPlaying || isRecording || !hasSequence;
    downloadBtn.disabled = isPlaying || isRecording || !hasSequence;
}

function openShareModal() {
    if (recordedSequence.length === 0) return;
    const state = {
        theme: document.querySelector('.theme-dot.active').title,
        kit: kitSelect.value,
        sequence: recordedSequence.map(n => ({i: n.i, t: n.t}))
    };
    const data = btoa(JSON.stringify(state));
    const url = `${window.location.origin}${window.location.pathname}?state=${data}`;
    shareUrlInput.value = url;
    shareModal.classList.remove('hidden');
}

function copyShareLink() {
    shareUrlInput.select();
    try {
        document.execCommand('copy');
        copyLinkBtn.textContent = 'Copied!';
    } catch (err) { copyLinkBtn.textContent = 'Error!'; }
    setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
}

function checkForSharedState() {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('state');
    if (data) {
        try {
            const state = JSON.parse(atob(data));
            if (state.theme) applyTheme(state.theme);
            if (state.kit) selectKit(state.kit);
            if (state.sequence) {
                recordedSequence = state.sequence.map(note => ({ ...note, p: tiles[note.i].position }));
                updateButtonStates();
                playSequence();
            }
        } catch (e) { console.error("Failed to parse shared state:", e); }
    }
}

async function downloadAsMp3() {
    if (recordedSequence.length === 0) return;

    const downloadIcon = downloadBtn.querySelector('.icon-wrapper');
    const spinner = downloadBtn.querySelector('.spinner');
    downloadIcon.classList.add('hidden');
    spinner.classList.remove('hidden');
    downloadBtn.disabled = true;

    const lastNote = recordedSequence[recordedSequence.length - 1];
    const duration = (lastNote.t / 1000) + 2;
    const offlineCtx = new OfflineAudioContext(2, 44100 * duration, 44100);

    recordedSequence.forEach(note => {
        const { p: position, t: timeMs } = note;
        const timeSecs = timeMs / 1000;
        const kit = currentKit;
        const now = timeSecs;
        
        const oscillator = offlineCtx.createOscillator();
        const gainNode = offlineCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        oscillator.type = kit.type;
        const freq = THREE.MathUtils.mapLinear(position.z, -50, 50, 150, 600);
        oscillator.frequency.setValueAtTime(freq, now);

        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + kit.attack);
        gainNode.gain.linearRampToValueAtTime(0.4 * kit.sustain, now + kit.attack + kit.decay);
        gainNode.gain.setValueAtTime(0.4 * kit.sustain, now + kit.attack + kit.decay + kit.release);
        gainNode.gain.linearRampToValueAtTime(0, now + kit.attack + kit.decay + kit.release + 0.1);
        
        oscillator.start(now);
        oscillator.stop(now + kit.attack + kit.decay + kit.release + 0.5);
    });

    const renderedBuffer = await offlineCtx.startRendering();
    
    const mp3encoder = new lamejs.Mp3Encoder(2, renderedBuffer.sampleRate, 128);
    const left = renderedBuffer.getChannelData(0);
    const right = renderedBuffer.getChannelData(1);
    const samples = new Int16Array(left.length);
    
    for(let i = 0; i < left.length; i++) {
        samples[i*2] = Math.max(-1, Math.min(1, left[i])) * 32767;
        samples[i*2+1] = Math.max(-1, Math.min(1, right[i])) * 32767;
    }
    
    let mp3Data = [];
    const sampleBlockSize = 1152;
    for (let i = 0; i < samples.length; i += sampleBlockSize * 2) {
        const leftChunk = samples.subarray(i, i + sampleBlockSize);
        const rightChunk = samples.subarray(i + sampleBlockSize, i + sampleBlockSize * 2);
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }
    
    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Soundscape-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    downloadIcon.classList.remove('hidden');
    spinner.classList.add('hidden');
    updateButtonStates();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    const positions = particleSystem.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i+=3) {
        positions[i+2] += particleVelocities[i+2];
        if (positions[i+2] > 100) {
            positions[i+2] = -100;
        }
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;

    for (let i = activeTiles.length - 1; i >= 0; i--) {
        const activeTile = activeTiles[i];
        activeTile.tile.material.emissive.lerp(activeTile.color, 0.08);
        if (activeTile.tile.material.emissive.getHSL({h:0,s:0,l:0}).l < 0.01) {
            activeTile.tile.material.emissive.set(0x000000);
            activeTiles.splice(i, 1);
        }
    }
    renderer.render(scene, camera);
}

init();
