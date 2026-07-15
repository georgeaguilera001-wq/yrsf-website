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

# Supabase configuration for 24/7 background sync
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://udacadmmeyvykiiptsvb.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8")

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
        res = {}
        for root, dirs, files in os.walk("/opt/render/project/src/.venv/lib"):
            if "timetree_exporter" in root:
                for fn in files:
                    if fn.endswith(".py"):
                        path = os.path.join(root, fn)
                        with open(path, "r", encoding="utf-8", errors="ignore") as f:
                            res[path] = f.read()
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

CACHED_SESSION_ID = None

def fetch_with_cached_or_fresh_session(cal_id, output_path, cli_debug):
    global CACHED_SESSION_ID
    session_file = "/tmp/timetree_session.txt"
    if not CACHED_SESSION_ID and os.path.exists(session_file):
        try:
            with open(session_file, "r") as sf:
                CACHED_SESSION_ID = sf.read().strip()
        except Exception:
            pass

    try:
        from timetree_exporter import TimeTreeEvent, ICalEventFormatter
        from icalendar import Calendar
        from timetree_exporter.api.auth import login
        from timetree_exporter.api.calendar import TimeTreeCalendar
    except Exception as e:
        cli_debug["import_error"] = str(e)
        return None

    # 1. Attempt using existing session without calling login() API
    if CACHED_SESSION_ID:
        try:
            cal_client = TimeTreeCalendar(CACHED_SESSION_ID)
            metas = cal_client.get_metadata()
            active = [m for m in metas if m.get("deactivated_at") is None and m.get("alias_code") == cal_id]
            if active:
                events = cal_client.get_events(active[0]["id"], active[0].get("name"))
                cal = Calendar()
                for ev in events:
                    tt_ev = TimeTreeEvent.from_dict(ev)
                    fmt = ICalEventFormatter(tt_ev)
                    ic_ev = fmt.to_ical()
                    if ic_ev:
                        cal.add_component(ic_ev)
                content = cal.to_ical().decode("utf-8")
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return content
        except Exception as e:
            cli_debug["cached_session_error"] = str(e)
            CACHED_SESSION_ID = None
            if os.path.exists(session_file):
                try: os.remove(session_file)
                except Exception: pass

    # 2. If no valid session exists, perform fresh login and persist session_id
    try:
        new_session = login(TIMETREE_EMAIL, TIMETREE_PASSWORD)
        if new_session:
            CACHED_SESSION_ID = new_session
            try:
                with open(session_file, "w") as sf:
                    sf.write(new_session)
            except Exception:
                pass
            cal_client = TimeTreeCalendar(new_session)
            metas = cal_client.get_metadata()
            active = [m for m in metas if m.get("deactivated_at") is None and m.get("alias_code") == cal_id]
            if active:
                events = cal_client.get_events(active[0]["id"], active[0].get("name"))
                cal = Calendar()
                for ev in events:
                    tt_ev = TimeTreeEvent.from_dict(ev)
                    fmt = ICalEventFormatter(tt_ev)
                    ic_ev = fmt.to_ical()
                    if ic_ev:
                        cal.add_component(ic_ev)
                content = cal.to_ical().decode("utf-8")
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return content
    except Exception as e:
        cli_debug["fresh_login_error"] = str(e)
    return None

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
        # 1. Attempt session reusing direct fetcher, or fallback to CLI
        if TIMETREE_EMAIL and TIMETREE_PASSWORD:
            content = fetch_with_cached_or_fresh_session(cal_id, output_path, cli_debug)
            if content and "BEGIN:VCALENDAR" in content:
                return Response(content, mimetype="text/calendar", headers={
                    "Access-Control-Allow-Origin": "*",
                    "X-TimeTree-Cache": "MISS-SUCCESS"
                })
            # Fallback to CLI subprocess if Python direct API helper didn't return content
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
                            "X-TimeTree-Cache": "MISS-CLI-SUCCESS"
                        })
            except Exception as e:
                cli_debug["cli_exception"] = str(e)
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

