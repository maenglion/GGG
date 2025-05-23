// ✅ server.js (OpenAI API 'role' 값 수정, TTS 속도 1.0으로 변경, STT 관련 주석 추가 등)
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CORS 설정 ---
const allowedLocalOrigins = [
  'http://127.0.0.1:5500'
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedLocalOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.endsWith('.netlify.app') || originUrl.hostname.endsWith('.scf.usercontent.goog')) {
        return callback(null, true);
      }
    } catch (e) {
      console.error(`CORS: 잘못된 origin 형식 - ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
    console.error(`CORS 거부: Origin ${origin} 허용 목록에 없음`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// --- CORS 설정 끝 ---

app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('✅ Hello from Railway!');
});

let sttClient, ttsClient;
try {
  if (!GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
  }
  let credentials;
  if (GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{')) {
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  } else {
    console.warn("GOOGLE_APPLICATION_CREDENTIALS가 파일 경로일 수 있습니다. 현재는 JSON 문자열로 간주합니다. 실제 환경에 따라 수정이 필요할 수 있습니다.");
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  }

  sttClient = new SpeechClient({ credentials });
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
  console.log("✅ Google Cloud 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
}

// --- API 엔드포인트 정의 ---

app.post('/api/gpt-chat', async (req, res) => {
  let { // messages를 let으로 변경하여 재할당 가능하도록 함
    messages,
    model = 'gpt-4-turbo',
    temperature = 0.7,
    userId,
  } = req.body;

  console.log("==========================================================");
  console.log(`[Backend GPT] /api/gpt-chat 요청 시작 (UserID: ${userId}, Model: ${model}, Temp: ${temperature})`);
  console.log("[Backend GPT] 클라이언트로부터 받은 원본 req.body.messages 타입:", typeof messages);
  if (typeof messages === 'string') {
    console.log("[Backend GPT] 원본 req.body.messages 내용 (문자열, 앞 200자):", messages.substring(0,200) + "...");
  } else {
    console.log("[Backend GPT] 원본 req.body.messages 내용 (객체/배열):", JSON.stringify(messages, null, 2));
  }


  if (!OPENAI_API_KEY) {
    console.error("[Backend GPT] OpenAI API 키가 설정되지 않았습니다.");
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }

  // messages 타입 확인 및 JSON 파싱
  if (typeof messages === 'string') {
    console.log("[Backend GPT] req.body.messages가 문자열이므로 JSON.parse()를 시도합니다.");
    try {
      messages = JSON.parse(messages);
      console.log("[Backend GPT] JSON.parse() 성공. messages 타입:", typeof messages, "배열 여부:", Array.isArray(messages));
    } catch (parseError) {
      console.error("[Backend GPT] req.body.messages 문자열 JSON 파싱 실패:", parseError);
      return res.status(400).json({ error: '잘못된 messages 형식: JSON 문자열 파싱 실패' });
    }
  }

  // messages가 배열인지, 비어있지 않은지 최종 확인
  if (!Array.isArray(messages) || messages.length === 0) {
    console.error("[Backend GPT] 유효하지 않은 요청: messages가 배열이 아니거나 비어있음 (파싱 후 확인).");
    return res.status(400).json({ error: '유효하지 않은 요청: messages가 배열이 아니거나 비어있습니다 (파싱 후 확인).' });
  }

  console.log("[Backend GPT] 최종적으로 처리할 messages 배열 (파싱 후, map 전):", JSON.stringify(messages, null, 2));
  if (messages.length > 2) {
    console.log("----------------------------------------------------------");
    console.log("[Backend GPT] 처리할 messages[2] (파싱 후, map 전) 상세:", JSON.stringify(messages[2], null, 2));
    console.log("[Backend GPT] 처리할 messages[2].role (파싱 후, map 전):", messages[2]?.role);
    console.log("----------------------------------------------------------");
  }

  // ✅ "GPT" 제안 방식 적용: (messages || []) 및 msg?.role 사용
  const messagesForOpenAI = (messages || []).map((msg, index) => {
    console.log(`[Backend GPT] map 함수 처리 중: messages[${index}] 원본 role: ${msg?.role}`);
    if (msg?.role === 'bot') { // 옵셔널 체이닝 및 null/undefined 방어
      console.log(`[Backend GPT] messages[${index}] role 'bot'을 'assistant'로 변경합니다.`);
      return { ...msg, role: 'assistant' };
    }
    return msg; // 원본 메시지 객체 반환
  }).filter(msg => { // 유효한 메시지 객체인지 확인 후 필터링
    const isValid = msg && typeof msg.role === 'string' && typeof msg.content === 'string';
    if (!isValid) {
      console.warn("[Backend GPT] filter: 유효하지 않은 형식의 메시지 제거됨:", JSON.stringify(msg, null, 2));
    }
    return isValid;
  });

  console.log("==========================================================");
  console.log("[Backend GPT] OpenAI로 전달될 messagesForOpenAI (변환 및 필터링 후) 전체:");
  console.log(JSON.stringify(messagesForOpenAI, null, 2));

  if (messagesForOpenAI.length > 2) {
    console.log("----------------------------------------------------------");
    console.log("[Backend GPT] messagesForOpenAI[2] (변환 및 필터링 후) 상세:", JSON.stringify(messagesForOpenAI[2], null, 2));
    console.log("[Backend GPT] messagesForOpenAI[2].role (변환 및 필터링 후):", messagesForOpenAI[2]?.role); // 이 값이 'assistant'여야 함
    console.log("----------------------------------------------------------");
  }

  const payloadForOpenAI = {
    model: model,
    messages: messagesForOpenAI,
    temperature: temperature
  };

  console.log("[Backend GPT] OpenAI로 전송될 최종 페이로드 전체 (API 호출 직전):");
  console.log(JSON.stringify(payloadForOpenAI, null, 2));
  console.log("==========================================================");


  try {
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payloadForOpenAI)
    });

    const responseBodyText = await openAIAPIResponse.text();

    if (!openAIAPIResponse.ok) {
      console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${responseBodyText}`);
      try {
        const errorJson = JSON.parse(responseBodyText);
        return res.status(openAIAPIResponse.status).json(errorJson);
      } catch (e) {
        return res.status(openAIAPIResponse.status).send(responseBodyText);
      }
    }

    const gptData = JSON.parse(responseBodyText);
    console.log("[Backend GPT] OpenAI API 응답 수신됨. 사용된 모델:", gptData.model);

    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?";
    res.json({ text: aiContent, analysis: {} });

  } catch (err) {
    console.error('[Backend GPT] GPT 호출 중 네트워크 또는 기타 오류:', err);
    res.status(500).json({ error: 'GPT 호출 중 오류 발생', details: err.message });
  }
});

