# SortEvening V1 Product Specification

## Promise
Three relevant evening snack ideas, remembered family history, and no repeats during the previous 7 days for Premium users.

## Current commercial rules
- 30-day full Premium trial.
- Premium purchasable from Day 1; soft promotion initially, stronger in final 7 days.
- After trial, no hard block.
- Free: exactly 3 basic ideas/day + basic instructions.
- Free: no notification, history, Made Today, no-repeat personalization, refresh, ingredient recommendations, AI custom requests, favorites, or advanced filters.
- Existing history/preferences remain stored after downgrade and return after Premium activation.
- Premium: ₹249/month or ₹1,999/year.
- Razorpay is the payment gateway.

## Technology
- React Native CLI + TypeScript; Android first.
- Firebase Auth, Firestore, Cloud Functions, FCM, Analytics, Crashlytics/App Check as appropriate.
- OpenAI and/or Gemini only through secure backend endpoints.
- Normal daily suggestions must not require AI.

## Core V1 flow
Google login → family onboarding → 3 suggestions → recipe → Made Today → 7-day/dish-family exclusion → return next evening.

## Security
Users can access only their own private data. Clients cannot grant Premium. Razorpay and AI secrets remain server-side. Payment entitlement is backend-authoritative.

## Name
SortEvening is a working name and must remain centrally configurable.
