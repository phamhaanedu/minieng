import { LearningSession } from './session-manager.js';
import { getLocalWords, getUserProgress, saveSessionResults } from './db.js';
import { isSfxEnabled } from './settings.js';

let currentSession = null;
let audioCtx = null;

// Hàm tạo âm thanh đơn giản bằng Web Audio API
function playSoundEffect(type) {
  if (!isSfxEnabled()) return; // Chặn âm thanh nếu tắt SFX

  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Nếu context bị suspend (chính sách trình duyệt), thử resume
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'win') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.6);
    }
  } catch(e) {
    console.log("Audio not supported or disabled");
  }
}

// Gọi âm thanh khi click toàn cục (trừ các input để tránh ồn)
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.classList.contains('option-tile') || e.target.classList.contains('anagram-tile')) {
    playSoundEffect('click');
  }
});

// Hỗ trợ nhấn Enter toàn cục cho nút "Tiếp tục" và "Hoàn thành"
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    // Ưu tiên 1: Nút Tiếp tục nếu đang hiện
    const feedback = document.getElementById('game-feedback');
    const btnNext = document.getElementById('btn-next-question');
    if (feedback && !feedback.classList.contains('hidden') && btnNext) {
      btnNext.click();
      return;
    }
    
    // Ưu tiên 2: Nút Lưu kết quả (kết thúc phiên)
    const btnFinish = document.getElementById('btn-finish-session');
    if (btnFinish && !btnFinish.disabled && document.body.contains(btnFinish)) {
      btnFinish.click();
      return;
    }

    // Ưu tiên 3: Lật thẻ Flashcard (nếu đang ở mặt trước)
    const flashcardFace = document.getElementById('flashcard-face');
    if (flashcardFace && !flashcardFace.classList.contains('hidden')) {
      flashcardFace.click();
      return;
    }
  }
});

// DOM Elements for Game Engine
const viewLearn = document.getElementById('view-learn');
const gameContainer = document.getElementById('game-container');
const gameFeedback = document.getElementById('game-feedback');
const sessionProgressFill = document.getElementById('session-progress-fill');

/**
 * Khởi tạo và bắt đầu một phiên học mới
 */
