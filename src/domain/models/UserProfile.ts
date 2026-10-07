export type UserProfile = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  onboardingCompleted: boolean;
  createdAt?: unknown;
  lastActiveAt?: unknown;
};
