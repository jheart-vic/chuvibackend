const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const AdminSettingModel = require("../models/adminSetting.model");
const CrmSettingModel = require("../models/crmSetting.model");
const RewardSettingModel = require("../models/rewardSetting.model");
const TemplateModel = require("../models/template.model");
const ComplaintTypeModel = require("../models/complaintType.model");


const init = async () => {
  try {
    const adminSetting = await AdminSettingModel.findOne({});
    if (adminSetting) {
      return;
    }
    const defaultSetting = {
      washAndIronPerKg: 3000,
      washOnlyPerKg: 1500,
      ironOnlyPerPiece: 1300,
      dryCleanPerPiece: 8000,
      sameDayCharge: 500,
      expressCharge: 200,
      premiumServiceTierCharge: 2,
      vipServiceTierCharge: 1.5,
    }
    await AdminSettingModel.create(defaultSetting)

  } catch (error) {
    console.error("App init failed:", error);
  }
};

const createAdminOrderDetails = async () => {
  try {
    const adminOrderDetails = await AdminOrderDetailsModel.findOne({})
    if (adminOrderDetails) {
      return;
    }
    await AdminOrderDetailsModel.create({})

  } catch (error) {
    console.error("App init failed:", error);
  }
};


const createCrmSettings = async () => {
  try {
    const crmSetting = await CrmSettingModel.findOne({});
    if (crmSetting) {
      return;
    }
    await CrmSettingModel.create({});
  } catch (error) {
    console.error("App init failed:", error);
  }
};

const createRewardSettings = async () => {
  try {
    const rewardSetting = await RewardSettingModel.findOne({});
    if (!rewardSetting) {
      await RewardSettingModel.create({});
      return;
    }
    // backfill the advocacy ladder onto pre-existing settings docs
    if (!rewardSetting.referralLevels || rewardSetting.referralLevels.length === 0) {
      rewardSetting.referralLevels = undefined; // let schema default repopulate
      rewardSetting.markModified("referralLevels");
      await rewardSetting.save();
    }
  } catch (error) {
    console.error("App init failed:", error);
  }
};

// Starter communication templates — created only if the key doesn't exist,
// so admin edits are never overwritten.
const DEFAULT_TEMPLATES = [
  {
    key: "offer-available",
    name: "Offer Available",
    title: "A new reward is waiting for you 🎁",
    body: "Hello {{firstName}}! You have a new offer: {{offerName}}. Open your rewards page to use it before it expires.",
    smsBody: "Hello {{firstName}}! A new CHUVI offer is waiting for you: {{offerName}}. Open the app to use it.",
    channels: ["in-app"],
    page: "offers",
  },
  {
    key: "referral-reward",
    name: "Referral Reward",
    title: "Your referral paid off 💙",
    body: "Hello {{firstName}}! {{referredName}} completed their first order, so we've added ₦{{amount}} referral credit to your wallet.",
    smsBody: "CHUVI: your referral was successful! ₦{{amount}} credit has been added to your wallet.",
    channels: ["in-app"],
    page: "wallet",
  },
  {
    key: "referral-level-up",
    name: "Referral Level Up",
    title: "You've reached {{levelName}}! 🏆",
    body: "Congratulations {{firstName}}! Thanks to your referrals you're now a CHUVI {{levelName}}. You now earn {{rewardPercent}}% referral rewards{{benefitsLine}}. Keep referring to keep the perks coming!",
    smsBody: "CHUVI: You're now a {{levelName}}! You now earn {{rewardPercent}}% referral rewards. Keep referring to unlock more.",
    channels: ["in-app"],
    page: "referral",
  },
  {
    key: "referral-monthly-benefit",
    name: "Referral Monthly Benefit",
    title: "This month's {{levelName}} reward is active 🎁",
    body: "Nice work {{firstName}}! You hit your monthly referral target, so we've added ₦{{amount}} free-laundry credit to your wallet as a {{levelName}} perk.",
    smsBody: "CHUVI: your {{levelName}} monthly reward is active — ₦{{amount}} free-laundry credit added to your wallet.",
    channels: ["in-app"],
    page: "wallet",
  },
  {
    key: "complaint-update",
    name: "Complaint Update",
    title: "Update on your complaint",
    body: "Hello {{firstName}}, there's an update on your complaint: {{update}}. Open the conversation for details.",
    smsBody: "CHUVI: there's an update on your complaint — {{update}}. Open the app for details.",
    channels: ["in-app"],
    page: "complaint",
  },
  {
    key: "generic-announcement",
    name: "Generic Announcement",
    title: "{{title}}",
    body: "{{message}}",
    channels: ["in-app"],
  },
];

const createDefaultTemplates = async () => {
  try {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = await TemplateModel.findOne({ key: tpl.key });
      if (existing) continue;
      await TemplateModel.create(tpl);
    }
  } catch (error) {
    console.error("App init failed:", error);
  }
};

// Default complaint types (spec examples). Created only if the collection is
// empty, so admin edits/removals are never undone.
const DEFAULT_COMPLAINT_TYPES = [
  { name: "Not Washed Well", description: "Item was not properly cleaned" },
  { name: "Stain Remains", description: "A removable stain is still present" },
  { name: "Poor Ironing", description: "Ironing or pressing was inadequate" },
  { name: "Wrong Packaging", description: "Item was packaged incorrectly" },
  { name: "Missing Item", description: "An item is missing from the order" },
  { name: "Wrong Item", description: "A wrong item was delivered" },
  { name: "Damaged Item", description: "An item was damaged" },
  { name: "Colour Issue", description: "Colour ran or faded" },
  { name: "Delay", description: "Delivery was late" },
  { name: "Other", description: "Any other issue" },
];

const createDefaultComplaintTypes = async () => {
  try {
    const count = await ComplaintTypeModel.countDocuments({});
    if (count > 0) return;
    await ComplaintTypeModel.insertMany(DEFAULT_COMPLAINT_TYPES);
  } catch (error) {
    console.error("App init failed:", error);
  }
};

async function setupApp() {
  init();
  createAdminOrderDetails();
  createCrmSettings();
  createRewardSettings();
  createDefaultTemplates();
  createDefaultComplaintTypes();
  console.log("App init successful");
}

module.exports = setupApp;
