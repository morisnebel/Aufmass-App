# iteration_53: Help '?' buttons and the Home/Sketch tours (browser_automation recipe)

- Every browser_automation call starts a fresh context. Clear localStorage and set app_language='de'. To skip a tour, set aufmassprofi_tour_done='1' and/or aufmassprofi_sketch_tour_done='1'.
- Accept the welcome dialog with [data-testid=disclaimer-checkbox] and then [data-testid=disclaimer-accept]. You can also seed it with SEED_JS from setup_snippet.py; that also creates project p1.
- Both tours render [data-testid=home-tour]. Use tour-next and tour-skip to move through them. To tell if a step has a highlight, count the children of home-tour: 6 means a highlight rect is drawn, 2 means there is none. A child count of 6 does not prove the highlight is visible on screen; check the screenshot.
- The '?' buttons are apt-help (in the modal opened by home-add-appointment), backup-help (on /backup) and sketch-help (in the sketch header). Each opens /help?section=termine|backup|skizzen. A chapter is expanded if help-sec-<id> exists and help-info-<id>-N buttons are present.
- To draw in the sketch: get x = SCROLL_JS(655), click the pen at (x+12, 89), then drag with the mouse. The badge shows 'Elemente: N'.
