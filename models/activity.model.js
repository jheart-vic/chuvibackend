const mongoose = require("mongoose");
const { ACTIVITY_TYPE } = require("../util/constants");

const activitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, required: true, enum: Object.values(ACTIVITY_TYPE) },
  },
  { timestamps: true }
);


const ActivityModel = mongoose.model("Activity", activitySchema);
module.exports = ActivityModel;
