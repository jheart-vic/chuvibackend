# Backend changes for the frontend — subscription item rollover (feature 21), 14 Oct 2026

Swagger: /api-docs, tag **Subscription**, schema **Subscription**. Envelope as always:
{ success, data: { message } }; on a refusal { success: false, data: { error } } — show data.error as it comes.

## What changed for customers (the rules)
- Renewal: unused items carry over, up to HALF the plan (rounded down). 20 unused on a 25-item plan → 25 + 12 = 37.
  Still ONE balance: `remainingItems` already includes it. Free pickups/deliveries do not carry over.
- Cancel: the plan is NOT deleted any more. It stops renewing but stays usable until the end of the
  month the customer paid for (`currentPeriodEnd`), then ends with nothing carried.
- Renewal fails: bookings with the plan are blocked (as before). The customer gets an SMS at once and a
  day-5 reminder SMS. Subscribing again to the SAME plan within 7 days keeps the leftover items (up to half).
- Change plan ("Upgrade Plan"): cancel, then subscribe to the new plan. The new plan starts fresh; the old
  one is closed and switched off on Paystack automatically.

## 1. GET /subscription/current-subscription  (My Plan)
Now returns the plan the customer can USE: `active`, OR `cancelled` with `currentPeriodEnd` still ahead.
- `subscription.status` can now be `"cancelled"` → show "Cancelled — usable until <currentPeriodEnd>".
  Do not show a next billing date for a cancelled plan.
- New fields on `subscription`:
  - `currentPeriodEnd` (date-time): end of the paid month (moves on every renewal).
  - `rolledOverItems` (number): what the last renewal carried over (already inside `remainingItems`).
    Optional line: "Includes 12 items carried over from last month".
  - `failedAt` (date-time | null).
- NEW `renewalFailed` (object | null), sent when there is NO usable plan and the last renewal FAILED.
  Show it as a BANNER on My Plan:
    { "planId": "...", "failedAt": "...", "keepItemsBy": "...", "unusedItems": 12,
      "message": "Your plan renewal didn't go through. Subscribe again by Tuesday 17 November to keep your 12 unused items." }
  - Show `message` as it comes.
  - Banner button: open the NORMAL checkout for `planId` (the same plan).
  - After `keepItemsBy`, `unusedItems` is 0 and the message just says "Subscribe again to keep using your plan."

## 2. POST /subscription/cancel-subscription
- Success reply changed: `data.message` = "Your plan is cancelled. You can keep using your items until Saturday 14 November."
  and NEW `data.currentPeriodEnd` (date-time). Keep showing the plan as usable until that date.
- A plan whose renewal FAILED can now be cancelled too (it stops Paystack retrying the card).
  Reply: "Your plan is stopped, because the last renewal payment didn't go through. To keep your leftover
  items, subscribe to the same plan again by <date>." and `data.currentPeriodEnd` = null.
- Second cancel: "You have already cancelled your subscription" (unchanged).

## 3. Booking with the plan (billingType pay-from-subscription)
- A cancelled plan still books normally until `currentPeriodEnd`.
- A failed or expired plan is refused with `data.error` = "Subscription is not active"
  (no plan at all: "No active subscription found for user").
- booking-options and the dashboard read the same "usable plan" rule.

## 4. Subscribe / Upgrade Plan
- Unchanged endpoint and checkout. Starting a new plan is still refused while a plan is ACTIVE
  ("cancel first"), but allowed while it is cancelled or failed — that is the "Upgrade Plan" path.
- After the new payment succeeds the backend closes the old plan itself. No extra call needed.

## 5. Dashboard (GET /users/get-dashboard)
- `subscription` follows the same usable-plan rule. For a cancelled plan, read `status` and show
  "usable until currentPeriodEnd" instead of a billing date.

## No screen change needed (FYI)
- SMS to customers: renewal failed (at once) and "2 days left" (day 5). No dashes, no amounts.
- Nightly job keeps Paystack in sync and retries switching off replaced plans.
- Admin "active subscribers" counts keep counting status "active" only (a cancelled-but-paid plan is not counted).
