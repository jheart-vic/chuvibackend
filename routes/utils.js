const UtilController = require("../controllers/util.controller");
const auth = require("../middlewares/auth");
const { image_uploader, video_uploader, document_uploader } = require("../util/imageUpload");
const {
  ROUTE_IMAGE_UPLOAD_MULTIPLE,
  ROUTE_IMAGE_UPLOAD_SINGLE,
  ROUTE_GET_HOLD_REASONS,
  ROUTE_REPORT_DELIVERY_ISSUES,
} = require("../util/page-route");

const router = require("express").Router();

router.post(
  ROUTE_IMAGE_UPLOAD_MULTIPLE,
  auth,
  (req, res, next) => {
    image_uploader.array("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      next();
    });
  },
  (req, res) => {
    const utilController = new UtilController();
    return utilController.uploadMultipleImage(req, res);
  }
);


/**
 * @swagger
 * /utils/image-upload-single:
 *   post:
 *     summary: Upload a single image file
 *     tags:
 *       - File upload
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The image file to upload
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Image uploaded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       example: "https://yourdomain.com/uploads/image123.jpg"
 *                     publicId:
 *                       type: string
 *                       example: "image123"
 *       400:
 *         description: Bad request, e.g., no file uploaded or invalid file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: No file uploaded
 *       500:
 *         description: Server error
 */

router.post(
  ROUTE_IMAGE_UPLOAD_SINGLE,
  auth,
  (req, res, next) => {
    image_uploader.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      next();
    });
  },
  (req, res) => {
    const utilController = new UtilController();
    return utilController.uploadSingleImage(req, res);
  }
);

/**
 * @swagger
 * /utils/hold-reasons:
 *   get:
 *     summary: Get suggested hold reasons by station role
 *     description: |
 *       Returns a list of suggested hold reasons for a given station role.
 *       Each station passes its own role as a query parameter.
 *       The frontend uses these to populate a dropdown, but operators
 *       may still type a custom reason via the `note` field in `sendToHold`.
 *
 *       **Valid roles:**
 *       - `intake-and-tag`
 *       - `sort-and-pretreat`
 *       - `wash-and-dry`
 *       - `press`
 *       - `qc`
 *     tags:
 *       - Utils
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - intake-and-tag
 *             - sort-and-pretreat
 *             - wash-and-dry
 *             - press
 *             - qc
 *           example: "press"
 *         description: The station role to fetch hold reasons for
 *     responses:
 *       200:
 *         description: Hold reasons returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       example: "press"
 *                     reasons:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["item_missing", "item_mismatched", "fabric_damage_risk", "delicate_requires_attention", "other"]
 *                     note:
 *                       type: string
 *                       example: "You may type a custom reason if yours is not listed."
 *       400:
 *         description: |
 *           Invalid or missing role.
 *           - `role` query param is required
 *           - `role` must be one of the valid station roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid role. Must be one of: intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_HOLD_REASONS, auth, (req, res) => {
    const utilController = new UtilController()
    return utilController.getHoldReasons(req, res)
})

/**
 * @swagger
 * /utils/order/{id}/report-issue:
 *   patch:
 *     summary: Report a delivery or pickup issue
 *     description: |
 *       Unified endpoint for reporting dispatch issues from three sources:
 *
 *       - **pickup_problem** — raised by rider or intake staff when pickup fails
 *       - **delivery_problem** — raised by rider when delivery fails
 *       - **walkin_problem** — raised by front desk when walk-in collection fails
 *
 *       All three feed the `deliveryIssues` count on the admin dashboard.
 *       Sets the appropriate dispatch failure status on the order.
 *     tags:
 *       - Utils
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [issueType]
 *             properties:
 *               issueType:
 *                 type: string
 *                 enum: [pickup_problem, delivery_problem, walkin_problem]
 *                 example: "delivery_problem"
 *                 description: Source and type of the issue
 *               note:
 *                 type: string
 *                 example: "Customer not at address, phone unreachable"
 *                 description: Optional explanation of what happened
 *     responses:
 *       200:
 *         description: Delivery issue reported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Delivery issue reported successfully"
 *       400:
 *         description: |
 *           - Order ID is required
 *           - issueType is required or invalid
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_REPORT_DELIVERY_ISSUES, auth, (req, res) => {
    const utilController = new UtilController()
    return utilController.reportDeliveryIssue(req, res)
})

module.exports = router;
