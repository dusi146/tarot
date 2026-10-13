/**
 * Ta Văn Rót: reading flow, frame-independent 3D motion, and oracle UI.
 * Card catalogue: tarot-data.js. Layout and physics: tarot-motion.js.
 */

document.addEventListener('DOMContentLoaded', () => {

  function sceneFailure(message) {
    document.getElementById('intro-screen')?.classList.add('hidden');
    document.body.classList.remove('intro-active');
    const button = document.getElementById('startRitualBtn');
    if (button) { button.disabled = true; button.textContent = message; }
  }
  if (!window.THREE || !window.gsap || !window.TarotMotion || !window.TarotGeometry || !window.TAROT_CARDS) {
    sceneFailure('Không tải được bàn bài. Hãy tải lại trang.');
    return;
  }
  const motion = window.TarotMotion;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  // 1. CẤU HÌNH & DỮ LIỆU BÀI TAROT
  // =========================================================================
  const GEMINI_API_KEY = window.GEMINI_API_KEY || (typeof localStorage !== 'undefined' && localStorage.getItem('GEMINI_API_KEY')) || "{{GEMINI_API_KEY_SECRET}}";
  const GEMINI_MODEL = "gemini-2.5-flash";
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const BASE_IMAGE_PATH = "images/";

  // Danh sách 78 lá bài Tarot chuẩn hoàng gia đầy đủ 100%
  const TAROT_CARDS = window.TAROT_CARDS;

  // 4 Kiểu trải bài
  const SPREAD_CONFIGS = {
    time: {
      id: "time",
      name: "Dòng Thời Gian",
      count: 3,
      slots: [
        { title: "Quá Khứ", desc: "Nguồn cội, bài học đã qua" },
        { title: "Hiện Tại", desc: "Trạng thái năng lượng lúc này" },
        { title: "Tương Lai", desc: "Định hướng và xu thế sắp tới" }
      ],
      meaningText: "Quá khứ → Hiện tại → Tương lai"
    },
    single: {
      id: "single",
      name: "Nhất Điểm",
      count: 1,
      slots: [
        { title: "Thông Điệp", desc: "Chỉ dẫn trọng tâm vũ trụ gửi bạn" }
      ],
      meaningText: "Tập trung thấu suốt một thông điệp cốt lõi cho ngày hôm nay."
    },
    mind: {
      id: "mind",
      name: "Tam Thể",
      count: 3,
      slots: [
        { title: "Thân", desc: "Hành động thực tế bên ngoài" },
        { title: "Tâm", desc: "Cảm xúc và trực giác nội tâm" },
        { title: "Trí", desc: "Tư duy, logic và góc nhìn" }
      ],
      meaningText: "Thân (Hành động) → Tâm (Cảm xúc) → Trí (Tư duy) cân bằng."
    },
    solution: {
      id: "solution",
      name: "Gỡ Rối",
      count: 4,
      slots: [
        { title: "Vấn Đề", desc: "Bản chất thực sự của sự việc" },
        { title: "Trở Ngại", desc: "Rào cản ngầm bạn chưa nhìn ra" },
        { title: "Lời Khuyên", desc: "Chỉ dẫn hành động từ Rót" },
        { title: "Kết Quả", desc: "Kịch bản sau khi bạn hành động" }
      ],
      meaningText: "Vấn đề → Trở ngại ngầm → Lời khuyên của Rót → Kết quả hướng tới."
    }
  };

  // Trạng thái ứng dụng
  const appState = {
    currentStage: 'intent',
    isTransitioning: false,
    activeFlip: null,
    userName: '',
    userQuestion: '',
    userVibe: 'chualanh',
    activeSpread: SPREAD_CONFIGS.time,
    dob: { day: '', month: '', year: '' },
    zodiac: '',
    selectedCards: [],
    usedCardIds: new Set(),
    shuffledCards: [],
    energyProgress: 0,
    isHolding: false,
    isPickingCard: false,
    holdStartTime: 0,
    isVortexSettling: false,
    holdTimer: null,
    rustleInterval: null,
    readingResult: '',
    isReadingAloud: false,
    followupHistory: []
  };
  let sessionVersion = 0;

  // Thuật toán Fisher-Yates xáo ngẫu nhiên 100% với năng lượng bài Xuôi / Ngược
  function shuffleDeckData() {
    // Mỗi lá bài có xác suất ngược ~38% chuẩn chiêm nghiệm Tarot
    const arr = TAROT_CARDS.map(c => ({
      ...c,
      isReversed: Math.random() < 0.38
    }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    appState.shuffledCards = arr;
    appState.usedCardIds.clear();
  }
  shuffleDeckData();

  // =========================================================================
  // 2. KHỞI TẠO BỘ CHỌN NGÀY SINH THÔNG MINH
  // =========================================================================
  const dobDaySelect = document.getElementById('dobDay');
  const dobMonthSelect = document.getElementById('dobMonth');
  const dobYearSelect = document.getElementById('dobYear');
  const zodiacBadge = document.getElementById('zodiacBadge');

  if (dobDaySelect && dobMonthSelect && dobYearSelect) {
    for (let d = 1; d <= 31; d++) {
      dobDaySelect.innerHTML += `<option value="${d}">${d < 10 ? '0' + d : d}</option>`;
    }
    for (let m = 1; m <= 12; m++) {
      dobMonthSelect.innerHTML += `<option value="${m}">Tháng ${m}</option>`;
    }
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1950; y--) {
      dobYearSelect.innerHTML += `<option value="${y}">${y}</option>`;
    }

    function calculateZodiac(day, month) {
      if (!day || !month) return "";
      const dates = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 22, 22];
      const signs = ["Ma Kết", "Bảo Bình", "Song Ngư", "Bạch Dương", "Kim Ngưu", "Song Tử", "Cự Giải", "Sư Tử", "Xử Nữ", "Thiên Bình", "Bọ Cạp", "Nhân Mã"];
      let idx = month - 1;
      if (day < dates[idx]) idx = (idx + 11) % 12;
      return signs[idx];
    }

    function onDateChanged() {
      const d = parseInt(dobDaySelect.value) || 0;
      const m = parseInt(dobMonthSelect.value) || 0;
      const y = parseInt(dobYearSelect.value) || 0;
      appState.dob = { day: d, month: m, year: y };

      if (d && m) {
        appState.zodiac = calculateZodiac(d, m);
        if (zodiacBadge) zodiacBadge.textContent = appState.zodiac;
      } else {
        appState.zodiac = "";
        if (zodiacBadge) zodiacBadge.textContent = "—";
      }
    }

    dobDaySelect.addEventListener('change', onDateChanged);
    dobMonthSelect.addEventListener('change', onDateChanged);
    dobYearSelect.addEventListener('change', onDateChanged);
  }

  // =========================================================================
  // 3. ÂM THANH SYNTHESIS CHÂN THẬT (CHẤT LƯỢNG CAO)
  // =========================================================================
  class HighEndSoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = true;
      this.droneOsc = null;
      this.droneGain = null;
      this.bowlOsc = null;
      this.bowlGain = null;
    }
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (error) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }
    toggle() {
      this.init();
      this.muted = !this.muted;
      if (this.muted) this.stopDrone();
      else this.startDrone();
      return this.muted;
    }
    startDrone() {
      if (this.muted || !this.ctx || this.droneOsc) return;
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.droneGain.gain.exponentialRampToValueAtTime(0.03, this.ctx.currentTime + 2);

      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sine';
      this.droneOsc.frequency.setValueAtTime(108, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, this.ctx.currentTime);

      this.droneOsc.connect(filter);
      filter.connect(this.droneGain);
      this.droneGain.connect(this.ctx.destination);
      this.droneOsc.start();
    }
    stopDrone() {
      if (this.droneGain && this.ctx) {
        const osc = this.droneOsc;
        this.droneOsc = null;
        this.droneGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        if (osc) osc.stop(this.ctx.currentTime + 0.4);
      }
    }
    setBowl(ratio) {
      if (this.muted || !this.ctx) return;
      if (!this.bowlOsc) {
        this.bowlGain = this.ctx.createGain();
        this.bowlGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
        this.bowlOsc = this.ctx.createOscillator();
        this.bowlOsc.type = 'sine';
        this.bowlOsc.frequency.setValueAtTime(432, this.ctx.currentTime);
        this.bowlOsc.connect(this.bowlGain);
        this.bowlGain.connect(this.ctx.destination);
        this.bowlOsc.start();
      }
      this.bowlGain.gain.setTargetAtTime(Math.min(0.09, 0.02 + ratio * 0.07), this.ctx.currentTime, 0.08);
      this.bowlOsc.frequency.setTargetAtTime(432 + ratio * 36, this.ctx.currentTime, 0.08);
    }
    stopBowl() {
      if (this.bowlGain && this.ctx) {
        const osc = this.bowlOsc;
        this.bowlOsc = null;
        this.bowlGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        if (osc) osc.stop(this.ctx.currentTime + 0.5);
      }
    }

    // 1. Tiếng cọ bài giấy lụa xào xạc chân thật
    playSilkCardRustle() {
      if (this.muted || !this.ctx) return;
      // Reuse noise and let the audio clock schedule it; no burst of JS timers.
      if (!this.rustleBuffer) {
            const bufferSize = this.ctx.sampleRate * 0.045;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
              data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.3));
            }
            this.rustleBuffer = buffer;
      }
      for (let i = 0; i < 5; i++) {
            const start = this.ctx.currentTime + i * 0.035;
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.rustleBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600 + Math.random() * 1200, this.ctx.currentTime);
            filter.Q.setValueAtTime(2.2, this.ctx.currentTime);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.035, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
            noise.start(start);
            noise.stop(start + 0.045);
      }
    }

    // 2. Tiếng chuông pha lê Solfeggio 528Hz ngân vang thiền định (2.8s)
    playSolfeggioBell() {
      if (this.muted || !this.ctx) return;
      const freqs = [528, 1056, 1584, 2112];
      const gains = [0.08, 0.035, 0.018, 0.008];

      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.ctx.currentTime);

        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(4.2, this.ctx.currentTime);
        lfoGain.gain.setValueAtTime(2.5, this.ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();

        gain.gain.setValueAtTime(gains[idx], this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00005, this.ctx.currentTime + 2.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 2.9);
        lfo.stop(this.ctx.currentTime + 2.9);
      });
    }

    // 3. Tiếng lướt gió vũ trụ êm ái
    playCosmicBreeze() {
      if (this.muted || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(360, this.ctx.currentTime + 0.2);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.55);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(550, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.58);
    }

    click() {
      if (this.muted || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    }
  }
  const sfx = new HighEndSoundEngine();

  // =========================================================================
  // 4. THREE.JS 3D STUDIO — CHỐNG RĂNG CƯA & TONE MAPPING ĐIỆN ẢNH
  // =========================================================================
  const canvas = document.getElementById('webgl-canvas');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0c22, 0.012);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

  // VỊ TRÍ CAMERA CÂN BẰNG TRỰC DIỆN CHÍNH GIỮA MÀN HÌNH
  function getCameraConfig(stage) {
    const aspect = window.innerWidth / window.innerHeight;
    const isMobile = aspect < 1.0;

    switch (stage) {
      case 'intent':
        return isMobile
          ? { x: 0, y: 1.8, z: 6.8, rotX: -0.18 }
          : { x: 0, y: 1.8, z: 6.0, rotX: -0.18 };

      case 'charge':
        return isMobile
          ? { x: 0, y: 1.8, z: 6.2, rotX: -0.18 }
          : { x: 0, y: 1.8, z: 5.2, rotX: -0.18 };

      case 'draw':
        // Cánh quạt xòe bài được bao quát trọn vẹn, không tràn màn hình
        return isMobile
          ? { x: 0, y: 1.68, z: 6.6, rotX: -0.15 }
          : { x: 0, y: 1.62, z: 5.8, rotX: -0.14 };

      case 'reveal':
        // Bàn trải bài cân đối chính giữa màn hình, lùi xa vừa đủ để bao quát toàn bộ quẻ
        return isMobile
          ? { x: 0, y: 1.58, z: 6.6, rotX: -0.15 }
          : { x: 0, y: 1.55, z: 5.6, rotX: -0.15 };

      default:
        return { x: 0, y: 1.8, z: 6.5, rotX: -0.18 };
    }
  }

  const initCam = getCameraConfig('intent');
  camera.position.set(initCam.x, initCam.y, initCam.z);
  camera.rotation.x = initCam.rotX;

  // RENDERER SIÊU MỊN KHỬ RĂNG CƯA TỐI ĐA
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    sceneFailure('Thiết bị chưa mở được đồ họa 3D. Hãy bật tăng tốc phần cứng rồi tải lại.');
    return;
  }
  const pixelRatioCap = window.innerWidth < 640 ? 1.5 : 2;
  let renderPixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
  renderer.setPixelRatio(renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Ánh sáng điện ảnh
  const ambientLight = new THREE.AmbientLight(0x2d1f4d, 2.2);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.8);
  keyLight.position.set(5, 12, 8);
  scene.add(keyLight);

  const goldAccentLight = new THREE.PointLight(0xd4af37, 3.2, 18);
  goldAccentLight.position.set(0, 1.8, 3.5);
  scene.add(goldAccentLight);

  // One static nebula texture and one particle draw: atmosphere without postprocessing.
  const spaceCanvas = document.createElement('canvas');
  spaceCanvas.width = spaceCanvas.height = 1024;
  const space = spaceCanvas.getContext('2d');
  space.fillStyle = '#080c21'; space.fillRect(0, 0, 1024, 1024);
  for (const cloud of [
    [720, 300, 600, 'rgba(92,56,150,.38)'], [990, 660, 530, 'rgba(33,77,143,.36)'],
    [480, 800, 520, 'rgba(68,48,117,.26)'], [700, 100, 320, 'rgba(103,75,142,.15)']
  ]) {
    const gradient = space.createRadialGradient(cloud[0], cloud[1], 0, cloud[0], cloud[1], cloud[2]);
    gradient.addColorStop(0, cloud[3]); gradient.addColorStop(1, 'rgba(8,12,33,0)');
    space.fillStyle = gradient; space.fillRect(0, 0, 1024, 1024);
  }
  for (let i = 0; i < 1500; i++) {
    space.fillStyle = 'rgba(181,167,221,' + (Math.random() * 0.035) + ')';
    space.fillRect(Math.random() * 1024, Math.random() * 1024, 1, 1);
  }
  // A few crisp distant stars stay visible even on dim mobile screens.
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024;
    space.fillStyle = 'rgba(222,215,249,' + (0.16 + Math.random() * 0.25) + ')';
    space.beginPath(); space.arc(x, y, i % 13 === 0 ? 1 : 0.55, 0, Math.PI * 2); space.fill();
  }
  const spaceTexture = new THREE.CanvasTexture(spaceCanvas);
  spaceTexture.encoding = THREE.sRGBEncoding;
  spaceTexture.repeat.set(1.08, 1.08); spaceTexture.offset.set(-0.04, -0.04);
  scene.background = spaceTexture;

  const starCanvas = document.createElement('canvas');
  starCanvas.width = starCanvas.height = 32;
  const starContext = starCanvas.getContext('2d');
  const starGradient = starContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  starGradient.addColorStop(0, 'rgba(255,255,255,1)');
  starGradient.addColorStop(0.14, 'rgba(242,238,255,.8)');
  starGradient.addColorStop(0.4, 'rgba(203,192,255,.18)');
  starGradient.addColorStop(1, 'rgba(203,192,255,0)');
  starContext.fillStyle = starGradient; starContext.fillRect(0, 0, 32, 32);
  const starTexture = new THREE.CanvasTexture(starCanvas);
  const starCount = window.innerWidth < 640 ? 500 : 850;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starPhases = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 42;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 28;
    starPos[i * 3 + 2] = -3 - Math.random() * 30;
    starPhases[i] = Math.random() * Math.PI * 2;
    const brightness = 0.5 + Math.random() * 0.5;
    starColors[i * 3] = brightness * 0.87;
    starColors[i * 3 + 1] = brightness * 0.85;
    starColors[i * 3 + 2] = brightness;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
  const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({
    map: starTexture, size: 0.14, vertexColors: true, transparent: true,
    opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  const starTime = { value: 0 };
  starField.material.onBeforeCompile = shader => {
    shader.uniforms.uStarTime = starTime;
    shader.vertexShader = 'attribute float aPhase; uniform float uStarTime; varying float vShimmer;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShimmer = 0.65 + 0.35 * sin(aPhase + uStarTime * 0.65);');
    shader.fragmentShader = 'varying float vShimmer;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= vShimmer;\n#include <alphatest_fragment>');
  };
  scene.add(starField);

  const cosmicHalo = new THREE.Group();
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x9e88cc, transparent: true, opacity: 0.28, depthWrite: false });
  const haloGeometry = new THREE.TorusGeometry(1.55, 0.003, 5, 160);
  const haloA = new THREE.Mesh(haloGeometry, haloMaterial);
  haloA.rotation.set(0.38, -0.5, -0.2);
  const haloB = new THREE.Mesh(haloGeometry, haloMaterial);
  haloB.rotation.set(-0.42, 0.68, 0.3);
  haloB.scale.setScalar(1.18);
  cosmicHalo.add(haloA, haloB);
  scene.add(cosmicHalo);

  const runeCanvas = document.createElement('canvas');
  runeCanvas.width = runeCanvas.height = 512;
  const rc = runeCanvas.getContext('2d');
  rc.strokeStyle = 'rgba(188,159,216,.45)'; rc.lineWidth = 1;
  for (const radius of [188, 216, 232]) { rc.beginPath(); rc.arc(256, 256, radius, 0, Math.PI * 2); rc.stroke(); }
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * Math.PI * 2;
    const inner = i % 8 === 0 ? 220 : 227;
    rc.beginPath(); rc.moveTo(256 + Math.cos(angle) * inner, 256 + Math.sin(angle) * inner);
    rc.lineTo(256 + Math.cos(angle) * 232, 256 + Math.sin(angle) * 232); rc.stroke();
  }
  const runeMesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(runeCanvas), transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  runeMesh.rotation.x = -Math.PI / 2;
  runeMesh.position.set(0, -1.1, -0.2);
  scene.add(runeMesh);

  // =========================================================================
  // TẠO TEXTURE MẶT SAU MA THUẬT SIÊU ĐẸP (SACRED GOLD ASTRAL TAROT BACK)
  // =========================================================================
  function createSacredTarotBackTexture() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 1344;
    const ctx = c.getContext('2d'), w = c.width, h = c.height, cx = w / 2, cy = h / 2;
    const bg = ctx.createRadialGradient(cx * 0.7, cy * 0.7, 20, cx, cy, h * 0.7);
    bg.addColorStop(0, '#253258'); bg.addColorStop(0.5, '#111b38'); bg.addColorStop(1, '#080e22');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = 'rgba(220,222,255,' + (0.08 + Math.random() * 0.25) + ')';
      ctx.beginPath(); ctx.arc(24 + Math.random() * (w - 48), 24 + Math.random() * (h - 48), 0.5 + Math.random(), 0, Math.PI * 2); ctx.fill();
    }
    const gold = ctx.createLinearGradient(0, 0, w, h);
    gold.addColorStop(0, '#8c7450'); gold.addColorStop(0.30, '#f0dfb4'); gold.addColorStop(0.65, '#b69a66'); gold.addColorStop(1, '#ead5a2');
    function frame(inset, radius) {
      ctx.beginPath(); ctx.moveTo(inset + radius, inset); ctx.lineTo(w - inset - radius, inset);
      ctx.quadraticCurveTo(w - inset, inset, w - inset, inset + radius); ctx.lineTo(w - inset, h - inset - radius);
      ctx.quadraticCurveTo(w - inset, h - inset, w - inset - radius, h - inset); ctx.lineTo(inset + radius, h - inset);
      ctx.quadraticCurveTo(inset, h - inset, inset, h - inset - radius); ctx.lineTo(inset, inset + radius);
      ctx.quadraticCurveTo(inset, inset, inset + radius, inset); ctx.closePath(); ctx.stroke();
    }
    ctx.strokeStyle = gold; ctx.lineWidth = 3; frame(27, 36);
    ctx.globalAlpha = 0.45; ctx.lineWidth = 1; frame(43, 25); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(cx, cy);
    const glow = ctx.createRadialGradient(0, 0, 55, 0, 0, 290);
    glow.addColorStop(0, 'rgba(196,174,124,.15)'); glow.addColorStop(1, 'rgba(196,174,124,0)');
    ctx.fillStyle = glow; ctx.fillRect(-320, -340, 640, 680);
    ctx.strokeStyle = gold; ctx.lineWidth = 1.5;
    for (const angle of [-0.6, 0.6]) { ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.ellipse(0, 0, 128, 292, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, 203, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = i % 4 === 0 ? 218 : 210; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 203, Math.sin(a) * 203); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#15213d'; ctx.beginPath(); ctx.arc(27, -18, 72, 0, Math.PI * 2); ctx.fill();
    function star(x, y, size) { ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * 0.25, y - size * 0.25); ctx.lineTo(x + size, y); ctx.lineTo(x + size * 0.25, y + size * 0.25); ctx.lineTo(x, y + size); ctx.lineTo(x - size * 0.25, y + size * 0.25); ctx.lineTo(x - size, y); ctx.lineTo(x - size * 0.25, y - size * 0.25); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = gold; star(0, -390, 23); star(0, 390, 23); star(12, 10, 13);
    for (const x of [-268, 268]) for (const y of [-552, 552]) star(x, y, 13);
    ctx.font = '16px Georgia'; ctx.textAlign = 'center'; ctx.fillText('T  V  R', 0, 500);
    ctx.restore();
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    return tex;
  }

  const sacredBackTex = createSacredTarotBackTexture();

  // VIỀN VÀNG KIM LOẠI LẤP LÁNH CAO CẤP
  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xedd59c,
    metalness: 0.94,
    roughness: 0.16
  });

  const backFaceMat = new THREE.MeshBasicMaterial({
    map: sacredBackTex,
    toneMapped: false
  });

  // KÍCH THƯỚC BÀI CHUẨN TỈ LỆ VÀNG HOÀNG GIA (0.70 x 1.22 trên mobile, 0.80 x 1.40 trên PC)
  const CARD_W = 0.80;
  const CARD_H = 1.40;
  const CARD_D = 0.004;
  const roundedCards = window.TarotGeometry.createCards(THREE, CARD_W, CARD_H, CARD_D);
  const cardGeo = roundedCards.back;
  const selectedCardGeo = roundedCards.selected;
  const edgeGeo = roundedCards.outline;
  const edgeLineMat = new THREE.LineBasicMaterial({
    color: 0xffdf78,
    transparent: true,
    opacity: 0.55
  });

  const deckGroup = new THREE.Group();
  scene.add(deckGroup);

  const cardMeshes = [];
  // TRỌN VẸN 78 LÁ BÀI TAROT CHUẨN KINH ĐIỂN TRONG BỘ BÀI 3D
  const TOTAL_DECK_DISPLAY = 78;

  for (let i = 0; i < TOTAL_DECK_DISPLAY; i++) {
    // 100% CẢ 2 MẶT ĐỀU LÀ CARDBACKS KHI CHƯA RÚT -> KHÔNG BAO GIỜ BỊ LỘ BÀI!
    const initialCardMats = [goldRimMat, backFaceMat];

    const mesh = new THREE.Mesh(cardGeo, initialCardMats);

    // GẮN THÊM ĐƯỜNG VIỀN PHÁT SÁNG ÁNH KIM CHO TỪNG LÁ BÀI
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeLineMat);
    edgeLine.visible = false;
    mesh.add(edgeLine);

    mesh.userData = {
      cardData: null,
      deckIndex: i,
      isSelected: false,
      isFlipped: false,
      hoverLift: 0,
      ribbonAngle: 0,
      basePos: new THREE.Vector3().copy(motion.stackPose(i, CARD_D)),
      baseRot: new THREE.Euler(-0.35, 0, 0)
    };

    // Vị trí cọc bài ban đầu: cọc 78 lá xếp chồng dày dặn thanh lịch
    mesh.position.copy(motion.stackPose(i, CARD_D));
    mesh.rotation.set(-0.35, 0, 0);
    deckGroup.add(mesh);
    cardMeshes.push(mesh);
  }

  const idleLayout = { x: 0, y: 0, scale: 1 };
  function updateIdleLayout() {
    const view = motion.viewAt(getCameraConfig('intent'), window.innerWidth / window.innerHeight, 0.25);
    if (window.innerWidth <= 760) {
      const panel = document.querySelector('.config-panel');
      const panelTop = panel ? panel.getBoundingClientRect().top : window.innerHeight * 0.59;
      const top = window.innerHeight < 680 ? 128 : 142;
      const bottom = Math.max(top + 70, panelTop - 20);
      const center = (top + bottom) / 2;
      idleLayout.x = 0;
      idleLayout.y = view.centerY + (0.5 - center / window.innerHeight) * view.height;
      idleLayout.scale = Math.min(1.4, Math.max(0.35, (bottom - top) / window.innerHeight * view.height / CARD_H * 0.80));
    } else {
      idleLayout.x = view.width * 0.245;
      idleLayout.y = view.centerY + view.height * 0.025;
      idleLayout.scale = Math.min(1.65, view.height * 0.62 / CARD_H);
    }
  }
  function layoutIdleCards(time = 0) {
    deckGroup.position.set(idleLayout.x, idleLayout.y + (reducedMotion ? 0 : Math.sin(time * 0.8) * 0.025), 0);
    deckGroup.scale.setScalar(idleLayout.scale);
    deckGroup.rotation.set(0, reducedMotion ? 0 : Math.sin(time * 0.35) * 0.045, 0);
    cardMeshes.forEach((mesh, index) => {
      mesh.visible = index >= TOTAL_DECK_DISPLAY - 3;
      if (!mesh.visible) return;
      const rank = index - (TOTAL_DECK_DISPLAY - 3);
      const positions = [[-0.62, 0.06, -0.12], [0.60, 0.02, -0.08], [0, -0.015, 0.40]];
      mesh.position.set(...positions[rank]);
      mesh.rotation.set(-0.10, rank === 0 ? -0.32 : rank === 1 ? 0.34 : 0.04, rank === 0 ? 0.17 : rank === 1 ? -0.16 : -0.025);
    });
    const cam = getCameraConfig('intent');
    const backgroundScale = (cam.z + 9) / (cam.z + 0.5);
    cosmicHalo.position.set(idleLayout.x * backgroundScale, cam.y + (idleLayout.y - cam.y) * backgroundScale, -9);
    cosmicHalo.scale.setScalar(idleLayout.scale * 1.1 * backgroundScale);
  }
  updateIdleLayout();
  layoutIdleCards();

  const texLoader = new THREE.TextureLoader();

  // =========================================================================
  // 5. KỸ XẢO XOÁY LỐC THIÊN HÀ — CHẬM RÃI & SIÊU MƯỢT (KHÔNG CẮT XÉN)
  // =========================================================================
  const faceCache = new Map();
  function loadCardFace(data) {
    if (faceCache.has(data.id)) return faceCache.get(data.id);
    const entry = { texture: null, ready: false, failed: false, promise: null };
    entry.promise = new Promise(resolve => {
      let finished = false;
      const finish = failed => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        entry.failed = failed;
        entry.ready = !failed;
        resolve(entry);
      };
      const timeout = setTimeout(() => finish(true), 12000);
      entry.texture = texLoader.load(BASE_IMAGE_PATH + data.file, texture => {
        if (finished) return;
        renderer.initTexture(texture);
        finish(false);
      }, undefined, () => finish(true));
      // Set encoding before the material's first shader compilation.
      entry.texture.encoding = THREE.sRGBEncoding;
      entry.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      entry.texture.generateMipmaps = false;
      entry.texture.minFilter = THREE.LinearFilter;
      entry.texture.magFilter = THREE.LinearFilter;
    });
    faceCache.set(data.id, entry);
    return entry;
  }

  function stopMeshMotion(mesh) {
    gsap.killTweensOf([mesh.position, mesh.rotation, mesh.scale]);
  }
  function animateCamera(stage, duration = 0.85) {
    const config = getCameraConfig(stage);
    gsap.to(camera.position, { x: config.x, y: config.y, z: config.z, duration, overwrite: true, ease: 'sine.inOut' });
    gsap.to(camera.rotation, { x: config.rotX, y: 0, z: 0, duration, overwrite: true, ease: 'sine.inOut' });
  }
  function setCardTarget(card, preview) {
    let layout = motion.selectedLayout(appState.activeSpread.count, card.slotIndex,
      window.innerWidth, window.innerHeight, getCameraConfig(preview ? 'draw' : 'reveal'), CARD_W, CARD_H, preview);
    if (preview) {
      const rect = document.getElementById('dockSlot-' + card.slotIndex)?.getBoundingClientRect();
      const width = window.innerWidth, height = window.innerHeight, cam = getCameraConfig('draw');
      const valid = rect && rect.width < width * 0.6;
      const sx = valid ? rect.left + rect.width / 2 : width * (0.25 + card.slotIndex / Math.max(1, appState.activeSpread.count - 1) * 0.5);
      const sy = valid ? rect.top + rect.height / 2 : height - 44;
      const point = motion.screenToWorld(cam, width, height, sx, sy, 1.35);
      const above = motion.screenToWorld(cam, width, height, sx, sy - 12, 1.35);
      layout = { ...point, scale: Math.abs(above.y - point.y) * 2 / CARD_H };
    }
    card.mesh.userData.targetPos = new THREE.Vector3(layout.x, layout.y, layout.z);
    card.mesh.userData.targetScale = layout.scale;
    // Face cards stay parallel so neighboring art never intersects while flipping.
    card.mesh.userData.convergeY = 0;
    return layout;
  }
  function placeSelectedCards(preview, duration = 0.65) {
    appState.selectedCards.forEach(card => {
      const layout = setCardTarget(card, preview);
      if (card === appState.activeFlip) return;
      gsap.to(card.mesh.position, { x: layout.x, y: layout.y, z: layout.z, duration, overwrite: true, ease: 'power2.inOut' });
      gsap.to(card.mesh.scale, { x: layout.scale, y: layout.scale, z: layout.scale, duration, overwrite: true });
      gsap.to(card.mesh.rotation, { x: -0.15, y: card.isFlipped ? Math.PI : 0,
        z: card.isFlipped && card.isReversed ? Math.PI : 0, duration, overwrite: true });
    });
  }

  function updateCardLabels() {
    camera.updateMatrixWorld(true);
    appState.selectedCards.forEach(card => {
      const label = document.getElementById('cardLabel-' + card.slotIndex);
      const target = card.mesh.userData.targetPos;
      if (!label || !target) return;
      label.hidden = !card.isFlipped || card === appState.activeFlip;
      if (label.hidden) return;
      const scale = card.mesh.userData.targetScale;
      let left = Infinity, right = -Infinity, bottom = -Infinity;
      for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const corner = new THREE.Vector3(x * CARD_W * scale, y * CARD_H * scale, 0)
          .applyEuler(card.mesh.rotation).add(target).project(camera);
        const screenX = (corner.x * 0.5 + 0.5) * window.innerWidth;
        left = Math.min(left, screenX); right = Math.max(right, screenX);
        bottom = Math.max(bottom, (-corner.y * 0.5 + 0.5) * window.innerHeight);
      }
      label.textContent = card.data.viName;
      label.style.left = (left + right) / 2 + 'px';
      label.style.top = bottom + 4 + 'px';
      label.style.width = Math.min(180, Math.max(64, (right - left) * 1.2)) + 'px';
    });
  }

  // =========================================================================
  // 6. XÒE CÁNH QUẠT 78 LÁ BÀI & ĐỘNG CƠ TRƯỢT QUÁN TÍNH SIÊU MƯỢT
  // =========================================================================
  const ribbon = { offset: -0.5, target: -0.5, velocity: 0 };
  const drawEntry = { progress: 0 };
  let isDraggingRibbon = false;
  let lastMoveX = 0;
  let lastMoveTime = 0;
  let dragMovedDistance = 0;
  let lastRustleTime = 0;
  let gesture = null;
  let hoverDirty = false;
  let mouseOnCanvas = false;
  let lastInstruction = '';

  let carouselLayout = null;
  let lastNavigationTime = 0;
  let lastDeckPosition = -1;
  function refreshCarouselLayout() {
    const width = window.innerWidth, height = window.innerHeight, cam = getCameraConfig('draw');
    const action = document.querySelector('.draw-action-bar')?.getBoundingClientRect();
    const landscape = height <= 500 && width >= 640 && width > height;
    const hud = document.querySelector('.draw-top-hud')?.getBoundingClientRect();
    const top = hud?.height ? hud.bottom + 18 : height < 480 ? 142 : 174;
    const bottom = landscape ? height - 28 : action?.top > top ? action.top - 22 : height - 220;
    const middle = (top + Math.max(top + 40, bottom)) / 2;
    const areaWidth = landscape ? width - 346 : width;
    const centerX = landscape ? 32 + areaWidth / 2 : width / 2;
    const point = motion.screenToWorld(cam, width, height, centerX, middle, 0.45);
    const upper = motion.screenToWorld(cam, width, height, centerX, middle - 1, 0.45);
    const view = motion.viewAt(cam, width / height, 0.45);
    const scale = Math.min(1.22, Math.max(40, bottom - top) * 0.88 * Math.abs(upper.y - point.y) / CARD_H, view.width * areaWidth / width * 0.46 / CARD_W);
    // Reserve the largest rotated silhouette, including the optional hover lift.
    carouselLayout = { spacing: 1, limit: 38.5, scale, baseX: point.x, baseY: point.y, cameraDepth: cam.z - 0.45, visibleLimit: landscape ? 3 : 4,
      step: scale * (CARD_W + CARD_H * Math.sin(0.05)) * 1.13 };
  }
  function ribbonConfig() { if (!carouselLayout) refreshCarouselLayout(); return carouselLayout; }
  function nearestAvailable(center, except = -1) {
    let best = -1, distance = Infinity;
    cardMeshes.forEach((mesh, idx) => { const d = Math.abs(idx - center); if (idx !== except && !mesh.userData.isSelected && d < distance) { best = idx; distance = d; } });
    return best;
  }
  function updateRibbonCardsPositions(dt) {
    if (appState.currentStage !== 'draw') return;
    const config = ribbonConfig(), now = performance.now();
    if (!isDraggingRibbon && !appState.isTransitioning && !appState.isPickingCard && Math.abs(ribbon.velocity) < 0.35 && now - lastNavigationTime > 140) {
      const index = nearestAvailable(38.5 - ribbon.target);
      if (index >= 0) { ribbon.target = 38.5 - index; ribbon.velocity = 0; }
    }
    const previousOffset = ribbon.offset;
    motion.advanceRibbon(ribbon, dt, config.limit, isDraggingRibbon);
    if (Math.abs(previousOffset - ribbon.offset) > 0.00005) hoverDirty = true;
    const center = 38.5 - ribbon.offset;
    cardMeshes.forEach((mesh, idx) => {
      if (mesh.userData.isSelected) return;
      const delta = idx - center; mesh.userData.ribbonAngle = delta;
      if (Math.abs(delta) >= config.visibleLimit) { mesh.visible = false; return; }
      mesh.visible = true;
      const lift = hoveredCardMesh === mesh && !isDraggingRibbon && !appState.isPickingCard ? 1 : 0;
      mesh.userData.hoverLift += (lift - mesh.userData.hoverLift) * motion.damp(8, dt);
      const pose = motion.carouselPose(delta, config, mesh.userData.hoverLift);
      mesh.userData.basePos.set(pose.x, pose.y, pose.z); mesh.userData.baseScale = pose.scale;
      const progress = drawEntry.progress, start = mesh.userData.entryPos, rot = mesh.userData.entryRot;
      mesh.position.set(THREE.MathUtils.lerp(start.x, pose.x, progress), THREE.MathUtils.lerp(start.y, pose.y, progress), THREE.MathUtils.lerp(start.z, pose.z, progress));
      mesh.rotation.set(THREE.MathUtils.lerp(rot.x, pose.rotX, progress), THREE.MathUtils.lerp(rot.y, pose.rotY, progress), THREE.MathUtils.lerp(rot.z, pose.rotZ, progress));
      mesh.scale.setScalar(THREE.MathUtils.lerp(1, pose.scale, progress));
      mesh.children[0].visible = mesh.userData.hoverLift > 0.1;
    });
    const position = Math.max(0, Math.min(77, Math.round(center)));
    if (position !== lastDeckPosition) {
      lastDeckPosition = position;
      const scrubber = document.getElementById('deckScrubber');
      if (scrubber && document.activeElement !== scrubber) scrubber.value = position;
      const label = document.getElementById('deckPosition'); if (label) label.textContent = (position + 1) + ' / 78';
    }
    if (Math.abs(ribbon.velocity) > 0.8 && now - lastRustleTime > 280) { lastRustleTime = now; sfx.playSilkCardRustle(); }
    updateDrawInstruction();
  }
  document.getElementById('deckScrubber')?.addEventListener('input', event => {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard) return;
    const index = nearestAvailable(Number(event.target.value));
    if (index < 0) return;
    ribbon.target = 38.5 - index; ribbon.velocity = 0;
    lastNavigationTime = performance.now(); hoveredCardMesh = null; hoverDirty = true;
  });

  canvas.addEventListener('wheel', e => {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard) return;
    e.preventDefault();
    lastNavigationTime = performance.now();
    const units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * units;
    ribbon.target = THREE.MathUtils.clamp(ribbon.target - delta / 120, -ribbonConfig().limit - 0.18, ribbonConfig().limit + 0.18);
    ribbon.velocity = 0;
    hoveredCardMesh = null;
    hoverDirty = true;
  }, { passive: false });

  // =========================================================================
  // 7. CHUYỂN CẢNH ĐIỆN ẢNH VÀ QUẢN LÝ CÁC GIAI ĐOẠN
  // =========================================================================
  function switchStage(stageId) {
    document.querySelectorAll('.stage-layer').forEach(el => el.classList.remove('stage-active'));
    const target = document.getElementById(stageId);
    if (target) target.classList.add('stage-active');
    document.body.dataset.stage = appState.currentStage;
  }

  function showToast(msg) {
    const toast = document.getElementById('toastBubble');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
    }
  }

  // GIAI ĐOẠN 2: TỤ KHÍ
  function startChargingStage() {
    if (appState.currentStage !== 'intent') return;
    appState.currentStage = 'charge';
    switchStage('stageCharge');
    cardMeshes.forEach((mesh, index) => {
      mesh.visible = true;
      gsap.to(mesh.position, { ...motion.stackPose(index, CARD_D), duration: 0.6, overwrite: true });
      gsap.to(mesh.rotation, { x: -0.35, y: 0, z: 0, duration: 0.6, overwrite: true });
    });
    gsap.to(deckGroup.scale, { x: 1, y: 1, z: 1, duration: 0.6, overwrite: true });
    gsap.to(cosmicHalo.position, { x: 0, y: -0.2, z: -9, duration: 0.8, overwrite: true });
    gsap.to(cosmicHalo.scale, { x: 2.2, y: 2.2, z: 2.2, duration: 0.8, overwrite: true });

    const cam = getCameraConfig('charge');
    gsap.to(camera.position, { x: cam.x, y: cam.y, z: cam.z, duration: 1.6, ease: "power2.inOut" });
    gsap.to(camera.rotation, { x: cam.rotX, duration: 1.6, ease: "power2.inOut" });
    gsap.to(deckGroup.position, { x: 0, y: 0.2, z: 0, duration: 1.5, ease: "power2.out" });
  }

  // GIAI ĐOẠN 3: XÒE CÁNH QUẠT SÁT KHÍT (1.5s CHẬM RÃI)
  function startDrawStage() {
    if (appState.currentStage !== 'charge') return;
    appState.currentStage = 'draw';
    appState.isTransitioning = true;
    switchStage('stageDraw');
    sfx.playCosmicBreeze();
    gsap.killTweensOf([deckGroup.rotation, deckGroup.position]);
    deckGroup.rotation.set(0, 0, 0);
    deckGroup.position.set(0, 0, 0);
    hoveredCardMesh = null;
    document.getElementById('dockBottom')?.classList.add('show');
    animateCamera('draw');
    renderDockSlots();
    ribbon.offset = ribbon.target = -0.5; ribbon.velocity = 0;
    refreshCarouselLayout(); lastDeckPosition = -1;
    drawEntry.progress = 0;
    cardMeshes.forEach(mesh => {
      stopMeshMotion(mesh);
      mesh.userData.entryPos = mesh.position.clone();
      mesh.userData.entryRot = mesh.rotation.clone();
    });
    gsap.to(drawEntry, { progress: 1, duration: reducedMotion ? 0.15 : 1.4, ease: 'power2.inOut', onComplete: () => {
      appState.isTransitioning = false;
      lastInstruction = '';
      updateDrawInstruction();
      hoverDirty = true;
      canvas.focus({ preventScroll: true });
    } });
    updateDrawInstruction();
  }

  function renderDockSlots() {
    const dockBottom = document.getElementById('dockBottom');
    if (!dockBottom) return;

    dockBottom.innerHTML = appState.activeSpread.slots.map((slot, idx) => `
      <button type="button" class="dock-slot" id="dockSlot-${idx}" data-idx="${idx}" aria-label="${slot.title}: chưa rút bài">
        <span class="slot-role">${slot.title}</span>
        <div class="slot-thumb" id="dockThumb-${idx}">
          <span class="slot-empty-icon">✦</span>
        </div>
        <span class="slot-name" id="dockName-${idx}">—</span>
      </button>
    `).join('');

    // Cho phép click vào từng ô dock để lật bài trên bàn
    dockBottom.querySelectorAll('.dock-slot').forEach(slotEl => {
      slotEl.addEventListener('click', () => {
        if (appState.currentStage === 'reveal') {
          const idx = parseInt(slotEl.dataset.idx, 10);
          const cardObj = appState.selectedCards[idx];
          if (cardObj && !cardObj.isFlipped) {
            flipSelectedCard(cardObj);
          }
        }
      });
    });
  }

  function updateDrawInstruction() {
    const current = appState.selectedCards.length;
    const total = appState.activeSpread.count;
    const moving = isDraggingRibbon || Math.abs(ribbon.target - ribbon.offset) > 0.08 || Math.abs(ribbon.velocity) > 0.35;
    const key = [current, total, appState.isTransitioning, appState.isPickingCard, moving].join(':');
    if (key === lastInstruction) return;
    lastInstruction = key;
    const tag = document.getElementById('drawStepTag');
    const title = document.getElementById('drawStepTxt');
    const pickButton = document.getElementById('pickCenterBtn');
    if (tag) tag.textContent = Math.min(current + 1, total) + ' / ' + total;
    if (title) title.textContent = current < total ? appState.activeSpread.slots[current].title : 'Đã chọn đủ lá';
    if (pickButton) {
      pickButton.disabled = current >= total || appState.isTransitioning || appState.isPickingCard || moving;
      pickButton.innerHTML = appState.isPickingCard ? 'Đang chọn…' : 'Chọn lá này <span aria-hidden="true">↗</span>';
    }
    const scrubber = document.getElementById('deckScrubber'); if (scrubber) scrubber.disabled = current >= total || appState.isTransitioning || appState.isPickingCard;
    document.querySelectorAll('.dock-slot').forEach((slot, index) => slot.classList.toggle('current', index === current));
  }
  function pickCenterCard() {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard || isDraggingRibbon || Math.abs(ribbon.target - ribbon.offset) > 0.08 || Math.abs(ribbon.velocity) > 0.35) return;
    let closest = null;
    cardMeshes.forEach(mesh => {
      if (mesh.visible && !mesh.userData.isSelected && (!closest || Math.abs(mesh.userData.ribbonAngle) < Math.abs(closest.userData.ribbonAngle))) closest = mesh;
    });
    if (closest) pickCard(closest);
  }
  document.getElementById('pickCenterBtn')?.addEventListener('click', pickCenterCard);

  // RÚT BÀI VÀO CHÍNH GIỮA MÀN HÌNH (CÂN ĐỐI TUYỆT ĐỐI)
  function pickCard(mesh) {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard || mesh.userData.isSelected ||
      appState.selectedCards.length >= appState.activeSpread.count) return;
    const slotIndex = appState.selectedCards.length;
    const data = appState.shuffledCards[mesh.userData.deckIndex];
    if (!data || appState.usedCardIds.has(data.id)) return;
    appState.isPickingCard = true;
    cancelGesture();
    mesh.userData.isSelected = true;
    mesh.userData.cardData = data;
    mesh.visible = true;
    mesh.children[0].visible = true;
    appState.usedCardIds.add(data.id);
    stopMeshMotion(mesh);
    if (hoveredCardMesh === mesh) hoveredCardMesh = null;
    ribbon.velocity = 0;
    const face = loadCardFace(data);
    const pickSession = sessionVersion;
    const frontMat = new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false });
    mesh.geometry = selectedCardGeo;
    mesh.material = [goldRimMat, backFaceMat, frontMat];
    const card = { data, mesh, slotIndex, slotTitle: appState.activeSpread.slots[slotIndex].title,
      isReversed: !!data.isReversed, isFlipped: false, isFlipping: false, isPlaced: false, face };
    appState.selectedCards.push(card);
    face.promise.then(result => {
      if (pickSession !== sessionVersion) return;
      if (result.failed) {
        frontMat.map = sacredBackTex;
        frontMat.needsUpdate = true;
        showToast('Chưa tải được ảnh lá bài. Tên và thông điệp vẫn được giữ.');
      }
    });
    sfx.playCosmicBreeze();
    document.getElementById('dockSlot-' + slotIndex)?.classList.add('filled');
    const thumb = document.getElementById('dockThumb-' + slotIndex);
    const name = document.getElementById('dockName-' + slotIndex);
    if (thumb) thumb.innerHTML = '<img src="images/CardBacks.png" alt="Lá bài chưa lật">';
    if (name) name.textContent = 'Lá ' + (slotIndex + 1);
    document.getElementById('dockSlot-' + slotIndex)?.setAttribute('aria-label', card.slotTitle + ': lá bài chưa lật');
    const target = setCardTarget(card, true);
    card.completePick = () => {
      if (pickSession !== sessionVersion || card.isPlaced) return;
      card.isPlaced = true; mesh.visible = false; mesh.children[0].visible = false;
      appState.isPickingCard = false;
      if (appState.selectedCards.length === appState.activeSpread.count && appState.selectedCards.every(c => c.isPlaced)) startRevealStage();
      else {
        const next = nearestAvailable(mesh.userData.deckIndex + 0.6);
        if (next >= 0) ribbon.target = 38.5 - next;
        lastNavigationTime = performance.now(); updateDrawInstruction();
      }
    };
    const duration = reducedMotion ? 0.12 : 0.82;
    card.flight = gsap.timeline({ onComplete: card.completePick });
    card.flight.to(mesh.position, { x: target.x, y: target.y, z: target.z, duration, ease: 'power2.inOut' }, 0)
      .to(mesh.scale, { x: target.scale, y: target.scale, z: target.scale, duration, ease: 'sine.inOut' }, 0)
      .to(mesh.rotation, { x: 0, y: 0, z: 0, duration, ease: 'sine.inOut' }, 0);
    updateDrawInstruction();
  }


  // GIAI ĐOẠN 4: BÀN LẬT BÀI CHÍNH GIỮA MÀN HÌNH (TRỌN VẸN 100% TRONG KHUNG HÌNH)
  function startRevealStage() {
    if (appState.currentStage !== 'draw') return;
    appState.currentStage = 'reveal';
    appState.isTransitioning = true;
    switchStage('stageReveal');
    const labels = document.getElementById('cardLabels');
    if (labels) labels.innerHTML = appState.selectedCards.map(card => '<span class="card-label" id="cardLabel-' + card.slotIndex + '" hidden></span>').join('');
    const revealAction = document.getElementById('summonOracleBtn');
    if (revealAction) { revealAction.textContent = 'Mở tất cả ↗'; revealAction.disabled = true; }
    document.getElementById('oracleTriggerBar')?.classList.add('show');
    hoveredCardMesh = null;
    ribbon.velocity = 0;
    cancelGesture();
    cardMeshes.forEach(mesh => {
      if (mesh.userData.isSelected || !mesh.visible) return;
      stopMeshMotion(mesh);
      gsap.to(mesh.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.4, onComplete: () => { mesh.visible = false; } });
      gsap.to(mesh.position, { y: mesh.position.y - 0.5, duration: 0.4, ease: 'power2.in' });
    });
    animateCamera('reveal');
    appState.selectedCards.forEach(card => { card.mesh.visible = true; });
    placeSelectedCards(false, reducedMotion ? 0.15 : 0.85);
    gsap.delayedCall(0.9, () => {
      appState.isTransitioning = false;
      const revealAction = document.getElementById('summonOracleBtn');
      if (revealAction) revealAction.disabled = false;
      canvas.focus({ preventScroll: true });

    });
  }

  const flipQueue = [];
  async function flipSelectedCard(card) {
    if (appState.currentStage !== 'reveal' || appState.isTransitioning || card.isFlipped || card.isFlipping) return;
    if (appState.activeFlip) {
      if (!flipQueue.includes(card)) flipQueue.push(card);
      return;
    }
    appState.activeFlip = card;
    const flipSession = sessionVersion;
    card.isFlipping = true;
    hoveredCardMesh = null;
    const slotEl = document.getElementById('dockSlot-' + card.slotIndex);
    slotEl?.setAttribute('aria-busy', 'true');
    // Decode and upload artwork before showing the face, including slow connections.
    await card.face.promise;
    if (flipSession !== sessionVersion) return;
    if (appState.currentStage !== 'reveal') { card.isFlipping = false; appState.activeFlip = null; return; }
    stopMeshMotion(card.mesh);
    sfx.playSolfeggioBell();
    const view = motion.viewAt(getCameraConfig('reveal'), window.innerWidth / window.innerHeight, 2.0);
    const focusScale = Math.min(1.15, view.width * 0.76 / CARD_W, view.height * (window.innerHeight < 700 ? 0.32 : 0.50) / CARD_H);
    const rotZ = card.isReversed ? Math.PI : 0;
    const duration = reducedMotion ? 0.12 : 0.52;
    const timeline = gsap.timeline({ onComplete: () => {
      card.isFlipping = false;
      card.isFlipped = true;
      card.mesh.userData.isFlipped = true;
      appState.activeFlip = null;
      updateCardLabels();
      slotEl?.removeAttribute('aria-busy');
      slotEl?.setAttribute('aria-label', card.slotTitle + ': ' + card.data.viName + (card.isReversed ? ', ngược' : ', xuôi'));
      if (appState.selectedCards.every(c => c.isFlipped)) {
        document.getElementById('oracleTriggerBar')?.classList.add('show');
        const action = document.getElementById('summonOracleBtn');
        if (action) { action.textContent = 'Xem lời giải ↗'; action.disabled = false; }
        const title = document.querySelector('.reveal-title-pill');
        const subtitle = document.querySelector('.reveal-sub-pill');
        if (title) title.textContent = 'Quẻ bài đã mở';
        if (subtitle) subtitle.textContent = '';
      }
      const next = flipQueue.shift();
      if (next) flipSelectedCard(next);
    } });
    timeline.to(card.mesh.position, { x: 0, y: view.centerY + view.height * 0.025, z: 2.0, duration, ease: 'power2.inOut' }, 0)
      .to(card.mesh.scale, { x: focusScale, y: focusScale, z: focusScale, duration }, 0)
      .to(card.mesh.rotation, { x: 0, y: Math.PI, z: rotZ, duration: duration * 1.35, ease: 'sine.inOut' }, duration * 0.2)
      .call(() => {
        const thumb = document.getElementById('dockThumb-' + card.slotIndex);
        const name = document.getElementById('dockName-' + card.slotIndex);
        if (thumb) thumb.innerHTML = '<img src="' + BASE_IMAGE_PATH + card.data.file + '" alt="' + card.data.viName + '" class="' + (card.isReversed ? 'reversed-thumb' : '') + '">';
        if (name) name.textContent = card.data.viName + (card.isReversed ? ' · Ngược' : '');
        slotEl?.classList.add('revealed');
      })
      .to({}, { duration: reducedMotion ? 0 : 0.30 })
      .call(() => {
        // Read current targets on landing: resizing mid-flip must not restore stale coordinates.
        const target = setCardTarget(card, false);
        gsap.to(card.mesh.position, { x: target.x, y: target.y, z: target.z, duration, ease: 'sine.inOut' });
        gsap.to(card.mesh.scale, { x: target.scale, y: target.scale, z: target.scale, duration });
        gsap.to(card.mesh.rotation, { x: -0.15, y: Math.PI, z: rotZ, duration });
      })
      .to({}, { duration });
  }


  // =========================================================================
  // 8. RAYCASTER TƯƠNG TÁC CHẠM & CLICK
  // =========================================================================
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredCardMesh = null;
  const rayHits = [];
  const rayTargets = [];

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
  }
  function hitCard() {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    rayTargets.length = rayHits.length = 0;
    if (appState.currentStage === 'draw') {
      cardMeshes.forEach(mesh => { if (mesh.visible && !mesh.userData.isSelected && mesh.userData.baseScale > 0.12) rayTargets.push(mesh); });
    } else if (appState.currentStage === 'reveal') {
      appState.selectedCards.forEach(card => { if (!card.isFlipped) rayTargets.push(card.mesh); });
    }
    raycaster.intersectObjects(rayTargets, false, rayHits);
    return rayHits[0]?.object || null;
  }
  function cancelGesture() {
    const previous = gesture;
    gesture = null;
    isDraggingRibbon = false;
    dragMovedDistance = 0;
    ribbon.velocity = 0;
    hoveredCardMesh = null;
    if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
    canvas.style.cursor = appState.currentStage === 'draw' ? 'grab' : 'default';
  }
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || appState.isTransitioning || appState.isPickingCard || appState.activeFlip ||
      !['draw', 'reveal'].includes(appState.currentStage) || gesture) return;
    pointerPosition(event);
    gesture = { id: event.pointerId, stage: appState.currentStage, x: event.clientX, y: event.clientY,
      card: hitCard(), moved: false, type: event.pointerType };
    canvas.setPointerCapture(event.pointerId);
    lastMoveX = event.clientX;
    lastMoveTime = performance.now();
    dragMovedDistance = 0;
    ribbon.velocity = 0;
    if (appState.currentStage === 'draw') ribbon.target = ribbon.offset;
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    pointerPosition(event);
    mouseOnCanvas = event.pointerType === 'mouse';
    hoverDirty = true;
    if (!gesture || event.pointerId !== gesture.id) return;
    const now = performance.now();
    const deltaX = event.clientX - lastMoveX;
    const elapsed = Math.max(0.008, (now - lastMoveTime) / 1000);
    dragMovedDistance += Math.abs(deltaX);
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8 || dragMovedDistance > 10) gesture.moved = true;
    if (gesture.moved && gesture.stage === 'draw') {
      isDraggingRibbon = true;
      hoveredCardMesh = null;
      const sensitivity = 1 / (window.innerWidth < 640 ? 90 : 130);
      lastNavigationTime = now;
      let delta = deltaX * sensitivity;
      const limit = ribbonConfig().limit;
      if (Math.abs(ribbon.target + delta) > limit) delta *= 0.3;
      ribbon.target = THREE.MathUtils.clamp(ribbon.target + delta, -limit - 0.25, limit + 0.25);
      ribbon.velocity = THREE.MathUtils.clamp(ribbon.velocity * 0.4 + deltaX * sensitivity / elapsed * 0.6, -6, 6);
      canvas.style.cursor = 'grabbing';
    }
    lastMoveX = event.clientX;
    lastMoveTime = now;
  });
  canvas.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    pointerPosition(event);
    lastNavigationTime = performance.now();
    const finished = gesture;
    gesture = null;
    isDraggingRibbon = false;
    const distance = Math.hypot(event.clientX - finished.x, event.clientY - finished.y);
    if (performance.now() - lastMoveTime > 100) ribbon.velocity = 0;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    hoverDirty = true;
    if (finished.moved || distance > 8 || finished.stage !== appState.currentStage || appState.isTransitioning) return;
    const hit = hitCard();
    if (!hit || hit !== finished.card) return;
    if (finished.stage === 'draw') pickCard(hit);
    else {
      const card = appState.selectedCards.find(c => c.mesh === hit);
      if (card) flipSelectedCard(card);
    }
  });
  canvas.addEventListener('pointercancel', cancelGesture);
  canvas.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
  canvas.addEventListener('pointerleave', () => { mouseOnCanvas = false; hoverDirty = true; hoveredCardMesh = null; });
  canvas.addEventListener('keydown', event => {
    if (appState.isTransitioning || appState.isPickingCard || appState.activeFlip) return;
    if (appState.currentStage === 'draw' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const config = ribbonConfig();
      lastNavigationTime = performance.now();
      if (event.key === 'Home') ribbon.target = config.limit;
      else if (event.key === 'End') ribbon.target = -config.limit;
      else ribbon.target += (event.key === 'ArrowRight' ? -1 : 1) * config.spacing;
      ribbon.target = THREE.MathUtils.clamp(ribbon.target, -config.limit, config.limit);
      ribbon.velocity = 0;
      hoveredCardMesh = null;
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat) return;
    if (appState.currentStage === 'draw') {
      pickCenterCard();
    } else if (appState.currentStage === 'reveal') {
      const next = appState.selectedCards.find(card => !card.isFlipped);
      if (next) flipSelectedCard(next);
    }
  });

  // One writer per card transform, one hover raycast per animation frame.
  const clock = new THREE.Clock();
  let sceneTime = 0;
  let frameId = 0;
  let contextLost = false;
  let frameSamples = 0;
  let sampleTime = 0;
  let lastDiagnostics = '';
  const diagnostics = document.getElementById('sceneDiagnostics');
  function renderLoop() {
    if (document.hidden || contextLost) return;
    frameId = requestAnimationFrame(renderLoop);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    sceneTime += dt;
    if (!reducedMotion) {
      starField.rotation.y = sceneTime * 0.003;
      starTime.value = sceneTime;
      spaceTexture.offset.set(-0.04 + Math.sin(sceneTime * 0.035) * 0.014, -0.04 + Math.cos(sceneTime * 0.027) * 0.014);
      haloA.rotation.y = -0.5 + Math.sin(sceneTime * 0.12) * 0.16;
      haloB.rotation.x = -0.42 + Math.cos(sceneTime * 0.10) * 0.16;
      cosmicHalo.rotation.z = Math.sin(sceneTime * 0.12) * 0.10;
      runeMesh.rotation.z = -sceneTime * 0.022;
    }
    if (appState.currentStage === 'intent') {
      layoutIdleCards(sceneTime);
    } else if (appState.currentStage === 'charge' && appState.isHolding && !appState.isVortexSettling) {
      deckGroup.rotation.y += dt * (reducedMotion ? 0.2 : 0.7);
      const follow = motion.damp(6, dt);
      cardMeshes.forEach((mesh, idx) => {
        mesh.visible = idx % 7 === 0;
        if (!mesh.visible) return;
        const rank = Math.floor(idx / 7), tier = Math.floor(rank / 4), angle = rank % 4 * Math.PI / 2 + tier * 0.36;
        mesh.position.x += (Math.cos(angle) * 1.1 - mesh.position.x) * follow;
        mesh.position.y += ((tier - 1) * 0.88 + Math.sin(sceneTime * 0.8 + rank) * 0.012 - mesh.position.y) * follow;
        mesh.position.z += (Math.sin(angle) * 1.1 - mesh.position.z) * follow;
        const targetY = -angle + Math.PI / 2;
        const delta = Math.atan2(Math.sin(targetY - mesh.rotation.y), Math.cos(targetY - mesh.rotation.y));
        mesh.rotation.y += delta * follow; mesh.rotation.x += (-0.08 - mesh.rotation.x) * follow;
        mesh.scale.setScalar(mesh.scale.x + (0.58 - mesh.scale.x) * follow);
      });
    } else if (appState.currentStage === 'draw') updateRibbonCardsPositions(dt);
    if (hoverDirty && !gesture) {
      hoveredCardMesh = mouseOnCanvas && !appState.isTransitioning && !appState.activeFlip ? hitCard() : null;
      canvas.style.cursor = isDraggingRibbon ? 'grabbing' : hoveredCardMesh ? 'pointer' : appState.currentStage === 'draw' ? 'grab' : 'default';
      hoverDirty = false;
    }
    renderer.render(scene, camera);
    if (diagnostics) {
      const flipped = appState.selectedCards.filter(card => card.isFlipped).length;
      const signature = [appState.currentStage, appState.isTransitioning, appState.selectedCards.length, flipped].join(':');
      if (signature !== lastDiagnostics) {
        lastDiagnostics = signature;
        diagnostics.dataset.stage = appState.currentStage;
        diagnostics.dataset.transitioning = String(appState.isTransitioning);
        diagnostics.dataset.selected = appState.selectedCards.length;
        diagnostics.dataset.flipped = flipped;
      }
    }
    if (rawDt > 0 && rawDt < 0.25) { sampleTime += rawDt; frameSamples++; }
    if (sampleTime >= 2) {
      const averageMs = sampleTime / frameSamples * 1000;
      if (averageMs > 23 && renderPixelRatio > 1) {
        renderPixelRatio = Math.max(1, renderPixelRatio * 0.85);
        renderer.setPixelRatio(renderPixelRatio);
      }
      if (diagnostics) {
        diagnostics.dataset.frameMs = averageMs.toFixed(1);
        diagnostics.dataset.drawCalls = renderer.info.render.calls;
        diagnostics.dataset.pixelRatio = renderPixelRatio.toFixed(2);
      }
      sampleTime = frameSamples = 0;
    }
  }
  renderLoop();

  let resizeQueued = false;
  function resizeScene() {
    resizeQueued = false;
    cancelGesture();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderPixelRatio = Math.min(renderPixelRatio, window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
    renderer.setPixelRatio(renderPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    const stage = appState.currentStage === 'oracle' ? 'reveal' : appState.currentStage;
    if (stage === 'intent') { updateIdleLayout(); layoutIdleCards(sceneTime); }
    refreshCarouselLayout();
    animateCamera(stage, 0);
    if (appState.selectedCards.length) {
      if (stage === 'draw') appState.selectedCards.forEach(card => { if (!card.isPlaced) { card.flight?.kill(); card.completePick?.(); } });
      placeSelectedCards(appState.currentStage === 'draw', 0);
    }
    if (stage === 'reveal') updateCardLabels();
    hoverDirty = true;
  }
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(resizeScene);
  });
  // Dock height changes with wrapped labels, fonts, safe areas and card counts.
  const dock = document.getElementById('dockBottom');
  if (window.ResizeObserver) {
    const configPanel = document.querySelector('.config-panel');
    if (configPanel) new ResizeObserver(() => { if (appState.currentStage === 'intent') updateIdleLayout(); }).observe(configPanel);
  }
  if (dock && window.ResizeObserver) {
    new ResizeObserver(() => {
      const height = dock.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--dock-height', height + 'px');
      refreshCarouselLayout();
    }).observe(dock);
  }
  function suspendScene() {
    cancelGesture();
    cancelHold();
    cancelAnimationFrame(frameId);
    gsap.globalTimeline.pause();
  }
  function resumeScene() {
    if (document.hidden || contextLost) return;
    clock.getDelta();
    gsap.globalTimeline.resume();
    cancelAnimationFrame(frameId);
    renderLoop();
  }
  window.addEventListener('blur', () => { cancelGesture(); cancelHold(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendScene(); else resumeScene(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    suspendScene();
    showToast('Đồ họa đang khôi phục. Vui lòng chờ một lát.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    resizeScene();
    resumeScene();
    showToast('Bàn bài đã khôi phục. Bạn có thể tiếp tục.');
  });


  // =========================================================================
  // 10. CÁ NHÂN HÓA TA VĂN RÓT & GEMINI 2.5 FLASH (4096 TOKENS)
  // =========================================================================
  async function requestGeminiOracleReading() {
    const spreadInfo = appState.activeSpread;
    const cards = appState.selectedCards;

    const cardsDetails = cards.map((c, idx) => {
      const slot = spreadInfo.slots[idx];
      const isRev = c.isReversed;
      const orientLabel = isRev ? "BÀI NGƯỢC (Reversed) — Năng lượng hướng nội, điểm nghẽn hoặc bài học cần chuyển hóa" : "BÀI XUÔI (Upright) — Năng lượng thuận dòng, biểu hiện rõ nét bên ngoài";
      const meaningText = isRev ? (c.data.revMeaning || c.data.meaning) : c.data.meaning;
      return `Lá ${idx + 1} [Vị trí: ${slot.title} — ${slot.desc}]: Lá "${c.data.viName} (${c.data.name})" (Hành: ${c.data.element}).
- Chiều bài: ${orientLabel}
- Ý nghĩa cốt lõi: ${meaningText}`;
    }).join('\n\n');

    const vibeMap = {
      chualanh: "Chữa lành: Lắng nghe, vỗ về dịu dàng, thấu cảm sâu sắc, như người bạn thân ngồi bên tách trà ấm.",
      tatnuoc: "Thẳng thắn: Thô nhưng thật, vạch trần ảo tưởng, chỉ rõ thực tế một cách duyên dáng và thức tỉnh.",
      quansu: "Chiến lược: Sắc sảo, thực tế, phân tích nguyên nhân và đưa ra giải pháp từng bước hành động.",
      phansau: "Triết lý sâu: Đào sâu tâm lý, bài học linh hồn của vũ trụ, sự liên kết giữa tiềm thức và thực tại."
    };

    const systemPrompt = `
Bạn là TA VĂN RÓT — người bạn tri kỷ và là người đọc bài Tarot đồng hành cùng người xem.
Bạn xưng là "Rót", gọi người xem là "bạn" (hoặc "bồ" một cách gần gũi).
Văn phong của Rót: Trầm ấm, chân thành, có chiều sâu chiêm nghiệm, không sáo rỗng, đọc vị chuẩn xác tâm lý người xem như đang ngồi trực tiếp đối diện trải bài.

THÔNG TIN QUẺ BÀI:
- Người xem: ${appState.userName || "Người bạn hữu duyên"}
- Ngày sinh: ${appState.dob.day ? `${appState.dob.day}/${appState.dob.month}/${appState.dob.year}` : "Chưa chia sẻ"} (Cung ${appState.zodiac || "Chưa rõ"})
- Trăn trở / Câu hỏi: "${appState.userQuestion || "Xin thông điệp chung soi sáng hành trình hiện tại"}"
- Kiểu trải bài: ${spreadInfo.name} (${spreadInfo.count} lá)
- Tông giọng luận giải: ${vibeMap[appState.userVibe]}

CÁC LÁ BÀI RÚT ĐƯỢC:
${cardsDetails}

YÊU CẦU LUẬN GIẢI CỦA RÓT:
1. Mở đầu bằng lời chào thân tình của Rót và nhận định về luồng năng lượng bao quanh quẻ bài này.
2. Phân tích từng lá bài theo đúng vị trí của kiểu trải bài (${spreadInfo.name}), nêu rõ lá bài đó là XUÔI hay NGƯỢC và ý nghĩa đặc thù của trạng thái đó, liên kết chặt chẽ với câu hỏi và tâm tư của bạn ấy.
3. Tổng kết lời khuyên chân thành và gửi gắm thông điệp chữa lành từ Rót.
4. ĐẶC BIỆT: Viết trọn vẹn, sâu sắc, kết bài hoàn chỉnh, TUYỆT ĐỐI KHÔNG DỪNG DỞ DANG HOẶC CẮT CHỮ.
`;

    const payload = {
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.72,
        maxOutputTokens: 4096
      }
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  // Follow-up Chat
  async function requestGeminiFollowUp(userMsg) {
    const version = sessionVersion;
    appState.followupHistory.push({ role: 'user', text: userMsg });

    const prompt = `
Bối cảnh: Bạn là Ta Văn Rót, vừa xem quẻ Tarot cho bạn ấy.
Tóm tắt lời giải trước đó:
${appState.readingResult.slice(0, 1000)}...

Bạn ấy vừa hỏi thêm: "${userMsg}"
Hãy trả lời với giọng điệu của Ta Văn Rót: ân cần, giải thích sâu sắc hơn dựa trên tinh thần quẻ bài:
`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
    };

    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    const reply = data.candidates[0].content.parts[0].text;
    if (version === sessionVersion) appState.followupHistory.push({ role: 'rot', text: reply });
    return reply;
  }

  // =========================================================================
  // 11. ĐIỀU KHIỂN SỰ KIỆN GIAO DIỆN (DOM EVENTS)
  // =========================================================================

  document.body.dataset.stage = 'intent';

  // Tắt Intro
  // The scene is ready; optional fonts or remote requests must not block entry.
  setTimeout(() => {
      const intro = document.getElementById('intro-screen');
      if (intro) intro.classList.add('hidden');
      document.body.classList.remove('intro-active');
  }, reducedMotion ? 0 : 600);

  // Chọn kiểu trải bài
  document.querySelectorAll('.spread-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      document.querySelectorAll('.spread-tile').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.spread-tile').forEach(tile => tile.setAttribute('aria-pressed', String(tile === btn)));

      const spreadId = btn.dataset.spread;
      appState.activeSpread = SPREAD_CONFIGS[spreadId] || SPREAD_CONFIGS.time;

      const guideText = document.getElementById('spreadGuideText');
      if (guideText) guideText.textContent = appState.activeSpread.slots.map(slot => slot.title).join(' · ');
    });
  });

  // Chọn tông giọng
  document.querySelectorAll('.tone-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      document.querySelectorAll('.tone-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tone-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip === btn)));
      appState.userVibe = btn.dataset.vibe;
    });
  });

  // Mute / Unmute âm thanh
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
      const isMuted = sfx.toggle();
      audioToggleBtn.setAttribute('aria-pressed', String(!isMuted));
      audioToggleBtn.setAttribute('aria-label', isMuted ? 'Bật âm thanh' : 'Tắt âm thanh');
    });
  }

  // Bấm "BƯỚC VÀO BÀN BÀI 3D"
  const startRitualBtn = document.getElementById('startRitualBtn');
  if (startRitualBtn) {
    startRitualBtn.addEventListener('click', () => {
      sfx.click();
      appState.userName = document.getElementById('nameInput').value.trim();
      appState.userQuestion = document.getElementById('questionInput').value.trim();
      startChargingStage();
    });
  }

  // Tụ khí & xáo bài: Nhấn giữ liên tục (Hold to continuously spin & shuffle)
  const chargeOrb = document.getElementById('chargeOrb');
  const chargePct = document.getElementById('chargePct');
  const chargeHint = document.getElementById('chargeHint');
  const chargeTipPill = document.getElementById('chargeTipPill');

  let holdPointerId = null;
  let keyboardHoldTimer = null;
  function resetHoldLabels() {
    chargeOrb?.classList.remove('holding');
    if (chargeHint) chargeHint.textContent = 'Giữ để xáo';
    if (chargeTipPill) chargeTipPill.textContent = 'Thả tay khi bạn sẵn sàng';
  }
  function settleCharge(advance) {
    appState.isVortexSettling = true;
    const timeline = gsap.timeline({ onComplete: () => {
      appState.isVortexSettling = false;
      cardMeshes.forEach(mesh => { mesh.visible = true; });
      if (advance) startDrawStage();
      else resetHoldLabels();
    } });
    deckGroup.rotation.y = Math.atan2(Math.sin(deckGroup.rotation.y), Math.cos(deckGroup.rotation.y));
    timeline.to(deckGroup.rotation, { x: 0, y: 0, z: 0, duration: 0.5, ease: 'sine.inOut', overwrite: true }, 0)
      .to(deckGroup.position, { x: 0, y: 0, z: 0, duration: 0.5, overwrite: true }, 0);
    cardMeshes.forEach((mesh, idx) => {
      stopMeshMotion(mesh);
      mesh.rotation.y = Math.atan2(Math.sin(mesh.rotation.y), Math.cos(mesh.rotation.y));
      const delay = reducedMotion ? 0 : (TOTAL_DECK_DISPLAY - 1 - idx) * 0.003;
      timeline.to(mesh.position, { ...motion.stackPose(idx, CARD_D),
        duration: reducedMotion ? 0.15 : 0.55, ease: 'power2.inOut' }, delay)
        .to(mesh.rotation, { x: -0.35, y: 0, z: 0, duration: reducedMotion ? 0.15 : 0.55, ease: 'sine.inOut' }, delay)
        .to(mesh.scale, { x: 1, y: 1, z: 1, duration: reducedMotion ? 0.15 : 0.55 }, delay);
    });
  }
  function onHoldStart(event) {
    if (appState.currentStage !== 'charge' || appState.isHolding || appState.isVortexSettling) return;
    if (event?.pointerId !== undefined && (!event.isPrimary || event.button !== 0)) return;
    event?.preventDefault();
    holdPointerId = event?.pointerId ?? null;
    if (holdPointerId !== null) chargeOrb.setPointerCapture(holdPointerId);
    gsap.killTweensOf([deckGroup.rotation, deckGroup.position]);
    cardMeshes.forEach(stopMeshMotion);
    appState.isHolding = true;
    appState.holdStartTime = performance.now();
    chargeOrb?.classList.add('holding');
    if (chargeHint) chargeHint.textContent = 'Đang xáo…';
    if (chargeTipPill) chargeTipPill.textContent = 'Thả để chọn bài';
    sfx.init();
    sfx.setBowl(0.7);
    clearInterval(appState.rustleInterval);
    appState.rustleInterval = setInterval(() => sfx.playSilkCardRustle(), 450);
  }
  function releaseHold() {
    appState.isHolding = false;
    clearInterval(appState.rustleInterval);
    keyboardHoldTimer?.kill();
    keyboardHoldTimer = null;
    sfx.stopBowl();
    const id = holdPointerId;
    holdPointerId = null;
    if (id !== null && chargeOrb?.hasPointerCapture(id)) chargeOrb.releasePointerCapture(id);
    chargeOrb?.classList.remove('holding');
  }
  function onHoldEnd(event) {
    if (!appState.isHolding || (event?.pointerId !== undefined && event.pointerId !== holdPointerId)) return;
    const duration = performance.now() - appState.holdStartTime;
    releaseHold();
    if (duration < 350) {
      showToast('Hãy giữ một lát để xáo bài nhé.');
      settleCharge(false);
      return;
    }
    shuffleDeckData();
    if (chargeHint) chargeHint.textContent = 'Đã sẵn sàng';
    if (chargeTipPill) chargeTipPill.textContent = 'Đang mở bàn bài...';
    sfx.playSilkCardRustle();
    sfx.playSolfeggioBell();
    settleCharge(true);
  }
  function cancelHold() {
    if (!appState.isHolding) return;
    releaseHold();
    resetHoldLabels();
    settleCharge(false);
  }
  if (chargeOrb) {
    chargeOrb.addEventListener('pointerdown', onHoldStart);
    chargeOrb.addEventListener('pointerup', onHoldEnd);
    chargeOrb.addEventListener('pointercancel', cancelHold);
    chargeOrb.addEventListener('lostpointercapture', () => { if (appState.isHolding) cancelHold(); });
    chargeOrb.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (event.repeat) return;
      onHoldStart();
      if (event.key === 'Enter' && appState.isHolding) keyboardHoldTimer = gsap.delayedCall(0.9, onHoldEnd);
    });
    chargeOrb.addEventListener('keyup', event => { if (event.key === ' ') onHoldEnd(); });
    chargeOrb.addEventListener('blur', () => { if (holdPointerId === null) cancelHold(); });
  }

  // Bấm "XIN THẦN DỤ TỪ TA VĂN RÓT"
  const summonOracleBtn = document.getElementById('summonOracleBtn');
  const oracleModal = document.getElementById('oracleModal');
  const closeOracleBtn = document.getElementById('closeOracleBtn');
  const oracleScrim = document.getElementById('oracleScrim');
  const readingLoader = document.getElementById('readingLoader');
  const readingText = document.getElementById('readingText');
  const oracleHeading = document.getElementById('oracleHeading');
  const oracleCardsRow = document.getElementById('oracleCardsRow');

  let oraclePending = false;
  if (summonOracleBtn) {
    summonOracleBtn.addEventListener('click', async () => {
      if (appState.currentStage !== 'reveal' || appState.isTransitioning) return;
      const unopened = appState.selectedCards.filter(card => !card.isFlipped);
      if (unopened.length) {
        summonOracleBtn.textContent = 'Đang mở…';
        summonOracleBtn.disabled = true;
        unopened.forEach(card => flipSelectedCard(card));
        return;
      }
      if (appState.activeFlip) return;
      cancelGesture();
      sfx.click();
      appState.currentStage = 'oracle';
      document.body.dataset.stage = 'oracle';

      const dockBottom = document.getElementById('dockBottom');
      if (dockBottom) dockBottom.classList.remove('show');

      if (oracleModal) oracleModal.classList.add('open');
      if (appState.readingResult || oraclePending) return;
      const requestSession = sessionVersion;
      oraclePending = true;
      if (readingLoader) readingLoader.style.display = 'flex';
      if (readingText) readingText.innerHTML = '';
      if (oracleHeading) {
        oracleHeading.textContent = appState.userQuestion ? `"${appState.userQuestion}"` : "Chiêm Nghiệm Hành Trình";
      }

      if (oracleCardsRow) {
        oracleCardsRow.innerHTML = appState.selectedCards.map(c => `
          <div class="mini-card-pill">
            <img src="${BASE_IMAGE_PATH}${c.data.file}" alt="${c.data.viName}" class="${c.isReversed ? 'reversed-thumb' : ''}">
            <span>${c.slotTitle}: ${c.data.viName} ${c.isReversed ? '<span class="slot-reversed-badge">Ngược</span>' : ''}</span>
          </div>
        `).join('');
      }

      try {
        const text = await requestGeminiOracleReading();
        if (requestSession !== sessionVersion) return;
        appState.readingResult = text;
        if (readingLoader) readingLoader.style.display = 'none';

        // A single update lets the user read immediately and avoids per-character layout work.
        if (readingText) readingText.textContent = text;
        const rBlock = document.getElementById('ratingBlock');
        const fBlock = document.getElementById('followupBlock');
        const dBlock = document.getElementById('donateBlock');
        if (rBlock) rBlock.style.display = 'block';
        if (fBlock) fBlock.style.display = 'block';
        if (dBlock) dBlock.style.display = 'flex';

      } catch (err) {
        if (requestSession !== sessionVersion) return;
        if (readingLoader) readingLoader.style.display = 'none';
        if (readingText) readingText.textContent = 'Chưa kết nối được. Đóng và thử lại sau một lát.';
      } finally {
        if (requestSession === sessionVersion) oraclePending = false;
      }
    });
  }

  function handleCloseOracle() {
    appState.currentStage = 'reveal';
    document.body.dataset.stage = 'reveal';
    hoverDirty = true;
    if (oracleModal) oracleModal.classList.remove('open');
    const dockBottom = document.getElementById('dockBottom');
    if (dockBottom && appState.selectedCards.length > 0) dockBottom.classList.add('show');
  }

  if (closeOracleBtn) closeOracleBtn.addEventListener('click', handleCloseOracle);
  if (oracleScrim) oracleScrim.addEventListener('click', handleCloseOracle);

  // Follow-up Chat
  const followupInput = document.getElementById('followupInput');
  const followupSendBtn = document.getElementById('followupSendBtn');
  const followupMsgs = document.getElementById('followupMsgs');

  async function sendFollowup() {
    const version = sessionVersion;
    const txt = followupInput ? followupInput.value.trim() : '';
    if (!txt) return;
    followupInput.value = '';

    if (followupMsgs) {
      followupMsgs.innerHTML += `<div class="msg-bubble user">${txt}</div>`;
      followupMsgs.innerHTML += `<div class="msg-bubble rot" id="rotThinking">Rót đang suy ngẫm...</div>`;
      followupMsgs.scrollTop = followupMsgs.scrollHeight;
    }

    try {
      const reply = await requestGeminiFollowUp(txt);
      if (version !== sessionVersion) return;
      const loading = document.getElementById('rotThinking');
      if (loading) loading.outerHTML = `<div class="msg-bubble rot">${reply}</div>`;
      if (followupMsgs) followupMsgs.scrollTop = followupMsgs.scrollHeight;
    } catch(e) {
      if (version !== sessionVersion) return;
      const loading = document.getElementById('rotThinking');
      if (loading) loading.textContent = "Rót chưa kết nối được, bạn hỏi lại nha!";
    }
  }

  if (followupSendBtn) followupSendBtn.addEventListener('click', sendFollowup);
  if (followupInput) followupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendFollowup();
  });

  // Đánh giá Rating
  document.querySelectorAll('.r-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.r-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const note = document.getElementById('ratingNote');
      if (note) note.textContent = "Rót cảm ơn bạn rất nhiều! Rót đã lưu lại cảm nhận của bạn.";
    });
  });

  // TTS Web Speech đọc lời giải
  const ttsBtn = document.getElementById('ttsBtn');
  const ttsBtnLabel = document.getElementById('ttsBtnLabel');

  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      if (!('speechSynthesis' in window)) {
        showToast("Trình duyệt chưa hỗ trợ đọc giọng nói");
        return;
      }
      if (appState.isReadingAloud) {
        window.speechSynthesis.cancel();
        appState.isReadingAloud = false;
        if (ttsBtnLabel) ttsBtnLabel.textContent = 'Nghe Đọc';
      } else {
        if (!appState.readingResult) return;
        const clean = appState.readingResult.replace(/[#*`_~]/g, '');
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = 'vi-VN';
        utter.rate = 0.95;
        utter.onend = () => {
          appState.isReadingAloud = false;
          if (ttsBtnLabel) ttsBtnLabel.textContent = 'Nghe Đọc';
        };
        window.speechSynthesis.speak(utter);
        appState.isReadingAloud = true;
        if (ttsBtnLabel) ttsBtnLabel.textContent = 'Dừng Đọc';
      }
    });
  }

  // Start another reading without downloading assets or rebuilding WebGL.
  function resetReading() {
    sessionVersion++;
    releaseHold();
    cancelGesture();
    gsap.globalTimeline.clear();
    flipQueue.length = 0;
    appState.currentStage = 'intent';
    appState.isPickingCard = false;
    appState.isTransitioning = false;
    appState.isVortexSettling = false;
    appState.activeFlip = null;
    appState.selectedCards = [];
    appState.readingResult = '';
    appState.followupHistory = [];
    appState.isReadingAloud = false;
    appState.userQuestion = '';
    oraclePending = false;
    window.speechSynthesis?.cancel();
    if (ttsBtnLabel) ttsBtnLabel.textContent = 'Nghe đọc';
    cardMeshes.forEach((mesh, index) => {
      stopMeshMotion(mesh);
      if (mesh.material.length === 3) mesh.material[2].dispose();
      mesh.geometry = cardGeo;
      mesh.material = [goldRimMat, backFaceMat];
      Object.assign(mesh.userData, { isSelected: false, isFlipped: false, cardData: null, targetPos: null, hoverLift: 0, focusLift: 0 });
      mesh.position.copy(motion.stackPose(index, CARD_D));
      mesh.rotation.set(-0.35, 0, 0);
      mesh.scale.setScalar(1);
      mesh.children[0].visible = false;
    });
    // Keep a small warm cache, evicting older artwork between readings.
    for (const [key, face] of faceCache) {
      if (faceCache.size <= 8) break;
      if (!face.ready && !face.failed) continue;
      face.texture.dispose();
      faceCache.delete(key);
    }
    ribbon.offset = ribbon.target = -0.5; ribbon.velocity = 0;
    lastDeckPosition = -1;
    lastInstruction = '';
    drawEntry.progress = 0;
    oracleModal?.classList.remove('open');
    document.getElementById('dockBottom')?.classList.remove('show');
    document.getElementById('oracleTriggerBar')?.classList.remove('show');
    const question = document.getElementById('questionInput');
    if (question) question.value = '';
    const labels = document.getElementById('cardLabels');
    if (labels) labels.innerHTML = '';
    const revealTitle = document.querySelector('.reveal-title-pill');
    const revealSub = document.querySelector('.reveal-sub-pill');
    if (revealTitle) revealTitle.textContent = 'Thông điệp của bạn';
    if (revealSub) revealSub.textContent = 'Chạm một lá để mở';
    if (readingText) readingText.textContent = '';
    if (readingLoader) readingLoader.style.display = 'flex';
    for (const id of ['ratingBlock', 'followupBlock', 'donateBlock']) {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    }
    if (followupMsgs) followupMsgs.innerHTML = '';
    if (followupInput) followupInput.value = '';
    document.getElementById('personalOptions')?.removeAttribute('open');
    document.querySelectorAll('.r-btn').forEach(button => button.classList.remove('active'));
    clearTimeout(showToast.timer);
    document.getElementById('toastBubble')?.classList.remove('show');
    resetHoldLabels();
    shuffleDeckData();
    switchStage('stageIntent');
    animateCamera('intent', reducedMotion ? 0 : 0.4);
    updateIdleLayout();
    layoutIdleCards(sceneTime);
  }
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) restartBtn.addEventListener('click', resetReading);

  // Webhook Lấy danh sách Donate
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyAuUv2_5kIjR7fYPL5m6Xzi2YjSLaobrNTVw1k9zpql-2R6ErwlZ9wFdGiq8oXFjtP/exec';
  async function loadTopDonates() {
    try {
      const res = await fetch(WEBHOOK_URL);
      const json = await res.json();
      if (json.status === 'success' && json.data.length > 0) {
        const track = document.getElementById('donateContent');
        if (track) {
          track.innerHTML = json.data.map(item => `
            <span><strong>${item.name}</strong>: ${item.amount}</span>
          `).join(' &bull; ');
        }
      }
    } catch(e) {}
  }
  if (document.getElementById('donateContent')) loadTopDonates();

});
