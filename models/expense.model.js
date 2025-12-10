const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory", required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);


const ExpenseModel = mongoose.model("Expense", expenseSchema);
module.exports = ExpenseModel;
