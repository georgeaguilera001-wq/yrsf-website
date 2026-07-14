from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import subprocess
import time
import threading

app = Flask(__name__)
CORS(app)  # Enables Access-Control-Allow-Origin: * for all endpoints

# Set your TimeTree Account Email and Password in Render Environment Variables
TIMETREE_EMAIL = os.environ.get("TIMETREE_EMAIL", "")
TIMETREE_PASSWORD = os.environ.get("TIMETREE_PASSWORD", "")

cal_locks = {}
locks_mutex = threading.Lock()

def get_cal_lock(cal_id):
    with locks_mutex:
        if cal_id not in cal_locks:
            cal_locks[cal_id] = threading.Lock()
        return cal_locks[cal_id]

@app.route("/inspect")
def inspect_code():
    try:
        import glob
        files = glob.glob("/opt/render/project/src/.venv/lib/python*/site-packages/timetree_exporter/*.py")
        res = {}
        for fn in files:
            with open(fn, "r", encoding="utf-8") as f:
                res[os.path.basename(fn)] = f.read()
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route("/")
def home():
    return jsonify({
        "service": "YRSF TimeTree iCal Bridge",
        "status": "online",
        "usage": "/timetree.ics?c=YOUR_CALENDAR_CODE"
    })

@app.route("/timetree.ics")
def get_timetree_ics():
    # Default to SvJU6em68jir (Rem/S.G/T.A/Azu/Dis) if no calendar code provided
    cal_id = request.args.get("c", "").strip() or "SvJU6em68jir"
    output_path = f"/tmp/{cal_id}.ics"

    # 0. Check cache (if fresher than 120 seconds, serve from disk immediately without calling login API)
    if os.path.exists(output_path) and (time.time() - os.path.getmtime(output_path) < 120):
        try:
            with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if "BEGIN:VCALENDAR" in content:
                return Response(content, mimetype="text/calendar", headers={
                    "Access-Control-Allow-Origin": "*",
                    "X-TimeTree-Cache": "HIT"
                })
        except Exception:
            pass

    lock = get_cal_lock(cal_id)
    with lock:
        # Double-check inside lock in case another thread just completed export
        if os.path.exists(output_path) and (time.time() - os.path.getmtime(output_path) < 120):
            try:
                with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if "BEGIN:VCALENDAR" in content:
                    return Response(content, mimetype="text/calendar", headers={
                        "Access-Control-Allow-Origin": "*",
                        "X-TimeTree-Cache": "HIT-LOCK"
                    })
            except Exception:
                pass

        cli_debug = {"email_set": bool(TIMETREE_EMAIL), "password_set": bool(TIMETREE_PASSWORD), "cal_id": cal_id}
        # 1. Attempt using timetree-exporter CLI with credentials
        if TIMETREE_EMAIL and TIMETREE_PASSWORD:
            try:
                cmd = ["timetree-exporter", "-e", TIMETREE_EMAIL, "-c", cal_id, "-o", output_path]
                res = subprocess.run(cmd, input=f"{TIMETREE_PASSWORD}\n", capture_output=True, text=True, timeout=25, env=os.environ.copy())
                cli_debug["returncode"] = res.returncode
                cli_debug["stdout"] = res.stdout[:500] if res.stdout else ""
                cli_debug["stderr"] = res.stderr[:500] if res.stderr else ""
                if res.returncode == 0 and os.path.exists(output_path):
                    with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    if "BEGIN:VCALENDAR" in content:
                        return Response(content, mimetype="text/calendar", headers={
                            "Access-Control-Allow-Origin": "*",
                            "X-TimeTree-Cache": "MISS-SUCCESS"
                        })
            except Exception as e:
                cli_debug["exception"] = str(e)
        else:
            cli_debug["note"] = "TIMETREE_EMAIL or TIMETREE_PASSWORD environment variable is empty/missing on Render"

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
                    try:
                        with open(output_path, "w", encoding="utf-8") as f:
                            f.write(r.text)
                    except Exception:
                        pass
                    return Response(r.text, mimetype="text/calendar", headers={
                        "Access-Control-Allow-Origin": "*",
                        "X-TimeTree-Cache": "PUBLIC-FETCH"
                    })
        except Exception as e:
            pass

        # 3. If rate limited (-495) or export failed right now, but ANY stale cached file exists on disk, serve it as emergency fallback!
        if os.path.exists(output_path):
            try:
                with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if "BEGIN:VCALENDAR" in content:
                    return Response(content, mimetype="text/calendar", headers={
                        "Access-Control-Allow-Origin": "*",
                        "X-TimeTree-Cache": "STALE-FALLBACK"
                    })
            except Exception:
                pass

    return jsonify({
        "error": f"Could not export calendar {cal_id}.",
        "debug": cli_debug
    }), 502

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
