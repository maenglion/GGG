// ✅ server.js (TTS 속도 1.0으로 변경, STT 관련 주석 추가 등)
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

// --- CORS 설정 (이전과 동일) ---
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

app.use(express.json({ limit: '10mb' }));

let sttClient, ttsClient;
try {
  if (!GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
  }
  const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  sttClient = new SpeechClient({ credentials });
  ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
  console.log("✅ Google Cloud 클라이언트 초기화 완료");
} catch (error) {
  console.error("❌ Google Cloud 클라이언트 초기화 실패:", error);
}

// --- API 엔드포인트 정의 ---

// ✅ GPT 대화 (이전과 동일)
app.post('/api/gpt-chat', async (req, res) => {
  const {
    messages,
    model = 'gpt-4-turbo',
    temperature = 0.7,
    userId,
    userAge,
    userDisease,
    initialUserMessage,
    initialUserEmotions,
    isFirstChatAfterOnboarding
  } = req.body;

  console.log(`[Backend GPT] /api/gpt-chat 요청. UserID: ${userId}, Model: ${model}, Message count: ${messages ? messages.length : 'N/A (첫인사 요청)'}`);

  if (isFirstChatAfterOnboarding) {
    console.log(`[Backend GPT] 첫인사 요청. 감정: ${JSON.stringify(initialUserEmotions)}, 첫마디: ${initialUserMessage}`);
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }

  if (!messages && !isFirstChatAfterOnboarding) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages 누락' });
  }

  if (messages && !Array.isArray(messages)) {
    return res.status(400).json({ error: '유효하지 않은 요청: messages가 배열이 아님' });
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
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: messagesForOpenAI,
        temperature: temperature
      })
    });

    const responseBodyText = await openAIAPIResponse.text();

    if (!openAIAPIResponse.ok) {
      console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${responseBodyText}`);
      return res.status(openAIAPIResponse.status).send(responseBodyText);
    }

    const gptData = JSON.parse(responseBodyText);
    console.log("[Backend GPT] OpenAI API 응답 수신됨.");
    console.log("[Backend GPT] 모델:", gptData.model);

    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?";
    return res.status(200).json({ text: aiContent });

  } catch (err) {
    console.error('[Backend GPT] GPT 호출 중 네트워크 또는 기타 오류:', err);
    return res.status(500).json({
      error: 'GPT 호출 중 오류 발생',
      details: err.message
    });
  }

 });


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
    const openAIAPIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ 
        model: model, 
        messages: messagesForOpenAI, 
        temperature: temperature 
      })
    });
    
    const responseBodyText = await openAIAPIResponse.text();
    if (!openAIAPIResponse.ok) {
        console.error(`[Backend GPT] OpenAI API 오류 (${openAIAPIResponse.status}): ${responseBodyText}`);
        return res.status(openAIAPIResponse.status).send(responseBodyText);
    }
    
    const gptData = JSON.parse(responseBodyText); 
    console.log("[Backend GPT] OpenAI API 응답 수신됨.");
    console.log("[Backend GPT] OpenAI가 응답에 사용한 모델:", gptData.model);
    
    const aiContent = gptData?.choices?.[0]?.message?.content || "미안하지만, 지금은 답변을 드리기 어렵네. 다른 이야기를 해볼까?";
    res.json({ text: aiContent });

  } catch (err) {
    console.error('[Backend GPT] GPT 호출 중 네트워크 또는 기타 오류:', err);
    res.status(500).json({ error: 'GPT 호출 중 오류 발생', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트 (항상 longRunningRecognize 사용)
app.post('/api/stt', async (req, res) => {
  if (!sttClient) {
    console.error("[Backend STT] STT 클라이언트가 초기화되지 않았습니다.");
    return res.status(500).json({ error: 'STT 클라이언트 초기화 실패' });
  }
  
  const { audioContent, audioDurationSeconds } = req.body; 

  if (!audioContent) {
    console.error("[Backend STT] 요청 본문에 audioContent가 없습니다.");
    return res.status(400).json({ error: 'audioContent 누락' });
  }

  console.log(`[Backend STT] /api/stt 요청 수신됨. 오디오 길이(프론트 제공): ${audioDurationSeconds !== undefined ? audioDurationSeconds + '초' : '정보 없음'}. 항상 longRunningRecognize 사용.`);
  console.log("[Backend STT] audioContent 앞 50자:", String(audioContent).substring(0,50) + "...");

  try {
    const sttRequestConfig = {
      encoding: 'WEBM_OPUS', 
      languageCode: 'ko-KR',
      enableAutomaticPunctuation: true,
      // model: 'latest_long', // 매우 긴 오디오(수 분 이상)의 경우, 또는 특정 도메인에 최적화된 모델 사용 고려
                               // Google 문서를 참조하여 사용 가능한 모델 확인 필요
    };
    console.log("[Backend STT] Google Cloud STT API (longRunningRecognize) 호출 시작. Config:", sttRequestConfig);

    const request = {
      audio: { content: audioContent },
      config: sttRequestConfig,
    };

    // 참고: 매우 긴 오디오(예: 1분 이상 연속)는 Base64 인코딩된 content로 직접 보내는 것보다
    // Google Cloud Storage(GCS) URI를 사용하는 것이 Google의 권장 사항이며 더 안정적입니다.
    // 현재 코드는 content를 직접 보내므로, 여전히 특정 길이 제한에 도달할 수 있습니다.
    const [operation] = await sttClient.longRunningRecognize(request);
    console.log("[Backend STT] longRunningRecognize operation 시작됨:", operation.name);

    const [googleSttResponse] = await operation.promise(); 
    console.log("[Backend STT] longRunningRecognize 작업 완료. 실제 응답 전체:", JSON.stringify(googleSttResponse, null, 2));
    
    const transcription = googleSttResponse.results && googleSttResponse.results.length > 0 && googleSttResponse.results[0].alternatives && googleSttResponse.results[0].alternatives.length > 0
        ? googleSttResponse.results.map(result => result.alternatives[0].transcript).join('\n')
        : ""; 

    console.log("[Backend STT] 최종 변환된 텍스트:", `"${transcription}"`);
    res.json({ text: transcription });

  } catch (err) {
    console.error('[Backend STT] STT API 호출 실패 또는 처리 중 오류 (longRunningRecognize):', err);
    // 클라이언트에 오류 원인 전달 (Google API 오류 메시지 포함 가능)
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

  // ★★★ 말하기 속도를 1.0으로 고정 ★★★
  const speakingRateToUse = 1.0; 
  console.log(`[Backend TTS] 적용될 말하기 속도: ${speakingRateToUse} (Voice ID: ${voiceId})`);

  try {
    const ttsRequest = {
      input: { text: text },
      voice: {
        languageCode: 'ko-KR',
        ...(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR')) && { name: voiceId },
        ...(!(voiceId && typeof voiceId === 'string' && voiceId.startsWith('ko-KR')) && { ssmlGender: 'FEMALE' }) // 기본값 여성
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: speakingRateToUse // 고정된 속도 사용
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
