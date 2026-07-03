import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from analyzer import analyze, load_models

load_dotenv()

app = Flask(__name__)
CORS(app)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze_route():
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image")

    if not image_b64:
        return jsonify({"error": "No image provided. Send { image: '<base64>' }."}), 400

    try:
        result = analyze(image_b64)
        return jsonify(result)
    except Exception as exc:
        print(f"[analyze] error: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== PhishLens — loading models ===")
    load_models()
    print("=== Server starting on http://127.0.0.1:5000 ===")
    app.run(debug=True, port=5000)
