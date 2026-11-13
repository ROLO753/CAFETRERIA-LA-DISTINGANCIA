const promoAuth = customerApp.auth();
let promoUser = null;
let promoCombo = null;
let promoCycle = null;
let promoSettingsLoaded = false;
let promoLegacyRef, promoLegacyCallback;
const DEFAULT_CLIENT_COMBO = {
  name: 'Combo hamburguesa y refresco',
  description: 'Hamburguesa + refresco',
  price: 200,
  image: 'promo/combo-primeros-10.png'
};

function renderPromo() {
  const combo = promoCombo || DEFAULT_CLIENT_COMBO;
  const active = promoSettingsLoaded && combo.active !== false;
  document.getElementById('promo-section').hidden = !active;
  document.getElementById('promo-offer-image').src = combo.image;
  document.getElementById('promo-offer-image').alt = combo.name;
  document.getElementById('promo-offer-name').textContent = combo.name;
  document.getElementById('promo-offer-description').textContent = combo.description;
  document.getElementById('promo-offer-price').textContent = `RD$${combo.price}`;
}

document.getElementById('promo-coupon').onclick = () => {
  if (!promoSettingsLoaded || promoCombo?.active === false) return;
  const combo = promoCombo || DEFAULT_CLIENT_COMBO;
  const existing = cart.find(item => item.productId === 'promo-combo-200');
  if (existing) {
    if (existing.promoCycle !== promoCycle || existing.name !== combo.name ||
        existing.price !== Number(combo.price)) {
      toast('El combo cambió. Quítalo del carrito y agrégalo de nuevo.');
      return;
    }
    existing.qty++;
  } else {
    cart.push({name: combo.name, price: Number(combo.price), productId: 'promo-combo-200', promoCycle, garnish: 'Combo', qty: 1});
  }
  updateCart();
  toggleCart(true);
};

const prizeStatus = document.getElementById('promo-prize-status');
document.getElementById('promo-login').onclick = async () => {
  try {
    await promoAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    console.error('No se pudo iniciar sesión:', error);
    prizeStatus.textContent = 'No se pudo entrar con Google para consultar los premios.';
  }
};
document.getElementById('promo-logout').onclick = () => promoAuth.signOut().catch(error => {
  console.error('No se pudo cerrar sesión:', error);
  prizeStatus.textContent = 'No se pudo cerrar la sesión.';
});
promoAuth.onAuthStateChanged(user => {
  if (promoLegacyRef) promoLegacyRef.off('value', promoLegacyCallback);
  promoUser = user;
  document.getElementById('promo-login').hidden = !!user;
  document.getElementById('promo-logout').hidden = !user;
  const rewards = document.getElementById('promo-rewards');
  rewards.replaceChildren();
  prizeStatus.textContent = user ? `Código de cuenta: ${user.uid}` : '';
  if (user) {
    promoLegacyRef = db.ref(`promoUsers/${user.uid}`);
    promoLegacyCallback = promoLegacyRef.on('value', snapshot => {
      rewards.replaceChildren();
      const prizes = Object.values(snapshot.val()?.prizes || {});
      if (!prizes.length) {
        prizeStatus.textContent = `Código de cuenta: ${user.uid}. No tienes premios anteriores.`;
      } else {
        prizeStatus.textContent = `Código de cuenta: ${user.uid}`;
        prizes.forEach(prize => {
          const item = document.createElement('li');
          item.textContent = `${prize.name}: ${prize.status}.`;
          rewards.appendChild(item);
        });
      }
    }, error => {
      console.error('No se pudieron consultar los premios:', error);
      prizeStatus.textContent = 'No se pudieron consultar tus premios anteriores.';
    });
  }
});
db.ref('promoSettings/combo').on('value', snapshot => {
  promoCombo = snapshot.val();
  promoCycle = promoCombo?.cycle || null;
  promoSettingsLoaded = true;
  renderPromo();
}, error => {
  console.error('No se pudo cargar el combo:', error);
  document.getElementById('promo-load-error').textContent = 'No se pudo cargar el combo promocional.';
});
