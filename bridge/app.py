from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import subprocess

app = Flask(__name__)
CORS(app)  # Enables Access-Control-Allow-Origin: * for all endpoints

# Set your TimeTree Account Email and Password in Render Environment Variables
TIMETREE_EMAIL = os.environ.get("TIMETREE_EMAIL", "")
TIMETREE_PASSWORD = os.environ.get("TIMETREE_PASSWORD", "")

@app.route("/")
def home():
    return jsonify({
        "service": "YRSF TimeTree iCal Bridge",
        "status": "online",
        "usage": "/timetree.ics?c=YOUR_CALENDAR_CODE"
    })

@app.route("/timetree.ics")
def get_timetree_ics():
    cal_id = request.args.get("c", "").strip()
    if not cal_id:
        return jsonify({"error": "Missing calendar code parameter '?c='"}), 400

    output_path = f"/tmp/{cal_id}.ics"

    # 1. Attempt using timetree-exporter CLI with credentials
    if TIMETREE_EMAIL and TIMETREE_PASSWORD:
        try:
            cmd = ["timetree-exporter", "-e", TIMETREE_EMAIL, "-p", TIMETREE_PASSWORD, "-c", cal_id, "-o", output_path]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if res.returncode == 0 and os.path.exists(output_path):
                with open(output_path, "r", encoding="utf-8") as f:
                    content = f.read()
                return Response(content, mimetype="text/calendar", headers={
                    "Access-Control-Allow-Origin": "*"
                })
        except Exception as e:
            pass

    # 2. Fallback: Attempt mobile API / public fetch with browser headers
    try:
        mobile_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            "Accept": "text/calendar, application/json, */*"
        }
        test_urls = [
            f"https://timetreeapp.com/public_calendars/{cal_id}.ics",
            f"https://api.timetreeapp.com/v1/calendars/{cal_id}/events.ics"
        ]
        for t_url in test_urls:
            r = requests.get(t_url, headers=mobile_headers, timeout=10)
            if r.status_code == 200 and "BEGIN:VCALENDAR" in r.text:
                return Response(r.text, mimetype="text/calendar", headers={
                    "Access-Control-Allow-Origin": "*"
                })
    except Exception as e:
        pass

    return jsonify({
        "error": f"Could not export calendar {cal_id}. TimeTree blocked public scraping. Please ensure TIMETREE_EMAIL and TIMETREE_PASSWORD are set correctly in Render."
    }), 502

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
