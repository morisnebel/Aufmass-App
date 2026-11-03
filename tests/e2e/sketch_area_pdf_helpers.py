# Helpers for iteration_39 (sketch polygon area -> project PDF Flächenübersicht). Copy into browser_automation scripts.
# Polygon tool abs x=434, Edit/select abs x=348 (use SCROLL_JS from setup_snippet.py, click (x+12, 89)).
# Tap segment midpoints in Edit mode -> numpad modal ('Enter measurement'), keys are leaf divs with exact text.
LEAF_RECT_JS = """(t)=>{const els=[...document.querySelectorAll('div')].filter(d=>d.children.length===0&&d.textContent.trim()===t);const v=els.map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);if(!v.length)return null;const r=v[v.length-1];return [r.x+r.width/2,r.y+r.height/2]}"""
