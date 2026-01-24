const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../util/emailService");
const sendSmsOtp = require("../util/sendOtp");
const BaseService = require("./base.service");
const UserModel = require("../models/user.model");
const { empty } = require("../util");
const jwt = require("jsonwebtoken");
const validateData = require("../util/validate");
const {
  generateOTP,
  verifyRefreshToken,
  signAccessToken,
} = require("../util/helper");
const { EXPIRES_AT, SERVICE_PLATFORM } = require("../util/constants");

class AuthService extends BaseService {
  async createUser(req, res) {
    try {
      const post = req.body;

      const validateRule = {
        email: "email|required",
        password: "string|required",
        fullName: "string|required",
        phoneNumber: "string|required",
        userType: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        "email.email": "Please provide a valid :attribute.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const userExists = await UserModel.findOne({ email: post.email });
      if (userExists) {
        return BaseService.sendFailedResponse({
          error: "User exists. Please login",
        });
      }

      // Create the user
      const newUser = new UserModel({
        email: post.email,
        password: post.password,
        fullName: post.fullName,
        phoneNumber: post.phoneNumber,
        userType: post.userType || ROLE.USER,
        servicePlatform: "local",
      });

      await newUser.save();

      // Add OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + EXPIRES_AT);

      newUser.otp = otp;
      newUser.otpExpiresAt = expiresAt;
      await newUser.save();
      newUser.password = undefined;

      // Send OTP Email
      await sendEmail({
        subject: "Welcome to Chuvi Laundry — Verify Your Email",
        to: newUser.email,
        html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">

        <h1 style="color: #1A73E8;">Welcome to Chuvi Laundry 👕✨</h1>

        <p>Hello <strong>${newUser.fullName}</strong>,</p>

        <p>
          Thank you for joining <strong>Chuvi Laundry</strong> — your trusted partner for fast, clean, and reliable laundry care.
          Your account has been successfully created!
        </p>

        <p>To keep your account secure, please verify your email using the OTP below:</p>

        <h2 style="color: #1A73E8; margin-top: 20px; font-size: 32px;">${otp}</h2>

        <p>This code will expire in <strong>10 minutes</strong>.
        Use it to complete your verification.</p>

        <br>

        <p>
          If you didn’t create an account with Chuvi Laundry, you can safely ignore this email.
        </p>

        <br>

        <p>
          Warm regards,<br>
          <strong>The Chuvi Laundry Team</strong>
        </p>
      </div>
    `,
      });

      await sendSmsOtp(newUser.phoneNumber, `${otp}`);

      return BaseService.sendSuccessResponse({
        message: "Registration successful. Please verify your email.",
        user: newUser,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async googleSignup(req, res) {
    try {
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);

      const post = req.body;

      const validateRule = {
        idToken: "string|required",
        userType: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
      };

      const validateResult = validateData(post, validateRule, validateMessage);

      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const ticket = await client.verifyIdToken({
        idToken: post.idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      const {
        sub: googleId,
        email,
        name,
        picture,
        given_name,
        family_name,
      } = payload;

      // ✅ Proper fullName mapping (schema-compatible)
      const fullName =
        name || [given_name, family_name].filter(Boolean).join(" ");

      // Check if user exists
      const userWithSub = await UserModel.findOne({
        $or: [{ googleId }, { email }],
      });

      if (userWithSub) {
        const accessToken = await userWithSub.generateAccessToken(
          process.env.ACCESS_TOKEN_SECRET || ""
        );
        const refreshToken = await userWithSub.generateRefreshToken(
          process.env.REFRESH_TOKEN_SECRET || ""
        );

        return BaseService.sendSuccessResponse({
          message: accessToken,
          user: userWithSub,
          refreshToken,
        });
      }

      // ✅ Schema-aligned user object
      const userObject = {
        googleId,
        email,
        fullName,
        image: { imageUrl: picture, publicId: "" },
        isVerified: true,
        servicePlatform: "google",
        userType: post.userType,
      };

      const newUser = new UserModel(userObject);
      await newUser.save();

      const accessToken = await newUser.generateAccessToken(
        process.env.ACCESS_TOKEN_SECRET || ""
      );

      const refreshToken = await newUser.generateRefreshToken(
        process.env.REFRESH_TOKEN_SECRET || ""
      );

      // Welcome email
      const emailHtml = `
      <h1>Registration successful</h1>
      <p>Hi <strong>${newUser.fullName || newUser.email}</strong>,</p>
      <p>You have successfully signed up.</p>
    `;

      await sendEmail({
        subject: "Welcome to Chuvi Laundry",
        to: newUser.email,
        html: emailHtml,
      });

      return BaseService.sendSuccessResponse({
        message: accessToken,
        user: newUser,
        refreshToken,
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }

  async appleSignup(req, res) {
    try {
      const {
        authorizationCode, // The authorization code from Apple
        idToken, // The id_token from Apple (used to extract user info)
        userType, // The type of user (e.g., admin, regular)
      } = req.body;

      // Replace with your Apple OAuth credentials
      const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID; // Your Apple Service ID (client ID)
      const APPLE_CLIENT_SECRET = process.env.APPLE_CLIENT_SECRET; // Your Apple Client Secret (generated from Apple Developer Console)
      const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID; // Your Apple Team ID (from Apple Developer Console)
      const APPLE_KEY_ID = process.env.APPLE_KEY_ID; // Your Key ID from Apple (from the private key you uploaded in Apple Developer Console)

      // 1. Validate the incoming data (similar to Google signup validation)
      const validateRule = {
        authorizationCode: "string|required",
        idToken: "string|required",
        userType: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
      };

      const validateResult = validateData(
        req.body,
        validateRule,
        validateMessage
      );

      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      // 2. Decode the ID Token (optional but useful for debugging)
      const decodedToken = jwt.decode(idToken, { complete: true });
      console.log("Decoded Apple ID Token:", decodedToken);

      // 3. Exchange authorization code for access and refresh tokens
      const tokenResponse = await axios.post(
        "https://appleid.apple.com/auth/token",
        null,
        {
          params: {
            client_id: APPLE_CLIENT_ID,
            client_secret: APPLE_CLIENT_SECRET,
            code: authorizationCode,
            grant_type: "authorization_code",
            redirect_uri: "https://yourdomain.com/auth/apple/callback", // Replace with your actual redirect URI
          },
        }
      );

      const {
        access_token,
        refresh_token,
        id_token: newIdToken,
      } = tokenResponse.data;

      // 4. Decode the new ID token to get user information
      const payload = jwt.decode(newIdToken);
      const {
        sub: appleId,
        email,
        given_name,
        family_name,
        name,
        picture,
      } = payload;

      // 5. Generate a username based on email or name
      const username = email
        ? email.split("@")[0]
        : name.replace(/\s+/g, "").toLowerCase();

      // 6. Extract first and last names
      const firstName = given_name || name.split(" ")[0];
      const lastName = family_name || name.split(" ").slice(1).join(" ");

      // 7. Check if the user already exists in the database
      const userWithAppleId = await UserModel.findOne({
        $or: [{ appleId }, { email }],
      });

      if (userWithAppleId) {
        // If the user already exists, generate JWT tokens
        const accessToken = await userWithAppleId.generateAccessToken(
          process.env.ACCESS_TOKEN_SECRET || ""
        );
        const refreshToken = await userWithAppleId.generateRefreshToken(
          process.env.REFRESH_TOKEN_SECRET || ""
        );

        return BaseService.sendSuccessResponse({
          message: accessToken,
          user: userWithAppleId,
          refreshToken,
        });
      }

      // 8. Create a new user if the user doesn't exist
      const userObject = {
        appleId,
        firstName,
        lastName,
        username,
        email,
        image: { imageUrl: picture || "", publicId: "" }, // Apple profile image (optional)
        isVerified: true,
        servicePlatform: "apple", // Mark this user as using the "Apple" service for signup
        userType, // You can pass userType from the frontend (e.g., "admin", "regular")
      };

      // 9. Create a new user in the database
      const newUser = new UserModel(userObject);

      await newUser.save();

      // 10. Generate JWT tokens for the newly created user
      const accessToken = await newUser.generateAccessToken(
        process.env.ACCESS_TOKEN_SECRET || ""
      );
      const refreshToken = await newUser.generateRefreshToken(
        process.env.REFRESH_TOKEN_SECRET || ""
      );

      // 11. Send a welcome email or confirmation email to the user
      const emailHtml = `
        <h1>Registration successful</h1>
        <p>Hi <strong>${newUser.email}</strong>,</p>
        <p>You have successfully signed up with Apple.</p>
      `;
      await sendEmail({
        subject: "Welcome to Muta App",
        to: newUser.email,
        html: emailHtml,
      });

      // 12. Send the success response with the access token, user info, and refresh token
      return BaseService.sendSuccessResponse({
        message: accessToken,
        user: newUser,
        refreshToken,
      });
    } catch (error) {
      console.error("Apple Sign-Up Error:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong with the Apple Sign-Up process.",
      });
    }
  }
  async verifyOTP(req) {
    try {
      const post = req.body;

      const validateRule = {
        email: "email|required",
        otp: "string|required",
      };

      const { email, otp } = post;

      const userExists = await UserModel.findOne({ email }).select(
        "otp otpExpiresAt"
      );
      if (empty(userExists)) {
        return BaseService.sendFailedResponse({
          error: "User not found. Please try again later",
        });
      }

      if (empty(userExists.otp)) {
        return BaseService.sendFailedResponse({ error: "OTP not found" });
      }

      if (userExists.otpExpiresAt < new Date()) {
        return BaseService.sendFailedResponse({ error: "OTP expired" });
      }

      if (userExists.otp !== otp) {
        return BaseService.sendFailedResponse({ error: "Invalid OTP" });
      }

      userExists.isVerified = true;
      userExists.otp = "";
      userExists.otpExpiresAt = null;
      await userExists.save();

      const accessToken = await userExists.generateAccessToken(
        process.env.ACCESS_TOKEN_SECRET || ""
      );
      const refreshToken = await userExists.generateRefreshToken(
        process.env.REFRESH_TOKEN_SECRET || ""
      );

      // Send OTP email
      const emailHtml = `
          <h1>Your email has been verified</h1>
          <p>Hi <strong>${userExists.fullName || email}</strong>,</p>
          <p>You have successfully verified your account</p>
      `;
      await sendEmail({
        subject: "Email Verification",
        to: email,
        html: emailHtml,
      });

      return BaseService.sendSuccessResponse({
        message: accessToken,
        user: userExists,
        refreshToken,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async resendOtp(req, res) {
    try {
      const { email } = req.body;

      // validate email
      if (!email) {
        return BaseService.sendFailedResponse({
          error: "Email is required",
        });
      }

      const userExists = await UserModel.findOne({ email }).select("+password");

      if (empty(userExists)) {
        return BaseService.sendFailedResponse({
          error: "User not found. Please register as a new user",
        });
      }

      if (!userExists.isVerified) {
        return BaseService.sendFailedResponse(
          {
            error: "Email is not verified. Please verifiy your email",
          },
          405
        );
      }

      if (userExists.servicePlatform === "google") {
        // If the user signed up via Google, prevent local login attempt
        if (password) {
          return BaseService.sendFailedResponse({
            error:
              "This account was created using Google. Please log in using Google.",
          });
        }
      }

      if (userExists.servicePlatform === "local") {
        if (!userExists.password) {
          return BaseService.sendFailedResponse({
            error:
              "Account created via a different platform. Please use the appropriate platform to log in.",
          });
        }

        // Check if the provided password matches the stored password
        if (!(await userExists.comparePassword(password))) {
          return BaseService.sendFailedResponse({
            error: "Wrong email or password",
          });
        }
      }

      // if (!(await userExists.comparePassword(password))) {
      //   return BaseService.sendFailedResponse({
      //     error: "Wrong email or password",
      //   });
      // }

      const accessToken = await userExists.generateAccessToken(
        process.env.ACCESS_TOKEN_SECRET || ""
      );
      const refreshToken = await userExists.generateRefreshToken(
        process.env.REFRESH_TOKEN_SECRET || ""
      );
      // res.cookie("growe_refresh_token", refreshToken, {
      //   httpOnly: true,
      //   secure: process.env.NODE_ENV === "production",
      //   path: "/",
      //   maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      //   sameSite: "strict",
      // });

      // res.header("Authorization", `Bearer ${accessToken}`);
      // res.header("refresh_token", `Bearer ${refreshToken}`);

      userExists.password = undefined;

      return BaseService.sendSuccessResponse({
        message: accessToken,
        user: userExists,
        refreshToken,
      });
    } catch (error) {
      console.log(error, "the error");
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getUser(req) {
    try {
      const userId = req.user.id;

      let userDetails = {};
      userDetails = await UserModel.findById(userId).select("-password");

      if (empty(userDetails)) {
        return BaseService.sendFailedResponse({
          error: "Something went wrong trying to fetch your account.",
        });
      }

      return BaseService.sendSuccessResponse({ message: userDetails });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      // Validate email
      if (!email) {
        return BaseService.sendFailedResponse({ error: "Email is required" });
      }

      const userExists = await UserModel.findOne({ email });
      if (!userExists) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }
      // Generate OTP
      const otp = generateOTP();
      userExists.resetPasswordOtp = otp;
      const expiresAt = new Date(Date.now() + EXPIRES_AT);
      userExists.resetPasswordOtpExpiresAt = expiresAt;

      await userExists.save();
      // Send OTP email
      const emailHtml = `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
    <h1 style="color: #1A73E8;">Password Reset Request</h1>

    <p>Hi <strong>${userExists.fullName || email}</strong>,</p>

    <p>
      We received a request to reset your password for your
      <strong>Chuvi Laundry</strong> account.
    </p>

    <p>
      Please use the verification code below to continue with the password reset process:
    </p>

    <h2 style="color: #1A73E8; font-size: 32px; margin: 20px 0;">${otp}</h2>

    <p>
      This code is valid for <strong>10 minutes</strong>.
      If you did not request this change, kindly ignore this message — your account remains secure.
    </p>

    <br>

    <p>
      Best regards,<br>
      <strong>Chuvi Laundry Support Team</strong>
    </p>
  </div>
`;

      await sendEmail({
        subject: "Chuvi Laundry — Password Reset Code",
        to: email,
        html: emailHtml,
      });

      // Optional SMS delivery
      await sendSmsOtp(userExists.phoneNumber, `${otp}`);

      // Send response
      return BaseService.sendSuccessResponse({
        message: "Password Reset Request Successful",
      });
    } catch (error) {
      return BaseService.sendFailedResponse({
        error: error.message || "Something went wrong",
      });
    }
  }
  async verifyResetPasswordOtp(req, res) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return BaseService.sendFailedResponse({
          error: "Email and OTP are required",
        });
      }

      const user = await UserModel.findOne({ email }).select(
        "+resetPasswordOtp +resetPasswordOtpExpiresAt"
      );

      if (!user) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      if (!user.resetPasswordOtp || !user.resetPasswordOtpExpiresAt) {
        return BaseService.sendFailedResponse({
          error: "No active OTP found",
        });
      }

      if (user.resetPasswordOtp !== otp) {
        return BaseService.sendFailedResponse({
          error: "Invalid OTP",
        });
      }

      if (Date.now() > user.resetPasswordOtpExpiresAt) {
        return BaseService.sendFailedResponse({
          error: "OTP expired",
        });
      }

      // Issue short-lived reset token
      const resetToken = jwt.sign(
        { userId: user._id },
        process.env.RESET_TOKEN_SECRET,
        { expiresIn: "10m" }
      );

      // Clear OTP immediately (VERY IMPORTANT)
      user.resetPasswordOtp = null;
      user.resetPasswordOtpExpiresAt = null;
      await user.save();

      return BaseService.sendSuccessResponse({
        message: "OTP verified successfully",
        resetToken,
      });
    } catch (error) {
      return BaseService.sendFailedResponse({
        error: error.message || "Something went wrong",
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { resetToken, password } = req.body;

      if (!resetToken || !password) {
        return BaseService.sendFailedResponse({
          error: "Reset token and new password are required",
        });
      }

      const decoded = jwt.verify(resetToken, process.env.RESET_TOKEN_SECRET);

      const user = await UserModel.findById(decoded.userId).select("+password");

      if (!user) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      const isSamePassword = await user.comparePassword(password);
      if (isSamePassword) {
        return BaseService.sendFailedResponse({
          error: "New password cannot be the same as old password",
        });
      }

      user.password = password;
      await user.save();

      return BaseService.sendSuccessResponse({
        message: "Password reset successful",
      });
    } catch (error) {
      return BaseService.sendFailedResponse({
        error: "Reset token expired or invalid",
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const refreshToken = req.headers["x-refresh-token"]; // better than Authorization

      if (!refreshToken) {
        return BaseService.sendFailedResponse({
          error: "No refresh token provided",
        });
      }

      let decoded;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (err) {
        return BaseService.sendFailedResponse({
          error: "Invalid or expired refresh token",
        });
      }

      const newAccessToken = signAccessToken({
        id: decoded.id,
        userType: decoded.userType,
      });

      // Optionally: set as Authorization header or return in body
      res.header("Authorization", `Bearer ${newAccessToken}`);

      return BaseService.sendSuccessResponse({
        message: newAccessToken,
      });
    } catch (err) {
      console.error("Refresh Token Error:", err);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

  async registerAdmin(req, res) {
    try {
  
      const adminEmail = "admin@gmail.com";
  
      const adminExists = await UserModel.findOne({
        email: adminEmail,
        userType: 'admin',
      });
  
      if (adminExists) {
        return BaseService.sendFailedResponse({
          error: "Admin already exists. Please login.",
        });
      }
  
      const admin = new UserModel({
        email: adminEmail,
        password: "Admin@123",
        fullName: "Super Admin",
        phoneNumber: "08000000000",
        userType: 'admin',
        servicePlatform: "local",
        isVerified: true,
      });
  
      await admin.save();
  
      return BaseService.sendSuccessResponse({message: "🎉 Admin seeded successfully:"});
    } catch (error) {
      return BaseService.sendFailedResponse({ error });
    }
  }

  async _handleLogin({ email, password, allowGoogle = false }) {
    const user = await UserModel.findOne({ email }).select("+password");

    if (!user) {
      throw new Error("User not found. Please register as a new user");
    }

    if (!user.isVerified) {
      throw new Error("Email is not verified. Please verify your email");
    }

    // 🔐 Google account protection
    if (user.servicePlatform === "google") {
      if (!allowGoogle) {
        throw new Error(
          "This account was created using Google. Please log in using Google."
        );
      }
    }

    // 🔐 Other providers (facebook, apple, etc.)
    if (user.servicePlatform !== SERVICE_PLATFORM.LOCAL && !allowGoogle) {
      throw new Error(
        `This account was created using ${user.servicePlatform}. Please log in using that platform.`
      );
    }

    // 🔑 Password check (LOCAL only)
    if (user.servicePlatform === SERVICE_PLATFORM.LOCAL) {
      if (!password) {
        throw new Error("Password is required");
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new Error("Wrong email or password");
      }
    }

    const accessToken = await user.generateAccessToken(
      process.env.ACCESS_TOKEN_SECRET || ""
    );

    const refreshToken = await user.generateRefreshToken(
      process.env.REFRESH_TOKEN_SECRET || ""
    );

    user.password = undefined;

    return { user, accessToken, refreshToken };
  }

  async loginUser(req, res) {
    try {
      const post = req.body;
      const { email, password } = post;

      const validateRule = {
        email: "email|required",
        password: "string|required",
      };

      const validateResult = validateData(post, validateRule);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const { user, accessToken, refreshToken } = await this._handleLogin({
        email,
        password,
      });

      return BaseService.sendSuccessResponse({
        message: accessToken,
        user,
        refreshToken,
      });
    } catch (error) {
      return BaseService.sendFailedResponse({ error: error.message });
    }
  }

  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;

      const { user, accessToken, refreshToken } = await this._handleLogin({
        email,
        password,
      });

      if (user.userType !== "admin") {
        return BaseService.sendFailedResponse({
          error: "Access denied. Admins only",
        });
      }

      return BaseService.sendSuccessResponse({
        message: accessToken,
        user,
        refreshToken,
      });
    } catch (error) {
      return BaseService.sendFailedResponse({ error: error.message });
    }
  }
}

module.exports = AuthService;
