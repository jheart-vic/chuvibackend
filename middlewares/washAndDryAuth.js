const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function washAndDryAuthAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.WASH_AND_DRY) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. wash And Dry Auths only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the wash And Dry Auth auth error");
  }
}

module.exports = washAndDryAuthAuth;
