# Fix: Booking body cannot set server fields

**Type:** Fix
**Status:** verified
**Branch:** `fix/booking-body-cannot-set-server-fields`

Security hotfix, branched from `main` so it can ship ahead of the stacked launch-fix
branches. Found by the independent review of launch fix 2 (F-18 [P0]).

## The problem

`BookOrderService.postBookOrder` (`POST /api/bookOrder/create-book-order`, also the in-app
assistant's booking) builds the order in all three billing branches as
`{ userId, oscNumber, amount: totalPrice, …, ...post, deliveryDate }`, where `post` is the
request body. Anything in the body overwrites the server's values:

- `amount: 100` → the order's amount is ₦100, which Paystack then charges.
- `paymentStatus: "success"` → an unpaid order is stored as paid (tagging unlocks).
- `userId` → the order is filed under another customer.
- likewise `stage`, `pricing`, `paymentWaivedAt`, `deliveryAmount`, `quickBooking`, …

## The fix

- Save only an allow-list of the customer's own fields from the body
  (`CUSTOMER_ORDER_FIELDS`: name, phone, addresses, pickup date and time, service type,
  care level, speed, channel, billing type, items, note, pickup/delivery), plus the
  Quick Booking fields the server's own normaliser puts on `post`. Every other field is
  the server's.
- The Quick Booking fields (`quickBooking`, `itemsPending`, `counts`) are removed from the
  body before anything reads it, so a client cannot set them.
- Inputs that are read but never stored (`itemCount`, `useCredit`, offer ids, timings,
  window ids, …) are unaffected.

Must not break: any booking branch (pay-per-item, wallet, subscription, Quick Booking).

**Added after review round 1 (changes-requested) — the same hole through `items[]`:**

- **Item prices from the catalog (F-17 [P0]).** Item prices were taken from the body, so
  `items: [{ type: "blanket", price: 100 }]` set the bill just like `amount: 100`. Each
  customer item is now priced from `OrderItem`, or from its `ItemSet` piece when
  `fromSet` is sent (`util/catalogItems.js` `priceFromCatalog`). Names are compared
  lowercased with whitespace as hyphens, because the app sends slugs
  (`shirts-/-tops-/-blouses`). The request's price is ignored; an item that matches
  nothing is refused ("We don't recognise 'X'. Please refresh the app and pick it from
  the list."). It runs before validation and before every billing branch (the
  subscription sum included). Quick Booking placeholders are the server's own and skip it.
  Read-only production check: every customer item line in the previous 14 days matched,
  at exactly the catalog price, so honest bookings are unchanged.
- **Item fields (F-18 [P1]).** Only `type`, `quantity`, `serviceTier` and `fromSet` are
  kept from each item; station, QC, tag and other staff fields are dropped.
- **Channel (F-20).** A customer cannot mark an order `office` (the staff counter's
  channel). `website` / `whatsapp` are still accepted.
- **Round 2 (changes-requested) repairs:** a zero, negative or fractional item quantity
  is refused (F-21 [P0]: two lines at 0 plus one at -5 priced -₦3,000 and a wallet order
  was saved paid for ₦0); `" office"` is compared trimmed (F-20); the subscription
  heavy-item check uses the same name key as pricing (F-22); an unknown service type is
  refused (F-23); deactivated sets are skipped, catalog prices are whole naira, the first
  of two clashing names wins, and Swagger marks `items[].price` as ignored (F-24).
- **Left open — F-19 [P2]:** the staff counter booking (`intake-user` `createBookOrder`)
  still spreads its body; only intake staff and admins reach it.
- **What can now be refused:** an old app build listing an item no longer in the
  catalog, or a basket holding an item the admin renamed or deleted mid-booking. If the
  admin edits a price mid-booking, the customer pays the new price.
- **testingdb:** production's catalog (12 items, 1 set; names, prices, heavy flags) was
  copied into testingdb, which had none. Booking staging scripts that used made-up items
  (`shirt`, `trouser`) now use catalog items.

## Build steps

1. [x] **Allow-list the saved fields.**
   **Done when:** a booking that sends `amount`, `paymentStatus`, `userId` or
   `quickBooking` gets the server's values, and every billing branch still books.
2. [x] **Price items from the catalog; keep only customer item fields; refuse `office`.**
   **Done when:** a booking with `price: 100` on a catalog item pays the catalog price, an
   unknown item is refused with nothing created, a set piece is priced from its set, and
   staff item fields sent by a customer are not stored.

## Verify

- briefCheck: the allow-list drops server fields, and all three order literals use it.
- A booking against testingdb sending `amount: 100`, `paymentStatus: success` and another
  `userId` (SMS and Paystack stubbed).
- `subLogisticsStaging.js` (subscription branch) on testingdb.
- **Independent review is required** (security, payments).
- **Results (2026-10-11):** briefCheck 407/0. Probe through the real `postBookOrder` on
  testingdb (SMS/Paystack stubbed): **unpatched `main` stored a ₦100 order, marked paid,
  filed under another customer**; with the fix, amount ₦701,000 (server), payment pending,
  owner = caller, `deliveryAmount`/`pricing` server's, `quickBooking` not settable,
  customer fields kept (8/8). `subLogisticsStaging.js` 20/0 (subscription branch).
- **Results after step 2 (2026-10-11):** briefCheck 412/0. Probe 14/14 (adds catalog
  price, item staff fields, unknown item refused with nothing created, set piece, channel).
  Booking staging on testingdb, all stubbed: subLogistics 20/0, freeLogistics 23/0,
  tierPricing 33/0, dispatchTag 46/0, handoff 54/0, dispatch 80/0, phase12 14/0,
  dashboardDecisions 45/0, bookingContext 30/0.
- **Results after round 2 repairs (2026-10-11):** briefCheck 418/0, probe 14/14,
  subLogistics 20/0, handoff 54/0, dispatch 80/0, dashboardDecisions 45/0, tierPricing
  33/0, freeLogistics 23/0.
