const mongoose = require("mongoose");

const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);


const ExpenseCategoryModel = mongoose.model("ExpenseCategory", expenseCategorySchema);
module.exports = ExpenseCategoryModel;
