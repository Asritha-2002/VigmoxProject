const express = require('express');
require('dotenv').config();
const { sendVerificationEmail } = require('./emails'); // your updated file

const app = express();
app.use(express.json());

console.log("SENDGRID KEY:", process.env.SENDGRID_API_KEY);
app.post('/send-email', async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) return res.status(400).json({ error: 'Missing email or token' });

    await sendVerificationEmail(email, token);

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Email service running on port ${PORT}`));