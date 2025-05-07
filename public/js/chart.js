<!-- 감정일기 분석 차트 영역 -->
<canvas id="emotionChart" width="320" height="200"></canvas>

<!-- Chart.js CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script type="module">
  // 예시: 감정 키워드 → 카테고리 매핑 결과
  const emotionCounts = {
    '기쁨': 3,
    '슬픔': 1,
    '분노': 2,
    '불안': 1
  };

  const ctx = document.getElementById('emotionChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(emotionCounts),
      datasets: [{
        label: '감정 빈도',
        data: Object.values(emotionCounts),
        backgroundColor: ['#FFD700', '#87CEEB', '#FF6B6B', '#A9A9A9']
      }]
    },
    options: {
      responsive: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
</script>
