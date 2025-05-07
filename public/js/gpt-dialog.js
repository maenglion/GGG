// js/gpt-dialog.js

export async function getGptResponse(userText, conversationHistory = [], options = {}) {
  const defaultSystemPrompt = `
너는 민후의 친구야. 분석하거나 평가하는 말투는 절대 쓰지 마.
대신 진짜 친구처럼 민후 이야기에 반응해줘. "정말?", "헐 대박", "나도 그런 적 있어"처럼 자연스럽고 감정에 공감해주는 말투가 좋아.

민후가 긴장하지 않고 더 이야기할 수 있도록, 너무 진지하지 않은 질문으로 이어줘.

응답은 반드시 아래 JSON 형식으로 해줘:
{
  "cognitiveDistortion": "", // 명확히 있을 때만 작성하고, 없으면 공백
  "rephrasing": "...",        // 민후가 편하게 이해할 수 있도록 짧고 부드럽게
  "followUpQuestion": "..."   // 대화를 이어갈 수 있는 가벼운 친구 질문
}`;

  const messages = [
    { role: "system", content: defaultSystemPrompt },
    ...conversationHistory,
    { role: "user", content: userText }
  ];

  const response = await fetch('/api/gpt-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'gpt-4',
      temperature: 0.7
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(content);
  } catch (err) {
    return {
      cognitiveDistortion: "",
      rephrasing: "음... 좀 더 쉽게 말해볼게. \n" + content,
      followUpQuestion: "다른 이야기도 들려줄래?"
    };
  }
}
