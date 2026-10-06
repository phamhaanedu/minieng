/**
 * topics.js - Định nghĩa Siêu dữ liệu & Tiện ích Cây Chủ Đề (Topic Tree & Stages)
 */

export const TOPIC_METADATA = {
  colors_shapes: {
    name: 'Màu Sắc & Hình Khối',
    nameEn: 'Colors & Shapes',
    icon: '🎨',
    order: 1,
    desc: 'Màu sắc cơ bản, sắc thái và hình học quen thuộc'
  },
  numbers_time: {
    name: 'Thời Gian & Con Số',
    nameEn: 'Numbers & Time',
    icon: '⏰',
    order: 2,
    desc: 'Số đếm, ngày tháng, mùa màng và thời gian'
  },
  school_education: {
    name: 'Trường Học & Dụng Cụ',
    nameEn: 'School & Education',
    icon: '🏫',
    order: 3,
    desc: 'Dụng cụ học tập, môn học, lớp học và thi cử'
  },
  food_drinks: {
    name: 'Ẩm Thực & Đồ Uống',
    nameEn: 'Food & Drinks',
    icon: '🍎',
    order: 4,
    desc: 'Món ăn, hoa quả, thức uống và gia vị nấu nướng'
  },
  body_health: {
    name: 'Cơ Thể & Sức Khỏe',
    nameEn: 'Body & Health',
    icon: '🩺',
    order: 5,
    desc: 'Bộ phận cơ thể, sức khỏe, triệu chứng và y tế'
  },
  clothes_fashion: {
    name: 'Trang Phục & Thời Trang',
    nameEn: 'Clothes & Fashion',
    icon: '👕',
    order: 6,
    desc: 'Quần áo, giày dép, phụ kiện và trang sức'
  },
  home_daily_life: {
    name: 'Nhà Cửa & Đời Sống',
    nameEn: 'Home & Daily Life',
    icon: '🏡',
    order: 7,
    desc: 'Phòng ốc, đồ gia dụng và sinh hoạt gia đình'
  },
  animals_plants_nature: {
    name: 'Động Vật & Tự Nhiên',
    nameEn: 'Animals & Nature',
    icon: '🦁',
    order: 8,
    desc: 'Thú cưng, động vật hoang dã, cây cối và đại dương'
  },
  feelings_relationships: {
    name: 'Cảm Xúc & Quan Hệ',
    nameEn: 'Feelings & Relationships',
    icon: '❤️',
    order: 9,
    desc: 'Gia đình, bạn bè, tính cách và cảm xúc'
  },
  travel_transport: {
    name: 'Du Lịch & Giao Thông',
    nameEn: 'Travel & Transport',
    icon: '✈️',
    order: 10,
    desc: 'Phương tiện, đường sá, du lịch và khách sạn'
  },
  weather_seasons: {
    name: 'Thời Tiết & Khí Hậu',
    nameEn: 'Weather & Seasons',
    icon: '⛅',
    order: 11,
    desc: 'Khí hậu, các mùa, hiện tượng thời tiết'
  },
  music_arts_entertainment: {
    name: 'Nghệ Thuật & Âm Nhạc',
    nameEn: 'Arts & Music',
    icon: '🎭',
    order: 12,
    desc: 'Nhạc cụ, bài hát, điện ảnh và biểu diễn'
  },
  sports_recreation: {
    name: 'Thể Thao & Giải Trí',
    nameEn: 'Sports & Games',
    icon: '⚽',
    order: 13,
    desc: 'Môn thể thao, vận động và trò chơi'
  },
  science_technology: {
    name: 'Khoa Học & Công Nghệ',
    nameEn: 'Science & Tech',
    icon: '💡',
    order: 14,
    desc: 'Thiết bị điện tử, máy tính và năng lượng'
  },
  business_jobs_finance: {
    name: 'Công Việc & Tài Chính',
    nameEn: 'Jobs & Finance',
    icon: '💼',
    order: 15,
    desc: 'Nghề nghiệp, tài chính, tiền tệ và thương mại'
  },
  daily_life_general: {
    name: 'Từ Vựng Thông Dụng',
    nameEn: 'General Vocabulary',
    icon: '🌟',
    order: 16,
    desc: 'Động từ hành động, tính từ tổng quát đời sống'
  }
};

/**
 * Tính toán tiến độ từng Chủ đề (Màn) và từng Ải (Stages)
 * @param {Array} allWords - Toàn bộ từ vựng từ LocalDB
 * @param {Object} userProgressMap - Bản đồ tiến độ { wordId: { repetitions, nextReviewDate, ... } }
 * @returns {Array} Danh sách các Màn chơi với đầy đủ thông số ải, tỉ lệ hoàn thành, sao vàng
 */
export function calculateTopicStages(allWords, userProgressMap = {}) {
  // Gom nhóm từ vựng theo topic
  const grouped = {};
  Object.keys(TOPIC_METADATA).forEach(topicId => {
    grouped[topicId] = [];
  });

  allWords.forEach(w => {
    const topicId = w.topic && grouped[w.topic] ? w.topic : 'daily_life_general';
    grouped[topicId].push(w);
  });

  const topicsList = [];

  Object.keys(TOPIC_METADATA).forEach(topicId => {
    const meta = TOPIC_METADATA[topicId];
    const words = grouped[topicId] || [];
    const totalWords = words.length;

    if (totalWords === 0) return;

    // Đếm số từ đã thuộc (đã từng trả lời đúng >= 1 lần trong SRS)
    const masteredWords = words.filter(w => {
      const p = userProgressMap[w.id];
      return p && p.repetitions >= 1;
    });

    const masteredCount = masteredWords.length;
    const progressPercent = Math.round((masteredCount / totalWords) * 100);
    const isMastered100 = masteredCount === totalWords && totalWords > 0;

    // Chia thành các Ải (mỗi ải 10 từ)
    const STAGE_SIZE = 10;
    const totalStages = Math.ceil(totalWords / STAGE_SIZE);
    const stages = [];

    for (let i = 0; i < totalStages; i++) {
      const stageWords = words.slice(i * STAGE_SIZE, (i + 1) * STAGE_SIZE);
      const stageMastered = stageWords.filter(w => {
        const p = userProgressMap[w.id];
        return p && p.repetitions >= 1;
      }).length;

      const isStageCompleted = stageMastered === stageWords.length;

      stages.push({
        stageIndex: i,
        stageNumber: i + 1,
        totalInStage: stageWords.length,
        masteredInStage: stageMastered,
        isCompleted: isStageCompleted,
        words: stageWords
      });
    }

    // Tìm ải tiếp theo cần học (ải đầu tiên chưa hoàn thành 100%)
    const nextStage = stages.find(s => !s.isCompleted) || stages[stages.length - 1];

    topicsList.push({
      topicId,
      ...meta,
      totalWords,
      masteredCount,
      progressPercent,
      isMastered100,
      totalStages,
      stages,
      nextStageIndex: nextStage ? nextStage.stageIndex : 0
    });
  });

  // Sắp xếp theo order định nghĩa
  topicsList.sort((a, b) => a.order - b.order);

  return topicsList;
}
