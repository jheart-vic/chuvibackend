const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function intakeUserAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.INTAKE_AND_TAG) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. QCs only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the QC auth error");
  }
}

module.exports = intakeUserAuth;
