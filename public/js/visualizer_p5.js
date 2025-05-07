// js/visualizer_p5.js

let p5Instance = null; // To hold the P5 instance
let mic, fft;
let canvasElement; // To store the HTML canvas element

// Visualizer parameters (you can adjust these)
const NUM_BARS = 128; // Number of bars in the circle (power of 2 for FFT is good)
const FFT_BINS = 256; // Must be a power of 2 (e.g., 256, 512, 1024)
const BAR_SMOOTHING = 0.8; // Smoothing factor for bar height changes (0 to 1)
const MIN_RADIUS = 50; // Inner radius of the circle
const MAX_BAR_EXTENSION = 75; // Max height a bar can extend outwards from MIN_RADIUS
let currentAmp = 0; // To store the current amplitude

// Array to store smoothed bar heights
let smoothedHeights = new Array(NUM_BARS).fill(0);

/**
 * Starts the P5.js audio visualizer.
 * @param {HTMLCanvasElement} canvasDOMElement - The HTML canvas element to draw on.
 * @returns {Promise<void>} A promise that resolves when visualization starts, or rejects on error.
 */
export function startVisualizer(canvasDOMElement) {
  canvasElement = canvasDOMElement; // Store the canvas element

  return new Promise((resolve, reject) => {
    // p5.js sketch definition (instance mode)
    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(canvasElement.width, canvasElement.height);
        p.angleMode(p.DEGREES); // Use degrees for angles

        mic = new p5.AudioIn();
        mic.start(
          () => { // Success callback for mic.start()
            console.log("🎤 Microphone started successfully (P5.js)");
            fft = new p5.FFT(BAR_SMOOTHING, FFT_BINS);
            fft.setInput(mic);
            resolve(); // Resolve the promise when mic and FFT are ready
          },
          (err) => { // Error callback for mic.start()
            console.error("🎤 Microphone failed to start (P5.js):", err);
            reject(err); // Reject the promise on error
          }
        );
        // Initialize smoothed heights
        smoothedHeights = new Array(NUM_BARS).fill(0);
      };

      p.draw = () => {
        p.background(240, 240, 240, 150); // Semi-transparent background to see underlying canvas bg if needed
        p.translate(p.width / 2, p.height / 2); // Move origin to canvas center

        if (!mic || !mic.enabled || !fft) {
          // Draw a waiting or error message if mic/fft is not ready
          p.fill(100);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(16);
          p.text("마이크 준비 중...", 0, 0);
          return;
        }

        let spectrum = fft.analyze(); // Get frequency spectrum (FFT_BINS long)
        currentAmp = mic.getLevel(); // Get overall amplitude (0 to 1.0)

        // Store the current amplitude (e.g., for analysis.html)
        // This is a simple way, could be averaged or stored as a series
        localStorage.setItem('currentAmplitude', currentAmp.toFixed(4));


        for (let i = 0; i < NUM_BARS; i++) {
          // Map FFT_BINS to NUM_BARS
          // This is a simple mapping; more sophisticated mappings might be needed
          // depending on how many FFT bins you want each bar to represent.
          // For simplicity, we take a slice of the spectrum.
          const spectrumIndex = Math.floor(p.map(i, 0, NUM_BARS, 0, spectrum.length / 2)); // Use lower half of spectrum for more visible bass/mid
          const amplitude = spectrum[spectrumIndex]; // Get amplitude of this frequency bin

          // Map amplitude (0-255) to bar height
          const targetHeight = p.map(amplitude, 0, 255, 0, MAX_BAR_EXTENSION);

          // Apply smoothing
          smoothedHeights[i] = p.lerp(smoothedHeights[i], targetHeight, 0.2); // 0.2 is lerp factor

          const angle = p.map(i, 0, NUM_BARS, 0, 360); // Angle for each bar
          const barHeight = smoothedHeights[i];

          p.push(); // Save current drawing state
          p.rotate(angle);

          // Draw the bar
          // Color can be based on amplitude, angle, or be fixed
          const hue = p.map(i, 0, NUM_BARS, 0, 360);
          p.fill(hue, 90, 90); // HSB color mode (default in P5 setup if not changed)
          p.noStroke();
          // rect(x, y, width, height)
          // x is MIN_RADIUS (distance from center), y is half bar width (to center it on the line)
          // width is barHeight, height is bar width on screen
          p.rect(MIN_RADIUS, -2, barHeight, 4); // Draw bars outwards
          p.pop(); // Restore drawing state
        }

        // Optional: Draw a central circle reacting to overall amplitude
        const centerCircleSize = p.map(currentAmp, 0, 1, MIN_RADIUS * 0.2, MIN_RADIUS * 0.8);
        p.fill(255, 255, 255, 200); // White, semi-transparent
        p.ellipse(0, 0, centerCircleSize, centerCircleSize);
      };
    };

    // Remove existing instance if any, before creating a new one
    if (p5Instance) {
      p5Instance.remove();
    }
    // Create the P5.js instance, attaching it to the canvas element's PARENT
    // P5 will create its own canvas inside this parent, or use the one if ID matches.
    // To use the *exact* canvas element passed, we ensure its ID is set and pass the ID.
    if (!canvasElement.id) {
        canvasElement.id = 'p5CanvasForVisualizer'; // Ensure canvas has an ID
    }
    p5Instance = new p5(sketch, canvasElement.id);
  });
}

/**
 * Stops the P5.js audio visualizer and releases resources.
 */
export function stopVisualizer() {
  console.log("🎤 Stopping P5.js visualizer...");
  if (mic) {
    mic.stop();
    mic = null; // Clear reference
  }
  if (p5Instance) {
    p5Instance.remove(); // This stops the draw loop and removes the canvas
    p5Instance = null; // Clear reference
  }
  // Clear the canvas content as P5.remove() might not always clear it
  if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      if (ctx) {
          ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
          // Optionally, draw a "stopped" message
          ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
          ctx.textAlign = 'center';
          ctx.font = '16px KoPubWorld Dotum, sans-serif';
          ctx.fillText("시각화 중지됨", canvasElement.width / 2, canvasElement.height / 2);
      }
  }
  localStorage.removeItem('currentAmplitude'); // Clear stored amplitude
  smoothedHeights = new Array(NUM_BARS).fill(0); // Reset smoothed heights
}
