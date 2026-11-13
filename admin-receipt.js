function printOrderReceipt(order) {
  const receipt = document.getElementById('print-receipt');
  receipt.replaceChildren();

  function line(text, className) {
    const element = document.createElement('div');
    if (className) element.className = className;
    element.textContent = text;
    receipt.appendChild(element);
  }

  line('Cafetería La Distingancia', 'receipt-title');
  line('RECIBO DE PEDIDO', 'receipt-center');
  line(`Pedido: ${order.id}`);
  line(`Fecha: ${order.createdAt ? new Date(order.createdAt).toLocaleString('es-DO') : 'No disponible'}`);
  line(`Cliente: ${order.clientName || 'Cliente'}`);
  line(`Entrega: ${order.address || 'No indicada'}`);
  line('PRODUCTOS', 'receipt-heading');
  (order.items || []).forEach(item => {
    line(`${item.qty} x ${item.name}`, 'receipt-item');
    line(`${money(item.price)} c/u    ${money(Number(item.qty) * Number(item.price))}`, 'receipt-right');
  });
  line(`Subtotal: ${money(order.subtotal)}`, 'receipt-right receipt-heading');
  line(`Envío: ${money(order.delivery)}`, 'receipt-right');
  line(`TOTAL: ${money(order.total)}`, 'receipt-right receipt-total');
  const payment = order.paymentMethod === 'efectivo' ? 'Efectivo'
    : order.paymentMethod === 'transferencia' ? 'Transferencia' : (order.paymentMethod || 'No indicado');
  line(`Pago: ${payment}`);
  if (order.cashAmount) line(`Paga con: ${order.cashAmount}`);
  line(order.paid ? 'PAGO CONFIRMADO' : 'PAGO PENDIENTE');
  line('¡Gracias por tu pedido!', 'receipt-center receipt-heading');

  receipt.hidden = false;
  try {
    window.print();
  } catch (error) {
    console.error('No se pudo abrir la impresión:', error);
    alert('No se pudo abrir la impresión. Usa «Imprimir recibo» para intentarlo de nuevo.');
    receipt.hidden = true;
  }
}

window.addEventListener('afterprint', () => {
  document.getElementById('print-receipt').hidden = true;
});
