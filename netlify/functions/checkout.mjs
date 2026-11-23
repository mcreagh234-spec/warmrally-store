// Creates a Square hosted-checkout link for the cart.
// Prices are always recalculated here from data/catalog.json, so a shopper can't edit prices in their browser.
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   SQUARE_ACCESS_TOKEN   your Square access token (sandbox or production)
//   SQUARE_LOCATION_ID    the Square location that should receive the orders
//   SQUARE_ENV            "sandbox" for testing, "production" when live (default: sandbox)

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  // Env values can pick up stray/invisible characters when pasted into the dashboard.
  // Strip anything outside printable ASCII so a bad paste can't crash the request headers.
  const clean = (s) => (s || '').replace(/[^\x21-\x7E]/g, '');
  const token = clean(process.env.SQUARE_ACCESS_TOKEN);
  const locationId = clean(process.env.SQUARE_LOCATION_ID);
  const env = clean(process.env.SQUARE_ENV).toLowerCase() || 'sandbox';
  if (!token || !locationId) return json(500, { error: 'Checkout is not configured yet.' });

  const origin = process.env.URL || new URL(req.url).origin;

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const items = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
  if (!items.length) return json(400, { error: 'Your cart is empty.' });

  let catalog;
  try {
    const r = await fetch(`${origin}/data/catalog.json`, { headers: { 'Cache-Control': 'no-cache' } });
    catalog = await r.json();
  } catch {
    return json(500, { error: 'Could not load the product catalog.' });
  }
  const currency = catalog.store.currency || 'USD';

  const lineItems = [];
  let subtotal = 0;
  for (const it of items) {
    const p = catalog.products.find((x) => x.handle === it?.handle);
    if (!p) return json(400, { error: 'An item in your cart is no longer available.' });
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 10)) return json(400, { error: 'Invalid quantity.' });

    // Which bundle tier (Solo / Battle Buddy / Squad) and how many outfits it includes.
    const b = p.bundles;
    const tier = b ? b.tiers.find((t) => t.id === it.tier) : null;
    if (b && !tier) return json(400, { error: 'Please choose a bundle.' });
    const need = tier ? tier.qty : 1;
    const units = Array.isArray(it.units) ? it.units : [];
    if (units.length !== need) return json(400, { error: 'Please choose a size and variant for each outfit.' });

    const labels = [];
    for (const u of units) {
      const chosen = [];
      for (const o of p.options || []) {
        const v = o.values.find((x) => x.name === u?.[o.name]);
        if (!v) return json(400, { error: `Please choose a ${o.name.toLowerCase()}.` });
        chosen.push(v.name);
      }
      if ((p.sold_out || []).some((combo) => Object.entries(combo).every(([k, v]) => u[k] === v)))
        return json(400, { error: `${chosen.join(' / ')} is sold out.` });
      labels.push(chosen.join(' / '));
    }

    const price = tier ? tier.price_cents : p.price_cents;
    subtotal += price * qty;
    const giftNames = (it.gifts || []).filter((g) => tier?.gifts?.includes(g) && b.gifts?.[g]).map((g) => b.gifts[g].title.replace(/^\+\s*/, ''));
    lineItems.push({
      name: `${p.title}${tier ? ` – ${tier.title}` : ''}`.slice(0, 255),
      quantity: String(qty),
      base_price_money: { amount: price, currency },
      note: [labels.map((l, i) => (labels.length > 1 ? `#${i + 1}: ${l}` : l)).join(' | '), giftNames.length ? `Free gift: ${giftNames.join(', ')}` : '']
        .filter(Boolean).join(' — ').slice(0, 2000),
    });

    for (const id of new Set(it.addons || [])) {
      const a = b?.addons?.find((x) => x.id === id);
      if (!a) continue;
      subtotal += a.price_cents * qty;
      lineItems.push({ name: a.title.replace(/^\+\s*/, ''), quantity: String(qty), base_price_money: { amount: a.price_cents, currency } });
    }
  }

  const ship = catalog.store.shipping || {};
  const freeShip = !ship.flat_fee_cents || (ship.free_over_cents && subtotal >= ship.free_over_cents);
  const shippingFee = freeShip ? 0 : ship.flat_fee_cents;

  const checkout_options = {
    redirect_url: `${origin}/thank-you.html`,
    ask_for_shipping_address: true,
    accepted_payment_methods: { apple_pay: true, google_pay: true, cash_app_pay: true },
  };
  // Only send a shipping fee when there is one; a $0 fee can confuse Square's hosted checkout.
  if (shippingFee > 0) checkout_options.shipping_fee = { name: ship.label || 'Shipping', charge: { amount: shippingFee, currency } };
  if (catalog.store.support_email && !catalog.store.support_email.includes('yourdomain')) {
    checkout_options.merchant_support_email = catalog.store.support_email;
  }

  const host = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  let res, out;
  try {
    res = await fetch(`${host}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': '2026-09-16',
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: locationId,
          line_items: lineItems,
        },
        checkout_options,
      }),
    });
    out = await res.json().catch(() => ({}));
  } catch (e) {
    console.error('Square request failed:', String(e && e.message || e));
    return json(502, { error: 'Payment provider error.' });
  }
  if (!res.ok || !out.payment_link?.url) {
    console.error('Square error', res.status, JSON.stringify(out.errors || out));
    return json(502, { error: 'Payment provider error.' });
  }
  return json(200, { url: out.payment_link.url });
};
