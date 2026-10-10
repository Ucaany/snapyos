import { hash } from "@node-rs/argon2";

// Reset password superadmin SnapyOS.
// Usage: node scripts/hash-password.mjs "<password-baru>"
// Output: hash argon2id — paste ke SQL UPDATE users.password_hash.
const pw = process.argv[2];
if (!pw) {
  console.error("usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}
if (pw.length < 8) {
  console.error("Password minimal 8 karakter.");
  process.exit(1);
}
console.log(await hash(pw));
