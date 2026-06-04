const jwt = require("jsonwebtoken");
const {ulid} =  require("ulid");
const { DELIVERY_SPEED } = require("./constants");
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;

module.exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports.verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};
module.exports.signAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "1h" });
};

module.exports.getCurrentWeekNumber = () => {
  const date = new Date();
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
};

module.exports.formatNotificationTime = (date) => {
  // Example output: "Tue, 12:09 PM"
  const options = { weekday: "short", hour: "numeric", minute: "numeric" };
  return new Intl.DateTimeFormat("en-US", options).format(date);
};

module.exports.getWeightImprovementTipsByWeight = (weightKg, heightCm) => {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  // Determine BMI category
  let bmiCategory = "";
  if (bmi < 16.0) {
    bmiCategory = "underweight";
  } else if (bmi >= 16.0 && bmi < 18.5) {
    bmiCategory = "underweight";
  } else if (bmi >= 18.5 && bmi < 25) {
    bmiCategory = "normal";
  } else if (bmi >= 25 && bmi < 30) {
    bmiCategory = "overweight";
  } else {
    bmiCategory = "obese";
  }

  // Tips dictionary
  const tips = {
    underweight: [
      "Eat more frequently and include healthy snacks.",
      "Increase intake of nutrient-rich foods with good calories.",
      "Incorporate strength training exercises to build muscle mass.",
      "Avoid empty-calorie foods and focus on balanced nutrition.",
      "Consult a nutritionist for a personalized meal plan.",
      "Stay hydrated but avoid drinking water before meals to avoid feeling full.",
    ],
    normal: [
      "Maintain a balanced diet with appropriate portion sizes.",
      "Continue regular physical activity to keep your weight stable.",
      "Include plenty of fruits, vegetables, whole grains, and lean proteins.",
      "Monitor your weight regularly to detect any changes early.",
      "Avoid excessive consumption of processed and sugary foods.",
      "Stay hydrated and get enough sleep.",
    ],
    overweight: [
      "Adopt a calorie-controlled, balanced diet focusing on whole foods.",
      "Increase daily physical activity, including cardio and strength training.",
      "Limit intake of sugary drinks and high-fat foods.",
      "Eat smaller, frequent meals to help control hunger.",
      "Track your food intake to identify and reduce excess calories.",
      "Consult a healthcare provider for personalized weight loss advice.",
    ],
    obese: [
      "Seek guidance from a healthcare professional for a tailored plan.",
      "Focus on a nutrient-dense, low-calorie diet with controlled portions.",
      "Incorporate regular, supervised physical activity gradually.",
      "Avoid fad diets; aim for sustainable, long-term changes.",
      "Consider behavioral therapy or support groups for motivation.",
      "Monitor your progress regularly and adjust your plan as needed.",
    ],
  };

  return (
    tips[bmiCategory] || [
      "Maintain a healthy lifestyle with balanced diet and exercise.",
    ]
  );
};

module.exports.generateOscNumber = () => {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(100000 + Math.random() * 900000);
  return `OSC-${ymd}-${random}`;

  // return `ORD-${ulid()}`;
};


module.exports.addMonths = (date, months = 1)=> {
  const d = new Date(date);

  const day = d.getDate();

  // Move to target month
  d.setMonth(d.getMonth() + months);

  // Fix overflow (e.g Jan 31 → Feb)
  if (d.getDate() < day) {
    d.setDate(0); // last day of previous month
  }

  return d;
}

module.exports.buildStageUpdate = (status, stationStatus, note = '') => ({
    $set: {
        'stage.status': status,
        'stage.note': note,
        'stage.updatedAt': new Date(),
        stationStatus,
    },
    $push: {
        stageHistory: { status, note, updatedAt: new Date() },
    },
})

module.exports.generateReferenceId = ()=>{
  const reference = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  return reference;
}

module.exports.roundToNearestHundred = (amount, strategy = 'round')=> {
  if (!amount || isNaN(amount)) return 0;

  switch (strategy) {
      case 'ceil':
          return Math.ceil(amount / 100) * 100;
      case 'floor':
          return Math.floor(amount / 100) * 100;
      case 'round':
      default:
          return Math.round(amount / 100) * 100;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    ...(isProduction && { domain: ".chuvilaundry.com"}),
    path: '/',
}

module.exports.cookieOptions = cookieOptions;

const normalizePhone = (phone) => {
    if (!phone) return ''
    const digits = phone.replace(/\D/g, '') // strip all non-digits
    if (digits.startsWith('234')) return '0' + digits.slice(3)
    return digits
}

module.exports.normalizePhone = normalizePhone


const calculateDueDate = (deliverySpeed) => {
    const now = new Date()

    switch (deliverySpeed) {
        case DELIVERY_SPEED.SAME_DAY: {
            // cutoff: 10am — orders accepted from midnight to 10am only
            const cutoff = new Date(now)
            cutoff.setHours(10, 0, 0, 0)

            if (now > cutoff) {
                return null // ← signal to block the order at creation
            }

            // due today by 7pm
            const due = new Date(now)
            due.setHours(19, 0, 0, 0)
            return due
        }

        case DELIVERY_SPEED.EXPRESS: {
            // cutoff: 2pm — orders accepted from midnight to 2pm only
            const cutoff = new Date(now)
            cutoff.setHours(14, 0, 0, 0)

            if (now > cutoff) {
                return null // ← signal to block the order at creation
            }

            // due tomorrow by 7pm
            const due = new Date(now)
            due.setDate(due.getDate() + 1)
            due.setHours(19, 0, 0, 0)
            return due
        }

        case DELIVERY_SPEED.STANDARD:
        default: {
            // no cutoff for standard — due day after tomorrow by 7pm
            const due = new Date(now)
            due.setDate(due.getDate() + 2)
            due.setHours(19, 0, 0, 0)
            return due
        }
    }
}

module.exports.calculateDueDate = calculateDueDate;

