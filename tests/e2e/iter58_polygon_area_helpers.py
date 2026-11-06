# iteration_58: German-UI helpers for polygon m² auto-area + Raumliste checks (copy into browser_automation scripts)
LEAF_RECT_JS = """(t)=>{const els=[...document.querySelectorAll('div')].filter(d=>d.children.length===0&&d.textContent.trim()===t);const v=els.map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);if(!v.length)return null;const r=v[v.length-1];return [r.x+r.width/2,r.y+r.height/2]}"""

# Polygon tool has no testID: it is the next sibling of the 'M' (Maßlinie) tool button
POLY_TOOL_JS = """()=>{const t=[...document.querySelectorAll('svg text')].find(x=>x.textContent.trim()==='M' && x.getBoundingClientRect().y<150);
  const b=t.closest('[tabindex]'); b.nextElementSibling.setAttribute('data-testid','tmp-poly-tool'); b.nextElementSibling.scrollIntoView({inline:'center'});}"""

# Decode saved preview SVG (sketch_data in aufmassprofi_sketches) for Raumliste checks
DECODE_SVG_JS = """()=>{const a=JSON.parse(localStorage.getItem('aufmassprofi_sketches')||'[]'); const s=a[a.length-1];
  const v=s&&s.sketch_data; if(!v||!v.startsWith('data:image/svg')) return null; const b=v.split(',')[1];
  try{return decodeURIComponent(escape(atob(b)));}catch(e){return atob(b);}}"""


async def poly_tool(page):
    await page.evaluate(POLY_TOOL_JS)
    await page.wait_for_timeout(300)
    await page.click('[data-testid="tmp-poly-tool"]', force=True)
    await page.wait_for_timeout(400)


async def edit_tool(page):
    # 'Bearbeiten' (hand) tool: click ~22px above its label
    e = await page.evaluate(LEAF_RECT_JS, 'Bearbeiten')
    await page.mouse.click(e[0], e[1] - 22)
    await page.wait_for_timeout(400)


async def draw_room(page, pts):
    """pts: corners incl. first point repeated at the end to close"""
    await poly_tool(page)
    for p in pts:
        await page.mouse.click(*p)
        await page.wait_for_timeout(350)


async def measure_sides(page, sides):
    """sides: [((midX, midY), '2,5'), ...] – must be in edit tool"""
    for mid, val in sides:
        await page.mouse.click(*mid)
        await page.wait_for_timeout(600)
        for ch in val:
            r = await page.evaluate(LEAF_RECT_JS, ch)
            if r:
                await page.mouse.click(*r)
                await page.wait_for_timeout(120)
        a = await page.evaluate(LEAF_RECT_JS, 'Hinzufügen')
        if a:
            await page.mouse.click(*a)
        await page.wait_for_timeout(450)

# Example (390x844): draw_room([(60,200),(310,200),(310,380),(60,380),(60,200)]); edit_tool();
# measure_sides([((185,200),'4'),((310,290),'2,5'),((185,380),'4'),((60,290),'2,5')]) -> '10,00 m²' auto
