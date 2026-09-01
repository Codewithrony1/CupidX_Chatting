import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

const defaultServiceAccount = {
  projectId: "cupidxchat-3dee5",
  clientEmail: "firebase-adminsdk-fbsvc@cupidxchat-3dee5.iam.gserviceaccount.com",
  privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCjBLeLN177MNI\nHQqDLZMhcOKgUp9g2CUrnjBl6Zz/BOlOuPv46ALvbu6CH+crjpxq6dHwStG0mxCa\nTMbqbqOauqeso0MKVHoYJJ15heGlA4wyrylgZ6ukbiWNyBrQ3uY9/Gh7KigMu9Y/\nLedEymuYY/9LVkW+y5UxVdoxmhp+PeD6rYmcy/VssOCEhHIBGg7Obc78duCg1ChM\n5GTpQ4uFvivq4AfTpx5JqrUM8iqL5mpPRGbMpxwh79yLfn2sRns5y7jMNhrFnyXj\nnJdcOJ5kIXpYIKhLAX+hsEzI/Sb2Ys/YwIqn4ZfgZdYULCEZsd/8XHoi1A3sm0GV\nkLLzv2T1AgMBAAECggEADJK373Lv13/8OO9jjAnIfftJMjpUwZIGiPSexR9dfZ/I\nIkXTRwlbkzTUpkVAj/CWDFTTNBfpyKXS41395w3CdhAFISOmBAdkoqXPJZjw9dSu\nXWIzpt7cWXKi67BYh1I4iB4FdJxLXVNQa+HgFfKNFJq1150aQdPvbvJQ+S6v8qOZ\nRyKDZySbydXaHRkb/IVkQOGVl9OXDWagbMryRP44o5kSpqGgUR8h74OE3t4ltfY5\n5EBnJ7Kq/6t23sRdZR1AbnTeTCNdxQYoLrsG1E58vt8+vB2a+6MabUZIrKgeHGU+\nCg2tgKkNa0sAxh6XIg2zHukPHgrtohlpaFFGFPFviwKBgQDnB9ifhI95ebnKT2g8\ndAT8zR13E/NzTAhgWQxl10rEQ4Eyezi2SN/PwOfrE4MMkzP+WczRmv87tMUCAzi4\nmTIkuasXuPVPWOzavC4RhbBKH+mts0ZPdHqjUQiWhLerRfNdXSRnAu+oWAVFAmUz\ng6a0sxnp210OdCrdMU3E+hBw0wKBgQDXks2CEL2m3a5ortNuuIwQJSpbgomZdD64\nmvEqnzlh4QkR/kde6jf/GvEA5G32xMBVBcx6gMERoriGr5sSvj2tV6TMpzQ6dldg\nhuLt9WYldok85Gq0okzVOHc9sIEnKTTSqFqOi37w3y0JR7q0ILTg2IaWvYEcexDF\n9eod7Cx2FwKBgDzkA4MflBUHMSGSRj3QslPS19Y/quWTf42tSqg40xrhU9bzRSI+\nGMcP59A8Z0jUL1r1XhdMi8K3xUjfgn6c2et2CBMLi5QrMtn/yQCTRMB0oslGO9zL\nLVuICwRo3GPG3vqXhvWjf3jWIiVrGTM3mqN7pPPO/jrGAVolGYM2CUlDAoGBAMbx\nSsjKrEtPb8JZ/PPESjYoJlP3PwcoGS4Ch6f+81TZ+aXqVXFJk83QzjM1nCnM33ZX\neKJhKkwdME/Txbfha0gKhyL6958wUWjacpiKDO9r2jEg1zzGP0PS7XA38Kj0RTRX\ne+Lq54ZhX82drbbILEUIbgS09G8VP6CBVsKwj0OXAoGAF7fxYc8A9qpLpq9QhkC1\n0Pk+RcRNNseO7RYjC02AcMb9aXXwtsawmTqAyz40MT55OPmcq/ZJBwFnMH4D7ler\njtrUZORtkxBcTFjo1TEW8jCBSNiJFppGyw3VWdaH+zYEs5Sl/HQZN50Ct3BfefG8\ne9lUDq5XHI4jVp50XSZ6OLU=\n-----END PRIVATE KEY-----`,
};

function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // 1. Try serviceAccountKey.json if present
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      return initializeApp({
        credential: cert(fileData),
        projectId: fileData.project_id || defaultServiceAccount.projectId,
      });
    } catch (e) {
      console.warn('Failed to load from serviceAccountKey.json file:', e);
    }
  }

  // 2. Try environment variables
  const envEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const envKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (envEmail && envKey) {
    return initializeApp({
      credential: cert({
        projectId: envProjectId || defaultServiceAccount.projectId,
        clientEmail: envEmail,
        privateKey: envKey,
      }),
      projectId: envProjectId || defaultServiceAccount.projectId,
    });
  }

  // 3. Fallback to default project credentials
  return initializeApp({
    credential: cert(defaultServiceAccount),
    projectId: defaultServiceAccount.projectId,
  });
}

export const adminApp = getFirebaseAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export async function verifyFirebaseIdToken(token: string) {
  try {
    return await adminAuth.verifyIdToken(token);
  } catch (error) {
    return null;
  }
}
