# iteration_40: large-sketch / live-layer helpers (exec into dict g, like the other helpers)
# SVG_STATS_JS: stats of every canvas-sized <svg> (main canvas + live overlay layer)
SVG_STATS_JS = """()=>[...document.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>=300).map(s=>{const st=getComputedStyle(s);return {z:st.zIndex,pos:st.position,paths:s.querySelectorAll('path').length,imgs:s.querySelectorAll('image').length,rects:s.querySelectorAll('rect').length,circles:s.querySelectorAll('circle').length,lines:s.querySelectorAll('line').length,ptrEv:s.getAttribute('pointer-events')||st.pointerEvents}})"""
ELEM_COUNT_JS = """()=>{const t=[...document.querySelectorAll('div')].find(d=>d.children.length===0&&/^(Elemente|Elements): \\d+/.test(d.textContent.trim()));return t?t.textContent.trim():null}"""
LONGTASK_START_JS = """()=>{window.__lt=[];try{window.__lto&&window.__lto.disconnect();window.__lto=new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))});window.__lto.observe({entryTypes:['longtask']});}catch(e){} return true}"""
LONGTASK_READ_JS = """()=>window.__lt||[]"""

async def pen_stroke(page, x0, y0, dx=120, steps=12, hold=False):
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for i in range(1, steps + 1):
        await page.mouse.move(x0 + dx * i / steps, y0 + (8 if i % 2 else -8))
    if not hold:
        await page.mouse.up()
        await page.wait_for_timeout(120)
