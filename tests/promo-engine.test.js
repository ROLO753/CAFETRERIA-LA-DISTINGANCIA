const test = require('node:test');
const assert = require('node:assert/strict');
const {apply, prizes} = require('../promo-engine');

const random = {position: 4, prize: 2, message: 0};

test('credits an eligible order only once', () => {
  let state = apply(null, {type: 'credit', uid: 'a', id: 'order1'}, random);
  assert.equal(state.users.a.tokens, 2);
  assert.equal(apply(state, {type: 'credit', uid: 'a', id: 'order1'}, random), undefined);
  assert.equal(state.users.a.tokens, 2);
});

test('has exactly one random-position prize in every group of ten successful spins', () => {
  let state = {users: {a: {tokens: 100}}};
  for (let i = 0; i < 20; i++) {
    state = apply(state, {type: 'spin', uid: 'a', id: `spin${i}`}, random);
  }
  assert.equal(state.spins, 20);
  assert.equal(state.users.a.tokens, 0);
  assert.equal(Object.keys(state.users.a.prizes).length, 2);
  assert.equal(state.users.a.prizes.spin4.name, prizes[2]);
  assert.equal(state.users.a.prizes.spin14.status, 'pendiente');
  state = apply(state, {type: 'spin', uid: 'a', id: 'no-tokens'}, random);
  assert.equal(state.spins, 20);
  assert.equal(state.users.a.tokens, 0);
});

test('reserves no more than ten coupons, one per account', () => {
  let state;
  for (let i = 0; i < 11; i++) {
    const uid = `user${i}`;
    state = apply(state, {type: 'coupon', uid, id: `request${i}`}, random);
    state = apply(state, {type: 'approveCoupon', uid, id: `approve${i}`}, random) || state;
  }
  assert.equal(state.coupons, 10);
  assert.equal(state.users.user10.coupon, undefined);
  assert.match(state.users.user10.lastResult.text, /agotaron/);
  state = apply(state, {type: 'coupon', uid: 'user0', id: 'repeat'}, random);
  assert.equal(state.coupons, 10);
  assert.match(state.users.user0.lastResult.text, /reservado/);
});

test('requires approval before marking a prize redeemed', () => {
  let state = {users: {a: {tokens: 5}}};
  state = apply(state, {type: 'spin', uid: 'a', id: 'spin'}, {...random, position: 0});
  assert.equal(apply(state, {type: 'redeemPrize', uid: 'a', id: 'redeem', prizeId: 'spin'}, random), undefined);
  state = apply(state, {type: 'approvePrize', uid: 'a', id: 'approve', prizeId: 'spin'}, random);
  assert.equal(state.users.a.prizes.spin.status, 'aprobado');
  state = apply(state, {type: 'redeemPrize', uid: 'a', id: 'redeem', prizeId: 'spin'}, random);
  assert.equal(state.users.a.prizes.spin.status, 'canjeado');
});
