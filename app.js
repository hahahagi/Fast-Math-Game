// app.js – Fast Math Game (sync size + mirror overlay)
// -------------------------------------------------
// 1) Tambahkan class "mirror" di HTML/CSS:
//      <video id="webcam" class="mirror" ...></video>
//      <canvas id="overlay" class="mirror"></canvas>
//    dan di CSS:
//      .mirror { transform: scaleX(-1); }
//    → Video tampil seperti cermin, dan kanvas mengikuti.
// 2) Kode di bawah menyamakan ukuran canvas dengan video
//    setiap kali metadata video tersedia, sehingga landmark
//    digambar tepat di posisi tangan (tidak geser / kebalik).
// -------------------------------------------------

/*****************
 * DOM REFERENCES *
 *****************/
const correctSound = document.getElementById("sound-correct");
const wrongSound = document.getElementById("sound-wrong");
const finishSound = document.getElementById("sound-finish");

const $ = (id) => document.getElementById(id);
const questionEl = $("question");
const timeEl = $("time");
const scoreEl = $("score");
const handsignEl = $("handsign");

const choices = { a: $("a"), b: $("b"), c: $("c"), d: $("d") };

/*****************
 * GAME VARIABLES *
 *****************/
const HOLD_MS = 800; // harus ditahan 0.8 dtk
const COOLDOWN_MS = 1200; // jeda 1.2 dtk sesudah dijawab
let holdStart = null;
let stableHand = "-";
let cooldown = false;

let score = 0;
let currentAnswer = "";
let lastHand = "-";
let timeLeft = 60; // detik
const level = localStorage.level || "easy";

/*****************
 *  TFJS MODEL   *
 *****************/
window.tfModel = null; // diekspos global utk debugging
let labels = ["a", "b", "c", "d"];

async function loadHandsignModel() {
  const loadingOverlay = document.getElementById("loading-overlay");

  try {
    window.tfModel = await tf.loadLayersModel("tfjs_model/model.json");
    console.log("TFJS:", tf.version_core, "input→", tfModel.inputs[0].shape);

    // Sembunyikan overlay loading
    if (loadingOverlay) {
      loadingOverlay.classList.add("fade-out");
      setTimeout(() => loadingOverlay.remove(), 500);
    }

    // (optional) label_mapping.json
    try {
      const resp = await fetch("tfjs_model/label_mapping.json");
      if (resp.ok) labels = await resp.json();
    } catch {
      /* abaikan */
    }
  } catch (err) {
    console.error("Model gagal diload!", err);
    if (loadingOverlay) {
      loadingOverlay.innerHTML =
        "<p style='color:red'>❌ Gagal memuat model. Coba refresh.</p>";
    }
  }
}
loadHandsignModel();

/*****************
 *  QUESTION GEN *
 *****************/
function opSet() {
  const map = { add: "+", sub: "-", mul: "×", div: "÷" };
  if (map[localStorage.operation]) return map[localStorage.operation];
  return ["+", "-", "×", "÷"][(Math.random() * 4) >> 0];
}

