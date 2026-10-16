# Backend changes for the frontend — V1 Batch 3 part 2 (four switches), 16 Oct 2026

Swagger: /api-docs, tag **Floor cases** plus `/admin/switches`. Envelope as always: `{ success, data: { message } }`.
**All four switches are OFF until the client turns them on.** With a switch off, today's behaviour stays and the
"start" endpoint answers `switchOff: true` — hide or grey that button when its switch is off.

## 0. Switches (admin)
`GET /admin/switches` → `{ switches: { s2PartialReceipt, routesByService, ironOnlyUpgrade, damageCase },
ironOnlyAnswerMinutes }`. `PATCH /admin/switches` with any of those (booleans) and `ironOnlyAnswerMinutes` (R24,
default 180; test value 10). Audited.

## 1. Damage case (switch `damageCase`, R6, T3.08–T3.10)
- `POST /orders/{id}/items/{itemId}/damage` `{ note }` — S2, S3 or S4 (the station holding the piece) or admin.
  Holds THAT piece (`holdDetails.reason: "damaged"`, `assignTo: "admin"`, `tagState` + damaged); the rest move on.
  Opens a customer care task (`GET /recovery/tasks`, type `damage`, "Damage case: call the customer"); admin is
  notified. Piece: `damageCase: { status: open | customer-informed | released, note, station, openedByName,
  customerInformedAt, customerInformedByName }`.
- QC cannot receive the order while the piece is held. The refusal names it: "The whole order goes to Quality Check
  and Pack together. Not included: TAG 02 (on hold)."
- `POST /orders/{id}/items/{itemId}/customer-informed` `{ note? }` — customer care or admin. Closes the task, tells
  admin. **Admin's release (`PATCH /admin/order/{id}/release-item-hold`) is refused before this** with
  `customerInformedRequired: true`. Stations get "Only admin can release this."
- `POST /orders/{id}/partial-delivery` `{ reason, ourFault }` — customer care or admin, when the hold will be long.
  The held damaged piece(s) move to a **follow-on order** (own OSC number; `parentOrderId` / `parentOscNumber`;
  the original gets `partialDelivery.childOrderId / childOscNumber / tagIds`). The 3 ready pieces carry on to QC on
  the original order. Follow-on delivery is free when `ourFault: true`; otherwise it carries the delivery fee and is
  paid like any order. Reply: `{ remainingPieces, followOnOrderId, followOnOscNumber, movedTagIds, secondTripFee,
  secondTripFree }`.

## 2. S2 holds one piece at receipt (switch `s2PartialReceipt`, R2, T8.04–T8.05)
- At S2's receipt (`POST /orders/{id}/handoff/{hid}/confirm`), `rejectedItems` may now be SOME of the pieces, with
  the note (e.g. "Something is missing: no tag"). Those go to S1's Holds; the rest are received. Switch off: still
  "accept every item or reject every item".
- S1 fixes the piece, releases it with a note, and sends it **alone** (`POST /orders/{id}/handoff` with that
  `itemIds`). The rule out of S1 is now "send every piece still at Intake and Tag": a new order still goes whole,
  and a fixed piece goes alone. Works with the switch on or off.
- Second rejection of that piece → admin (already live).

## 3. Routes by service (switch `routesByService`, R4, T3.07, T4.02)
- Wash and Iron: S2, S3, S4, QC. Wash Only: S2, S3, QC. Iron Only: S2, S4, QC. Each piece follows its own service
  (`items[].serviceType`, else the order's).
- A push off the route is refused: `offRoute: true`, "TAG 01 is Wash Only: it goes to Quality Check and Pack next,
  not Press.", `pieces: [{ itemId, tagId, nextStation }]`. S2's automatic send after sorting/pretreat sends each
  piece to its own next stop (Iron Only → Press).

## 4. Iron Only "looks dirty" (switch `ironOnlyUpgrade`, R8, T4.03–T4.08)
- `POST /orders/{id}/items/{itemId}/looks-dirty` `{ note }` — S2 (or admin), Iron Only piece at S2. The piece stays
  at S2 (`waitingForCustomer: true` if anyone tries to send it; S2's automatic send skips it); the rest carry on. S1
  and customer care are notified. Piece: `dirtySuggestion: { status: suggested | link-sent | paid | declined |
  expired, note, suggestedByName, difference, expiresAt, closeNote }`.
- `GET /orders/looks-dirty` — S1's list (also S2, customer care, admin).
- `POST /orders/{id}/items/{itemId}/upgrade-service` — S1 (or admin) after the customer agrees. The full difference
  (no cover) goes on the order (`amount`, `balanceDue`, `pricing.serviceChange`, order reads unpaid) and a payment
  link goes by SMS. **Paying is the approval**: the piece becomes Wash and Iron and S2 is told to send it to Wash
  and Dry. Not paid within `ironOnlyAnswerMinutes`: link cancelled, money off, pressed as booked, note "customer did
  not pay for washing", customer messaged.
- `POST /orders/{id}/items/{itemId}/looks-dirty/decline` `{ note? }` — S1: the customer said no → pressed as booked.
