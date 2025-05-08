// ✅ server.js (STT + GPT + Google Cloud TTS 통합 / CORS 및 TTS 수정 / 정적파일 제거 버전)
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path'; // path는 여전히 __dirname 구성에 필요할 수 있음
import { fileURLToPath } from 'url';
import { SpeechClient } from '@google-cloud/speech';
import textToSpeech from '@google-cloud/text-to-speech'; // textToSpeech import 확인

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS; // JSON 키 파일 내용

// __dirname 설정 (ES Module 환경)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CORS 설정 시작 ---
// 허용할 출처 목록 정의
const allowedLocalOrigins = [
  'http://127.0.0.1:5500' // 로컬 개발 환경 주소
];

const corsOptions = {
  origin: function (origin, callback) {
    // 요청 헤더에 origin이 없거나(Postman 등), 로컬 주소인 경우 허용
    if (!origin || allowedLocalOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // 요청 origin이 '.netlify.app'으로 끝나는지 확인하여 Netlify 관련 주소 허용
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.endsWith('.netlify.app')) {
        return callback(null, true);
      }
    } catch (e) {
      console.error(`CORS: 잘못된 origin 형식 - ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    }

    // 위 조건에 해당하지 않으면 허용되지 않음
    console.error(`CORS 거부: Origin ${origin} 허용 목록에 없음`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 필요한 메소드 허용
  allowedHeaders: ['Content-Type', 'Authorization'],   // 필요한 헤더 허용
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions)); // 설정된 옵션으로 cors 미들웨어 적용
// --- CORS 설정 끝 ---

// JSON 본문 파싱 미들웨어 (API 요청 처리에 필요)
app.use(express.json({ limit: '10mb' })); // 오디오 Base64 데이터 크기 고려하여 limit 설정

// Google Cloud 클라이언트 초기화 (환경 변수 확인)
let sttClient, ttsClient;
try {
  if (!GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
  }
  const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  sttClient = new SpeechClient({ credentials });
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials }); // 올바른 변수명 사용
  console.log("✅ Google Cloud 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
  // 클라이언트 초기화 실패 시 서버가 시작되지 않도록 처리하거나,
  // API 호출 시 에러를 반환하도록 할 수 있습니다.
  // 여기서는 일단 로그만 남기고 서버는 시작되도록 둡니다.
  // API 핸들러 내부에서 클라이언트 객체가 있는지 확인하는 로직이 필요할 수 있습니다.
}


// --- API 엔드포인트 정의 ---

// ✅ GPT 대화
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.7 } = req.body;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages 누락 또는 배열 아님' });
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
    const responseBody = await response.text(); // 에러 발생 시 상세 내용을 보기 위해 text()로 먼저 받음
    if (!response.ok) {
        console.error(`GPT API 오류 (${response.status}): ${responseBody}`);
        // OpenAI 오류 메시지를 클라이언트에 그대로 전달하거나, 가공해서 전달
        return res.status(response.status).send(responseBody);
    }
    res.send(JSON.parse(responseBody)); // 성공 시 JSON으로 파싱하여 전달
  } catch (err) {
    console.error('GPT 호출 중 네트워크 또는 기타 오류:', err);
    res.status(500).json({ error: 'GPT 호출 중 오류 발생', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트
app.post('/api/stt', async (req, res) => {
  if (!sttClient) { // 클라이언트 초기화 실패 시
    return res.status(500).json({ error: 'STT 서비스를 사용할 수 없습니다. 서버 설정을 확인하세요.' });
  }
  const { audioContent } = req.body; // 프론트엔드에서 Base64 인코딩된 문자열을 보낸다고 가정
  if (!audioContent) return res.status(400).json({ error: 'audioContent 누락' });

  try {
    const [response] = await sttClient.recognize({
      audio: { content: audioContent }, // Base64 문자열 직접 사용
      config: {
        // 인코딩과 샘플링 레이트는 프론트엔드 녹음 설정과 맞춰야 함 (LINEAR16은 비압축 PCM)
        // 만약 프론트엔드가 webm/opus로 녹음한다면 encoding: 'WEBM_OPUS' 등을 고려
        encoding: 'LINEAR16',
        sampleRateHertz: 48000, // 프론트엔드 녹음 설정과 일치 필요
        languageCode: 'ko-KR',
        enableAutomaticPunctuation: true // 자동 구두점 추가
      }
    });
    const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
    res.json({ text: transcription });
  } catch (err) {
    console.error('STT 실패:', err);
    res.status(500).json({ error: 'STT 실패', details: err.message });
  }
});

// ✅ TTS 텍스트 → 음성 (목소리 선택 반영)
app.post('/api/tts', async (req, res) => {
  if (!ttsClient) { // 클라이언트 초기화 실패 시
      return res.status(500).json({ error: 'TTS 서비스를 사용할 수 없습니다. 서버 설정을 확인하세요.' });
  }
  // 요청 본문에서 text와 voiceId (프론트엔드에서 'voice' 키로 보냄)를 추출
  const { text, voice: voiceId } = req.body;

  if (!text) return res.status(400).json({ error: 'text 누락' });

  try {
    // Google Cloud TTS 요청 구성 객체 생성
    const ttsRequest = {
      input: { text: text },
      // voice 설정: voiceId가 있으면 해당 voiceId를 'name'으로 사용, 없으면 기본값 사용
      voice: {
        languageCode: 'ko-KR',
        // voiceId가 제공되었고 유효한 형식이라면 name으로 지정
        // 예: 'ko-KR-Chirp3-HD-Zephyr' 같은 형식
        ...(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR') && { name: voiceId }),
        // voiceId가 없거나 유효하지 않으면 ssmlGender로 기본 설정 (선택 사항)
        ...(!(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR')) && { ssmlGender: 'FEMALE' })
      },
      audioConfig: { audioEncoding: 'MP3' }, // 오디오 인코딩 MP3
    };

    // console.log("TTS 요청 정보:", JSON.stringify(ttsRequest, null, 2)); // 디버깅용 로그

    // Google Cloud TTS API 호출
    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);

    // 오디오 데이터 전송
    res.set('Content-Type', 'audio/mpeg'); // MP3 컨텐츠 타입 설정
    res.send(response.audioContent);
  } catch (err) {
    console.error('TTS 실패:', err); // 서버 로그에 상세 에러 기록
    res.status(500).json({ error: 'TTS 실패', details: err.message }); // 클라이언트에는 일반적인 에러 메시지 전달
  }
});

// -----------------------------------------------------------
// --- 정적 파일 제공 및 SPA 라우팅 코드 제거 ---
// app.use(express.static(path.join(__dirname, 'public')));
// app.get('*', (req, res) => {
//   const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
//   res.sendFile(filePath, err => {
//     if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
//   });
// });
// -----------------------------------------------------------


// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});