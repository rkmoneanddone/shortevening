import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {GOOGLE_WEB_CLIENT_ID} from '../../config/firebase';

export function configureGoogleSignIn() {
  if (!GOOGLE_WEB_CLIENT_ID) return;
  GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});
}

export async function signInWithGoogle() {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google Web Client ID is not configured.');
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;
  if (!idToken) throw new Error('Google Sign-In did not return an ID token.');
  const credential = auth.GoogleAuthProvider.credential(idToken);
  const result = await auth().signInWithCredential(credential);
  const user = result.user;
  const ref = firestore().collection('users').doc(user.uid);
  const existing = await ref.get();
  const now = firestore.FieldValue.serverTimestamp();
  await ref.set({
    uid: user.uid,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    onboardingCompleted: existing.data()?.onboardingCompleted ?? false,
    ...(existing.exists ? {} : {createdAt: now}),
    lastActiveAt: now,
  }, {merge: true});
  return user;
}

export async function signOut() {
  await Promise.allSettled([GoogleSignin.signOut(), auth().signOut()]);
}
