# iteration_40: helpers for "Flächen benennen" (legend rename) tests. Usage in browser_automation:
#   g={}; exec(open('/app/tests/e2e/setup_snippet.py').read(), g); exec(open('/app/tests/e2e/sketch_area_pdf_helpers.py').read(), g)
#   exec(open('/app/tests/e2e/polygon_rename_helpers.py').read(), g); await g['build_square'](page, g)
# Draws closed polygon 5/4/5/4 m at (60,250)-(310,450), enables m² display -> legend-row-0 'S1 = 18 lfm • 20,00 m²'
async def tool(page, g, absx):
    x = await page.evaluate(g['SCROLL_JS'], absx)
    await page.mouse.click(x + 12, 89)
    await page.wait_for_timeout(400)

async def build_square(page, g):
    L = g['LEAF_RECT_JS']
    await tool(page, g, 434)
    for p in [(60, 250), (310, 250), (310, 450), (60, 450), (60, 250)]:
        await page.mouse.click(*p); await page.wait_for_timeout(350)
    await tool(page, g, 348)
    for mid, val in [((185, 250), '5'), ((310, 350), '4'), ((185, 450), '5'), ((60, 350), '4')]:
        await page.mouse.click(*mid); await page.wait_for_timeout(600)
        r = await page.evaluate(L, val)
        if not r:
            print('no key', val); continue
        await page.mouse.click(*r); await page.wait_for_timeout(200)
        a = await page.evaluate(L, 'Add')
        if a: await page.mouse.click(*a)
        await page.wait_for_timeout(500)
    await page.mouse.click(185, 250); await page.wait_for_timeout(600)
    fl = page.get_by_text('Fläche: 20,00 m²')
    if await fl.count():
        await fl.first.click(); await page.wait_for_timeout(400)
    d = await page.evaluate(L, 'Done')
    if d:
        await page.mouse.click(*d); await page.wait_for_timeout(400)

async def rename_row(page, idx, value, ok=True):
    await page.locator(f'[data-testid="legend-row-{idx}"]').click()
    await page.wait_for_timeout(600)
    inp = page.locator('[data-testid="rename-prompt-input"]')
    if not await inp.count():
        print('rename modal NOT opened'); return False
    if value is not None:
        await inp.fill(value)
    await page.locator('[data-testid="rename-prompt-ok"]' if ok else '[data-testid="rename-prompt-cancel"]').click()
    await page.wait_for_timeout(600)
    return True
