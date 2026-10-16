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
Tonkeeper now starts the native GRAM payment flow: fetch a server quote, open
TON Connect, connect a wallet, then press Pay in the existing payment sheet.
The wallet shows the exact destination and native GRAM amount for approval.
Other wallet methods from the supplied design remain unavailable placeholders.

All credentials are Cloudflare Secrets. Do not add credentials to this repository.

## Validation

Run `node tests/checkout.test.mjs` (Node.js 22+). It covers URL handoff, order loading,
error handling, server-derived paid state and the absence of browser admin tokens.
Backend modules and their SQLite tests are delivered separately.

## Native GRAM payment flow

The Tonkeeper payment button opens a pre-filled native transfer directly from
its click handler. The removed custom connection dialogs and the separate
`plata-ton-pay` service are not used by this page. The standard TON Connect
manifest and SDK remain available, but connection is not required for this
native transfer path.

Main owns `/api/ton/quote` and `/api/ton/confirm`. It reads the original order
amount, obtains an authenticated Crypto Pay rate, and returns the destination,
exact nano amount, unique comment, expiry and an AES-GCM encrypted receipt ticket.
No merchant token or administrative/provider key is exposed in the ticket.

The browser reads Toncenter's public message and transaction APIs without a key.
It checks the destination, amount credited, comment hash, time window, successful
execution and finalized mainnet transaction. A candidate hash and encrypted ticket
are sent to Main, which fetches and independently checks the receipt before
persisting `paid`. Browser code cannot grant paid status.

Only one Toncenter request is made per polling cycle. Checking continues while
the page is open and resumes from session storage after returning to this tab.
There is no background payment monitor after this migration. Keep or reopen the
original tab after confirming the transfer. A genuine in-window receipt can
restore its original paid order if unpaid-row cleanup happened before indexing.

The original two D1 schemas and four order columns are retained. Paid orders are
not removed. A fresh quote is required after expiry; an ambiguous payment is not
automatically resent. The application never asks for a seed phrase or private key.

Validation:
- `node tests/checkout.test.mjs`
- `node tests/gram-flow.test.mjs`
- Backend: `node test-browser-ton.mjs`, plus Main, CryptoBot and lifetime regressions.