export async function startLearningSession(userId) {
  try {
    currentSession = new LearningSession(userId, 10);
    viewLearn.innerHTML = `<div class="text-center"><p>Đang tải dữ liệu học tập...</p></div>`;
    
    // Tải tiến độ SRS hiện tại của user từ Firebase
    const userProgressMap = await getUserProgress(userId); 
    
    await currentSession.initialize(userProgressMap);
    
    // Setup UI skeleton
    viewLearn.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 0 auto;">
        <!-- Thanh Tiến Độ -->
        <div class="health-bar-container">
          <div class="health-bar-fill" id="session-progress-fill" style="width: 0%;"></div>
        </div>
        
        <!-- Vùng Hiển Thị Game -->
        <div id="game-container" style="min-height: 250px; margin-top: var(--spacing-lg);"></div>
        
        <!-- Vùng Phản Hồi (Đúng/Sai) -->
        <div id="game-feedback" class="hidden text-center mt-md" style="padding: var(--spacing-md); border-radius: var(--border-radius-md);">
          <h3 id="feedback-message"></h3>
          <p id="feedback-correct-answer" class="text-muted"></p>
          <button id="btn-next-question" class="btn btn-primary mt-md">Tiếp tục</button>
        </div>
      </div>
    `;

    // Gắn sự kiện cho nút Tiếp tục
    document.getElementById('btn-next-question').addEventListener('click', () => {
      document.getElementById('game-feedback').classList.add('hidden');
      document.getElementById('game-container').classList.remove('hidden');
      renderNextQuestion();
    });

    renderNextQuestion();
  } catch (error) {
    viewLearn.innerHTML = `<div class="card text-center"><p class="text-danger">${error.message}</p></div>`;
  }
}

/**
 * Hiển thị câu hỏi tiếp theo
 */
function renderNextQuestion() {
  const question = currentSession.getCurrentQuestion();
  
  // Cập nhật thanh tiến độ
  const percent = currentSession.getProgressPercent();
  document.getElementById('session-progress-fill').style.width = `${percent}%`;

  if (!question) {
    // Hoàn thành Session
    renderSessionComplete();
    return;
  }

  const container = document.getElementById('game-container');
  container.innerHTML = ''; // Xóa nội dung cũ
  
  // Áp dụng animation fade in
  container.classList.remove('anim-fade-in');
  void container.offsetWidth; // Trigger reflow
  container.classList.add('anim-fade-in');

  switch (question.gameMode) {
    case 'MCQ_EN_VN':
      renderMCQ(container, question, 'EN_VN');
      break;
    case 'MCQ_VN_EN':
      renderMCQ(container, question, 'VN_EN');
      break;
    case 'TYPING':
      renderTyping(container, question);
      break;
    case 'MISSING_LT':
      renderMissingLetters(container, question);
      break;
    case 'FLASHCARD':
      renderFlashcard(container, question);
      break;
    case 'TRUE_FALSE':
      renderTrueFalse(container, question);
      break;
    case 'ANAGRAM':
      renderAnagram(container, question);
      break;
    case 'LISTEN_MCQ':
      renderListenMCQ(container, question);
      break;
    case 'DICTATION':
      renderDictation(container, question);
      break;
    case 'MATCHING':
      renderMatching(container, question);
      break;
    default:
      renderFlashcard(container, question);
      break;
  }
}

/**
 * Hàm hỗ trợ: Phát âm thanh Tiếng Anh (Web Speech API)
 */
function playEnglishAudio(text) {
  if ('speechSynthesis' in window) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    msg.rate = 0.9; // Chậm lại một chút để dễ nghe
    window.speechSynthesis.speak(msg);
  } else {
    console.warn("Trình duyệt không hỗ trợ Web Speech API");
  }
}

/**
 * Game Mode 1 & 2: Trắc nghiệm (Multiple Choice)
 */
async function renderMCQ(container, question, type) {
  const word = question.wordData;
  const isEnToVn = type === 'EN_VN';
  
  const questionText = isEnToVn ? word.english : word.vietnamese;
  const correctAnswer = isEnToVn ? word.vietnamese : word.english;
  
  // Thuật toán sinh đáp án nhiễu thông minh
  const allWords = await getLocalWords();
  const options = [correctAnswer];
  
  if (isEnToVn) {
    // Tùy chọn là Tiếng Việt
    // 1. Lấy 1 nghĩa của từ có cùng chữ cái đầu tiên (Dễ nhầm)
    const similarWords = allWords.filter(w => w.id !== word.id && w.english[0].toLowerCase() === word.english[0].toLowerCase());
    if (similarWords.length > 0) {
      options.push(similarWords[Math.floor(Math.random() * similarWords.length)].vietnamese);
    }
    
    // Bổ sung các nghĩa ngẫu nhiên cho đến khi đủ 4 đáp án
    while (options.length < 4) {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      if (!options.includes(randomWord.vietnamese)) {
        options.push(randomWord.vietnamese);
      }
    }
  } else {
    // Tùy chọn là Tiếng Anh
    // 1. Tạo 1 từ sai chính tả (Typo) để lừa người dùng
    let fakeWord = word.english;
    if (fakeWord.length > 3) {
      // Đổi 1 nguyên âm hoặc nhân đôi phụ âm
      fakeWord = fakeWord.replace(/[aeiou]/i, (match) => {
        const vowels = ['a', 'e', 'i', 'o', 'u'];
        return vowels[(vowels.indexOf(match.toLowerCase()) + 1) % 5]; // Đổi sang nguyên âm khác
      });
      options.push(fakeWord);
    }

    // 2. Lấy 1 từ thật có độ dài tương đương (+- 1 ký tự)
    const similarLengthWords = allWords.filter(w => w.id !== word.id && Math.abs(w.english.length - word.english.length) <= 1);
    if (similarLengthWords.length > 0) {
      options.push(similarLengthWords[Math.floor(Math.random() * similarLengthWords.length)].english);
    }
    
    // Bổ sung từ ngẫu nhiên nếu chưa đủ 4
    while (options.length < 4) {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      if (!options.includes(randomWord.english)) {
        options.push(randomWord.english);
      }
    }
  }
  
  // Trộn đều 4 đáp án
  options.sort(() => Math.random() - 0.5);

  let html = `<h2 class="text-center" style="font-size: 2rem; margin-bottom: var(--spacing-lg);">${questionText}</h2>`;
  html += `<div style="display: grid; grid-template-columns: 1fr; gap: var(--spacing-md);">`;
  
  options.forEach(opt => {
    html += `<div class="option-tile mcq-option">${opt}</div>`;
  });
  html += `</div>`;
  
  container.innerHTML = html;

  // Gắn sự kiện click
  const btns = container.querySelectorAll('.mcq-option');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = e.target.textContent;
      const isCorrect = selected === correctAnswer;
      const quality = isCorrect ? 4 : 1; // Đúng được 4 điểm, sai được 1 điểm (có thể tùy chỉnh)
      handleAnswerSubmit(quality, isCorrect, correctAnswer);
    });
  });
}

/**
 * Game Mode 3: Gõ từ (Typing)
 */
function renderTyping(container, question) {
  const word = question.wordData;
  
  container.innerHTML = `
    <h2 class="text-center" style="margin-bottom: var(--spacing-sm);">${word.vietnamese}</h2>
    <p class="text-center text-muted mb-md">Hãy gõ từ tiếng Anh tương ứng</p>
    <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-lg);">
      <input type="text" id="typing-input" class="form-input" style="flex: 1; padding: var(--spacing-sm); font-size: 1.2rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);" autocomplete="off">
      <button id="btn-submit-typing" class="btn btn-primary">Kiểm tra</button>
    </div>
  `;

  const input = document.getElementById('typing-input');
  const btn = document.getElementById('btn-submit-typing');
  
  setTimeout(() => input.focus(), 100);

  const checkAnswer = () => {
    const userAnswer = input.value.trim().toLowerCase();
    const correctAnswer = word.english.trim().toLowerCase();
    const isCorrect = userAnswer === correctAnswer;
    const quality = isCorrect ? 5 : 0; // Gõ đúng khó hơn, nên được 5 điểm
    handleAnswerSubmit(quality, isCorrect, word.english);
  };

  btn.addEventListener('click', checkAnswer);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
}

/**
 * Game Mode 4: Chữ khuyết (Missing Letters)
 */
function renderMissingLetters(container, question) {
  const word = question.wordData;
  const enWord = word.english;
  
  // Logic tạo chữ khuyết đơn giản: ẩn 50% số chữ cái
  let missingWord = '';
  for(let i=0; i<enWord.length; i++) {
    if(enWord[i] === ' ') {
      missingWord += ' ';
    } else {
      missingWord += Math.random() > 0.5 ? enWord[i] : '_';
    }
  }

  container.innerHTML = `
    <h2 class="text-center" style="margin-bottom: var(--spacing-sm);">${word.vietnamese}</h2>
    <h1 class="text-center" style="letter-spacing: 5px; font-family: monospace; color: var(--color-primary); margin-bottom: var(--spacing-lg);">${missingWord}</h1>
    <div style="display: flex; gap: var(--spacing-sm);">
      <input type="text" id="missing-input" placeholder="Nhập từ hoàn chỉnh..." class="form-input" style="flex: 1; padding: var(--spacing-sm); font-size: 1.2rem; border: 1px solid var(--color-border);" autocomplete="off">
      <button id="btn-submit-missing" class="btn btn-primary">Kiểm tra</button>
    </div>
  `;

  const inputEl = document.getElementById('missing-input');
  setTimeout(() => inputEl.focus(), 100);

  const checkMissing = () => {
    const ans = inputEl.value.trim().toLowerCase();
    const isCorrect = ans === enWord.toLowerCase();
    handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, enWord);
  };

  document.getElementById('btn-submit-missing').addEventListener('click', checkMissing);
  
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkMissing();
  });
}

/**
 * Game Mode 7: Flashcard
 */
function renderFlashcard(container, question) {
  const word = question.wordData;
  
  container.innerHTML = `
    <div id="flashcard-face" class="card text-center" style="background: var(--color-primary); color: white; cursor: pointer; padding: 3rem 1rem; margin-bottom: var(--spacing-lg);">
      <h1 style="font-size: 2.5rem; margin: 0;">${word.english}</h1>
      <p style="margin-top: var(--spacing-md); opacity: 0.8;">Nhấn để lật thẻ</p>
    </div>
    
    <div id="flashcard-back" class="hidden text-center">
      <h2 style="font-size: 2rem; color: var(--color-success);">${word.vietnamese}</h2>
      <p class="text-muted mt-md">Đánh giá mức độ ghi nhớ của bạn:</p>
      <div style="display: flex; gap: var(--spacing-sm); justify-content: center; margin-top: var(--spacing-md);">
        <button class="btn btn-eval" data-q="0" style="background: var(--color-danger); color: white;">Quên sạch</button>
        <button class="btn btn-eval" data-q="3" style="background: var(--color-warning); color: #000;">Nhớ mang máng</button>
        <button class="btn btn-eval" data-q="5" style="background: var(--color-success); color: white;">Rất thuộc</button>
      </div>
    </div>
  `;

  document.getElementById('flashcard-face').addEventListener('click', (e) => {
    e.currentTarget.classList.add('hidden');
    document.getElementById('flashcard-back').classList.remove('hidden');
  });

  const evalBtns = container.querySelectorAll('.btn-eval');
  evalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const q = parseInt(e.target.getAttribute('data-q'));
      // Flashcard tự đánh giá, nên không có khái niệm đúng sai máy chấm, luôn pass qa câu tiếp theo
      currentSession.submitAnswer(q);
      renderNextQuestion();
    });
  });
}

/**
 * Game Mode 10: Đúng / Sai (True / False)
 */
async function renderTrueFalse(container, question) {
  const word = question.wordData;
  const allWords = await getLocalWords();
  
  // 50% cơ hội hiển thị nghĩa đúng, 50% hiển thị nghĩa sai
  const isActuallyTrue = Math.random() > 0.5;
  let displayedMeaning = word.vietnamese;
  
  if (!isActuallyTrue) {
    const wrongWords = allWords.filter(w => w.id !== word.id);
    if (wrongWords.length > 0) {
      displayedMeaning = wrongWords[Math.floor(Math.random() * wrongWords.length)].vietnamese;
    }
  }

  container.innerHTML = `
    <h2 class="text-center" style="font-size: 2.5rem; margin-bottom: var(--spacing-sm);">${word.english}</h2>
    <p class="text-center text-muted">có nghĩa là:</p>
    <h3 class="text-center" style="font-size: 1.8rem; color: var(--color-primary); margin-bottom: var(--spacing-lg);">${displayedMeaning}</h3>
    
    <div style="display: flex; gap: var(--spacing-md); justify-content: center;">
      <button id="btn-tf-true" class="btn btn-large" style="background: var(--color-success); color: white; width: 120px;">ĐÚNG</button>
      <button id="btn-tf-false" class="btn btn-large" style="background: var(--color-danger); color: white; width: 120px;">SAI</button>
    </div>
  `;

  document.getElementById('btn-tf-true').addEventListener('click', () => {
    const isCorrect = isActuallyTrue === true;
    handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, isActuallyTrue ? "ĐÚNG" : `SAI, nghĩa đúng là: ${word.vietnamese}`);
  });

  document.getElementById('btn-tf-false').addEventListener('click', () => {
    const isCorrect = isActuallyTrue === false;
    handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, isActuallyTrue ? "ĐÚNG" : `SAI, nghĩa đúng là: ${word.vietnamese}`);
  });
}

/**
 * Game Mode 6: Xếp chữ (Anagram)
 */
function renderAnagram(container, question) {
  const word = question.wordData;
  const correctEn = word.english;
  
  // Scramble chữ cái
  let letters = correctEn.replace(/\s+/g, '').split('');
  letters.sort(() => Math.random() - 0.5);

  let tilesHtml = '';
  letters.forEach((l, index) => {
    tilesHtml += `<div class="anagram-tile" data-letter="${l}" data-used="false" style="transition: opacity 0.2s, transform 0.1s;">${l}</div>`;
  });

  container.innerHTML = `
    <h2 class="text-center" style="margin-bottom: var(--spacing-sm);">${word.vietnamese}</h2>
    <p class="text-center text-muted">Bấm vào các chữ cái để ghép từ:</p>
    
    <div id="anagram-tiles-container" style="display: flex; flex-wrap: wrap; justify-content: center; gap: var(--spacing-sm); margin: var(--spacing-md) 0 var(--spacing-lg) 0;">
      ${tilesHtml}
    </div>
    
    <div style="display: flex; gap: var(--spacing-sm);">
      <div style="position: relative; flex: 1; display: flex; align-items: center;">
        <input type="text" id="anagram-input" placeholder="Nhập từ tiếng Anh..." class="form-input" style="width: 100%; padding: var(--spacing-sm) 35px var(--spacing-sm) var(--spacing-sm); font-size: 1.2rem; border: 1px solid var(--color-border); border-radius: var(--border-radius-sm);" autocomplete="off">
        <button id="btn-clear-anagram" style="position: absolute; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: #CBD5E1; color: white; border: none; font-size: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;">✖</button>
      </div>
      <button id="btn-submit-anagram" class="btn btn-primary">Kiểm tra</button>
    </div>
  `;

  const inputEl = document.getElementById('anagram-input');
  
  const syncTiles = () => {
    const currentVal = inputEl.value.toLowerCase();
    const tiles = Array.from(document.querySelectorAll('.anagram-tile'));
    
    // Đặt lại toàn bộ tile về trạng thái hiển thị
    tiles.forEach(t => {
      t.style.opacity = '1';
      t.style.pointerEvents = 'auto';
      t.dataset.used = 'false';
    });
    
    // Duyệt qua từng ký tự trong input, tìm tile khớp và làm ẩn đi
    for (let i = 0; i < currentVal.length; i++) {
      const char = currentVal[i];
      const match = tiles.find(t => t.dataset.letter.toLowerCase() === char && t.dataset.used === 'false');
      if (match) {
        match.style.opacity = '0';
        match.style.pointerEvents = 'none';
        match.dataset.used = 'true';
      }
    }
  };

  // Cập nhật khi gõ phím
  inputEl.addEventListener('input', syncTiles);
  
  // Xử lý khi bấm vào các chữ cái
  const tiles = document.querySelectorAll('.anagram-tile');
  tiles.forEach(tile => {
    tile.addEventListener('click', (e) => {
      const letter = e.target.getAttribute('data-letter');
      inputEl.value += letter;
      syncTiles();
      // Thêm hiệu ứng click nhẹ
      tile.classList.add('anim-bounce');
      setTimeout(() => tile.classList.remove('anim-bounce'), 500);
    });
  });

  // Nút xoá (Clear)
  document.getElementById('btn-clear-anagram').addEventListener('click', () => {
    inputEl.value = '';
    syncTiles();
    inputEl.focus();
  });

  const checkAnagram = () => {
    const ans = inputEl.value.trim().toLowerCase();
    const isCorrect = ans === correctEn.toLowerCase();
    handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, correctEn);
  };

  // Nút Kiểm tra
  document.getElementById('btn-submit-anagram').addEventListener('click', checkAnagram);
  
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnagram();
  });
}

/**
 * Game Mode 8: Nghe chọn (Listen MCQ)
 */
async function renderListenMCQ(container, question) {
  const word = question.wordData;
  const allWords = await getLocalWords();
  
  const options = [word.vietnamese];
  while (options.length < 4) {
    const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
    if (!options.includes(randomWord.vietnamese)) options.push(randomWord.vietnamese);
  }
  options.sort(() => Math.random() - 0.5);

  let html = `
    <div class="text-center mb-lg">
      <button id="btn-play-audio" class="btn btn-large" style="border-radius: 50%; width: 80px; height: 80px; font-size: 2rem; background: var(--color-primary); color: white;">🔊</button>
      <p class="text-muted mt-sm">Nhấn để nghe lại</p>
    </div>
    <div style="display: grid; grid-template-columns: 1fr; gap: var(--spacing-md);">
  `;
  
  options.forEach(opt => {
    html += `<div class="option-tile mcq-listen-option">${opt}</div>`;
  });
  html += `</div>`;
  
  container.innerHTML = html;

  // Tự động phát âm thanh lần đầu
  setTimeout(() => playEnglishAudio(word.english), 500);

  document.getElementById('btn-play-audio').addEventListener('click', () => {
    playEnglishAudio(word.english);
  });

  const btns = container.querySelectorAll('.mcq-listen-option');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = e.target.textContent;
      const isCorrect = selected === word.vietnamese;
      handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, `${word.english} - ${word.vietnamese}`);
    });
  });
}

/**
 * Game Mode 9: Nghe chép (Dictation)
 */
function renderDictation(container, question) {
  const word = question.wordData;
  
  container.innerHTML = `
    <div class="text-center mb-lg">
      <button id="btn-play-audio-dic" class="btn btn-large" style="border-radius: 50%; width: 80px; height: 80px; font-size: 2rem; background: var(--color-primary); color: white;">🔊</button>
    </div>
    <p class="text-center text-muted mb-md">Hãy gõ lại từ tiếng Anh bạn vừa nghe</p>
    <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
      <input type="text" id="dictation-input" class="form-input" style="flex: 1; padding: var(--spacing-sm); font-size: 1.2rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);" autocomplete="off">
      <button id="btn-submit-dictation" class="btn btn-primary">Kiểm tra</button>
    </div>
  `;

  setTimeout(() => playEnglishAudio(word.english), 500);

  document.getElementById('btn-play-audio-dic').addEventListener('click', () => {
    playEnglishAudio(word.english);
  });

  const checkDictation = () => {
    const ans = document.getElementById('dictation-input').value.trim().toLowerCase();
    const isCorrect = ans === word.english.toLowerCase();
    handleAnswerSubmit(isCorrect ? 5 : 0, isCorrect, word.english);
  };

  document.getElementById('btn-submit-dictation').addEventListener('click', checkDictation);

  document.getElementById('dictation-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkDictation();
  });
}

/**
 * Game Mode 5: Chọn cặp đúng (Matching Variant)
 */
async function renderMatching(container, question) {
  const word = question.wordData;
  const allWords = await getLocalWords();
  
  // Tạo 4 thẻ chứa các cặp từ (1 cặp đúng, 3 cặp sai)
  const options = [{ en: word.english, vn: word.vietnamese, isCorrect: true }];
  
  while (options.length < 4) {
    const randomWordEn = allWords[Math.floor(Math.random() * allWords.length)];
    const randomWordVn = allWords[Math.floor(Math.random() * allWords.length)];
    
    // Đảm bảo tạo ra cặp sai (en và vn không khớp nhau và không trùng cặp đúng)
    if (randomWordEn.id !== randomWordVn.id && randomWordEn.id !== word.id) {
       options.push({ en: randomWordEn.english, vn: randomWordVn.vietnamese, isCorrect: false });
    }
  }
  options.sort(() => Math.random() - 0.5);

  let html = `<h2 class="text-center" style="margin-bottom: var(--spacing-lg);">Đâu là cặp từ có nghĩa đúng?</h2>`;
  html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">`;
  
  options.forEach((opt, idx) => {
    html += `
      <div class="option-tile match-pair-option" data-idx="${idx}">
        <span style="font-weight: bold; font-size: 1.2rem;">${opt.en}</span>
        <span style="color: var(--color-text-light); margin-top: 4px;">=</span>
        <span style="color: var(--color-primary); margin-top: 4px;">${opt.vn}</span>
      </div>`;
  });
  html += `</div>`;
  
  container.innerHTML = html;

  const btns = container.querySelectorAll('.match-pair-option');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
      const isCorrect = options[idx].isCorrect;
      handleAnswerSubmit(isCorrect ? 4 : 0, isCorrect, `${word.english} = ${word.vietnamese}`);
    });
  });
}

