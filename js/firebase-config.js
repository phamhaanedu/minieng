import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// Config lấy từ file firebase.config của bạn
const firebaseConfig = {
  apiKey: "AIzaSyCEJ-MiN2G0RD0BHLCYEs0HTPp77Gkgojs",
  authDomain: "minienglishpractice.firebaseapp.com",
  projectId: "minienglishpractice",
  storageBucket: "minienglishpractice.firebasestorage.app",
  messagingSenderId: "1039828966979",
  appId: "1:1039828966979:web:e4941b7f9f04991a627ef6",
  measurementId: "G-H8WG9RL08P"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };
