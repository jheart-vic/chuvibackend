const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function pressAndIronAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.PRESS) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. press and Iron Auths only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the press and Iron Auth auth error");
  }
}

module.exports = pressAndIronAuth;
