const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const AdminSettingModel = require("../models/adminSetting.model");
const CrmSettingModel = require("../models/crmSetting.model");
const RewardSettingModel = require("../models/rewardSetting.model");
const TemplateModel = require("../models/template.model");
const ComplaintTypeModel = require("../models/complaintType.model");
const OfferModel = require("../models/offer.model");


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
      // These were INVERTED (premium 2, vip 1.5), so on a freshly seeded DB a
      // Premium item cost MORE than the same item at VIP, while the model's own
      // defaults (adminSetting.model.js) say premium 1.5 / vip 2. Aligned with
      // the model; VIP is the top tier and must not be the cheaper uplift.
      // NOTE: config/setup.js only seeds when the document is MISSING, so an
      // existing database keeps whatever it has — check the live values before
      // telling anyone this is fixed there.
      premiumServiceTierCharge: 1.5,
      vipServiceTierCharge: 2,
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
      let dirty = false;
      // §3 backfill: give pre-existing settings docs the default lead schedule
      // so admins can see/edit the sequence + delivery times.
      if (!crmSetting.leadSchedule || crmSetting.leadSchedule.length === 0) {
        crmSetting.leadSchedule = CrmSettingModel.DEFAULT_LEAD_SCHEDULE;
        dirty = true;
      }
      // 2026-08-28 backfill: post-delivery + reactivation schedules are now
      // configurable — seed defaults onto existing docs so the dashboard shows them.
      if (!crmSetting.postDeliverySchedule || crmSetting.postDeliverySchedule.length === 0) {
        crmSetting.postDeliverySchedule = CrmSettingModel.DEFAULT_POST_DELIVERY_SCHEDULE;
        dirty = true;
      }
      if (!crmSetting.reactivationSchedule || crmSetting.reactivationSchedule.length === 0) {
        crmSetting.reactivationSchedule = CrmSettingModel.DEFAULT_REACTIVATION_SCHEDULE;
        dirty = true;
      }
      // Backfill any new default template keys (order-ready, broadcast variants,
      // reduced lead copy) WITHOUT overwriting admin-edited existing keys.
      const defaults = CrmSettingModel.DEFAULT_TEMPLATES || {};
      for (const [key, value] of Object.entries(defaults)) {
        if (!crmSetting.templates.get(key)) {
          crmSetting.templates.set(key, value);
          dirty = true;
        }
      }
      if (dirty) await crmSetting.save();
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

// One-time §4 migration: backfill the multi-trigger `triggers[]` array from the
// legacy single `trigger` for any offer that predates multi-criteria targeting.
// Idempotent — only touches offers with a trigger and an empty/absent triggers[].
const backfillOfferTriggers = async () => {
  try {
    const result = await OfferModel.updateMany(
      {
        trigger: { $exists: true, $nin: [null, ""] },
        $or: [{ triggers: { $exists: false } }, { triggers: { $size: 0 } }],
      },
      [{ $set: { triggers: ["$trigger"] } }],
    );
    if (result.modifiedCount) {
      console.log(`Backfilled triggers[] on ${result.modifiedCount} offer(s)`);
    }
  } catch (error) {
    console.error("Offer triggers backfill failed:", error);
  }
};

