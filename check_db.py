import json
import urllib.request
import re

with open('./js/config/supabase.js', 'r') as f:
    content = f.read()
    
url_match = re.search(r"SUPABASE_URL\s*=\s*['\"]([^'\"]+)['\"]", content)
key_match = re.search(r"SUPABASE_ANON_KEY\s*=\s*['\"]([^'\"]+)['\"]", content)

url = url_match.group(1)
key = key_match.group(1)

def query_table(table):
    req = urllib.request.Request(f"{url}/rest/v1/{table}?select=*", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}"
    })
    try:
        with urllib.request.urlopen(req) as response:
            print(f"{table}:", response.read().decode())
    except Exception as e:
        print(f"{table} ERROR:", e)

query_table('boat_prices')
query_table('boat_pricing_tiers')
