const auth = require("./auth");

async function adminAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == "admin") {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. Admins only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the admin auth error");
  }
}

module.exports = adminAuth;
