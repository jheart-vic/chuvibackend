// models/Post.ts
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ROLE, SERVICE_PLATFORM, GENERAL_STATUS } = require("../util/constants");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, unique: true },
    fullName: { type: String, trim: true },
    password: { type: String },
    phoneNumber: { type: String },
    userType: {
      type: String,
      enum: [ROLE.MANAGER, ROLE.ADMIN, ROLE.STAFF, ROLE.FRONT_DESK, ROLE.USER],
      default: ROLE.USER,
    },
    hub: {type: mongoose.Schema.Types.ObjectId, ref: "Hub"},
    googleId: { type: String, unique: true, sparse: true },
    appleId: { type: String, unique: true, sparse: true },
    image: {
      type: {},
      default: {
        imageUrl:
          "https://static.vecteezy.com/system/resources/previews/005/544/718/non_2x/profile-icon-design-free-vector.jpg",
        publicId: "",
      },
      required: true,
    },
    otp: { type: String },
    customerCode: { type: String },
    emailToken: { type: String },
    otpExpiresAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    servicePlatform: {
      type: String,
      enum: [SERVICE_PLATFORM.LOCAL, SERVICE_PLATFORM.GOOGLE, SERVICE_PLATFORM.APPLE],
      default: SERVICE_PLATFORM.LOCAL
    },
    status: {
      type: String,
      default: GENERAL_STATUS.ACTIVE,
      enum: [GENERAL_STATUS.ACTIVE, GENERAL_STATUS.INACTIVE, GENERAL_STATUS.SUSPENDED],
    },
    address: { type: String },
    address2: { type: String },
    whatsappNotification: { type: Boolean, default: false },
    emailNotification: { type: Boolean, default: false },
    lastChangedPassword: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
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

userSchema.methods.comparePassword = async function (password) {
  const user = this;
  // console.log({password, userPassword: user.password})
  if (!password || !user.password) {
    throw new Error("Missing password or hash for comparison");
  }
  return await bcrypt.compare(password, user.password);
};

userSchema.methods.generateAccessToken = async function (secretToken, expiresIn="1w") {
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

userSchema.methods.generateRefreshToken = async function (secretToken) {
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


const UserModel = mongoose.model("User", userSchema);
module.exports = UserModel;
