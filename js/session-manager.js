/**
 * session-manager.js - Quản lý Phiên Học Tập & Gamification Logic
 */
import { getLocalWords } from './db.js';
import { isDueForReview, calculateNextReview } from './srs.js';

// Danh sách ID của 10 phương pháp Gamification (sẽ được map tỉ lệ cấu hình sau)
const GAME_MODES = [
  'MCQ_EN_VN',    // 1. Trắc nghiệm EN -> VN
  'MCQ_VN_EN',    // 2. Trắc nghiệm VN -> EN
  'TYPING',       // 3. Gõ từ
  'MISSING_LT',   // 4. Chữ khuyết
  'MATCHING',     // 5. Nối từ
  'ANAGRAM',      // 6. Xắp xếp chữ
  'FLASHCARD',    // 7. Flashcard (Tự đánh giá)
  'LISTEN_MCQ',   // 8. Nghe chọn
  'DICTATION',    // 9. Nghe chép
  'TRUE_FALSE'    // 10. Đúng sai
];

export class LearningSession {
  constructor(userId, sessionSize = 10, topicId = null, stageIndex = null) {
    this.userId = userId;
    this.sessionSize = sessionSize;
    this.topicId = topicId;
    this.stageIndex = stageIndex;
    this.queue = [];        // Hàng đợi các câu hỏi trong session này
    this.currentIndex = 0;  // Vị trí hiện tại
    this.results = [];      // Kết quả lưu tạm (batch logs)
    this.status = 'INIT';   // INIT, ACTIVE, COMPLETED
  }

  /**
   * Khởi tạo Session bằng cách lấy dữ liệu từ IndexedDB (Tối ưu Zero-cost)
   * và chọn lọc từ vựng dựa trên thuật toán SRS.
   */
  async initialize(userProgressMap = {}) {
    try {
      const allWords = await getLocalWords();
      
      if (!allWords || allWords.length === 0) {
        throw new Error("Không có từ vựng nào trong LocalDB. Vui lòng tải lại trang hoặc đợi quá trình đồng bộ.");
      }

      // Nếu có chọn Topic cụ thể, lọc từ theo Topic đó
      let candidateWords = allWords;
      if (this.topicId) {
        const filtered = allWords.filter(w => w.topic === this.topicId);
        if (filtered.length > 0) {
          candidateWords = filtered;
        }
      }

      let selectedItems = [];

      // TRƯỜNG HỢP 1: Học theo Ải cụ thể trong Màn chơi (Stage in Topic)
      if (this.topicId && this.stageIndex !== null && this.stageIndex !== undefined) {
        const start = this.stageIndex * this.sessionSize;
        const end = start + this.sessionSize;
        let stageWords = candidateWords.slice(start, end);

        // Nếu ải cuối có ít hơn 10 từ, bù thêm từ trong cùng topic để đủ 10 câu
        if (stageWords.length < this.sessionSize && candidateWords.length > stageWords.length) {
          const otherWords = candidateWords.filter(w => !stageWords.some(sw => sw.id === w.id));
          this.shuffleArray(otherWords);
          stageWords = [...stageWords, ...otherWords.slice(0, this.sessionSize - stageWords.length)];
        }

        // Phân loại trong ải: Từ đến hạn ôn -> Từ mới -> Từ củng cố
        const stageDue = [];
        const stageNew = [];
        const stageReinforce = [];

        stageWords.forEach(word => {
          const progress = userProgressMap[word.id];
          if (!progress) {
            stageNew.push(word);
          } else if (isDueForReview(progress.nextReviewDate)) {
            stageDue.push({ word, progress });
          } else {
            stageReinforce.push({ word, progress });
          }
        });

        this.shuffleArray(stageDue);
        this.shuffleArray(stageNew);
        this.shuffleArray(stageReinforce);

        const stageItems = [
          ...stageDue.map(item => ({ ...item.word, isReview: true, progress: item.progress })),
          ...stageNew.map(word => ({ ...word, isReview: false, progress: null })),
          ...stageReinforce.map(item => ({ ...item.word, isReview: true, progress: item.progress }))
        ];

        selectedItems = stageItems.slice(0, this.sessionSize);
      } else {
        // TRƯỜNG HỢP 2: Học SRS thông thường hoặc theo Task
        const dueWords = [];
        const newWords = [];

        candidateWords.forEach(word => {
          const progress = userProgressMap[word.id];
          if (!progress) {
            newWords.push(word);
          } else if (isDueForReview(progress.nextReviewDate)) {
            dueWords.push({ word, progress });
          }
        });

        let targetReviewQuota = Math.floor(this.sessionSize * 0.8);
        
        if (window.activeTask) {
          if (window.activeTask.taskType === 'new_words') {
            targetReviewQuota = 0; // 100% Học từ mới
          } else if (window.activeTask.taskType === 'review_words') {
            targetReviewQuota = this.sessionSize; // 100% Ôn tập
          }
          console.log("🚀 Starting Session from Task:", window.activeTask.title, "| Quota Review:", targetReviewQuota);
          window.activeTask = null;
        }
        
        const reviewQuota = targetReviewQuota;
        
        this.shuffleArray(dueWords);
        this.shuffleArray(newWords);

        selectedItems = dueWords.slice(0, reviewQuota).map(item => ({
          ...item.word,
          isReview: true,
          progress: item.progress
        }));

        const remainingQuota = this.sessionSize - selectedItems.length;
        const selectedNew = newWords.slice(0, remainingQuota).map(word => ({
          ...word,
          isReview: false,
          progress: null
        }));

        selectedItems = [...selectedItems, ...selectedNew];

        // Nếu vẫn chưa đủ (ví dụ do topic ít từ), bù thêm từ đã học
        if (selectedItems.length < this.sessionSize && candidateWords.length > selectedItems.length) {
          const remaining = candidateWords.filter(w => !selectedItems.some(si => si.id === w.id));
          this.shuffleArray(remaining);
          const extra = remaining.slice(0, this.sessionSize - selectedItems.length).map(word => ({
            ...word,
            isReview: true,
            progress: userProgressMap[word.id] || null
          }));
          selectedItems = [...selectedItems, ...extra];
        }
      }
      
      // Shuffle lại lần cuối để không đoán được logic
      this.shuffleArray(selectedItems);

      // Map mỗi từ với 1 Mini-game ngẫu nhiên
      this.queue = selectedItems.map(item => {
        const randomMode = GAME_MODES[Math.floor(Math.random() * GAME_MODES.length)];
        return {
          wordData: item,
          gameMode: randomMode
        };
      });

      this.status = 'ACTIVE';
      return this.queue.length;

    } catch (error) {
      console.error("Lỗi khi khởi tạo Session:", error);
      throw error;
    }
  }

