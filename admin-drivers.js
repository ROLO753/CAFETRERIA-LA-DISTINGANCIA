let drivers = {}, driverOrders = {}, driversStarted = false;
const driverStatusLabels = {asignado: 'Asignado', encamino: 'En camino', entregado: 'Entregado'};
const statusRank = {recibido: 0, preparando: 1, listo: 2, encamino: 3, entregado: 4};
const syncingStatuses = new Set();

function startDrivers() {
  if (driversStarted) return;
  driversStarted = true;
  db.ref('drivers').on('value', snapshot => {
    drivers = snapshot.val() || {};
    renderDrivers();
    renderOrders();
  }, error => console.error('No se pudieron leer los repartidores:', error));
  db.ref('driverOrders').on('value', snapshot => {
    driverOrders = snapshot.val() || {};
    syncDriverStatus();
    renderDrivers();
  }, error => console.error('No se pudieron leer los pedidos de repartidores:', error));
}

function newDriverToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function driverLink(driver) {
  return new URL('repartidor.html?t=' + driver.token, location.href).href;
}

function isDeliveryOrder(order) {
  return !String(order.address || '').startsWith('🏪');
}

function driverControls(order) {
  if (!isDeliveryOrder(order) || ['cancelado', 'entregado'].includes(order.status)) return null;
  const box = node('div');
  box.className = 'drv-assign';
  const label = node('span', '🛵 Repartidor:');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Repartidor del pedido');
  const none = node('option', 'Sin asignar');
  none.value = '';
  select.appendChild(none);
  Object.entries(drivers).filter(([id, d]) => d.active !== false || id === order.driverId).forEach(([id, d]) => {
    const option = node('option', d.name);
    option.value = id;
    option.selected = order.driverId === id;
    select.appendChild(option);
  });
  select.onchange = async () => {
    select.disabled = true;
    try {
      await assignDriver(order, select.value);
    } catch (error) {
      console.error(error);
      alert('No se pudo asignar el repartidor. Revisa tu sesión y las reglas de Firebase.');
      select.value = order.driverId || '';
    }
    select.disabled = false;
  };
  box.append(label, select);
  if (order.driverId) {
    const state = driverOrders[drivers[order.driverId]?.token]?.[order.id]?.status;
    if (state) box.appendChild(node('small', `· ${driverStatusLabels[state] || state}`));
  }
  return box;
}

async function assignDriver(order, driverId) {
  const changes = {};
  const oldDriver = drivers[order.driverId];
  if (oldDriver && order.driverId !== driverId) changes[`driverOrders/${oldDriver.token}/${order.id}`] = null;
  const driver = drivers[driverId];
  if (!driver) {
    changes[`orders/${order.id}/driverId`] = null;
    changes[`orders/${order.id}/driverName`] = null;
    changes[`orderDrivers/${order.id}`] = null;
  } else {
    const entry = {
      id: order.id,
      clientName: order.clientName || 'Cliente',
      address: order.address || '',
      paymentMethod: order.paymentMethod || '',
      cashAmount: order.cashAmount || '',
      total: Number(order.total) || 0,
      createdAt: Number(order.createdAt) || Date.now(),
      items: (order.items || []).map(i => ({name: String(i.name || ''), qty: Number(i.qty) || 0})),
      status: 'asignado'
    };
    if (order.location) entry.location = {lat: Number(order.location.lat), lng: Number(order.location.lng), km: Number(order.location.km) || 0};
    changes[`driverOrders/${driver.token}/${order.id}`] = entry;
    changes[`orders/${order.id}/driverId`] = driverId;
    changes[`orders/${order.id}/driverName`] = driver.name;
    changes[`orderDrivers/${order.id}`] = driver.name;
  }
  await db.ref().update(changes);
}

function syncDriverStatus() {
  if (!Object.keys(drivers).length || !orders.length) return;
  const tokenToDriver = {};
  Object.entries(drivers).forEach(([id, d]) => { tokenToDriver[d.token] = id; });
  Object.entries(driverOrders).forEach(([token, byOrder]) => {
    Object.entries(byOrder || {}).forEach(([orderId, entry]) => {
      const order = orders.find(o => o.id === orderId);
      const next = entry && entry.status;
      if (!order || order.driverId !== tokenToDriver[token] || !(next in statusRank) || order.status === 'cancelado') return;
      if (statusRank[next] <= (statusRank[order.status || 'recibido'] ?? 0)) return;
      const key = `${orderId}:${next}`;
      if (syncingStatuses.has(key)) return;
      syncingStatuses.add(key);
      db.ref().update({
        [`orders/${orderId}/status`]: next,
        [`orderTracking/${orderId}`]: next
      }).catch(error => console.error('No se pudo sincronizar el estado:', error)).finally(() => syncingStatuses.delete(key));
    });
  });
}

