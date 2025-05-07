// common-utils.js

// 날짜/시간 포맷
export function formatDateTime(dateObj = new Date()) {
  const options = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  };
  return new Intl.DateTimeFormat('ko-KR', options).format(dateObj);
}

// 감정 점수 계산 예시 (나중에 고도화 가능)
export function calculateEmotionScore(emotionTags = []) {
  const base = 50;
  const delta = emotionTags.includes('화남') || emotionTags.includes('슬픔') ? -10 : 10;
  return base + delta;
}

// 중요 키워드 자동 추출 (단어 길이 기준 예시)
export function extractKeywords(text) {
  const words = text.split(/\s+/);
  return words.filter(w => w.length > 3).slice(0, 5);
}