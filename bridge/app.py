import os
import subprocess
from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return jsonify({
        "status": "online",
        "service": "YRSF TimeTree iCal Bridge",
        "usage": "/timetree.ics?c=YOUR_CALENDAR_CODE"
    })

@app.route("/timetree.ics")
def export_calendar():
    """
    Exports a TimeTree calendar to an RFC 5545 compatible .ics feed.
    Accepts URL query parameter '?c=CALENDAR_CODE' to dynamically export any calendar.
    Example: /timetree.ics?c=P4XL7kVS7UF8
    """
    calendar_code = request.args.get("c", default="").strip()
    
    # Use fallback filename if no calendar code provided
    filename = calendar_code if calendar_code else "default"
    output_path = f"/tmp/{filename}.ics"
    
    # Build timetree-exporter command
    cmd = ["timetree-exporter", "-o", output_path]
    if calendar_code:
        cmd.extend(["-c", calendar_code])
        
    try:
        subprocess.run(cmd, check=True)
        return send_file(output_path, mimetype="text/calendar")
    except subprocess.CalledProcessError as e:
        return jsonify({"error": "Failed to export TimeTree calendar", "details": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
