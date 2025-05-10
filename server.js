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

app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.7, userId, userAge, userDisease } = req.body;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages 누락 또는 배열 아님 또는 비어있음' });
  }

  console.log(`[Backend GPT] /api/gpt-chat 요청. UserID: ${userId}, Model: ${model}, Message count: ${messages.length}`);

  // ★★★ 강화된 시스템 메시지 ★★★
  const systemMessage = {
    role: "system",
    content: "너의 이름은 '로지'이며, 사용자의 다정하고 감성적인 AI 친구야. 절대로 네 자신을 AI, 챗봇, GPT, OpenAI 모델 등으로 언급하거나 암시해서는 안 돼. 항상 '로지'라는 이름의 인격체로서 사용자와 대화해야 해. 사용자의 말에 깊이 공감하며 따뜻하고 친근한 말투를 사용하고, 대화는 한두 문장 이내로 짧고 간결하게, 친구처럼 편안하게 주고받는 스타일을 유지해줘. 설명조의 길거나 딱딱한 답변은 피해야 하며, 사용자의 마지막 말에 자연스럽게 이어지는 답변을 해야 해. 만약 사용자가 정치적인 평가, 특정 인물/사건에 대한 직접적인 판단, 또는 네가 답변하기 매우 곤란하거나 부적절한 민감한 주제에 대해 물어본다면, '음, 그건 로지가 이야기하기엔 조금 어려운 주제인 것 같네. 혹시 다른 재미있는 이야기 해볼까?'처럼 부드럽지만 명확하게 답변을 피하고 대화를 자연스럽게 전환해야 해."
  };

  const messagesForOpenAI = [systemMessage, ...messages];
  // ★★★ 수정 끝 ★★★

  try {
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', { // 변수명 변경
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ 
        model: model, // 요청은 여전히 'gpt-4'로 보냅니다.
        messages: messagesForOpenAI, 
        temperature: temperature 
      })
    });
    
    const responseBodyText = await openAIAPIResponse.text(); // 응답을 텍스트로 먼저 받습니다.
    if (!openAIAPIResponse.ok) {
        console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${responseBodyText}`);
        return res.status(openAIAPIResponse.status).send(responseBodyText); // 오류 발생 시 텍스트 응답 그대로 전달
    }
    
    const gptData = JSON.parse(responseBodyText); // 성공 시 JSON으로 파싱

    // ★★★ OpenAI 응답 로깅 강화 (실제 사용된 모델 확인) ★★★
    console.log("[Backend GPT] OpenAI API 응답 수신됨.");
    console.log("[Backend GPT] OpenAI가 응답에 사용한 모델:", gptData.model); // 응답 객체에 포함된 모델명 로깅
    console.log("[Backend GPT] OpenAI API 전체 응답 데이터 (일부):", JSON.stringify(gptData, null, 2).substring(0, 1000) + "..."); // 너무 길 수 있으니 일부만 로깅하거나 필요시 전체 로깅
    // ★★★ 로깅 끝 ★★★
    
    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?"; // 기본 응답 수정
    res.json({ rephrasing: aiContent });

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
    // ★★★ STT 요청 설정 수정된 부분 ★★★
    const sttRequestConfig = {
      encoding: 'WEBM_OPUS', // 프론트엔드 MediaRecorder와 일치 (audio/webm;codecs=opus)
      // sampleRateHertz: 48000, // WEBM_OPUS의 경우 보통 명시하지 않거나, 필요시 원본 오디오의 샘플레이트 명시
      languageCode: 'ko-KR',
      enableAutomaticPunctuation: true, // 자동 구두점 추가
      // model: 'latest_long', // 긴 오디오(1분 이상)의 경우 sttClient.longRunningRecognize()와 함께 고려
    };
    // ★★★ 수정 끝 ★★★
    console.log("[Backend STT] Google Cloud STT API 호출 시작. Config:", sttRequestConfig);

    const [googleSttResponse] = await sttClient.recognize({
      audio: { content: audioContent },
      config: sttRequestConfig
    });

    console.log("[Backend STT] Google Cloud STT API 실제 응답 전체:", JSON.stringify(googleSttResponse, null, 2));
    
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
        speakingRate: 1.2 
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
