// js/stt.js

let recognition;

export function startSTT(callback) {
  if (!('webkitSpeechRecognition' in window)) {
    console.warn("이 브라우저는 STT를 지원하지 않습니다.");
    callback(null);
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onstart = () => console.log("🎙️ 음성 인식 시작됨");
  recognition.onspeechend = () => console.log("🛑 사용자 말 멈춤 감지됨");
  recognition.onaudioend = () => console.log("🎧 오디오 스트림 종료됨");

  recognition.onresult = (event) => {
    const result = event.results?.[0]?.[0]?.transcript?.trim();
    console.log("✅ 인식 결과:", result);
    callback(result || null);
  };

  recognition.onerror = (event) => {
    console.error("❌ STT 오류 발생:", event.error);
    callback(null);
  };

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
