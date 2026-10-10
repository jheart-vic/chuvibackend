# FRONTEND CHANGELOG — backend package from the 6 Oct 2026 Developer Brief
Backend branch: `feature/fix` · All paths verified against the built Swagger spec
(56 schemas / 287 paths). Base URL prefix for everything below: `/api`.

**ENVELOPE REMINDER — the payload is always at `data.message`:**
`{ "success": true, "data": { "message": <payload> } }`
Failures: `{ "success": false, "data": { "error": "<sentence>", ...extras } }`

---

## 0. READ THIS FIRST — 3 breaking changes

### 0.1 BREAKING · Landmark is now REQUIRED when a customer books
`POST /bookOrder/create-book-order` now refuses an order whose pickup (or delivery)
address has no landmark. The rider navigates by it.

```json
// 400
{ "success": false, "data": {
  "error": "pickupAddress.landmark is required — the rider needs a landmark to find the pickup address.",
  "field": "pickupAddress.landmark" }}
```

Send addresses as objects, not strings:
```json
{ "pickupAddress":   { "label": "Home",   "address": "14 Allen Avenue, Ikeja", "landmark": "Beside the pharmacy" },
  "deliveryAddress": { "label": "Office", "address": "12 Marina",              "landmark": "Opposite Zenith Bank" } }
```
- `field` tells you which input to focus.
- **Exception:** if the address the customer sends matches one of their **saved
  addresses**, the landmark is borrowed from it automatically and no error is raised.
  So the "book again from a saved address" flow keeps working untouched.
- Staff intake (`POST /intake-user/create-book-order`) already required it.
- **Action: add a landmark field to the booking form.** Until you do, new bookings
  with a typed-in address will fail.

### 0.2 BREAKING · Item names in station payloads are now the readable form
Everywhere an item brief appears (station cards, handoff payloads, dispatch tag),
`name` now holds the display form and the stored slug moved to a new `rawType`:
```json
// before: { "name": "Shirts-/-tops-/-blouses" }
// now:    { "name": "Shirts / Tops / Blouses", "rawType": "Shirts-/-tops-/-blouses" }
```
- **Action: if any code matches/filters on `name`, switch it to `rawType`.** If you
  only display it, you get the fix for free — and it now reads the same at S1, S2
  and S3 (brief 4.6).
- Station names: use the new label fields where provided rather than printing
  `intake-and-tag-station`.

### 0.3 BREAKING · Rider assignment now rejects an id that is not a rider
`POST /intake-user/assign-rider/{riderId}/pickup-order/{id}` and
`.../delivery-order/{id}` validate the rider before writing anything.
```json
// 400 — examples
{ "success": false, "data": { "error": "Ada Obi is not a rider, so the order cannot be assigned to them." }}
{ "success": false, "data": { "error": "Musa Bello is suspended, so they cannot be assigned a run." }}
{ "success": false, "data": { "error": "That rider id is not valid." }}
```
- **Action: populate the rider picker from the NEW `GET /intake-user/riders` (§1.5).**
  This was the cause of "assigning a rider does not save": a valid-looking id that
  was not a rider saved successfully and then read back as `null`, so the row said
  "needs a rider" again.
- Success now returns the rider so you can redraw the row without refetching:
```json
{ "success": true, "data": {
  "message": "Rider successfully assigned to order",
  "rider": { "_id": "64d...", "fullName": "Musa Bello", "phoneNumber": "08031234567" },
  "leg": "pickup", "pickupStatus": "scheduled" }}
```
- Delivery leg also still requires a printed dispatch tag → `needsDispatchTag: true`.

---

## 1. NEW ENDPOINTS

### 1.1 `PATCH /sort-pretreat/order/{id}/items/sort` — bulk sort (brief 1.5)
Does the sorter's whole gesture on **any subset** of pieces in one call. Replaces
having to loop per item, and it is the only way to set colour/fabric/pretreatment on
a multi-selection.
```json
// request
{ "itemIds": ["65a...1","65a...2"],      // or "all": true
  "colorGroup": "colored", "fabricType": "light",
  "pretreatmentOptions": ["no_pretreatment_needed"],
  "damageRiskFlags": [], "itemNote": "",
  "markSorted": true,                     // default true
  "sendToWash": true }                    // default true
// response → data.message
{ "updated": 7, "markedSorted": 7, "pretreatmentRequired": false,
  "readyForWash": 7, "readyItemIds": ["..."],
  "itemsLeftAtStation": 3, "totalItemCount": 10,   // → "3 of 10 left"
  "handoff": { ... }, "allItemsSorted": false, "stillAtStation": 3 }
```
- `pretreatmentOptions: ["no_pretreatment_needed"]` finishes those pieces at S2 —
  there is no "mark pretreated" step to follow.
- Selecting a piece that is not at S2 is refused and the response names them
  (`itemsNotAtStation`).
- **Note:** marking pieces sorted also hands them over to S3 by default, which is why
  they appear in the Wash Queue at once. Send `sendToWash: false` to opt out.