// Hold types (client section B, 2026-10-07). Seeded from the hold reasons that
// were hard-coded per station, so the admin edits a list that already matches
// what the stations see rather than starting from nothing.
//
// IMPORTANT: every operational type seeds with `slaHours: null`, which means
// "keep using the order's delivery speed". So this seed changes NO behaviour on
// the floor — it only makes the limits editable. `payment` is the one type that
// ships with a limit of its own (48h) because it is new.
//
// Idempotent per key: an existing type is never overwritten, so an admin's
// edited limit survives every restart.
const createDefaultHoldTypes = async () => {
  try {
    const { ROLE } = require("../util/constants");
    const HoldTypeModel = require("../models/holdType.model");
    const ALL_STATIONS = [
      ROLE.INTAKE_AND_TAG,
      ROLE.SORT_AND_PRETREAT,
      ROLE.WASH_AND_DRY,
      ROLE.PRESS,
      ROLE.QC,
    ];
    const defaults = [
      { key: "item_missing", name: "Item missing", stations: ALL_STATIONS },
      { key: "item_mismatched", name: "Item mismatched", stations: ALL_STATIONS },
      { key: "wrong_label", name: "Wrong label", stations: [ROLE.INTAKE_AND_TAG] },
      { key: "damaged_on_arrival", name: "Damaged on arrival", stations: [ROLE.INTAKE_AND_TAG] },
      { key: "fabric_incompatible", name: "Fabric incompatible", stations: [ROLE.SORT_AND_PRETREAT] },
      { key: "stain_requires_special_treatment", name: "Stain requires special treatment", stations: [ROLE.SORT_AND_PRETREAT] },
      { key: "color_bleed_risk", name: "Colour bleed risk", stations: [ROLE.SORT_AND_PRETREAT, ROLE.WASH_AND_DRY] },
      { key: "fabric_damage_risk", name: "Fabric damage risk", stations: [ROLE.WASH_AND_DRY, ROLE.PRESS] },
      { key: "delicate_requires_attention", name: "Delicate, needs attention", stations: [ROLE.PRESS] },
      { key: "quality_not_met", name: "Quality not met", stations: [ROLE.QC] },
      { key: "wrong_item_returned", name: "Wrong item returned", stations: [ROLE.QC] },
      { key: "packaging_issue", name: "Packaging issue", stations: [ROLE.QC] },
      // Client 2026-10-08, section 3.5: a new Intake reason for the Quick
      // Booking count check. "The admin approves it before the order moves."
      {
        key: "count_differs_from_rider",
        name: "Count differs from rider count",
        description:
          "Intake counted a different number of items than the rider recorded at pickup. Only an admin can approve this order to move on.",
        stations: [ROLE.INTAKE_AND_TAG],
        requiresAdminApproval: true,
      },
      { key: "other", name: "Other", stations: ALL_STATIONS },
    ].map((t) => ({ ...t, slaHours: null, isSystem: false }));

    defaults.push({
      key: HoldTypeModel.PAYMENT_HOLD_KEY,
      name: "Awaiting payment",
      description:
        "The bill has been sent and the order waits until it is paid. Nothing is tagged and nothing moves to S2 until then.",
      // Client: "Payment hold is its own type. Start its limit at 48 hours."
      slaHours: 48,
      // "It is judged only by its own limit" — the promised delivery date must
      // not drag it into Overdue; on a Quick Booking that date does not exist
      // yet, because the clock starts when payment is confirmed.
      judgeByOwnLimitOnly: true,
      stations: [ROLE.INTAKE_AND_TAG, ROLE.ADMIN],
      isSystem: true,
      systemRaisedOnly: true,
    });

    let added = 0;
    for (const t of defaults) {
      const existing = await HoldTypeModel.findOne({ key: t.key });
      if (existing) continue; // never clobber an admin's edited limit
      await HoldTypeModel.create(t);
      added++;
    }
    if (added) console.log(`Seeded ${added} hold type(s)`);
  } catch (error) {
    console.error("Hold types seed failed:", error);
  }
};

// `init()` above creates the AdminSetting document ONLY when none exists, so a
// field added to the schema later never reaches the document that is already
// there — Mongoose applies defaults on creation, not on read. That is why every
// role's wallet limit reads ₦0 in production even though the model's default
// says 5,000 / 10,000: the live document predates brief item 2.4 and simply has
// no `walletAdjustmentLimits` key, and `getRoleLimit` treats "absent" as 0.
// (Same trap as the inverted tier charges: seeding is not migrating.)
//
// Idempotent and non-destructive: it writes ONLY when the field is absent, so
// an admin who has set their own limits is never overwritten.
const ensureWalletAdjustmentLimits = async () => {
  try {
    const { ROLE } = require("../util/constants");
    const res = await AdminSettingModel.updateOne(
      { walletAdjustmentLimits: { $exists: false } },
      {
        $set: {
          walletAdjustmentLimits: {
            [ROLE.INTAKE_AND_TAG]: 5000,
            [ROLE.CUSTOMER_EXPERIENCE]: 10000,
          },
        },
      },
    );
    if (res.modifiedCount) {
      console.log(
        "Backfilled walletAdjustmentLimits (intake-and-tag 5000, customer-experience 10000)",
      );
    }
  } catch (error) {
    console.error("Wallet adjustment limits backfill failed:", error);
  }
};

async function setupApp() {
  init();
  ensureWalletAdjustmentLimits();
  createAdminOrderDetails();
  createCrmSettings();
  createRewardSettings();
  createDefaultTemplates();
  createDefaultComplaintTypes();
  createDefaultHoldTypes();
  backfillOfferTriggers();
  console.log("App init successful");
}

module.exports = setupApp;
