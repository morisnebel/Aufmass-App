"""Iteration 32: e2e test for 3 new offline Expo features via web preview.
   1) SYNC-ZEITSTEMPEL in duplicate dialog on re-import
   2) EXPORT-VERLAUF 'Zuletzt exportiert' label on project detail
   3) PAPIERKORB restore / permanent delete w/ 30-day retention
"""
import asyncio, os, json, re, time, pathlib
from playwright.async_api import async_playwright

URL = "https://image-render-test.preview.emergentagent.com"
SEED = "/tmp/seed.aufmass"
DOWNLOAD_DIR = "/tmp/downloads"

async def accept_disclaimer(page):
    # Wait for either Home (already accepted) or disclaimer-checkbox
    try:
        await page.wait_for_selector('[data-testid="disclaimer-checkbox"], [data-testid="home-import"], [data-testid="home-new-project"]', timeout=15000)
    except Exception as e:
        print(f"[disclaimer] timeout waiting: {e}")
        return
    cb = await page.query_selector('[data-testid="disclaimer-checkbox"]')
    if not cb:
        print("[disclaimer] already accepted")
        return
    # scroll inner ScrollView to end
    try:
        await page.evaluate("""() => {
            const nodes = Array.from(document.querySelectorAll('*'));
            // find any scrollable element
            for (const el of nodes) {
                const s = el.scrollHeight - el.clientHeight;
                if (s > 60 && el.clientHeight > 100) {
                    el.scrollTop = el.scrollHeight;
                }
            }
        }""")
        await page.wait_for_timeout(600)
    except Exception as e:
        print(f"[disclaimer] scroll err: {e}")
    await page.click('[data-testid="disclaimer-checkbox"]', force=True)
    await page.wait_for_timeout(300)
    await page.click('[data-testid="disclaimer-accept"]', force=True)
    await page.wait_for_timeout(1200)
    print("[disclaimer] accepted")

async def do_import(page, path):
    # home-import triggers a file picker. On web it should pop a <input type=file>
    # We attach via wait_for_file_chooser.
    async with page.expect_file_chooser() as fc_info:
        await page.click('[data-testid="home-import"]', force=True)
    fc = await fc_info.value
    await fc.set_files(path)
    print(f"[import] file set: {path}")

