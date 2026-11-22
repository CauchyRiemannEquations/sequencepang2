// Release times are instants, independent of the device timezone.
export const hundredStageRelease = Date.parse('2026-10-01T00:00:00+09:00');
export const frostRelease = Date.parse('2026-11-22T00:00:00+09:00');
const noticeDuration = 14 * 24 * 60 * 60 * 1000;

export function showHundredStageNotice(now = Date.now()) {
  return now >= hundredStageRelease && now < hundredStageRelease + noticeDuration;
}

export function releaseNotice(now = Date.now()) {
  if (now >= frostRelease && now < frostRelease + noticeDuration) return '101–110단계 · 서리 정원';
  if (showHundredStageNotice(now)) return '100단계 업데이트!';
  return '';
}

export function playableLevels(allLevels, now = Date.now()) {
  if (now < hundredStageRelease) return allLevels.slice(0, 50);
  if (now < frostRelease) return allLevels.slice(0, 100);
  return allLevels;
}
