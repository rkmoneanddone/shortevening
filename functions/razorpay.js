'use strict';
const crypto=require('node:crypto');
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const keyId=defineSecret('RAZORPAY_KEY_ID');
const keySecret=defineSecret('RAZORPAY_KEY_SECRET');
const webhookSecret=defineSecret('RAZORPAY_WEBHOOK_SECRET');
const enabled=defineSecret('RAZORPAY_CHECKOUT_ENABLED');
async function readPlans(){
 const snap=await getFirestore().doc('publicConfig/billing').get();
 const plans={};
 for(const id of ['monthly','yearly']){
  const p=snap.data()?.plans?.[id];
  if(p?.enabled===true&&Number.isSafeInteger(p.amountMinor)&&p.amountMinor>=100&&p.amountMinor<=10000000&&Number.isSafeInteger(p.durationDays)&&p.durationDays>=1&&p.durationDays<=3660&&p.currency==='INR')plans[id]={amount:p.amountMinor,days:p.durationDays,currency:p.currency};
 }
 return plans;
}
exports.getBillingPlans=onCall({region:'asia-south1',enforceAppCheck:true},async()=>{
 const plans=await readPlans();
 return {plans:Object.fromEntries(Object.entries(plans).map(([id,p])=>[id,{amountMinor:p.amount,currency:p.currency,durationDays:p.days}]))};
});
function assertEnabled(){if(enabled.value()!=='true')throw new HttpsError('failed-precondition','Premium payments are not enabled yet.');}
function validSignature(expected,provided){if(typeof provided!=='string'||!/^[a-f0-9]{64}$/i.test(provided))return false;return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(provided,'hex'));}
async function api(path,method,body){
 const authorization=Buffer.from(keyId.value()+':'+keySecret.value()).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1/'+path,{method,headers:{Authorization:'Basic '+authorization,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error('Razorpay API returned '+response.status);
 return response.json();
}
exports.createRazorpayOrder=onCall({region:'asia-south1',enforceAppCheck:true,secrets:[keyId,keySecret,enabled]},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first.');
 assertEnabled();
 const plan=request.data?.plan;
 if(!['monthly','yearly'].includes(plan))throw new HttpsError('invalid-argument','Invalid plan.');
 const config=(await readPlans())[plan];
 if(!config)throw new HttpsError('failed-precondition','Plan is not available.');
 const order=await api('orders','POST',{amount:config.amount,currency:config.currency,receipt:crypto.randomUUID(),notes:{uid:request.auth.uid,plan}});
 await getFirestore().doc('paymentOrders/'+order.id).create({uid:request.auth.uid,plan,amount:config.amount,currency:config.currency,durationDays:config.days,status:'created',createdAt:FieldValue.serverTimestamp()});
 return {orderId:order.id,keyId:keyId.value(),amount:config.amount,currency:config.currency};
});
async function activate(orderId,paymentId){
 const ref=getFirestore().doc('paymentOrders/'+orderId);
 const payment=await api('payments/'+encodeURIComponent(paymentId),'GET');
 if(payment.order_id!==orderId||payment.status!=='captured')throw new Error('Payment not captured.');
 await getFirestore().runTransaction(async tx=>{
  const order=await tx.get(ref);
  if(!order.exists)throw new Error('Unknown order.');
  const d=order.data();
  if(!Number.isSafeInteger(d.durationDays)||d.durationDays<1||d.durationDays>3660||d.amount!==payment.amount||d.currency!==payment.currency)throw new Error('Payment mismatch.');
  if(d.status==='paid'){if(d.paymentId!==paymentId)throw new Error('Order already settled.');return;}
  const ent=getFirestore().doc('users/'+d.uid+'/entitlements/ai');
  const current=await tx.get(ent);
  const prior=current.get('expiresAt');
  const start=Math.max(Date.now(),prior&&typeof prior.toMillis==='function'?prior.toMillis():0);
  const expiresAt=Timestamp.fromMillis(start+d.durationDays*86400000);
  tx.update(ref,{status:'paid',paymentId,paidAt:FieldValue.serverTimestamp()});
  tx.set(ent,{status:'active',plan:'paid',provider:'razorpay',expiresAt,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  tx.set(getFirestore().doc('paymentTransactions/'+paymentId),{uid:d.uid,orderId,plan:d.plan,amount:d.amount,provider:'razorpay',createdAt:FieldValue.serverTimestamp()},{merge:true});
 });
}
exports.verifyRazorpayPayment=onCall({region:'asia-south1',enforceAppCheck:true,secrets:[keyId,keySecret,enabled]},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first.');
 assertEnabled();
 const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature}=request.data||{};
 if(typeof orderId!=='string'||typeof paymentId!=='string')throw new HttpsError('invalid-argument','Invalid payment response.');
 const order=await getFirestore().doc('paymentOrders/'+orderId).get();
 if(!order.exists||order.get('uid')!==request.auth.uid)throw new HttpsError('permission-denied','Order not found.');
 const digest=crypto.createHmac('sha256',keySecret.value()).update(orderId+'|'+paymentId).digest('hex');
 if(!validSignature(digest,signature))throw new HttpsError('permission-denied','Invalid payment signature.');
 try{await activate(orderId,paymentId);}catch(e){console.error('Payment verification',e);throw new HttpsError('failed-precondition','Payment is being verified. Refresh shortly.');}
 return {ok:true};
});
exports.razorpayWebhook=onRequest({region:'asia-south1',secrets:[keyId,keySecret,webhookSecret]},async(req,res)=>{
 if(req.method!=='POST'){res.status(405).send('Method not allowed');return;}
 const signature=req.get('x-razorpay-signature');
 const digest=crypto.createHmac('sha256',webhookSecret.value()).update(req.rawBody).digest('hex');
 if(!validSignature(digest,signature)){res.status(401).send('Invalid signature');return;}
 const event=req.body;
 if(event?.event!=='payment.captured'){res.status(200).send('Ignored');return;}
 const payment=event.payload?.payment?.entity;
 if(!payment?.order_id||!payment?.id){res.status(400).send('Invalid event');return;}
 try{await activate(payment.order_id,payment.id);res.status(200).send('OK');}
 catch(e){console.error('Razorpay webhook',e);res.status(500).send('Retry later');}
});
