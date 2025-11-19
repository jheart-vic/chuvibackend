const mongoose = require('mongoose');

const connectToMongoDB = async (mongoURL) => {
  try {
    await mongoose.connect(mongoURL);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

module.exports = connectToMongoDB;
