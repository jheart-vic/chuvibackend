const mongoose = require('mongoose')

// A Set = named catalog group of real, individually-priced pieces. No
// set-level price; an order's total is the sum of ONLY the pieces selected,
// and each selected piece is booked as its own countable order item.
const PieceSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        price: { type: Number, required: true },
        isHeavy: { type: Boolean, default: false },
    },
    { _id: true },
)

const itemSetSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        pieces: { type: [PieceSchema], default: [] },
        active: { type: Boolean, default: true },
    },
    { timestamps: true },
)

const ItemSetModel = mongoose.model('ItemSet', itemSetSchema)
module.exports = ItemSetModel
