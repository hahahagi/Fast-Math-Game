import cv2
import mediapipe as mp
import joblib
import numpy as np
import threading
import time
from pathlib import Path

_MODEL_PATH = Path(__file__).with_name("handsign_model.pkl")

class HandSignPredictor:
    def __init__(self, model_path=_MODEL_PATH, camera_id=0, pred_delay=0.5):
        self.clf = joblib.load(model_path)
        self.cap = cv2.VideoCapture(camera_id)
        self.hands = mp.solutions.hands.Hands(max_num_hands=1)
        self.prediction = "-"
        self.last_frame = None
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

        # Tambahan untuk delay prediksi
        self._pred_delay = pred_delay        # Delay dalam detik
        self._hand_detected_time = None      # Waktu pertama tangan muncul
        self._last_hand_landmarks = None     # Untuk tracking posisi

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join()
        self.cap.release()

    def get_prediction(self):
        with self._lock:
            return self.prediction

    def get_frame(self):
        with self._lock:
            return self.last_frame

    def _loop(self):
        mp_draw = mp.solutions.drawing_utils
        while self._running:
            ret, img = self.cap.read()
            if not ret or img is None:
                time.sleep(0.02)
                continue

            img = cv2.flip(img, 1)
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = self.hands.process(img_rgb)

            pred = "-"
            hand_present = results.multi_hand_landmarks is not None

            # Jika ada tangan terdeteksi
            if hand_present:
                for hand_lms in results.multi_hand_landmarks:
                    mp_draw.draw_landmarks(img, hand_lms, mp.solutions.hands.HAND_CONNECTIONS)

                    # Convert landmark ke array untuk cek stabilitas
                    landmark_list = []
                    for lm in hand_lms.landmark:
                        landmark_list.extend([lm.x, lm.y, lm.z])

                    # Cek apakah landmark sudah stabil (opsional: bisa cek perubahan sedikit)
                    # Di sini cukup waktu saja (simple)
                    now = time.time()
                    if self._hand_detected_time is None:
                        self._hand_detected_time = now  # Pertama kali tangan muncul

                    # Tunggu sampai delay tercapai
                    if now - self._hand_detected_time >= self._pred_delay and len(landmark_list) == 63:
                        X = np.array(landmark_list).reshape(1, -1)
                        pred = self.clf.predict(X)[0]
            else:
                # Reset timer kalau tangan hilang
                self._hand_detected_time = None

            with self._lock:
                self.prediction = pred
                self.last_frame = img.copy()

            time.sleep(0.02)
