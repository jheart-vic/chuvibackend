const { ROLE } = require("../util/constants");
const auth = require("./auth");

async function sortAndPretreatAuth(req, res, next) {
  try {
    auth(req, res, () => {
      if (req.user.userType == ROLE.SORT_AND_PRETREAT) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          data: {
            error: "Access denied. sortAndPretreats only",
          },
        });
      }
    });
  } catch (error) {
    console.log(error, "the sortAndPretreat auth error");
  }
}

module.exports = sortAndPretreatAuth;
