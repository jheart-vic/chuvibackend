# Backend changes for the frontend — 13 Oct 2026

Everything below is live on `main` (Render). Every endpoint answers in the usual envelope:
`{ success, data: { message } }` on success and `{ success: false, data: { error } }` on a refusal.
Show `data.error` as it comes. The backend writes those sentences for the customer.

**Swagger:** `/api-docs`. Each section names the **tag** (the group in the left-hand list), the
endpoint, and the **schema** (bottom of the page, under *Schemas*). The Swagger server URL already
ends in `/api`, so an endpoint listed as `/offers/booking-options` is
`https://…onrender.com/api/offers/booking-options`. "Try it out" always calls the deployed backend.

| § | What changed | You need to |
|---|---|---|
| 1 | Ready dates, speeds, daily floor limit (launch item 3) | Show `speeds` on the booking screen; update admin order settings |
| 2 | Urgent (Anytime): opening time, full-window price, Intake list (item 4) | Show the opening time and the full-day message; Urgent badge on the pickup lists |
| 3 | Google sign-up phone step: terms, referral code, phone (item 5) | Send two new fields; show two new errors |
| 4 | CRM schedule windows (F-55) | Nothing unless you let admins edit post-delivery windows |
| 5 | Swagger paths fixed | Nothing, unless you copied a URL from the old docs |

---

## 1. Ready dates, speeds and the daily floor limit (launch item 3)

The client's rules (binding):
- A ready date counts from the day **after** pickup. Tue–Sat count 1, Sun ½, Mon 0. The order is
  ready by **7:00 PM** on the day the count is reached.
- **Ready Today** (stored `same-day`) is offered only for a pickup **before 12:00**, and never on
  Sunday. The old "book before 10 AM" rule is gone.
- **Express** can be booked at any hour. The old "book before 2 PM" rule is gone.
- The floor takes **150 pieces a day**: Ready Today 30 and Express 50 inside it, Regular the rest.
  Sunday is half, Monday 0. Regular is never refused: a big order spreads over the next days and
  shows the later date.

### 1a. Booking screen: `speeds` (NEW)

- **Endpoint:** `POST /offers/booking-options`, tag **Offers**.
- **Schema:** `OfferBookingOptions` → `speeds[]` → `SpeedOption`.
- **Send** what the customer has chosen so far: `items` (or `itemCount` for Quick Booking),
  `pickupTiming`, `pickupWindowId`, `pickupDate` and, if typed, `pickupTime`.
- **Each `speeds[]` row:**

  | Field | Show it as |
  |---|---|
  | `label` | The speed's on-screen name |
  | `available` | `false` → grey the row out |
  | `readyText` | Under the pickup time: "Ready Wednesday 14 October, by 7:00 PM" |
  | `message` | On a greyed-out row: the reason, ready to show |
  | `movedFromText` | When set: "Ready Thursday instead of Wednesday" (Regular moved by the floor limit) |
  | `readyDate`, `movedFrom`, `unavailableReason` | Machine-readable. `unavailableReason` is `full`, `too-many-pieces`, `pickup-rule` or `not-available` |

- **Messages you will see:**
  - `Full today`
  - `Express is full for Wednesday. Choose Standard, or pick another pickup day.`
  - `Too many pieces for Express. Choose Standard, or call us on +234 707 325 4943.`

### 1b. Booking (`POST /bookOrder/create-book-order`, tag **BookOrder**)

- The order's `deliveryDate` and `deliveryPromise.text` now come from the rules above.
- If a speed fills between the screen and the tap, booking refuses with the same sentence as
  `message`. Show it and let the customer pick another speed.
- **More than 200 pieces** is refused with:
  `For more than 200 pieces, call or WhatsApp us on +234 707 325 4943 and we will plan it with you.`

### 1c. Urgent per date: `anytimeByDate` (NEW)

