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

const promoSection = document.getElementById('promo-section');
const promoStatus = document.getElementById('promo-status');
const promoResult = document.getElementById('promo-result');
const promoRewards = document.getElementById('promo-rewards');
const promoSpin = document.getElementById('promo-spin');
const promoCoupon = document.getElementById('promo-coupon');

function renderPromo() {
  const combo = promoCombo || {name: 'Combo hamburguesa y refresco', description: 'Hamburguesa + refresco', price: 200, image: 'promo/combo-primeros-10.png'};
  const active = promoRemaining !== null && promoRemaining < 10;
  document.getElementById('promo-offer').hidden = !active;
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
    ? `Hola, ${promoUser.displayName || 'cliente'}. Tus tokens: ${promoAccount?.tokens || 0}. Código de cuenta: ${promoUser.uid}`
    : 'Entra con Google para participar y guardar tus tokens.';
  promoSpin.disabled = !promoUser || promoWaiting || (promoAccount?.tokens || 0) < 5;
  promoCoupon.disabled = !promoUser || promoWaiting || !!promoAccount?.coupon || !active;
  if (promoAccount?.coupon === 'pendiente') promoCoupon.textContent = 'Reserva pendiente de aprobación';
  else if (promoAccount?.coupon === 'aprobado' && !promoUse) {
    promoCoupon.disabled = false;
    promoCoupon.textContent = 'Agregar mi combo reservado';
  } else if (promoUse) promoCoupon.textContent = 'Combo ya utilizado';
  else if (promoAccount?.coupon === 'agotado') promoCoupon.textContent = 'Reservas agotadas';
  else promoCoupon.textContent = `Solicitar combo de RD$${combo.price}`;

  promoRewards.replaceChildren();
  Object.entries(promoAccount?.prizes || {}).forEach(([, prize]) => {
    const item = document.createElement('li');
    item.textContent = `${prize.name}: ${prize.status}.`;
    promoRewards.appendChild(item);
  });
  const result = promoAccount?.lastResult;
  if (result && result.request !== promoLastResult) {
    if (result.request === promoPendingRequest && promoPendingType === 'spin') {
      document.getElementById('promo-wheel').classList.remove('spinning');
      void document.getElementById('promo-wheel').offsetWidth;
      document.getElementById('promo-wheel').classList.add('spinning');
    }
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
  const request = db.ref(`promoRequests/${promoUser.uid}`).push();
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
promoSpin.onclick = () => submitPromoRequest('spin');
promoCoupon.onclick = () => {
  if (promoAccount?.coupon !== 'aprobado') {
    submitPromoRequest('coupon');
    return;
  }
  if (!promoUser || promoUse || cart.some(item => item.productId === 'promo-combo-200')) return;
  const combo = promoCombo || {name: 'Combo hamburguesa y refresco', price: 200};
  cart.push({name: combo.name, price: Number(combo.price), productId: 'promo-combo-200', garnish: 'Combo', qty: 1});
  updateCart();
  toggleCart(true);
};

promoAuth.onAuthStateChanged(user => {
  if (promoAccountRef) promoAccountRef.off('value', promoAccountCallback);
  if (promoUseRef) promoUseRef.off('value', promoUseCallback);
  promoUser = user;
  promoAccount = null;
  promoUse = null;
  promoLastResult = null;
  promoWaiting = false;
  promoPendingRequest = null;
  promoPendingType = null;
  promoResult.textContent = '';
  if (user) {
    promoAccountRef = db.ref(`promoUsers/${user.uid}`);
    promoAccountCallback = promoAccountRef.on('value', snapshot => {
      promoAccount = snapshot.val();
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudo consultar tu cuenta de promoción.';
    });
    promoUseRef = db.ref(`promoUses/${user.uid}`);
    promoUseCallback = promoUseRef.on('value', snapshot => {
      promoUse = snapshot.val();
      renderPromo();
    }, error => {
      console.error(error);
      promoResult.textContent = 'No se pudo consultar tu reserva.';
    });
  }
  renderPromo();
});
db.ref('promoPublic/coupons').on('value', snapshot => {
  promoRemaining = snapshot.val();
  renderPromo();
}, error => {
  console.error(error);
  promoResult.textContent = 'No se pudo consultar la disponibilidad del combo.';
});
db.ref('promoSettings/combo').on('value', snapshot => {
  promoCombo = snapshot.val();
  renderPromo();
}, error => {
  console.error(error);
  promoResult.textContent = 'No se pudo cargar el combo promocional.';
});
