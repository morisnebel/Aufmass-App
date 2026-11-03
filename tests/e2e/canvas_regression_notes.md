# Canvas regression (iteration_37) – reusable recipe for browser_automation

Seed snippet: /app/tests/e2e/setup_snippet.py (SEED_JS + SCROLL_JS toolbar helper). Run page.evaluate(SEED_JS) and reload, wait 8 s (otherwise Pro tabs are sometimes missing), click [data-testid=project-card-p1].

Touch simulation (closest to an iPhone): cdp = await page.context.new_cdp_session(page); then Input.dispatchTouchEvent with touchStart, touchMove and touchEnd.

## Sketch editor (/sketches/draw?projectId=p1, via Sketches tab -> New Sketch)
Toolbar icons have absolute x positions. Use SCROLL_JS(absX), then click at (returned+12, 89).
- Pen 655, Line 695, Circle 733, Rectangle 771, Edit/select 348, Measure Line (M) 395, Position 221, Photo from Gallery 119, From Files 173.
- "Elemente: N" shows the element count.
- Use `svg rect[stroke="#FF0000"]` bounding boxes to check that an element moved.
- Use `svg image` to check images.

## Other screens
- Photo annotate: Photos tab -> Add Photo -> click (288,150) opens the file chooser -> 'Foto speichern' -> [data-testid^=photo-edit-] -> tap 'Zeichnen' -> drag.
- Signature: /reports/edit?projectId=p1 -> scroll to 'Hier unterschreiben (Kunde)' -> tap 'Unterschrift' (activates the pad) -> drag.
- Area calculator: /calculator/new?projectId=p1 -> 'Fläche' mode is the default -> tap 4 points, then tap the first point again -> NETTO 6.00 m² (1m = 100px).
- ImageMeter: /imagemeter/new?projectId=p1 -> 'Aus Galerie wählen' (file chooser) -> 'Weiter zum Messen' -> 'Messen' -> DRAG a line -> 'Maß eingeben' modal -> 'Hinzufügen'.