async def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    results = {}
    captured_dialogs = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            accept_downloads=True,
        )
        page = await ctx.new_page()

        def on_dialog(d):
            captured_dialogs.append({"type": d.type, "message": d.message})
            print(f"[DIALOG {d.type}] {d.message[:400]}")
            # default accept so flows proceed
            asyncio.create_task(d.accept())
        page.on("dialog", on_dialog)
        page.on("console", lambda m: print(f"[CONSOLE {m.type}] {m.text[:300]}") if m.type in ("error","warning") else None)

        print(f"[go] {URL}")
        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2500)

        await accept_disclaimer(page)

        # Wait for Home
        try:
            await page.wait_for_selector('[data-testid="home-new-project"], [data-testid="home-import"]', timeout=15000)
        except Exception as e:
            print(f"[home] not visible: {e}")
            await page.screenshot(path="/tmp/home_fail.png", quality=40, full_page=False)

        # Pro unlock may be needed. Check if home-import exists.
        has_import = await page.query_selector('[data-testid="home-import"]')
        if not has_import:
            print("[pro] home-import missing - need to unlock PROFI2024 in setup/settings")
            # Try to navigate to settings
            await page.goto(URL + "/settings", wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)
            # Look for expert code input - type PROFI2024 somewhere
            try:
                inputs = await page.query_selector_all('input')
                for inp in inputs:
                    ph = await inp.get_attribute('placeholder') or ''
                    if 'code' in ph.lower() or 'pro' in ph.lower() or 'expert' in ph.lower():
                        await inp.fill('PROFI2024')
                        break
            except Exception as e:
                print(f"[pro] couldn't find code input: {e}")
            await page.goto(URL, wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)

        # ========== SEED via IMPORT ==========
        print("\n=== SEED via home-import ===")
        try:
            await do_import(page, SEED)
            await page.wait_for_timeout(3500)
            # No duplicate expected -> maybe a success alert
        except Exception as e:
            print(f"[seed] import failed: {e}")
            await page.screenshot(path="/tmp/seed_fail.png", quality=40, full_page=False)

        # Verify project in list
        await page.wait_for_timeout(1500)
        page_text = await page.inner_text('body')
        has_seed = 'SeedProjekt' in page_text
        print(f"[seed] 'SeedProjekt' visible on home: {has_seed}")
        results['seed_imported'] = has_seed
        if not has_seed:
            await page.screenshot(path="/tmp/no_seed.png", quality=40, full_page=False)
            print("[seed] body text excerpt:", page_text[:500])

        # ========== TEST 1 - EXPORT-VERLAUF ==========
        print("\n=== TEST 1 - EXPORT-VERLAUF ===")
        results['test1'] = {}
        try:
            # Click the SeedProjekt card
            # Find project-card-* that contains SeedProjekt
            cards = await page.query_selector_all('[data-testid^="project-card-"]')
            print(f"[test1] project cards: {len(cards)}")
            clicked = False
            for c in cards:
                t = await c.inner_text()
                if 'SeedProjekt' in t:
                    tid = await c.get_attribute('data-testid')
                    print(f"[test1] clicking {tid}")
                    await c.click(force=True)
                    clicked = True
                    break
            if not clicked and cards:
                await cards[0].click(force=True)
            await page.wait_for_timeout(2500)

            # Click project-export
            captured_dialogs.clear()
            # Register download listener BEFORE click
            dl_task = asyncio.create_task(page.wait_for_event('download', timeout=15000))
            await page.click('[data-testid="project-export"]', force=True)
            await page.wait_for_timeout(2000)
            # dialog(s) should have fired
            print(f"[test1] dialogs after export click: {len(captured_dialogs)}")
            for d in captured_dialogs:
                print(f"  -> {d['type']}: {d['message'][:200]}")

            try:
                dl = await dl_task
                dl_path = os.path.join(DOWNLOAD_DIR, dl.suggested_filename)
                await dl.save_as(dl_path)
                print(f"[test1] download saved: {dl_path}")
                results['test1']['downloaded_file'] = dl_path
            except Exception as e:
                print(f"[test1] no download captured: {e}")
                results['test1']['downloaded_file'] = None

            await page.wait_for_timeout(1500)
            body = await page.inner_text('body')
            m = re.search(r'Zuletzt exportiert[^\n]*', body)
            results['test1']['label_visible'] = bool(m)
            results['test1']['label_text'] = m.group(0) if m else None
            print(f"[test1] label: {results['test1']['label_text']}")

            # Go back home and reopen
            back = await page.query_selector('[data-testid="project-back"]')
            if back:
                await back.click(force=True)
            else:
                await page.go_back()
            await page.wait_for_timeout(2000)
            # click same card again
            cards = await page.query_selector_all('[data-testid^="project-card-"]')
            for c in cards:
                t = await c.inner_text()
                if 'SeedProjekt' in t:
                    await c.click(force=True)
                    break
            await page.wait_for_timeout(2500)
            body2 = await page.inner_text('body')
            m2 = re.search(r'Zuletzt exportiert[^\n]*', body2)
            results['test1']['label_persisted'] = bool(m2)
            print(f"[test1] label persisted after reopen: {results['test1']['label_persisted']} ({m2.group(0) if m2 else 'n/a'})")

            # back to home for next tests
            back = await page.query_selector('[data-testid="project-back"]')
            if back:
                await back.click(force=True)
            else:
                await page.go_back()
            await page.wait_for_timeout(1800)
        except Exception as e:
            print(f"[test1] ERROR: {e}")
            results['test1']['error'] = str(e)
            await page.screenshot(path="/tmp/test1_err.png", quality=40, full_page=False)

        # ========== TEST 2 - SYNC-ZEITSTEMPEL (re-import of downloaded file) ==========
        print("\n=== TEST 2 - SYNC-ZEITSTEMPEL ===")
        results['test2'] = {}
        dl_path = results.get('test1', {}).get('downloaded_file')
        if dl_path and os.path.exists(dl_path):
            try:
                captured_dialogs.clear()
                # Install a custom dialog handler that captures but we auto-accept 'update'
                # window.confirm on web: OK = update, Cancel = copy. We need OK.
                # The default handler accepts, which maps to 'update'.
                async with page.expect_file_chooser() as fc_info:
                    await page.click('[data-testid="home-import"]', force=True)
                fc = await fc_info.value
                await fc.set_files(dl_path)
                print(f"[test2] re-imported: {dl_path}")
                await page.wait_for_timeout(5000)
                # Scan dialogs
                dup_msgs = [d for d in captured_dialogs if 'existiert bereits' in d['message']]
                results['test2']['duplicate_dialog_fired'] = bool(dup_msgs)
                if dup_msgs:
                    msg = dup_msgs[0]['message']
                    results['test2']['message'] = msg
                    results['test2']['has_file_exported_line'] = '📄 Datei exportiert:' in msg
                    results['test2']['has_device_changed_line'] = '📱 Gerät zuletzt geändert:' in msg
                    results['test2']['has_newer_hint'] = any(h in msg for h in [
                        'Die Datei ist NEUER', 'praktisch gleich aktuell', 'DIESEM GERÄT ist neuer'
                    ])
                    print(f"[test2] msg: {msg}")
                    print(f"[test2] has_file_exported: {results['test2']['has_file_exported_line']}")
                    print(f"[test2] has_device_changed: {results['test2']['has_device_changed_line']}")
                    print(f"[test2] has_newer_hint: {results['test2']['has_newer_hint']}")
                else:
                    print(f"[test2] no duplicate dialog found. dialogs: {[d['message'][:150] for d in captured_dialogs]}")
            except Exception as e:
                print(f"[test2] ERROR: {e}")
                results['test2']['error'] = str(e)
        else:
            print("[test2] SKIP: no download from test1")
            results['test2']['skipped'] = 'no_download'

        await page.wait_for_timeout(1500)

        # ========== TEST 3 - TRASH after UPDATE ==========
        print("\n=== TEST 3 - TRASH via Update ===")
        results['test3'] = {}
        try:
            # home should show only ONE active SeedProjekt
            await page.wait_for_timeout(1500)
            body = await page.inner_text('body')
            active_count = body.count('SeedProjekt')
            print(f"[test3] 'SeedProjekt' occurrences in home body text: {active_count}")
            results['test3']['home_active_mentions'] = active_count

            # go to settings
            await page.goto(URL + "/settings", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            trash_btn = await page.query_selector('[data-testid="settings-trash"]')
            print(f"[test3] settings-trash present: {bool(trash_btn)}")
            if trash_btn:
                await trash_btn.click(force=True)
                await page.wait_for_timeout(2500)
                tbody = await page.inner_text('body')
                results['test3']['trash_body_sample'] = tbody[:500]
                results['test3']['has_geloescht'] = 'Gelöscht:' in tbody
                results['test3']['has_30_tage'] = 'noch 30 Tag' in tbody or 'noch 30' in tbody
                results['test3']['has_wiederherstellen'] = 'Wiederherstellen' in tbody
                results['test3']['has_endg'] = 'Endgültig löschen' in tbody
                # find trash-restore-<id>
                restore_btns = await page.query_selector_all('[data-testid^="trash-restore-"]')
                results['test3']['restore_btn_count'] = len(restore_btns)
                print(f"[test3] trash contents: Gelöscht={results['test3']['has_geloescht']}, 30 Tage={results['test3']['has_30_tage']}, Wiederherstellen={results['test3']['has_wiederherstellen']}, Endgültig={results['test3']['has_endg']}, restore buttons={len(restore_btns)}")

                # ========== TEST 4 - RESTORE ==========
                if restore_btns:
                    print("\n=== TEST 4 - RESTORE ===")
                    tid = await restore_btns[0].get_attribute('data-testid')
                    print(f"[test4] clicking {tid}")
                    await restore_btns[0].click(force=True)
                    await page.wait_for_timeout(2500)
                    # go home
                    await page.goto(URL, wait_until="domcontentloaded")
                    await page.wait_for_timeout(2500)
                    hbody = await page.inner_text('body')
                    cards = await page.query_selector_all('[data-testid^="project-card-"]')
                    seed_cards = 0
                    for c in cards:
                        t = await c.inner_text()
                        if 'SeedProjekt' in t:
                            seed_cards += 1
                    results['test4'] = {
                        'home_card_count': len(cards),
                        'seedprojekt_cards': seed_cards,
                        'two_projects': seed_cards >= 2,
                    }
                    print(f"[test4] cards={len(cards)}, SeedProjekt cards={seed_cards}")
            else:
                await page.screenshot(path="/tmp/no_settings_trash.png", quality=40, full_page=False)
                print(f"[test3] settings body sample: {(await page.inner_text('body'))[:400]}")
        except Exception as e:
            print(f"[test3/4] ERROR: {e}")
            results['test3']['error'] = str(e)
            await page.screenshot(path="/tmp/test3_err.png", quality=40, full_page=False)

        # ========== TEST 6 - REGRESSION: /trash empty state (after clearing) ==========
        print("\n=== TEST 6 - /trash empty state check ===")
        results['test6'] = {}
        try:
            # Navigate to /trash directly
            await page.goto(URL + "/trash", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            tbody = await page.inner_text('body')
            results['test6']['has_papierkorb'] = 'Papierkorb' in tbody
            # If no trashed items it should show 'Papierkorb ist leer'
            results['test6']['has_empty_state'] = 'Papierkorb ist leer' in tbody
            results['test6']['has_restore_btn'] = bool(await page.query_selector('[data-testid^="trash-restore-"]'))
            print(f"[test6] trash reachable={results['test6']['has_papierkorb']}, empty_state={results['test6']['has_empty_state']}, restore_btns={results['test6']['has_restore_btn']}")
        except Exception as e:
            print(f"[test6] ERROR: {e}")
            results['test6']['error'] = str(e)

        print("\n==== FINAL RESULTS ====")
        print(json.dumps(results, indent=2, default=str))
        with open("/tmp/iter32_results.json", "w") as f:
            json.dump(results, f, indent=2, default=str)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
