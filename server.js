// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ Google Cloud Text-to-Speech 클라이언트 라이브러리 import
import { TextToSpeechClient } from '@google-cloud/text-to-speech';


process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});


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


// ✅ Google Cloud TTS 클라이언트 초기화
let googleTtsClient;

try {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경변수가 비어 있습니다.');

  let credentials;
  if (fs.existsSync(raw)) {
    const file = fs.readFileSync(raw, 'utf-8');
    credentials = JSON.parse(file);
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS: 파일 경로로부터 로드 성공');
  } else {
    credentials = JSON.parse(raw.replace(/\\n/g, '\n')); // ✅ 반드시 복원 필요
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS: 문자열 JSON 파싱 성공');
  }

  googleTtsClient = new TextToSpeechClient({ credentials });
  console.log('✅ Google TTS 클라이언트 초기화 성공');

} catch (e) {
  console.error('❌ Google TTS 초기화 실패:', e.message);
  process.exit(1);
}



// ✅ CORS 미들웨어 설정 (가장 상단에 위치하여 모든 요청에 적용되도록)
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'https://lozee.netlify.app'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' })); // JSON 파싱 미들웨어

// Firebase 인증 미들웨어 (이 부분은 변경 없음)
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
// GPT Chat API 라우트 (이 부분은 변경 없음)
app.post('/api/gpt-chat', verifyFirebaseToken, async (req, res) => {
  const { messages } = req.body;
  const clientModel = req.body.model || 'gpt-4o';
  const clientTemperature = req.body.temperature || 0.7;
  const clientMaxTokens = req.body.max_tokens || 500;

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: '유효하지 않은 요청입니다.' });
  
  const payload = { 
    model: clientModel, 
    messages, 
    temperature: clientTemperature,
    max_tokens: clientMaxTokens
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API 오류: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const gptData = await response.json();
    const rawAiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네.";

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

// ✅ Google Cloud TTS API 라우트 (하나로 통합 및 수정)
app.post('/api/google-tts', verifyFirebaseToken, async (req, res) => {
  try {
    
    
    const { text, voiceName } = req.body; // 클라이언트에서 'text'와 'voiceName'으로 보냄

    // `googleTtsClient`는 전역으로 이미 선언되고 초기화되었습니다.
    // 따라서 이 라우트 내부에서 'new TextToSpeechClient()'를 다시 호출하거나
    // 'const client = new textToSpeech.TextToSpeechClient()'처럼 선언할 필요가 없습니다.
    // 이미 전역 변수 'googleTtsClient'를 사용할 수 있습니다.

    if (!text || !voiceName) { // 파라미터 유효성 검사
        return res.status(400).json({ error: "text와 voiceName 파라미터가 필요합니다." });
    }
    
    const request = {
      input: { text: text }, // ✅ 클라이언트에서 받은 text 사용
      voice: {
        languageCode: 'ko-KR',
        name: voiceName // ✅ 클라이언트에서 받은 voiceName 사용
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await googleTtsClient.synthesizeSpeech(request); // 이 줄 유지 
    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);

  } catch (error) {
    console.error('❌ Google TTS 에러:', error);
    res.status(500).send({
      error: 'Google TTS 오디오 생성 중 서버 오류 발생',
      detail: error.message // Google Cloud TTS API의 상세 에러 메시지를 포함
    });
  }
});

// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${port} (Railway에서는 자동으로 포트 매핑)`);
});