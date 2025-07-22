// mailgunClient.js
const formData = require('form-data');
// note the .default here:
const Mailgun  = require('mailgun.js').default;

// initialize the v4 client
const mg = new Mailgun(formData).client({
  username: 'api',                    // always "api" for Mailgun
  key:      process.env.MAILGUN_API_KEY
});

module.exports = mg;
