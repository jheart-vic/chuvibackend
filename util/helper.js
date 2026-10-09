const jwt = require("jsonwebtoken");
const {ulid} =  require("ulid");
const { DELIVERY_SPEED } = require("./constants");
const mongoose = require("mongoose");
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

// ONE canonical form for a Nigerian number: 0 + 10 local digits ("08031234567").
//
// Brief 4.6 — "one customer's phone shows with the leading 0 on one order and
// without it on another ... one person is never two profiles." The old version
// only stripped a 234 prefix, so the bare 10-digit form ("8031234567") came back
// UNCHANGED and therefore did not match the same number written "08031234567".
// Since CRM identity links by normalised phone, that one gap is enough to split a
// customer into two profiles.
const normalizePhone = (phone) => {
    if (!phone && phone !== 0) return ''
    let digits = String(phone).replace(/\D/g, '') // strip all non-digits
    if (!digits) return ''
    // Strip the country code in any of its written forms, THEN any trunk zero —
    // "+234 (0) 803 …" carries both, and handling only one of them produced a
    // double zero.
    if (digits.startsWith('00234')) digits = digits.slice(5)
    else if (digits.startsWith('234')) digits = digits.slice(3)
    digits = digits.replace(/^0+/, '')
    // What is left is the 10-digit local number; stamp the single 0 back on.
    return digits ? '0' + digits : ''
}

module.exports.normalizePhone = normalizePhone


/**
 * The order's internal DEADLINE.
 *
 * ⚠️ READ THIS BEFORE CHANGING THE 19:00.
 *
 * The time on this value is an END-OF-DAY SENTINEL, not a promise. ~10 readers
 * compare it as an instant — `deliveryDate < now` is "overdue" on the admin
 * dashboard, `{$gte: now, $lte: todayEnd}` is the "due today" bucket, and
 * `util/holdSla.js` has a past-delivery-date breach branch. Repointing it at a
 * window's end time would shift every one of those boundaries for no gain.
 *
 * The customer-facing promise is a SEPARATE thing and lives on
 * `scheduling.delivery` (client D1: the window replaces the old "by 7pm"
 * wording, which, for the record, was never actually said to a customer
 * anywhere — it existed only in these comments, and the bot prints the date
 * with `toDateString()`, which drops the time). Keep the two apart: one field
 * doing both "when we must be done" and "what we told the customer" is how the
 * hold-SLA table became three copies that had already drifted.
 *
 * `workingDays` (client D6(b), OPTIONAL for backward compatibility): the
 * promised date must skip days the business is closed. Without it, a standard
 * order booked on a Saturday is due Monday — and with Monday unticked that
 * order is marked OVERDUE on a day nobody was working, and trips the hold
 * breach branch. Callers that have the admin settings to hand should always
 * pass this; omitting it keeps the original calendar-day behaviour exactly.
 */
const calculateDueDate = (deliverySpeed, workingDays = null) => {
    const now = new Date()
    const { addWorkingDays } = require('./bookingWindow')

    // Advance by calendar days (legacy) or working days (D6(b)), then pin the
    // end-of-day sentinel. `addWorkingDays(date, 0)` is "today if today is a
    // working day, else the next one", which is what same-day needs.
    const dueDay = (daysAhead) => {
        if (workingDays) {
            const day = addWorkingDays(now, daysAhead, workingDays)
            if (!day) return null // no working day within reach
            const due = new Date(day)
            due.setHours(19, 0, 0, 0)
            return due
        }
        const due = new Date(now)
        due.setDate(due.getDate() + daysAhead)
        due.setHours(19, 0, 0, 0)
        return due
    }

    switch (deliverySpeed) {
        case DELIVERY_SPEED.SAME_DAY: {
            // cutoff: 10am — orders accepted from midnight to 10am only
            const cutoff = new Date(now)
            cutoff.setHours(10, 0, 0, 0)

            if (now > cutoff) {
                return null // ← signal to block the order at creation
            }

            // due today by the end-of-day sentinel
            return dueDay(0)
        }

        case DELIVERY_SPEED.EXPRESS: {
            // cutoff: 2pm — orders accepted from midnight to 2pm only
            const cutoff = new Date(now)
            cutoff.setHours(14, 0, 0, 0)

            if (now > cutoff) {
                return null // ← signal to block the order at creation
            }

            // due the next working day
            return dueDay(1)
        }

        case DELIVERY_SPEED.STANDARD:
        default: {
            // no cutoff for standard — due two working days out
            return dueDay(2)
        }
    }
}

module.exports.calculateDueDate = calculateDueDate;


function getObjectId(userId) {
  // Always check if the string is a valid 24-character hex ID first
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null; // Or throw an error, depending on your needs
  }
  
  return new mongoose.Types.ObjectId(userId);
}

module.exports.getObjectId = getObjectId
