// ---------- elemen DOM ----------
const correctSound = document.getElementById("sound-correct");
const wrongSound = document.getElementById("sound-wrong");

const $ = (id) => document.getElementById(id);
const questionEl = $("question");
const timeEl = $("time");
const scoreEl = $("score");
const handsignEl = $("handsign");
const choices = { a: $("a"), b: $("b"), c: $("c"), d: $("d") };

// ---------- variabel game ----------
let score = 0;
let currentAnswer = "";
let lastHand = "-";
let timeLeft = 60; // 1 menit
const level = localStorage.level || "easy";

// ---------- generator soal ----------
function noiseRange() {
  return level === "easy" ? 10 : level === "medium" ? 20 : 50;
}
function maxOperand() {
  return level === "easy" ? 30 : level === "medium" ? 60 : 100;
}

// ---------- POPUP FEEDBACK ----------
function showPopupFeedback(message, color) {
  const popup = document.getElementById("popup-feedback");
  popup.textContent = message;
  popup.style.background = color;
  popup.classList.add("show");
  // Jangan set display, biar CSS yang atur
  setTimeout(() => {
    popup.classList.remove("show");
  }, 1000); // 1 detik tampil
}

function opSet() {
  // pilih operasi secara acak
  const ops = ["+", "-", "×", "÷"];
  return ops[Math.floor(Math.random() * ops.length)];
}
function rangeByLevel() {
  return level === "easy" ? 20 : level === "medium" ? 50 : 100;
}

function generateQuestion() {
  // Atur rentang operand dan jawaban sesuai level
  const config = {
    easy: { max: 30, mulMin: 2, mulMax: 10, answerMin: 1, answerMax: 50 },
    medium: { max: 100, mulMin: 3, mulMax: 15, answerMin: 10, answerMax: 200 },
    hard: { max: 200, mulMin: 5, mulMax: 25, answerMin: 50, answerMax: 1000 },
  };
  const { max, mulMin, mulMax, answerMin, answerMax } =
    config[level] || config.easy;

  let a, b, op, correct;

  while (true) {
    op = opSet();

    if (op === "+") {
      a = Math.floor(Math.random() * max) + 1;
      b = Math.floor(Math.random() * max) + 1;
      correct = a + b;
    } else if (op === "-") {
      a = Math.floor(Math.random() * max) + 1;
      b = Math.floor(Math.random() * a) + 1; // a >= b
      correct = a - b;
    } else if (op === "×") {
      b = Math.floor(Math.random() * (mulMax - mulMin + 1)) + mulMin;
      a = Math.floor(Math.random() * (max / b)) + 1;
      correct = a * b;
    } else if (op === "÷") {
      b = Math.floor(Math.random() * (mulMax - mulMin + 1)) + mulMin;
      correct = Math.floor(Math.random() * (max / b)) + 1;
      a = correct * b; // Supaya hasil bulat
    }

    if (
      typeof correct === "number" &&
      correct >= answerMin &&
      correct <= answerMax &&
      a >= 1 &&
      b >= 1 &&
      Number.isInteger(correct)
    )
      break;
  }

  // ---- Fake answer ----
  const fakeSet = new Set();
  const noise = level === "easy" ? 5 : level === "medium" ? 20 : 100;

  while (fakeSet.size < 3) {
    let dev = Math.floor(Math.random() * noise) + 1;
    dev *= Math.random() < 0.5 ? -1 : 1;
    let fake = correct + dev;
    if (
      fake !== correct &&
      fake >= answerMin &&
      fake <= answerMax &&
      Number.isInteger(fake)
    ) {
      fakeSet.add(fake);
    }
  }

  // Gabungkan & acak urutan
  const allAnswers = [correct, ...Array.from(fakeSet)];
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Assign ke tombol & catat currentAnswer
  ["a", "b", "c", "d"].forEach((key, i) => {
    choices[key].textContent = allAnswers[i];
    if (allAnswers[i] === correct) currentAnswer = key;
  });

  // tampilkan soal
  const symbol = op === "×" ? "×" : op === "÷" ? "÷" : op;
  questionEl.textContent = `${a} ${symbol} ${b} = ?`;
}

// ---------- timer 2-menit ----------
function tick() {
  timeLeft--;
  timeEl.textContent = timeLeft;
  if (timeLeft <= 0) endGame();
}
timeEl.textContent = timeLeft;
const timerID = setInterval(tick, 1000);

// ---------- handsign polling ----------
setInterval(async () => {
  try {
    const res = await fetch("/predict"); // ← relatif: sama host & port
    const { handsign } = await res.json();
    const hand = handsign.toLowerCase();
    handsignEl.textContent = hand;

    if (["a", "b", "c", "d"].includes(hand) && hand !== lastHand) {
      lastHand = hand;
      checkAnswer(hand);
    }
  } catch {
    handsignEl.textContent = "Err";
  }
}, 600);

// ---------- cek jawaban ----------
function checkAnswer(hand) {
  if (hand === currentAnswer) {
    correctSound?.play();
    score++;
    scoreEl.textContent = score;
    showPopupFeedback("✅ Benar!", "#4caf50"); // <-- panggil popup
    generateQuestion();
  } else {
    wrongSound?.play();
    showPopupFeedback("❌ Salah!", "#e74c3c"); // <-- panggil popup
    // soal tidak berubah
  }
}

// ---------- selesai ----------
const finishSound = document.getElementById("sound-finish");

function endGame() {
  clearInterval(timerID);
  localStorage.lastScore = score; // simpan
  window.location.href = "/result"; // langsung pindah
}

function gotoResult() {
  window.location.href = "/result"; // route Flask
}

// ---------- mulai ----------
generateQuestion();
