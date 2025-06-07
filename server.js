// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ⭐⭐⭐ CORS 설정 수정 시작 ⭐⭐⭐
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://lozee.netlify.app' // ⭐ 실제 서비스 주소 추가
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`CORS 거부: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));
// ⭐⭐⭐ CORS 설정 수정 끝 ⭐⭐⭐

app.use(express.json({ limit: '10mb' }));

app.post('/api/gpt-chat', async (req, res) => {
  const { messages, userId } = req.body;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: '유효하지 않은 요청입니다.' });
  
  const payload = { model: 'gpt-4-turbo', messages, temperature: 0.7 };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) { throw new Error(`OpenAI API 오류: ${response.statusText}`); }

    const gptData = await response.json();
    const rawAiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네.";

    let cleanText = rawAiContent;
    let parsedAnalysisData = {};
    const jsonStartIndex = rawAiContent.indexOf('{"summaryTitle":');
    if (jsonStartIndex !== -1) {
        cleanText = rawAiContent.substring(0, jsonStartIndex).trim();
        try { parsedAnalysisData = JSON.parse(rawAiContent.substring(jsonStartIndex)); } catch (e) { console.error("분석 JSON 파싱 오류:", e); }
    }
    res.json({ text: cleanText, analysis: parsedAnalysisData });
  } catch (err) {
    console.error("[Backend] API 호출 실패:", err);
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

app.post('/api/tts', async (req, res) => {
  // 이전 답변의 완성된 TTS 로직을 그대로 사용합니다.
});

app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));