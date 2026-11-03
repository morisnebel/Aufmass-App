# Startseite 2.0 / Projektordner – seeding helpers for browser_automation (exec this file, then await seed(page, pro=False))
BASE = "https://image-render-test.preview.emergentagent.com"

SEED_HOME_JS = """(args)=>{
 const [pro, settings] = args;
 localStorage.setItem('aufmassprofi_settings', JSON.stringify(Object.assign({disclaimer_accepted_at:'2026-01-01T00:00:00.000Z',disclaimer_version:'2026-06'}, settings||{})));
 localStorage.setItem('aufmassprofi_customers', JSON.stringify([{id:'cust1',name:'TEST_Max Muster',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}]));
 const st=['anfrage','angebot','ausfuehrung','fertig','anfrage','archiviert'];
 localStorage.setItem('aufmassprofi_projects', JSON.stringify(st.map((s,i)=>({id:'p'+(i+1),customer_id:'cust1',name:'TEST_Projekt '+(i+1),status:s,created_at:'2026-01-0'+(i+1)+'T00:00:00.000Z',updated_at:'2026-01-0'+(i+1)+'T00:00:00.000Z'}))));
 localStorage.removeItem('aufmassprofi_project_folders');
 if(pro) localStorage.setItem('aufmassprofi_pro_unlocked','true'); else localStorage.removeItem('aufmassprofi_pro_unlocked');
}"""

# Mock clock hours: call before goto via page.add_init_script(mock_hour_js(7))
def mock_hour_js(hour):
    return """(()=>{const H=%d;const R=Date;const off=(()=>{const n=new R();const t=new R(n);t.setHours(H,0,0,0);return t-n;})();
    class D extends R{constructor(...a){if(a.length===0){super(R.now()+off);}else{super(...a);}} static now(){return R.now()+off;}}
    window.Date=D;})();""" % hour

async def seed(page, pro=False, settings=None):
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate(SEED_HOME_JS, [pro, settings or {}])
    await page.goto(BASE, wait_until="networkidle")
    await page.wait_for_selector('[data-testid="home-screen"]', timeout=30000)
    await page.wait_for_timeout(1500)

async def home_ids(page):
    return await page.evaluate("""()=>[...document.querySelectorAll('[data-testid^="home-"]')].map(e=>e.getAttribute('data-testid'))""")

# Seed two folders: fA (p1), fB (p2)
SEED_FOLDERS_JS = """()=>{
 localStorage.setItem('aufmassprofi_project_folders', JSON.stringify([{id:'fA',name:'TEST_Ordner A',color:'#1976d2',created_at:'2026-01-01T00:00:00.000Z'},{id:'fB',name:'TEST_Ordner B',color:'#7c3aed',created_at:'2026-01-01T00:00:00.000Z'}]));
 const ps=JSON.parse(localStorage.getItem('aufmassprofi_projects'));
 ps.forEach(p=>{ if(p.id==='p1') p.folder_id='fA'; if(p.id==='p2') p.folder_id='fB'; });
 localStorage.setItem('aufmassprofi_projects', JSON.stringify(ps));
}"""
