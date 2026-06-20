/**
 * resilienceReceipt.js
 *
 * The "Resilience Receipt" engine - NerveIQ's signature differentiator.
 *
 * When distortionClassifier detects a cognitive distortion in today's entry,
 * this module searches the student's OWN past entries for concrete
 * counter-evidence: a day they felt the same way and recovered, or a
 * subject whose stress score has measurably improved over time.
 *
 * Pure function, zero network calls. The output here becomes structured
 * grounding data that geminiService.generateReceipt() turns into a short,
 * specific, non-generic rebuttal - "your own data," not a platitude.
 */

function findSimilarPastEntry(entries, distortionType) {
  // Look for an earlier entry where the same distortion type was logged
  // (requires entries to carry a `distortions` field saved at check-in time).
  const past = entries.filter(
    (e) => Array.isArray(e.distortions) && e.distortions.some((d) => d.type === distortionType)
  );
  if (past.length === 0) return null;

  // Prefer the oldest match so we can show "look how long ago this started, and you're still here."
  return past[0];
}

function findRecoveryAfter(entries, matchedEntry) {
  if (!matchedEntry) return null;
  const idx = entries.findIndex((e) => e.id === matchedEntry.id);
  if (idx === -1 || idx + 1 >= entries.length) return null;

  const MIN_MOOD_IMPROVEMENT = 2; // require a real bounce-back, not noise
  const MIN_SCORE_IMPROVEMENT = 15;

  // Look at the next up-to-7 entries after the matched one for a meaningful improvement.
  const after = entries.slice(idx + 1, idx + 8);
  const improved = after.find(
    (e) =>
      (typeof e.mood === 'number' &&
        typeof matchedEntry.mood === 'number' &&
        e.mood - matchedEntry.mood >= MIN_MOOD_IMPROVEMENT) ||
      (typeof e.burnoutScore === 'number' &&
        typeof matchedEntry.burnoutScore === 'number' &&
        matchedEntry.burnoutScore - e.burnoutScore >= MIN_SCORE_IMPROVEMENT)
  );
  return improved || null;
}

function findBestSubjectImprovement(entries) {
  const bySubject = {};
  for (const e of entries) {
    const subject = e.subject || 'General';
    if (!bySubject[subject]) bySubject[subject] = [];
    bySubject[subject].push(e);
  }

  let best = null;
  for (const [subject, list] of Object.entries(bySubject)) {
    if (list.length < 2) continue;
    const first = list[0];
    const last = list[list.length - 1];
    if (typeof first.burnoutScore !== 'number' || typeof last.burnoutScore !== 'number') continue;
    const improvement = first.burnoutScore - last.burnoutScore;
    if (improvement > 0 && (!best || improvement > best.improvement)) {
      best = { subject, improvement, from: first.burnoutScore, to: last.burnoutScore };
    }
  }
  return best;
}

/**
 * Builds the structured evidence packet that gets handed to Gemini.
 * Returns null if there simply isn't enough history yet to build a receipt -
 * in that case the caller should fall back to a plain supportive message
 * instead of pretending to have evidence that doesn't exist.
 *
 * @param {Array} allEntries - full entry history, oldest first
 * @param {Array} todayDistortions - output of distortionClassifier.detectDistortions()
 */
function buildEvidence(allEntries, todayDistortions) {
  if (!todayDistortions || todayDistortions.length === 0) return null;
  if (!allEntries || allEntries.length < 2) return null;

  const primaryType = todayDistortions[0].type;
  const pastMatch = findSimilarPastEntry(allEntries, primaryType);
  const recovery = findRecoveryAfter(allEntries, pastMatch);
  const subjectImprovement = findBestSubjectImprovement(allEntries);

  // Need at least ONE real data point to build an honest receipt.
  if (!pastMatch && !subjectImprovement) return null;

  return {
    distortionLabel: todayDistortions[0].label,
    distortionDescription: todayDistortions[0].description,
    pastSimilarDate: pastMatch ? pastMatch.date : null,
    recoveryDate: recovery ? recovery.date : null,
    recoveryMoodDelta:
      recovery && pastMatch && typeof recovery.mood === 'number' && typeof pastMatch.mood === 'number'
        ? recovery.mood - pastMatch.mood
        : null,
    subjectImprovement // { subject, improvement, from, to } or null
  };
}

module.exports = { buildEvidence };
