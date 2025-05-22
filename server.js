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
  // 필요시 다른 로컬 개발 환경 origin 추가
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedLocalOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.endsWith('.netlify.app') || originUrl.hostname.endsWith('.scf.usercontent.goog')) { // Canvas 환경 추가
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
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS); // 일단 JSON 파싱 시도
  }

  sttClient = new SpeechClient({ credentials });
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
  console.log("✅ Google Cloud 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
}

// --- API 엔드포인트 정의 ---

app.post('/api/gpt-chat', async (req, res) => {
  const {
    messages, // 클라이언트에서 {role: 'user', content: '...'} 또는 {role: 'bot', content: '...'} 형태로 올 수 있음
    model = 'gpt-4-turbo',
    temperature = 0.7,
    userId,
  } = req.body;

  // ★★★ 클라이언트로부터 받은 원본 messages 배열 로깅 ★★★
  console.log("[Backend GPT] 클라이언트로부터 받은 원본 messages 배열:", JSON.stringify(messages, null, 2));

  if (!OPENAI_API_KEY) {
    console.error("[Backend GPT] OpenAI API 키가 설정되지 않았습니다.");
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.error("[Backend GPT] 유효하지 않은 요청: messages가 비어있거나 배열이 아님.");
    return res.status(400).json({ error: '유효하지 않은 요청: messages가 비어있거나 배열이 아닙니다.' });
  }

  // OpenAI API로 보내기 전에 messages 배열의 role 값을 변환
  const messagesForOpenAI = messages.map(message => {
    if (message && message.role === 'bot') { // message 객체 존재 여부 확인 추가
      return { ...message, role: 'assistant' };
    }
    return message;
  }).filter(message => message && typeof message.role === 'string' && typeof message.content === 'string'); // 유효한 메시지만 필터링

  // ★★★ 변환 후 messagesForOpenAI 배열과 문제가 되는 messagesForOpenAI[2] 로깅 ★★★
  console.log("[Backend GPT] OpenAI로 전달될 messagesForOpenAI (변환 후):", JSON.stringify(messagesForOpenAI, null, 2));
  if (messagesForOpenAI.length > 2) {
    console.log("[Backend GPT] messagesForOpenAI[2] (변환 후) 상세:", JSON.stringify(messagesForOpenAI[2], null, 2));
    console.log("[Backend GPT] messagesForOpenAI[2].role (변환 후):", messagesForOpenAI[2].role);
  }


  const payloadForOpenAI = { // OpenAI로 보낼 최종 페이로드 객체 생성
    model: model,
    messages: messagesForOpenAI, // ★★★ 변환된 messagesForOpenAI 사용 확인 ★★★
    temperature: temperature
  };

  // ★★★ OpenAI로 전송될 최종 페이로드 전체 로깅 ★★★
  console.log("[Backend GPT] OpenAI로 전송될 최종 페이로드 전체:", JSON.stringify(payloadForOpenAI, null, 2));


  try {
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payloadForOpenAI) // 최종 페이로드 객체 사용
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
  // console.log("[Backend STT] audioContent 앞 50자:", String(audioContent).substring(0,50) + "..."); // 너무 길면 로그가 지저분해질 수 있음

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

// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port} (Railway에서는 자동으로 포트 매핑)`);
});
