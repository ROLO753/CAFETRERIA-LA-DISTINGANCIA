import json
from playwright.sync_api import sync_playwright, expect

stub = """
window.CAFETERIA_FIREBASE_CONFIG={};window.CAFETERIA_ADMIN_UID='admin';
window.tree=INITIAL_TREE;window.alerts=[];window.appNames=[];
let listeners=[], authListeners=[], next=0;
const pathParts=p=>p.split('/').filter(Boolean);
const get=p=>pathParts(p).reduce((n,k)=>n==null?undefined:n[k],window.tree);
const snapshot=p=>({val:()=>get(p)??null,exists:()=>get(p)!==undefined&&get(p)!==null});
function put(p,v){
 const k=pathParts(p);let n=window.tree;
 for(const x of k.slice(0,-1)){if(!n[x] || typeof n[x]!=='object')n[x]={};n=n[x]}
 if(v===null)delete n[k.at(-1)];else n[k.at(-1)]=v;
}
function notify(path){listeners.forEach(l=>{
 if(l.path===path || l.path.startsWith(path+'/') || path.startsWith(l.path+'/'))
  setTimeout(()=>l.cb(snapshot(l.path)),0);
})}
const mk=p=>({
 key:p.split('/').at(-1),
 on:(e,cb)=>{listeners.push({path:p,cb});setTimeout(()=>cb(snapshot(p)),0);return cb},
 off:(e,cb)=>{listeners=listeners.filter(l=>l.cb!==cb)},
 push:()=>mk(p+'/-'+String(++next).padStart(19,'0')),
 set:async v=>{if(window.failCampaignWrite && p.startsWith('promoCampaigns/')) throw new Error('Permission denied');put(p,v);notify(p)},
 remove:async()=>{put(p,null);notify(p)},
 update:async changes=>{for(const [path,value] of Object.entries(changes)){put(p?`${p}/${path}`:path,value);notify(p?`${p}/${path}`:path)}},
 transaction:async fn=>{const current=get(p);const value=fn(current===undefined?null:structuredClone(current));if(value!==undefined){put(p,value);notify(p)}return {committed:value!==undefined,snapshot:snapshot(p)}}
});
const auth={currentUser:INITIAL_USER,onAuthStateChanged:cb=>{authListeners.push(cb);setTimeout(()=>cb(auth.currentUser),0)},
 signInWithPopup:async()=>{auth.currentUser={uid:'client1',displayName:'Ana'};authListeners.forEach(cb=>cb(auth.currentUser))},
 signOut:async()=>{auth.currentUser=null;authListeners.forEach(cb=>cb(null))}};
function authStatic(){} authStatic.GoogleAuthProvider=function(){};
window.firebase={initializeApp:(config,name)=>{appNames.push(name||'default');return {database:()=>({ref:p=>mk(p||'')}),auth:()=>auth,storage:()=>({})}},
 auth:authStatic,database:{ServerValue:{TIMESTAMP:1}}};
"""

def new_page(browser, initial, user, width=390):
    page = browser.new_page(viewport={'width': width, 'height': 850})
    page.route('**/gstatic.com/**', lambda r: r.fulfill(body='', content_type='text/javascript'))
    page.route('**/firebase-config.js', lambda r: r.fulfill(body='', content_type='text/javascript'))
    page.add_init_script(stub.replace('INITIAL_TREE', json.dumps(initial)).replace('INITIAL_USER', json.dumps(user)))
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    return page, errors


legacy_combo = {'name': 'Combo anterior', 'description': 'Anterior', 'price': 200,
                'image': 'promo/combo-primeros-10.png'}
legacy_user = {'coupon': 'aprobado', 'tokens': 8, 'revision': 1,
               'prizes': {'p1': {'name': 'Hamburguesa', 'status': 'pendiente'}}}
