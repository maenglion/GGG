// ✅ server.js (최종 통합 버전 - GPT + Google STT)
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { SpeechClient } from '@google-cloud/speech';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_STT_KEY_PATH = process.env.GOOGLE_STT_KEY_PATH || './your-google-stt-key.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

console.log("🚀 서버 초기화 시작");
if (OPENAI_API_KEY) {
  console.log("🔑 OpenAI API 키 로드됨: " + OPENAI_API_KEY.substring(0, 5) + "..." + OPENAI_API_KEY.slice(-4));
} else {
  console.warn("❌ OpenAI API 키 누락: .env 파일 확인");
}

// ✅ GPT 대화 라우트
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.8, analysisType } = req.body;

  if (!OPENAI_API_KEY || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '유효하지 않은 요청' });
  }

  let effectiveMessages = messages;
  const userMsg = messages.find(m => m.role === 'user')?.content;

  if (analysisType === 'detailedUtteranceEmotion' && userMsg) {
    effectiveMessages = [{
      role: 'system',
      content: `너는 아동 심리 분석가야. 다음 발화를 분석해줘: \n\n"""${userMsg}"""
응답은 JSON 형식으로 해줘.`
    }];
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages: effectiveMessages, temperature })
    });

    const text = await response.text();
    if (!response.ok) return res.status(response.status).send(text);
    res.send(JSON.parse(text));

  } catch (err) {
    console.error("❌ GPT 오류:", err);
    res.status(500).json({ error: '서버 오류', details: err.message });
  }
});

// ✅ Google STT 라우트
app.post('/api/stt', async (req, res) => {
  const { audioContent } = req.body;
  if (!audioContent) return res.status(400).json({ error: 'audioContent 누락' });

  const client = new SpeechClient({ keyFilename: GOOGLE_STT_KEY_PATH });

  try {
    const [response] = await client.recognize({
      audio: { content: audioContent },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'ko-KR'
      }
    });

    const text = response.results.map(r => r.alternatives[0].transcript).join('\n');
    res.json({ text });
  } catch (err) {
    console.error('❌ STT 오류:', err);
    res.status(500).json({ error: 'STT 실패', details: err.message });
  }
});

// ✅ SPA 대응 라우트
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, err => {
    if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