def run_all_boats_sync_to_supabase():
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        res = requests.get(f"{SUPABASE_URL}/rest/v1/boats?status=eq.active&select=id,name,ical_feed_url,ical_feed_label", headers=headers, timeout=15)
        if res.status_code != 200:
            return {"error": "Failed to fetch boats from Supabase", "status": res.status_code}
        
        boats = res.json()
        all_parsed_events = []
        code_to_boats = {}
        for b in boats:
            feed_url = b.get("ical_feed_url") or ""
            if "c=" in feed_url:
                code = feed_url.split("c=")[1].split("&")[0].strip()
                if code:
                    code_to_boats.setdefault(code, []).append(b)

        for code, boat_list in code_to_boats.items():
            cli_debug = {}
            output_path = f"/tmp/{code}.ics"
            lock = get_cal_lock(code)
            content = None
            with lock:
                content = fetch_with_cached_or_fresh_session(code, output_path, cli_debug)
            
            if not content and os.path.exists(output_path):
                try:
                    with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                except Exception:
                    pass

            if content and "BEGIN:VCALENDAR" in content:
                lines = content.splitlines()
                for boat in boat_list:
                    boat_id = boat["id"]
                    boat_name = boat["name"]
                    filter_label = (boat.get("ical_feed_label") or "").replace("Filter:", "").strip().lower()
                    
                    cur_event = {}
                    in_event = False
                    for line in lines:
                        line_str = line.strip()
                        if line_str == "BEGIN:VEVENT":
                            in_event = True
                            cur_event = {}
                        elif line_str == "END:VEVENT" and in_event:
                            in_event = False
                            summary = cur_event.get("SUMMARY", "")
                            summary_lower = summary.lower()
                            
                            is_match = False
                            if filter_label:
                                if filter_label in summary_lower or summary_lower in filter_label:
                                    is_match = True
                            else:
                                if boat_name.lower() in summary_lower or summary_lower in boat_name.lower():
                                    is_match = True

                            if is_match and "DTSTART" in cur_event and "DTEND" in cur_event:
                                all_parsed_events.append({
                                    "boat_id": boat_id,
                                    "start": cur_event["DTSTART"],
                                    "end": cur_event["DTEND"],
                                    "summary": summary,
                                    "external": True
                                })
                        elif in_event and ":" in line_str:
                            parts = line_str.split(":", 1)
                            key_part = parts[0].split(";")[0].strip()
                            val_part = parts[1].strip()
                            if key_part in ("DTSTART", "DTEND"):
                                val_clean = val_part.replace("Z", "")
                                if len(val_clean) == 15 and "T" in val_clean:
                                    val_part = f"{val_clean[:4]}-{val_clean[4:6]}-{val_clean[6:8]}T{val_clean[9:11]}:{val_clean[11:13]}:{val_clean[13:15]}"
                                elif len(val_clean) == 8:
                                    val_part = f"{val_clean[:4]}-{val_clean[4:6]}-{val_clean[6:8]}T00:00:00"
                            cur_event[key_part] = val_part

        patch_headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        payload = {
            "value": all_parsed_events,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        patch_res = requests.patch(
            f"{SUPABASE_URL}/rest/v1/site_settings?key=eq.cached_ical_events",
            headers=patch_headers,
            json=payload,
            timeout=15
        )
        return {
            "status": "success",
            "boats_processed": len(boats),
            "events_synced": len(all_parsed_events),
            "patch_status": patch_res.status_code
        }
    except Exception as e:
        return {"error": str(e)}

def background_auto_sync_loop():
    time.sleep(20)  # Wait 20s after dyno startup before first automated check
    while True:
        try:
            run_all_boats_sync_to_supabase()
        except Exception:
            pass
        time.sleep(300)  # Sleep exactly 5 minutes (300 seconds) between automated fleet syncs

# Start background auto-sync daemon thread
threading.Thread(target=background_auto_sync_loop, daemon=True).start()

@app.route("/cron/sync")
def cron_sync_endpoint():
    res = run_all_boats_sync_to_supabase()
    return jsonify(res)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
