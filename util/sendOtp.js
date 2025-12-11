const axios = require("axios");
const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID;

const sendSmsOtp = async (phoneNumber, code) => {
  try {
    const phoneNo = formatPhoneNumber(phoneNumber);
    // console.log({phoneNo, code})
    const response = await axios.post(
      "https://api.ng.termii.com/api/sms/send",
      {
        api_key: TERMII_API_KEY,
        to: phoneNo, // e.g. '2349012345678'
        // to: '+2348111158225', // e.g. '2349012345678'
        from: TERMII_SENDER_ID, // Use 'Termii' or your sender ID
        //   from: TERMII_SENDER_ID,// Use 'Termii' or your sender ID
        channel: "generic", // Options: generic, dnd, whatsapp
        type: "plain",
        //   sms: code,
        sms: `Your verification code is ${code}`,
      }
    );

    // console.log('OTP response:', response.data);
    return response.data;
  } catch (error) {
    console.error("Error sending OTP:", error.response?.data || error.message);
    throw error;
  }
};

function formatPhoneNumber(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    return "234" + digits.slice(1);
  }
  if (digits.startsWith("234")) {
    return digits;
  }
  return digits; // fallback (already international format)
}

module.exports = sendSmsOtp;
