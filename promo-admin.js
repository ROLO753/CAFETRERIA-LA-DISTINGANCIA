let promoStarted = false;
let promoLedger = {};
let promoLegacyLedger = {};
let promoAdminCombo = null;
let promoAdminCycle = null;
let promoCampaignLedgerRef, promoCampaignLedgerCallback, promoRequestRef, promoRequestCallback;
const DEFAULT_PROMO_COMBO = {
  name: 'Combo hamburguesa y refresco',
  description: 'Hamburguesa + refresco',
  price: 200,
  image: 'promo/combo-primeros-10.png'
};
const promoBusy = new Set();

function randomBelow(limit) {
  const max = Math.floor(0x100000000 / limit) * limit;
  const data = new Uint32Array(1);
  do crypto.getRandomValues(data); while (data[0] >= max);
  return data[0] % limit;
}

function promoPath(cycle, legacy, modern) {
  return cycle ? `promoCampaigns/${cycle}/${modern}` : legacy;
}

async function projectPromoUser(uid, user, cycle) {
  if (!user) return;
  await db.ref(promoPath(cycle, `promoUsers/${uid}`, `users/${uid}`)).transaction(current =>
    current && (current.revision || 0) >= user.revision ? undefined : user
  );
}

async function projectPromoPublic(state, cycle) {
  const coupons = state.coupons || 0;
  await db.ref(promoPath(cycle, 'promoPublic/coupons', 'public/coupons')).transaction(current =>
    current !== null && current >= coupons ? undefined : coupons
  );
}

async function runPromoOperation(operation, cycle = promoAdminCycle) {
  const key = `${cycle || 'legacy'}:${operation.type}:${operation.id}`;
  if (promoBusy.has(key)) return;
  promoBusy.add(key);
  try {
    const random = {
      position: randomBelow(10),
      prize: randomBelow(PromoEngine.prizes.length),
      message: randomBelow(PromoEngine.messages.length)
    };
    const result = await db.ref(promoPath(cycle, 'promoLedger', 'ledger')).transaction(state =>
      PromoEngine.apply(state, operation, random)
    );
    const state = result.snapshot.val() || {};
    await projectPromoUser(operation.uid, state.users && state.users[operation.uid], cycle);
    await projectPromoPublic(state, cycle);
    if (operation.requestId && state.processed && state.processed[operation.id]) {
      await db.ref(promoPath(cycle, `promoRequests/${operation.uid}/${operation.requestId}`, `requests/${operation.uid}/${operation.requestId}`)).remove();
    }
  } catch (error) {
    console.error('No se pudo procesar la promoción:', error);
    document.getElementById('promo-admin-status').textContent =
      'No se pudo procesar la promoción. Revisa las reglas y la conexión.';
  } finally {
    promoBusy.delete(key);
  }
}

function startPromoAdmin() {
  if (promoStarted) return;
  promoStarted = true;
  db.ref('promoSettings/combo').on('value', snapshot => {
    const combo = snapshot.val() || DEFAULT_PROMO_COMBO;
    const cycle = combo.cycle || null;
    const changed = !promoAdminCombo || cycle !== promoAdminCycle || combo.active !== promoAdminCombo.active;
    promoAdminCombo = combo;
    promoAdminCycle = cycle;
    document.getElementById('promo-combo-name').value = combo.name;
    document.getElementById('promo-combo-description').value = combo.description;
    document.getElementById('promo-combo-price').value = combo.price;
    document.getElementById('promo-combo-image').value = combo.image;
    setPromoImagePreview(combo.image);
    document.getElementById('promo-combo-toggle').textContent =
      combo.active === false ? 'Activar combo' : 'Retirar combo';
    if (changed) listenPromoCampaign(cycle);
    if (!snapshot.exists()) {
      db.ref('promoSettings/combo').set(DEFAULT_PROMO_COMBO).catch(error => {
        console.error('No se pudo crear el combo promocional:', error);
        document.getElementById('promo-admin-status').textContent =
          'No se pudo preparar el combo. Comprueba las reglas de Database.';
      });
    }
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo cargar el combo promocional.';
  });
  db.ref('promoLedger').on('value', snapshot => {
    promoLegacyLedger = snapshot.val() || {};
    renderPromoAdmin();
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo leer la promoción.';
  });
}

