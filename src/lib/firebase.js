import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase web config.
 *
 * These values are public by design. They name the project; they do not grant
 * access to it. Anyone can read them straight out of the deployed JavaScript,
 * and that is expected and fine — Google documents it as safe to commit.
 *
 * The real access control is in firestore.rules, which runs on Google's
 * servers and cannot be bypassed by editing the app.
 *
 * Fill these in from: Firebase console -> Project settings (gear icon) ->
 * "Your apps" -> the web app -> "SDK setup and configuration" -> Config.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBlMM0x3omJqQk_ch6y0-lN5TPeutRCjyY',
  authDomain: 'pm-tool-4d33e.firebaseapp.com',
  projectId: 'pm-tool-4d33e',
  storageBucket: 'pm-tool-4d33e.firebasestorage.app',
  messagingSenderId: '40766596737',
  appId: '1:40766596737:web:70626aa05240a1d395cf80',
};

/**
 * The account that always keeps admin access, so a mistake in the members
 * list can never lock everyone out. This MUST match owner() in
 * firestore.rules — the rules are what actually enforce it; this copy only
 * lets the app show the right thing before the server answers.
 */
export const OWNER_EMAIL = 'mikescrawfordli@gmail.com';

/** True until the config above has actually been filled in. */
export const configPlaceholder = firebaseConfig.apiKey.startsWith('PASTE_');

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}
