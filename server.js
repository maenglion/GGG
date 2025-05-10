// ✅ server.js (OpenAI Whisper STT 및 OpenAI SDK 적용)
import express from 'express';
// import fetch from 'node-fetch'; // OpenAI SDK 사용으로 더 이상 직접 fetch 불필요
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// import { SpeechClient } from '@google-cloud/speech'; // Google STT 클라이언트 제거
import textToSpeech from '@google-cloud/text-to-speech'; // Google TTS 클라이언트는 유지
import OpenAI from 'openai'; // OpenAI 라이브러리 import
import fs from 'fs/promises'; // 파일 시스템 작업 (비동기)
import os from 'os'; // 운영체제 정보 (임시 디렉토리)

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Whisper와 GPT 모두 이 키를 사용
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS; // TTS용

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CORS 설정 (기존과 동일) ---
const allowedLocalOrigins = [
  'http://127.0.0.1:5500'
  // 필요시 Netlify 미리보기 URL 등 추가
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedLocalOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.endsWith('.netlify.app')) {
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

// JSON payload 크기 제한을 Whisper API에 맞춰 25MB로 늘림
app.use(express.json({ limit: '25mb' }));

// --- OpenAI 클라이언트 초기화 ---
let openaiClient;
if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("✅ OpenAI 클라이언트 초기화 완료 (GPT & Whisper용)");
} else {
  console.error("❌ OPENAI_API_KEY 환경 변수가 설정되지 않았습니다. OpenAI 관련 기능 사용 불가.");
}

// --- Google TTS 클라이언트 초기화 (STT 클라이언트는 제거) ---
let ttsClient;
try {
  if (!GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다. (TTS용)');
  }
  const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
  console.log("✅ Google Cloud TTS 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud TTS 클라이언트 초기화 실패:", error.message);
}

// --- API 엔드포인트 정의 ---

