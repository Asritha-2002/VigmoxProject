const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 8200;
console.log("SENDGRID KEY:", process.env.SENDGRID_API_KEY);
// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use('/api/users', userRoutes);
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Database connection with retry logic
const connectDB = async (retries = 5) => {
    const dbURI = process.env.NODE_ENV === 'development' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/bookstore';

    try {
        await mongoose.connect(dbURI);
        console.log('MongoDB Connected Successfully');
    } catch (error) {
        if (retries > 0) {
            console.log(`MongoDB connection failed. Retrying... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return connectDB(retries - 1);
        }
        console.error('MongoDB connection failed after all retries:', error);
        process.exit(1);
    }
};

// Start server
const startServer = async () => {
    await connectDB();
    
    const server = app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
};

// Start the server
startServer().catch(console.error);
