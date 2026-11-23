// On-site checkout. GET  → public config for the Square card form.
//                   POST → re-prices the cart, creates a Square order (with shipping address), then charges the card.
//
// Environment variables (Netlify → Environment variables):
//   SQUARE_ACCESS_TOKEN    secret access token (sandbox or production)
//   SQUARE_LOCATION_ID     location that receives the orders
//   SQUARE_APPLICATION_ID  application ID (public — starts with "sandbox-sq0idb-" in test mode, "sq0idp-" when live)
//   SQUARE_ENV             "sandbox" or "production"
import { loadCatalog, priceCart } from '../lib/pricing.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);

const FRIENDLY = {
  CARD_DECLINED: 'Your card was declined. Please try another card.',
  GENERIC_DECLINE: 'Your card was declined. Please try another card.',
  INSUFFICIENT_FUNDS: 'Your card was declined for insufficient funds.',
  CVV_FAILURE: 'The security code (CVV) is incorrect.',
  ADDRESS_VERIFICATION_FAILURE: 'The billing ZIP code does not match your card.',
  INVALID_EXPIRATION: 'The card expiration date is invalid.',
  EXPIRATION_FAILURE: 'The card is expired.',
  INVALID_CARD: 'The card number is invalid.',
  INVALID_POSTAL_CODE: 'The ZIP / postal code is invalid.',
  CARD_DECLINED_VERIFICATION_REQUIRED: 'Your bank needs extra verification. Please try again.',
};

export default async (req) => {
  const { SQUARE_ACCESS_TOKEN: token, SQUARE_LOCATION_ID: locationId, SQUARE_APPLICATION_ID: appId } = process.env;
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';

  if (req.method === 'GET') {
    if (!appId || !locationId) return json(500, { error: 'Checkout is not configured yet.' });
    return json(200, { applicationId: appId, locationId, env });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!token || !locationId) return json(500, { error: 'Checkout is not configured yet.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const c = body?.customer || {};
  const a = c.address || {};
  const required = { email: c.email, firstName: c.firstName, lastName: c.lastName, line1: a.line1, city: a.city, zip: a.zip, country: a.country };
  for (const [k, v] of Object.entries(required)) if (!clean(v)) return json(400, { error: 'Please fill in your contact and shipping details.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return json(400, { error: 'Please enter a valid email address.' });
  if (!clean(body.sourceId, 500)) return json(400, { error: 'Missing payment details.' });

  const origin = process.env.URL || new URL(req.url).origin;
  let priced;
  try { priced = priceCart(await loadCatalog(origin), body.items, String(body.shippingId || '')); }
  catch (e) { return json(400, { error: e.message === 'catalog' ? 'Could not load the product catalog.' : e.message }); }

  // Client shows a total; refuse if it no longer matches (e.g. prices changed while the page was open).
  if (Number(body.expectedTotal) !== priced.total) return json(409, { error: 'Prices have changed — please review your order and try again.' });

  const host = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  const sq = (path, payload) => fetch(`${host}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Square-Version': '2026-09-16' },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

  const name = `${clean(c.firstName, 80)} ${clean(c.lastName, 80)}`.trim();
  const address = {
    address_line_1: clean(a.line1), address_line_2: clean(a.line2) || undefined,
    locality: clean(a.city, 100), administrative_district_level_1: clean(a.state, 100) || undefined,
    postal_code: clean(a.zip, 20), country: clean(a.country, 2).toUpperCase(),
    first_name: clean(c.firstName, 80), last_name: clean(c.lastName, 80),
  };

  const order = {
    location_id: locationId,
    reference_id: `RM-${Date.now().toString(36).toUpperCase()}`,
    line_items: priced.lineItems,
    fulfillments: [{
      type: 'SHIPMENT', state: 'PROPOSED',
      shipment_details: { shipping_note: priced.shippingLabel, recipient: { display_name: name, email_address: clean(c.email), phone_number: clean(c.phone, 30) || undefined, address } },
    }],
  };
  if (priced.shippingFee > 0) {
    order.service_charges = [{ name: priced.shippingLabel, amount_money: { amount: priced.shippingFee, currency: priced.currency }, calculation_phase: 'TOTAL_PHASE', taxable: false }];
  }

  const o = await sq('/v2/orders', { idempotency_key: crypto.randomUUID(), order });
  if (!o.ok || !o.data.order) {
    console.error('CreateOrder failed', o.status, JSON.stringify(o.data.errors || o.data));
    return json(502, { error: 'We could not create your order. Please try again.' });
  }
  const total = o.data.order.total_money?.amount;
  if (total !== priced.total) {
    console.error('Total mismatch', total, priced.total);
    return json(502, { error: 'We could not create your order. Please try again.' });
  }

  const p = await sq('/v2/payments', {
    idempotency_key: crypto.randomUUID(),
    source_id: clean(body.sourceId, 500),
    amount_money: { amount: total, currency: priced.currency },
    order_id: o.data.order.id,
    location_id: locationId,
    autocomplete: true,
    buyer_email_address: clean(c.email),
    shipping_address: address,
    billing_address: { postal_code: clean(body.billingZip || a.zip, 20), country: address.country },
    reference_id: order.reference_id,
    note: `RuffMission online order ${order.reference_id}`,
  });
  if (!p.ok || !p.data.payment) {
    const code = p.data.errors?.[0]?.code;
    // Payment failed: cancel the order so unpaid orders never show up as "Active" in Square.
    await fetch(`${host}/v2/orders/${o.data.order.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Square-Version': '2026-09-16' },
      body: JSON.stringify({ idempotency_key: crypto.randomUUID(), order: { location_id: locationId, version: o.data.order.version, state: 'CANCELED' } }),
    }).catch(() => {});
    console.error('CreatePayment failed', p.status, JSON.stringify(p.data.errors || p.data));
    return json(402, { error: FRIENDLY[code] || 'Your payment could not be processed. Please check your card details and try again.' });
  }
  return json(200, { ok: true, orderNumber: order.reference_id, receiptUrl: p.data.payment.receipt_url || null });
};
