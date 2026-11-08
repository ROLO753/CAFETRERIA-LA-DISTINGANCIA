const TRACKING_KEY = 'cafeteria-order-tracking';
const trackingLabels = {
  recibido: 'Pedido registrado',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};
const trackedOrders = new Map();
let trackingIds = [];

try {
  const saved = JSON.parse(localStorage.getItem(TRACKING_KEY) || '[]');
  if (Array.isArray(saved)) trackingIds = [...new Set(saved.filter(id => typeof id === 'string' && /^[-A-Za-z0-9_]{20}$/.test(id)))];
} catch (error) {
  console.error('No se pudo leer el seguimiento de pedidos:', error);
}

function showTracking(id) {
  if (trackedOrders.has(id)) return;
  const section = document.getElementById('tracking-section');
  const card = document.createElement('article');
  card.className = 'tracking-card';
  const label = document.createElement('strong');
  label.textContent = 'Consultando pedido…';
  const number = document.createElement('small');
  number.textContent = `Pedido: ${id}`;
  const note = document.createElement('div');
  note.className = 'tracking-note';
  const steps = document.createElement('div');
  steps.className = 'tracking-steps';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Quitar de esta lista';
  remove.setAttribute('aria-label', `Quitar pedido ${id} de esta lista`);
  const ref = db.ref(`orderTracking/${id}`);
  let previousState;
  const listener = ref.on('value', snapshot => {
    const state = snapshot.val();
    label.textContent = trackingLabels[state] ? `📦 ${trackingLabels[state]}` : 'Pedido no disponible';
    note.textContent = state && !trackingLabels[state] ? 'Estado desconocido. Contacta a la cafetería.' : '';
    steps.replaceChildren();
    const stages = ['recibido', 'preparando', 'listo', 'entregado'];
    const stage = stages.indexOf(state);
    if (stage >= 0) stages.forEach((value, index) => {
      const step = document.createElement('span');
      step.className = 'tracking-step' + (index <= stage ? ' done' : '');
      step.textContent = trackingLabels[value];
      steps.appendChild(step);
    });
    if (previousState !== undefined && state !== previousState && trackingLabels[state]) {
      toast(`📦 Tu pedido: ${trackingLabels[state]}`);
    }
    previousState = state;
  }, error => {
    console.error('No se pudo consultar el pedido:', error);
    label.textContent = 'No se pudo actualizar el estado';
    note.textContent = 'Revisa tu conexión y vuelve a abrir la app.';
  });
  trackedOrders.set(id, {ref, listener, card});
  remove.onclick = () => {
    const remaining = trackingIds.filter(value => value !== id);
    try {
      localStorage.setItem(TRACKING_KEY, JSON.stringify(remaining));
    } catch (error) {
      console.error('No se pudo quitar el seguimiento:', error);
      note.textContent = 'No se pudo quitar el pedido de esta lista.';
      return;
    }
    trackingIds = remaining;
    ref.off('value', listener);
    trackedOrders.delete(id);
    card.remove();
    section.hidden = !trackedOrders.size;
    document.getElementById('tracking-link').hidden = !trackedOrders.size;
  };
  card.append(label, number, steps, note, remove);
  document.getElementById('tracking-list').prepend(card);
  section.hidden = false;
  document.getElementById('tracking-link').hidden = false;
}

function rememberOrder(id) {
  const next = [...trackingIds.filter(value => value !== id), id];
  try {
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
