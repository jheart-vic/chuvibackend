const express = require('express')
const router = express.Router()
const HandoffController = require('../controllers/handoff.controller')
const multiAuth = require('../middlewares/multiAuth')
const { ROLE } = require('../util/constants')
const {
    ROUTE_HANDOFFS_PENDING,
    ROUTE_ORDER_HANDOFF,
    ROUTE_ORDER_HANDOFF_CONFIRM,
    ROUTE_ORDER_SPLIT_STATE,
    ROUTE_ORDER_ITEM_DAMAGE,
    ROUTE_ORDER_ITEM_CUSTOMER_INFORMED,
    ROUTE_ORDER_PARTIAL_DELIVERY,
    ROUTE_ORDER_ITEM_LOOKS_DIRTY,
    ROUTE_ORDER_ITEM_LOOKS_DIRTY_DECLINE,
    ROUTE_ORDER_ITEM_UPGRADE_SERVICE,
    ROUTE_LOOKS_DIRTY_LIST,
} = require('../util/page-route')
const FloorCaseController = require('../controllers/floorCase.controller')

// Station operators (+ admin) drive the production split-flow.
const stationAuth = multiAuth(
    ROLE.ADMIN,
    ROLE.INTAKE_AND_TAG,
    ROLE.SORT_AND_PRETREAT,
    ROLE.WASH_AND_DRY,
    ROLE.PRESS,
    ROLE.QC,
)
// V1 batch 3 part 2 (R6): damage is reported at S2, S3 or S4; customer care
// (and admin) mark Customer informed and approve partial delivery.
const damageAuth = multiAuth(ROLE.ADMIN, ROLE.SORT_AND_PRETREAT, ROLE.WASH_AND_DRY, ROLE.PRESS)
const careAuth = multiAuth(ROLE.ADMIN, ROLE.CUSTOMER_EXPERIENCE)
// R8: S2 suggests; S1 answers for the customer; S1, S2 and customer care see the list.
const s2Auth = multiAuth(ROLE.ADMIN, ROLE.SORT_AND_PRETREAT)
const s1Auth = multiAuth(ROLE.ADMIN, ROLE.INTAKE_AND_TAG)
const looksDirtyListAuth = multiAuth(ROLE.ADMIN, ROLE.INTAKE_AND_TAG, ROLE.SORT_AND_PRETREAT, ROLE.CUSTOMER_EXPERIENCE)

/**
 * @swagger
 * /orders/handoffs/pending:
 *   get:
 *     summary: Inbound handoff queue
 *     tags: [Split-Flow]
 *     description: "Pending handoffs waiting to be confirmed by a receiving station. Optionally filter to one station with ?toStation=. Sorted oldest-first."
 *     parameters:
 *       - in: query
 *         name: toStation
 *         required: false
 *         schema:
 *           type: string
 *           enum: [intake-and-tag-station, sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *         description: Only return handoffs bound for this station.
 *     responses:
 *       200:
 *         description: Pending handoffs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PendingHandoff' }
 */
router.get(ROUTE_HANDOFFS_PENDING, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.pendingQueue(req, res)
})

/**
 * @swagger
 * /orders/{id}/handoff:
 *   post:
 *     summary: Push items to the next station
 *     tags: [Split-Flow]
 *     description: "Push completed items from one station to the next, creating a PENDING handoff (items advance only once the receiving station confirms). Gates: S1→S2 (intake→sort) and S4→S5 (press→qc) must move the WHOLE order; the stretch zone S2↔S3↔S4 allows partial pushes. Every pushed item must be completed at the source station. Omit itemIds to push all completed items at the source station. A repeat push for the same from→to merges into the existing pending handoff."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromStation, toStation]
 *             properties:
 *               fromStation:
 *                 type: string
 *                 enum: [intake-and-tag-station, sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *                 example: sort-and-pretreat-station
 *               toStation:
 *                 type: string
 *                 enum: [sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *                 example: wash-and-dry-station
 *               itemIds:
 *                 type: array
 *                 description: Specific item ids to push. Omit to push all completed items at the source station.
 *                 items: { type: string }
 *               note: { type: string, example: "" }
 *     responses:
 *       200:
 *         description: Handoff created (pending)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/Handoff' }
 *       400:
 *         description: "Gate/completion violation or invalid stations. V1 batch 3: a whole-order move that is short names each missing piece and where it is."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 data:
 *                   type: object
 *                   properties:
 *                     error: { type: string, example: "The whole order must be here before it can move on. Missing: TAG 03 is at Wash & Dry." }
 *                     missingPieces: { type: string, example: "TAG 03 is at Wash & Dry", description: "Only on the whole-order refusal: each missing piece and its station (up to 5, then and N more)." }
 */
