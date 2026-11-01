// SOURCE_DATE_EPOCH gives rebuilds a stable UTC banner without changing the
// default banner used by existing release commands.
module.exports = function buildDate(epoch = process.env.SOURCE_DATE_EPOCH) {
  if (typeof epoch === 'undefined') {
    return new Date().toDateString();
  }
  if (!/^\d+$/.test(epoch)) {
    throw new Error('SOURCE_DATE_EPOCH must contain non-negative integer seconds');
  }
  const date = new Date(Number(epoch) * 1000);

  if (!Number.isFinite(date.getTime())) {
    throw new Error('SOURCE_DATE_EPOCH is outside the supported date range');
  }

  return date.toISOString().split('T')[0];
};