function listenPromoCampaign(cycle) {
  if (promoCampaignLedgerRef) promoCampaignLedgerRef.off('value', promoCampaignLedgerCallback);
  if (promoRequestRef) promoRequestRef.off('value', promoRequestCallback);
  promoLedger = {};
  promoCampaignLedgerRef = db.ref(promoPath(cycle, 'promoLedger', 'ledger'));
  promoCampaignLedgerCallback = promoCampaignLedgerRef.on('value', snapshot => {
    promoLedger = snapshot.val() || {};
    renderPromoAdmin();
    Object.entries(promoLedger.users || {}).forEach(([uid, user]) => {
      projectPromoUser(uid, user, cycle).catch(error => {
        console.error('Error al actualizar reserva:', error);
        document.getElementById('promo-admin-status').textContent = 'No se pudo actualizar una reserva.';
      });
    });
    projectPromoPublic(promoLedger, cycle).catch(error => {
      console.error('Error al actualizar reservas:', error);
      document.getElementById('promo-admin-status').textContent = 'No se pudo actualizar la disponibilidad.';
    });
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo leer la promoción.';
  });
  promoRequestRef = db.ref(promoPath(cycle, 'promoRequests', 'requests'));
  promoRequestCallback = promoRequestRef.on('value', snapshot => {
    Object.entries(snapshot.val() || {}).forEach(([uid, requests]) => {
      Object.entries(requests || {}).forEach(([id, request]) => {
        if (request.type === 'coupon' && promoAdminCombo?.active !== false && cycle === promoAdminCycle) {
          runPromoOperation({type: request.type, uid, id: `request:${uid}:${id}`, requestId: id}, cycle);
        }
      });
    });
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudieron leer las solicitudes.';
  });
}

function setPromoImagePreview(url) {
  const image = document.getElementById('promo-combo-preview');
  image.hidden = true;
  if (!url) return;
  image.onload = () => { image.hidden = false; };
  image.onerror = () => { image.hidden = true; };
  image.src = url;
}

function validPromoImage(value) {
  return validImageUrl(value) ||
    (/^promo\/[A-Za-z0-9._/-]+$/.test(value) && !value.split('/').includes('..'));
}

document.getElementById('promo-combo-image').oninput = event => setPromoImagePreview(event.currentTarget.value.trim());
document.getElementById('promo-combo-form').onsubmit = async event => {
  event.preventDefault();
  const name = document.getElementById('promo-combo-name').value.trim();
  const description = document.getElementById('promo-combo-description').value.trim();
  const price = Number(document.getElementById('promo-combo-price').value);
  const image = document.getElementById('promo-combo-image').value.trim();
  const status = document.getElementById('promo-admin-status');
  if (!name || name.length > 100 || description.length > 300 ||
      !Number.isFinite(price) || price <= 0 || price > 10000 ||
      !validPromoImage(image)) {
    status.textContent = 'Revisa el nombre, precio (máximo RD$10,000) y la imagen (HTTPS o archivo de promo).';
    return;
  }
  if ((promoLedger.coupons || 0) > 0 && promoAdminCombo &&
      (name !== promoAdminCombo.name || description !== promoAdminCombo.description ||
       price !== promoAdminCombo.price || image !== promoAdminCombo.image) &&
      !confirm('Los cambios afectarán al combo de las reservas ya aprobadas. Para cancelar esas reservas y empezar desde cero, usa «Reemplazar por una promoción nueva». ¿Guardar los cambios?')) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await db.ref('promoSettings/combo').update({name, description, price, image});
    status.textContent = 'Combo promocional actualizado.';
  } catch (error) {
    console.error('No se pudo guardar el combo promocional:', error);
    status.textContent = 'No se pudo guardar. Comprueba las reglas de Database.';
  } finally {
    button.disabled = false;
  }
};

