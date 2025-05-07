<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>민후와 대화하기</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background-color: #f4f4f4;
      margin: 0;
    }
    .chat-box {
      width: 90%;
      max-width: 500px;
      height: 400px;
      overflow-y: auto;
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .message {
      margin: 8px 0;
    }
    .message.user {
      text-align: right;
      color: #2b7;
    }
    .message.bot {
      text-align: left;
      color: #333;
    }
    .mic-button {
      background-color: #3b82f6;
      color: white;
      border: none;
      border-radius: 50%;
      width: 70px;
      height: 70px;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div class="chat-box" id="chat"></div>
  <button class="mic-button" id="record">🎤</button>
  <script>
    const recordBtn = document.getElementById('record');
    const chatBox = document.getElementById('chat');

    async function recordAndTalk() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      let audioChunks = [];

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Audio = reader.result.split(',')[1];
          const sttRes = await fetch('/api/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioContent: base64Audio })
          });
          const { text } = await sttRes.json();
          addMessage(text, 'user');

          const gptRes = await fetch('/api/gpt-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
          });
          const gptData = await gptRes.json();
          const reply = gptData.choices[0].message.content;
          addMessage(reply, 'bot');

          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: reply })
          });
          const audioBlob = await ttsRes.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          new Audio(audioUrl).play();
        };
        reader.onerror = err => console.error('FileReader error:', err);
      };

      audioChunks = [];
      mediaRecorder.start();
      recordBtn.disabled = true;
      recordBtn.textContent = '⏺️ 녹음 중...';

      setTimeout(() => {
        mediaRecorder.stop();
        recordBtn.disabled = false;
        recordBtn.textContent = '🎤';
      }, 4000); // 4초 녹음
    }

    function addMessage(text, type) {
      const msg = document.createElement('div');
      msg.className = 'message ' + type;
      msg.textContent = text;
      chatBox.appendChild(msg);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    recordBtn.addEventListener('click', recordAndTalk);
  </script>
</body>
</html>
