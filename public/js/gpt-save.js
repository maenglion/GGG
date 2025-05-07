// gpt-save.js

import { db } from './firebase-config.js';
import { formatDateTime, calculateEmotionScore, extractKeywords } from './common-utils.js';

// GPT 응답 저장 함수
export async function saveGPTResult({ userId, summaryText, emotionTags, fullText }) {
  try {
    const docRef = await addDoc(collection(db, "journals"), {
      userId: userId || 'anonymous',
      createdAt: formatDateTime(),
      summary: summaryText,
      fullText: fullText,
      emotionTags: emotionTags,
      emotionScore: calculateEmotionScore(emotionTags),
      keywords: extractKeywords(summaryText)
    });
    console.log("📦 일기 저장 완료! ID:", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("❌ 저장 실패:", e);
    throw e;
  }
}