### 1.2 `GET /offers/{id}` — load one offer (brief 2.1)
For the edit screen, so it can reload the authoritative record.
Returns the offer plus `linkages: { live, total, deletable }`.

### 1.3 `DELETE /offers/{id}` — conditional delete (brief 2.1)
Behaviour depends on whether the offer was ever given out:
```json
// never given to anyone → really deleted
{ "deleted": true, ... }
// only finished linkages → archived, history kept
{ "deleted": false, "archived": true, "offerId": "...", "cancelledLinkages": 0,
  "totalLinkages": 4, "message": "Offer \"X\" was archived instead of deleted, because ..." }
// customers currently hold it → REFUSED
{ "success": false, "data": { "error": "...", "liveLinkages": 2, "totalLinkages": 5, "requiresForce": true }}
```
- On `requiresForce`, confirm with the user and repeat as `DELETE /offers/{id}?force=true`
  (cancels those linkages and archives). An archived offer is invisible to customers,
  exactly like a deleted one.

### 1.4 Wallet adjustment approval queue (brief 2.4)
- `GET /admin/wallet-adjustment-requests` — defaults to pending
- `POST /admin/wallet-adjustment-requests/{id}/approve`
- `POST /admin/wallet-adjustment-requests/{id}/reject` — **note is REQUIRED**

### 1.5 `GET /intake-user/riders` — the rider picker (brief 3.1)
```json
// GET /intake-user/riders?search=musa&includeInactive=false
// data.message
[ { "_id": "64d...", "fullName": "Musa Bello", "phoneNumber": "08031234567",
    "status": "active", "activePickups": 2, "activeDeliveries": 1, "activeRuns": 3 } ]
```
Active riders only by default. Use `activeRuns` to spread work.

### 1.6 `GET /communication/templates/meta` — template editor dropdowns (brief 4.2)
```json
// data.message
{ "pages":        [ { "page": "wallet", "description": "The wallet page ..." } ],
  "placeholders": [ { "key": "firstName", "description": "...", "example": "Ada" },
                    { "key": "offerName", "description": "...", "onlyFor": "offer-available" },
                    { "key": "typo",      "description": "...", "unresolved": true } ],
  "templates":    [ { "key": "offer-available", "description": "...", "sentBy": "...", "exists": true } ],
  "channels":     ["in-app","sms"],
  "existing":     [ ...templates already stored... ] }
```
- Render `placeholders` **grouped by `onlyFor`**: entries with no `onlyFor` work in
  every template; the rest only work in that one template key, and using them
  elsewhere prints the raw `{{key}}` to the customer.
- `unresolved: true` = the template uses a key nothing supplies → warn the admin.
- Use it for the offer-message editor too, as the brief asks.

### 1.7 Dispatch tag (shipped Sept, now live on main)
`GET /intake-user/order/{id}/dispatch-tag` · `POST .../dispatch-tag/print`
S1 prints at handover. A delivery order **cannot** be assigned a rider until printed.

---

## 2. CHANGED REQUESTS

| Endpoint | Change |
|---|---|
| `POST /bookOrder/create-book-order` | **landmark required** (§0.1) · `items[].serviceTier` optional (`classic\|premium\|vip`) for per-item care tier |
| `POST /intake-user/create-book-order` | `items[].serviceTier` optional, same rule |
| `POST /subscription/create-plan` | **`paystackPlanCode` is now required** and named if missing · **`itemPerMonth` is no longer required** (it was never stored — use `monthlyLimits`) · `freePickupDeliveryPerWeek` optional, must be ≥ 0 |
| `PUT /subscription/update-plan/{id}` | now validates, and **returns the saved plan** in `data.data` |
| `POST/PUT /communication/templates[/{id}]` | `channels` may be a **string or an array** (a single-select dropdown no longer 400s) · a blank/whitespace `name`/`title`/`body` is refused by field name |
| `GET /intake-user/pickable-orders` · `/deliverable-orders` | NEW `legStatus` filter (§3.2) |

---

## 3. CHANGED RESPONSES

### 3.1 Dispatch queue rows — failed runs and landmarks are now visible
`GET /intake-user/pickable-orders` and `/deliverable-orders` rows gained:
```json
{ "legStatus": "failed",          // this leg's own status
  "failed": true,                 // true when it failed
  "legNote": "Customer not at home, phone switched off",
  "landmark": "Opposite the blue mosque",
  "landmarkMissing": false }      // true = no landmark, chase it
```
and the envelope gained **`failedCount`** beside `needsRiderCount` (both counted over
the whole queue, not the current page).

### 3.2 NEW `legStatus` filter — this is the Failed Pickups view (brief 3.2)
```
GET /intake-user/pickable-orders?legStatus=failed
GET /intake-user/pickable-orders?legStatus=scheduled,pickup-in-progress
```
Pickup values: `pending · scheduled · pickup-in-progress · picked-up · failed`.
Delivery values: the delivery statuses, incl. `failed`.
An unknown value is **refused with 400** listing the valid ones (so a typo is not
silently ignored).
- **Action: build the "Failed pickups" tab from `failedCount` + `legStatus=failed`.**
  A failed pickup keeps its stage and its rider, so there is no other way to tell it
  apart from a healthy assigned run.

