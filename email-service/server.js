const express = require('express');
require('dotenv').config();
const { sendVerificationEmail } = require('./emails'); // your updated file

const app = express();
app.use(express.json());

console.log("SendGrid key starts with:", process.env.SENDGRID_API_KEY?.slice(0, 6));
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

const PORT = process.env.PORT;
if (!PORT) {
  console.error("Error: PORT environment variable not set. Exiting...");
  process.exit(1);
}
app.listen(PORT, () => console.log(`Email service running on port ${PORT}`));