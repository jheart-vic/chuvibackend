const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function riderAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.RIDER) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. Riders only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the Rider auth error");
  }
}

module.exports = riderAuth;
