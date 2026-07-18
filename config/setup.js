const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const AdminSettingModel = require("../models/adminSetting.model");
const CrmSettingModel = require("../models/crmSetting.model");
const RewardSettingModel = require("../models/rewardSetting.model");


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

async function setupApp() {
  init();
  createAdminOrderDetails();
  createCrmSettings();
  createRewardSettings();
  console.log("App init successful");
}

module.exports = setupApp;
