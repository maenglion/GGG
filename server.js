// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SpeechClient } from '@google-cloud/speech';
import textToSpeech from '@google-cloud/text-to-speech';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// --- CORS 설정 (기존과 동일하게 유지) ---
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://lozee.netlify.app' // ⭐ 실제 서비스 주소 추가
];
const corsOptions = {
  origin: function (origin, callback) {
    // origin이 없거나(예: Postman) 허용 목록에 있으면 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('✅ Lozee Backend Server is running!');
});

// --- Google Cloud 클라이언트 초기화 (기존과 동일) ---
let sttClient, ttsClient;
try {
  // ... (기존 클라이언트 초기화 로직)
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
}


// ==========================================================
// ⭐ GPT-Chat 핸들러 수정 ⭐
// ==========================================================
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4-turbo', temperature = 0.7, userId } = req.body;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages가 배열이 아니거나 비어있습니다.' });
  }
  
  console.log(`[Backend GPT] /api/gpt-chat 요청 수신 (UserID: ${userId})`);

  const messagesForOpenAI = messages.map(msg => {
      if (msg && msg.role === 'bot') {
        return { ...msg, role: 'assistant' };
      }
      return msg;
    }).filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string');

  const payloadForOpenAI = {
    model: model,
    messages: messagesForOpenAI,
    temperature: temperature
  };

  try {
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payloadForOpenAI)
    });

    if (!openAIAPIResponse.ok) {
        const errorBody = await openAIAPIResponse.text();
        console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${errorBody}`);
        return res.status(openAIAPIResponse.status).json({ error: 'OpenAI API에서 오류가 발생했습니다.', details: errorBody });
    }

    const gptData = await openAIAPIResponse.json();
    const rawAiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네.";

    let cleanText = rawAiContent;
    let parsedAnalysisData = {};

    // GPT 응답에서 `{"summaryTitle":`로 시작하는 JSON 블록을 찾음
    const jsonStartIndex = rawAiContent.indexOf('{"summaryTitle":');
    
    if (jsonStartIndex !== -1) {
        // JSON 시작 부분 이전까지를 순수 텍스트(사용자에게 보여줄 답변)로 간주
        cleanText = rawAiContent.substring(0, jsonStartIndex).trim();
        const jsonString = rawAiContent.substring(jsonStartIndex);
        
        try {
            parsedAnalysisData = JSON.parse(jsonString);
            console.log("[Backend GPT] GPT 응답에서 분석 JSON 파싱 성공.");
        } catch (e) {
            console.error("[Backend GPT] GPT 응답 내 분석 JSON 파싱 오류:", e);
            // 파싱 실패 시, 분리된 텍스트는 그대로 사용하고 분석 데이터는 빈 객체로 둠
            parsedAnalysisData = {}; 
        }
    } else {
        console.log("[Backend GPT] GPT 응답에서 분석 JSON을 찾지 못했습니다.");
    }

    // 만약 cleanText가 비어있다면, 원본 전체를 텍스트로 사용 (안전 장치)
    if (!cleanText) {
        cleanText = rawAiContent;
    }

    // 클라이언트에게 분리된 텍스트와 분석 객체를 전달
    res.json({ text: cleanText, analysis: parsedAnalysisData });

  } catch (err) {
    console.error("[Backend GPT] OpenAI API 호출 실패 또는 처리 중 오류:", err);
    return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.', details: err.message });
  }
});


// ==========================================================
// ⭐ STT 및 TTS 엔드포인트 (기존과 동일하게 유지) ⭐
// ==========================================================
app.post('/api/stt', async (req, res) => {
    // ... (기존 STT 로직)
});

app.post('/api/tts', async (req, res) => {
    // ... (기존 TTS 로직)
});

// ==========================================================
// ⭐ 서버 예외 처리 및 리스닝 (기존과 동일하게 유지) ⭐
// ==========================================================
process.on('uncaughtException', err => {
  console.error('!!!!!!!!!!!! Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!!!!!!!!!!! Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));