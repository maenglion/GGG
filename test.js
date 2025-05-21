// test.js 상단
// package.json의 "type": "module" 이 필요함
import fetch from 'node-fetch'

(async () => {
  const response = await fetch('https://ggg-production.up.railway.app/api/gpt-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '서버 응답 테스트입니다.' }],
      model: 'gpt-4-turbo',
      temperature: 0.65,
      userId: 'anonymous',
      userAge: '10',
      userDisease: 'ASD',
      initialUserMessage: '서버 응답 테스트입니다.',
      initialUserEmotions: [],
      isFirstChatAfterOnboarding: false
    })
  });

  const result = await response.text();
  console.log("✅ 서버 응답:", result);
})();
