const UtilController = require("../controllers/util.controller");
const auth = require("../middlewares/auth");
const { image_uploader, video_uploader, document_uploader } = require("../util/imageUpload");
const {
  ROUTE_IMAGE_UPLOAD_MULTIPLE,
  ROUTE_IMAGE_UPLOAD_SINGLE,
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



module.exports = router;
