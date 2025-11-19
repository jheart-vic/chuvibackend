// models/Post.ts
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, unique: true },
    // username: { type: String, trim: true, unique: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    gender: { type: String },
    age: { type: Number },
    weightLoss: {
      type: Number,
      default: 0,
    },
    weight: {
      value: { type: Number },
      unit: { type: String, enum: ["kg", "lbs"], default: "kg" },
    },
    bmi: { type: Number },
    height: {
      value: Number,
      unit: {
        type: String,
        enum: ["cm", "ft"],
        default: "ft",
      },
    },
    focusArea: [String],
    fitnessLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
    },
    phoneNumber: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    appleId: { type: String, unique: true, sparse: true },
    password: { type: String },
    userType: {
      type: String,
      enum: ["user", "admin", "coach"],
      default: "user",
    },
    deviceToken: { type: String },
    image: {
      type: {},
      default: {
        imageUrl:
          "https://static.vecteezy.com/system/resources/previews/005/544/718/non_2x/profile-icon-design-free-vector.jpg",
        publicId: "",
      },
      required: true,
    },
    isRegistrationComplete: { type: Boolean, default: false },
    otp: { type: String },
    customerCode: { type: String },
    emailToken: { type: String },
    otpExpiresAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    isVerifiedCoach: {
      type: Boolean,
      default: false,
    },
    servicePlatform: {
      type: String,
      // default: "local",
      enum: ["local", "google", "apple"],
    },
    status: {
      type: String,
      default: "inactive",
      enum: ["active", "inactive", "suspended"],
    },
    // subscriptionPlan: {
    //   type: mongoose.Schema.Types.ObjectId, ref: 'Plan'
    // },
    // subscriptionStart: { type: Date },
    // subscriptionExpiry: { type: Date },
    // subscriptionStatus: {
    //   type: String,
    //   enum: ["active", "cancelled", "pending", "paused", "expired", "incomplete"],
    //   default: "pending",
    // },
    // subscriptionCode: { type: String, default: null },
    // paystackAuthorizationToken: { type: String, default: null },
    coachAssigned: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    specialty: [String],
    yearsOfExperience: { type: Number, default: 0 },
    dailyStreak: { type: Number, default: 0 },
    lastDailyStreakDate: { type: Date },
    weeklyStreak: { type: Number, default: 0 },
    lastWeeklyStreakWeek: { type: Number },
    location: { type: String, trim: true },
    // favorites: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Product",
    //   },
    // ],
    coachVerification: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      governmentIssuedId: {
        imageUrl: { type: String },
        publicId: { type: String },
      },
      coachCertificate: {
        imageUrl: { type: String },
        publicId: { type: String },
      },
      submittedAt: Date,
      reviewedAt: Date,
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  try {
    if (this.isModified("password")) {
      // const user = this as IUser;
      const hashPassword = await bcrypt.hash(this.password, 10);
      this.password = hashPassword;
    }

    if (this.userType !== "coach") {
      this.isVerifiedCoach = undefined;
    }

    next();
  } catch (error) {
    return next(error);
  }
});

UserSchema.methods.comparePassword = async function (password) {
  const user = this;
  // console.log({password, userPassword: user.password})
  if (!password || !user.password) {
    throw new Error("Missing password or hash for comparison");
  }
  return await bcrypt.compare(password, user.password);
};

UserSchema.methods.isSubscriptionActive = function () {
  return (
    this.subscriptionStatus === "active" && new Date() < this.subscriptionExpiry
  );
};

UserSchema.methods.generateAccessToken = async function (secretToken, expiresIn="1w") {
  const token = jwt.sign(
    {
      id: this._id,
      userType: this.userType,
    },
    secretToken,
    { expiresIn: expiresIn }
  );
  return token;
};

UserSchema.methods.generateRefreshToken = async function (secretToken) {
  const token = jwt.sign(
    {
      id: this._id,
      userType: this.userType,
    },
    secretToken,
    { expiresIn: "4w" }
  );
  return token;
};

UserSchema.pre(/^find/, function (next) {
  // This refers to the query, not the result
  if (this.getQuery().userType !== "coach") {
    // Optionally exclude coach-only fields for non-coach queries
    // this.select("-isVerifiedCoach -specialty -yearsOfExperience");
  }
  next();
});

const UserModel = mongoose.model("User", UserSchema);
module.exports = UserModel;
