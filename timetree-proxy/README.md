# YRSF TimeTree -> iCal Render Bridge

A lightweight Python microservice for Render (`onrender.com`) that bridges TimeTree calendars to standard `.ics` format without being blocked by Cloudflare or IP filters.

## How to Deploy to Render.com

1. **Commit these files (`app.py`, `requirements.txt`) to your GitHub repo.**
2. **In Render Dashboard**:
   - Go to your Web Service (`yrsf-website`)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
3. **Add Environment Variable (Optional but Recommended for 100% Reliability)**:
   - Go to **Environment** tab in Render
   - Add Key: `TIMETREE_API_TOKEN`
   - Value: Your free Personal Access Token from [https://timetreeapp.com/developer](https://timetreeapp.com/developer)

## Usage
Fetch any TimeTree calendar by code:
`https://yrsf-website.onrender.com/timetree.ics?c=93TAtkhS37u2`
