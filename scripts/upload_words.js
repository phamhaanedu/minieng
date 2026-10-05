const xlsx = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, writeBatch, doc } = require('firebase/firestore');

// Firebase Config của dự án
const firebaseConfig = {
  apiKey: "AIzaSyCEJ-MiN2G0RD0BHLCYEs0HTPp77Gkgojs",
  authDomain: "minienglishpractice.firebaseapp.com",
  projectId: "minienglishpractice",
  storageBucket: "minienglishpractice.firebasestorage.app",
  messagingSenderId: "1039828966979",
  appId: "1:1039828966979:web:e4941b7f9f04991a627ef6"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadWords() {
  console.log("Đang đọc file Excel...");
  try {
    // Đọc file Excel
    const workbook = xlsx.readFile('./.ref/VocalubaryData3000.xlsx');
    const sheetName = "DanhSach"; // Sheet chứa từ vựng
    
    if (!workbook.Sheets[sheetName]) {
      console.error(`Lỗi: Không tìm thấy sheet tên "${sheetName}" trong file Excel.`);
      return;
    }

    // Chuyển đổi dữ liệu sheet thành mảng JSON
    // header: 1 nghĩa là mảng 2 chiều (array of arrays)
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
    // Bỏ qua dòng tiêu đề (dòng 1)
    const rows = rawData.slice(1).filter(row => row[0] && row[1]); // Lọc bỏ dòng trống
    
    console.log(`Đã tìm thấy ${rows.length} từ vựng hợp lệ. Bắt đầu đẩy lên Firebase...`);

    // Xử lý ghi theo lô (Batch Write) để tối ưu Firebase (mỗi lô max 500 document)
    const BATCH_SIZE = 400;
    let batch = writeBatch(db);
    let count = 0;
    let batchCount = 1;

    for (const row of rows) {
      const englishWord = row[0].toString().trim();
      const vietnameseMeaning = row[1].toString().trim();

      const newDocRef = doc(collection(db, "words"));
      batch.set(newDocRef, {
        english: englishWord,
        vietnamese: vietnameseMeaning,
        createdAt: new Date().toISOString()
      });

      count++;

      // Nếu đủ 400 từ, thực hiện commit batch
      if (count === BATCH_SIZE) {
        console.log(`Đang ghi lô thứ ${batchCount}...`);
        await batch.commit();
        console.log(`Đã lưu ${batchCount * BATCH_SIZE} từ.`);
        
        // Tạo lô mới
        batch = writeBatch(db);
        count = 0;
        batchCount++;
      }
    }

    // Commit những từ còn sót lại cuối cùng
    if (count > 0) {
      await batch.commit();
      console.log(`Đã lưu lô cuối cùng.`);
    }

    // Cập nhật version data (Để Client biết mà load lại cache IndexedDB)
    const versionRef = doc(db, "app_config", "system");
    await writeBatch(db).set(versionRef, { data_version: 1 }, { merge: true }).commit();
    console.log("Đã cập nhật data_version = 1");

    console.log("🎉 Hoàn tất việc đẩy toàn bộ từ vựng lên Firebase!");
    process.exit(0);
    
  } catch (error) {
    console.error("Lỗi trong quá trình xử lý:", error);
    process.exit(1);
  }
}

uploadWords();
