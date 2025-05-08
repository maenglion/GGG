import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors'; // cors import 확인
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// ... (다른 import 구문들) ...

dotenv.config();

const app = express();
// ... (기타 변수 설정) ...

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CORS 설정 시작 ---
// 기존 app.use(cors()); 라인은 주석 처리하거나 삭제합니다.
// app.use(cors()); // <--- 이 라인 대신 아래 내용을 사용합니다.

// 허용할 출처 목록 정의
const allowedOrigins = [
  'http://127.0.0.1:5500', // 로컬 개발 환경 주소
  'https://storied-hamster-7942d1.netlify.app' // 사용자님의 Netlify 앱 주소 추가!
  // 만약 다른 프론트엔드 주소가 있다면 여기에 추가합니다.
];

const corsOptions = {
  origin: function (origin, callback) {
    // 요청 헤더에 origin이 없거나(예: 서버 간 요청, Postman 등), 허용 목록에 포함된 경우 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS')); // 허용되지 않은 출처는 에러 발생
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // API가 사용하는 HTTP 메소드 명시
  allowedHeaders: ['Content-Type', 'Authorization'], // 프론트엔드에서 보낼 수 있는 헤더 명시 (필요시 추가)
  // credentials: true, // 만약 쿠키나 인증 헤더를 주고받아야 한다면 true로 설정
  optionsSuccessStatus: 200 // 일부 오래된 브라우저 호환성
};

// 설정된 옵션으로 cors 미들웨어를 적용합니다.
app.use(cors(corsOptions));
// --- CORS 설정 끝 ---

const sttClient = new SpeechClient({ credentials: JSON.parse(GOOGLE_APPLICATION_CREDENTIALS) });
const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(GOOGLE_APPLICATION_CREDENTIALS) });

// ✅ GPT 대화
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.7 } = req.body;
  if (!OPENAI_API_KEY || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '유효하지 않은 요청' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature })
    });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).send(text);
    res.send(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: 'GPT 호출 오류', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트
app.post('/api/stt', async (req, res) => {
  const { audioContent } = req.body;
  if (!audioContent) return res.status(400).json({ error: 'audioContent 누락' });

  try {
    const [response] = await sttClient.recognize({
      audio: { content: audioContent },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'ko-KR',
        enableAutomaticPunctuation: true
      }
    });
    const text = response.results.map(r => r.alternatives[0].transcript).join('\n');
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'STT 실패', details: err.message });
  }
});

// ✅ TTS 텍스트 → 음성
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text 누락' });

  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'ko-KR', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3' }
    });

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);
  } catch (err) {
    res.status(500).json({ error: 'TTS 실패', details: err.message });
  }
});

// ✅ SPA 대응
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, err => {
    if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});

