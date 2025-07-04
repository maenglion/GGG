// ✅ 완전히 수정된 server.js — TTS + CORS 오류 해결

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const app = express();
const port = process.env.PORT || 3000;
dotenv.config();

// ✅ CORS — 맨 위에서 설정
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
app.options('*', cors());

// ✅ firebase-admin 초기화
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serviceAccountPath = path.join(__dirname, './lozee-65a82-firebase-adminsdk-vpx56-8a504b503d.json');
  if (!fs.existsSync(serviceAccountPath)) throw new Error(`서비스 계정 파일 없음: ${serviceAccountPath}`);
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// ✅ Google Cloud TTS 클라이언트 초기화
let googleTtsClient;
try {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경변수가 비어 있음');
  let credentials;
  if (fs.existsSync(raw)) {
    credentials = JSON.parse(fs.readFileSync(raw, 'utf8'));
  } else {
    credentials = JSON.parse(raw.replace(/\\n/g, '\n'));
  }
  googleTtsClient = new TextToSpeechClient({ credentials });
  console.log('✅ Google TTS 클라이언트 초기화 성공');
} catch (e) {
  console.error('❌ Google TTS 초기화 실패:', e.message);
  process.exit(1);
}

app.use(express.json({ limit: '10mb' }));

// ✅ Firebase 인증 미들웨어
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    req.user = decoded;
    next();
  } catch (e) {
    console.error('Firebase 토큰 인증 실패:', e);
    res.status(403).send('Unauthorized');
  }
}

// ✅ GPT API 라우트
app.post('/api/gpt-chat', verifyFirebaseToken, async (req, res) => {
  const { messages, model = 'gpt-4o', temperature = 0.7, max_tokens = 500 } = req.body;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API 키 없음' });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });
    if (!response.ok) throw new Error(`OpenAI 오류: ${response.statusText}`);
    const gptData = await response.json();
    const raw = gptData?.choices?.[0]?.message?.content || '응답 없음';
    let json = {};
    try {
      const idx = raw.indexOf('{');
      if (idx !== -1) {
        json = JSON.parse(raw.substring(idx));
        res.json({ text: raw.substring(0, idx).trim(), analysis: json });
        return;
      }
    } catch (e) { /* ignore */ }
    res.json({ text: raw, analysis: {} });
  } catch (e) {
    console.error('[GPT 오류]', e);
    res.status(500).json({ error: '서버 오류', detail: e.message });
  }
});

// ✅ TTS API 라우트
app.post('/api/google-tts', async (req, res) => {
  try {
    const { text, voice = 'ko-KR-Chirp3-HD-Leda' } = req.body;
    if (!text) return res.status(400).json({ error: '텍스트 누락됨' });

    const request = {
      input: { text },
      voice: {
        languageCode: 'ko-KR',
        name: voice
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await googleTtsClient.synthesizeSpeech(request);
    if (!response.audioContent) return res.status(500).json({ error: 'TTS 응답 없음' });

    res.set('Access-Control-Allow-Origin', 'https://lozee.netlify.app');
    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);
  } catch (e) {
    console.error('❌ TTS 처리 오류:', e);
    res.status(500).json({ error: 'TTS 오류', detail: e.message });
  }
});

// ✅ 서버 시작
app.listen(port, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${port}`);
});
