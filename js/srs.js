/**
 * srs.js - Thuật toán Spaced Repetition (Lặp lại ngắt quãng)
 * Dựa trên thuật toán SuperMemo-2 (SM-2) được điều chỉnh.
 */

// Định nghĩa các hằng số mặc định cho một từ mới học
const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_INTERVAL = 1; // 1 ngày

/**
 * Tính toán trạng thái SRS tiếp theo của một từ vựng sau khi người dùng trả lời.
 * 
 * @param {number} quality - Điểm đánh giá chất lượng trả lời (0-5)
 *   5: Trả lời hoàn hảo, phản xạ nhanh
 *   4: Trả lời đúng sau một chút suy nghĩ
 *   3: Trả lời đúng nhưng khó khăn
 *   2: Trả lời sai, nhưng nhớ ra đáp án đúng ngay sau đó
 *   1: Trả lời sai, nhớ mang máng
 *   0: Hoàn toàn không nhớ gì
 * @param {number} easeFactor - Hệ số độ dễ hiện tại (mặc định 2.5)
 * @param {number} interval - Khoảng cách số ngày ôn tập hiện tại
 * @param {number} repetitions - Số lần trả lời đúng liên tiếp
 * 
 * @returns {Object} { easeFactor, interval, repetitions, nextReviewDate }
 */
export function calculateNextReview(quality, easeFactor = DEFAULT_EASE_FACTOR, interval = 0, repetitions = 0) {
  let nextEaseFactor = easeFactor;
  let nextInterval = interval;
  let nextRepetitions = repetitions;

  // Cập nhật Repetitions
  if (quality >= 3) {
    nextRepetitions += 1;
  } else {
    nextRepetitions = 0; // Trả lời sai -> Reset số lần đúng liên tiếp
  }

  // Cập nhật Interval (Khoảng cách ôn tập - tính bằng Ngày)
  if (nextRepetitions === 0) {
    nextInterval = 1;
  } else if (nextRepetitions === 1) {
    nextInterval = 1;
  } else if (nextRepetitions === 2) {
    nextInterval = 6;
  } else {
    nextInterval = Math.round(interval * easeFactor);
  }

  // Cập nhật Ease Factor (Độ dễ)
  // Công thức gốc SM-2: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  nextEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  
  if (nextEaseFactor < MIN_EASE_FACTOR) {
    nextEaseFactor = MIN_EASE_FACTOR;
  }

  // Tính toán Ngày ôn tập tiếp theo
  const now = new Date();
  now.setDate(now.getDate() + nextInterval);
  
  return {
    easeFactor: parseFloat(nextEaseFactor.toFixed(3)),
    interval: nextInterval,
    repetitions: nextRepetitions,
    nextReviewDate: now.toISOString() // Trả về dạng chuỗi chuẩn ISO
  };
}

/**
 * Hàm tiện ích để xác định xem một từ đã đến hạn ôn tập chưa
 * @param {string} nextReviewDateISO - Chuỗi ngày ISO lưu trong DB
 * @returns {boolean} true nếu đã đến hạn hoặc trễ hạn
 */
export function isDueForReview(nextReviewDateISO) {
  if (!nextReviewDateISO) return true; // Chưa học bao giờ
  const reviewDate = new Date(nextReviewDateISO);
  const now = new Date();
  return now >= reviewDate;
}
