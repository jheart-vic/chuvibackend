require("dotenv").config();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

/**
 * ===============================
 * Cloudinary Configuration
 * ===============================
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * ===============================
 * Helpers
 * ===============================
 */
function getPublicIdFromUrl(imageUrl) {
  if (!imageUrl) return null;
  const parts = imageUrl.split("/");
  const filename = parts[parts.length - 1];
  return filename?.split(".")[0] || null;
}

async function deleteImage(publicId, resourceType = "image") {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    console.log(result, "deleted successfully");
    return result;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/**
 * ===============================
 * Multer (Memory Storage)
 * ===============================
 */
function createMulterUploader(resourceType = "image") {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
      const imageTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
      ];
      const videoTypes = ["video/mp4", "video/webm", "video/ogg"];
      const rawTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (resourceType === "image" && imageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else if (resourceType === "video" && videoTypes.includes(file.mimetype)) {
        cb(null, true);
      } else if (resourceType === "raw" && rawTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error("Invalid file format. Only supported formats are allowed."),
          false
        );
      }
    },
  });
}

/**
 * ===============================
 * Cloudinary Upload Stream
 * ===============================
 */
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

/**
 * ===============================
 * Preconfigured Uploaders
 * ===============================
 */
const image_uploader = createMulterUploader("image");
const video_uploader = createMulterUploader("video");
const document_uploader = createMulterUploader("raw");

/**
 * ===============================
 * Exported Upload Functions
 * ===============================
 */
async function uploadImage(file) {
  return uploadToCloudinary(file.buffer, {
    folder: "chuvi-images",
    resource_type: "image",
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  });
}

async function uploadVideo(file) {
  return uploadToCloudinary(file.buffer, {
    folder: "chuvi-videos",
    resource_type: "video",
  });
}

async function uploadDocument(file) {
  return uploadToCloudinary(file.buffer, {
    folder: "chuvi-documents",
    resource_type: "raw",
  });
}

module.exports = {
  image_uploader,
  video_uploader,
  document_uploader,
  uploadImage,
  uploadVideo,
  uploadDocument,
  getPublicIdFromUrl,
  deleteImage,
};
