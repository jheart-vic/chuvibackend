// Pin the process to Lagos time. MUST stay the first statement in the file:
// the crons below schedule themselves at require-time, and any module that
// builds a date at load time would otherwise capture the host's zone.
//
// Chuvi operates only in Lagos, but the host doesn't know that — Render runs in
// UTC while a dev machine here runs WAT. That split made the ~25 places that
// bucket "today" with `setHours(0,0,0,0)` disagree with the Lagos-based reports
// for the first hour of each Lagos day (00:00-00:59 WAT = the previous day in
// UTC), and made the bug impossible to reproduce locally. Pinning here fixes
// every one of those call sites at once AND makes dev and production behave
// identically.
//
// Deliberately NOT `process.env.TZ || "Africa/Lagos"`: a host that already
// exports TZ=UTC would silently defeat that, which is the exact invisible
// failure this is meant to prevent. The override is a distinct name that no
// platform sets by default, so it can only be used on purpose.
process.env.TZ = process.env.TZ_OVERRIDE || "Africa/Lagos";

require("dotenv").config();
const express = require("express");
const http = require("http");
const router = require("./routes");
const cookieParser = require("cookie-parser");
const connectToMongoDB = require("./config/db.js");


const errorController = require("./controllers/error.controller.js");
const AppError = require("./util/appError.js");
const setupSwagger = require("./swagger/swagger.js");
const { initSocket } = require("./config/socket.js");
const limiter = require("./middlewares/rateLimiter.js");
const corsMiddleware = require('./config/cors.js');
const setupApp = require("./config/setup.js");
const webhookFunction = require("./util/webhook.js");

require('./crons/cleanUpCancelledSubs.js')
require('./crons/expireSubscriptions.js')
require('./crons/reconcilePaystack.js')
require('./crons/resetMonthlyLimits.js')
require('./crons/crmDispatcher.js')
require('./crons/crmDormancyScan.js')
require('./crons/sendPaymentsReminder.js')
require('./crons/crmBroadcasts.js')
require('./crons/creditExpiry.js')
require('./crons/offerExpiry.js')
require('./crons/complaintSla.js')
require('./crons/unassignedDispatchScan.js')


const port = process.env.PORT || 7001;
const mongoURL = process.env.MONGODB_URL;

const app = express();
const httpServer = http.createServer(app);

// Real-time in-app bot / support chat (Phase 6) — attaches to the same server.
initSocket(httpServer);

// Use CORS with the specified options
app.use(corsMiddleware);

app.post("/webhook", express.raw({ type: "application/json" }), webhookFunction);


app.use(express.json());
app.use(cookieParser());


app.set('trust proxy', 1);
app.set("views", "./views");
app.set("view engine", "ejs");

app.options("*", corsMiddleware);


if (process.env.NODE_ENV !== "development") {
  app.use("/api", limiter);
}



// app.use("/webhook", express.raw({ type: "application/json" }));

setupSwagger(app);
app.use("/api", router);

app.get("/", (req, res) => {
  res.send("This is the base project");
});

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }))

// Non-implemented routes middleware
app.all("*", (req, res, next) => {
  next(
    new AppError(
      `Can’t find ${req.originalUrl} with ${req.method} method on this server`,
      501
    )
  );
});

app.use(errorController);


httpServer.listen(port, async () => {
  console.log(`Server running on ${port}`);
  await connectToMongoDB(mongoURL);
  setupApp()
});
