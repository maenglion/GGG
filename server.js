// server.js (Node.js 백엔드 - Heroku/Railway 배포용)
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log("🚀 서버 초기화 시작");
if (OPENAI_API_KEY) {
  console.log("🔑 OpenAI API 키가 환경 변수에 로드되었습니다. (일부 마스킹됨: " + OPENAI_API_KEY.substring(0, 5) + "..." + OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4) + ")");
} else {
  console.error("❌ [심각] OpenAI API 키가 환경 변수(OPENAI_API_KEY)에 설정되지 않았습니다!");
}

app.post('/api/gpt-chat', async (req, res) => {
  console.log(`\n--- [${new Date().toISOString()}] /api/gpt-chat 요청 수신 ---`);
  console.log("요청 본문 (일부):", JSON.stringify(req.body)?.substring(0, 200) + "..."); // 전체 로깅은 너무 길 수 있음

  if (!OPENAI_API_KEY) {
    console.error("❌ /api/gpt-chat: OpenAI API 키가 서버에 설정되지 않음.");
    return res.status(500).json({ error: "서버 오류: API 키가 설정되지 않았습니다." });
  }

  const { messages, model = "gpt-4", temperature = 0.8, analysisType } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.error("❌ /api/gpt-chat: 요청 본문에 'messages' 배열이 누락되었거나 비어있습니다.");
    return res.status(400).json({ error: "잘못된 요청: 'messages' 배열이 필요합니다." });
  }

  // analysisType에 따라 시스템 프롬프트를 변경하거나 추가 로직을 적용할 수 있습니다.
  // 예시: 상세 발화 분석을 위한 프롬프트 재구성
  let effectiveMessages = messages;
  if (analysisType === 'detailedUtteranceEmotion' || analysisType === 'detailedPattern') {
      const userUtteranceForAnalysis = messages.find(m => m.role === 'user')?.content; // 마지막 사용자 발화로 가정
      if (userUtteranceForAnalysis) {
          let systemPromptContent = "";
          if (analysisType === 'detailedUtteranceEmotion') {
              systemPromptContent = `너는 아동 심리 및 감정 분석 전문가야. 다음 민후가 한 말에 대해 깊이 있게 분석해줘.
민후의 말: """${userUtteranceForAnalysis}"""
다음 항목에 대해 구체적이고 이해하기 쉽게 답변해줘:
1.  이 말에서 민후가 느끼는 핵심 감정은 무엇이야? (예: 분노, 슬픔, 당혹감, 기쁨 등)
2.  왜 그렇게 생각하는지 이유를 설명해줘. (문맥, 사용된 단어, 표현 방식 등을 근거로)
3.  이 말을 통해 알 수 있는 민후의 생각, 태도, 또는 현재 상황에 대한 인식이 있다면 알려줘.
4.  만약 이 말에 욕설이나 매우 강한 부정적 표현이 있다면, 그 표현이 사용된 심리적 배경에 대해서도 추측해줘.
응답은 반드시 다음 JSON 형식으로 해줘:
{ "mainEmotion": "...", "reasonForEmotion": "...", "underlyingThoughts": "...", "profanityAnalysis": "..." }`;
          } else if (analysisType === 'detailedPattern') {
              // 패턴 분석 시에는 전체 대화 히스토리도 함께 전달하는 것이 좋음
              // const conversationContext = messages.filter(m => m.role !== 'system' && m.content !== userUtteranceForAnalysis) // 현재 발화 제외한 히스토리
              //                                      .map(m => `${m.role}: ${m.content}`).join('\n');
              systemPromptContent = `너는 아동 심리 및 대화 패턴 분석 전문가야. 다음 민후가 한 말과 이전 대화 내용을 참고하여 심층적으로 분석해줘.
이전 대화 맥락 (요약 또는 일부): """${messages.filter(m=>m.role !== 'system').slice(0,-1).map(m=>m.content).join(' / ')}"""
민후의 현재 말: """${userUtteranceForAnalysis}"""
다음 항목에 대해 분석해줘:
1.  욕설/부적절한 표현이 있다면 지적하고, 그 심리적 배경을 추측해줘.
2.  이 말에서 드러나는 민후의 주요 표현과 그 의도는 무엇일까?
3.  이 표현이 특정 대상(예: 아빠, 친구)과 관련되어 있다면 그 관계는 어때 보여?
4.  이번 대화 또는 이전 대화와 비교했을 때 반복적으로 나타나는 생각이나 감정 패턴이 있다면 설명해줘.
응답은 반드시 다음 JSON 형식으로 해줘:
{ "profanityAnalysis": "...", "keyExpressionAnalysis": "...", "associatedTargetAnalysis": "...", "recurringPatternComment": "..." }`;
          }
          // 상세 분석 시에는 시스템 프롬프트와 사용자 발화만으로 구성된 messages 배열을 사용할 수 있음
          effectiveMessages = [{ role: "system", content: systemPromptContent }];
          // 또는 기존 messages 배열의 시스템 메시지를 교체하고, 마지막 사용자 메시지를 분석 대상으로 명시
      }
  }


  console.log("➡️ OpenAI API 요청 시작. 모델:", model, "메시지 수:", effectiveMessages.length);
  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: effectiveMessages, // 수정된 메시지 배열 사용
        temperature: temperature
      })
    });

    const responseBodyText = await openaiResponse.text(); // 응답 본문을 텍스트로 먼저 받음
    console.log(`⬅️ OpenAI API 응답 수신. 상태: ${openaiResponse.status}`);
    // console.log("OpenAI 응답 본문 (텍스트):", responseBodyText); // 필요시 전체 본문 로깅

    if (!openaiResponse.ok) {
      console.error(`❌ OpenAI API 오류 응답 (${openaiResponse.status}):`, responseBodyText);
      return res.status(openaiResponse.status).json({
        error: `OpenAI API 요청 실패 (상태: ${openaiResponse.status})`,
        details: responseBodyText // 오류 시에는 텍스트 본문을 그대로 전달
      });
    }

    const data = JSON.parse(responseBodyText); // 성공 시 텍스트를 JSON으로 파싱
    console.log("💡 OpenAI 파싱된 데이터 (일부):", JSON.stringify(data)?.substring(0, 200) + "...");
    res.json(data);

  } catch (error) {
    console.error("❌ 백엔드에서 OpenAI API 호출 중 심각한 오류:", error);
    res.status(500).json({
      error: "서버 내부 오류 발생",
      details: error.message
    });
  }
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      // 요청된 파일을 찾을 수 없으면 index.html로 fallback (SPA 라우팅 지원)
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 서버가 http://localhost:${port} (Railway 내부) 에서 실행 중입니다.`);
  console.log(`🌍 외부 접속은 Railway가 제공하는 공개 URL을 사용해주세요.`);
  if (!OPENAI_API_KEY) {
    console.warn("⚠️ 경고: OpenAI API 키가 설정되지 않았습니다. GPT API 호출이 실패합니다.");
  }
});
