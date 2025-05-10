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
}


// --- API 엔드포인트 정의 ---

// ✅ GPT 대화
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.7, userId, userAge, userDisease /* 사용자 정보 추가 */ } = req.body;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0 /* 빈 messages 배열 방지 */) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages 누락 또는 배열 아님 또는 비어있음' });
  }

  // 사용자 정보 로깅 (개인정보에 주의)
  console.log(`[Backend GPT] /api/gpt-chat 요청. UserID: ${userId}, Model: ${model}, Message count: ${messages.length}`);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      // 사용자 정보(userAge, userDisease 등)를 시스템 프롬프트나 메시지 내용에 포함시켜 GPT에 전달할 수 있습니다.
      // 여기서는 messages 배열을 그대로 사용합니다. 필요시 프론트엔드에서 messages 배열에 해당 정보를 추가하거나,
      // 백엔드에서 시스템 메시지를 추가하는 로직을 구현할 수 있습니다.
      body: JSON.stringify({ model, messages, temperature })
    });
    const responseBody = await response.text(); 
    if (!response.ok) {
        console.error(`[Backend GPT] OpenAI API 오류 (${response.status}): ${responseBody}`);
        return res.status(response.status).send(responseBody);
    }
    
    const gptData = JSON.parse(responseBody);
    console.log("[Backend GPT] OpenAI API 응답 수신됨.");
    // GPT 응답에서 rephrasing과 summary를 기대하는 프론트엔드 로직에 맞춰 응답 구조 조정
    // (실제 gptData.choices[0].message.content 에 rephrasing과 summary가 함께 있는지,
    // 아니면 별도의 로직으로 생성해야 하는지 확인 필요)
    const aiContent = gptData?.choices?.[0]?.message?.content || "죄송합니다, 답변을 이해하지 못했어요.";
    // 임시로 rephrasing만 반환, summary 로직은 필요에 따라 추가
    res.json({ rephrasing: aiContent /*, summary: "요약 내용 필요시 추가" */ });

  } catch (err) {
    console.error('[Backend GPT] GPT 호출 중 네트워크 또는 기타 오류:', err);
    res.status(500).json({ error: 'GPT 호출 중 오류 발생', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트
app.post('/api/stt', async (req, res) => {
  if (!sttClient) { // 클라이언트 초기화 실패 시
    console.error("[Backend STT] STT 클라이언트가 초기화되지 않았습니다.");
    return res.status(500).json({ error: 'STT 서비스를 사용할 수 없습니다. 서버 설정을 확인하세요.' });
  }
  const { audioContent } = req.body; // 프론트엔드에서 Base64 인코딩된 문자열을 보낸다고 가정
  if (!audioContent) {
    console.error("[Backend STT] 요청 본문에 audioContent가 없습니다.");
    return res.status(400).json({ error: 'audioContent 누락' });
  }
  
  console.log("[Backend STT] /api/stt 요청 수신됨. audioContent 앞 50자:", String(audioContent).substring(0,50) + "...");

  try {
const sttRequestConfig = {
  encoding: 'WEBM_OPUS', // 이 부분을 수정
  // sampleRateHertz: 48000, // WEBM_OPUS 사용 시 보통 주석 처리하거나 프론트와 일치
  languageCode: 'ko-KR',
  enableAutomaticPunctuation: true,
};
      languageCode: 'ko-KR',
      enableAutomaticPunctuation: true, // 자동 구두점 추가
      // model: 'latest_long', // 긴 오디오(1분 이상)의 경우 고려, 이 경우 sttClient.longRunningRecognize 사용 필요
    };
    console.log("[Backend STT] Google Cloud STT API 호출 시작. Config:", sttRequestConfig);

    // Google STT API 호출 (짧은 오디오용. 긴 오디오는 longRunningRecognize() 사용 고려)
    const [googleSttResponse] = await sttClient.recognize({ // 변수명을 googleSttResponse로 변경하여 명확화
      audio: { content: audioContent }, // Base64 문자열 직접 사용
      config: sttRequestConfig
    });

    // === ★ Google STT API의 실제 응답 전체를 로그로 출력 (추가된 부분) ★ ===
    console.log("[Backend STT] Google Cloud STT API 실제 응답 전체:", JSON.stringify(googleSttResponse, null, 2));
    // =================================================================

    const transcription = googleSttResponse.results && googleSttResponse.results.length > 0 && googleSttResponse.results[0].alternatives && googleSttResponse.results[0].alternatives.length > 0
        ? googleSttResponse.results.map(result => result.alternatives[0].transcript).join('\n')
        : ""; 

    console.log("[Backend STT] 최종 변환된 텍스트:", `"${transcription}"`);
    res.json({ text: transcription });

  } catch (err) {
    console.error('[Backend STT] STT API 호출 실패 또는 처리 중 오류:', err);
    res.status(500).json({ error: 'STT API 처리 중 오류 발생', details: err.message });
  }
});

// ✅ TTS 텍스트 → 음성 (목소리 선택 반영)
app.post('/api/tts', async (req, res) => {
  if (!ttsClient) { // 클라이언트 초기화 실패 시
      console.error("[Backend TTS] TTS 클라이언트가 초기화되지 않았습니다.");
      return res.status(500).json({ error: 'TTS 서비스를 사용할 수 없습니다. 서버 설정을 확인하세요.' });
  }
  const { text, voice: voiceId } = req.body;

  if (!text) {
    console.error("[Backend TTS] 요청 본문에 text가 없습니다.");
    return res.status(400).json({ error: 'text 누락' });
  }
  
  console.log(`[Backend TTS] /api/tts 요청 수신. Text: "${String(text).substring(0,30)}...", Voice ID: ${voiceId}`);

  try {
    const ttsRequest = {
      input: { text: text },
      voice: {
        languageCode: 'ko-KR',
        ...(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR')) && { name: voiceId },
        ...(!(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR')) && { ssmlGender: 'FEMALE' })
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: 1.35 // 말하기 속도 (기존 코드에서 확인된 값)
      },
    };

    console.log("[Backend TTS] Google Cloud TTS API 호출 시작. Voice Config:", JSON.stringify(ttsRequest.voice));
    console.log("[Backend TTS] Google Cloud TTS API 호출 시작. Audio Config:", JSON.stringify(ttsRequest.audioConfig));
    
    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    console.log("[Backend TTS] Google Cloud TTS API 응답 수신됨.");

    res.set('Content-Type', 'audio/mpeg'); 
    res.send(response.audioContent);
  } catch (err) {
    console.error('[Backend TTS] TTS API 호출 실패 또는 처리 중 오류:', err); 
    res.status(500).json({ error: 'TTS API 처리 중 오류 발생', details: err.message });
  }
});

// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
