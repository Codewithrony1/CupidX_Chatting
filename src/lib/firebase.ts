import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDHpYMElp70g9qZ4N20et460ksdHw9UoO0",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "cupidxchat-3dee5",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "cupidxchat-3dee5.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "64687572264",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:64687572264:web:e2cb7c70769ee3703afc1d",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-8TTFTSEJBE",
};

// Initialize Firebase Client App for Firestore Database (Singleton)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