  /**
   * Lấy câu hỏi hiện tại
   */
  getCurrentQuestion() {
    if (this.currentIndex >= this.queue.length) {
      this.status = 'COMPLETED';
      return null;
    }
    return this.queue[this.currentIndex];
  }

  /**
   * Submit kết quả cho câu hỏi hiện tại và lưu vào Log
   * @param {number} quality - Điểm chất lượng trả lời (0-5)
   */
  submitAnswer(quality) {
    if (this.status !== 'ACTIVE') return null;

    const currentItem = this.queue[this.currentIndex];
    const oldProgress = currentItem.wordData.progress || {};
    
    // Tính toán SRS mới
    const newProgress = calculateNextReview(
      quality, 
      oldProgress.easeFactor, 
      oldProgress.interval, 
      oldProgress.repetitions
    );

    // Ghi nhận vào mảng logs tạm
    this.results.push({
      wordId: currentItem.wordData.id,
      gameMode: currentItem.gameMode,
      quality: quality,
      isCorrect: quality >= 3,
      isNewWord: !currentItem.wordData.isReview,
      timestamp: new Date().toISOString(),
      newProgress: newProgress
    });

    this.currentIndex++;
    return this.getCurrentQuestion();
  }

  /**
   * Tính toán % tiến độ của session hiện tại
   */
  getProgressPercent() {
    if (this.queue.length === 0) return 0;
    return Math.round((this.currentIndex / this.queue.length) * 100);
  }

  /**
   * Lấy toàn bộ Log để chuẩn bị push lên Firebase (Batch Write)
   */
  getBatchResults() {
    return this.results;
  }

  /**
   * Hàm tiện ích trộn mảng (Fisher-Yates)
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
