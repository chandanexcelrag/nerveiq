/**
 * subjectMatrix.js
 *
 * Pure function, zero network calls. Groups entries by subject and computes
 * an average stress signal per subject, so the app can say things like
 * "Organic Chemistry consistently correlates with higher stress for you."
 */

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * @param {Array} entries - each entry: { subject, mood, burnoutScore }
 * @returns {{ matrix: Object<string, number>, ranked: Array<{subject, avgScore, count}> }}
 */
function buildSubjectMatrix(entries) {
  if (!entries || entries.length === 0) {
    return { matrix: {}, ranked: [] };
  }

  const bySubject = {};
  for (const entry of entries) {
    const subject = entry.subject || 'General';
    if (!bySubject[subject]) bySubject[subject] = [];
    const stressProxy =
      typeof entry.burnoutScore === 'number'
        ? entry.burnoutScore
        : (10 - (entry.mood || 5)) * 11.1; // fallback rough proxy if no score stored
    bySubject[subject].push(stressProxy);
  }

  const matrix = {};
  const ranked = [];
  for (const [subject, scores] of Object.entries(bySubject)) {
    const avgScore = Math.round(average(scores));
    matrix[subject] = avgScore;
    ranked.push({ subject, avgScore, count: scores.length });
  }

  ranked.sort((a, b) => b.avgScore - a.avgScore);

  return { matrix, ranked };
}

module.exports = { buildSubjectMatrix };