### 3.3 Rider's own lists — addresses normalised, landmark lifted out
`GET /rider/assigned-pickups` and `GET /rider/assigned-deliveries` now return the
same `{ data, pagination }` shape as before, but each row:
- has `pickupAddress`/`deliveryAddress` as a **structured object** (never a bare
  string any more), so `landmark` always exists;
- carries `pickupLandmark` / `deliveryLandmark` at the top of the row;
- carries `itemCount`.

### 3.4 Wash & Dry — the button that could never clear
`getWashQueue`, **`getActiveWash`** and **`getActiveDry`** all now return
`allItemsConfirmed`, `confirmedItemCount` and a new **`canMoveToDrying`**.
- **Action: key the station button on `canMoveToDrying`, not on `allItemsConfirmed`.**
  Active Wash never used to return these at all, so a shared card read `undefined` →
  falsy → a "Waiting for confirmation" state that could never clear (brief 1.3).

### 3.5 Holds — Active and Overdue no longer overlap (brief 4.4)
`activeHolds` + `overdueHolds` now **partition** the holds: no order is in both and
they sum to every order on hold. The per-row `holdMeta.slaBreached` now agrees with
the bucket the row is in (it used to be computed separately and could contradict it).
- "Expiring today" is a **different** measure (promised delivery date is today) and
  deliberately overlaps both — do not add the three cards together.

### 3.6 Wallet adjustment over the limit is a SUCCESS, not a failure
`POST /intake-user/adjust-wallet/{id}/{userId}`:
```json
{ "success": true, "data": { "message": {
  "requiresApproval": true, "requestId": "65b...", "status": "pending",
  "type": "credit", "amount": 10000, "roleLimit": 5000,
  "balance": 2500,                      // unchanged
  "message": "₦10,000 is above your ₦5,000 limit, so it has been sent to an admin to approve. Nothing has changed in the wallet yet." }}}
```
- **Action: show that message as information, not an error — and do not retry.**
  A retry stacks duplicate requests.
- Within the limit the response carries `requiresApproval: false`, the new `balance`,
  and the created ledger row under `transaction`.

### 3.7 Order pricing — general offers now appear in the breakdown
`pricing.appliedOffers[].type` can now be **`baseline`** as well as `personal` /
`promotion`, so a summary that shows "Pickup: Free" can name the offer responsible.
General/baseline offers were previously skipped at booking entirely (fees were
charged anyway) — brief 2.2.

### 3.8 Per-item care tier (brief 1.6)
`pricing` gained `tierLines[]`, `tiersUsed[]`, `isMixedTier`, and `tierMultiplier` is
**`null` when tiers are mixed** (no single multiplier describes the order). Item
briefs carry `serviceTier` (null = follows the order's tier).

### 3.9 Errors now carry `field` where there is one
Several 400s add `field` (e.g. `pickupAddress.landmark`, `channels`, `body`) so you
can focus the offending input instead of showing a generic toast.

---

## 4. STILL FE-ONLY FROM THE BRIEF (nothing shipped from us)

| # | Item |
|---|---|
| 1.4 part 3 | **A failing button must always show a message.** The backend already returns `{success:false, data:{error}}` with a readable sentence. This one sits behind several "nothing happens" reports — it is the highest-value FE fix in the brief. |
| 1.7 | Tag text weight / boldness (rendering) |
| 1.8 | Refresh button pressed/loading state |
| 1.5 part 4 | Relabel "White fabric type" → "Fabric type" (it applies to all colours) |
| 2.1 | Delete button + create/edit success states; **and the offers list must show drafts** or offer an Activate action — a new offer is created as `status: "draft"`, which is why created offers "disappeared" from a list filtered to active |

---

## 5. ONE-LINE SUMMARY OF BACKEND FIXES YOU DO NOT NEED TO DO ANYTHING FOR

- 1.1 / 1.2 Cards staying in a queue, "Accept all" doing nothing — a stale handoff
  was being left pending when a push skipped a station. Self-healing: the two stuck
  orders clear themselves on the next read, no migration.
- 1.4 Flag / Move to Hold — they worked; the refusal message was meaningless and now
  names the order and where it actually is.
- 2.1 Offers "not saving" — the save was never broken (see §4 above).
- 2.3 / 2.4 Wallet adjustments now always write a ledger line, with per-role limits.
- 2.5 "Cannot create plan" — the plan WAS being created; an activity-log write was
  failing after the save and being reported as the plan failing.
- 3.3 / 4.6 Landmarks surfaced everywhere; one stored phone format (a customer could
  previously become two profiles).
- 4.1 Template save returning 400 — it was a channels value sent as a string.
- 4.3 Admins are notified of every wallet adjustment and request.

---

## 6. NOT YET DEPLOYED

Everything above is on `feature/fix` and needs merging to `main` before you can test
it. Two earlier items (the wash-station fixes in 3.4, and the dispatch tag in 1.7)
are already on `main` as of 7 Oct.
