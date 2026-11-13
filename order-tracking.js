const TRACKING_KEY = 'cafeteria-order-tracking';
const ORDER_HISTORY_KEY = 'cafeteria-order-history';
const trackingLabels = {
  recibido: 'Pedido registrado',
  preparando: 'Preparando',
  listo: 'Listo',
  encamino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};
const trackingIcons = {
  recibido: '🧾',
  preparando: '👨‍🍳',
  listo: '✨',
  encamino: '🛵',
  entregado: '🎉',
  cancelado: '❌'
};
const trackedOrders = new Map();
let trackingIds = [];
let orderHistory = {};

try {
  const saved = JSON.parse(localStorage.getItem(TRACKING_KEY) || '[]');
  if (Array.isArray(saved)) trackingIds = [...new Set(saved.filter(id => typeof id === 'string' && /^[-A-Za-z0-9_]{20}$/.test(id)))];
} catch (error) {
  console.error('No se pudo leer el seguimiento de pedidos:', error);
}
try {
  const saved = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) orderHistory = saved;
} catch (error) {
  console.error('No se pudo leer el historial de pedidos:', error);
}

function toggleTracking() {
  const section = document.getElementById('tracking-section');
  section.hidden = !section.hidden;
  document.getElementById('tracking-link').setAttribute('aria-expanded', String(!section.hidden));
  if (!section.hidden) section.scrollIntoView({behavior: 'smooth'});
}

function appendOrderDetails(card, id) {
  const order = orderHistory[id];
  if (!order) {
    const note = document.createElement('p');
    note.textContent = 'Los detalles de este pedido anterior no se guardaron en este dispositivo.';
    card.appendChild(note);
    return;
  }
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Ver información del pedido';
  details.appendChild(summary);
  const lines = [
    `Fecha: ${new Date(order.createdAt).toLocaleString('es-DO')}`,
    `Cliente: ${order.clientName}`,
    `Dirección: ${order.address}`,
    `Pago: ${order.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}`,
    ...(order.cashAmount ? [`Paga con: RD$ ${order.cashAmount}`] : []),
    ...(order.items || []).map(item => `${item.qty} × ${item.name} — RD$ ${item.qty * item.price}`),
    `Subtotal: RD$ ${order.subtotal}`,
    `Envío: RD$ ${order.delivery}`,
    `Total: RD$ ${order.total}`
  ];
  if (order.location) lines.push(`Ubicación: ${order.location.lat}, ${order.location.lng} (${order.location.km} km)`);
  lines.forEach(text => {
    const line = document.createElement('div');
    line.textContent = text;
    details.appendChild(line);
  });
  card.appendChild(details);
}

function showTracking(id) {
  if (trackedOrders.has(id)) return;
  const card = document.createElement('article');
  card.className = 'tracking-card';
  const heading = document.createElement('div');
  heading.className = 'tracking-heading';
  const icon = document.createElement('span');
  icon.className = 'tracking-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📦';
  const headingText = document.createElement('div');
  const label = document.createElement('strong');
  label.textContent = 'Consultando pedido…';
  const number = document.createElement('small');
  number.textContent = `Pedido: ${id}`;
  headingText.append(label, number);
  heading.append(icon, headingText);
  const note = document.createElement('div');
  note.className = 'tracking-note';
  const steps = document.createElement('div');
  steps.className = 'tracking-steps';
  const ref = db.ref(`orderTracking/${id}`);
  let currentState, driverName = '';
  const driverLine = document.createElement('div');
  driverLine.className = 'tracking-driver';
  driverLine.hidden = true;
  function updateDriverLine() {
    const show = driverName && currentState === 'encamino';
    driverLine.hidden = !show;
    driverLine.textContent = show ? `🛵 Tu repartidor: ${driverName}` : '';
  }
  function renderSteps() {
    steps.replaceChildren();
    const stages = currentState === 'encamino' ? ['recibido', 'preparando', 'listo', 'encamino', 'entregado'] : ['recibido', 'preparando', 'listo', 'entregado'];
    const stage = stages.indexOf(currentState);
    if (stage >= 0) stages.forEach((value, index) => {
      const step = document.createElement('span');
      step.className = 'tracking-step' + (index < stage ? ' done' : index === stage ? ' current' : '');
      const stepIcon = document.createElement('span');
      stepIcon.className = 'tracking-step-icon';
      stepIcon.setAttribute('aria-hidden', 'true');
      stepIcon.textContent = index < stage ? '✓' : trackingIcons[value];
      const stepLabel = document.createElement('span');
      stepLabel.textContent = trackingLabels[value];
      step.append(stepIcon, stepLabel);
      if (index === stage) step.setAttribute('aria-current', 'step');
      steps.appendChild(step);
    });
  }
  db.ref(`orderDrivers/${id}`).on('value', snapshot => {
    const name = snapshot.val();
    driverName = typeof name === 'string' ? name : '';
    updateDriverLine();
    renderSteps();
  }, () => {});
  const listener = ref.on('value', snapshot => {
    const liveState = snapshot.val();
    const state = trackingLabels[liveState] ? liveState : orderHistory[id]?.status;
    label.textContent = trackingLabels[state] || 'Pedido no disponible';
    icon.textContent = trackingIcons[state] || '📦';
    card.classList.toggle('is-cancelled', state === 'cancelado');
    note.textContent = !trackingLabels[liveState] && state ? 'Mostrando el último estado guardado en este dispositivo.' :
      state === 'cancelado' ? 'Contacta a la cafetería si tienes alguna pregunta.' : '';
    if (trackingLabels[liveState] && orderHistory[id] && orderHistory[id].status !== liveState) {
      orderHistory[id].status = liveState;
      try {
        localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(orderHistory));
      } catch (error) {
        console.error('No se pudo guardar el estado del pedido:', error);
        note.textContent = 'No se pudo guardar el estado actualizado en este dispositivo.';
      }
    }
    currentState = state;
    updateDriverLine();
    renderSteps();
  }, error => {
    console.error('No se pudo consultar el pedido:', error);
    currentState = orderHistory[id]?.status;
    label.textContent = trackingLabels[currentState] || 'No se pudo actualizar el estado';
    icon.textContent = trackingIcons[currentState] || '⚠️';
    renderSteps();
    note.textContent = 'Sin conexión. Se muestra el último estado guardado, si está disponible.';
  });
  trackedOrders.set(id, {ref, listener, card});
  card.append(heading, driverLine, steps, note);
  appendOrderDetails(card, id);
  document.getElementById('tracking-list').prepend(card);
  document.getElementById('tracking-empty').hidden = true;
}

function rememberOrder(id, order) {
  const next = [...trackingIds.filter(value => value !== id), id];
  try {
    const nextHistory = {...orderHistory, [id]: {...order, createdAt: Date.now()}};
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(nextHistory));
    orderHistory = nextHistory;
    localStorage.setItem(TRACKING_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('No se pudo guardar el seguimiento:', error);
    return false;
  }
  trackingIds = next;
  showTracking(id);
  return true;
}

trackingIds.forEach(showTracking);
