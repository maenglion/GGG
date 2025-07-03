// server.js
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fetch from 'node-fetch';
import cors from 'cors'; // cors 패키지 import는 그대로 유지됩니다.
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


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

// ✅ Google Cloud TTS 클라이언트 초기화: 여기가 가장 적절한 위치입니다.
//    GOOGLE_APPLICATION_CREDENTIALS 환경 변수를 자동으로 사용하므로,
//    credentials를 명시적으로 설정할 필요가 없습니다.
let googleTtsClient; // ✅ 변수 선언 (또는 const googleTtsClient; 로 되어 있다면 그대로)
try {
    // ⚠️ 오류 발생 원인 해결: 'textToSpeech.' 접두사를 제거합니다.
    googleTtsClient = new TextToSpeechClient(); // ✅ import한 TextToSpeechClient를 직접 사용합니다.
    
    console.log("✅ Google TTS 클라이언트 초기화 성공 (GOOGLE_APPLICATION_CREDENTIALS 사용)");
} catch (e) {
    console.error("❌ Google TTS 클라이언트 초기화 실패:", e);
    console.error("GOOGLE_APPLICATION_CREDENTIALS 환경 변수 또는 초기화 로직을 확인해주세요. 오류 상세: ", e.message);
    process.exit(1);
}

// ✅ CORS 미들웨어 설정
// 이전의 직접 구현한 CORS 미들웨어는 주석 처리되어 있습니다.
// `cors` 패키지를 사용하여 올바르게 설정합니다.
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'https://lozee.netlify.app' // ✅ Netlify 도메인 포함
    ],
    methods: ['GET', 'POST', 'OPTIONS'], // 허용할 HTTP 메서드
    allowedHeaders: ['Content-Type', 'Authorization'], // 허용할 헤더
    credentials: true // 자격 증명(쿠키, 인증 헤더 등) 허용
}));

app.use(express.json({ limit: '10mb' }));

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
  // 클라이언트에서 보낸 max_tokens, model, temperature를 활용하도록 변경
  const clientModel = req.body.model || 'gpt-4o'; // 클라이언트에서 보낸 모델 사용, 없으면 gpt-4o 기본
  const clientTemperature = req.body.temperature || 0.7;
  const clientMaxTokens = req.body.max_tokens || 500; // 클라이언트가 보낸 max_tokens 사용, 없으면 기본값 500

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: '유효하지 않은 요청입니다.' });
  
  const payload = { 
    model: clientModel, 
    messages, 
    temperature: clientTemperature,
    max_tokens: clientMaxTokens // ✅ 클라이언트에서 받은 max_tokens 적용
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`OpenAI API 오류: ${response.statusText} - ${JSON.stringify(errorBody)}`);
    }

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

// ✅ Google Cloud TTS API 라우트 (이 부분은 변경 없음)
app.post('/api/google-tts', async (req, res) => {
  try {
    const { text, voiceName } = req.body; // ✅ 여기선 그냥 req.body 사용

    const client = new textToSpeech.TextToSpeechClient({ credentials });

    const request = {
      input: { text },
      voice: {
        languageCode: 'ko-KR',
        name: voiceName || 'ko-KR-Chirp3-HD-Leda'
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await client.synthesizeSpeech(request);
    res.send(response.audioContent);

  } catch (error) {
    console.error('❌ Google TTS 에러:', error);
    res.status(500).send({
      error: 'Google TTS 오디오 생성 중 서버 오류 발생',
      detail: error.message
    });
  }
});
 try {
    let rawText = req.body.text;

    const client = new textToSpeech.TextToSpeechClient

    const request = {
      input: { text: cleanText },
      voice: {
        languageCode: 'ko-KR',
        name: req.body.voiceName || 'ko-KR-Chirp3-HD-Leda'
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await client.synthesizeSpeech(request);
    res.send(response.audioContent);

  } catch (error) {
    console.error('❌ Google TTS 에러:', error);
    res.status(500).send({
      error: 'Google TTS 오디오 생성 중 서버 오류 발생',
      detail: error.message
    });
  }
});

// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port} (Railway에서는 자동으로 포트 매핑)`);
});
