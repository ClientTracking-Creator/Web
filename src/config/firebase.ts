import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5bY3T1JC9fv8Q9BR_frs0YQtUKQprZ1w",
  authDomain: "clienttrackingapp-43995.firebaseapp.com",
  projectId: "clienttrackingapp-43995",
  storageBucket: "clienttrackingapp-43995.firebasestorage.app",
  messagingSenderId: "641683777161",
  appId: "1:641683777161:web:e1b81865755983d5c48858",
  measurementId: "G-QYXZD2MGV9",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

