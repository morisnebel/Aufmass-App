# Shared seeding snippet (copied into browser_automation scripts): seeds disclaimer, customer, project p1, pro unlock
SEED_JS = """()=>{
  localStorage.setItem('aufmassprofi_settings', JSON.stringify({disclaimer_accepted_at:'2026-01-01T00:00:00.000Z',disclaimer_version:'2026-06'}));
  localStorage.setItem('aufmassprofi_customers', JSON.stringify([{id:'cust1',name:'TEST_Max Muster',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}]));
  localStorage.setItem('aufmassprofi_projects', JSON.stringify([{id:'p1',customer_id:'cust1',name:'TEST_Projekt',status:'active',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}]));
  localStorage.setItem('aufmassprofi_pro_unlocked','true');
}"""
# Toolbar helper: scroll horizontal toolbar so that icon at absolute x is visible, return client x
SCROLL_JS = """(absX)=>{const sc=[...document.querySelectorAll('div')].find(d=>{const s=getComputedStyle(d);return (s.overflowX==='auto'||s.overflowX==='scroll')&&d.scrollWidth>d.clientWidth+100&&d.getBoundingClientRect().y<150});if(!sc)return -1;sc.scrollLeft=Math.max(0,absX-150);return absX-sc.scrollLeft;}"""
