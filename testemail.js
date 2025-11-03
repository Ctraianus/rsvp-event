const nodemailer = require("nodemailer");

async function testMail() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "ctraianus@gmail.com",
      pass: "PAROLA_APP_GENERATA"
    }
  });

  const info = await transporter.sendMail({
    from: '"RSVP Test" <ctraianus@gmail.com>',
    to: "adresa_ta_de_test@gmail.com",
    subject: "Test Email",
    text: "Hello from RSVP system!"
  });

  console.log("Message sent:", info.messageId);
}

testMail().catch(console.error);
