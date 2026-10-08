import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import {getFunctions} from 'firebase/functions';
import {initializeAppCheck,ReCaptchaEnterpriseProvider} from 'firebase/app-check';

const config = {
  apiKey: 'AIzaSyDK1rQLItZOBsI61BKrU-Ifg3TXVy-1eFY',
  authDomain: 'shortevening-844df.firebaseapp.com',
  projectId: 'shortevening-844df',
  storageBucket: 'shortevening-844df.firebasestorage.app',
  messagingSenderId: '148446434869',
  appId: '1:148446434869:web:6c9449c4553c8ae80a837c',
};

export const firebaseApp=initializeApp(config);
export const auth=getAuth(firebaseApp);
export const db=getFirestore(firebaseApp);
export const googleProvider=new GoogleAuthProvider();

/** Shared regional Firebase Functions client for all web API adapters. */
export const functions=getFunctions(firebaseApp,'asia-south1');

/** Enable App Check when the public reCAPTCHA site key is configured. */
const recaptchaSiteKey=import.meta.env.VITE_RECAPTCHA_SITE_KEY;
export const appCheckReady=Boolean(recaptchaSiteKey);
if(recaptchaSiteKey){
  initializeAppCheck(firebaseApp,{
    provider:new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled:true
  });
}