- **Endpoint:** `GET /bookOrder/booking-availability?leg=pickup`, tag **BookOrder**.
- **Schema:** `BookingAvailability` → `anytimeByDate[]`.
- There is one row per date, today first. Use the chosen date's row instead of the old single
  `anytime` object, which stays for older app builds. A closed day reads `Closed that day`.

### 1d. Admin → order settings (CHANGED)

- **Endpoints:** `GET /admin/order-management` and `PUT /admin/update-admin-setting`, tag **Admin**.
- **Removed:** `standardCapacity`, `sameDayCapacity`, `expressCapacity`, `standardDeliveryPeriod`.
  Booking never read them.
- **Added:**
  - `floorLimits`: `{ dailyPieces: 150, sameDayPieces: 30, expressPieces: 50 }`
  - `halfDays`: `["sun"]`
- Each limit must be a whole number, 0 or more, and neither share may be larger than
  `dailyPieces`. A blank field is refused, so send the number or leave the key out.

---

## 2. Urgent (Anytime) — agreed parts (launch item 4)

On screen it's "Urgent". The stored value is still `anytime`.

### 2a. "Urgent opens at 8:00 AM tomorrow" (NEW fields)

- **Endpoint:** `GET /bookOrder/booking-availability`, tag **BookOrder**.
- **Schema:** `BookingAvailability` → `anytime` and `anytimeByDate[]`.
- When `open` is `false`, grey Urgent out and show **`"Urgent opens at " + opensAtText`**.
  - `opensAtText` reads `8:00 AM today`, `8:00 AM tomorrow`, `8:00 AM Tuesday` or, further out,
    `8:00 AM Tuesday 27 October`.
  - `opensAt` is the same moment as a date-time.
- Both fields are on `anytime` (now) and on each closed `anytimeByDate[]` row.

### 2b. Every window full → Urgent at the window price, offer kept (NEW)

The client's rule: when every window on the chosen day is full, offer Urgent at the **window
price** with the customer's offer kept, plus the next day with an open window. This only applies
during Urgent hours, and **only for the pickup**.

- **Endpoint:** `GET /bookOrder/booking-availability?leg=pickup`.
- **Schema:** `BookingAvailability` → `anytimeByDate[]`.
- **New fields on each row:**

  | Field | Meaning |
  |---|---|
  | `windowsFull` | Every window still bookable that date is full |
  | `urgentAtWindowPrice` | `true` → this date's Urgent is charged the window price |
  | `fee` | The Urgent price for that date. When `urgentAtWindowPrice` is true, it is the WINDOW fee |
  | `message` | Show it as it comes: `Today's windows are full. Book Urgent at the window price, ₦500, and keep your offer. Or pick another day.` |
  | `nextOpenWindow` | `{ date, windowId, windowName }`: offer it as "or pick another day" |

- **Booking:** charges exactly this. Send `pickupTiming: "anytime"` as normal, and the backend
  applies the window price and keeps a free-pickup offer.
- **Quote** (`POST /offers/booking-options`): send `pickupDate` with `pickupTiming: "anytime"`.
  The quote then waives the pickup under a free-pickup offer, and the fees line reads "You get
  free pickup on this order". It no longer says "choose a time window" on a full day.
- **Same-day disclosure** (`sameDay.disclosure` on availability with `deliverySpeed=same-day`):
  on a full day it reads `Every pickup window that day is full, so your same-day pickup is an
  Urgent trip at the window price, with your offer kept. …` It is the same on `leg=pickup` and
  `leg=delivery`.
- On `leg=delivery` these fields are always `false`/`null`. Urgent delivery always costs the
  Urgent delivery price.

### 2c. Pickup lists: Urgent first, with a badge (NEW)

- **Intake:** `GET /intake-user/pickable-orders`, tag **Intake User**. Each row is a
  `DispatchQueueOrder`, which gains **`urgent`** (boolean).
- **Rider:** `GET /rider/assigned-pickups`, tag **Rider**. Each row gains **`urgent`**.
- Urgent rows come **first**, then oldest. Show an Urgent badge on them.
- An order counts as urgent only once it is **paid**, or straight away for a Quick Booking. So an
  abandoned card checkout never jumps the list.
