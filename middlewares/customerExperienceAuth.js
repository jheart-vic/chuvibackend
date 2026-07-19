const { ROLE } = require("../util/constants");
const auth = require("./auth");

// Customer Experience Officer (owns complaint cases) + admin fallback.
async function customerExperienceAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (
        req.user.userType == ROLE.CUSTOMER_EXPERIENCE ||
        req.user.userType == ROLE.ADMIN
      ) {
        return next();
      }
      return res.status(403).json({
        success: false,
        data: {
          error: "Access denied. Customer Experience only",
        },
      });
    });
  } catch (error) {
    console.log(error, "the customer-experience auth error");
  }
}

module.exports = customerExperienceAuth;
