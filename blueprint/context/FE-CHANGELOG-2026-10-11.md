# Backend changes for the frontend — 11 Oct 2026

Three launch fixes. Section 1 explains why S1 booking fails today and what the screen must send.
Section 3 is Quick Booking (nothing paid at booking) plus the payment changes that came with it.

---

## 1. S1 booking: `paymentMethod` is REQUIRED (correction to the 8 Oct note)

**The 8 Oct note was wrong.** It said `paymentMethod` on
`POST /api/intake-user/create-book-order` was optional and defaulted to cash. On the same day
the client ruled it **mandatory, with Cash pre-selected on the screen**, and the backend has
required it since. A request without it is refused, which is why every S1 booking fails.

**What the S1 booking screen must do:**

- Show the payment choice with **Cash pre-selected**.
- Always send `paymentMethod`, one of: `cash` · `pos` · `bank-transfer` · `wallet`.
  (`transfer`, `bank transfer` and `card` are also accepted, in any capitalisation.)
- With `wallet`: if the wallet cannot cover the bill, the backend answers with the amounts
  ("The wallet covers ₦500 of this ₦2,100 order. Choose how the remaining ₦1,600 is
  paid…"). Let staff pick cash, POS or transfer and resend with `secondaryPaymentMethod`.
- `useCredit: true` only when the customer agrees to spend their reward credit.

**The refusals** (`400`, no order is created, no money moves). Show `data.error` as it comes:

| When | `data.error` |
|---|---|
| no `paymentMethod` | `Choose how the customer paid: cash, POS, bank transfer or wallet.` |
| a value we don't accept | `"<value>" is not a counter payment method. Pick one of: cash, POS, bank transfer, wallet.` |
| `wallet` on a walk-in with no account | `This order has no customer account on file, so there is no wallet to charge. …` |
| `wallet` is short and no `secondaryPaymentMethod` | `The wallet covers ₦X of this ₦Y order. Choose how the remaining ₦Z is paid …` |

The first message used to read `paymentMethod is required`.

---

## 2. Booking screen data (customer app)

- **New `GET /api/bookOrder/booking-context`** (customer login). Everything on the booking
  screen that doesn't depend on the basket, under `data.message`:
  - `displayNames.deliverySpeeds / serviceTypes / serviceTiers`: arrays of
    `{ value, label, renamed }`. Show `label`, send `value`. This is how renamed speeds
    ("Ready Today", "Regular") reach the customer.
  - `wallet.balance`, `wallet.rewardCredit`
  - `plan` (or `null`): `itemsLeft`, `monthlyItems`, `freePickupDeliveriesLeftThisWeek`,
    `freePickupDeliveriesPerWeek`, `weekResetsAt`
  - `suggestedPayment`: `"pay-from-subscription"` when the plan has items left. Preselect
    "My plan" from it.
  - `lastOrderChoices` (or `null`): `serviceType`, `serviceTier`, `deliverySpeed`,
    `pickupTiming`, `pickupWindowId`, `pickupAddress`
  - `welcomeOffer`: `{ active, name, endsAt }`
  - `canEnterReferralCode`: hide the code box when `false`
- **My Plan (dashboard):** `subscription.freePickupDeliveriesLeftThisWeek` and
  `subscription.freePickupDeliveriesPerWeek` ("Free pickups left this week: 1 of 2").
- **`POST /api/offers/booking-options`:** send `pickupTiming` / `deliveryTiming` in the draft.
  The response gains `feesLine: { type, amount, message }`. Show `message` as it comes. Types:
  `welcome-offer`, `window-only`, `free-reached`, `free-gap`, or `null`.
  - `feesLine` counts only offers on the bill, so send `customerOfferId` / `promoOfferId`
    once the customer picks one. Without that, the Welcome line won't show
    (`checkoutPrompt` covers that case).
- **Referral code after the first order** is refused: "Referral codes can only be added
  before your first order." This applies in the app and in the assistant.
- **Behaviour change:** an Anytime pickup or delivery no longer gets free trips from an
  offer. Free pickup and delivery are for window bookings only (client ruling, 8 Oct).

---

## 3. Quick Booking: nothing paid at booking (and payment changes)

**Quick Booking (number of pieces, no item list)**

- `POST /api/bookOrder` for a Quick Booking now charges **nothing**: the order is saved
  with `amount: 0`, unpaid, and the response carries **`paymentRequired: false`**. Show no
  payment step. After Intake counts the clothes, the customer gets the bill by SMS (pickup
  and delivery included, and any free-trip offer is applied then).
- `POST /api/offers/booking-options` with `itemCount` (no `items`) returns one fees line:
  `feesLine.type: "quick-booking"`. Show its `message` as it comes.
- The line under the number box (client's wording): "Between 1 and 200. You pay nothing
  now. After we count your clothes, we send your bill by SMS, with pickup and delivery
  included."
- An uncounted Quick Booking can't be paid yet. Wallet, card and the assistant refuse it
  until Intake has counted.

**Booking rules (all bookings)**

- Items are priced from our price list. An item that isn't on it is refused, and so is an
  unknown service type.
- Each item keeps only `type`, `quantity`, `serviceTier` and `fromSet`. Any other field
  sent on an item, or on the order (`amount`, `paymentStatus`, `userId` …), is ignored.
- `quantity` must be a whole number, 1 or more. A booking can have at most **200 pieces**.
- **Plan bookings count pieces:** 3 shirts use 3 plan items (before, 1 line used 1).

**Part-paid orders**

- If Intake's count raises the bill of an order that was already paid, the order goes
  back to **unpaid** and carries **`balanceDue`**: only the difference is owed. Show
  `balanceDue` as the amount to pay when it is set. Card, wallet and the assistant
  collect only that amount.

**Wallet top-up:** the minimum is **₦100**.

**Subscriptions**

- **`POST /api/subscription/subscribe-plan` is switched off.** It always answers `400`
  with "Please subscribe to a plan through checkout." Plans start only through
  `POST /api/user/initialize-payment` with `transactionType: "subscription"` and `planId`,
  which the app already uses.

**Two new in-app notifications** (`type: "payment-update"`):

| Title | When |
|---|---|
| Payment not completed | A card payment failed. The body names what failed and the amount, and asks the customer to try again or pick another method. `subBody` is "Reference …". The customer is also emailed. |
| Plan renewal payment received | Paystack took a plan renewal we couldn't apply automatically. Our team is fixing it by hand; the body says the plan will be updated shortly. |