document.getElementById('promo-combo-toggle').onclick = async event => {
  if (!promoAdminCombo) return;
  const active = promoAdminCombo.active === false;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await db.ref('promoSettings/combo').update({active});
    document.getElementById('promo-admin-status').textContent = active ? 'Combo activado.' : 'Combo retirado.';
  } catch (error) {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo cambiar el estado del combo.';
  } finally {
    button.disabled = false;
  }
};

document.getElementById('promo-combo-replace').onclick = async event => {
  if (!promoAdminCombo || !confirm('¿Iniciar una promoción nueva? Se cancelarán las reservas anteriores y volverá a haber 10 disponibles. Los pedidos ya realizados se conservan.')) return;
  const form = document.getElementById('promo-combo-form');
  if (!form.reportValidity()) return;
  const name = document.getElementById('promo-combo-name').value.trim();
  const description = document.getElementById('promo-combo-description').value.trim();
  const price = Number(document.getElementById('promo-combo-price').value);
  const image = document.getElementById('promo-combo-image').value.trim();
  if (!name || name.length > 100 || description.length > 300 || !Number.isFinite(price) || price <= 0 || price > 10000 || !validPromoImage(image)) {
    document.getElementById('promo-admin-status').textContent = 'Revisa el nombre, precio e imagen del nuevo combo.';
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const cycle = db.ref('promoCampaigns').push().key;
    await db.ref(`promoCampaigns/${cycle}/public/coupons`).set(0);
    await db.ref('promoSettings/combo').set({name, description, price, image, cycle, active: true});
    document.getElementById('promo-admin-status').textContent = 'Nueva promoción creada con 10 reservas disponibles.';
  } catch (error) {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo crear la promoción. Publica las reglas actualizadas de Database y comprueba la conexión.';
  } finally {
    button.disabled = false;
  }
};

function renderPromoAdmin() {
  const host = document.getElementById('promo-admin-list');
  if (!host) return;
  host.replaceChildren();
  const users = Object.entries(promoLedger.users || {});
  const title = document.createElement('p');
  title.textContent = `Combos reservados: ${promoLedger.coupons || 0} de 10`;
  host.appendChild(title);
  let pending = 0;
  users.forEach(([uid, user]) => {
    if (user.coupon === 'pendiente') {
      pending++;
      const row = document.createElement('div');
      row.className = 'promo-admin-row';
      row.textContent = `Solicitud de combo · cuenta ${uid}`;
      const button = document.createElement('button');
      button.className = 'btn green';
      button.type = 'button';
      button.textContent = 'Aprobar reserva';
      button.disabled = promoAdminCombo?.active === false;
      button.onclick = () => {
        if (promoAdminCombo?.active !== false) runPromoOperation({type: 'approveCoupon', uid, id: `couponApproval:${uid}`});
      };
      row.appendChild(button);
      host.appendChild(row);
    }
  });
  Object.entries(promoLegacyLedger.users || {}).forEach(([uid, user]) => {
    Object.entries(user.prizes || {}).forEach(([prizeId, prize]) => {
      if (prize.status === 'canjeado') return;
      pending++;
      const row = document.createElement('div');
      row.className = 'promo-admin-row';
      row.textContent = `${prize.name} · ${prize.status} · cuenta ${uid}`;
      const button = document.createElement('button');
      button.className = 'btn green';
      button.type = 'button';
      button.textContent = prize.status === 'pendiente' ? 'Aprobar premio' : 'Marcar canjeado';
      button.onclick = () => {
        const type = prize.status === 'pendiente' ? 'approvePrize' : 'redeemPrize';
        runPromoOperation({type, uid, prizeId, id: `${type}:${uid}:${prizeId}`}, null);
      };
      row.appendChild(button);
      host.appendChild(row);
    });
  });
  if (!pending) host.appendChild(document.createTextNode('No hay solicitudes ni premios pendientes.'));
}
