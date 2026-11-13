const promoAuth = customerApp.auth();
let promoUser = null;
let promoAccount = null;
let promoUse = null;
let promoRemaining = null;
let promoAccountRef, promoUseRef;
let promoAccountCallback, promoUseCallback;
let promoWaiting = false;
let promoLastResult = null;
let promoPendingRequest = null;
let promoPendingType = null;
let promoCombo = null;
let promoCycle = null;
let promoSettingsLoaded = false;
let promoLegacyAccount = null;
let promoLegacyRef, promoLegacyCallback, promoCountRef, promoCountCallback;

const promoSection = document.getElementById('promo-section');
const promoStatus = document.getElementById('promo-status');
const promoResult = document.getElementById('promo-result');
const promoRewards = document.getElementById('promo-rewards');
const promoCoupon = document.getElementById('promo-coupon');

function renderPromo() {
  const combo = promoCombo || {name: 'Combo hamburguesa y refresco', description: 'Hamburguesa + refresco', price: 200, image: 'promo/combo-primeros-10.png'};
  const active = promoSettingsLoaded && combo.active !== false;
  const available = active && promoRemaining !== null && promoRemaining < 10;
  document.getElementById('promo-offer').hidden = !active;
  document.getElementById('promo-heading').textContent = active ? 'Combo de los primeros 10 clientes' : 'Premios anteriores';
  document.getElementById('promo-rules').hidden = !active;
  promoCoupon.hidden = !active;
  document.getElementById('promo-offer-image').src = combo.image;
  document.getElementById('promo-offer-image').alt = combo.name;
  document.getElementById('promo-offer-name').textContent = combo.name;
  document.getElementById('promo-offer-description').textContent = combo.description;
  document.getElementById('promo-offer-price').textContent = `RD$${combo.price}`;
  document.getElementById('promo-count').textContent =
    promoRemaining === null ? '' : `${Math.max(0, 10 - promoRemaining)} reservas disponibles`;
  document.getElementById('promo-login').hidden = !!promoUser;
  document.getElementById('promo-logout').hidden = !promoUser;
  document.getElementById('promo-account').hidden = !promoUser;
  promoStatus.textContent = promoUser
    ? `Hola, ${promoUser.displayName || 'cliente'}. Código de cuenta: ${promoUser.uid}`
    : active ? 'Entra con Google para solicitar el combo.' : 'Entra con Google para consultar tus premios anteriores.';
  promoCoupon.disabled = !promoUser || promoWaiting || !!promoAccount?.coupon || !available;
  if (promoAccount?.coupon === 'pendiente') promoCoupon.textContent = 'Reserva pendiente de aprobación';
  else if (promoAccount?.coupon === 'aprobado' && !promoUse) {
    promoCoupon.disabled = !active;
    promoCoupon.textContent = 'Agregar mi combo reservado';
  } else if (promoUse) promoCoupon.textContent = 'Combo ya utilizado';
  else if (promoAccount?.coupon === 'agotado') promoCoupon.textContent = 'Reservas agotadas';
  else promoCoupon.textContent = `Solicitar combo de RD$${combo.price}`;

  promoRewards.replaceChildren();
  Object.entries(promoLegacyAccount?.prizes || {}).forEach(([, prize]) => {
    const item = document.createElement('li');
    item.textContent = `${prize.name}: ${prize.status}.`;
    promoRewards.appendChild(item);
  });
  const result = promoAccount?.lastResult;
  if (result && result.request !== promoLastResult) {
    promoResult.textContent = result.text;
    promoLastResult = result.request;
    if (result.request === promoPendingRequest) {
      promoWaiting = false;
      promoPendingRequest = null;
      promoPendingType = null;
      renderPromo();
    }
  }
}

