const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Keep-alive endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ONECTRA Bot Running', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Start the actual bot
console.log('Starting ONECTRA Wallet Bot...');
require('./bot.js');
