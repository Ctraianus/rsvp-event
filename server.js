import express from "express";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";


const app = express();
app.use(express.json());
app.use(express.static("public"));


// Directoare
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const VIEWS_DIR = path.join(__dirname, "views");

const GUESTS_FILE = path.join(DATA_DIR, "guests.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const RESPONSES_FILE = path.join(DATA_DIR, "responses.csv");

// asigură-te că fișierele există
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GUESTS_FILE)) fs.writeFileSync(GUESTS_FILE, "[]", "utf8");
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, "id,name,date,time,location,description\n", "utf8");
if (!fs.existsSync(RESPONSES_FILE)) fs.writeFileSync(RESPONSES_FILE, "id,eventId,company,person,email,status,date\n", "utf8");

app.use(express.static(VIEWS_DIR));

/* ---------------------------
   Helpers
--------------------------- */
function readGuests() {
  try { return JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8")); }
  catch { return []; }
}

function writeGuests(data) {
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readEvents() {
  try { return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8")); }
  catch { return []; }
}

function appendResponse(line) {
  fs.appendFileSync(RESPONSES_FILE, line, "utf8");
}

/* ===========================================================
   API Guests
=========================================================== */

app.get("/api/guests", (req, res) => {
  res.json(readGuests());
});

/* ===========================================================
   API Events
=========================================================== */

app.get("/api/events", (req, res) => {
  res.json(readEvents());
});

/* ===========================================================
   Send Emails (POST /api/sendEmails)
=========================================================== */

app.post("/api/sendEmails", async (req, res) => {
  const { subject, message, recipients, eventId } = req.body;

  if (!eventId || !subject || !message || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, message: "subject, message and recipients required" });
  }

  const events = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
  const ev = events.find(e => e.id === eventId);

  if (!ev) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "ctraianus@gmail.com",
      pass: "lyyu wbgc xvsd jgxd"
    }
  });

  let sent = 0;

  for (const { email, name } of recipients) {
    const company = "Ambasada României la New Delhi";
    const qrText = `Event: ${ev.titlu}\nDate: ${ev.data}\nCompany: ${company}\nName: ${name}`;
    
    // ✅ Generate QR as buffer
    const qrBuffer = await QRCode.toBuffer(qrText);

    const confirmUrl = `http://localhost:3000/confirm?event=${encodeURIComponent(ev.id)}&email=${encodeURIComponent(email)}&status=confirmed`;
    const declineUrl = `http://localhost:3000/confirm?event=${encodeURIComponent(ev.id)}&email=${encodeURIComponent(email)}&status=declined`;

    // ✅ Reference QR as cid:image
    const html = `
      <div style="font-family:'Georgia',cursive;padding:20px;text-align:center;color:#222;">
        <img src="https://newdelhi.mae.ro/sites/all/themes/mae_ek/images/logo.png"
             alt="Logo" style="max-width:140px;margin-bottom:20px;display:block;margin-left:auto;margin-right:auto;">
        <h2 style="font-family:'Brush Script MT','Lucida Handwriting',cursive;font-size:28px;color:#1a1a1a;margin-bottom:16px;">
          Invitation to ${ev.titlu}
        </h2>
        <p style="font-size:16px;color:#444;margin-bottom:10px;"><strong>Date:</strong> ${ev.data}</p>
        <p style="font-size:16px;color:#444;margin-bottom:20px;"><strong>Location:</strong> ${ev.locatie || 'TBA'}</p>

        <div style="text-align:left;padding:10px 25px;">
          ${message.replace(/{{\s*name\s*}}/gi, name).replace(/\n/g, "<br>")}
        </div>

        <div style="text-align:center;padding:20px;">
          <img src="cid:qrcode"
               alt="QR Code"
               style="display:block;margin:0 auto;margin-top:10px;max-width:150px;border:1px solid #eee;border-radius:8px;">
          <p style="color:#777;font-size:13px;margin-top:6px;text-align:center;">
            Scan for event details
          </p>
        </div>

        <div style="margin-top:30px;">
          <a href="${confirmUrl}" style="background:#2e7d32;color:#fff;text-decoration:none;padding:10px 20px;border-radius:5px;margin:5px;">Confirm attendance</a>
          <a href="${declineUrl}" style="background:#c62828;color:#fff;text-decoration:none;padding:10px 20px;border-radius:5px;margin:5px;">Regretfully decline</a>
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Event Organizer" <${transporter.options.auth.user}>`,
        to: email,
        subject,
        html,
        attachments: [
          {
            filename: "qrcode.png",
            content: qrBuffer,
            cid: "qrcode" // Must match src="cid:qrcode"
          }
        ]
      });

      console.log(`✅ Sent to ${email}`);
      sent++;
    } catch (err) {
      console.error(`❌ Failed for ${email}:`, err.message);
    }
  }

  res.json({ success: true, sent });
});


/* ===========================================================
   RSVP Confirmation (GET /confirm)
=========================================================== */

app.get("/confirm", (req, res) => {
  const { event, email, status } = req.query;
  const guests = readGuests();
  const events = readEvents();
  const ev = events.find(e => e.id === event);

  let companyName = "";
  let personName = "";

  outer: for (const c of guests) {
    for (const p of c.persoane || []) {
      if (p.email === email) {
        companyName = c.companie;
        personName = p.nume;
        break outer;
      }
    }
  }

  const id = Date.now().toString();
  const date = new Date().toISOString();
  const line = `${id},${ev.id || ""},${companyName},${personName},${email || ""},${status || ""},${date}\n`;
  appendResponse(line);

  const msg = status === "confirmed"
    ? "✅ Thank you — your attendance is confirmed."
    : "❌ Your response has been recorded.";

  res.send(`
    <div style="font-family:sans-serif;padding:2rem;text-align:center;">
      <h2>${msg}</h2>
      <p>Event: ${ev ? ev.titlu : "(Unknown event)"}<br>
         Name: ${personName || email}</p>
      <p>You may close this window.</p>
    </div>
  `);
});

