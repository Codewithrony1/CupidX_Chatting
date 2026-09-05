/**
 * CupidX — Persistent Firestore User Profile Management
 * Source of truth for authenticated user profiles on Vercel & client.
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
  membershipTier: 'FREE' | 'VIP' | string;
  is_vip: boolean;
  isVIP?: boolean;
  vip_expires_at?: string | null;
  vip_started_at?: string | null;
  clerkUserId?: string | null;
  online: boolean;
  status: 'active' | 'suspended';
  profileCompleted: boolean;
  dateOfBirth?: string | null; // Format: "YYYY-MM-DD"
  gender: string; // "male", "female", "other", "prefer_not_to_say", "unspecified"
  createdAt: number;
  updatedAt: number;
  profile: {
    bio: string;
    showBio?: boolean;
    dateOfBirth?: string | null;
    age: number; // Dynamically calculated
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
 * Dynamically calculate age from Date of Birth string or Date object.
 */
export function calculateAge(dob: string | Date | null | undefined): number {
  if (!dob) return 18;
  const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
  if (isNaN(birthDate.getTime())) return 18;
  
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Format DOB for beautiful display (e.g., "21 August 2005")
 */
export function formatDisplayDob(dob: string | Date | null | undefined): string {
  if (!dob) return 'Not set';
  const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
  if (isNaN(birthDate.getTime())) return 'Not set';
  return birthDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface GenericAuthUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

/**
 * Generate a clean username from displayName or email or fallback.
 */
export function generateCleanUsername(fbUser: GenericAuthUser): string {
  const raw = fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : '') || `user_${fbUser.uid.slice(-5)}`;
  const clean = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return clean.length >= 3 ? clean : `user_${fbUser.uid.slice(-5)}`;
}

/**
 * Fetch existing Firestore user document or initialize a new one.
 * Infallible: Protected with timeout race so cold Firestore connections never freeze auth.
 */
export async function getOrCreateFirestoreUser(fbUser: GenericAuthUser): Promise<UserProfile> {
  const cleanUsername = generateCleanUsername(fbUser);
  const now = Date.now();
  const displayName = fbUser.displayName || cleanUsername;

  const fallbackUser: UserProfile = {
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
    isVIP: false,
    online: true,
    status: 'active',
    profileCompleted: false,
    dateOfBirth: null,
    gender: 'unspecified',
    createdAt: now,
    updatedAt: now,
    profile: {
      bio: 'Hey there! I am using CupidX.',
      age: 18,
      dateOfBirth: null,
      gender: 'unspecified',
      preferredGender: 'auto',
      mood: '😊 Happy',
      avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${cleanUsername}`,
      avatarEmoji: '😊',
      themePreference: 'purple',
      interests: '',
      randomChatIntroSeen: false,
      ageGenderConfirmed: false,
    },
    subscription: {
      isActive: false,
      plan: 'FREE',
    },
  };

  try {
    const userRef = doc(db, 'users', fbUser.uid);

    // Timeout protection: If Firestore takes > 2500ms, proceed with fallback immediately
    const fetchPromise = getDoc(userRef);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));

    const snap = await Promise.race([fetchPromise, timeoutPromise]);

    if (snap && snap.exists()) {
      const data = snap.data() as UserProfile;
      const dynamicAge = calculateAge(data.dateOfBirth || data.profile?.dateOfBirth);
      
      const enriched: UserProfile = {
        ...data,
        id: fbUser.uid,
        uid: fbUser.uid,
        firebaseUid: fbUser.uid,
        profileCompleted: Boolean(
          data.profileCompleted ||
          (data.dateOfBirth && data.gender && data.gender !== 'unspecified') ||
          (data.profile?.dateOfBirth && data.profile?.gender && data.profile?.gender !== 'unspecified')
        ),
        profile: {
          ...data.profile,
          age: dynamicAge,
          dateOfBirth: data.dateOfBirth || data.profile?.dateOfBirth || null,
        },
      };

      console.log('[PROFILE] Loaded Firestore profile for UID:', fbUser.uid, 'profileCompleted:', enriched.profileCompleted);

      // Update online status in background
      updateDoc(userRef, {
        online: true,
        updatedAt: Date.now(),
      }).catch(() => {});
      
      return enriched;
    } else if (snap && !snap.exists()) {
      console.log('[PROFILE] User document missing in Firestore, creating new profile for UID:', fbUser.uid);
      setDoc(userRef, fallbackUser).catch((e) => console.warn('[PROFILE] Firestore setDoc notice:', e));
      return fallbackUser;
    } else {
      console.warn('[PROFILE] Firestore read timed out (>2.5s), proceeding with fallback for UID:', fbUser.uid);
      setDoc(userRef, fallbackUser).catch(() => {});
      return fallbackUser;
    }
  } catch (err) {
    console.error('[PROFILE] Firestore read failed:', err);
    return fallbackUser;
  }
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
    console.log('[PROFILE] Firestore profile updated successfully for UID:', uid);
  } catch (err) {
    console.warn('[PROFILE] Notice updating Firestore user profile:', err);
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