// ... (STT, TTS 엔드포인트 및 서버 리스닝 코드는 이전과 동일하게 유지) ...

// ✅ STT 음성 → 텍스트 (항상 longRunningRecognize 사용)
app.post('/api/stt', async (req, res) => {
  if (!sttClient) {
    console.error("[Backend STT] STT 클라이언트가 초기화되지 않았습니다.");
    return res.status(500).json({ error: 'STT 클라이언트 초기화 실패. 서버 설정을 확인하세요.' });
  }

  const { audioContent, audioDurationSeconds } = req.body;

  if (!audioContent) {
    console.error("[Backend STT] 요청 본문에 audioContent가 없습니다.");
    return res.status(400).json({ error: 'audioContent 누락' });
  }

  console.log(`[Backend STT] /api/stt 요청 수신됨. 오디오 길이(프론트 제공): ${audioDurationSeconds !== undefined ? audioDurationSeconds + '초' : '정보 없음'}.`);

  try {
    const sttRequestConfig = {
      sampleRateHertz: 16000,
      languageCode: 'ko-KR',
      enableAutomaticPunctuation: true,
    };

    const request = {
      audio: {
        content: audioContent
      },
      config: sttRequestConfig,
    };
    console.log("[Backend STT] Google Cloud STT API (longRunningRecognize) 호출 시작. Config:", JSON.stringify(sttRequestConfig, null, 2));

    const [operation] = await sttClient.longRunningRecognize(request);
    console.log("[Backend STT] longRunningRecognize operation 시작됨:", operation.name);

    const [googleSttResponse] = await operation.promise();
    console.log("[Backend STT] longRunningRecognize 작업 완료.");

    const transcription = googleSttResponse.results && googleSttResponse.results.length > 0 && googleSttResponse.results[0].alternatives && googleSttResponse.results[0].alternatives.length > 0
        ? googleSttResponse.results.map(result => result.alternatives[0].transcript).join('\n')
        : "";

    console.log("[Backend STT] 최종 변환된 텍스트:", `"${transcription}"`);
    res.json({ text: transcription });

  } catch (err) {
    console.error('[Backend STT] STT API 호출 실패 또는 처리 중 오류 (longRunningRecognize):', err);
    res.status(500).json({
        error: 'STT API 처리 중 오류 발생',
        details: err.message || '알 수 없는 오류'
    });
  }
});


// ✅ TTS 텍스트 → 음성 (목소리 속도 1.0으로 고정)
app.post('/api/tts', async (req, res) => {
  if (!ttsClient) {
      console.error("[Backend TTS] TTS 클라이언트가 초기화되지 않았습니다.");
      return res.status(500).json({ error: 'TTS 서비스를 사용할 수 없습니다. 서버 설정을 확인하세요.' });
  }
  const { text, voice: voiceId } = req.body;

  if (!text) {
    console.error("[Backend TTS] 요청 본문에 text가 없습니다.");
    return res.status(400).json({ error: 'text 누락' });
  }

  console.log(`[Backend TTS] /api/tts 요청 수신. Text: "${String(text).substring(0,30)}...", Voice ID: ${voiceId}`);

  const speakingRateToUse = 1.0;
  console.log(`[Backend TTS] 적용될 말하기 속도: ${speakingRateToUse} (Voice ID: ${voiceId})`);

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
        speakingRate: speakingRateToUse
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
//예외 핸들러 
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// 서버 리스닝 시작
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
