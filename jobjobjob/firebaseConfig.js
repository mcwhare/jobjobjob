// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBfoMQIsSMWAAJyuNaBWshLw9GXHTCeWUE",
  authDomain: "jobjobjob-adb13.firebaseapp.com",
  projectId: "jobjobjob-adb13",
  storageBucket: "jobjobjob-adb13.firebasestorage.app",
  messagingSenderId: "264315018590",
  appId: "1:264315018590:web:79f5cc1fee12ae3673c3cf",
  measurementId: "G-QERXV6N13X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);