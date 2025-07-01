from flask import Flask, render_template, send_from_directory, jsonify, Response
from flask_cors import CORS
from predictor import HandSignPredictor
import cv2, time, atexit, pathlib
import os

# Path ke root project (FAST MATH PROJECT - COPY)
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR),           # HTML di root project
    static_folder=str(BASE_DIR / "static")   # asset static/audio/img di static/
)
CORS(app)

# --------- Serve CSS dan JS manual dari root ---------
@app.route('/<path:filename>')
def serve_root_files(filename):
    # Serve hanya file tertentu demi keamanan (whitelist)
    allowed = {"style.css", "app.js"}
    if filename in allowed:
        return send_from_directory(app.template_folder, filename)
    # Kalau bukan, 404
    return "File not allowed", 404

# ---------- ROUTES ----------
@app.route("/")
def welcome():
    return render_template("welcome.html")

@app.route("/instructions")
def instructions():
    return render_template("guide.html")

@app.route("/menu")
def menu():
    return render_template("menu.html")

@app.route("/operation")
def operation():
    return render_template("operation.html")

@app.route("/game")
def game():
    return render_template("index.html")

@app.route("/result")
def result():
    return render_template("result.html")

# ---------- API ----------
predictor = HandSignPredictor()
predictor.start()

@app.route("/predict")
def predict():
    return jsonify({"handsign": predictor.get_prediction()})

@app.route("/video_feed")
def video_feed():
    def gen():
        while True:
            frame = predictor.get_frame()
            if frame is None:
                time.sleep(0.02)
                continue
            ok, buf = cv2.imencode(".jpg", frame)
            if ok:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + buf.tobytes() + b"\r\n")
            time.sleep(0.02)
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@atexit.register
def _cleanup():
    predictor.stop()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
