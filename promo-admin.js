let promoStarted = false;
let promoLedger = {};
let promoOrders = {};
const promoBusy = new Set();

function randomBelow(limit) {
  const max = Math.floor(0x100000000 / limit) * limit;
  const data = new Uint32Array(1);
  do crypto.getRandomValues(data); while (data[0] >= max);
  return data[0] % limit;
}

async function projectPromoUser(uid, user) {
  if (!user) return;
  await db.ref(`promoUsers/${uid}`).transaction(current =>
    current && (current.revision || 0) >= user.revision ? undefined : user
  );
}

async function projectPromoPublic(state) {
  const coupons = state.coupons || 0;
  await db.ref('promoPublic/coupons').transaction(current =>
    current !== null && current >= coupons ? undefined : coupons
  );
}

async function runPromoOperation(operation) {
  const key = `${operation.type}:${operation.id}`;
  if (promoBusy.has(key)) return;
  promoBusy.add(key);
  try {
    const random = {
      position: randomBelow(10),
      prize: randomBelow(PromoEngine.prizes.length),
      message: randomBelow(PromoEngine.messages.length)
    };
    const result = await db.ref('promoLedger').transaction(state =>
      PromoEngine.apply(state, operation, random)
    );
    const state = result.snapshot.val() || {};
    await projectPromoUser(operation.uid, state.users && state.users[operation.uid]);
    await projectPromoPublic(state);
    if (operation.requestId && state.processed && state.processed[operation.id]) {
      await db.ref(`promoRequests/${operation.uid}/${operation.requestId}`).remove();
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
  db.ref('promoLedger').on('value', snapshot => {
    promoLedger = snapshot.val() || {};
    renderPromoAdmin();
    Object.entries(promoLedger.users || {}).forEach(([uid, user]) => {
      projectPromoUser(uid, user).catch(error => console.error('Error al actualizar saldo:', error));
    });
    projectPromoPublic(promoLedger).catch(error => console.error('Error al actualizar reservas:', error));
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudo leer la promoción.';
  });
  db.ref('promoRequests').on('value', snapshot => {
    Object.entries(snapshot.val() || {}).forEach(([uid, requests]) => {
      Object.entries(requests || {}).forEach(([id, request]) => {
        if (request.type === 'spin' || request.type === 'coupon') {
          runPromoOperation({type: request.type, uid, id: `request:${uid}:${id}`, requestId: id});
        }
      });
    });
  }, error => {
    console.error(error);
    document.getElementById('promo-admin-status').textContent = 'No se pudieron leer las solicitudes.';
  });
}

function syncPromoOrders(list) {
  promoOrders = Object.fromEntries(list.map(order => [order.id, order]));
  list.forEach(order => {
    if (order.status === 'entregado' && order.customerUid &&
        Number(order.subtotal) >= 200) {
      runPromoOperation({type: 'credit', uid: order.customerUid, id: order.id});
    }
  });
  renderPromoAdmin();
}

function renderPromoAdmin() {
  const host = document.getElementById('promo-admin-list');
  if (!host) return;
  host.replaceChildren();
  const users = Object.entries(promoLedger.users || {});
  const title = document.createElement('p');
  title.textContent = `Combos reservados: ${promoLedger.coupons || 0} de 10 · Giros procesados: ${promoLedger.spins || 0}`;
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
      button.onclick = () => runPromoOperation({type: 'approveCoupon', uid, id: `couponApproval:${uid}`});
      row.appendChild(button);
      host.appendChild(row);
    }
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
        runPromoOperation({type, uid, prizeId, id: `${type}:${uid}:${prizeId}`});
      };
      row.appendChild(button);
      host.appendChild(row);
    });
  });
  if (!pending) host.appendChild(document.createTextNode('No hay solicitudes ni premios pendientes.'));
}
