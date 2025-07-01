from flask import Flask, render_template, jsonify, Response
from flask_cors import CORS
from predictor import HandSignPredictor
import cv2, time, atexit, pathlib
    
BASE_DIR = pathlib.Path(__file__).resolve().parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR.parent / "frontend"),  # ../frontend
    static_folder="static"                              # backend/static
)
CORS(app)

# ---------- ROUTES ----------
@app.route("/")
def welcome():        return render_template("welcome.html")

@app.route("/instructions")
def instructions():   return render_template("guide.html")

@app.route("/menu")
def menu():           return render_template("menu.html")

@app.route("/game")
def game():           return render_template("index.html")

@app.route("/result")
def result():         return render_template("result.html")

# ---------- API ----------
predictor = HandSignPredictor(); predictor.start()

@app.route("/predict")
def predict(): return jsonify({"handsign": predictor.get_prediction()})

@app.route("/video_feed")
def video_feed():
    def gen():
        while True:
            frame = predictor.get_frame()
            if frame is None: time.sleep(0.02); continue
            ok, buf = cv2.imencode(".jpg", frame)
            if ok:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + buf.tobytes() + b"\r\n")
            time.sleep(0.02)
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@atexit.register
def _cleanup(): predictor.stop()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
