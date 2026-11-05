// Prime Marketing Planner settings. Edit this file only; index.html never needs changing for setup.
window.PA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkkONo99vBMR6CuU20ERi6_P6sllnAWHU",
  authDomain: "marketing-b48f5.firebaseapp.com",
  projectId: "marketing-b48f5",
  storageBucket: "marketing-b48f5.firebasestorage.app",
  messagingSenderId: "73817352435",
  appId: "1:73817352435:web:76a072097dd80e8b11ef86"
};
// Who can sign in, and the name shown in edit history. Use the same emails in firestore.rules.
window.PA_TEAM = [
  { name: "Jacinto",   email: "jrsmanahan@gmail.com" },
  { name: "Anne",      email: "anne.nu24@gmail.com" },
  { name: "Christian", email: "christianvelasco858@gmail.com" },
  { name: "Yuan",      email: "jjsmanahan@gmail.com" }
];
// Who can see the Incentives tab (payout pool, deal bonuses, finance statement).
window.PA_ADMINS = ["jrsmanahan@gmail.com"];
// Prime Sales CRM (Supabase). The public (anon) key is safe in a web page; the CRM's own login rules still apply.
// CRM deals whose source starts with one of these count as marketing leads. "Marketing" is ready for when you rename Inbound.
window.PA_CRM = {
  marketingSources: ["Inbound", "Marketing"],
  url: "https://gwclehsjbfeinfdxkuea.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3Y2xlaHNqYmZlaW5mZHhrdWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTEwMTcsImV4cCI6MjEwMTQ4NzAxN30.Tmw_IiEkkgAlvsfj_GPPdN4Bf-aDEunFpwp55zmLzNc"
};
// Who can see the Attendance tab and mark leave.
window.PA_MANAGERS = ["jrsmanahan@gmail.com", "anne.nu24@gmail.com"];
// Who checks in, and their shift. days: 0 = Sun, 1 = Mon … 6 = Sat. grace = minutes after start that still count as on time.
window.PA_SHIFTS = {
  "christianvelasco858@gmail.com": { start: "08:00", grace: 15, days: [1, 2, 3, 4, 5, 6] },
  "jjsmanahan@gmail.com":      { start: "08:00", grace: 15, days: [1, 2, 3, 4, 5, 6] }
};
