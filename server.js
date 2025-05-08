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

const allowedLocalOrigins = [ // 로컬 개발용 주소는 명시적으로 관리
  'http://127.0.0.1:5500'
];

const corsOptions = {
  origin: function (origin, callback) {
    // 요청 헤더에 origin이 없는 경우(Postman 등) 또는 로컬 주소인 경우 허용
    if (!origin || allowedLocalOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // 요청 origin이 '.netlify.app'으로 끝나는지 확인하여 Netlify 관련 주소 허용
    // URL 객체를 사용하여 안전하게 호스트네임 추출 및 검사
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.endsWith('.netlify.app')) {
        return callback(null, true);
      }
    } catch (e) {
      // origin 형식이 잘못된 경우 거부
      console.error(`CORS: 잘못된 origin 형식 - ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    }

    // 위 조건에 해당하지 않으면 허용되지 않음
    console.error(`CORS 거부: Origin ${origin} 허용 목록에 없음`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // credentials: true, // 필요시 주석 해제
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions)); // 수정된 corsOptions 적용

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

