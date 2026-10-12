'use strict';
const {onCall}=require('firebase-functions/v2/https');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
if(!getApps().length)initializeApp();

/** Public plan catalog: no payment credentials or authentication required. */
exports.getBillingPlans=onCall({region:'asia-south1',enforceAppCheck:true},async()=>{
 const snap=await getFirestore().doc('publicConfig/billing').get();
 const plans={};
 for(const id of ['monthly','yearly']){
  const p=snap.data()?.plans?.[id];
  if(p?.enabled===true&&Number.isSafeInteger(p.amountMinor)&&p.amountMinor>=100&&p.amountMinor<=10000000&&Number.isSafeInteger(p.durationDays)&&p.durationDays>=1&&p.durationDays<=3660&&p.currency==='INR'){
   plans[id]={amountMinor:p.amountMinor,currency:p.currency,durationDays:p.durationDays};
  }
 }
 return {plans};
});
