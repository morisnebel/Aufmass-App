// Seed for packing inline-ticking tests (iteration 56). Evaluated in the page; returns ids.
() => {
  const d = new Date(); const t = new Date(); t.setDate(t.getDate() + 1);
  const k = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  localStorage.setItem('app_language', 'de');
  localStorage.setItem('aufmassprofi_tour_done', '1');
  localStorage.setItem('aufmassprofi_sketch_tour_done', '1');
  const cust = { id: 'TEST_c1', name: 'TEST_Kunde', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
  const mk = (id, name, upd) => ({ id, customer_id: 'TEST_c1', name, status: 'active', objekt_street: 'Hauptstr. 1', objekt_zip: '10115', objekt_city: 'Berlin', created_at: upd, updated_at: upd });
  localStorage.setItem('aufmassprofi_customers', JSON.stringify([cust]));
  localStorage.setItem('aufmassprofi_projects', JSON.stringify([
    mk('TEST_p1', 'TEST_Alt', '2025-10-01T08:00:00.000Z'),
    mk('TEST_p2', 'TEST_Mittel', '2025-11-01T08:00:00.000Z'),
    mk('TEST_p3', 'TEST_Neu', '2025-12-01T08:00:00.000Z'),
  ]));
  const now = '2025-09-01T08:00:00.000Z';
  localStorage.setItem('aufmassprofi_appointments', JSON.stringify([
    { id: 'TEST_wk', title: 'TEST_Woche', date: k(t), time: '10:00', project_id: 'TEST_p1', packing: [
      { id: 'w1', text: 'Leiter', done: false }, { id: 'w2', text: 'Kamera', done: false }], created_at: now, updated_at: now },
  ]));
  return { tomorrow: k(t), today: k(d) };
}
