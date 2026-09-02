/**
 * CupidX Authentication Error Translator
 * Maps Firebase Auth error codes to user-friendly messages.
 */

export function getFriendlyAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const code = typeof error === 'string' ? error : error?.code || error?.message || '';

  switch (code) {
    // Credential & User Errors
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please sign in instead.';
    case 'auth/weak-password':
      return 'Please choose a stronger password (minimum 6 characters).';

    // Popup & Provider Errors
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google sign-in in Firebase Console. Please add cupidxchat.in and www.cupidxchat.in to Firebase Console -> Authentication -> Settings -> Authorized Domains.';
    case 'auth/cancelled-popup-request':
      return 'Only one sign-in window can be open at a time.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Console.';

    // Network & Rate Limits
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/requires-recent-login':
      return 'Please sign in again to complete this action.';

    default:
      if (typeof error?.message === 'string' && error.message.length > 0 && !error.message.includes('FirebaseError')) {
        return error.message;
      }
      return 'Authentication failed. Please try again.';
  }
}
