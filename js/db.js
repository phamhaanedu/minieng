import { db as firestoreDb } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, writeBatch, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const DB_NAME = 'EngLingoDB';
const DB_VERSION = 1;
const STORE_WORDS = 'words';
const STORE_META = 'metadata';

let idbInstance = null;

/**
 * Khởi tạo IndexedDB (Local Database)
 */
export function initLocalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_WORDS)) {
        db.createObjectStore(STORE_WORDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      console.log("IndexedDB stores created.");
    };

    request.onsuccess = (event) => {
      idbInstance = event.target.result;
      console.log("IndexedDB initialized successfully.");
      resolve(idbInstance);
    };

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Đọc một giá trị từ metadata store
 */
function getLocalMeta(key) {
  return new Promise((resolve, reject) => {
    if (!idbInstance) return reject("DB not initialized");
    const tx = idbInstance.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ghi một giá trị vào metadata store
 */
function setLocalMeta(key, value) {
  return new Promise((resolve, reject) => {
    const tx = idbInstance.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Kiểm tra version và đồng bộ Master Data từ Firestore về IndexedDB
 */
export async function syncMasterData() {
  try {
    // 1. Lấy version hiện tại từ Firebase
    const configRef = doc(firestoreDb, "app_config", "system");
    const configSnap = await getDoc(configRef);
    
    let serverVersion = 1;
    if (configSnap.exists()) {
      serverVersion = configSnap.data().data_version || 1;
    } else {
      console.warn("Chưa có document app_config/system trên Firebase, dùng version mặc định = 1");
    }

    // 2. Lấy version ở Local
    const localVersion = await getLocalMeta('data_version');
    
    if (localVersion === serverVersion) {
      console.log("Dữ liệu từ vựng đã là bản mới nhất (Version:", localVersion, "). Bỏ qua đồng bộ.");
      return;
    }
    
    console.log(`Phát hiện bản cập nhật từ vựng mới (Local: ${localVersion} -> Server: ${serverVersion}). Bắt đầu tải...`);

    // 3. Tải toàn bộ words từ Firebase
    const wordsCol = collection(firestoreDb, "words");
    const wordsSnapshot = await getDocs(wordsCol);
    
    const words = [];
    wordsSnapshot.forEach((doc) => {
      words.push({ id: doc.id, ...doc.data() });
    });

    // 4. Lưu vào IndexedDB
    if (words.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = idbInstance.transaction(STORE_WORDS, 'readwrite');
        const store = tx.objectStore(STORE_WORDS);
        
        // Clear old data (optional, but good practice if updating bulk)
        store.clear();
        
        words.forEach(word => {
          store.put(word);
        });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      
      console.log(`Đã đồng bộ ${words.length} từ vựng xuống Local Database.`);
    }

    // 5. Cập nhật version local
    await setLocalMeta('data_version', serverVersion);
    console.log("Đồng bộ Master Data thành công!");

  } catch (error) {
    console.error("Lỗi khi đồng bộ Master Data:", error);
  }
}

/**
 * Lấy danh sách từ vựng từ Local Database (Không gọi mạng)
 */
export function getLocalWords() {
  return new Promise((resolve, reject) => {
    if (!idbInstance) return reject("DB not initialized");
    const tx = idbInstance.transaction(STORE_WORDS, 'readonly');
    const store = tx.objectStore(STORE_WORDS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lấy toàn bộ tiến độ học tập của người dùng (từ Firestore)
 */
export async function getUserProgress(userId) {
  try {
    const progressCol = collection(firestoreDb, "users", userId, "progress");
    const snapshot = await getDocs(progressCol);
    const progressMap = {};
    snapshot.forEach(doc => {
      progressMap[doc.id] = doc.data();
    });
    return progressMap;
  } catch (error) {
    console.error("Lỗi khi tải tiến độ:", error);
    return {};
  }
}

/**
 * Lấy thông tin metadata của user (streak, total_points, last_study_date)
 */
export async function getUserStats(userId) {
  try {
    const userRef = doc(firestoreDb, "users", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi tải metadata user:", error);
    return null;
  }
}

/**
 * Hàm hỗ trợ tính toán Streak "sống" dựa vào thời gian hiện tại
 * Tránh việc User đứt chuỗi rồi nhưng DB chưa cập nhật nên vẫn hiện chuỗi cũ.
 */
export function getActiveStreak(last_study_date, stored_streak) {
  if (!last_study_date || !stored_streak) return 0;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const lastStudy = new Date(last_study_date);
  lastStudy.setHours(0,0,0,0);
  
  const diffTime = today - lastStudy;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 1) {
    return stored_streak;
  }
  
  return 0; // Đã quá 1 ngày chưa học -> Hiển thị 0
}

/**
 * Lưu kết quả của 1 session lên Firestore (Batch Write)
 */
export async function saveSessionResults(userId, results) {
  try {
    const batch = writeBatch(firestoreDb);
    const sessionId = new Date().getTime().toString();
    const correctAnswers = results.filter(r => r.isCorrect).length;
    
    // 0. Tính toán Streak & Points cho User
    const userRef = doc(firestoreDb, "users", userId);
    const userSnap = await getDoc(userRef);
    let newStreak = 1;
    let newTotalPoints = correctAnswers;
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const oldStreak = userData.streak || 0;
      const oldPoints = userData.total_points || 0;
      const lastStudy = userData.last_study_date;
      
      newTotalPoints += oldPoints;

      if (lastStudy === todayStr) {
        // Đã học bài hôm nay rồi -> Giữ nguyên streak
        newStreak = oldStreak;
        // Nếu lần đầu tiên trong ngày, oldStreak = 0 và lastStudy chưa có -> Sẽ vào else
        // Nhưng nếu vừa bị tụt streak xong cày lại hôm nay thì streak sẽ = 1.
        // Wait, if lastStudy === todayStr, the user already studied today, so streak doesn't increase but doesn't drop.
        // What if oldStreak is 0? (Meaning they just created account today and played 2nd session). Then streak becomes 0? No, it should be at least 1.
        newStreak = Math.max(oldStreak, 1);
      } else if (lastStudy) {
        // Kiểm tra xem lastStudy có phải là ngày hôm qua không
        const todayDate = new Date(todayStr);
        const lastDate = new Date(lastStudy);
        const diffTime = todayDate - lastDate;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays === 1) {
          newStreak = oldStreak + 1; // Học liên tục
        } else {
          newStreak = 1; // Bị đứt chuỗi, bắt đầu lại từ 1
        }
      } else {
        newStreak = 1; // Học phiên đầu tiên của vòng đời tài khoản
      }
    }
    
    batch.update(userRef, {
      streak: newStreak,
      total_points: newTotalPoints,
      last_study_date: todayStr
    });

    // 1. Lưu log session
    const logRef = doc(firestoreDb, "users", userId, "logs", sessionId);
    batch.set(logRef, {
      timestamp: new Date().toISOString(),
      totalQuestions: results.length,
      correctCount: correctAnswers,
      details: results
    });

    // 2. Cập nhật tiến độ từng từ (Sub-collection progress)
    results.forEach(result => {
      // Từ mới (chưa học bao giờ) mà trả lời sai thì không tính là đã học -> Không lưu vào bảng Progress
      if (result.isNewWord && !result.isCorrect) {
        return; 
      }

      const progRef = doc(firestoreDb, "users", userId, "progress", result.wordId);
      batch.set(progRef, {
        wordId: result.wordId,
        easeFactor: result.newProgress.easeFactor,
        interval: result.newProgress.interval,
        repetitions: result.newProgress.repetitions,
        nextReviewDate: result.newProgress.nextReviewDate,
        lastReviewedAt: new Date().toISOString()
      }, { merge: true }); // Dùng merge để không mất dữ liệu cũ (nếu có)
    });

    // 3. Tự động kiểm tra và hoàn thành 1 Nhiệm vụ (Task) đang pending
    try {
      let completedTaskId = null;
      // Nếu session này được trigger từ 1 task cụ thể (có truyền id qua window)
      if (window.activeTask && window.activeTask.id) {
        completedTaskId = window.activeTask.id;
      } else {
        // Nếu không, tự động quét 1 task cũ nhất để đánh dấu hoàn thành
        const taskQuery = query(collection(firestoreDb, "tasks"), 
              where("studentId", "==", userId),
              where("status", "==", "pending")
              // Không dùng orderBy createdAt vì cần composite index, ta fetch hết rồi sort ở client cho nhanh (thường ít task)
        );
        const taskSnap = await getDocs(taskQuery);
        let pendingTasks = [];
        taskSnap.forEach(taskDoc => pendingTasks.push({id: taskDoc.id, ...taskDoc.data()}));
        
        if (pendingTasks.length > 0) {
          // Sort tay theo createdAt tăng dần (cũ nhất lên đầu)
          pendingTasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          completedTaskId = pendingTasks[0].id;
        }
      }

      if (completedTaskId) {
        batch.update(doc(firestoreDb, "tasks", completedTaskId), {
          status: 'completed',
          completedAt: new Date().toISOString()
        });
        console.log("Đã hoàn thành task:", completedTaskId);
      }
      
      // Clear active task sau khi làm xong
      window.activeTask = null;
    } catch (e) {
      console.warn("Lỗi auto-complete task: ", e);
    }

    // Thực thi Batch
    await batch.commit();
    console.log(`Đã lưu log session ${sessionId} và cập nhật tiến độ ${results.length} từ vựng!`);
    return true;
  } catch (error) {
    console.error("Lỗi khi lưu kết quả session:", error);
    throw error;
  }
}
