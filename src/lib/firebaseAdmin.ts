import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

const rawPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCjBLeLN177MNI
HQqDLZMhcOKgUp9g2CUrnjBl6Zz/BOlOuPv46ALvbu6CH+crjpxq6dHwStG0mxCa
TMbqbqOauqeso0MKVHoYJJ15heGlA4wyrylgZ6ukbiWNyBrQ3uY9/Gh7KigMu9Y/
LedEymuYY/9LVkW+y5UxVdoxmhp+PeD6rYmcy/VssOCEhHIBGg7Obc78duCg1ChM
5GTpQ4uFvivq4AfTpx5JqrUM8iqL5mpPRGbMpxwh79yLfn2sRns5y7jMNhrFnyXj
nJdcOJ5kIXpYIKhLAX+hsEzI/Sb2Ys/YwIqn4ZfgZdYULCEZsd/8XHoi1A3sm0GV
kLLzv2T1AgMBAAECggEADJK373Lv13/8OO9jjAnIfftJMjpUwZIGiPSexR9dfZ/I
IkXTRwlbkzTUpkVAj/CWDFTTNBfpyKXS41395w3CdhAFISOmBAdkoqXPJZjw9dSu
XWIzpt7cWXKi67BYh1I4iB4FdJxLXVNQa+HgFfKNFJq1150aQdPvbvJQ+S6v8qOZ
RyKDZySbydXaHRkb/IVkQOGVl9OXDWagbMryRP44o5kSpqGgUR8h74OE3t4ltfY5
5EBnJ7Kq/6t23sRdZR1AbnTeTCNdxQYoLrsG1E58vt8+vB2a+6MabUZIrKgeHGU+
Cg2tgKkNa0sAxh6XIg2zHukPHgrtohlpaFFGFPFviwKBgQDnB9ifhI95ebnKT2g8
dAT8zR13E/NzTAhgWQxl10rEQ4Eyezi2SN/PwOfrE4MMkzP+WczRmv87tMUCAzi4
mTIkuasXuPVPWOzavC4RhbBKH+mts0ZPdHqjUQiWhLerRfNdXSRnAu+oWAVFAmUz
g6a0sxnp210OdCrdMU3E+hBw0wKBgQDXks2CEL2m3a5ortNuuIwQJSpbgomZdD64
mvEqnzlh4QkR/kde6jf/GvEA5G32xMBVBcx6gMERoriGr5sSvj2tV6TMpzQ6dldg
huLt9WYldok85Gq0okzVOHc9sIEnKTTSqFqOi37w3y0JR7q0ILTg2IaWvYEcexDF
9eod7Cx2FwKBgDzkA4MflBUHMSGSRj3QslPS19Y/quWTf42tSqg40xrhU9bzRSI+
GMcP59A8Z0jUL1r1XhdMi8K3xUjfgn6c2et2CBMLi5QrMtn/yQCTRMB0oslGO9zL
LVuICwRo3GPG3vqXhvWjf3jWIiVrGTM3mqN7pPPO/jrGAVolGYM2CUlDAoGBAMbx
SsjKrEtPb8JZ/PPESjYoJlP3PwcoGS4Ch6f+81TZ+aXqVXFJk83QzjM1nCnM33ZX
eKJhKkwdME/Txbfha0gKhyL6958wUWjacpiKDO9r2jEg1zzGP0PS7XA38Kj0RTRX
e+Lq54ZhX82drbbILEUIbgS09G8VP6CBVsKwj0OXAoGAF7fxYc8A9qpLpq9QhkC1
0Pk+RcRNNseO7RYjC02AcMb9aXXwtsawmTqAyz40MT55OPmcq/ZJBwFnMH4D7ler
jtrUZORtkxBcTFjo1TEW8jCBSNiJFppGyw3VWdaH+zYEs5Sl/HQZN50Ct3BfefG8
e9lUDq5XHI4jVp50XSZ6OLU=
-----END PRIVATE KEY-----`;

const defaultServiceAccount = {
  projectId: "cupidxchat-3dee5",
  clientEmail: "firebase-adminsdk-fbsvc@cupidxchat-3dee5.iam.gserviceaccount.com",
  privateKey: rawPrivateKey.replace(/\\n/g, '\n'),
};

let cachedApp: App | null = null;

function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  // 1. Check serviceAccountKey.json if present
  try {
    const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const fileData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      if (fileData && fileData.private_key) {
        fileData.private_key = fileData.private_key.replace(/\\n/g, '\n');
        cachedApp = initializeApp({
          credential: cert(fileData),
          projectId: fileData.project_id || defaultServiceAccount.projectId,
        });
        return cachedApp;
      }
    }
  } catch (e) {
    console.warn('Notice loading serviceAccountKey.json file:', e);
  }

  // 2. Check environment variables
  try {
    const envEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const envKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;
    const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (envEmail && envKey) {
      cachedApp = initializeApp({
        credential: cert({
          projectId: envProjectId || defaultServiceAccount.projectId,
          clientEmail: envEmail,
          privateKey: envKey,
        }),
        projectId: envProjectId || defaultServiceAccount.projectId,
      });
      return cachedApp;
    }
  } catch (e) {
    console.warn('Notice loading env Firebase credentials:', e);
  }

  // 3. Fallback to embedded default service account
  try {
    cachedApp = initializeApp({
      credential: cert(defaultServiceAccount),
      projectId: defaultServiceAccount.projectId,
    });
    return cachedApp;
  } catch (e) {
    console.warn('Notice initializing default service account, creating bare app:', e);
    cachedApp = initializeApp({
      projectId: defaultServiceAccount.projectId,
    });
    return cachedApp;
  }
}

export function getAdminDb(): Firestore | null {
  try {
    const app = getFirebaseAdminApp();
    return getFirestore(app);
  } catch (e) {
    console.warn('getAdminDb error:', e);
    return null;
  }
}

export const getFirestoreAdmin = getAdminDb;
