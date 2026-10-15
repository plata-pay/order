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
Tonkeeper now supports a connection-only TON Connect flow: choose Tonkeeper,
select the existing currency option, press Continue, and approve in the wallet.
The SDK handles its bridge session; the page shows the connected address and a
Disconnect button. Existing sessions are restored when Tonkeeper is opened.
Other wallet methods from the supplied design remain unavailable placeholders.

All credentials are Cloudflare Secrets. Do not add credentials to this repository.

## Validation

Run `node tests/checkout.test.mjs` (Node.js 22+). It covers URL handoff, order loading,
error handling, server-derived paid state and the absence of browser admin tokens.
Backend modules and their SQLite tests are delivered separately.

## Tonkeeper / TON Connect

The public manifest is `https://plata-pay.github.io/order/tonconnect-manifest.json`.
It uses a local 180×180 PNG icon. The official `@tonconnect/ui` 5.0.1 browser
bundle is vendored with its Apache-2.0 license. Its npm tarball integrity was
verified at import; the loader pins a SHA-384 Subresource Integrity value.
`vendor/tonconnect-ui-provenance.json` records the exact version and hashes.
The SDK is loaded only after the user selects the Tonkeeper flow. Analytics
is disabled, network is restricted to TON Mainnet (`-239`), and cancellation,
restoration, disconnect and malformed account data are handled explicitly.
The manifest URL is fixed and contains no order ID or credentials.

This is wallet connection, not wallet authentication or payment collection.
The application requests no transaction, signature, seed phrase or private key,
and cannot mark an order paid through a connection event. Account information
is rendered as text and is not sent to our Workers. No extra Worker or database
binding is needed for this connection-only flow.

Actual payment collection needs the owner's public receiving address and the
chosen asset (native TON or the intended GRAM jetton), a server-created quote
and an independent server-side on-chain receipt check. None of those values
are inferred from a visitor's wallet. Existing CryptoBot payments are unchanged.

Run `node tests/tonconnect.test.mjs` for the manifest, icon, SDK hash, connection
lifecycle, wrong-network rejection and absence of payment-status side effects.
Wallet and SDK bridge events are mocked; real Tonkeeper approval requires a
user-controlled wallet.