router.post(ROUTE_ORDER_HANDOFF, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.push(req, res)
})

/**
 * @swagger
 * /orders/{id}/handoff/{hid}/confirm:
 *   post:
 *     summary: Confirm a received handoff
 *     tags: [Split-Flow]
 *     description: "The receiving station confirms a pending handoff. Accepted items advance to the toStation; any rejectedItems[] are placed on Hold (assigned back to the source station) and stay put. The order's stage.status is recomputed as the least-advanced station any item now sits at. HARD GATES: on the whole-order transitions (S1 intake→sort and S4 press→QC) a PARTIAL confirm is refused — rejectedItems must be empty (accept every item) or list every item in the handoff (send the whole order back). Nothing partial may reach QC. Partial confirms are allowed only in the stretch zone (S2↔S3↔S4)."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *       - in: path
 *         name: hid
 *         required: true
 *         schema: { type: string }
 *         description: Handoff ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectedItems:
 *                 type: array
 *                 description: "Subset of the handoff's item ids to reject to Hold. On a whole-order gate (intake→sort, press→QC) only two values are accepted: omitted/empty, or every item id in the handoff — a partial rejection is refused with 400."
 *                 items: { type: string }
 *               note: { type: string, example: "2 items still wet", description: "The reason. Required when rejectedItems is not empty (V1 batch 1, R5)." }
 *     responses:
 *       200:
 *         description: Handoff confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         handoffId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1a0 }
 *                         status: { type: string, enum: [confirmed, rejected], example: confirmed }
 *                         confirmedCount: { type: number, example: 3 }
 *                         rejectedItemIds: { type: array, items: { type: string } }
 *                         stageStatus: { type: string, example: washing }
 *                         stationStatus: { type: string, example: wash-and-dry-station }
 *       400:
 *         description: "Already confirmed or invalid rejectedItems. V1 batch 3: a whole-order move that is short names each missing piece and where it is."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 data:
 *                   type: object
 *                   properties:
 *                     error: { type: string, example: "The whole order must be here before it can move on. Missing: TAG 03 is at Wash & Dry." }
 *                     missingPieces: { type: string, example: "TAG 03 is at Wash & Dry", description: "Only on the whole-order refusal: each missing piece and its station (up to 5, then and N more)." }
 */
router.post(ROUTE_ORDER_HANDOFF_CONFIRM, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.confirm(req, res)
})

