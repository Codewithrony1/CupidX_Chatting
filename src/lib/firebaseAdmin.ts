import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import path from 'path';
import fs from 'fs';

let cachedApp: App | null = null;

function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  // Service-account credentials must come from environment variables or a local
  // serviceAccountKey.json file. Never embed private keys in source control.
  try {
    const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const fileData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      if (fileData?.private_key && fileData?.client_email) {
        fileData.private_key = fileData.private_key.replace(/\\n/g, '\n');
        cachedApp = initializeApp({
          credential: cert(fileData),
          projectId: fileData.project_id || process.env.FIREBASE_PROJECT_ID,
          ...(process.env.FIREBASE_STORAGE_BUCKET ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET } : {}),
        });
        return cachedApp;
      }
    }
  } catch (e) {
    console.warn('Notice loading local Firebase service account:', e);
  }

  const envEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const envKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!envEmail || !envKey || !envProjectId) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId: envProjectId,
      clientEmail: envEmail,
      privateKey: envKey,
    }),
    projectId: envProjectId,
    ...(storageBucket ? { storageBucket } : {}),
  });
  return cachedApp;
}

export function getAdminDb(): Firestore | null {
  try {
    return getFirestore(getFirebaseAdminApp());
  } catch (e) {
    console.warn('getAdminDb error:', e);
    return null;
  }
}

export function getAdminStorage(): Storage | null {
  try {
    return getStorage(getFirebaseAdminApp());
  } catch (e) {
    console.warn('getAdminStorage error:', e);
    return null;
  }
}

export const getFirestoreAdmin = getAdminDb;
