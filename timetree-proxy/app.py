from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import re
import json
import time
import threading
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)  # Enables Access-Control-Allow-Origin: * for all endpoints

TIMETREE_EMAIL = os.environ.get("TIMETREE_EMAIL", "")
TIMETREE_PASSWORD = os.environ.get("TIMETREE_PASSWORD", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://twtlgliswimfqzngiwwy.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3dGxnbGlzd2ltZnF6bmdpd3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNjcwMjUsImV4cCI6MjA1NTk0MzAyNX0.Aal7XoP3t32rV69-7cQfM1Zp8d_v8E4E_5o-v-Z01oY")

# ─── Smart Title Time Range Extractor (Python Engine) ─────────────────────────
def extract_time_range_from_title(title):
    if not title or not isinstance(title, str):
        return None
    
    clean_title = re.sub(r'<[^>]+>', '', title).strip()
    
    range_match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|\bto\b)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', clean_title, re.I)
    if range_match:
        h1_str, m1_str, ap1_str, h2_str, m2_str, ap2_str = range_match.groups()
        h1, h2 = int(h1_str), int(h2_str)
        m1 = int(m1_str) if m1_str else 0
        m2 = int(m2_str) if m2_str else 0
        
        ap1 = ap1_str.upper() if ap1_str else None
        ap2 = ap2_str.upper() if ap2_str else None

        if not ap2:
            if ap1:
                ap2 = ap1
            elif h2 >= 1 and h2 <= 8:
                ap2 = 'PM'
            elif h2 >= 9 and h2 <= 11:
                ap2 = 'AM'
            elif h2 == 12:
                ap2 = 'PM'

        if not ap1:
            if ap2 == 'PM' and h1 < h2 and h2 != 12:
                ap1 = 'PM' if h1 >= 12 else ('AM' if h1 >= 9 else 'PM')
            elif ap2 == 'PM' and h1 > h2:
                ap1 = 'AM'
            elif ap2 == 'AM':
                ap1 = 'AM'
            else:
                ap1 = 'PM' if (h1 >= 12 or h1 <= 8) else 'AM'
        
        start_formatted = f"{h1}:{m1:02d} {ap1}"
        end_formatted = f"{h2}:{m2:02d} {ap2}"
        return {
            "startTimeFormatted": start_formatted,
            "endTimeFormatted": end_formatted,
            "displayTime": f"{start_formatted} - {end_formatted}"
        }
    return None

# ─── Pure ICS Content Parser ──────────────────────────────────────────────────
def parse_ics_text(ics_text, boat_id, boat_name):
    events = []
    if not ics_text or "BEGIN:VEVENT" not in ics_text.upper():
        return events

    vevents = re.split(r'BEGIN:VEVENT', ics_text, flags=re.I)[1:]
    for block in vevents:
        summary_m = re.search(r'SUMMARY:(.*?)(?:\r?\n[A-Z]|\r?\n\r?\n|$)', block, re.S)
        summary = summary_m.group(1).replace('\r', '').replace('\n ', '').strip() if summary_m else "External Charter Booking"

        dtstart_m = re.search(r'DTSTART(?:;[^:]*)?:(\d{8}T?\d{0,6}Z?)', block)
        dtend_m = re.search(r'DTEND(?:;[^:]*)?:(\d{8}T?\d{0,6}Z?)', block)

        if not dtstart_m:
            continue

        raw_start = dtstart_m.group(1)
        raw_end = dtend_m.group(1) if dtend_m else raw_start

        date_str = f"{raw_start[:4]}-{raw_start[4:6]}-{raw_start[6:8]}"
        start_time_str = "All Day"

        if "T" in raw_start and len(raw_start) >= 13:
            h = int(raw_start[9:11])
            m = int(raw_start[11:13])
            ap = "PM" if h >= 12 else "AM"
            h12 = h % 12 or 12
            start_time_str = f"{h12}:{m:02d} {ap}"
            if raw_end and "T" in raw_end and len(raw_end) >= 13:
                eh = int(raw_end[9:11])
                em = int(raw_end[11:13])
                eap = "PM" if eh >= 12 else "AM"
                eh12 = eh % 12 or 12
                start_time_str += f" - {eh12}:{em:02d} {eap}"

        override = extract_time_range_from_title(summary)
        if override:
            start_time_str = override["displayTime"]

        events.append({
            "id": f"ics_srv_{boat_id}_{raw_start}_{abs(hash(summary))}",
            "boat_id": boat_id,
            "boat_name": boat_name,
            "customer_name": summary,
            "booking_date": date_str,
            "start_time": start_time_str,
            "duration_hours": 4,
            "status": "external_ical",
            "source": "server_background_cron"
        })

    return events

# ─── Live Server Sync Engine ────────────────────────────────────────────────
def perform_background_ical_sync():
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }
    try:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/boats?select=id,name,ical_feed_url,status", headers=headers, timeout=15)
        if r.status_code != 200:
            return
        boats = r.json()
        active_boats = [b for b in boats if (b.get('status') == 'active' or not b.get('status')) and b.get('ical_feed_url')]

        all_events = []
        for b in active_boats:
            urls = [u.strip() for u in re.split(r'[\r\n,;]+', b['ical_feed_url']) if u.strip()]
            for u in urls:
                try:
                    clean_u = u.replace('webcal://', 'https://').replace('ical://', 'https://')
                    res = requests.get(clean_u, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                    if res.status_code == 200 and "BEGIN:VCALENDAR" in res.text:
                        parsed = parse_ics_text(res.text, b['id'], b['name'])
                        all_events.extend(parsed)
                except Exception:
                    pass

        if all_events:
            payload = {
                "key": "cached_ical_events",
                "value": all_events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            requests.post(
                f"{SUPABASE_URL}/rest/v1/site_settings",
                headers={**headers, "Prefer": "resolution=merge-duplicates"},
                json=payload,
                timeout=15
            )
    except Exception:
        pass

def background_loop():
    time.sleep(10) # Initial delay on boot
    while True:
        try:
            perform_background_ical_sync()
        except Exception:
            pass
        time.sleep(180) # Sync every 3 minutes 24/7

# Launch background sync thread
threading.Thread(target=background_loop, daemon=True).start()

@app.route("/")
def home():
    return jsonify({
        "service": "YRSF TimeTree iCal Bridge & 24/7 Background Sync",
        "status": "online",
        "usage": "/timetree.ics?c=YOUR_CALENDAR_CODE",
        "manual_sync_trigger": "/api/sync-ical"
    })

@app.route("/api/sync-ical", methods=["GET", "POST"])
def manual_sync_trigger():
    threading.Thread(target=perform_background_ical_sync).start()
    return jsonify({"status": "sync_initiated", "message": "24/7 background iCal sync triggered successfully!"})

@app.route("/timetree.ics")
def get_timetree_ics():
    cal_id = request.args.get("c", "").strip()
    if not cal_id:
        return jsonify({"error": "Missing calendar code parameter '?c='"}), 400

    mobile_headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept": "text/calendar, application/json, */*"
    }
    test_urls = [
        f"https://timetreeapp.com/public_calendars/{cal_id}.ics",
        f"https://api.timetreeapp.com/v1/calendars/{cal_id}/events.ics"
    ]
    for t_url in test_urls:
        try:
            r = requests.get(t_url, headers=mobile_headers, timeout=10)
            if r.status_code == 200 and "BEGIN:VCALENDAR" in r.text:
                return Response(r.text, mimetype="text/calendar", headers={"Access-Control-Allow-Origin": "*"})
        except Exception:
            pass

    return jsonify({"error": f"Could not export calendar {cal_id}."}), 502

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
