import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
