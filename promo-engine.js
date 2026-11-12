(function (root) {
  const prizes = [
    '2 refrescos',
    'Sándwich de jamón y queso',
    'Picadera de queso frito',
    'Picadera de chuleta',
    'Hamburguesa',
    'Cerveza mediana (solo mayores de edad)',
    'Combo de 4 snacks',
    '2 jugos'
  ];
  const messages = [
    '¡La próxima puede ser tuya!',
    '¡Sigue disfrutando cada antojo!',
    '¡Hoy no, pero sigue intentando!',
    '¡Cada pedido te acerca!',
    '¡Gracias por ser parte de la familia!'
  ];

  function apply(state, operation, random) {
    state = state || {};
    state.users = state.users || {};
    state.processed = state.processed || {};
    state.credited = state.credited || {};
    if (operation.type === 'credit') {
      if (state.credited[operation.id]) return;
      state.credited[operation.id] = true;
      const user = state.users[operation.uid] || {tokens: 0, revision: 0};
      user.tokens = (user.tokens || 0) + 2;
      user.revision = (user.revision || 0) + 1;
      state.users[operation.uid] = user;
      return state;
    }

    if (state.processed[operation.id]) return;
    const user = state.users[operation.uid] || {tokens: 0, revision: 0};
    user.revision = (user.revision || 0) + 1;
    if (operation.type === 'spin') {
      if ((user.tokens || 0) < 5) {
        user.lastResult = {request: operation.id, text: 'Necesitas 5 tokens para girar.'};
      } else {
        user.tokens -= 5;
        const index = (state.spins || 0) % 10;
        if (index === 0) state.winningPosition = random.position;
        const win = index === state.winningPosition;
        state.spins = (state.spins || 0) + 1;
        if (win) {
          const prize = prizes[random.prize];
          user.prizes = user.prizes || {};
          user.prizes[operation.id] = {name: prize, status: 'pendiente'};
          user.lastResult = {request: operation.id, text: `¡Ganaste ${prize}! Pendiente de aprobación.`};
        } else {
          user.lastResult = {request: operation.id, text: messages[random.message]};
        }
      }
    } else if (operation.type === 'coupon') {
      if (user.coupon === 'aprobado') {
        user.lastResult = {request: operation.id, text: 'Ya tienes un combo reservado.'};
      } else if ((state.coupons || 0) >= 10) {
        user.lastResult = {request: operation.id, text: 'Las 10 reservas del combo se agotaron.'};
      } else {
        user.coupon = 'pendiente';
        user.lastResult = {request: operation.id, text: 'Solicitud enviada. Espera la aprobación de la cafetería.'};
      }
    } else if (operation.type === 'approveCoupon') {
      if (user.coupon !== 'pendiente') return;
      if ((state.coupons || 0) >= 10) {
        user.coupon = 'agotado';
        user.lastResult = {request: operation.id, text: 'Las 10 reservas del combo se agotaron.'};
      } else {
        state.coupons = (state.coupons || 0) + 1;
        user.coupon = 'aprobado';
        user.lastResult = {request: operation.id, text: 'Tu combo está reservado. Agrégalo al carrito.'};
      }
    } else if (operation.type === 'approvePrize' || operation.type === 'redeemPrize') {
      const prize = user.prizes && user.prizes[operation.prizeId];
      if (!prize || (operation.type === 'approvePrize' && prize.status !== 'pendiente') ||
          (operation.type === 'redeemPrize' && prize.status !== 'aprobado')) return;
      prize.status = operation.type === 'approvePrize' ? 'aprobado' : 'canjeado';
    } else {
      return;
    }
    state.processed[operation.id] = true;
    state.users[operation.uid] = user;
    return state;
  }

  root.PromoEngine = {prizes, messages, apply};
  if (typeof module !== 'undefined') module.exports = root.PromoEngine;
})(typeof globalThis === 'undefined' ? window : globalThis);
