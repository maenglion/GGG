// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
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

// ⭐ FIX: More robust CORS handling placed before any other middleware.
// This ensures that all OPTIONS (pre-flight) requests are handled correctly.
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
    
    // Intercept OPTIONS method
    if (req.method === 'OPTIONS') {
        // Respond with 204 'No Content' status for pre-flight requests
        return res.sendStatus(204);
    }
    
    next();
});

app.use(express.json({ limit: '10mb' }));

// --- 3. Firebase 인증 미들웨어 ---
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

// --- 4. API 라우트 설정 ---
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

app.post('/api/tts', verifyFirebaseToken, async (req, res) => {
    const { text, voice } = req.body;
    if (!text || !voice) {
        return res.status(400).json({ error: "text와 voice 파라미터가 필요합니다." });
    }
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
    }
    const payload = { model: "tts-1", input: text, voice: voice };
    try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`OpenAI TTS API 오류: ${response.statusText} - ${errorBody}`);
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        response.body.pipe(res);
    } catch (error) {
        console.error("[Backend] TTS API 호출 실패:", error);
        res.status(500).json({ error: "TTS 오디오 생성 중 서버 오류 발생" });
    }
});

// --- 5. 서버 시작 ---
app.listen(port, () => console.log(`🚀 Server listening on port ${port}`));
