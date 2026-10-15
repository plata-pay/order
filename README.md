# Plata Pay checkout

GitHub Pages serves this repository from `main` at `https://plata-pay.github.io/order/`.
The interface is based on the supplied `plata_pay_5_per_minute-1.html`.

## Order URLs

The order API returns `/order/<id>`, where the ID is four groups of four lowercase
letters/digits separated by hyphens. GitHub Pages sends an unknown path to
`404.html`, which forwards a valid order to `/order/?checkout=<id>`. The app then
restores `/order/<id>` with `history.replaceState` and loads the order data.
Unknown paths show a not-found message. The root page never displays a demo order.

## Services

- Order details: `https://plata-order-reader.dpl-payments.workers.dev/?id=<id>`
- CryptoBot invoices: `https://shrill-salad-0763.dpl-payments.workers.dev/`
- Merchant-facing orders: `https://plata-main.dpl-payments.workers.dev/api/orders`

The browser sends no merchant/admin token. Only the ID, amount and status are
returned by the public reader. CryptoBot invoice creation validates the amount
against the database; verified payment status is written through the protected
Main Worker by a service binding. The browser cannot set `paid` directly.
The page checks payment on the user's request; no provider webhook is configured.
Other wallet methods from the supplied design remain unavailable placeholders.

All credentials are Cloudflare Secrets. Do not add credentials to this repository.

## Validation

Run `node tests/checkout.test.mjs` (Node.js 22+). It covers URL handoff, order loading,
error handling, server-derived paid state and the absence of browser admin tokens.
Backend modules and their SQLite tests are delivered separately.