/**
 * Xử lý sau khi người dùng nộp đáp án
 */
function handleAnswerSubmit(quality, isCorrect, correctAnswer) {
  // Gửi kết quả cho Session Manager để tính toán SRS
  currentSession.submitAnswer(quality);

  const container = document.getElementById('game-container');
  const feedback = document.getElementById('game-feedback');
  const msg = document.getElementById('feedback-message');
  const ansInfo = document.getElementById('feedback-correct-answer');

  container.classList.add('hidden');
  
  feedback.classList.remove('hidden');
  feedback.classList.remove('anim-bounce', 'anim-shake');
  void feedback.offsetWidth; // trigger reflow

  if (isCorrect) {
    playSoundEffect('correct');
    feedback.classList.add('anim-bounce');
    feedback.style.backgroundColor = '#D1FAE5'; // Success bg
    msg.textContent = "Chính xác! 🎉";
    msg.style.color = 'var(--color-success)';
    ansInfo.textContent = "";
    
    // Auto next after 1.5s if correct
    setTimeout(() => {
      if(!feedback.classList.contains('hidden')) {
        document.getElementById('btn-next-question').click();
      }
    }, 1500);

  } else {
    playSoundEffect('wrong');
    feedback.classList.add('anim-shake');
    feedback.style.backgroundColor = '#FEE2E2'; // Danger bg
    msg.textContent = "Chưa chính xác!";
    msg.style.color = 'var(--color-danger)';
    ansInfo.textContent = `Đáp án đúng là: ${correctAnswer}`;
  }
}

/**
 * Hiển thị màn hình Hoàn thành Session
 */
function renderSessionComplete() {
  const container = document.getElementById('game-container');
  const results = currentSession.getBatchResults();
  
  const correctCount = results.filter(r => r.isCorrect).length;

  container.innerHTML = `
    <div class="text-center">
      <h1 style="font-size: 3rem; margin-bottom: var(--spacing-sm);">🏆</h1>
      <h2>Hoàn thành bài học!</h2>
      <p class="text-muted">Bạn đã trả lời đúng ${correctCount}/${results.length} câu.</p>
      
      <button id="btn-finish-session" class="btn btn-primary btn-large mt-md">Kết thúc & Lưu kết quả</button>
    </div>
  `;

  document.getElementById('btn-finish-session').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Đang lưu...";
    try {
      await saveSessionResults(currentSession.userId, results);
      window.showCustomAlert("Đã lưu kết quả học tập thành công!", 'success', () => {
        location.reload(); 
      });
    } catch (error) {
      window.showCustomAlert("Lỗi khi lưu kết quả: " + error.message, 'error');
      btn.disabled = false;
      btn.textContent = "Thử lại";
    }
  });
}
