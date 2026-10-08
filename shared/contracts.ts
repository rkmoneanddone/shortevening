/** Stable data contracts shared by web and future native clients. */
export type Diet='vegetarian'|'eggetarian'|'nonvegetarian';
export type Household={adults:number;children:number};
export type UserPreferences={household:Household;diet:Diet;allergies:string[];preferredMinutes:number};
export type Recipe={id:string;name:string;dishFamily:string;durationMinutes:number;ingredients:string[];steps:string[];allergens:string[];diet:Diet;published:boolean};
export type RecommendationRequest={date:string;timezone:string};
export type RecommendationResult={date:string;recipeIds:string[];source:'catalog'|'personalized';message?:string};
export type Plan='free'|'trial'|'premium';
export type Entitlement={plan:Plan;trialEndsAt:string|null;premiumUntil:string|null};
export type ApiErrorCode='UNAUTHENTICATED'|'PERMISSION_DENIED'|'INVALID_INPUT'|'NOT_FOUND'|'LIMIT_REACHED'|'UNAVAILABLE';
export type ApiError={code:ApiErrorCode;message:string};
