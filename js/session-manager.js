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
  constructor(userId, sessionSize = 10) {
    this.userId = userId;
    this.sessionSize = sessionSize;
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

      // Phân loại từ
      const dueWords = [];
      const newWords = [];

      allWords.forEach(word => {
        const progress = userProgressMap[word.id];
        if (!progress) {
          newWords.push(word); // Từ chưa học bao giờ
        } else if (isDueForReview(progress.nextReviewDate)) {
          dueWords.push({ word, progress }); // Từ đến hạn ôn
        }
      });

      // Ưu tiên ôn tập (Review) trước, nếu chưa đủ quota thì bù từ mới (New)
      let selectedItems = [];
      
      // Lọc từ theo chế độ Giao Bài (Nhiệm vụ)
      let targetReviewQuota = Math.floor(this.sessionSize * 0.8);
      
      if (window.activeTask) {
        if (window.activeTask.taskType === 'new_words') {
          targetReviewQuota = 0; // 100% Học từ mới
        } else if (window.activeTask.taskType === 'review_words') {
          targetReviewQuota = this.sessionSize; // 100% Ôn tập
        }
        console.log("🚀 Starting Session from Task:", window.activeTask.title, "| Quota Review:", targetReviewQuota);
        // Clear active task after using it for initialization
        window.activeTask = null;
      }
      
      const reviewQuota = targetReviewQuota;
      
      // Trộn ngẫu nhiên danh sách dueWords
      this.shuffleArray(dueWords);
      this.shuffleArray(newWords);

      selectedItems = dueWords.slice(0, reviewQuota).map(item => ({
        ...item.word,
        isReview: true,
        progress: item.progress
      }));

      // Bù từ mới vào phần còn thiếu
      const remainingQuota = this.sessionSize - selectedItems.length;
      const selectedNew = newWords.slice(0, remainingQuota).map(word => ({
        ...word,
        isReview: false,
        progress: null
      }));

      selectedItems = [...selectedItems, ...selectedNew];
      
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
