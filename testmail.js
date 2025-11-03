import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "ctraianus@gmail.com", // adresa ta completă Gmail
    pass: "lyyu wbgc xvsd jgxd" // parola de aplicație generată
  }
});

try {
  await transporter.sendMail({
    from: "ctraianus@gmail.com",
    to: "ctraianus@gmail.com",
    subject: "Test Gmail Nodemailer",
    text: "✅ Dacă primești acest mesaj, conexiunea funcționează perfect!"
  });

  console.log("✅ Email trimis cu succes!");
} catch (err) {
  console.error("❌ Eroare la trimitere:", err);
}
