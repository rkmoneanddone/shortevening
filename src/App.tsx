import React, {useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import {BRAND} from './config/brand';
import {configureGoogleSignIn, signInWithGoogle, signOut} from './services/auth/authService';

configureGoogleSignIn();

export default function App() {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => auth().onAuthStateChanged(next => { setUser(next); setInitializing(false); }), []);
  if (initializing) return <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>;

  const login = async () => {
    setBusy(true); setError(null);
    try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.page}><View style={styles.card}>
    <Text style={styles.brand}>{BRAND.appName}</Text>
    <Text style={styles.title}>{user ? 'Good evening 🌸' : 'Aaj kya banaye?'}</Text>
    <Text style={styles.copy}>{user ? `Signed in as ${user.displayName || user.email || 'Family'}` : 'Three simple snack ideas for your family, without repeating the week.'}</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <TouchableOpacity disabled={busy} style={styles.button} onPress={user ? signOut : login}>
      <Text style={styles.buttonText}>{busy ? 'Please wait…' : user ? 'Sign out' : 'Continue with Google'}</Text>
    </TouchableOpacity>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#FFF9F3',justifyContent:'center',padding:24},center:{flex:1,justifyContent:'center'},card:{backgroundColor:'#FFFFFF',borderRadius:28,padding:28},brand:{fontSize:18,fontWeight:'700',marginBottom:28},title:{fontSize:32,fontWeight:'800',marginBottom:12},copy:{fontSize:17,lineHeight:25,marginBottom:28},button:{backgroundColor:'#302A27',padding:16,borderRadius:16,alignItems:'center'},buttonText:{color:'#FFFFFF',fontSize:16,fontWeight:'700'},error:{marginBottom:16,color:'#A40000'}
});