initial = {'products': {}, 'orders': {}, 'settings': {'storeStatus': 'open'},
           'promoSettings': {'combo': legacy_combo}, 'promoPublic': {'coupons': 1},
           'promoLedger': {'coupons': 1, 'users': {'client1': legacy_user}},
           'promoUsers': {'client1': legacy_user}, 'promoUses': {'client1': '-oldorder00000000000'}}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    admin, errors = new_page(browser, initial, {'uid': 'admin', 'email': 'a@a'})
    admin.goto('http://127.0.0.1:18759/admin.html')
    admin.get_by_role('button', name='🎁 Promociones').click()
    expect(admin.locator('#promo-combo-name')).to_have_value('Combo anterior')
    admin.click('#promo-combo-toggle')
    admin.wait_for_function("tree.promoSettings.combo.active === false")
    admin.click('#promo-combo-toggle')
    admin.wait_for_function("tree.promoSettings.combo.active === true")
    admin.evaluate("db.ref('promoRequests/client1/spin1').set({type:'spin'})")
    admin.wait_for_timeout(200)
    assert admin.evaluate("!tree.promoLedger.spins && tree.promoLedger.users.client1.tokens===8")
    admin.click('text=Aprobar premio')
    admin.wait_for_function("tree.promoLedger.users.client1.prizes.p1.status === 'aprobado'")
    admin.fill('#promo-combo-name', 'Combo nuevo')
    admin.fill('#promo-combo-price', '250')
    admin.evaluate("window.failCampaignWrite=true")
    admin.click('#promo-combo-replace')
    expect(admin.locator('#promo-admin-status')).to_contain_text('Publica las reglas')
    assert admin.evaluate("!tree.promoSettings.combo.cycle && tree.promoSettings.combo.name==='Combo anterior'")
    admin.evaluate("window.failCampaignWrite=false")
    admin.click('#promo-combo-replace')
    admin.wait_for_function("tree.promoSettings.combo.cycle && tree.promoSettings.combo.name === 'Combo nuevo'")
    cycle = admin.evaluate('tree.promoSettings.combo.cycle')
    assert len(cycle) == 20
    assert admin.evaluate("tree.promoUses.client1 && tree.promoLedger.users.client1.coupon==='aprobado'")
    admin.evaluate("(c)=>db.ref(`promoCampaigns/${c}/requests/client1/request1`).set({type:'coupon'})", cycle)
    admin.wait_for_function("(c)=>tree.promoCampaigns[c]?.users?.client1?.coupon === 'pendiente'", arg=cycle)
    admin.get_by_role('button', name='Aprobar reserva').click()
    admin.wait_for_function("(c)=>tree.promoCampaigns[c]?.users?.client1?.coupon === 'aprobado' && tree.promoCampaigns[c]?.public?.coupons===1", arg=cycle)
    assert admin.evaluate("tree.promoUsers.client1.prizes.p1.status === 'aprobado'")
    assert not errors, errors

    client, errors = new_page(browser, initial, {'uid': 'client1', 'displayName': 'Ana'})
    client.goto('http://127.0.0.1:18759/index.html')
    expect(client.locator('#promo-rewards')).to_contain_text('Hamburguesa')
    assert client.locator('#promo-spin').count() == 0
    # Reset only the test fixture's previously consumed legacy reservation.
    client.evaluate("db.ref('promoUses/client1').set(null)")
    expect(client.locator('#promo-coupon')).to_have_text('Agregar mi combo reservado')
    client.click('#promo-coupon')
    assert client.evaluate("cart[0].name === 'Combo anterior'")
    client.evaluate("""() => db.ref('promoSettings/combo').set({
      name:'Combo nuevo',description:'Nuevo',price:250,image:'promo/combo-primeros-10.png',
      active:true,cycle:'-0000000000000000001'})""")
    expect(client.locator('#promo-offer-name')).to_have_text('Combo nuevo')
    client.evaluate("""() => {document.getElementById('client').value='Ana';
      document.getElementById('address').value='Calle'; saveOrder()}""")
    assert not client.evaluate('tree.orders && Object.keys(tree.orders).length')
    client.evaluate("cart=[]; updateCart(); toggleCart(false)")
    client.evaluate("""() => db.ref('promoCampaigns/-0000000000000000001/users/client1').set({
      coupon:'aprobado',revision:1})""")
    expect(client.locator('#promo-coupon')).to_have_text('Agregar mi combo reservado')
    client.click('#promo-coupon')
    client.evaluate("""() => {const old=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===300?0:old(fn,ms,...a);saveOrder()}""")
    client.wait_for_function("tree.orders && Object.keys(tree.orders).length === 1")
    assert client.evaluate("tree.promoCampaigns['-0000000000000000001'].uses.client1")
    assert client.evaluate("Object.values(tree.orders)[0].subtotal === 250")
    client.evaluate("db.ref('promoSettings/combo/active').set(false)")
    expect(client.locator('#promo-offer')).to_be_hidden()
    assert not errors, errors

    products = {'1': {'id': '1', 'name': 'Combo normal', 'category': 'ofertas',
                      'price': 500, 'stock': 2},
                '2': {'id': '2', 'name': 'Jugo', 'category': 'bebidas', 'price': 300}}
    guest, errors = new_page(browser, {'products': products, 'settings': {'storeStatus': 'open'}}, None)
    guest.goto('http://127.0.0.1:18759/index.html')
    guest.wait_for_function('products.length === 2')
    guest.evaluate("""rememberRepeatOrder([
      {productId:'1',name:'Combo normal',qty:3,price:500},
      {productId:'2',name:'Jugo',qty:2,price:200}])""")
    guest.click('#repeat-order')
    expect(guest.locator('#items')).to_contain_text('2 × Combo normal — RD$ 1000')
    expect(guest.locator('#items')).to_contain_text('2 × Jugo — RD$ 600')
    assert not errors, errors

    product_admin, errors = new_page(browser, {'products': products}, {'uid': 'admin'})
    product_admin.goto('http://127.0.0.1:18759/admin.html')
    product_admin.get_by_role('button', name='🍔 Productos').click()
    product_admin.get_by_role('button', name='Borrar Combo normal').click()
    product_admin.wait_for_function("!tree.products['1']")
    assert not errors, errors
    browser.close()
print('Legacy prizes, pause, replacement, reservations, checkout and normal combos: OK')
