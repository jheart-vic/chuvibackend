const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const AdminSettingModel = require("../models/adminSetting.model");
const CrmSettingModel = require("../models/crmSetting.model");
const RewardSettingModel = require("../models/rewardSetting.model");
const TemplateModel = require("../models/template.model");


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
    if (rewardSetting) {
      return;
    }
    await RewardSettingModel.create({});
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

async function setupApp() {
  init();
  createAdminOrderDetails();
  createCrmSettings();
  createRewardSettings();
  createDefaultTemplates();
  console.log("App init successful");
}

module.exports = setupApp;
