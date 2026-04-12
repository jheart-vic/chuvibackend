const AdminController = require("../controllers/admin.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {
    ROUTE_DASHBOARD_STATS
} = require("../util/page-route");
const router = require("express").Router();

router.get(ROUTE_DASHBOARD_STATS, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getDashboardStats(req, res);
});


module.exports = router;