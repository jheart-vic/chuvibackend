const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function qcAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.QC) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. QC Users only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the QC auth error");
  }
}

module.exports = qcAuth;
