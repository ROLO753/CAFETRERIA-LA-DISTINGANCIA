const REPEAT_ORDER_KEY = 'cafeteria-last-order-items';
const repeatButton = document.getElementById('repeat-order');

function readLastOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(REPEAT_ORDER_KEY) || 'null');
    return Array.isArray(saved) ? saved : null;
  } catch (error) {
    console.error('No se pudo leer el último pedido:', error);
    return null;
  }
}

function renderRepeatButton() {
  repeatButton.hidden = !readLastOrder()?.length;
}

function rememberRepeatOrder(items) {
  try {
    const saved = items.map(item => ({
      productId: String(item.productId),
      name: String(item.name),
      price: Number(item.price),
      qty: Number(item.qty),
      garnish: String(item.garnish || ''),
    }));
    localStorage.setItem(REPEAT_ORDER_KEY, JSON.stringify(saved));
    renderRepeatButton();
    return true;
  } catch (error) {
    console.error('No se pudo guardar el último pedido:', error);
    return false;
  }
}

function repeatLastOrder() {
  const saved = readLastOrder();
  if (!saved?.length) {
    renderRepeatButton();
    toast('Todavía no hay un pedido anterior en este dispositivo.');
    return;
  }
  if (!products.length && saved.some(item => item.productId !== 'promo-combo-200')) {
    toast('Espera a que cargue el menú para repetir el pedido.');
    return;
  }
  if (cart.length && !confirm('¿Reemplazar el carrito actual por tu último pedido?')) return;

  const restored = [];
  let unavailable = false;
  saved.forEach(item => {
    if (item.productId === 'promo-combo-200') {
      if (!promoSettingsLoaded || promoCombo?.active === false) {
        unavailable = true;
        return;
      }
      const combo = promoCombo || DEFAULT_CLIENT_COMBO;
      restored.push({
        productId: item.productId,
        name: combo.name,
        price: Number(combo.price),
        qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
        garnish: 'Combo',
        promoCycle
      });
      return;
    }
    const product = products.find(p => String(p.id) === item.productId);
    if (!product || product.available === false) {
      unavailable = true;
      return;
    }

    let qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    if (product.category === 'ofertas' && product.stock !== undefined && product.stock !== null) {
      qty = Math.min(qty, Math.max(0, Math.floor(Number(product.stock) || 0)));
    }
    if (!qty) {
      unavailable = true;
      return;
    }

    const savedPrice = Number(item.price);
    const price = product.variable
      ? Math.max(Number(product.price) || 0, Number.isFinite(savedPrice) ? savedPrice : 0)
      : Number(product.price);
    if (!Number.isFinite(price) || price < 0) {
      unavailable = true;
      return;
    }
    restored.push({
      productId: String(product.id),
      name: product.variable && item.garnish ? `${product.name} (${item.garnish})` : product.name,
      price,
      qty,
      garnish: item.garnish || '',
    });
    if (qty < Number(item.qty)) unavailable = true;
  });

  if (!restored.length) {
    toast('Los productos de tu último pedido ya no están disponibles.');
    return;
  }

  cart = restored;
  pickup = false;
  delivery = 50;
  loc = null;
  document.getElementById('mode').value = 'delivery';
  document.getElementById('client').value = '';
  document.getElementById('address').value = '';
  document.getElementById('cash').value = '';
  document.getElementById('loc-btn').textContent = '📍 Enviar mi ubicación';
  document.getElementById('loc-status').hidden = true;
  setMode();
  updateCart();
  toggleCart(true);
  if (unavailable) toast('Revisamos el menú: algunos productos o cantidades cambiaron.');
}

renderRepeatButton();
