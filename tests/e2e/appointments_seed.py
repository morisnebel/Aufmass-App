# Home appointments (Heute / Nächste 7 Tage) seed – exec after home2_seed.py and seed(page): await page.evaluate(SEED_APT); then reload
# p3: project Termin +3 days 09:00 with address, p4: project Termin today 08:00; own appointments t1 (+1, address), t5 (+5), t7 (+7, no time), t9 (+9, must NOT show)
SEED_APT = """()=>{const k=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const ps=JSON.parse(localStorage.getItem('aufmassprofi_projects'));
  ps.find(p=>p.id==='p3').appointment_date=k(3); ps.find(p=>p.id==='p3').appointment_time='09:00'; ps.find(p=>p.id==='p3').address='Bahnhofstr. 2, 50667 Köln';
  ps.find(p=>p.id==='p4').appointment_date=k(0); ps.find(p=>p.id==='p4').appointment_time='08:00';
  localStorage.setItem('aufmassprofi_projects',JSON.stringify(ps));
  const mk=(id,n,t,a)=>({id,title:'TEST_Termin '+id,date:k(n),time:t,address:a||'',note:'',travel_minutes:null,reminder_id:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
  localStorage.setItem('aufmassprofi_appointments',JSON.stringify([mk('t1',1,'07:45','Hauptstr 1 Berlin'),mk('t5',5,'10:00'),mk('t7',7,null),mk('t9',9,'10:00')]));}"""

# Wide test logo (400x150 PNG) is generated with PIL into /tmp/logo_uri.txt and passed via seed(page, settings={"logo_data": uri})