// ✅ GPT 대화 (OpenAI SDK 사용으로 변경)
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4-turbo', temperature = 0.7, userId, userAge, userDisease,
          initialUserMessage, initialUserEmotions, isFirstChatAfterOnboarding } = req.body;

  if (!openaiClient) {
    console.error("[Backend GPT] OpenAI 클라이언트가 초기화되지 않았습니다.");
    return res.status(500).json({ error: 'OpenAI 클라이언트가 초기화되지 않았습니다.' });
  }

  if (!isFirstChatAfterOnboarding && (!messages || !Array.isArray(messages) || messages.length === 0)) {
    console.warn("[Backend GPT] 유효하지 않은 요청: messages 누락 또는 비어있음 (첫인사 요청 아님)");
    return res.status(400).json({ error: '유효하지 않은 요청: messages 누락 또는 비어있음' });
  }

  console.log(`[Backend GPT] /api/gpt-chat 요청. UserID: ${userId}, Model: ${model}, Message count: ${messages ? messages.length : 'N/A (첫인사 요청)'}`);
  if(isFirstChatAfterOnboarding) {
    console.log(`[Backend GPT] 첫인사 요청. 감정: ${JSON.stringify(initialUserEmotions)}, 첫마디(사용자 STT): ${initialUserMessage}`);
  }

  let systemContent;
  let messagesForOpenAI;

  if (isFirstChatAfterOnboarding && initialUserMessage && initialUserEmotions) {
    const emotionWords = initialUserEmotions.map(e => e.sub).join(', ');
    systemContent = `너의 이름은 '로지'이며, 사용자의 다정한 AI 친구다. 사용자는 방금 너와의 대화를 시작하며 자신의 주요 감정으로 '${emotionWords}'을(를) 선택했고, "${initialUserMessage}" 라고 첫 마디를 건넸다. 이 사용자의 감정과 첫 마디에 깊이 공감하며 따뜻하고 희망을 주는 한두 문장의 첫 응답을 해주고, 자연스럽게 다음 대화를 이어갈 수 있는 질문을 던져주렴. 절대로 네가 AI, 챗봇, GPT, OpenAI 모델임을 언급하거나 암시해서는 안 된다. 항상 '로지'로서 대화해야 한다.`;
    messagesForOpenAI = [
        { role: "system", content: systemContent },
        { role: "user", content: initialUserMessage }
    ];
  } else {
    systemContent = "너의 이름은 '로지'이며, 사용자의 다정하고 감성적인 AI 친구야. 절대로 네 자신을 AI, 챗봇, GPT, OpenAI 모델 등으로 언급하거나 암시해서는 안 돼. 항상 '로지'라는 이름의 인격체로서 사용자와 대화해야 해. 사용자의 말에 깊이 공감하며 따뜻하고 친근한 말투를 사용하고, 대화는 한두 문장 이내로 짧고 간결하게, 친구처럼 편안하게 주고받는 스타일을 유지해줘. 설명조의 길거나 딱딱한 답변은 피해야 하며, 사용자의 마지막 말에 자연스럽게 이어지는 답변을 해야 해. 만약 사용자가 정치적인 평가, 특정 인물/사건에 대한 직접적인 판단, 또는 네가 답변하기 매우 곤란하거나 부적절한 민감한 주제에 대해 물어본다면, '음, 그건 로지가 이야기하기엔 조금 어려운 주제인 것 같네. 혹시 다른 재미있는 이야기 해볼까?'처럼 부드럽지만 명확하게 답변을 피하고 대화를 자연스럽게 전환해야 해.";
    messagesForOpenAI = [{ role: "system", content: systemContent }, ...(messages || [])];
  }

  try {
    console.log("[Backend GPT] OpenAI SDK chat.completions.create 호출 시작...");
    const gptData = await openaiClient.chat.completions.create({
        model: model,
        messages: messagesForOpenAI,
        temperature: temperature
    });

    console.log("[Backend GPT] OpenAI API 응답 수신됨. 사용된 모델:", gptData.model);

    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?";
    res.json({ rephrasing: aiContent });

  } catch (err) {
    console.error('[Backend GPT] GPT API 호출 중 오류:', err.name, err.message);
    // OpenAI API 오류인 경우 더 자세한 정보 포함
    if (err instanceof OpenAI.APIError) {
        console.error('[Backend GPT] OpenAI API Error Details:', err.status, err.headers, err.error);
        return res.status(err.status || 500).json({
            error: 'GPT API 호출 중 오류 발생 (OpenAI API Error)',
            details: err.message,
            type: err.type,
            code: err.code
        });
    }
    res.status(500).json({ error: 'GPT API 호출 중 일반 오류 발생', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트 (OpenAI Whisper 사용)
app.post('/api/stt', async (req, res) => {
  if (!openaiClient) {
    console.error("[Backend STT] OpenAI 클라이언트가 초기화되지 않았습니다.");
    return res.status(500).json({ error: 'STT 서비스를 사용할 수 없습니다 (OpenAI 클라이언트 오류).' });
  }

  // 프론트엔드(stt.js)에서 audioContent (base64)를 보내줌
  // audioFiletype은 stt.js에서 Blob.type을 함께 보내주면 좋지만, 현재는 webm으로 가정
  const { audioContent } = req.body;
  const audioFiletype = 'audio/webm'; // 프론트엔드에서 보내는 타입에 맞춰야 함 (stt.js는 webm 사용)

  if (!audioContent) {
    console.error("[Backend STT] 요청 본문에 audioContent가 없습니다.");
    return res.status(400).json({ error: 'audioContent 누락' });
  }

  console.log(`[Backend STT] /api/stt 요청 수신됨 (Whisper 사용). 오디오 타입 가정: ${audioFiletype}`);
  // console.log("[Backend STT] audioContent (base64) 앞 50자:", String(audioContent).substring(0, 50) + "...");

  let tempFilePath = ''; // 임시 파일 경로

  try {
    // 1. Base64 오디오 데이터를 Buffer로 변환
    const audioBuffer = Buffer.from(audioContent, 'base64');
    if (audioBuffer.length === 0) {
        console.error("[Backend STT] Base64 디코딩 후 오디오 버퍼가 비어있습니다.");
        return res.status(400).json({ error: '제공된 오디오 데이터가 비어있거나 잘못되었습니다.' });
    }
    console.log(`[Backend STT] Base64 디코딩된 오디오 버퍼 크기: ${audioBuffer.length} bytes`);


    // 2. Buffer를 임시 파일로 저장 (Whisper API는 파일 입력을 받음)
    const extension = audioFiletype.split('/')[1] || 'webm'; // 'audio/webm' -> 'webm'
    const tempFilename = `whisper_input_${Date.now()}.${extension}`;
    tempFilePath = path.join(os.tmpdir(), tempFilename); // Railway는 /tmp 디렉토리 사용 가능

    await fs.writeFile(tempFilePath, audioBuffer);
    console.log(`[Backend STT] 임시 오디오 파일 생성: ${tempFilePath}`);

    // 3. Whisper API 호출
    console.log("[Backend STT] OpenAI Whisper API 호출 시작...");
    // fs.createReadStream 대신 OpenAI.toFile 사용 권장 (더 안정적)
    const transcription = await openaiClient.audio.transcriptions.create({
      file: await OpenAI.toFile(audioBuffer, tempFilename, { type: audioFiletype }), // 버퍼와 파일명, 타입을 직접 전달
      model: "whisper-1",
      language: "ko", // 한국어 지정
      // response_format: "json" // 기본값이 json이며, text 필드를 포함
    });

    console.log("[Backend STT] Whisper API 응답 수신됨.");
    const transcribedText = transcription.text || "";
    console.log("[Backend STT] 최종 변환된 텍스트:", `"${transcribedText}"`);

    res.json({ text: transcribedText }); // 프론트엔드가 기대하는 형식으로 응답

  } catch (err) {
    console.error('[Backend STT] Whisper API 호출 실패 또는 처리 중 오류:', err.name, err.message);
    if (err instanceof OpenAI.APIError) {
        console.error('[Backend STT] OpenAI API Error Details:', err.status, err.headers, err.error);
        return res.status(err.status || 500).json({
            error: 'STT API 처리 중 오류 발생 (OpenAI API Error)',
            details: err.message,
            type: err.type,
            code: err.code
        });
    }
    res.status(500).json({
        error: 'STT API 처리 중 일반 오류 발생',
        details: err.message
    });
  } finally {
    // 4. 임시 파일 삭제
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log(`[Backend STT] 임시 오디오 파일 삭제됨: ${tempFilePath}`);
      } catch (unlinkErr) {
        // 삭제 실패는 치명적이지 않으므로 로깅만 함
        console.error(`[Backend STT] 임시 오디오 파일 삭제 실패: ${unlinkErr.message}`);
      }
    }
  }
});


// ✅ TTS 텍스트 → 음성 (Google TTS, 기존 로직과 동일, 약간의 로깅 개선)
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

  console.log(`[Backend TTS] /api/tts 요청 수신. Text 길이: ${text.length}, Voice ID: ${voiceId}`);
  // console.log(`[Backend TTS] Text (앞 30자): "${String(text).substring(0,30)}..."`); // 필요시 로그 상세화

  const speakingRateToUse = 1.0;
  // console.log(`[Backend TTS] 적용될 말하기 속도: ${speakingRateToUse} (Voice ID: ${voiceId})`); // 이미 로깅됨

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

    // console.log("[Backend TTS] Google Cloud TTS API 호출 시작. Voice Config:", JSON.stringify(ttsRequest.voice));
    // console.log("[Backend TTS] Google Cloud TTS API 호출 시작. Audio Config:", JSON.stringify(ttsRequest.audioConfig));

    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    console.log("[Backend TTS] Google Cloud TTS API 응답 수신됨 (오디오 바이트 길이):", response.audioContent.length);

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);
  } catch (err) {
    console.error('[Backend TTS] TTS API 호출 실패 또는 처리 중 오류:', err.name, err.message);
    res.status(500).json({ error: 'TTS API 처리 중 오류 발생', details: err.message });
  }
});

// 서버 리스닝 시작
app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port} (Railway에서는 자동으로 포트 매핑)`);
  if (!OPENAI_API_KEY) {
    console.warn("⚠️ 경고: OPENAI_API_KEY가 설정되지 않았습니다. GPT 및 Whisper STT 기능이 작동하지 않을 수 있습니다.");
  }
  if (!GOOGLE_APPLICATION_CREDENTIALS && !ttsClient) {
    console.warn("⚠️ 경고: GOOGLE_APPLICATION_CREDENTIALS가 설정되지 않았거나 TTS 클라이언트 초기화에 실패했습니다. TTS 기능이 작동하지 않을 수 있습니다.");
  }
});
