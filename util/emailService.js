const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: false,
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS
//   },
//   tls: { rejectUnauthorized: false }
// })

const transporter = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000, // 10s
  socketTimeout: 10000,
});

const sendEmail = async ({ subject = "New Mail", html, to }) => {
  try {
    if (!to || !subject || !html) {
      console.log("Missing email fields");
      return false;
    }

    const info = await transporter.sendMail({
      from: `"${process.env.APP_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log("Mail sent:", info.response);
    return true;
  } catch (error) {
    console.error("Error sending mail:", error.message);
    return false;
  }
};

module.exports = sendEmail;

