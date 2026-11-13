const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('receipt includes order details without interpreting them as HTML', () => {
  const children = [];
  const receipt = {
    hidden: true,
    replaceChildren() { children.length = 0; },
    appendChild(element) { children.push(element); },
  };
  let printed = false;
  let afterPrint;
  const context = {
    document: {
      getElementById: () => receipt,
      createElement: () => ({textContent: '', className: ''}),
    },
    window: {
      print() { printed = !receipt.hidden; },
      addEventListener(event, callback) {
        if (event === 'afterprint') afterPrint = callback;
      },
    },
    money: amount => `RD$ ${amount}`,
    console,
    alert: () => assert.fail('Unexpected print error'),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../admin-receipt.js'), 'utf8'), context);
  context.printOrderReceipt({
    id: 'pedido1',
    clientName: '<img src=x>',
    address: 'Recoge en el local',
    items: [{name: 'Hamburguesa', qty: 2, price: 200}],
    subtotal: 400,
    delivery: 0,
    total: 400,
    paymentMethod: 'efectivo',
    cashAmount: '500',
    paid: false,
  });
  assert.equal(printed, true);
  const text = children.map(element => element.textContent).join('\n');
  for (const value of ['<img src=x>', 'Hamburguesa', 'RD$ 400', '500', 'PAGO PENDIENTE']) {
    assert.ok(text.includes(value));
  }
  afterPrint();
  assert.equal(receipt.hidden, true);
});
