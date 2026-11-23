// Shared, server-side pricing. Prices always come from data/catalog.json — never from the browser.
export async function loadCatalog(origin) {
  const r = await fetch(`${origin}/data/catalog.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('catalog');
  return r.json();
}

// Returns { lineItems, subtotal, shippingFee, total, currency } or throws Error(userMessage)
export function priceCart(catalog, rawItems, shippingId) {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 50) : [];
  if (!items.length) throw new Error('Your cart is empty.');
  const currency = catalog.store.currency || 'USD';
  const lineItems = [];
  let subtotal = 0;

  for (const it of items) {
    const p = catalog.products.find((x) => x.handle === it?.handle);
    if (!p) throw new Error('An item in your cart is no longer available.');
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 10)) throw new Error('Invalid quantity.');

    const b = p.bundles;
    const tier = b ? b.tiers.find((t) => t.id === it.tier) : null;
    if (b && !tier) throw new Error('Please choose a bundle.');
    const units = Array.isArray(it.units) ? it.units : [];
    if (units.length !== (tier ? tier.qty : 1)) throw new Error('Please choose a size and variant for each outfit.');

    const labels = [];
    for (const u of units) {
      const chosen = [];
      for (const o of p.options || []) {
        const v = o.values.find((x) => x.name === u?.[o.name]);
        if (!v) throw new Error(`Please choose a ${o.name.toLowerCase()}.`);
        chosen.push(v.name);
      }
      if ((p.sold_out || []).some((combo) => Object.entries(combo).every(([k, v]) => u[k] === v)))
        throw new Error(`${chosen.join(' / ')} is sold out.`);
      labels.push(chosen.join(' / '));
    }

    const price = tier ? tier.price_cents : p.price_cents;
    subtotal += price * qty;
    const gifts = (it.gifts || []).filter((g) => tier?.gifts?.includes(g) && b.gifts?.[g]).map((g) => b.gifts[g].title.replace(/^\+\s*/, ''));
    lineItems.push({
      name: `${p.title}${tier ? ` – ${tier.title}` : ''}`.slice(0, 255),
      quantity: String(qty),
      base_price_money: { amount: price, currency },
      note: [labels.map((l, i) => (labels.length > 1 ? `#${i + 1}: ${l}` : l)).join(' | '), gifts.length ? `Free gift: ${gifts.join(', ')}` : '']
        .filter(Boolean).join(' — ').slice(0, 2000),
    });
    for (const id of new Set(it.addons || [])) {
      const a = b?.addons?.find((x) => x.id === id);
      if (!a) continue;
      subtotal += a.price_cents * qty;
      lineItems.push({ name: a.title.replace(/^\+\s*/, ''), quantity: String(qty), base_price_money: { amount: a.price_cents, currency } });
    }
  }

  const opts = catalog.store.shipping_options;
  if (Array.isArray(opts) && opts.length) {
    const opt = opts.find((o) => o.id === shippingId) || opts[0];
    return { lineItems, subtotal, shippingFee: opt.price_cents || 0, total: subtotal + (opt.price_cents || 0), currency,
      shippingLabel: `${opt.label} (${opt.eta})`, shippingId: opt.id };
  }
  const ship = catalog.store.shipping || {};
  const free = !ship.flat_fee_cents || (ship.free_over_cents && subtotal >= ship.free_over_cents);
  const shippingFee = free ? 0 : ship.flat_fee_cents;
  return { lineItems, subtotal, shippingFee, total: subtotal + shippingFee, currency, shippingLabel: ship.label || 'Shipping', shippingId: 'standard' };
}
