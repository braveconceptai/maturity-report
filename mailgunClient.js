const formData = require('form-data');
const Mailgun = require('mailgun.js').default;

// Initialize the v4 client
const mg = new Mailgun(formData).client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY
});

module.exports = mg;
