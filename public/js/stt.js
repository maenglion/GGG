// 📁 public/js/stt.js (프론트엔드용 Google STT 연동 예시)

let mediaRecorder;
let audioChunks = [];

export function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = e => {
        audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBase64 = arrayBufferToBase64(arrayBuffer);

        const response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioContent: audioBase64 })
        });

        const result = await response.json();
        if (result.text) {
          console.log('🗣️ 인식된 텍스트:', result.text);
          // 여기에 GPT 호출 연결 가능
        } else {
          console.error('STT 실패:', result);
        }
      };

      mediaRecorder.start();
      console.log('🎙️ 녹음 시작');
    })
    .catch(err => {
      console.error('마이크 접근 오류:', err);
    });
}

export function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log('🛑 녹음 중지');
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

  recognition.onend = () => {
    console.log("🔚 인식 종료됨");
    // 필요시 재시도 로직 추가 가능
  };

  try {
    recognition.start();
  } catch (err) {
    console.error("🎤 recognition.start() 실패:", err);
    callback(null);
  }
}

export function stopSTT() {
  if (recognition) {
    recognition.stop();
    console.log("🛑 음성 인식 중지 요청됨");
  }
}
