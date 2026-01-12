const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const AdminSettingModel = require("../models/adminSetting.model");


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


async function setupApp() {
  init();
  createAdminOrderDetails();
  console.log("App init successful");
}

module.exports = setupApp;
