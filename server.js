// server.js
import express from 'express';
import fetch from 'node-fetch'; // fetch는 필요에 따라 유지하거나 제거 (Google SDK는 자체 클라이언트 사용)
import cors from 'cors'; // cors는 이미 설정되어 있으므로 유지
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- 1. 환경변수 및 Firebase Admin 설정 ---
dotenv.config();

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serviceAccountPath = path.join(__dirname, './lozee-65a82-firebase-adminsdk-vpx56-8a504b503d.json');
    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`서비스 계정 파일을 찾을 수 없습니다: ${serviceAccountPath}.`);
    }
    const serviceAccountFile = fs.readFileSync(serviceAccountPath, 'utf8');
    serviceAccount = JSON.parse(serviceAccountFile);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// CORS 미들웨어 설정
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'https://lozee.netlify.app'
    ];

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    
    next();
});

app.use(express.json({ limit: '10mb' }));

// Firebase 인증 미들웨어
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized: No token provided');
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase 토큰 인증 실패:', error);
    res.status(403).send('Unauthorized: Invalid token');
  }
}

// --- API 라우트 설정 ---
app.post('/api/gpt-chat', verifyFirebaseToken, async (req, res) => {
  const { messages } = req.body;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: '유효하지 않은 요청입니다.' });
  
  const payload = { model: 'gpt-4-turbo', messages, temperature: 0.7 };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`OpenAI API 오류: ${response.statusText}`);

    const gptData = await response.json();
    const rawAiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네.";

    // ⭐ FIX: JSON과 텍스트를 분리하는 로직 강화
    let cleanText = rawAiContent;
    let parsedAnalysisData = {};
    
    const jsonStartIndex = rawAiContent.indexOf('{');
    if (jsonStartIndex !== -1) {
        const potentialJson = rawAiContent.substring(jsonStartIndex);
        try {
            parsedAnalysisData = JSON.parse(potentialJson);
            cleanText = rawAiContent.substring(0, jsonStartIndex).trim();
            console.log("✅ JSON 분리 성공");
        } catch (e) {
            console.error("⚠️ 분석 JSON 파싱 오류. 응답 전체를 텍스트로 처리합니다.", e);
            cleanText = rawAiContent;
            parsedAnalysisData = {};
        }
    }
    res.json({ text: cleanText, analysis: parsedAnalysisData });

  } catch (err) {
    console.error("[Backend] API 호출 실패:", err);
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// ✅ Google Cloud TTS API 라우트 (이 부분을 새로 추가합니다)
app.post('/api/google-tts', verifyFirebaseToken, async (req, res) => {
    const { text, voiceName } = req.body;

    if (!text || !voiceName) {
        return res.status(400).json({ error: "text와 voiceName 파라미터가 필요합니다." });
    }

    const request = {
        input: { text: text },
        voice: { languageCode: 'ko-KR', name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
    };

    try {
        const [response] = await googleTtsClient.synthesizeSpeech(request);
        res.set('Content-Type', 'audio/mpeg');
        res.send(response.audioContent);
    } catch (error) {
        console.error("[Backend] Google TTS API 호출 실패:", error);
        res.status(500).json({ error: "Google TTS 오디오 생성 중 서버 오류 발생" });
    }
});


// 서버 시작 (이 부분은 유지합니다)
app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));