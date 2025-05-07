// ✅ server.js (STT + GPT + Google Cloud TTS 통합 버전 with 마이크 UI 지원)
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sttClient = new SpeechClient({ credentials: JSON.parse(GOOGLE_APPLICATION_CREDENTIALS) });
const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(GOOGLE_APPLICATION_CREDENTIALS) });

// ✅ GPT 대화
app.post('/api/gpt-chat', async (req, res) => {
  const { messages, model = 'gpt-4', temperature = 0.7 } = req.body;
  if (!OPENAI_API_KEY || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '유효하지 않은 요청' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature })
    });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).send(text);
    res.send(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: 'GPT 호출 오류', details: err.message });
  }
});

// ✅ STT 음성 → 텍스트
app.post('/api/stt', async (req, res) => {
  const { audioContent } = req.body;
  if (!audioContent) return res.status(400).json({ error: 'audioContent 누락' });

  try {
    const [response] = await sttClient.recognize({
      audio: { content: audioContent },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'ko-KR',
        enableAutomaticPunctuation: true
      }
    });
    const text = response.results.map(r => r.alternatives[0].transcript).join('\n');
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'STT 실패', details: err.message });
  }
});

// ✅ TTS 텍스트 → 음성
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text 누락' });

  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: 'ko-KR',
        name: 'ko-KR-Chirp3-HD-Aoede' // ✔️ 선택한 목소리
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    });

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);
  } catch (err) {
    res.status(500).json({ error: 'TTS 실패', details: err.message });
  }
});

// ✅ SPA 대응
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, err => {
    if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
