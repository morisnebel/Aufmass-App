# Iteration 52 – Appointment ↔ project sync (web preview, browser_automation)
Seed (page.evaluate, then reload, accept disclaimer-checkbox + disclaimer-accept):
- app_language=de
- aufmassprofi_customers: cust_TEST_1 'Lena TEST_Berger' (Lindenweg 7, 80331 München)
- aufmassprofi_projects: proj_TEST_1 'TEST_Dach Berger' with objekt_street/plz/city = Baustellenweg 3, 80999 München

Flow (wait about 1s after opening a modal because of the slide animation, and scrollIntoView before clicking):
1. /projects/proj_TEST_1 -> project-appointment -> check apt-address = Objektadresse -> apt-quick-1, apt-time 09:30 -> apt-save
2. / -> home-week-a-<id> -> apt-quick-2 -> apt-save -> expect exactly 1 row, no home-week-p-proj_TEST_1
3. /appointments -> cal-up-a-<id> only; project chip shows the new date
4. / (opened fresh via goto) -> home-week-a-<id> -> apt-delete (confirm dialog) -> expect no rows WITHOUT a reload (fails, see iteration_52)
5. Custom remind/depart later than the start -> dialog 'Erinnerung nach dem Termin'
6. dt-input typed '04.11.2026 06:15' + dt-quick-2 -> '05.11.2026 06:15'
