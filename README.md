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

## TON Connect and native GRAM payments

Manifest: `https://plata-pay.github.io/order/tonconnect-manifest.json`.
The SDK is `@tonconnect/ui` 5.0.1, stored locally with its Apache-2.0 license,
verified npm tarball integrity and pinned SHA-384 browser integrity check.
Analytics is off and the network is TON mainnet (`-239`). The wallet picker
supports Tonkeeper and other compatible TON Connect wallets.

Converter: `https://plata-converter.dpl-payments.workers.dev/convert?from=RUB&to=GRAM&amount=5`.
Payment service: `https://plata-ton-pay.dpl-payments.workers.dev`.
GRAM means the native coin previously called Toncoin, not the unrelated jetton.
Quotes use integer base units (10^9 per GRAM), round up to avoid underpayment,
expire after at most 180 seconds, and never outlive their order's payment window.
The quote is stored server-side. The client cannot supply the exchange rate,
expected amount, recipient or payment status.

Flow:
1. The service reads the RUB amount from the order database and gets a quote.
2. TON Connect opens only after conversion succeeds.
3. The customer connects a wallet and sees the payment panel.
4. Pay prepares the server's exact transaction and requests wallet approval.
5. The service independently checks the finalized incoming on-chain receipt.
6. Main stores `paid`; the page displays success and the paid link persists.

A wallet's broadcast result is not a receipt. Confirmation requires the exact
native-coin destination, quote-specific comment hash, sufficient credited
amount, a successful non-bounced transaction and masterchain finality.
A private settlement capability is shared only by Main and the payment service.
The original two D1 schemas keep their existing columns; quotes and receipt
tracking use a per-order Durable Object with automatic alarms. The verifier
continues after the browser closes. If the indexer is delayed beyond the unpaid
row cleanup, a genuine in-window finalized payment restores the original paid
order. Verified receipts retry persistence until successful. Missing receipts
are watched for up to 24 hours; long provider outages need reconciliation.

The application requests only a specific native-coin transfer; it never requests
seed phrases, private keys, arbitrary signatures or token permissions. Unknown
broadcast outcomes disable repeat sending while receipt checking continues.
An expired quote requires the user to review the refreshed amount and click
Pay again. Account data and backend messages are rendered as text.

**Activation:** the payment Worker requires the owner's public
`PAYMENT_RECIPIENT` mainnet address, for an activated receiving wallet.
There is no sample/default destination. Until that binding is configured,
quote/transfer preparation fails closed. `TONCENTER_API_KEY` and
`COINGECKO_API_KEY` are optional server Secrets for higher upstream limits.
No merchant/admin credentials are shipped to the browser.

Validation:
- `node tests/checkout.test.mjs`
- `node tests/tonconnect.test.mjs`
- `node tests/gram-flow.test.mjs`

The backend has separate real-SQLite tests for quote tampering, underpayment,
wrong recipients, finality, delayed indexing, secret separation and automatic
confirmation. Wire-format fixtures are independently generated using
`@ton/core@0.63.1`. Wallet/indexer responses in local tests are mocked;
mainnet payment requires the owner's destination and customer wallet approval.
