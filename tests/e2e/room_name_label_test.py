# iteration_42: Raumname neben S-Kreis (canvas + saved SVG). Run via browser_automation: exec(open(...).read()) then await run(page)
FIND_JS = """(name)=>{const svgs=[...document.querySelectorAll('svg')];const out=[];for(const s of svgs){for(const t of s.querySelectorAll('text')){if(t.textContent.trim()===name){const r=t.getBoundingClientRect();out.push({x:r.x,y:r.y,w:r.width,h:r.height,fill:t.getAttribute('fill'),stroke:t.getAttribute('stroke')});}}}return out}"""
SAVED_SVG_JS = """()=>{const res=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k);const m=v&&v.match(/data:image\\/svg\\+xml;base64,([A-Za-z0-9+\\/=]+)/g);if(m){for(const d of m){try{res.push({k,svg:decodeURIComponent(escape(atob(d.split(',')[1])))})}catch(e){res.push({k,svg:atob(d.split(',')[1])})}}}}return res}"""

async def run(page):
    g = {}
    exec(open('/app/tests/e2e/setup_snippet.py').read(), g)
    exec(open('/app/tests/e2e/sketch_area_pdf_helpers.py').read(), g)
    exec(open('/app/tests/e2e/polygon_rename_helpers.py').read(), g)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto(page.url); await page.evaluate(g['SEED_JS'])
    base = page.url.split('/')[0] + '//' + page.url.split('/')[2]
    await page.goto(base + '/sketches/draw?projectId=p1'); await page.wait_for_timeout(8000)
    await g['build_square'](page, g)
    leg = await page.locator('[data-testid="legend-row-0"]').inner_text()
    print('legend before:', leg)
    await g['rename_row'](page, 0, 'Wohnzimmer')
    print('legend after rename:', await page.locator('[data-testid="legend-row-0"]').inner_text())
    s1 = await page.evaluate(FIND_JS, 'S1'); nm = await page.evaluate(FIND_JS, 'Wohnzimmer')
    print('S1 texts:', s1); print('Name texts:', nm)
    await page.screenshot(path='/tmp/i42_named.jpeg', quality=40, full_page=False)
    if s1 and nm:
        c = s1[0]; n = nm[-1]
        gap = n['x'] - (c['x'] + c['w'])
        print(f'PASS name right of S1: gap={gap:.1f}px, dy={(n["y"]-c["y"]):.1f}' if 0 < gap < 30 and abs(n['y'] - c['y']) < 8 else f'FAIL position gap={gap}')
        # drag label circle in select mode (build_square ends in Edit mode)
        cx, cy = c['x'] + c['w'] / 2, c['y'] + c['h'] / 2
        await page.mouse.move(cx, cy); await page.mouse.down()
        for i in range(1, 11):
            await page.mouse.move(cx + 6 * i, cy + 4 * i); await page.wait_for_timeout(30)
        await page.mouse.up(); await page.wait_for_timeout(600)
        s1b = await page.evaluate(FIND_JS, 'S1'); nmb = await page.evaluate(FIND_JS, 'Wohnzimmer')
        dS = (s1b[0]['x'] - c['x'], s1b[0]['y'] - c['y']); dN = (nmb[-1]['x'] - n['x'], nmb[-1]['y'] - n['y'])
        print('S1 moved by', dS, 'name moved by', dN)
        print('PASS name follows label' if abs(dS[0]) > 20 and abs(dS[0] - dN[0]) < 3 and abs(dS[1] - dN[1]) < 3 else 'FAIL/CHECK name follow')
        await page.screenshot(path='/tmp/i42_moved.jpeg', quality=40, full_page=False)
    # save and check stored SVG
    await page.locator('[data-testid="sketch-save-button"]').click(); await page.wait_for_timeout(2500)
    svgs = await page.evaluate(SAVED_SVG_JS)
    print('saved svgs:', len(svgs))
    for s in svgs:
        sv = s['svg']; i = sv.find('Wohnzimmer')
        print('key', s['k'], 'contains name:', sv.count('>Wohnzimmer<'))
        import re
        for m in re.finditer(r'<text[^>]*>(S1|Wohnzimmer)</text>', sv):
            print('  ', m.group(0)[:220])
        vb = re.search(r'viewBox="([^"]+)"', sv); print('  viewBox', vb.group(1) if vb else None)
    print('pageerrors:', errs)
    return g, svgs
