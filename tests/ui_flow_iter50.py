
# Iteration 50 UI flow: customer -> appointment (Aus Kunden) -> project from appointment (Objektadresse prefill)
import asyncio
await page.set_viewport_size({"width": 390, "height": 844})
dialogs = []
async def on_dialog(d):
    dialogs.append(d.message); print("DIALOG:", d.message.replace("\n", " | ")); await d.accept()
page.on("dialog", lambda d: asyncio.ensure_future(on_dialog(d)))
B = "https://image-render-test.preview.emergentagent.com"
GET_APTS = "() => JSON.parse(localStorage.getItem('aufmassprofi_appointments')||'[]')"
try:
    await page.goto(B, wait_until="networkidle")
    await page.evaluate("localStorage.setItem('app_language','de')")
    await page.reload(wait_until="networkidle"); await page.wait_for_timeout(2500)
    cb = page.get_by_text("Ich habe die Hinweise gelesen und akzeptiere sie.")
    if await cb.count():
        await cb.first.click(force=True); await page.wait_for_timeout(300)
        await page.get_by_text("App starten").first.click(force=True); await page.wait_for_timeout(1500)
    # customer via UI
    await page.goto(B + "/customers/new", wait_until="networkidle"); await page.wait_for_timeout(2500)
    await page.get_by_placeholder("Vorname", exact=True).fill("Lena")
    await page.get_by_placeholder("Nachname", exact=True).fill("TEST_Berger")
    await page.get_by_placeholder("Straße und Hausnummer").fill("Lindenweg 7")
    await page.get_by_placeholder("PLZ", exact=True).fill("80331")
    await page.get_by_placeholder("Ort", exact=True).fill("München")
    await page.click('[data-testid="customer-save"]', force=True)
    await page.wait_for_timeout(2000)
    cust_id = await page.evaluate("() => (JSON.parse(localStorage.getItem('aufmassprofi_customers')||'[]').find(c=>c.name.includes('TEST_Berger'))||{}).id")
    print("cust_id", cust_id)
    # home -> + Termin
    await page.goto(B, wait_until="networkidle"); await page.wait_for_timeout(3000)
    await page.click('[data-testid="home-add-appointment"]', force=True); await page.wait_for_timeout(1200)
    await page.click('[data-testid="apt-customer-toggle"]', force=True); await page.wait_for_timeout(500)
    await page.click(f'[data-testid="apt-customer-{cust_id}"]', force=True); await page.wait_for_timeout(500)
    print("apt-address:", await page.input_value('[data-testid="apt-address"]'), "| title:", await page.input_value('[data-testid="apt-title"]'))
    await page.fill('[data-testid="apt-time"]', "08:30")
    await page.fill('[data-testid="apt-note"]', "Leiter mitnehmen")
    # custom reminder: empty -> alert
    await page.click('[data-testid="apt-remind--1"]', force=True); await page.wait_for_timeout(400)
    vis = await page.locator('[data-testid="apt-remind-custom"]').count()
    print("apt-remind-custom visible:", vis, "placeholder:", await page.get_attribute('[data-testid="apt-remind-custom"]', 'placeholder') if vis else None)
    await page.click('[data-testid="apt-save"]', force=True); await page.wait_for_timeout(800)
    print("after empty save apts:", len(await page.evaluate(GET_APTS)))
    await page.fill('[data-testid="apt-remind-custom"]', "32.13.2026 25:99"); await page.click('[data-testid="apt-save"]', force=True); await page.wait_for_timeout(800)
    await page.fill('[data-testid="apt-remind-custom"]', "abc"); await page.click('[data-testid="apt-save"]', force=True); await page.wait_for_timeout(800)
    print("after invalid saves apts:", len(await page.evaluate(GET_APTS)))
    await page.screenshot(path="/tmp/f_custom.png", quality=40, full_page=False)
    await page.fill('[data-testid="apt-remind-custom"]', "20.12.2026 07:45")
    await page.click('[data-testid="apt-save"]', force=True); await page.wait_for_timeout(1500)
    apts = await page.evaluate(GET_APTS)
    print("APTS:", apts)
    apt = apts[0]
    # reopen
    await page.click(f'[data-testid="home-today-a-{apt["id"]}"]', force=True); await page.wait_for_timeout(1200)
    print("reopen remind-custom:", await page.input_value('[data-testid="apt-remind-custom"]') if await page.locator('[data-testid="apt-remind-custom"]').count() else "NOT SHOWN")
    chip_bg = await page.evaluate("() => getComputedStyle(document.querySelector('[data-testid=\"apt-remind--1\"]')).backgroundColor")
    print("custom chip bg:", chip_bg)
    await page.screenshot(path="/tmp/f_reopen.png", quality=40, full_page=False)
    await page.click('[data-testid="apt-create-project"]', force=True); await page.wait_for_timeout(3000)
    print("URL:", page.url)
    vals = {}
    for ph in ["z.B. Dachsanierung Hauptstraße", "Straße und Hausnummer", "PLZ", "Ort", "Projektbeschreibung..."]:
        loc = page.get_by_placeholder(ph, exact=True)
        vals[ph] = await loc.first.input_value() if await loc.count() else None
    print("PROJECT FORM:", vals)
    body = await page.evaluate("document.body.innerText")
    print("customer shown:", "Lena TEST_Berger" in body)
    await page.screenshot(path="/tmp/f_proj.png", quality=40, full_page=False)
    await page.click('[data-testid="project-save"]', force=True); await page.wait_for_timeout(3000)
    print("URL after project save:", page.url)
    projs = await page.evaluate("() => JSON.parse(localStorage.getItem('aufmassprofi_projects')||'[]').map(p=>({id:p.id,name:p.name,customer_id:p.customer_id,description:p.description,objekt_street:p.objekt_street,objekt_plz:p.objekt_plz,objekt_city:p.objekt_city}))")
    print("PROJECTS:", projs)
    print("APT after:", await page.evaluate(GET_APTS))
    print("customer projectAddresses:", await page.evaluate("() => (JSON.parse(localStorage.getItem('aufmassprofi_customers')||'[]').find(c=>c.name.includes('TEST_Berger'))||{}).projectAddresses"))
    print("keys:", await page.evaluate("Object.keys(localStorage)"))
except Exception as e:
    print("ERR", e)
    await page.screenshot(path="/tmp/f_err.png", quality=40, full_page=False)
print("DIALOGS:", dialogs)
