const DEFAULT_MODEL = process.env.MODERATION_MODEL || 'omni-moderation-latest';
const DEFAULT_ENDPOINT = process.env.MODERATION_API_URL || 'https://api.openai.com/v1/moderations';

const CATEGORY_RULES = [
  { category: 'SEXUAL_SOLICITATION', severity: 'HIGH_RISK', patterns: [/send\s+(?:me\s+)?(?:nudes?|pics?|photos?)/i, /(?:sex|hookup|meet)\s+(?:me|tonight|irl)/i, /onlyfans|cashapp\s+for\s+(?:sex|nudes?)/i] },
  { category: 'THREAT', severity: 'CRITICAL', patterns: [/\b(?:kill|murder|shoot|stab|hurt)\s+(?:you|u|him|her|them)\b/i, /\bi(?:'| a)m\s+going\s+to\s+(?:kill|hurt)/i] },
  { category: 'SCAM', severity: 'HIGH_RISK', patterns: [/send\s+(?:me\s+)?(?:money|crypto|gift\s*card)/i, /guaranteed\s+(?:profit|return)|double\s+your\s+money/i, /verify\s+your\s+account\s+(?:here|at)/i] },
  { category: 'MALICIOUS_LINK', severity: 'HIGH_RISK', patterns: [/(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.me|discord\.gg)\//i] },
  { category: 'SPAM', severity: 'MEDIUM_RISK', patterns: [/(.{2,})\1{4,}/i, /(?:free|win|winner|click)\s+(?:now|here).{0,30}(?:free|win|offer)/i] },
  { category: 'HARASSMENT', severity: 'MEDIUM_RISK', patterns: [/(?:idiot|stupid|moron|loser)\s+(?:you|u)/i] },
  { category: 'HATE_ABUSE', severity: 'HIGH_RISK', patterns: [/\b(?:go\s+back|you\s+people)\b/i] },
];

function riskFromSeverity(severity, confidence) {
  if (severity === 'CRITICAL' || confidence >= 0.92 && severity === 'HIGH_RISK') return 'CRITICAL';
  if (severity === 'HIGH_RISK' || confidence >= 0.80) return 'HIGH_RISK';
  if (severity === 'MEDIUM_RISK' || confidence >= 0.55) return 'MEDIUM_RISK';
  if (confidence >= 0.25) return 'LOW_RISK';
  return 'SAFE';
}

function policyForRisk(risk) {
  if (risk === 'CRITICAL') return 'TERMINATE_MATCH';
  if (risk === 'HIGH_RISK') return 'FLAG_ADMIN_REVIEW';
  if (risk === 'MEDIUM_RISK') return 'INCREASE_MONITORING';
  return 'NONE';
}

function heuristicAnalyze(text, context = {}) {
  const normalized = String(text || '').trim();
  let hit = null;
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      hit = rule;
      break;
    }
  }

  const repeatedSpam = Number(context.recentMessageCount || 0) >= 6 && normalized.length < 12;
  if (!hit && repeatedSpam) {
    hit = { category: 'SPAM', severity: 'MEDIUM_RISK' };
  }

  if (!hit) {
    return { risk: 'SAFE', category: 'NONE', confidence: 0.05, recommendedAction: 'NONE', reason: null };
  }

  const confidence = hit.severity === 'CRITICAL' ? 0.97 : hit.severity === 'HIGH_RISK' ? 0.88 : 0.72;
  const risk = riskFromSeverity(hit.severity, confidence);
  return {
    risk,
    category: hit.category,
    confidence,
    recommendedAction: policyForRisk(risk),
    reason: 'Deterministic safety fallback matched a moderation pattern.',
  };
}

async function aiAnalyze(text, context = {}) {
  const apiKey = process.env.MODERATION_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(DEFAULT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: String(text || ''),
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.results?.[0];
    if (!result) return null;

    const scores = result.category_scores || {};
    const flagged = result.flagged === true;
    const scorePairs = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1]));
    const top = scorePairs[0];
    const topCategory = top ? String(top[0]).toUpperCase() : 'NONE';
    const topScore = top ? Number(top[1]) : 0;

    let category = 'NONE';
    if (topCategory.includes('SEXUAL')) category = 'SEXUAL_CONTENT';
    else if (topCategory.includes('HARASSMENT')) category = 'HARASSMENT';
    else if (topCategory.includes('HATE')) category = 'HATE_ABUSE';
    else if (topCategory.includes('THREAT')) category = 'THREAT';
    else if (topCategory.includes('VIOLENCE')) category = 'VIOLENCE';
    else if (topCategory.includes('SELF_HARM')) category = 'SELF_HARM';
    else if (topCategory.includes('ILLICIT')) category = 'ILLICIT_CONTENT';
    else if (topCategory !== 'NONE') category = topCategory;

    const severity = topScore >= 0.92 ? 'CRITICAL' : topScore >= 0.75 ? 'HIGH_RISK' : topScore >= 0.45 ? 'MEDIUM_RISK' : 'LOW_RISK';
    const risk = flagged ? riskFromSeverity(severity, topScore) : riskFromSeverity(severity, topScore);
    return {
      risk,
      category,
      confidence: Math.max(0, Math.min(1, topScore)),
      recommendedAction: policyForRisk(risk),
      reason: `AI moderation model: ${DEFAULT_MODEL}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeMessage(text, context = {}) {
  const heuristic = heuristicAnalyze(text, context);
  const ai = await aiAnalyze(text, context);

  // Deterministic policy engine: never downgrade a stronger local safety signal.
  if (!ai) return heuristic;
  const heuristicRank = { SAFE: 0, LOW_RISK: 1, MEDIUM_RISK: 2, HIGH_RISK: 3, CRITICAL: 4 };
  const chosen = heuristicRank[heuristic.risk] > heuristicRank[ai.risk] ? heuristic : ai;
  return chosen;
}

async function recordModerationEvent(prisma, data) {
  try {
    return await prisma.moderationEvent.create({ data });
  } catch (error) {
    console.warn('[MODERATION] Failed to persist event:', error?.message || error);
    return null;
  }
}

module.exports = {
  analyzeMessage,
  recordModerationEvent,
  policyForRisk,
};
