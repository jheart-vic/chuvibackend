require("dotenv").config();
const jwt = require("jsonwebtoken");
const { empty } = require("../util");

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (empty(authHeader)) {
      return res.status(401).json({
        success: false,
        data: {
          error: "Please provide a valid token to proceed",
        }
      });
    }

    if(authHeader.split(" ").filter(item => item !== 'null').length < 2){
      return res.status(401).json({
        success: false,
        data: {
          error: "Please provide a valid token to proceed",
        }
      });
    }


    const token = authHeader.split(" ")[1];

    // check if token is provided
    if (!token) {
      return res.status(401).json({
        success: false,
        data: {
          message: "Unauthorized. Please log in",
        }
      });
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = {
      id: decoded.id,
      userType: decoded.userType,
    };
    next();
  } catch (error) {
    if(error.message == 'jwt expired'){
      return res.status(401).json({
        success: false,
        data: {
          message: "jwt_expired",
        }
      });
    }
    return res.status(401).json({
      success: false,
      data: {
        message: "Internal Server Error",
      }
    });
  }
}

module.exports = auth;
