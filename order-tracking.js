const TRACKING_KEY = 'cafeteria-order-tracking';
const trackingLabels = {
  recibido: 'Pedido registrado',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};
const trackingIcons = {
  recibido: '🧾',
  preparando: '👨‍🍳',
  listo: '✨',
  entregado: '🎉',
  cancelado: '❌'
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
  let previousState;
  const listener = ref.on('value', snapshot => {
    const state = snapshot.val();
    label.textContent = trackingLabels[state] || 'Pedido no disponible';
    icon.textContent = trackingIcons[state] || '📦';
    card.classList.toggle('is-cancelled', state === 'cancelado');
    note.textContent = state === 'cancelado' ? 'Contacta a la cafetería si tienes alguna pregunta.' : state && !trackingLabels[state] ? 'Estado desconocido. Contacta a la cafetería.' : '';
    steps.replaceChildren();
    const stages = ['recibido', 'preparando', 'listo', 'entregado'];
    const stage = stages.indexOf(state);
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
    if (previousState !== undefined && state !== previousState && trackingLabels[state]) {
      toast(`📦 Tu pedido: ${trackingLabels[state]}`);
    }
    previousState = state;
  }, error => {
    console.error('No se pudo consultar el pedido:', error);
    label.textContent = 'No se pudo actualizar el estado';
    icon.textContent = '⚠️';
    card.classList.remove('is-cancelled');
    steps.replaceChildren();
    note.textContent = 'Revisa tu conexión y vuelve a abrir la app.';
  });
  trackedOrders.set(id, {ref, listener, card});
  card.append(heading, steps, note);
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