function driverRangeStart() {
  const range = document.getElementById('driver-range').value;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 6);
  if (range === 'month') start.setDate(start.getDate() - 29);
  return range === 'all' ? 0 : start.getTime();
}

function renderDrivers() {
  const host = document.getElementById('driver-list');
  if (!host) return;
  host.replaceChildren();
  const entries = Object.entries(drivers).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  if (!entries.length) {
    host.textContent = 'Todavía no hay repartidores. Agrega uno con el formulario.';
    return;
  }
  const since = driverRangeStart();
  entries.forEach(([id, driver]) => {
    const mine = orders.filter(o => o.driverId === id);
    const done = mine.filter(o => o.status === 'entregado' && Number(o.createdAt) >= since);
    const pending = mine.filter(o => !['entregado', 'cancelado'].includes(o.status)).length;
    const earned = done.reduce((sum, o) => sum + (Number(o.delivery) || 0), 0);
    const card = node('article');
    card.className = 'drv-card' + (driver.active === false ? ' off' : '');
    card.appendChild(node('strong', `🛵 ${driver.name}${driver.active === false ? ' (inactivo)' : ''}`));
    const kpis = node('div');
    kpis.className = 'drv-kpis';
    kpis.append(node('span', `Entregas: ${done.length}`), node('span', `Ganancia: ${money(earned)}`), node('span', `Pendientes: ${pending}`));
    const actions = node('div');
    actions.className = 'drv-actions';
    const copy = node('button', '📋 Copiar enlace');
    copy.type = 'button';
    copy.className = 'btn';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(driverLink(driver));
        copy.textContent = '✅ Copiado';
      } catch (error) {
        prompt('Copia este enlace:', driverLink(driver));
      }
    };
    const share = document.createElement('a');
    share.className = 'btn green';
    share.textContent = '💬 Enviar por WhatsApp';
    share.target = '_blank';
    share.rel = 'noopener noreferrer';
    share.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(`Hola ${driver.name}, este es tu enlace privado de repartidor de La Distingancia (no lo compartas): ${driverLink(driver)}`);
    const toggle = node('button', driver.active === false ? 'Activar' : 'Desactivar');
    toggle.type = 'button';
    toggle.className = 'btn light';
    toggle.onclick = () => db.ref(`drivers/${id}/active`).set(driver.active === false).catch(error => {
      console.error(error);
      alert('No se pudo actualizar el repartidor.');
    });
    const remove = node('button', '🗑️ Borrar');
    remove.type = 'button';
    remove.className = 'btn red';
    remove.onclick = async () => {
      if (!confirm(`¿Borrar a ${driver.name}? Su enlace dejará de funcionar y sus pedidos pendientes quedarán sin asignar.`)) return;
      const changes = {[`drivers/${id}`]: null, [`driverOrders/${driver.token}`]: null};
      mine.filter(o => !['entregado', 'cancelado'].includes(o.status)).forEach(o => {
        changes[`orders/${o.id}/driverId`] = null;
        changes[`orders/${o.id}/driverName`] = null;
        changes[`orderDrivers/${o.id}`] = null;
      });
      try {
        await db.ref().update(changes);
      } catch (error) {
        console.error(error);
        alert('No se pudo borrar el repartidor.');
      }
    };
    actions.append(copy, share, toggle, remove);
    card.append(kpis, actions);
    host.appendChild(card);
  });
}

document.getElementById('driver-range').onchange = renderDrivers;
document.getElementById('driver-form').onsubmit = async event => {
  event.preventDefault();
  const input = document.getElementById('driver-name');
  const name = input.value.trim();
  if (!name) return;
  const id = db.ref('drivers').push().key;
  try {
    await db.ref('drivers/' + id).set({name, token: newDriverToken(), active: true, createdAt: firebase.database.ServerValue.TIMESTAMP});
    input.value = '';
  } catch (error) {
    console.error(error);
    alert('No se pudo agregar el repartidor. Publica las reglas nuevas de Firebase e inicia sesión como administrador.');
  }
};