function generateQuestion() {
  // Reset styles
  ["a", "b", "c", "d"].forEach((k) => {
    const el = document.getElementById(`choice-${k}`);
    if (el) el.className = "choice-item";
  });

  // Konfigurasi Level yang Lebih Optimal
  const cfg = {
    easy: {
      addMax: 20,
      subMax: 20,
      mulMin: 2,
      mulMax: 9,
      divMin: 2,
      divMax: 5,
      ansMin: 1,
      ansMax: 50,
    },
    medium: {
      addMax: 50,
      subMax: 50,
      mulMin: 3,
      mulMax: 12,
      divMin: 3,
      divMax: 9,
      ansMin: 5,
      ansMax: 150,
    },
    hard: {
      addMax: 100,
      subMax: 100,
      mulMin: 6,
      mulMax: 15,
      divMin: 4,
      divMax: 12,
      ansMin: 10,
      ansMax: 300,
    },
  }[level];

  let a, b, op, correct;
  let attempts = 0;

  // Loop safety agar tidak hang (maks 50x coba)
  while (attempts < 50) {
    attempts++;
    op = opSet();

    if (op === "+") {
      a = rr(5, cfg.addMax);
      b = rr(5, cfg.addMax);
      correct = a + b;
    } else if (op === "-") {
      a = rr(10, cfg.subMax * 1.5);
      b = rr(5, a - 1);
      correct = a - b;
    } else if (op === "×") {
      a = rr(cfg.mulMin, cfg.mulMax);
      b = rr(cfg.mulMin, cfg.mulMax);
      correct = a * b;
    } else if (op === "÷") {
      // Tentukan pembagi (b) dan hasil (correct) dulu agar angka bulat
      b = rr(cfg.divMin, cfg.divMax);

      // Batasi hasil bagi agar 'a' tidak terlalu raksasa
      let qMin = level === "hard" ? 5 : 2;
      let qMax = level === "hard" ? 30 : 10;

      correct = rr(qMin, qMax);
      a = correct * b;
    }

    // Validasi range jawaban
    if (correct >= cfg.ansMin && correct <= cfg.ansMax) {
      break;
    }

    // Fallback jika susah cari angka pas (safety net)
    if (attempts >= 50) {
      if (op === "÷") {
        correct = 10;
        b = 5;
        a = 50;
      } else {
        a = 10;
        b = 10;
        correct = 20;
        op = "+";
      }
    }
  }

  // Generate Pilihan Jawaban (Distractors)
  const answers = new Set([correct]);

  // Logic pengecoh yang lebih cerdas (dekat dengan jawaban asli)
  while (answers.size < 4) {
    let offset = rr(1, 10); // default deviasi kecil
    if (level === "medium") offset = rr(1, 15);
    if (level === "hard") offset = rr(1, 25);

    // 50% kemungkinan plus atau minus
    if (Math.random() < 0.5) offset *= -1;

    let fake = correct + offset;

    // Pastikan jawaban positif dan tidak duplikat
    if (fake > 0 && fake !== correct) {
      answers.add(fake);
    }
  }

  // Acak posisi jawaban
  const shuffled = [...answers].sort(() => Math.random() - 0.5);

  shuffled.forEach((ans, i) => {
    const key = ["a", "b", "c", "d"][i];
    choices[key].textContent = ans;
    if (ans === correct) currentAnswer = key;
  });

  questionEl.textContent = `${a} ${op} ${b} = ?`;

  // Helper Random Range
  function rr(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

/*****************
 *     TIMER     *
 *****************/
const timePerLevel = { easy: 60, medium: 60, hard: 60 }; // 1 menit
timeLeft = timePerLevel[level] ?? 60; // ganti nilai awal
timeEl.textContent = timeLeft;

const timerID = setInterval(() => {
  timeLeft--;
  timeEl.textContent = timeLeft;
  if (timeLeft <= 0) endGame();
}, 1000);

/*****************
 *  POPUP HUD    *
 *****************/
function showPopup(type) {
  const pp = $("popup-feedback");

  // Reset classes
  pp.className = "";

  if (type === "correct") {
    pp.innerHTML = "<div class='icon'>✅</div><div class='text'>Benar!</div>";
    pp.classList.add("correct");
  } else {
    pp.innerHTML = "<div class='icon'>❌</div><div class='text'>Salah!</div>";
    pp.classList.add("wrong");
  }

  // Trigger reflow
  void pp.offsetWidth;

  pp.classList.add("show");
  setTimeout(() => pp.classList.remove("show"), 1000);
}

/*****************
 * ANSWER CHECK  *
 *****************/
function checkAnswer(hand) {
  const choiceEl = document.getElementById(`choice-${hand}`);

  if (hand === currentAnswer) {
    if (choiceEl) choiceEl.classList.add("correct");
    correctSound?.play();
    score++;
    scoreEl.textContent = score;
    showPopup("correct");
    setTimeout(generateQuestion, 500); // Delay sedikit biar kelihatan hijaunya
  } else {
    if (choiceEl) {
      choiceEl.classList.add("wrong");
      setTimeout(() => choiceEl.classList.remove("wrong"), 500);
    }
    wrongSound?.play();
    showPopup("wrong");
  }
}

/*****************
 *  END / RES    *
 *****************/
function endGame() {
  clearInterval(timerID);
  localStorage.lastScore = score;

  // Save to Highscore History
  const history = JSON.parse(localStorage.getItem("gameHistory") || "[]");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  history.push({
    score: score,
    level: localStorage.level || "easy",
    operation: localStorage.operation || "add",
    date: dateStr,
  });

  localStorage.setItem("gameHistory", JSON.stringify(history));

  finishSound?.play();
  setTimeout(() => (location.href = "result.html"), 500);
}
function gotoResult() {
  location.href = "result.html";
}

/*****************
 *  START GAME   *
 *****************/
generateQuestion();

/*****************
 *  MEDIAPIPE     *
 *****************/
const videoElement = $("webcam");
const canvasElement = $("overlay");
const canvasCtx = canvasElement.getContext("2d");
const holdBar = $("hold-bar"); // Cache holdBar element

// Sync size once video metadata ready
videoElement.addEventListener("loadedmetadata", syncCanvasSize);
function syncCanvasSize() {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
}

const hands = new Hands({
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 320,
  height: 240,
});
camera.start();

/*****************
 *  MEDIAPIPE CB *
 *****************/
const GESTURE_HOLD_MS = 800; // tahan 0.8 detik agar valid
let gestureStart = null; // kapan pose mulai stabil
let lastPred = "-";

async function onResults(res) {
  if (!tfModel) return;

  // ----- bersihkan + mirror via CSS saja -----
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // ----- deteksi tangan -----
  if (res.multiHandLandmarks?.length === 1) {
    const lm = res.multiHandLandmarks[0];
    drawConnectors(canvasCtx, lm, HAND_CONNECTIONS, {
      color: "#00FFCC",
      lineWidth: 3,
    });
    drawLandmarks(canvasCtx, lm, { color: "#FFCC00", lineWidth: 2 });

    // prediksi
    const arr = lm.flatMap((pt) => [pt.x, pt.y, pt.z]); // [63]

    let predIdx = 0;
    if (window.tfModel) {
      const idx = tf.tidy(() => {
        const input = tf.tensor2d([arr]);
        const prediction = window.tfModel.predict(input);
        return prediction.argMax(-1).dataSync()[0];
      });
      predIdx = idx;
    }

    const hand = labels[predIdx] ?? "-";
    handsignEl.textContent = hand;

    // ---------- logika hold + cooldown ----------

    // Reset pending state
    ["a", "b", "c", "d"].forEach((k) => {
      const el = document.getElementById(`choice-${k}`);
      if (el) el.classList.remove("pending");
    });

    if (["a", "b", "c", "d"].includes(hand)) {
      if (cooldown) {
        if (holdBar) holdBar.style.width = "0%";
      } else if (hand !== stableHand) {
        // pose baru
        stableHand = hand;
        holdStart = Date.now();
        if (holdBar) holdBar.style.width = "0%";
      } else {
        // Sedang menahan pose yang sama
        const elapsed = Date.now() - holdStart;
        const progress = Math.min((elapsed / HOLD_MS) * 100, 100);

        if (holdBar) holdBar.style.width = `${progress}%`;

        // Highlight pending choice
        const choiceEl = document.getElementById(`choice-${hand}`);
        if (choiceEl) choiceEl.classList.add("pending");

        if (elapsed >= HOLD_MS) {
          checkAnswer(hand); // jawab!
          cooldown = true;
          if (holdBar) holdBar.style.width = "0%";
          setTimeout(() => {
            cooldown = false;
          }, COOLDOWN_MS);
          stableHand = "-"; // wajib angkat tangan dulu
        }
      }
    } else {
      // pose di luar a-d
      stableHand = "-";
      holdStart = null;
      if (holdBar) holdBar.style.width = "0%";
    }
  } else {
    // tak ada tangan
    handsignEl.textContent = "-";
    stableHand = "-";
    holdStart = null;
    if (holdBar) holdBar.style.width = "0%";

    // Reset pending state
    ["a", "b", "c", "d"].forEach((k) => {
      const el = document.getElementById(`choice-${k}`);
      if (el) el.classList.remove("pending");
    });
  }
  canvasCtx.restore();
}
