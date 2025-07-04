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
  const modelStatus = document.getElementById("model-status"); // status div

  try {
    // teks awal sudah “Sedang memuat model…”, biarkan saja

    window.tfModel = await tf.loadLayersModel("tfjs_model/model.json");
    console.log("TFJS:", tf.version_core, "input→", tfModel.inputs[0].shape);

    // sembunyikan status setelah sukses
    if (modelStatus) modelStatus.style.display = "none";

    // (optional) label_mapping.json
    try {
      const resp = await fetch("tfjs_model/label_mapping.json");
      if (resp.ok) labels = await resp.json();
    } catch {
      /* abaikan */
    }
  } catch (err) {
    console.error("Model gagal diload!", err);
    if (modelStatus) modelStatus.textContent = "❌ Model gagal dimuat";
    // tidak pakai alert agar halaman tidak terhenti
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
  const cfg = {
    easy: { max: 30, mulMin: 2, mulMax: 10, answerMin: 1, answerMax: 50 },
    medium: { max: 100, mulMin: 3, mulMax: 15, answerMin: 10, answerMax: 200 },
    hard: { max: 200, mulMin: 5, mulMax: 25, answerMin: 50, answerMax: 1000 },
  }[level];

  let a, b, op, correct;
  while (true) {
    op = opSet();
    switch (op) {
      case "+":
        a = r(cfg.max);
        b = r(cfg.max);
        correct = a + b;
        break;
      case "-":
        a = r(cfg.max);
        b = r(a);
        correct = a - b;
        break;
      case "×":
        b = rr(cfg.mulMin, cfg.mulMax);
        a = r(cfg.max / b);
        correct = a * b;
        break;
      case "÷":
        b = rr(cfg.mulMin, cfg.mulMax);
        correct = r(cfg.max / b);
        a = correct * b;
        break;
    }
    if (v(correct, cfg)) break;
  }
  const answers = [correct, ...fake(correct, cfg)];
  shuffle(answers).forEach((ans, i) => {
    const key = ["a", "b", "c", "d"][i];
    choices[key].textContent = ans;
    if (ans === correct) currentAnswer = key;
  });
  questionEl.textContent = `${a} ${op} ${b} = ?`;

  function r(m) {
    return Math.floor(Math.random() * m) + 1;
  }
  function rr(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function v(val, c) {
    return val >= c.answerMin && val <= c.answerMax && Number.isInteger(val);
  }
  function fake(corr, c) {
    const set = new Set(),
      noise = level === "easy" ? 5 : level === "medium" ? 20 : 100;
    while (set.size < 3) {
      let dev = r(noise) * (Math.random() < 0.5 ? -1 : 1);
      const f = corr + dev;
      if (f !== corr && v(f, c)) set.add(f);
    }
    return [...set];
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) >> 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/*****************
 *     TIMER     *
 *****************/
const timePerLevel = { easy: 60, medium: 120, hard: 180 }; // 1–3 menit
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
function showPopup(msg, bg) {
  const pp = $("popup-feedback");
  pp.textContent = msg;
  pp.style.background = bg;
  pp.classList.add("show");
  setTimeout(() => pp.classList.remove("show"), 1e3);
}

/*****************
 * ANSWER CHECK  *
 *****************/
function checkAnswer(hand) {
  if (hand === currentAnswer) {
    correctSound?.play();
    score++;
    scoreEl.textContent = score;
    showPopup("✅ Benar!", "#4caf50");
    generateQuestion();
  } else {
    wrongSound?.play();
    showPopup("❌ Salah!", "#e74c3c");
  }
}

/*****************
 *  END / RES    *
 *****************/
function endGame() {
  clearInterval(timerID);
  localStorage.lastScore = score;
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
    const predIdx = (
      await tfModel
        .predict(tf.tensor2d([arr]))
        .argMax(-1)
        .data()
    )[0];
    const hand = labels[predIdx] ?? "-";
    handsignEl.textContent = hand;

    // ---------- logika hold + cooldown ----------
    if (["a", "b", "c", "d"].includes(hand)) {
      if (cooldown) {
        /* abaikan selama cooldown */
      } else if (hand !== stableHand) {
        // pose baru
        stableHand = hand;
        holdStart = Date.now();
      } else if (Date.now() - holdStart >= HOLD_MS) {
        checkAnswer(hand); // jawab!
        cooldown = true;
        setTimeout(() => {
          cooldown = false;
        }, COOLDOWN_MS);
        stableHand = "-"; // wajib angkat tangan dulu
      }
    } else {
      // pose di luar a-d
      stableHand = "-";
      holdStart = null;
    }
  } else {
    // tak ada tangan
    handsignEl.textContent = "-";
    stableHand = "-";
    holdStart = null;
  }
  canvasCtx.restore();
}
