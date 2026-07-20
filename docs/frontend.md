# Chuvi Backend — Frontend Integration Guide

Covers the systems added in this build: Wallet & Credit, Communication,
Offer System, Feedback & Recovery, Referral (+ advocacy Levels), and the
In-app Bot (+ WebSockets). For the exact, always-current request/response
schema of every endpoint, open **Swagger UI at `/api-docs`** — this guide is
the orientation layer on top of it.

────────────────────────────────────────────────────────────────────────
## 1. Global conventions

- Base URL: `<host>/api`  (e.g. https://api.chuvilaundry.com/api)
- Auth: JWT. Send it either as an httpOnly cookie `accessToken`, OR as
  `Authorization: Bearer <token>`. All customer endpoints below require it.
- Every response uses one envelope:
      success:  { "success": true,  "data": <payload> }
      failure:  { "success": false, "data": { "error": "message" } }
  In Swagger the success payload is shown under the `message` key, i.e. the
  actual body is { "success": true, "data": { ...the documented shape... } }.
  ⇒ In code: read `res.data` for success, `res.data.error` for failure.
- HTTP status: 200 on success, 400 on handled/validation failure, 401 auth,
  403 wrong role, 5xx unexpected.
- Money is in Naira (NGN), integers (e.g. 5000 = ₦5,000).
- Roles: customer (default), plus staff roles incl. `customer-experience`
  (CX officer) and `admin`. Staff endpoints are marked below.

────────────────────────────────────────────────────────────────────────
## 2. Wallet & Credit — /api/wallet

TWO SEPARATE LEDGERS live in the wallet:
  1. CASH  — real money (topped up via Paystack). Field: `balance` (a.k.a.
     `cashBalance`, same value). Only cash ops (top-up / pay) move it.
  2. CREDIT — reward "credit" sub-balances (referral / recovery / promotional /
     laundry). Service value, never withdrawable as cash, expire, and are spent
     BEFORE cash at checkout. Summed as `creditTotal`.
`totalAvailable` = balance + creditTotal.

- GET  /api/wallet/wallet-balance          → COMPACT summary (for a header/badge)
      { balance, cashBalance, creditTotal, totalAvailable, creditsByType, expiringSoon }
- GET  /api/wallet/wallet-credits          → FULL wallet page (same summary PLUS lists)
      { balance, cashBalance, creditTotal, totalAvailable, creditsByType, expiringSoon,
        credits:[ ...every active credit... ], transactions:[...], pagination }
      ⇒ Use /wallet-balance for a quick total; /wallet-credits for the wallet screen.
      (Both expose the cash value under BOTH `balance` and `cashBalance`.)
- POST /api/wallet/wallet-top-up           → start a Paystack top-up (moves CASH)
- POST /api/wallet/pay-with-wallet         → pay an order (spends credit then cash)
- GET  /api/wallet/fetch-user-transactions → wallet transaction history

Credit object (shape): { _id, type: "referral"|"recovery"|"promotional"|"laundry",
  amount, remaining, status: "active"|"exhausted"|"expired"|"reversed",
  expiresAt, note }

Admin only:
- GET  /api/wallet/admin/credits?userId=<id>    → list a customer's active credits
      (each with its creditId — needed for the "remove" adjustment below)
- POST /api/wallet/admin/adjust-credit         → add/remove a reward CREDIT (NOT cash)
      body: { userId, amount, direction:"add"|"remove", reason, type?, creditId? }
      NOTE: this changes creditTotal / totalAvailable, NOT the cash `balance`
      — cash is never hand-edited (it only moves via Paystack top-up / payment).

NOTE: to reverse the credits an order consumed, CANCEL the order instead
(POST /api/bookOrder/book-order/:id/cancel or the staff-cancel below). Cancelling
reverses credits AND refunds cash AND releases the offer — the old
/wallet/admin/reverse-order-credits endpoint has been removed.

────────────────────────────────────────────────────────────────────────
## 3. Communication layer — /api/communication  (mostly admin)

One delivery pipe (in-app notification + SMS) with admin-managed templates and
a delivery log. Customers don't call this directly — they receive in-app
notifications (see /api/notifications) that carry deep links.

- Notifications the customer reads: GET /api/notifications ,
  GET /api/notifications/:id  (auto-marks read).
  Notification carries { title, body, type, page, recordId, isRead } — use
  `page` + `recordId` to deep-link (e.g. page:"wallet", page:"offers",
  page:"complaint", page:"referral").
- Admin only: GET/POST/PUT /api/communication/templates ,
  GET /api/communication/logs , POST /api/communication/retry-failed.

────────────────────────────────────────────────────────────────────────
## 4. Offer System — /api/offers

Offers are built once by staff; the system links them to a customer on events.
The customer sees "Your Rewards" (personal offers attached to them) and
"Current Promotions", validates/attaches an offer at booking, and the discount
applies when the order completes.

Customer:
- GET  /api/offers/my-offers            → { rewards:[...], promos:[...] }
- GET  /api/offers/my-offers/:id/view   → one linked offer detail
- POST /api/offers/validate             → price an order with an offer applied
        body: { offerId, orderDraft }   → returns a quote (savings, final total)
- POST /api/offers/attach               → attach a chosen offer to a booking
        body: { offerId, orderId }

Admin (Offer Builder): GET/POST/PUT/DELETE /api/offers ,
  GET /api/offers/:id/performance , POST /api/offers/assign ,
  POST /api/offers/customer-offers/:id/cancel.

Offer benefit types: order-discount, free-pickup, free-delivery, free-items,
extra-laundry-credit. Stacking rule: baseline always applies; max ONE personal
offer per order; promos don't combine with personal offers unless flagged.

────────────────────────────────────────────────────────────────────────
## 5. Feedback & Recovery — /api/feedback (customer) + /api/recovery (CX/admin)

After delivery the customer leaves feedback; a "complaint" type opens a case
with a status machine and an in-app complaint chat. Recovery credit and offers
compensate the customer (approval-gated on the staff side).

Customer (/api/feedback):
- GET  /api/feedback/complaint-types                 → list of complaint categories
- POST /api/feedback/                                → submit feedback for a delivered order
        body: { orderId, type:"satisfied"|"neutral"|"complaint", rating?, comment?,
                complaintTypeId? (if complaint) }
        returns: { feedback, complaint?, referralEligible }
- GET  /api/feedback/order/:orderId                  → my feedback for an order
- GET  /api/feedback/my-complaints                   → my complaint cases
- GET  /api/feedback/complaints/:id                  → one case (status, actions, timeline)
- POST /api/feedback/complaints/:id/confirm          → I'm satisfied → close case
- POST /api/feedback/complaints/:id/reject           → not resolved → reopen
- GET/POST /api/feedback/complaints/:id/messages     → complaint chat (list / send)

Complaint case status flow (read-only for FE, drive UI states):
  submitted → under-review → (awaiting-item → item-received) →
  recovery-in-progress → ready → resolved → customer-confirmed (closed)
  (or resolved → reopened → under-review)

Staff (/api/recovery, role customer-experience or admin): case queue,
transitions, recovery actions, credit request/approve/reject, escalate, chat,
complaint-type CRUD. See Swagger for the full set.

────────────────────────────────────────────────────────────────────────
## 6. Referral System (+ advocacy Levels) — /api/referral

Every customer has ONE permanent referral code + link. A referral is rewarded
when the referred friend completes their FIRST order. On top of that, customers
climb PERMANENT advocacy levels by lifetime successful referrals, which unlock a
higher reward %, exclusive offers, and a monthly free-laundry perk (the monthly
perk is granted only in months the customer meets that level's monthly target;
missing it just skips that month — the level itself is never lost).

- GET  /api/referral/me         → the full referral page (below)
- GET  /api/referral/history    → my referrals list
- POST /api/referral/apply-code → apply a code after signup
        body: { code }          → { applied: true, referralId }
- POST /api/referral/reset-code → (admin) reset a customer's code

GET /api/referral/me returns:
  {
    "referralCode": "CHUVIA1B2C3",
    "referralLink": "https://www.chuvilaundry.com/join?ref=CHUVIA1B2C3",
    "totalSuccessfulReferrals": 9,
    "pendingReferrals": 1,
    "totalRewardsEarned": 3200,
    "level": {
      "current": "ambassador",            // member | promoter | ambassador | champion
      "name": "Ambassador",
      "lifetimeReferrals": 9,
      "monthlyReferrals": 2,
      "rewardPercent": 10,
      "benefits": {
        "rewardPercent": 10,
        "exclusiveOffer": true,
        "monthlyFreeLaundry": 5000,       // ₦ value of this level's monthly perk
        "monthlyTarget": 3,               // referrals needed this month to get it
        "monthlyPerkActive": false        // true once monthlyReferrals >= monthlyTarget
      },
      "nextLevel": {                        // null when already Champion
        "key": "champion", "name": "Champion",
        "lifetimeTarget": 15, "referralsToGo": 6,
        "monthlyTarget": 5, "rewardPercent": 15
      },
      "progressPercent": 60                 // progress toward nextLevel (0..100)
    },
    "history": [
      { "referredName": "Ada Obi", "referralDate": "2026-07-01T...",
        "status": "rewarded", "rewardStatus": "granted", "rewardAmount": 700 }
    ]
  }

UI notes:
- Show `level.name` as a badge, a progress bar from `progressPercent`, and
  "`referralsToGo` more to reach `nextLevel.name`".
- Show the monthly perk as active/paused from `benefits.monthlyPerkActive`
  ("Refer `monthlyTarget - monthlyReferrals` more this month to unlock
   ₦`monthlyFreeLaundry` free laundry").
- Level up + monthly-perk grants also arrive as in-app notifications.

────────────────────────────────────────────────────────────────────────
## 7. In-app Bot (smart assistant) — /api/bot  + WebSockets

A hybrid assistant: an LLM understands what the customer means, then a fixed
workflow answers using the existing systems. It handles low-risk things itself
(order status, wallet balance, offers, referral/level, apply code, update phone
or pickup address, a GUIDED booking walkthrough) and HANDS OFF to a human
(Customer Experience) for anything sensitive — refunds, compensation, resolving
complaints, record changes. The bot never books an order, moves money, or
resolves a case; those only happen with a human.

### 7a. Customer REST endpoints
- POST /api/bot/message
      body: { text: "where are my clothes?" }
      returns:
      {
        "conversationId": "665f...900",
        "mode": "bot",                     // "bot" or "human"
        "handledBy": "bot",                // "bot" | "handoff" | "human"
        "intent": "order-status",
        "replies": [
          { "_id": "...", "senderType": "bot",
            "text": "Order OSC-1042: out for delivery\nEstimated delivery: Mon Jul 20 2026",
            "createdAt": "..." }
        ]
      }
      Notes:
      • `handledBy: "handoff"` → the bot just connected them to a human; from
        now the bot is silent and staff reply.
      • `handledBy: "human"` with empty `replies` → already with a human;
        the message was delivered to staff, no bot reply.
      • Replies may contain multiple messages and use "\n" line breaks. Basic
        markdown-ish emphasis (*word*) may appear — render plainly if unsure.

- GET  /api/bot/conversation?page=1&limit=50
      returns { conversation: {_id, mode, open, unreadForCustomer, lastMessageAt},
                data: [ ChatMessage... ], pagination: {total,page,limit,pages} }
      (also marks the thread read for the customer)
      ChatMessage: { _id, conversationId, senderType:"customer"|"bot"|"staff"|"system",
                     text, attachments:[], createdAt }

- POST /api/bot/handoff        → force "talk to a human" (mode becomes "human")
      returns { conversationId, mode:"human" }

### 7b. Staff endpoints (role customer-experience / admin)
- GET  /api/bot/queue                     → handed-off chats waiting on staff
      [ { _id, customer, phoneNumber, unreadForStaff, lastMessageAt } ]
- POST /api/bot/:conversationId/reply     → staff sends a message  body:{ text }
- POST /api/bot/:conversationId/close     → close a resolved chat

### 7c. Real-time (WebSockets, socket.io)
Connect socket.io to the SAME host. Authenticate on the handshake with the JWT:

      import { io } from "socket.io-client";
      const socket = io(HOST, { auth: { token: accessToken } });
      // (or rely on the accessToken cookie; Authorization header also accepted)

      socket.on("connect", () => { /* connected */ });
      socket.on("chat:message", (payload) => {
        // payload = { conversationId, mode, message: <ChatMessage> }
        // append payload.message to the open thread; update mode if changed
      });

- Customers automatically join their own room and receive `chat:message`
  events for their support conversation (bot replies, staff replies, system
  notices, and their own echoed messages).
- Staff (CX/admin) also receive `chat:message` for every support conversation
  (drive a live queue / inbox).
- WebSockets are a push layer only — REST is the source of truth. If a socket
  drops, refetch GET /api/bot/conversation. You can send messages over REST
  (POST /api/bot/message) and just listen on the socket for pushes.

### 7d. Suggested chat UX
1. On open: GET /api/bot/conversation to load history + current `mode`.
2. Open the socket; listen for `chat:message`.
3. Send via POST /api/bot/message; render the returned `replies` immediately
   (they'll also arrive on the socket — dedupe by message `_id`).
4. If `mode === "human"` (or handledBy became "handoff"), show a "You're with
   our team" banner and hide the bot-typing affordance.

### 7e. Config note (backend)
The LLM classifier uses `ANTHROPIC_API_KEY` on the server. If it's unset, the
bot still works via a keyword fallback (slightly less flexible phrasing). No
frontend impact either way — same request/response contract.

────────────────────────────────────────────────────────────────────────
## 8. Where to get exact schemas
Open **`/api-docs`** (Swagger UI). Every route above has request bodies,
response shapes with realistic examples, and enums spelled out. This guide is
the map; Swagger is the source of truth.
