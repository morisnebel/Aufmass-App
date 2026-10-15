# Iteration 34 - Photo move/copy/clipboard + BUG2 (edit pencil) regression test.
#
# NOT a pytest file - the actual test is executed via the Playwright
# mcp_browser_automation harness documented in /app/test_reports/iteration_34.json.
# Preserved here for reproducibility.
#
# Scenarios covered (all PASS):
#   1. Direct tap on photo-edit-ph1 => navigates to /photos/annotate?photoId=ph1
#   2. Tap on annotated photo ph3 body (Svg) => navigates to /photos/annotate (pointerEvents='none' passes tap through)
#   3. Multi-select ph1 + ph3 -> Verschieben -> Projekt Zwei -> Ohne Ordner => ph1,ph3 move to p2 in aufmassprofi_photos
#   4. Select ph2 -> Kopieren -> Projekt Zwei => ph2 stays in p1 and a new photo with new id lands in p2 (with own photo_img_* key)
#   5. Select ph2 -> Merken -> navigate to p2 -> green 'Fotos einfügen' banner (testID photo-paste) -> click => photo duplicated into p2, aufmassprofi_photo_clipboard removed
#
# Preview URL: https://image-render-test.preview.emergentagent.com
# Mobile viewport: 390x844
# Seed uses idempotent __test_seeded flag so add_init_script doesn't wipe state on subsequent navigations.
