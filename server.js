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
  // GOOGLE_APPLICATION_CREDENTIALS가 파일 경로일 경우와 JSON 문자열일 경우 모두 처리
  let credentials;
  if (GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{')) {
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  } else {
    // 파일 경로인 경우, 해당 경로를 직접 사용하거나,
    // new SpeechClient() 등에 직접 경로를 전달할 수 있는지 확인 필요.
    // 여기서는 JSON 문자열로 가정하고 진행. 실제 환경에 맞게 조정 필요.
    // 만약 파일 경로라면, 해당 파일을 읽어서 JSON으로 파싱하는 로직이 필요할 수 있습니다.
    // 혹은 SpeechClient, TextToSpeechClient가 keyFilename 옵션을 지원하는지 확인.
    // 지금은 단순화를 위해 JSON 문자열이라고 가정합니다.
    // credentials = { keyFilename: GOOGLE_APPLICATION_CREDENTIALS }; // 만약 파일 경로라면 이런 형태
    console.warn("GOOGLE_APPLICATION_CREDENTIALS가 파일 경로일 수 있습니다. 현재는 JSON 문자열로 간주합니다.");
    // 이 부분은 실제 환경에 따라 수정이 필요할 수 있습니다.
    // 가장 확실한 방법은 환경 변수에 JSON 내용을 직접 넣는 것입니다.
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS); // 일단 JSON 파싱 시도
  }

  sttClient = new SpeechClient({ credentials });
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
  console.log("✅ Google Cloud 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
  // 클라이언트 초기화 실패 시 관련 API 엔드포인트에서 오류를 반환하도록 처리 필요
}

// --- API 엔드포인트 정의 ---

// ✅ GPT 대화 (OpenAI API role 값 수정)
app.post('/api/gpt-chat', async (req, res) => {
  const {
    messages, // 클라이언트에서 {role: 'user', content: '...'} 또는 {role: 'bot', content: '...'} 형태로 올 수 있음
    model = 'gpt-4-turbo',
    temperature = 0.7,
    userId,
    // isFirstChatAfterOnboarding 등 다른 파라미터는 현재 gpt-dialog.js에서 명시적으로 보내지 않으므로,
    // 백엔드에서 해당 로직을 사용한다면 클라이언트에서도 보내주거나, 백엔드에서 다른 방식으로 처리해야 합니다.
  } = req.body;

  console.log(`[Backend GPT] /api/gpt-chat 요청 수신. UserID: ${userId}, Model: ${model}, Temperature: ${temperature}, Message count: ${messages ? messages.length : 'N/A'}`);

  if (!OPENAI_API_KEY) {
    console.error("[Backend GPT] OpenAI API 키가 설정되지 않았습니다.");
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.error("[Backend GPT] 유효하지 않은 요청: messages가 비어있거나 배열이 아님.");
    return res.status(400).json({ error: '유효하지 않은 요청: messages가 비어있거나 배열이 아닙니다.' });
  }

  // OpenAI API로 보내기 전에 messages 배열의 role 값을 변환
  // 클라이언트에서 'bot'으로 보낸 role을 'assistant'로 변경
  const messagesForOpenAI = messages.map(message => {
    if (message.role === 'bot') {
      return { ...message, role: 'assistant' };
    }
    return message;
  });

  // 시스템 프롬프트가 messagesForOpenAI 배열의 첫 번째 요소로 이미 포함되어 있다고 가정합니다.
  // (gpt-dialog.js에서 그렇게 구성하고 있습니다)
  // 만약 시스템 프롬프트를 별도로 관리한다면 여기서 추가해야 합니다.

  console.log("[Backend GPT] OpenAI API로 전달될 최종 messages:", JSON.stringify(messagesForOpenAI, null, 2));


  try {
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: messagesForOpenAI, // 변환된 messages 배열 사용
        temperature: temperature
      })
    });

    const responseBodyText = await openAIAPIResponse.text(); // 응답을 먼저 텍스트로 받음

    if (!openAIAPIResponse.ok) {
      console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${responseBodyText}`);
      // 클라이언트에는 JSON 형태로 오류 메시지 전달 시도
      try {
        const errorJson = JSON.parse(responseBodyText);
        return res.status(openAIAPIResponse.status).json(errorJson);
      } catch (e) {
        return res.status(openAIAPIResponse.status).send(responseBodyText); // JSON 파싱 실패 시 텍스트 그대로 전달
      }
    }

    const gptData = JSON.parse(responseBodyText);
    console.log("[Backend GPT] OpenAI API 응답 수신됨. 사용된 모델:", gptData.model);

    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?";

    // 현재는 분석(analysis) 객체를 생성하는 로직이 없으므로,
    // 클라이언트의 기대에 맞추려면 빈 analysis 객체라도 추가하거나,
    // 클라이언트에서 analysis 객체가 없을 경우를 대비해야 합니다.
    // MVP에서는 일단 텍스트 응답만 정확히 전달하는 것에 집중합니다.
    res.json({ text: aiContent, analysis: {} }); // 임시로 빈 analysis 객체 추가

  } catch (err) {
    console.error('[Backend GPT] GPT 호출 중 네트워크 또는 기타 오류:', err);
    res.status(500).json({ error: 'GPT 호출 중 오류 발생', details: err.message });
  }
});


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
  console.log("[Backend STT] audioContent 앞 50자:", String(audioContent).substring(0,50) + "...");

  try {
    const sttRequestConfig = {
      // encoding: 'WEBM_OPUS', // 클라이언트에서 보내는 오디오 형식에 맞춰야 함.
                                // talk.html의 SpeechRecognition API는 브라우저 기본 형식을 사용하므로,
                                // 서버에서 해당 형식을 지원하거나, 클라이언트에서 인코딩 필요.
                                // 일반적으로 WEBM_OPUS 또는 LINEAR16 등이 사용됨.
                                // Base64 디코딩 후 실제 오디오 형식 확인 필요.
      sampleRateHertz: 16000, // 일반적인 음성 인식 샘플링 레이트, 실제 오디오와 맞춰야 함
      languageCode: 'ko-KR',
      enableAutomaticPunctuation: true,
      // model: 'latest_long', // 필요시 모델 지정
    };

    // Base64 인코딩된 오디오 데이터 디코딩
    // 클라이언트에서 Base64 문자열로 보낸다고 가정.
    // const audioBytes = Buffer.from(audioContent, 'base64');

    const request = {
      audio: {
        content: audioContent // 클라이언트에서 이미 Base64 문자열로 보낸다면, SpeechClient가 이를 처리할 수 있음.
                               // 만약 순수 바이너리라면 Buffer.from(audioContent, 'base64') 등이 필요.
                               // gpt-dialog.js 또는 talk.html에서 STT 요청 시 오디오 포맷 확인 필요.
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