/**
 * @swagger
 * /orders/{id}/split-state:
 *   get:
 *     summary: Per-station breakdown of an order
 *     tags: [Split-Flow]
 *     description: "Where every item in the order currently sits, counts per station, and any pending handoffs."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Split state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/OrderSplitState' }
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ORDER_SPLIT_STATE, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.splitState(req, res)
})

/**
 * @swagger
 * /orders/{id}/items/{itemId}/damage:
 *   post:
 *     summary: Report problem — Damaged (holds the piece, opens a damage case)
 *     description: >
 *       V1 batch 3 part 2, R6, switch damageCase. At Sort and Pretreat, Wash and Dry or Press (the station holding
 *       the piece, or admin). Holds THAT piece (holdDetails.reason "damaged", assignTo admin, tagState damaged); the
 *       rest of the order moves on. Opens a customer care task "Damage case: call the customer" (type damage), with
 *       admin copied. QC cannot receive the order while the piece is held (R3). Admin can release it only after
 *       customer care marks Customer informed. Switch off → refused with switchOff true (use a normal hold).
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note: { type: string, example: "machine tore the hem" }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         held: { type: boolean, example: true }
 *                         itemId: { type: string }
 *                         tagId: { type: string, example: "TAG 02" }
 *                         damageCase:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [open, customer-informed, released] }
 *                             note: { type: string, example: "machine tore the hem" }
 *                             station: { type: string, example: wash-and-dry-station }
 *                             openedAt: { type: string, format: date-time }
 *                             openedByName: { type: string, example: "Wale" }
 *                             customerInformedAt: { type: string, format: date-time, nullable: true }
 *                             customerInformedByName: { type: string, nullable: true, example: "Chioma" }
 *       400:
 *         description: Switch off (switchOff true), no note, piece not at S2/S3/S4, another station, or already held
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_ITEM_DAMAGE, [damageAuth], (req, res) => new FloorCaseController().reportDamage(req, res))

/**
 * @swagger
 * /orders/{id}/items/{itemId}/customer-informed:
 *   post:
 *     summary: Customer care marks "Customer informed" on a damaged piece
 *     description: >
 *       V1 batch 3 part 2, R6. Customer care or admin, after talking to the customer. Closes the damage task and
 *       tells admin the piece can be released. Works with the switch off (a case already open is always finishable).
 *       Admin's release (PATCH /admin/order/{id}/release-item-hold) is refused before this with
 *       customerInformedRequired true.
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, example: "Called Obinna; he agreed to a refund of N500" }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         itemId: { type: string }
 *                         tagId: { type: string, example: "TAG 02" }
 *                         damageCase:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [open, customer-informed, released] }
 *                             note: { type: string, example: "machine tore the hem" }
 *                             station: { type: string, example: wash-and-dry-station }
 *                             openedAt: { type: string, format: date-time }
 *                             openedByName: { type: string, example: "Wale" }
 *                             customerInformedAt: { type: string, format: date-time, nullable: true }
 *                             customerInformedByName: { type: string, nullable: true, example: "Chioma" }
 *       400:
 *         description: No damage case on the piece, or already marked
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_ITEM_CUSTOMER_INFORMED, [careAuth], (req, res) => new FloorCaseController().customerInformed(req, res))

/**
 * @swagger
 * /orders/{id}/partial-delivery:
 *   post:
 *     summary: Approve partial delivery of the ready pieces (damage hold will be long)
 *     description: >
 *       V1 batch 3 part 2, R6, switch damageCase. Customer care or admin. The held damaged piece(s) move to a
 *       follow-on order (its own OSC number; parentOrderId / parentOscNumber link back, and this order's
 *       partialDelivery points to it) so the ready pieces reach QC and go out on this order. The follow-on order's
 *       second trip is free when ourFault is true; otherwise it carries the delivery fee and cannot be dispatched
 *       until paid. The moved pieces keep their tags, station, hold and damage case.
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, ourFault]
 *             properties:
 *               reason: { type: string, example: "Hem repair takes 3 days" }
 *               ourFault: { type: boolean, example: true, description: "True when the hold was our fault: the second trip is free." }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         orderId: { type: string }
 *                         oscNumber: { type: string }
 *                         remainingPieces: { type: integer, example: 3 }
 *                         followOnOrderId: { type: string }
 *                         followOnOscNumber: { type: string, example: "OSC-20261020-014" }
 *                         movedTagIds: { type: array, items: { type: string }, example: ["TAG 02"] }
 *                         secondTripFee: { type: number, example: 0 }
 *                         secondTripFree: { type: boolean, example: true }
 *       400:
 *         description: Switch off, no reason, ourFault missing, no damaged piece on hold, every piece held, already approved, or the order is no longer on the floor
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_PARTIAL_DELIVERY, [careAuth], (req, res) => new FloorCaseController().partialDelivery(req, res))

/**
 * @swagger
 * /orders/looks-dirty:
 *   get:
 *     summary: Iron Only pieces S2 suggested for washing (S1's list)
 *     description: V1 batch 3 part 2, R8. Open suggestions (suggested, or link sent and waiting for payment), oldest first.
 *     tags: [Floor cases]
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         count: { type: integer, example: 1 }
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               orderId: { type: string }
 *                               oscNumber: { type: string, example: "OSC-20261020-009" }
 *                               customerName: { type: string, example: "Emeka Obi" }
 *                               phoneNumber: { type: string, example: "08031234567" }
 *                               itemId: { type: string }
 *                               tagId: { type: string, example: "TAG 03" }
 *                               type: { type: string, example: shirt }
 *                               status: { type: string, enum: [suggested, link-sent] }
 *                               note: { type: string }
 *                               suggestedAt: { type: string, format: date-time }
 *                               suggestedByName: { type: string, nullable: true }
 *                               difference: { type: number, nullable: true, example: 300 }
 *                               expiresAt: { type: string, format: date-time, nullable: true }
 */
