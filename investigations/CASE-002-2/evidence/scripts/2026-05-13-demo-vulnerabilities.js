/**
 * demo-vulnerabilities.js
 *
 * FORENSIC DEMO FILE — Intentionally Vulnerable Code
 * Purpose: Demonstrate CodeQL static analysis detection
 * in the context of the Secure DevOps forensic pipeline.
 *
 * Vulnerabilities included:
 *   1. Cross-Site Scripting (XSS) — CWE-79
 *   2. SQL Injection — CWE-89
 *   3. Hardcoded credentials — CWE-798
 *   4. Path Traversal — CWE-22
 *   5. Eval injection — CWE-95
 *   6. Insecure randomness — CWE-338
 */

// ─────────────────────────────────────────────────────────
// VULNERABILITY 1: Cross-Site Scripting (XSS) — CWE-79
// CodeQL rule: js/xss
// User-controlled input is written directly into innerHTML
// without sanitization — attacker can inject arbitrary HTML/JS.
// ─────────────────────────────────────────────────────────
function renderUserProfile(userId) {
  // Simulate fetching user data from URL parameter
  const username = new URLSearchParams(window.location.search).get("user");

  // VULNERABLE: direct innerHTML assignment with unsanitized input
  document.getElementById("profile").innerHTML =
    "<h1>Welcome, " + username + "</h1>";

  // VULNERABLE: document.write with user input
  document.write("<p>User ID: " + userId + "</p>");
}

// ─────────────────────────────────────────────────────────
// VULNERABILITY 2: SQL Injection — CWE-89
// CodeQL rule: js/sql-injection
// User input concatenated directly into SQL query string.
// Attacker can manipulate the query logic (e.g. ' OR '1'='1).
// ─────────────────────────────────────────────────────────
const mysql = require("mysql");
const db = mysql.createConnection({ host: "localhost" });

function getUserData(req, res) {
  const userId = req.query.id; // untrusted user input

  // VULNERABLE: string concatenation in SQL query
  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
  db.query(query, (err, results) => {
    res.json(results);
  });
}

// ─────────────────────────────────────────────────────────
// VULNERABILITY 3: Hardcoded Credentials — CWE-798
// CodeQL rule: js/hardcoded-credentials
// Secret Scanning will also flag these.
// Private keys and passwords embedded in source = instant
// compromise if repo is ever made public or leaked.
// ─────────────────────────────────────────────────────────
const config = {
  // VULNERABLE: hardcoded database password
  db_password: "Sup3rS3cr3tP@ssw0rd!",

  // VULNERABLE: hardcoded API key
  api_key: "sk-live-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd",

  // VULNERABLE: hardcoded JWT secret
  jwt_secret: "my-super-secret-jwt-key-do-not-share",

  // VULNERABLE: hardcoded AWS-style key (triggers Secret Scanning)
  aws_access_key: "AKIAIOSFODNN7EXAMPLE",
  aws_secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

// ─────────────────────────────────────────────────────────
// VULNERABILITY 4: Path Traversal — CWE-22
// CodeQL rule: js/path-injection
// User-supplied filename used in file system operations
// without validation — attacker can read arbitrary files
// e.g. ../../etc/passwd
// ─────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

function downloadFile(req, res) {
  const filename = req.query.file; // untrusted input

  // VULNERABLE: no path sanitization before file read
  const filePath = "/var/www/uploads/" + filename;
  const fileContent = fs.readFileSync(filePath);
  res.send(fileContent);
}

// ─────────────────────────────────────────────────────────
// VULNERABILITY 5: Code Injection via eval() — CWE-95
// CodeQL rule: js/code-injection
// Executing user-supplied string as code is one of the most
// dangerous patterns — full remote code execution possible.
// ─────────────────────────────────────────────────────────
function calculateExpression(req, res) {
  const expression = req.body.formula; // untrusted input

  // VULNERABLE: eval() with user-controlled input
  const result = eval(expression);
  res.json({ result });
}

// ─────────────────────────────────────────────────────────
// VULNERABILITY 6: Insecure Randomness — CWE-338
// CodeQL rule: js/insecure-randomness
// Math.random() is not cryptographically secure — predictable.
// Should use crypto.randomBytes() for tokens/session IDs.
// ─────────────────────────────────────────────────────────
function generateSessionToken() {
  // VULNERABLE: Math.random() for security-sensitive token
  const token = Math.random().toString(36).substring(2);
  return token;
}

function generatePasswordResetToken(userId) {
  // VULNERABLE: predictable token based on Math.random()
  return "reset-" + userId + "-" + Math.random().toString(36).slice(2);
}

module.exports = {
  renderUserProfile,
  getUserData,
  downloadFile,
  calculateExpression,
  generateSessionToken,
  generatePasswordResetToken,
};
