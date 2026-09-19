/**
 * Centralized policy versions and legal compliance constants for CupidXChat.
 * Updating versions here allows the system to identify users on older versions
 * and require re-acceptance when material policy updates occur.
 */

export const MINIMUM_LEGAL_AGE = 18;

export const CURRENT_TERMS_VERSION = '2026-09-01';
export const CURRENT_PRIVACY_VERSION = '2026-09-01';

export const TERMS_EFFECTIVE_DATE = 'September 1, 2026';
export const PRIVACY_EFFECTIVE_DATE = 'September 1, 2026';

export const DATA_RETENTION_POLICIES = {
  ephemeralChats: 'Zero retention. Messages are destroyed immediately upon chat session termination or skipping.',
  accountProfile: 'Retained until the user requests permanent account deletion via Settings.',
  consentRecords: 'Retained as authoritative legal audit proof of user agreement and versioning.',
  technicalSecurityLogs: 'Technical telemetry (e.g. rate limit counters) expires automatically via sliding time windows.',
};