router.get(ROUTE_LOOKS_DIRTY_LIST, [looksDirtyListAuth], (req, res) => new FloorCaseController().looksDirtyList(req, res))

/**
 * @swagger
 * /orders/{id}/items/{itemId}/looks-dirty:
 *   post:
 *     summary: S2 marks an Iron Only piece "Looks dirty, suggest washing"
 *     description: >
 *       V1 batch 3 part 2, R8, switch ironOnlyUpgrade. Sort and Pretreat (or admin), piece at S2, Iron Only. The piece
 *       stays at S2 (it cannot be sent on, and S2's automatic send skips it) until S1 records the customer's answer;
 *       the other pieces carry on. S1 and customer care are notified.
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, example: "collar stain" }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         itemId: { type: string }
 *                         tagId: { type: string, example: "TAG 03" }
 *                         dirtySuggestion:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [suggested, link-sent, paid, declined, expired] }
 *                             note: { type: string, example: "collar stain" }
 *                             suggestedAt: { type: string, format: date-time }
 *                             suggestedByName: { type: string, example: "Ada" }
 *                             difference: { type: number, nullable: true, example: 300 }
 *                             expiresAt: { type: string, format: date-time, nullable: true }
 *                             closeNote: { type: string, nullable: true, example: "customer did not pay for washing" }
 *       400:
 *         description: Switch off (switchOff true), not S2, piece not at S2, not Iron Only, already waiting, or on hold
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_ITEM_LOOKS_DIRTY, [s2Auth], (req, res) => new FloorCaseController().looksDirty(req, res))

/**
 * @swagger
 * /orders/{id}/items/{itemId}/upgrade-service:
 *   post:
 *     summary: S1 changes the piece to Wash and Iron (customer agreed); payment link for the difference
 *     description: >
 *       V1 batch 3 part 2, R8. Intake and Tag (or admin), after calling the customer. The full difference (no recount
 *       cover) is added to the order (amount, balanceDue, pricing.serviceChange) and the order reads unpaid; a payment
 *       link goes by SMS. Paying is the approval: the piece becomes Wash and Iron (item.serviceType) and S2 is told to
 *       send it to Wash and Dry. Not paid within ironOnlyAnswerMinutes (3 hours): the link is cancelled, the money
 *       comes off, the piece is pressed as booked with the note "customer did not pay for washing", and the customer is
 *       messaged. Works with the switch off (an open suggestion is always finishable).
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         itemId: { type: string }
 *                         tagId: { type: string, example: "TAG 03" }
 *                         difference: { type: number, example: 300 }
 *                         paymentUrl: { type: string, nullable: true, example: "https://checkout.paystack.com/abc" }
 *                         expiresAt: { type: string, format: date-time }
 *                         paid: { type: boolean, description: "Only when the difference is 0: changed at once." }
 *       400:
 *         description: Not S1, or no open suggestion on the piece
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_ITEM_UPGRADE_SERVICE, [s1Auth], (req, res) => new FloorCaseController().upgradeService(req, res))

/**
 * @swagger
 * /orders/{id}/items/{itemId}/looks-dirty/decline:
 *   post:
 *     summary: S1 records that the customer said no — press as booked
 *     description: >
 *       V1 batch 3 part 2, R8. Intake and Tag (or admin). Closes the suggestion (and cancels an unpaid link, taking the
 *       difference off the order); the piece is pressed as booked and can be sent on. Works with the switch off.
 *     tags: [Floor cases]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, example: "Customer said no to washing" }
 *     responses:
 *       200:
 *         description: Done
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         itemId: { type: string }
 *                         tagId: { type: string, example: "TAG 03" }
 *                         dirtySuggestion:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [suggested, link-sent, paid, declined, expired] }
 *                             note: { type: string, example: "collar stain" }
 *                             suggestedAt: { type: string, format: date-time }
 *                             suggestedByName: { type: string, example: "Ada" }
 *                             difference: { type: number, nullable: true, example: 300 }
 *                             expiresAt: { type: string, format: date-time, nullable: true }
 *                             closeNote: { type: string, nullable: true, example: "customer did not pay for washing" }
 *       400:
 *         description: Not S1, or no open suggestion on the piece
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_ITEM_LOOKS_DIRTY_DECLINE, [s1Auth], (req, res) => new FloorCaseController().declineLooksDirty(req, res))

module.exports = router
