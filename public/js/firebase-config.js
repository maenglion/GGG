// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAK9OUEclgxwHKf1rF5ha4L6Wy76q3xIGw",
  authDomain: "emotion-diary-gpt4.firebaseapp.com",
  projectId: "emotion-diary-gpt4",
  storageBucket: "emotion-diary-gpt4.firebasestorage.app",
  messagingSenderId: "794549082167",
  appId: "1:794549082167:web:41950b8663e58174fa07b2",
  measurementId: "G-B8T024Y3RE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
