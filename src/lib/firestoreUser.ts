/**
 * CupidX — Persistent Firestore User Profile Management
 * Source of truth for authenticated user profiles on Vercel & client.
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';

export interface UserProfile {
  id: string;
  uid: string;
  firebaseUid: string;
  username: string;
  usernameLower: string;
  fullName: string;
  displayName: string;
  email: string | null;
  role: 'USER' | 'ADMIN';
  membershipTier: string;
  is_vip: boolean;
  online: boolean;
  status: 'active' | 'suspended';
  createdAt: number;
  updatedAt: number;
  profile: {
    bio: string;
    showBio?: boolean;
    age: number;
    gender: string;
    showGender?: boolean;
    preferredGender?: string;
    personalityPreferences?: string;
    mood?: string;
    showMood?: boolean;
    moodExpiresAt?: string | null;
    language?: string;
    saveChatHistory?: boolean;
    interests: string;
    avatarType?: string;
    avatarEmoji?: string;
    avatarUrl?: string | null;
    themePreference: string;
    randomChatIntroSeen?: boolean;
    ageGenderConfirmed?: boolean;
    ageGenderChangesCount?: number;
    nameChangesCount?: number;
  };
  subscription?: {
    isActive: boolean;
    plan: string;
    endDate?: string;
  };
}

/**
 * Generate a clean username from displayName or email or fallback.
 */
export function generateCleanUsername(fbUser: FirebaseUser): string {
  const raw = fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : '') || `user_${fbUser.uid.slice(-5)}`;
  const clean = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return clean.length >= 3 ? clean : `user_${fbUser.uid.slice(-5)}`;
}

/**
 * Fetch existing Firestore user document or initialize a new one.
 */
export async function getOrCreateFirestoreUser(fbUser: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', fbUser.uid);
  
  try {
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // Update online status in background
      updateDoc(userRef, {
        online: true,
        updatedAt: Date.now(),
      }).catch(() => {});
      return data;
    }
  } catch (err) {
    console.warn('Notice reading user from Firestore:', err);
  }

  // Create new profile
  const cleanUsername = generateCleanUsername(fbUser);
  const now = Date.now();
  const displayName = fbUser.displayName || cleanUsername;

  const newUser: UserProfile = {
    id: fbUser.uid,
    uid: fbUser.uid,
    firebaseUid: fbUser.uid,
    username: cleanUsername,
    usernameLower: cleanUsername.toLowerCase(),
    fullName: displayName,
    displayName: displayName,
    email: fbUser.email || null,
    role: 'USER',
    membershipTier: 'FREE',
    is_vip: false,
    online: true,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    profile: {
      bio: 'Hey there! I am using CupidX.',
      age: 21,
      gender: 'unspecified',
      preferredGender: 'auto',
      mood: '😊 Happy',
      avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${cleanUsername}`,
      avatarEmoji: '😊',
      themePreference: 'purple',
      interests: '',
      randomChatIntroSeen: true,
      ageGenderConfirmed: true,
    },
    subscription: {
      isActive: false,
      plan: 'FREE',
    },
  };

  try {
    await setDoc(userRef, newUser);
  } catch (err) {
    console.warn('Notice saving new user to Firestore:', err);
  }

  return newUser;
}

/**
 * Update user profile in Firestore.
 */
export async function updateFirestoreUserProfile(
  uid: string,
  updates: Partial<UserProfile> | { profile: Partial<UserProfile['profile']> }
): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Notice updating Firestore user profile:', err);
  }
}

/**
 * Set user online / offline presence in Firestore.
 */
export async function setFirestoreUserPresence(uid: string, online: boolean): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      online,
      updatedAt: Date.now(),
    });
  } catch {
    // Ignore
  }
}