/* ===========================================================
   Responses API
=========================================================== */

app.get("/api/responses", (req, res) => {
  if (!fs.existsSync(RESPONSES_FILE)) return res.json([]);
  const raw = fs.readFileSync(RESPONSES_FILE, "utf8").trim();
  const rows = raw.split("\n").slice(1).filter(Boolean);
  const data = rows.map(line => {
    const [id, eventId, company, person, email, status, date] = line.split(",");
    return { id, eventId, company, person, email, status, date };
  });
  res.json(data);
});



/* ---------------------------
  Guests CRUD routes
----------------------------*/

/* ===========================================================
   Guests API (companies + persons)
   =========================================================== */

app.get("/api/guests", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    res.json(data);
  } catch (err) {
    console.error("Error reading guests:", err);
    res.status(500).json({ success: false, message: "Failed to read guests" });
  }
});

app.post("/api/guests", (req, res) => {
  try {
    const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    const newCompany = {
      id: Date.now().toString(),
      companie: req.body.companie || "",
      adresa: req.body.adresa || "",
      telefon: req.body.telefon || "",
      email: req.body.email || "",
      persoane: []
    };
    guests.push(newCompany);
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true, company: newCompany });
  } catch (err) {
    console.error("Error adding company:", err);
    res.status(500).json({ success: false, message: "Failed to add company" });
  }
});

app.put("/api/guests/:id", (req, res) => {
  try {
    const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    const idx = guests.findIndex(g => g.id === req.params.id);
    if (idx === -1)
      return res.status(404).json({ success: false, message: "Company not found" });

    guests[idx] = { ...guests[idx], ...req.body };
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true, company: guests[idx] });
  } catch (err) {
    console.error("Error updating company:", err);
    res.status(500).json({ success: false, message: "Failed to update company" });
  }
});

app.delete("/api/guests/:id", (req, res) => {
  try {
    let guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    guests = guests.filter(g => g.id !== req.params.id);
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting company:", err);
    res.status(500).json({ success: false, message: "Failed to delete company" });
  }
});

app.post("/api/guests/:id/person", (req, res) => {
  try {
    const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    const company = guests.find(c => c.id === req.params.id);
    if (!company)
      return res.status(404).json({ success: false, message: "Company not found" });

    const newPerson = {
      id: Date.now().toString(),
      nume: req.body.nume || "",
      functie: req.body.functie || "",
      email: req.body.email || "",
      activ: req.body.activ === undefined ? true : !!req.body.activ
    };

    company.persoane = company.persoane || [];
    company.persoane.push(newPerson);

    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true, person: newPerson });
  } catch (err) {
    console.error("Error adding person:", err);
    res.status(500).json({ success: false, message: "Failed to add person" });
  }
});

app.put("/api/guests/:id/person/:pid", (req, res) => {
  try {
    const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    const company = guests.find(c => c.id === req.params.id);
    if (!company)
      return res.status(404).json({ success: false, message: "Company not found" });

    const person = company.persoane.find(p => p.id === req.params.pid);
    if (!person)
      return res.status(404).json({ success: false, message: "Person not found" });

    Object.assign(person, req.body);
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true, person });
  } catch (err) {
    console.error("Error editing person:", err);
    res.status(500).json({ success: false, message: "Failed to edit person" });
  }
});

app.delete("/api/guests/:id/person/:pid", (req, res) => {
  try {
    const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    const company = guests.find(c => c.id === req.params.id);
    if (!company)
      return res.status(404).json({ success: false, message: "Company not found" });

    company.persoane = company.persoane.filter(p => p.id !== req.params.pid);
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting person:", err);
    res.status(500).json({ success: false, message: "Failed to delete person" });
  }
});


/* ===========================================================
   Events API
   =========================================================== */

app.get("/api/events", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    res.json(data);
  } catch (err) {
    console.error("Error reading events:", err);
    res.status(500).json({ success: false, message: "Failed to read events" });
  }
});

app.post("/api/events", (req, res) => {
  try {
    const events = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    const newEvent = {
      id: Date.now().toString(),
      titlu: req.body.titlu || "",
      data: req.body.data || "",
      ora: req.body.ora || "",
      locatie: req.body.locatie || "",
      descriere: req.body.descriere || "",
      activ: req.body.activ === undefined ? true : !!req.body.activ
    };
    events.push(newEvent);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
    res.json({ success: true, event: newEvent });
  } catch (err) {
    console.error("Error adding event:", err);
    res.status(500).json({ success: false, message: "Failed to add event" });
  }
});

app.put("/api/events/:id", (req, res) => {
  try {
    const events = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    const idx = events.findIndex(e => e.id === req.params.id);
    if (idx === -1)
      return res.status(404).json({ success: false, message: "Event not found" });

    events[idx] = { ...events[idx], ...req.body };
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
    res.json({ success: true, event: events[idx] });
  } catch (err) {
    console.error("Error updating event:", err);
    res.status(500).json({ success: false, message: "Failed to update event" });
  }
});

app.delete("/api/events/:id", (req, res) => {
  try {
    let events = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    events = events.filter(e => e.id !== req.params.id);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({ success: false, message: "Failed to delete event" });
  }
});



/* ===========================================================
   Start server
=========================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));