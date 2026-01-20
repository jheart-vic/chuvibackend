const UserController = require("../controllers/auth.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {

} = require("../util/page-route");
const router = require("express").Router();


module.exports = router;