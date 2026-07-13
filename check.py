import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Listen for console logs
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))
        
        print("Navigating...")
        # Assuming we serve locally on 8080
        await page.goto("http://localhost:8080/admin/index.html")
        await asyncio.sleep(2)
        print("Done.")
        await browser.close()

asyncio.run(run())
