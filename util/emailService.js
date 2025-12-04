const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: { rejectUnauthorized: false }
})


const sendEmail = async ({
  subject = "New Mail",
  html,
  to,
}) => {
  try {
    if (!to || !subject || !html) {
      console.log({
        success: false,
        message: "Please provide email options to from subject html",
      });
      return false;
    }
    transporter.sendMail({to, subject, html,  from: `"${process.env.APP_NAME}" <${process.env.SMTP_USER}>`}, (err, info) => {
      if (err) {
        return console.log("Error sending mail:", err.message);
      }
      console.log("Mail sent!", info.response);
    });
    return true;
  } catch (error) {
    console.log(error.message, "caught error here");
  }
};

module.exports = sendEmail;
