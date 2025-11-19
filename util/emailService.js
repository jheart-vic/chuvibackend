const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.NODEMAILER_PASS,
  },
});

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
    transporter.sendMail({to, subject, html, from: "groweapp@support.com"}, (err, info) => {
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
