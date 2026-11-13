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


combo = {'name': 'Combo anterior', 'description': 'Hamburguesa y jugo', 'price': 200,
         'image': 'promo/combo-primeros-10.png'}
legacy_user = {'coupon': 'aprobado', 'tokens': 8, 'revision': 1,
               'prizes': {'p1': {'name': 'Hamburguesa', 'status': 'pendiente'}}}
initial = {'products': {}, 'orders': {}, 'settings': {'storeStatus': 'open'},
           'promoSettings': {'combo': combo}, 'promoPublic': {'coupons': 10},
           'promoLedger': {'coupons': 10, 'users': {'client1': legacy_user}},
           'promoUsers': {'client1': legacy_user}}

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
    admin.click('text=Aprobar premio')
    admin.wait_for_function("tree.promoLedger.users.client1.prizes.p1.status === 'aprobado'")
    admin.fill('#promo-combo-name', 'Combo nuevo')
    admin.fill('#promo-combo-price', '250')
    admin.click('#promo-combo-replace')
    admin.wait_for_function("tree.promoSettings.combo.cycle && tree.promoSettings.combo.name === 'Combo nuevo'")
    assert admin.evaluate("tree.promoLedger.users.client1.coupon==='aprobado'")
    assert not errors, errors

    page, errors = new_page(browser, initial, None)
    page.goto('http://127.0.0.1:18759/index.html')
    expect(page.locator('#promo-coupon')).to_be_visible()
    assert page.locator('#tracking-section').is_hidden()
    page.click('#promo-coupon')
    page.evaluate('qty(0,1);qty(0,1)')
    assert page.evaluate("cart.length===1 && cart[0].qty===3")
    page.evaluate("""() => {
      document.getElementById('client').value='Ana';
      document.getElementById('address').value='Calle 1';
      document.getElementById('cash').value='1000';
      const old=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===300?0:old(fn,ms,...a);
      saveOrder()
    }""")
    page.wait_for_function("tree.orders && Object.keys(tree.orders).length===1")
    order_id = page.evaluate('Object.keys(tree.orders)[0]')
    assert page.evaluate("Object.values(tree.orders)[0].items[0].qty === 3")
    assert page.evaluate("Object.values(tree.orders)[0].subtotal === 600")
    assert page.evaluate("!tree.promoRequests && !tree.promoUses")
    assert page.locator('#tracking-section').is_hidden()
    page.evaluate("toggleCart(false)")
    page.click('#tracking-link')
    expect(page.locator('#tracking-list')).to_contain_text('Pedido registrado')
    page.locator('#tracking-list summary').click()
    expect(page.locator('#tracking-list')).to_contain_text('3 × Combo anterior')
    expect(page.locator('#tracking-list')).to_contain_text('Dirección: Calle 1')
    expect(page.locator('#tracking-list')).to_contain_text('Paga con: RD$ 1000')
    expect(page.locator('#tracking-list')).to_contain_text('Total: RD$ 650')
    page.evaluate("(id)=>db.ref(`orderTracking/${id}`).set('entregado')", order_id)
    expect(page.locator('#tracking-list')).to_contain_text('Entregado')
    page.click('#tracking-link')
    assert page.locator('#tracking-section').is_hidden()
    page.reload()
    assert page.locator('#tracking-section').is_hidden()
    page.click('#tracking-link')
    assert page.locator('#tracking-list article').count() == 1
    expect(page.locator('#tracking-list')).to_contain_text('Entregado')
    expect(page.locator('#tracking-list')).to_contain_text('último estado guardado')
    page.locator('#tracking-list summary').click()
    expect(page.locator('#tracking-list')).to_contain_text('3 × Combo anterior')
    page.evaluate("toggleTracking()")
    page.click('#repeat-order')
    assert page.evaluate("cart[0].qty === 3 && cart[0].productId === 'promo-combo-200'")
    page.evaluate("toggleCart(false)")
    page.evaluate("db.ref('promoSettings/combo/price').set(300)")
    page.wait_for_function("promoCombo.price===300")
    page.evaluate("saveOrder()")
    assert not page.evaluate('tree.orders && Object.keys(tree.orders).length')
    page.evaluate("""() => {
      db.ref('dummy').push();
      cart=[]; updateCart(); document.getElementById('promo-coupon').click();
      document.getElementById('client').value='Ana';
      document.getElementById('address').value='Calle 2';
      const old=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===300?0:old(fn,ms,...a);
      saveOrder()
    }""")
    page.wait_for_function("tree.orders && Object.keys(tree.orders).length===1")
    assert page.evaluate("Object.keys(JSON.parse(localStorage.getItem('cafeteria-order-history'))).length===2")
    page.evaluate("toggleCart(false)")
    page.click('#tracking-link')
    assert page.locator('#tracking-list article').count() == 2
    page.click('#tracking-link')
    page.evaluate("db.ref('promoSettings/combo/active').set(false)")
    expect(page.locator('#promo-section')).to_be_hidden()
    assert not errors, errors

    normal, errors = new_page(browser, {'products': {
        '1': {'id': '1', 'name': 'Combo normal', 'category': 'ofertas', 'price': 500, 'stock': 2},
        '2': {'id': '2', 'name': 'Jugo', 'category': 'bebidas', 'price': 300}},
        'settings': {'storeStatus': 'open'}}, None)
    normal.goto('http://127.0.0.1:18759/index.html')
    normal.wait_for_function('products.length===2')
    normal.evaluate("""rememberRepeatOrder([
      {productId:'1',name:'Combo normal',qty:3,price:500},
      {productId:'2',name:'Jugo',qty:2,price:200}])""")
    normal.click('#repeat-order')
    expect(normal.locator('#items')).to_contain_text('2 × Combo normal — RD$ 1000')
    expect(normal.locator('#items')).to_contain_text('2 × Jugo — RD$ 600')
    assert not errors, errors

    blocked, errors = new_page(browser, initial, None)
    blocked.goto('http://127.0.0.1:18759/index.html')
    blocked.wait_for_function('promoSettingsLoaded')
    blocked.evaluate("""() => {
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value) {
        if (key === 'cafeteria-order-history') throw Error('Storage unavailable');
        return original.call(this,key,value);
      };
      document.getElementById('promo-coupon').click();
      document.getElementById('client').value='Ana';
      document.getElementById('address').value='Calle 1';
      const old=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===300?0:old(fn,ms,...a);
      saveOrder()
    }""")
    blocked.wait_for_function("tree.orders && Object.keys(tree.orders).length===1")
    expect(blocked.locator('#save-status')).to_contain_text('No se pudo guardar el historial')
    assert not errors, errors

    old, errors = new_page(browser, initial, {'uid': 'client1', 'displayName': 'Ana'})
    old.add_init_script("localStorage.setItem('cafeteria-order-tracking', JSON.stringify(['-1234567890123456789']))")
    old.goto('http://127.0.0.1:18759/index.html')
    old.click('#tracking-link')
    expect(old.locator('#tracking-list')).to_contain_text('detalles de este pedido anterior no se guardaron')
    old.locator('.promo-prizes summary').click()
    expect(old.locator('#promo-rewards')).to_contain_text('Hamburguesa')
    assert not errors, errors
    browser.close()
print('Free combos, local order history and previous prizes: OK')