- At the same moment, Intake and admin get an in-app notification titled
  **"Urgent pickup booked"**. It arrives through the normal notifications list; no screen change
  is needed.

---

## 3. Google / Apple sign-up phone step (launch item 5)

- **Endpoint:** `PATCH /users/complete-profile`, tag **Users**.
- **Schema:** `User` (new, under *Schemas*) for the returned user.

**Request body:**

```json
{ "phoneNumber": "0803 123 4567", "termsAccepted": true, "referralCode": "CHUVIADA7K2" }
```

- `phoneNumber`: any common format. It is stored as `08031234567`.
- `termsAccepted`: send `true` when the "I agree to the Terms and Conditions" box is ticked. The
  **app enforces the tick box**. The backend records `termsAccepted` and `termsAcceptedAt`, and
  doesn't refuse without them.
- `referralCode` (optional): pre-fill it from the `?ref=` in the sign-up link.

**Success:** `data.message` = `"Profile completed successfully"`, plus `data.data` (the `User`),
`data.accessToken` and `data.refreshToken`.

**New refusals** (`400`, nothing is saved). Show each under its field:

| When | `data.error` |
|---|---|
| The phone doesn't make an 11-digit Nigerian number | `Enter a valid phone number, e.g. 0803 123 4567.` |
| The code doesn't exist, is the customer's own, or isn't text | `That referral code doesn't exist. Check it, or leave it empty and add it later in Refer & Earn.` |

If the customer is already linked to a referrer (for example from the rep's link), that link stays,
and the phone step still succeeds.

**Email sign-up:** `POST /auth/register`, tag **AuthUser**. Please send `termsAccepted: true`
there too, so every customer's acceptance is recorded. It's optional, so the current form keeps
working. `referralCode` is now documented there too.

---

## 4. CRM schedule windows (F-55)

- **Endpoint:** `PUT /crm/settings`, tag **CRM**. **Schema:** `CrmScheduleStep` → `preferSlot`.
- Lead, "Registered, not booked" and reactivation steps now **honour** `preferSlot`. `morning`
  means the next 6–8 AM window, `evening` the next 6–8 PM one, and `any` whichever comes first.
- Post-delivery messages are order messages and go out straight away, so a post-delivery step with
  `morning`/`evening` is now **refused**:
  `Post-delivery messages go out straight away, not in a send window, so <message> can't be set to "morning". Use "any".`
  If your settings screen sends the steps back unchanged, nothing changes for you.

---

## 5. Swagger paths fixed (docs only)

Twelve endpoints were documented with an extra `/api` in front, so "Try it out" called
`/api/api/…`. The endpoints themselves never changed. Only the docs were wrong:

- **Admin:**
  - `/admin/display-names`
  - `/admin/order/{id}/payment-hold/waive`
  - `/admin/bank-check-list`
  - `/admin/booking-windows`
  - `/admin/booking-windows/{id}`
  - `/admin/working-days`
  - `/admin/window-deflections`
- **BookOrder:**
  - `/bookOrder/order/{id}/items`
  - `/bookOrder/booking-availability`
- **Intake User:**
  - `/intake-user/order/{id}/payment-hold`
  - `/intake-user/order/{id}/approve-transfer`
- **Users:** `/users/get-dashboard`. It was also listed as `/user/…`. The real path is `/users/…`.

---

## No screen change needed (for your information)

- **In-app assistant:** reads pickup days written as dates ("20 October", "the 20th", "Saturday
  24th"). If it can't read a day, it asks again. Its confirm summary shows the actual date, e.g.
  "Pickup: … Wednesday 14 October".
- **Subscriptions:** a customer who re-subscribes to the same plan with the same card now reuses
  their existing subscription record instead of getting a second one (bug fix). A change of plan or
  card is handled in the subscription rollover work.
