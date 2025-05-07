// js/tts.js

/**
 * 주어진 텍스트를 음성으로 출력합니다.
 * Web Speech API의 speechSynthesis를 사용합니다.
 * @param {string} text - 음성으로 변환할 텍스트.
 * @returns {Promise<void>} 음성 출력이 정상적으로 시작되고 완료되면 resolve하고, 오류 발생 시 reject하는 Promise.
 */
export function startTTS(text) {
  return new Promise((resolve, reject) => {
    // window.speechSynthesis API 지원 여부 확인
    if (!window.speechSynthesis) {
      // 사용자에게 알림 (alert는 talk.html 등 호출하는 쪽에서 처리하거나, 여기서 유지)
      // alert("이 브라우저는 음성 출력을 지원하지 않아요. 메시지는 텍스트로만 표시됩니다.");
      console.warn("TTS: 이 브라우저에서는 음성 합성을 지원하지 않습니다.");
      // TTS 미지원 시에도 애플리케이션 흐름이 중단되지 않도록 resolve 처리할 수도 있으나,
      // 호출하는 쪽에서 명확히 인지하도록 reject 처리.
      reject(new Error("음성 합성이 지원되지 않는 브라우저입니다."));
      return;
    }

    // 텍스트가 비어있거나 공백만 있으면 즉시 resolve (아무것도 말하지 않음)
    if (!text || String(text).trim() === "") {
      // console.log("TTS: 말할 내용이 없습니다.");
      resolve();
      return;
    }

    // SpeechSynthesisUtterance 객체 생성
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR'; // 한국어 설정

    // 음성 설정 및 재생 함수
    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      // 선호하는 한국어 여성 음성 찾기 (Google 음성 우선)
      let preferredVoice = voices.find(v => v.lang === 'ko-KR' && v.name.includes("Google") && v.name.includes("female"));
      if (!preferredVoice) {
          // Google 한국어 음성 (성별 무관)
          preferredVoice = voices.find(v => v.lang === 'ko-KR' && v.name.includes("Google"));
      }
      if (!preferredVoice) {
          // 기타 한국어 음성
          preferredVoice = voices.find(v => v.lang === 'ko-KR');
      }

      if (preferredVoice) {
        utterance.voice = preferredVoice;
        // console.log("TTS: 사용 음성 - " + preferredVoice.name);
      } else {
        // 한국어 음성이 없을 경우 콘솔에 경고 출력
        console.warn("TTS: 한국어 음성을 찾을 수 없습니다. 기본 음성으로 출력합니다.");
      }

      // 음성 속성 설정
      utterance.rate = 1.0;    // 재생 속도 (기본값: 1, 범위: 0.1 ~ 10)
      utterance.pitch = 1.1; // 음높이 (기본값: 1, 범위: 0 ~ 2)
      utterance.volume = 1;  // 볼륨 (기본값: 1, 범위: 0 ~ 1)

      // 음성 재생 완료 시 Promise resolve
      utterance.onend = () => {
        // console.log("TTS: 음성 재생 완료.");
        resolve();
      };

      // 음성 재생 오류 시 Promise reject
      utterance.onerror = (event) => {
        console.error("TTS: 음성 재생 오류.", event.error);
        reject(event.error);
      };

      // 현재 진행 중인 다른 음성 출력이 있다면 취소 (새 음성 즉시 재생)
      window.speechSynthesis.cancel();
      // 음성 재생 시작
      window.speechSynthesis.speak(utterance);
    };

    // 브라우저에 따라 음성 목록을 비동기적으로 가져올 수 있음
    const voices = window.speechSynthesis.getVoices();
    if (voices.length !== 0) {
      setVoiceAndSpeak();
    } else {
      // 음성 목록이 로드되면 setVoiceAndSpeak 함수 호출
      window.speechSynthesis.onvoiceschanged = () => {
        // console.log("TTS: 음성 목록 로드됨.");
        setVoiceAndSpeak();
        // 이벤트 리스너는 한 번만 필요하므로 제거
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  });
}
