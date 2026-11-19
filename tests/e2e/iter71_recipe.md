# Proven recipe (main agent ran it live, 768x1024) - sketch editor automation
1. Open app root, wait for #root text, then page.evaluate: seed localStorage (SEED_JS from setup_snippet.py) plus
   aufmassprofi_tour_done='1', aufmassprofi_sketch_tour_done='1', app_language='de', then location.assign('/sketches/draw?projectId=p1').
2. Wait for get_by_test_id('sketch-canvas'), then wait >= 4000ms (auto tutorial ignores rooms closed within 2.5s after open).
3. get_by_test_id('tool-polygon').click(); box = sketch-canvas bounding_box (x=0,y=192 at 768x1024).
4. page.mouse.click(box.x+X, box.y+Y) with 500ms pause for (200,250),(520,250),(520,490),(200,490) and again (200,250) to close.
   -> 'sketch-element-count' shows 'Elemente: 1' and, without key aufmassprofi_room_tutorial_done, testID 'room-tutorial' appears (VERIFIED).
New testIDs: sketch-canvas, sketch-element-count, tool-zoom, tool-edit, tool-measure-line, tool-polygon, tool-angle-snap, tool-grid-snap,
tool-add-point, tool-remove-point, tool-pen, tool-line, tool-circle, tool-rect, tool-delete-element, point-move-only-toggle,
line-measure-input, line-measure-commit, line-measure-label-<segIdx> (SVG G), opening-marker-<seg>-<idx> (SVG G), opening-chain,
room-tutorial(-close/-next/-back/-practice/-title), room-coach(-toggle/-count/-title/-skip/-exit), opening-insert-<door|window|other>,
wall-opening-offset-<i>, wall-opening-conflict-<i>, wall-opening-copy-<i>, wall-opening-area-<i>.
Line midpoints of the room above (canvas-relative): top (360,250), right (520,370), bottom (360,490), left (200,370).
Long-press = page.mouse.move -> down -> wait 800ms -> up. Drag = mouse.move, down, several mouse.move steps (steps=10), up.

## Addendum after iteration_71 (testIDs that ALREADY EXIST - tester did not find them)
panel-options-toggle ('Mehr'), panel-keyboard-toggle, wall-section-toggle (Wandhöhe section), wall-height-all, wall-height-line,
wall-deduction-line, wall-opening-add, wall-opening-width-<i>, wall-opening-height-<i>, wall-opening-kind-<door|window|other>-<i>,
wall-opening-remove-<i>, wall-opening-preset-<id>, wall-deduction-total, wall-line-area, wall-sum-area, line-measure-undo, line-numbers-toggle.
Area options (Alle Ecken rechtwinklig / Winkel / Diagonalen / geraderücken): see testIDs in src/components/sketch/AreaOptionsSection.tsx.
Measuring recipe (verified): tool-edit -> click line midpoint -> click line-measure-input -> keyboard.type('4') -> click line-measure-commit;
close panel = click line-measure-commit again with empty input.
Opening drag (verified live by main agent after adding userSelect:'none' on the canvas - before that the browser text selection
cancelled the responder on web): mouse.move to marker on the line, down, 20px steps with 80ms pause, up.
Read positions: [...document.querySelectorAll('[data-testid^=opening-marker]')].map(g=>g.textContent)  e.g. 'F 1,00×1,20 ↦1,45'.
Verified: window dragged across door stops at 1,45 (door 0,56+0,885), opening-chain visible during drag, vertical wall drag 1,00->2,00.
STILL NOT EXECUTED LIVE: T2b, T3 steps 7-9 inside practice, coach skip/toggle/exit, T4, T5 (390x844), O5 (type switch/copy/delete), O6 (save/reopen), O7.
