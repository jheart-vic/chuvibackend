// const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST || "mail.privateemail.com",
//   port: Number(process.env.SMTP_PORT) || 587,
//   secure: false,
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS,
//   },
//   tls: {
//     rejectUnauthorized: false,
//   },
// });


// transporter.verify((error, success) => {
//   if (error) {
//     console.error("❌ SMTP connection failed:", error.message);
//   } else {
//     console.log("✅ SMTP connected successfully");
//   }
// });

// const sendEmail = async ({ subject = "New Mail", html, to }) => {
//   try {
//     if (!to || !subject || !html) {
//       console.log("❌ Missing email fields");
//       return false;
//     }

//     const info = await transporter.sendMail({
//       from: `"${process.env.APP_NAME || "My App"}" <${process.env.SMTP_USER}>`,
//       to,
//       subject,
//       html,
//     });

//     console.log("✅ Mail sent:", info.messageId);
//     return true;
//   } catch (error) {
//     console.error("❌ Error sending mail:", error.message);
//     return false;
//   }
// };

// module.exports = sendEmail;


const axios = require("axios");

const sendEmail = async ({ to, subject = "New Mail", html }) => {
  try {
    if (!to || !subject || !html) {
      console.error("❌ Missing email fields");
      return false;
    }

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: process.env.EMAIL_FROM,
          name: process.env.APP_NAME || "My App",
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Email sent via Brevo");
    return true;
  } catch (error) {
    console.error(
      "❌ Brevo email error:",
      error.response?.data || error.message
    );
    return false;
  }
};

module.exports = sendEmail;