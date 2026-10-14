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
  if (!window.THREE || !window.gsap || !window.TarotMotion || !window.TarotGeometry || !window.TarotPersona || !window.TarotReading || !window.TarotTransport || !window.TarotAI || !window.TarotAtmosphere || !window.TarotAudio || !window.TarotRender || !window.TAROT_CARDS) {
    sceneFailure('Không tải được bàn bài. Hãy tải lại trang.');
    return;
  }
  const motion = window.TarotMotion;
  const persona = window.TarotPersona;
  const reading = window.TarotReading;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  // 1. CẤU HÌNH & DỮ LIỆU BÀI TAROT
  // =========================================================================
  const ai = window.TarotAI.create({ endpoint: window.TAROT_SHEETS_CONFIG?.endpoint, fetch: (...args) => fetch(...args) });
  const AI_SOLVER = 'Ta Văn Rót / Groq / openai/gpt-oss-120b';

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
  let sheetSession = null;
  let currentRating = 0;
  const entrance = { active: !reducedMotion, blend: reducedMotion ? 1 : 0 };
  let introTimeline = null;
  const profileStore = window.TarotProfile?.create(() => window.localStorage);
  let updateBirthDate = () => {};

  function rememberProfile() {
    const saved = profileStore?.save({
      name: document.getElementById('nameInput')?.value || '',
      gender: document.getElementById('genderInput')?.value || '',
      dob: appState.dob, vibe: appState.userVibe, spread: appState.activeSpread.id
    });
    const note = document.getElementById('profileMemoryNote');
    if (note && saved === false) note.textContent = 'Trình duyệt này chưa cho phép nhớ thông tin.';
  }

  function beginSheetReading() {
    if (!window.TarotSheets) return null;
    const dob = appState.dob;
    const source = new URLSearchParams(window.location?.search || '').get('ref') || 'Trực tiếp / Không rõ';
    return window.TarotSheets?.begin({
      name: appState.userName || 'Khách',
      dob: dob.day && dob.month && dob.year ? `${dob.day}/${dob.month}/${dob.year}` : 'Không rõ',
      zodiac: appState.zodiac || 'Không rõ',
      gender: document.getElementById('genderInput')?.value || 'Không rõ',
      question: appState.userQuestion || '',
      spread: `${appState.activeSpread.count} lá`,
      vibe: appState.userVibe,
      solver: AI_SOLVER,
      source
    });
  }

  function saveSheetReading(session, conclusion, status, version) {
    session?.record(conclusion, status).catch(() => {
      if (version === sessionVersion) showToast('Chưa xác nhận lưu lịch sử vào Google Sheets.');
    });
  }

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

    function onDateChanged() {
      const d = parseInt(dobDaySelect.value) || 0;
      const m = parseInt(dobMonthSelect.value) || 0;
      const y = parseInt(dobYearSelect.value) || 0;
      appState.dob = { day: d, month: m, year: y };

      if (d && m && persona.validDate(d, m, y || 2000)) {
        appState.zodiac = persona.zodiac(d, m, y || 2000);
        if (zodiacBadge) zodiacBadge.textContent = appState.zodiac;
      } else {
        appState.zodiac = "";
        if (zodiacBadge) zodiacBadge.textContent = d && m ? 'Ngày không hợp lệ' : '—';
      }
      rememberProfile();
    }
    updateBirthDate = onDateChanged;

    dobDaySelect.addEventListener('change', onDateChanged);
    dobMonthSelect.addEventListener('change', onDateChanged);
    dobYearSelect.addEventListener('change', onDateChanged);
  }

  function restoreProfile(profile) {
    document.getElementById('nameInput').value = profile.name;
    document.getElementById('genderInput').value = profile.gender;
    dobDaySelect.value = profile.dob.day;
    dobMonthSelect.value = profile.dob.month;
    dobYearSelect.value = profile.dob.year;
    appState.userName = profile.name;
    appState.userVibe = profile.vibe;
    appState.activeSpread = SPREAD_CONFIGS[profile.spread] || SPREAD_CONFIGS.time;
    document.querySelectorAll('.tone-chip').forEach(button => {
      const active = button.dataset.vibe === appState.userVibe;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.spread-tile').forEach(button => {
      const active = button.dataset.spread === appState.activeSpread.id;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    const description = document.getElementById('toneDescription');
    if (description) description.textContent = persona.tone(appState.userVibe).description;
    const guide = document.getElementById('spreadGuideText');
    if (guide) guide.textContent = appState.activeSpread.slots.map(slot => slot.title).join(' · ');
    updateBirthDate();
  }
  if (profileStore) restoreProfile(profileStore.load());
  for (const id of ['nameInput', 'genderInput']) {
    document.getElementById(id)?.addEventListener('input', rememberProfile);
    document.getElementById(id)?.addEventListener('change', rememberProfile);
  }
  document.getElementById('forgetProfileBtn')?.addEventListener('click', () => {
    restoreProfile(window.TarotProfile.clean());
    profileStore?.clear();
    const note = document.getElementById('profileMemoryNote');
    if (note) note.textContent = 'Rót đã quên thông tin cũ. Bạn có thể nhập lại bất cứ lúc nào.';
  });
  const optionsAccordion = window.TarotUI?.accordion(
    document.getElementById('personalOptions'), document.getElementById('personalOptionsToggle'),
    document.getElementById('personalOptionsContent'), gsap, reducedMotion);

  // =========================================================================
  // 3. ÂM THANH SYNTHESIS CHÂN THẬT (CHẤT LƯỢNG CAO)
  // =========================================================================
  const sfx = new window.TarotAudio();

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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    sceneFailure('Thiết bị chưa mở được đồ họa 3D. Hãy bật tăng tốc phần cứng rồi tải lại.');
    return;
  }
  let renderPixelRatio = window.TarotRender.preferredRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  renderer.setPixelRatio(renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const renderPipeline = window.TarotRender.create(THREE, renderer);
  renderPipeline.resize(window.innerWidth, window.innerHeight, renderPixelRatio);

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
  const atmosphere = window.TarotAtmosphere.create(THREE, scene, starTexture, reducedMotion);
  const ritual = { energy: 0 };
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
    shader.vertexShader = 'attribute float aPhase; uniform float uStarTime; varying float vShimmer;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(aPhase + uStarTime * 0.10) * 0.20;\ntransformed.y += cos(aPhase + uStarTime * 0.08) * 0.14;\nvShimmer = 0.6 + 0.4 * sin(aPhase + uStarTime * 0.85);');
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
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    return tex;
  }

  const sacredBackTex = createSacredTarotBackTexture();
  const backPreviewURL = sacredBackTex.image?.toDataURL?.('image/png') || 'images/CardBacks.png';

  // VIỀN VÀNG KIM LOẠI LẤP LÁNH CAO CẤP
  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xedd59c,
    metalness: 0.78,
    roughness: 0.32
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
  const edgeGeo = new THREE.PlaneGeometry(CARD_W + .06, CARD_H + .06);
  const edgeLineMat = window.TarotRender.outlineMaterial(THREE, CARD_W, CARD_H);

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
    const edgeLine = new THREE.Mesh(edgeGeo, edgeLineMat);
    edgeLine.position.z = CARD_D / 2 + .0005;
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
    const blend = entrance.active ? entrance.blend : 1;
    const center = motion.viewAt(getCameraConfig('intent'), window.innerWidth / window.innerHeight, .25).centerY;
    deckGroup.position.set(idleLayout.x * blend, center + (idleLayout.y - center) * blend + (reducedMotion ? 0 : Math.sin(time * 0.8) * 0.025), 0);
    deckGroup.scale.setScalar((window.innerWidth < 640 ? 1 : 1.4) * (1 - blend) + idleLayout.scale * blend);
    deckGroup.rotation.set(0, reducedMotion ? 0 : Math.sin(time * 0.35) * 0.045, 0);
    cardMeshes.forEach((mesh, index) => {
      mesh.visible = index >= TOTAL_DECK_DISPLAY - 3;
      if (!mesh.visible) return;
      const rank = index - (TOTAL_DECK_DISPLAY - 3);
      const pose = motion.introPose(rank, time, blend);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
      mesh.scale.setScalar(1);
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
      entry.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
      entry.texture.generateMipmaps = true;
      entry.texture.minFilter = THREE.LinearMipmapLinearFilter;
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
      const rect = document.getElementById('dockThumb-' + card.slotIndex)?.getBoundingClientRect();
      const width = window.innerWidth, height = window.innerHeight, cam = getCameraConfig('draw');
      const valid = rect && rect.width > 0 && rect.width < width * 0.3 && rect.height < 120;
      const sx = valid ? rect.left + rect.width / 2 : width * (0.25 + card.slotIndex / Math.max(1, appState.activeSpread.count - 1) * 0.5);
      const sy = valid ? rect.top + rect.height / 2 : height - 54;
      const point = motion.screenToWorld(cam, width, height, sx, sy, 1.35);
      const above = motion.screenToWorld(cam, width, height, sx, sy - (valid ? rect.height / 2 : 23), 1.35);
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
      label.dataset.tone = reading.themeFor(card.slotTitle, card.slotIndex).key;
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
    document.getElementById('swipeGuide')?.classList.add('understood');
  });
  function navigateDeck(direction) {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard) return;
    const center = Math.round(38.5 - ribbon.target);
    let next = center + direction;
    while (next >= 0 && next < 78 && cardMeshes[next].userData.isSelected) next += direction;
    if (next < 0 || next >= 78) return;
    ribbon.target = 38.5 - next; ribbon.velocity = 0;
    lastNavigationTime = performance.now(); hoverDirty = true;
    document.getElementById('swipeGuide')?.classList.add('understood');
    sfx.playSilkCardRustle();
  }
  document.getElementById('previousCardBtn')?.addEventListener('click', () => navigateDeck(-1));
  document.getElementById('nextCardBtn')?.addEventListener('click', () => navigateDeck(1));

  canvas.addEventListener('wheel', e => {
    if (appState.currentStage !== 'draw' || appState.isTransitioning || appState.isPickingCard) return;
    e.preventDefault();
    document.getElementById('swipeGuide')?.classList.add('understood');
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
    if (entrance.active) finishIntro();
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
    document.getElementById('swipeGuide')?.classList.remove('understood');
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
      <button type="button" class="dock-slot" id="dockSlot-${idx}" data-idx="${idx}" data-tone="${reading.themeFor(slot.title, idx).key}" aria-label="${slot.title}: chưa rút bài">
        <span class="slot-role">${slot.title}</span>
        <div class="slot-thumb" id="dockThumb-${idx}">
          <span class="slot-empty-icon" aria-hidden="true"></span>
        </div>
        <span class="slot-name" id="dockName-${idx}"></span>
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
      pickButton.textContent = appState.isPickingCard ? 'Đang nâng lá bài' : 'Rút lá đang xem';
    }
    const scrubber = document.getElementById('deckScrubber'); if (scrubber) scrubber.disabled = current >= total || appState.isTransitioning || appState.isPickingCard;
    for (const id of ['previousCardBtn', 'nextCardBtn']) {
      const button = document.getElementById(id);
      if (button) button.disabled = current >= total || appState.isTransitioning || appState.isPickingCard;
    }
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
    mesh.children[0].material = edgeLineMat.clone();
    mesh.children[0].material.uniforms.uColor.value.set(reading.themeFor(card.slotTitle, slotIndex).color);
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
    atmosphere.burst(mesh.position, mesh.scale.x);
    const slot = document.getElementById('dockSlot-' + slotIndex);
    slot?.classList.add('incoming');
    const thumb = document.getElementById('dockThumb-' + slotIndex);
    const name = document.getElementById('dockName-' + slotIndex);
    if (name) name.textContent = 'Lá ' + (slotIndex + 1);
    document.getElementById('dockSlot-' + slotIndex)?.setAttribute('aria-label', card.slotTitle + ': lá bài chưa lật');
    const target = setCardTarget(card, true);
    card.completePick = () => {
      if (pickSession !== sessionVersion || card.isPlaced) return;
      card.isPlaced = true; mesh.visible = false; mesh.children[0].visible = false;
      slot?.classList.remove('incoming');
      slot?.classList.add('filled', 'arrived');
      if (thumb) thumb.innerHTML = `<img src="${backPreviewURL}" alt="Lá bài đã chọn, chưa lật">`;
      appState.isPickingCard = false;
      if (appState.selectedCards.length === appState.activeSpread.count && appState.selectedCards.every(c => c.isPlaced)) {
        appState.isTransitioning = true;
        gsap.delayedCall(reducedMotion ? 0 : .28, startRevealStage);
      }
      else {
        const next = nearestAvailable(mesh.userData.deckIndex + 0.6);
        if (next >= 0) ribbon.target = 38.5 - next;
        lastNavigationTime = performance.now(); updateDrawInstruction();
      }
    };
    const duration = reducedMotion ? 0.12 : 0.92;
    const lift = { x: mesh.position.x * 0.55 + target.x * 0.45,
      y: Math.max(mesh.position.y, target.y) + (reducedMotion ? 0 : 0.28),
      z: Math.max(mesh.position.z, target.z) + (reducedMotion ? 0 : 0.45) };
    card.flight = gsap.timeline({ onComplete: card.completePick });
    card.flight.to(mesh.position, { ...lift, duration: duration * 0.42, ease: 'sine.out' }, 0)
      .to(mesh.position, { x: target.x, y: target.y, z: target.z, duration: duration * 0.58, ease: 'sine.inOut' }, duration * 0.42)
      .to(mesh.scale, { x: target.scale, y: target.scale, z: target.scale, duration, ease: 'sine.inOut' }, 0)
      .to(mesh.rotation, { x: getCameraConfig('draw').rotX, y: 0, z: 0, duration, ease: 'sine.inOut' }, 0);
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
    if (revealAction) { revealAction.textContent = 'Mở tất cả'; revealAction.disabled = true; }
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
    const riseDuration = reducedMotion ? .12 : .82;
    appState.selectedCards.forEach((card, index) => {
      const delay = reducedMotion ? 0 : .08 + index * .07;
      gsap.delayedCall(delay, () => {
        card.mesh.visible = true;
        card.mesh.children[0].visible = true;
        document.getElementById('dockSlot-' + card.slotIndex)?.classList.add('departing');
        const target = setCardTarget(card, false);
        gsap.to(card.mesh.position, { x: target.x, y: target.y, z: target.z, duration: riseDuration, ease: 'power3.inOut', overwrite: true });
        gsap.to(card.mesh.scale, { x: target.scale, y: target.scale, z: target.scale, duration: riseDuration, ease: 'power2.inOut', overwrite: true });
        gsap.to(card.mesh.rotation, { x: -.15, y: 0, z: 0, duration: riseDuration, ease: 'sine.inOut', overwrite: true });
      });
    });
    gsap.delayedCall(reducedMotion ? .15 : riseDuration + .12 + (appState.selectedCards.length - 1) * .07, () => {
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
    const duration = reducedMotion ? 0.12 : 0.56;
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
        if (action) { action.textContent = 'Xem lời giải'; action.disabled = false; }
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
      .call(() => atmosphere.burst(card.mesh.position, focusScale), null, duration * 0.85)
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
      document.getElementById('swipeGuide')?.classList.add('understood');
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
    atmosphere.update(sceneTime, ritual.energy, dt, renderPixelRatio);
    goldAccentLight.intensity = 3.2 + ritual.energy * 4;
    haloMaterial.opacity = 0.28 + ritual.energy * 0.32;
    runeMesh.material.opacity = 0.22 + ritual.energy * 0.28;
    if (!reducedMotion) {
      starField.rotation.y = Math.sin(sceneTime * 0.07) * 0.04;
      starField.rotation.z = Math.sin(sceneTime * 0.04) * 0.025;
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
      const holdSeconds = Math.max(0, (performance.now() - appState.holdStartTime) / 1000);
      ritual.energy += (motion.shuffleEnergy(holdSeconds) - ritual.energy) * motion.damp(4, dt);
      deckGroup.rotation.y = reducedMotion ? 0 : Math.sin(holdSeconds * 0.35) * 0.12;
      chargeOrb?.style.setProperty('--charge-energy', ritual.energy.toFixed(3));
      updateShuffleMessage(holdSeconds);
      sfx.setBowl(ritual.energy);
      const follow = motion.damp(5.5, dt);
      cardMeshes.forEach((mesh, idx) => {
        const pose = motion.shufflePose(idx, holdSeconds, window.innerWidth < 640, reducedMotion);
        mesh.visible = pose.visible;
        if (!mesh.visible) return;
        mesh.position.x += (pose.x - mesh.position.x) * follow;
        mesh.position.y += (pose.y - mesh.position.y) * follow;
        mesh.position.z += (pose.z - mesh.position.z) * follow;
        const delta = Math.atan2(Math.sin(pose.rotY - mesh.rotation.y), Math.cos(pose.rotY - mesh.rotation.y));
        mesh.rotation.y += delta * follow;
        mesh.rotation.x += (pose.rotX - mesh.rotation.x) * follow;
        mesh.rotation.z += (pose.rotZ - mesh.rotation.z) * follow;
        mesh.scale.setScalar(mesh.scale.x + (pose.scale - mesh.scale.x) * follow);
      });
    } else if (appState.currentStage === 'draw') updateRibbonCardsPositions(dt);
    if (hoverDirty && !gesture) {
      hoveredCardMesh = mouseOnCanvas && !appState.isTransitioning && !appState.activeFlip ? hitCard() : null;
      canvas.style.cursor = isDraggingRibbon ? 'grabbing' : hoveredCardMesh ? 'pointer' : appState.currentStage === 'draw' ? 'grab' : 'default';
      hoverDirty = false;
    }
    renderPipeline.render(scene, camera);
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
        renderPipeline.resize(window.innerWidth, window.innerHeight, renderPixelRatio);
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
    if (entrance.active) finishIntro();
    cancelGesture();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderPixelRatio = window.TarotRender.preferredRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    renderer.setPixelRatio(renderPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderPipeline.resize(window.innerWidth, window.innerHeight, renderPixelRatio);
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
    sfx.pause();
    cancelGesture();
    cancelHold();
    cancelAnimationFrame(frameId);
    gsap.globalTimeline.pause();
  }
  function resumeScene() {
    if (document.hidden || contextLost) return;
    sfx.resume();
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
  // 10. ĐỌC BÀI VÀ TÂM SỰ QUA GROQ TRÊN APPS SCRIPT
  // =========================================================================
  async function requestOracleReading() {
    const currentSpread = { activeSpread: appState.activeSpread, selectedCards: appState.selectedCards.slice() };
    const text = reading.cleanText(await ai.read(appState));
    if (!text) throw new Error('Rót chưa nhận được lời giải đầy đủ.');
    return reading.assertComplete(text, currentSpread);
  }

  async function requestFollowUp(userMsg) {
    const history = appState.followupHistory;
    const completed = history.filter(item => item.role === 'rot').length;
    history.push({ role: 'user', text: userMsg });
    const reply = reading.cleanText(await ai.chat(appState, history));
    if (!reply) throw new Error('Rót chưa nhận được câu trả lời đầy đủ.');
    history.push({ role: 'rot', text: reply });
    return { reply, nudge: completed === 2, history };
  }

  // =========================================================================
  // 11. ĐIỀU KHIỂN SỰ KIỆN GIAO DIỆN (DOM EVENTS)
  // =========================================================================

  document.body.dataset.stage = 'intent';

  function finishIntro() {
    introTimeline?.kill();
    entrance.active = false; entrance.blend = 1;
    document.getElementById('intro-screen')?.classList.add('hidden');
    document.body.classList.remove('intro-active');
    document.body.classList.add('intro-complete');
    document.getElementById('stageIntent')?.removeAttribute('inert');
    updateIdleLayout(); layoutIdleCards(sceneTime);
  }
  function playIntro() {
    if (reducedMotion) { finishIntro(); return; }
    const brand = document.getElementById('introBrand');
    const subtitle = document.getElementById('introSubtitle');
    const rect = document.getElementById('navBrand')?.getBoundingClientRect();
    const valid = rect && rect.width < window.innerWidth * .7;
    const target = valid ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 130, y: 46 };
    document.getElementById('stageIntent')?.setAttribute('inert', '');
    if (brand) gsap.set(brand, { xPercent: -50, yPercent: -50, scale: 1.5 });
    introTimeline = gsap.timeline({ onComplete: finishIntro });
    introTimeline.to(entrance, { blend: 1, duration: 1.3, ease: 'power3.inOut' }, 1.15);
    if (brand) introTimeline.to(brand, {
      x: target.x - window.innerWidth / 2, y: target.y - window.innerHeight * .24,
      scale: 1, duration: 1.05, ease: 'power3.inOut'
    }, 1.45);
    if (subtitle) introTimeline.to(subtitle, { opacity: 0, y: -8, duration: .5 }, 1.4);
  }
  document.getElementById('skipIntroBtn')?.addEventListener('click', finishIntro);
  playIntro();

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
      rememberProfile();
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
      const description = document.getElementById('toneDescription');
      if (description) description.textContent = persona.tone(appState.userVibe).description;
      rememberProfile();
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
      rememberProfile();
      const dob = appState.dob;
      if (dob.day && dob.month && !persona.validDate(dob.day, dob.month, dob.year || 2000)) {
        showToast('Bạn kiểm tra lại ngày sinh nhé, ngày này chưa hợp lệ.');
        return;
      }
      startChargingStage();
    });
  }

  // Tụ khí & xáo bài: Nhấn giữ liên tục (Hold to continuously spin & shuffle)
  const chargeOrb = document.getElementById('chargeOrb');
  const chargeHint = document.getElementById('chargeHint');
  const chargeTipPill = document.getElementById('chargeTipPill');
  const shuffleMessages = [
    'Hít thở một chút. Rót đang ở đây cùng bạn.',
    'Chà, câu hỏi này thật sâu sắc…',
    'Cứ xáo tiếp đến khi bạn thấy vừa lòng nha.',
    'Không cần vội. Cứ để những suy nghĩ lắng xuống một chút.',
    'Khi thấy thích hợp, bạn chỉ cần nhẹ nhàng thả tay.',
    'Rót vẫn đang nghe. Bạn cứ thong thả thôi.'
  ];
  let shuffleMessageIndex = -1;
  function updateShuffleMessage(seconds) {
    const index = Math.floor(seconds / 4.8) % shuffleMessages.length;
    if (index === shuffleMessageIndex || !chargeTipPill) return;
    shuffleMessageIndex = index;
    gsap.killTweensOf(chargeTipPill);
    if (reducedMotion || seconds < .1) { chargeTipPill.textContent = shuffleMessages[index]; return; }
    gsap.to(chargeTipPill, { opacity: 0, y: -5, duration: .3, onComplete: () => {
      if (!appState.isHolding) return;
      chargeTipPill.textContent = shuffleMessages[index];
      gsap.fromTo(chargeTipPill, { y: 5 }, { y: 0, opacity: 1, duration: .55, ease: 'sine.out' });
    } });
  }

  let holdPointerId = null;
  let keyboardHoldTimer = null;
  function resetHoldLabels() {
    chargeOrb?.classList.remove('holding');
    if (chargeHint) chargeHint.textContent = 'Giữ để xáo';
    if (chargeTipPill) chargeTipPill.textContent = 'Thả tay khi bạn thấy sẵn sàng.';
  }
  function settleCharge(advance) {
    appState.isVortexSettling = true;
    gsap.to(ritual, { energy: 0, duration: reducedMotion ? 0.1 : 1.2, ease: 'sine.out', overwrite: true });
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
    shuffleMessageIndex = -1;
    gsap.killTweensOf(ritual);
    ritual.energy = 0;
    chargeOrb?.classList.add('holding');
    if (chargeHint) chargeHint.textContent = 'Đang xáo…';
    updateShuffleMessage(0);
    sfx.init();
    sfx.setBowl(0);
    clearInterval(appState.rustleInterval);
    appState.rustleInterval = setInterval(() => sfx.playSilkCardRustle(), 450);
  }
  function releaseHold() {
    if (chargeTipPill) {
      gsap.killTweensOf(chargeTipPill);
      gsap.set(chargeTipPill, { opacity: 1, y: 0 });
    }
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
  const retryReadingBtn = document.getElementById('retryReadingBtn');

  let oraclePending = false;
  async function openOracleReading() {
      if (!['reveal', 'oracle'].includes(appState.currentStage) || appState.isTransitioning) return;
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
      const readingSheetSession = beginSheetReading();
      sheetSession = readingSheetSession;
      oraclePending = true;
      if (retryReadingBtn) { retryReadingBtn.hidden = true; retryReadingBtn.disabled = true; }
      if (readingLoader) readingLoader.style.display = 'flex';
      if (readingText) readingText.innerHTML = '';
      if (oracleHeading) {
        oracleHeading.textContent = appState.userQuestion || 'Chiêm nghiệm hành trình';
      }

      if (oracleCardsRow) {
        reading.renderCards(oracleCardsRow, appState, document, BASE_IMAGE_PATH);
      }

      try {
        const text = await requestOracleReading();
        saveSheetReading(readingSheetSession, text, 'Thành công', requestSession);
        if (requestSession !== sessionVersion) return;
        appState.readingResult = text;
        if (readingLoader) readingLoader.style.display = 'none';

        // A single update lets the user read immediately and avoids per-character layout work.
        if (readingText) reading.render(readingText, text, appState, document);
        const rBlock = document.getElementById('ratingBlock');
        const fBlock = document.getElementById('followupBlock');
        const dBlock = document.getElementById('donateBlock');
        const supportLetter = document.getElementById('supportLetter');
        if (rBlock) rBlock.style.display = 'block';
        if (fBlock) fBlock.style.display = 'block';
        if (dBlock) dBlock.style.display = 'flex';
        if (supportLetter) supportLetter.style.display = 'block';

      } catch (err) {
        saveSheetReading(readingSheetSession, `Lỗi API: ${err.message || 'Không có lời giải'}`, 'Thất bại', requestSession);
        if (requestSession !== sessionVersion) return;
        if (readingLoader) readingLoader.style.display = 'none';
        if (readingText) { readingText.classList.add('reading-plain'); readingText.textContent = err.message || 'Rót chưa kết nối được. Bạn thử lại sau một chút nhé.'; }
        if (retryReadingBtn) retryReadingBtn.hidden = false;
      } finally {
        if (requestSession === sessionVersion) { oraclePending = false; if (retryReadingBtn) retryReadingBtn.disabled = false; }
      }
  }
  summonOracleBtn?.addEventListener('click', openOracleReading);
  retryReadingBtn?.addEventListener('click', openOracleReading);

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
  let followupPending = false;

  function appendFollowupBubble(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role}`;
    bubble.textContent = text;
    followupMsgs?.appendChild(bubble);
    if (followupMsgs) followupMsgs.scrollTop = followupMsgs.scrollHeight;
    return bubble;
  }

  async function sendFollowup() {
    const version = sessionVersion;
    const readingSheetSession = sheetSession;
    const txt = followupInput ? followupInput.value.trim() : '';
    if (!txt || followupPending || !appState.readingResult) return;
    followupPending = true;
    if (followupSendBtn) followupSendBtn.disabled = true;
    followupInput.value = '';
    appendFollowupBubble('user', txt);
    const loading = appendFollowupBubble('rot', 'Rót đang lắng nghe…');
    const history = appState.followupHistory;

    try {
      const result = await requestFollowUp(txt);
      const reply = result.reply;
      if (result.nudge) result.history[result.history.length - 1].text += `\n\n${persona.DONATION_NUDGE}\n${persona.DONATION_URL}`;
      readingSheetSession?.followup({
        followUpQ: result.history.filter(item => item.role === 'user').map(item => `Khách: ${item.text}`).join('\n---\n'),
        followUpA: result.history.filter(item => item.role === 'rot').map(item => `Rót: ${item.text}`).join('\n---\n')
      }).catch(() => {
        if (version === sessionVersion) showToast('Chưa lưu được phần hỏi thêm vào Google Sheets.');
      });
      if (version !== sessionVersion) return;
      loading.textContent = reply;
      if (result.nudge) {
        const invitation = document.createElement('p'); invitation.className = 'conversation-invitation';
        invitation.textContent = persona.DONATION_NUDGE;
        const link = document.createElement('a'); link.className = 'donate-link';
        link.href = persona.DONATION_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Chuyển đổi link đơn hàng ủng hộ Rót';
        loading.appendChild(invitation); loading.appendChild(link);
      }
      if (followupMsgs) followupMsgs.scrollTop = followupMsgs.scrollHeight;
    } catch(e) {
      if (history[history.length - 1]?.role === 'user') history.pop();
      if (version !== sessionVersion) return;
      loading.textContent = e.message || 'Rót chưa kết nối được, bạn hỏi lại nha!';
    } finally {
      if (version === sessionVersion) {
        followupPending = false;
        if (followupSendBtn) followupSendBtn.disabled = false;
      }
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
      currentRating = Number(btn.dataset.v);
      const note = document.getElementById('ratingNote');
      if (note) note.textContent = `Bạn chọn ${currentRating} sao. Nhấn Gửi đánh giá để lưu.`;
    });
  });

  const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
  submitFeedbackBtn?.addEventListener('click', async () => {
    if (submitFeedbackBtn.disabled) return;
    const note = document.getElementById('ratingNote');
    if (!currentRating) { if (note) note.textContent = 'Bạn chọn số sao trước nhé.'; return; }
    if (!sheetSession) { if (note) note.textContent = 'Chưa kết nối Google Sheets.'; return; }
    const version = sessionVersion;
    submitFeedbackBtn.disabled = true;
    if (note) note.textContent = 'Đang lưu đánh giá…';
    try {
      await sheetSession.feedback({
        rating: currentRating,
        ratingNote: document.getElementById('ratingNoteInput')?.value.trim() || '',
        feedback: document.getElementById('feedbackInput')?.value.trim() || ''
      });
      if (version === sessionVersion && note) note.textContent = 'Đã lưu đánh giá. Rót cảm ơn bạn!';
    } catch (error) {
      if (version === sessionVersion && note) note.textContent = `Chưa lưu được. ${error.message}`;
    } finally {
      if (version === sessionVersion) submitFeedbackBtn.disabled = false;
    }
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
    sheetSession = null;
    ritual.energy = 0;
    currentRating = 0;
    followupPending = false;
    if (followupSendBtn) followupSendBtn.disabled = false;
    if (submitFeedbackBtn) submitFeedbackBtn.disabled = false;
    for (const id of ['ratingNoteInput', 'feedbackInput']) {
      const input = document.getElementById(id);
      if (input) input.value = '';
    }
    const ratingNote = document.getElementById('ratingNote');
    if (ratingNote) ratingNote.textContent = '';
    oraclePending = false;
    if (retryReadingBtn) retryReadingBtn.hidden = true;
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
      if (mesh.children[0].material !== edgeLineMat) mesh.children[0].material.dispose();
      mesh.children[0].material = edgeLineMat;
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
    for (const id of ['ratingBlock', 'followupBlock', 'donateBlock', 'supportLetter']) {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    }
    if (followupMsgs) followupMsgs.innerHTML = '';
    if (followupInput) followupInput.value = '';
    optionsAccordion?.close(true);
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
  async function loadTopDonates() {
    try {
      const json = await window.TarotSheets?.topDonates?.();
      if (json?.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
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
