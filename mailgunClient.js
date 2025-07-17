// mailgunClient.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');

// Initialize the Mailgun v3 client
const mg = new Mailgun(formData).client({
  username: 'api',                    // always “api” for Mailgun
  key:      process.env.MAILGUN_API_KEY
});

module.exports = mg;
