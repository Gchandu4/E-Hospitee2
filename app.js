const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "appDB",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "12345",
  port: process.env.DB_PORT || 5432,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL,
        role VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(150) UNIQUE NOT NULL,
        mobile VARCHAR(20),
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'patient',
        dob DATE,
        blood_group VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database ready.");
  } catch (err) {
    console.error("DB init failed (server will still start):", err.message);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "static")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, error: "All fields are required." });
  }
  try {
    await pool.query(
      "INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)",
      [name.trim(), email.trim(), message.trim()]
    );
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error." });
  }
});

app.post("/waitlist", async (req, res) => {
  const { name, email, role } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ success: false, error: "Name and email are required." });
  }
  try {
    await pool.query(
      "INSERT INTO waitlist (name, email, role) VALUES ($1, $2, $3)",
      [name.trim(), email.trim(), role || null]
    );
    res.json({ success: true, message: "You're on the waitlist!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error." });
  }
});

app.post("/signup", async (req, res) => {
  const { firstName, lastName, email, mobile, password, role, dob, bloodGroup } = req.body;
  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ success: false, error: "Email and password are required." });
  }
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: "Email already registered." });
    }
    const hash = await bcrypt.hash(password, 4);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, mobile, password_hash, role, dob, blood_group)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, first_name, last_name, email, role`,
      [firstName?.trim() || null, lastName?.trim() || null, email.trim(), mobile?.trim() || null,
       hash, role || "patient", dob || null, bloodGroup || null]
    );
    const user = result.rows[0];
    const year = new Date().getFullYear();
    user.patient_id = `${year}-${String(user.id).padStart(3, '0')}`;
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error." });
  }
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ success: false, error: "Email and password are required." });
  }
  try {
    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role, mobile, dob, blood_group, created_at, password_hash FROM users WHERE email = $1",
      [email.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }
    const { password_hash, ...safeUser } = user;
    const year = new Date(safeUser.created_at || Date.now()).getFullYear();
    safeUser.patient_id = `${year}-${String(safeUser.id).padStart(3, '0')}`;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error." });
  }
});

initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running at http://localhost:${PORT}`));
});
