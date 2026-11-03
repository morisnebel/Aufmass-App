# Drag project card onto folder drop target (RNGH Pan.activateAfterLongPress on web) – exec after home2_seed.py
# usage: H={}; exec(open('/app/tests/e2e/drag_folder_helpers.py').read(), H); await H['drag'](page, 'p5', 'fA')  (target None = release outside)
async def _center(page, sel):
    b = await page.locator(sel).bounding_box()
    return (b['x'] + b['width'] / 2, b['y'] + b['height'] / 2) if b else None

async def drag(page, card, target, hold=700):
    loc = page.locator(f'[data-testid="project-card-{card}"]')
    await loc.scroll_into_view_if_needed(); await page.wait_for_timeout(300)  # card must be inside viewport
    b = await loc.bounding_box(); cx, cy = b['x'] + 100, b['y'] + 30
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.wait_for_timeout(hold)
    await page.mouse.move(cx + 5, cy - 20, steps=5); await page.wait_for_timeout(300)
    if target:
        tc = await _center(page, f'[data-testid="drop-target-{target}"]')
        await page.mouse.move(tc[0], tc[1], steps=15)
    else:
        await page.mouse.move(cx + 20, min(cy + 60, 830), steps=15)
    await page.wait_for_timeout(300); await page.mouse.up(); await page.wait_for_timeout(1300)

FOLDER_STATE_JS = "()=>({p:Object.fromEntries(JSON.parse(localStorage.getItem('aufmassprofi_projects')).map(p=>[p.id,p.folder_id||null])), f:JSON.parse(localStorage.getItem('aufmassprofi_project_folders')||'[]').map(f=>f.id+':'+f.name)})"
