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
- Admin only: GET /api/communication/templates , POST /api/communication/templates ,
  PUT /api/communication/templates/{id} (id in path) ,
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

### 7a. Two threads (important)
A customer can have TWO open support threads at once, shown as separate tabs:
  • "Assistant"     — the bot thread (mode "bot"), always self-service
  • "Support agent" — a handed-off thread (mode "human"), a live agent replies
When a chat is handed off it becomes the human thread; the customer's next
message to the bot starts a FRESH bot thread alongside it. So the assistant is
never unavailable. At most one open bot thread + one open human thread.

### 7b. Customer REST endpoints
- GET  /api/bot/conversations
      List my open support threads (drives the tabs + unread badges).
      → [ { _id, mode:"bot"|"human", open, unreadForCustomer, lastMessageAt } ]
      Does NOT mark read. Closed threads are not returned.

- GET  /api/bot/conversation?conversationId=<id>&page=1&limit=50
      Load a thread + messages (marks THAT thread read for the customer).
      • omit conversationId → gets/creates the bot thread
      • pass conversationId → opens a specific owned thread (e.g. the human one)
      → { conversation: {_id, mode, open, unreadForCustomer, lastMessageAt},
          data: [ ChatMessage... ], pagination: {total,page,limit,pages} }
      ChatMessage: { _id, conversationId,
                     senderType:"customer"|"bot"|"staff"|"system",
                     text, attachments:[], createdAt }

- POST /api/bot/message                    (Assistant tab — bot thread only)
      body: { text: "where are my clothes?", attachments?: ["<imageUrl>"] }
      → { conversationId, mode:"bot"|"human",
          handledBy:"bot"|"handoff"|"human",
          intent:"order-status",           // see notes on compound intents
          replies:[ { _id, senderType, text, createdAt } ] }
      Notes:
      • Always targets the BOT thread (never the human one).
      • `handledBy:"handoff"` → the bot just connected them to a human; bot then
        stays silent and staff reply.
      • Compound requests ("my balance and order status") return ONE combined
        reply and `intent` may be a joined string like "wallet-balance+order-status".
        Render the whole `replies` array; don't hard-switch on exact `intent`.
      • A delayed/overdue order reply may end with "…connect you to a Customer
        Experience officer?" — a "yes" next turn hands off.
      • Text uses "\n" line breaks and may include *emphasis* / emoji — render
        plainly if unsure.

- POST /api/bot/conversation/:conversationId/message   (reply into a specific thread)
      Use for the "Support agent" (human) tab so the customer can reply to the agent.
      body: { text, attachments?:[] }
      • human thread → posts the message, bot stays silent (handledBy:"human")
      • bot thread   → routed to the assistant (same as POST /bot/message)
      • closed thread → 400 "This conversation is closed" (treat as closed → switch
        to Assistant)

- POST /api/bot/handoff        → force "talk to a human" (mode becomes "human")
      Idempotent — reuses an existing open human thread instead of duplicating.
      → { conversationId, mode:"human" }

### 7c. Staff endpoints (role customer-experience / admin)
- GET  /api/bot/queue                     → handed-off chats waiting on staff
      [ { _id, customer, phoneNumber, unreadForStaff, lastMessageAt,
          lastMessage: { senderType, text, attachments, createdAt } | null } ]
      lastMessage = preview of the newest message (survives refresh, no client cache).
- GET  /api/bot/:conversationId/messages  → staff view of one chat + history
- POST /api/bot/:conversationId/reply     → staff sends a message  body:{ text, attachments? }
      The FIRST staff reply posts a one-time system message to the customer:
      "You're now connected to our Customer Experience team."
- POST /api/bot/:conversationId/close     → close a resolved chat  body:{ reason? }
      → { closed:true, alreadyClosed:boolean, conversationId, closedAt }
      Only CX/admin can close (never the bot or customer; no auto-close). Idempotent
      (a second close → alreadyClosed:true, no dupes). Posts a "chat closed" system
      message and emits `conversation:closed` (below). History is retained; the
      customer's next message starts a fresh bot thread.

### 7d. Real-time (WebSockets, socket.io)
Connect socket.io to the SAME host, authenticate on the handshake with the JWT:

      import { io } from "socket.io-client";
      const socket = io(HOST, { auth: { token: accessToken } });
      // (or rely on the accessToken cookie; Authorization header also accepted)

Rooms are auto-joined on connect: every user joins `user:<theirId>`; staff
(CX/admin) also join `staff:support`. No manual join. Events:

      socket.on("chat:message", (p) => {
        // p = { conversationId, mode, message: <ChatMessage> }
        // append p.message to that thread; dedupe by message._id
      });

      socket.on("conversation:closed", (p) => {
        // p = { conversationId, closedAt, source }
        // source: "staff" (today). Reserved: "inactivity" if auto-close ever ships.
        // → show "chat closed", disable that thread's input, flip to Assistant tab;
        //   staff: drop it from the queue.
      });

- `chat:message` fires for bot replies, staff replies, system notices, and the
  customer's own echoed messages. Customers get it for their threads; staff get
  it for every support conversation.
- `conversation:closed` fires to the owner (`user:<id>`) and `staff:support`.
- WebSockets are a PUSH layer only — REST is the source of truth. If the socket
  drops, refetch. The "chat closed" / "connected" / handoff notices are also
  persisted as system messages, so they appear on the next GET even without the
  socket. Prefer the persisted system message as the transcript source; use the
  socket event as the live UI SIGNAL — that way you never double-render or drift.

### 7e. Suggested chat UX
1. On open: GET /api/bot/conversations → render a tab per thread (bot→"Assistant",
   human→"Support agent"; badge = unreadForCustomer).
2. Open a tab: GET /api/bot/conversation[?conversationId=] → history (badge clears).
3. Open the socket; listen for `chat:message` + `conversation:closed`.
4. Send: Assistant tab → POST /api/bot/message; Support-agent tab → POST
   /api/bot/conversation/<id>/message. Render returned messages immediately;
   they also arrive on the socket — dedupe by `_id`.
5. On `conversation:closed` for the open thread: banner + disable input, flip back
   to Assistant. The customer's next message auto-starts a new bot thread.

### 7f. Config note (backend)
The LLM is provider-configurable server-side (`BOT_PROVIDER`; OpenAI preferred,
Anthropic supported). If no key is set it falls back to a keyword matcher (slightly
less flexible phrasing). No frontend impact either way — same request/response
contract; only the naturalness of small-talk/greeting replies changes.

────────────────────────────────────────────────────────────────────────
## 8. Where to get exact schemas
Open **`/api-docs`** (Swagger UI). Every route above has request bodies,
response shapes with realistic examples, and enums spelled out. This guide is
the map; Swagger is the source of truth.
