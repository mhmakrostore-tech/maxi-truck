
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyBekPHpWxzy-LUK0ci0cmMLyCvJwqHvcTs",
  authDomain: "maxi-truck.firebaseapp.com",
  projectId: "maxi-truck",
  storageBucket: "maxi-truck.firebasestorage.app",
  messagingSenderId: "199697622155",
  appId: "1:199697622155:web:70a8194bbb57a75ca3208e"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where, orderBy
};