async function submitPromoRequest(type) {
  if (!promoUser || promoWaiting) return;
  promoWaiting = true;
  const request = db.ref(promoCycle ? `promoCampaigns/${promoCycle}/requests/${promoUser.uid}` : `promoRequests/${promoUser.uid}`).push();
  promoPendingRequest = `request:${promoUser.uid}:${request.key}`;
  promoPendingType = type;
  renderPromo();
  promoResult.textContent = 'Solicitud enviada. Espera con esta página abierta mientras la cafetería la procesa.';
  try {
    await request.set({type});
  } catch (error) {
    console.error('No se pudo enviar la solicitud:', error);
    promoWaiting = false;
    promoPendingRequest = null;
    promoPendingType = null;
    promoResult.textContent = 'No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo.';
    renderPromo();
  }
}

document.getElementById('promo-login').onclick = async () => {
  try {
    await promoAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    console.error('No se pudo iniciar sesión:', error);
    promoResult.textContent = 'No se pudo entrar con Google. Comprueba la conexión o consulta a la cafetería.';
  }
};
document.getElementById('promo-logout').onclick = () => promoAuth.signOut().catch(error => {
  console.error(error);
  promoResult.textContent = 'No se pudo cerrar la sesión.';
});
promoCoupon.onclick = () => {
  if (!promoSettingsLoaded || promoCombo?.active === false) return;
  if (promoAccount?.coupon !== 'aprobado') {
    submitPromoRequest('coupon');
    return;
  }
  if (!promoUser || promoUse || cart.some(item => item.productId === 'promo-combo-200')) return;
  const combo = promoCombo || {name: 'Combo hamburguesa y refresco', price: 200};
  cart.push({name: combo.name, price: Number(combo.price), productId: 'promo-combo-200', promoCycle, garnish: 'Combo', qty: 1});
  updateCart();
  toggleCart(true);
};

function listenPromoAccount() {
  if (promoAccountRef) promoAccountRef.off('value', promoAccountCallback);
  if (promoUseRef) promoUseRef.off('value', promoUseCallback);
  promoAccount = null;
  promoUse = null;
  promoLastResult = null;
  promoWaiting = false;
  promoPendingRequest = null;
  promoPendingType = null;
  promoResult.textContent = '';
  if (promoUser && promoSettingsLoaded) {
    const uid = promoUser.uid;
    promoAccountRef = db.ref(promoCycle ? `promoCampaigns/${promoCycle}/users/${uid}` : `promoUsers/${uid}`);
    promoAccountCallback = promoAccountRef.on('value', snapshot => {
      promoAccount = snapshot.val();
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudo consultar tu cuenta de promoción.';
    });
    promoUseRef = db.ref(promoCycle ? `promoCampaigns/${promoCycle}/uses/${uid}` : `promoUses/${uid}`);
    promoUseCallback = promoUseRef.on('value', snapshot => {
      promoUse = snapshot.val();
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudo consultar tu reserva.';
    });
  }
  renderPromo();
}

promoAuth.onAuthStateChanged(user => {
  if (promoLegacyRef) promoLegacyRef.off('value', promoLegacyCallback);
  promoUser = user;
  promoLegacyAccount = null;
  if (user) {
    promoLegacyRef = db.ref(`promoUsers/${user.uid}`);
    promoLegacyCallback = promoLegacyRef.on('value', snapshot => {
      promoLegacyAccount = snapshot.val();
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudieron consultar tus premios anteriores.';
    });
  }
  listenPromoAccount();
});
db.ref('promoSettings/combo').on('value', snapshot => {
  const oldCycle = promoCycle;
  promoCombo = snapshot.val();
  promoCycle = promoCombo?.cycle || null;
  const changed = !promoSettingsLoaded || oldCycle !== promoCycle;
  promoSettingsLoaded = true;
  if (changed) {
    if (promoCountRef) promoCountRef.off('value', promoCountCallback);
    promoRemaining = null;
    promoCountRef = db.ref(promoCycle ? `promoCampaigns/${promoCycle}/public/coupons` : 'promoPublic/coupons');
    promoCountCallback = promoCountRef.on('value', value => {
      promoRemaining = value.val() || 0;
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudo consultar la disponibilidad del combo.';
    });
    listenPromoAccount();
  }
  renderPromo();
}, error => {
  console.error(error);
  promoResult.textContent = 'No se pudo cargar el combo promocional.';
});
