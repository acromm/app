/**
 * Module dependencies.
 */

var mandrill = require('mandrill-api/mandrill');
var log = require('debug')('mandrill-mailer');

var config = {};

module.exports = function (app) {
  config = app.get('config');
}

module.exports.send = function send(citizen, subject, body, cb) {
  var mandrillKey = config.mandrillMailer.key;
  var fromEmail = config.mandrillMailer.from.email;
  var fromName = config.mandrillMailer.from.name;
  var mandrill_client = new mandrill.Mandrill(mandrillKey);
  log('Sending email to citizen %j, subject %s, body %s', citizen, subject, body);

  var message = {
    "html": body,
    "text": body,
    "subject": subject,
    "from_email": fromEmail,
    "from_name": fromName,
    "to": [{
            "email": citizen.email,
            "name": citizen.fullName
        }],
    "auto_text" : true
  };
  mandrill_client.messages.send({"message": message, "async": false, "ip_pool": "Main Pool", "send_at": null}, 
    function(result) {
      log(result);
      cb(null);
    },
    function(e) {
      log('A mandrill error occurred: ' + e.name + ' - ' + e.message);
      cb(e);
    });
  return this;
}