const { empty } = require("../util");
const axios = require("axios");

class BaseService {
  constructor() {
    this.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    this.server_error_message = "Something went wrong. Please try again later";
    this.base_url =
      process.env.NODE_ENV === "development"
        ? "http://localhost:5173/"
        : "https://app-sar.onrender.com/";
    this.pay_connect_header = {
      Authorization: `Token ${process.env.PAYCONNECT_TOKEN}`,
      "Content-Type": "application/json",
    };
    this.payconnect_token = process.env.PAYCONNECT_TOKEN
  }

//   async requestToPayConnect(action, url, data = null) {
//     try {
//       const baseService = new BaseService();
//       const payconnectHeader = baseService.pay_connect_header;
  
//       const config = {
//         method: action,
//         url: 'https://mypayconnect.com/api/' + url,
//         headers: payconnectHeader,
//         data: data,
//       };
  
//       const res = await axios(config);
//       console.log({ res: res.data });
//       return res.data;
//     } catch (error) {
//       console.error("Error fetching data:", error.message);
//       throw error;
//     }
//   }

  async requestToPayConnect() {
    try {
      const baseService = new BaseService();
      const payconnectHeader = baseService.pay_connect_header;
      const res = await axios.get("https://mypayconnect.com/api/get/network/", {
        headers: payconnectHeader,
      });
      console.log({ res: res.data });
      return res;
    } catch (error) {
      console.error("Error fetching data:", error.message);
    }
  }

  static sendFailedResponse(data, statusCode = 400) {
    const returnData = { success: false };
    if (!empty(data) || data === "0" || data === 0 || data === "") {
      returnData.data = data;
      returnData.data.statusCode = statusCode;
    }
    return returnData;
  }

  static sendSuccessResponse(data) {
    const returnData = { success: true };
    if (!empty(data) || data === 0 || data === "0" || data === "") {
      returnData.data = data;
    }
    return returnData;
  }
}

module.exports = BaseService;
