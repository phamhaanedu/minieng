import { getCurrentUser } from './auth.js';
import { db as firestoreDb } from './firebase-config.js';
import { getActiveStreak } from './db.js';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where, increment } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

/**
 * Render giao diện Quản lý (Management)
 */
export async function renderManagement() {
  const viewManagement = document.getElementById('view-management');
  const user = getCurrentUser();
  const roleElNode = document.querySelector('.user-role-class');
  const roleEl = roleElNode ? roleElNode.textContent.toLowerCase() : 'child';

  if (!user || roleEl === 'child') {
    viewManagement.innerHTML = `
      <div class="card text-center">
        <h2>Khu vực cấm</h2>
        <p class="text-danger mt-sm">Bạn không có quyền truy cập trang này.</p>
      </div>
    `;
    return;
  }

  // HTML Khung sườn Accordion cho Management (Danh Sách Học Sinh)
  viewManagement.innerHTML = `
    <h2 style="margin-bottom: var(--spacing-lg);">Bảng Điều Khiển Quản Trị</h2>
    
    <!-- Accordion: Quản lý Học sinh -->
    <div class="card">
      <div class="accordion-header" style="cursor: pointer; display: flex; justify-content: space-between;" onclick="this.nextElementSibling.classList.toggle('hidden')">
        <h3 style="margin: 0;">👨‍🎓 Danh Sách Học Sinh (Tasks & Reports)</h3>
        <span>▼</span>
      </div>
      <div class="accordion-content" style="margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-md);">
        
        <!-- Bảng Responsive (Data Grid) -->
        <div class="data-grid" id="students-grid">
          <p class="text-muted">Đang tải danh sách học sinh...</p>
        </div>

      </div>
    </div>
  `;

  // Render phần Cài đặt nâng cao (Admin/Teacher/Parent) vào trang Cài đặt (Settings)
  const adminSettingsContainer = document.getElementById('admin-settings-container');
  if (adminSettingsContainer) {
    adminSettingsContainer.innerHTML = `
      ${roleEl === 'admin' ? `
      <!-- Accordion: Cấu hình hệ thống (Admin only) -->
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <div class="accordion-header" style="cursor: pointer; display: flex; justify-content: space-between;" onclick="this.nextElementSibling.classList.toggle('hidden')">
          <h3 style="margin: 0;">⚙ Cấu Hình Hệ Thống</h3>
          <span>▼</span>
        </div>
        <div class="accordion-content hidden" style="margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-md);">
          <p class="text-muted" style="margin-bottom: var(--spacing-sm);">Điều chỉnh tỷ lệ xuất hiện của các loại câu hỏi và từ vựng.</p>
          <div style="display: flex; gap: var(--spacing-sm); align-items: center; margin-bottom: var(--spacing-md);">
            <label style="flex: 1;">Tỷ lệ Ôn tập (Due Words) / Từ mới (New Words):</label>
            <select id="config-ratio" class="form-input" style="padding: var(--spacing-sm); width: 150px;">
              <option value="80">80% / 20%</option>
              <option value="70">70% / 30%</option>
              <option value="60">60% / 40%</option>
              <option value="50">50% / 50%</option>
            </select>
          </div>
          <button id="btn-save-config" class="btn btn-primary">Lưu Cấu Hình</button>
          <p id="config-status" class="text-success hidden mt-sm"></p>
        </div>
      </div>
      ` : ''}

      ${(roleEl === 'admin' || roleEl === 'teacher') ? `
      <!-- Accordion: Quản lý từ vựng -->
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <div class="accordion-header" style="cursor: pointer; display: flex; justify-content: space-between;" onclick="this.nextElementSibling.classList.toggle('hidden')">
          <h3 style="margin: 0;">📚 Quản Lý Từ Vựng</h3>
          <span>▼</span>
        </div>
        <div class="accordion-content hidden" style="margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-md);">
          <h4 style="margin-bottom: var(--spacing-sm);">Thêm Từ Mới</h4>
          <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
            <input type="text" id="new-word-en" class="form-input" placeholder="Tiếng Anh (VD: apple)" style="flex: 1; padding: var(--spacing-sm);">
            <input type="text" id="new-word-vn" class="form-input" placeholder="Tiếng Việt (VD: quả táo)" style="flex: 1; padding: var(--spacing-sm);">
            <button id="btn-add-word" class="btn btn-primary">Thêm</button>
          </div>
          <p id="add-word-status" class="text-success hidden" style="margin-bottom: var(--spacing-md);"></p>
          
          <h4 style="margin-bottom: var(--spacing-sm); padding-top: var(--spacing-sm); border-top: 1px solid var(--color-border);">Tra Cứu & Chỉnh Sửa</h4>
          <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
            <input type="text" id="search-word-input" class="form-input" placeholder="Nhập từ tiếng Anh để tìm..." style="flex: 1; padding: var(--spacing-sm);">
            <button id="btn-search-word" class="btn btn-outline">Tìm Kiếm</button>
          </div>
          <div id="search-word-results" style="max-height: 200px; overflow-y: auto; background: var(--color-background); border-radius: var(--border-radius-sm);"></div>
        </div>
      </div>
      ` : ''}

      ${(roleEl === 'parent' || roleEl === 'teacher' || roleEl === 'admin') ? `
      <!-- Accordion: Liên kết học sinh -->
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <div class="accordion-header" style="cursor: pointer; display: flex; justify-content: space-between;" onclick="this.nextElementSibling.classList.toggle('hidden')">
          <h3 style="margin: 0;">🔗 Liên Kết Tài Khoản Học Sinh</h3>
          <span>▼</span>
        </div>
        <div class="accordion-content hidden" style="margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-md);">
          <p class="text-muted" style="margin-bottom: var(--spacing-sm);">Nhập Email của học sinh (con) để gửi yêu cầu liên kết. Học sinh cần đăng nhập để xác nhận yêu cầu này.</p>
          
          <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
            <input type="email" id="link-student-email" class="form-input" placeholder="Email học sinh (VD: con@gmail.com)" style="flex: 1; padding: var(--spacing-sm);">
            <button id="btn-link-student" class="btn btn-primary">Gửi Yêu Cầu</button>
          </div>
        </div>
      </div>
      ` : ''}
    `;
  }

  // Gắn sự kiện cho form Thêm từ vựng (Task 3.2)
  const btnAddWord = document.getElementById('btn-add-word');
  if (btnAddWord) {
    btnAddWord.addEventListener('click', async () => {
      const en = document.getElementById('new-word-en').value.trim();
      const vn = document.getElementById('new-word-vn').value.trim();
      if (!en || !vn) {
        window.showCustomAlert("Vui lòng điền đủ Tiếng Anh và Tiếng Việt!", 'error');
        return;
      }
      
      btnAddWord.disabled = true;
      btnAddWord.textContent = "Đang thêm...";
      
      try {
        // Lưu từ vựng mới
        await addDoc(collection(firestoreDb, "words"), {
          english: en,
          vietnamese: vn,
          createdAt: new Date().toISOString(),
          createdBy: user.uid
        });

        // Tăng data_version để kích hoạt đồng bộ (trigger app cache)
        const versionRef = doc(firestoreDb, "app_config", "system");
        const vSnap = await getDoc(versionRef);
        let newVersion = 2;
        if(vSnap.exists() && vSnap.data().data_version) {
           newVersion = vSnap.data().data_version + 1;
        }
        await setDoc(versionRef, { data_version: newVersion }, { merge: true });

        // Cập nhật giao diện
        document.getElementById('new-word-en').value = '';
        document.getElementById('new-word-vn').value = '';
        const statusEl = document.getElementById('add-word-status');
        statusEl.textContent = `Đã thêm từ "${en}" và cập nhật hệ thống!`;
        statusEl.classList.remove('hidden');

      } catch (error) {
        window.showCustomAlert("Lỗi khi thêm từ: " + error.message, 'error');
      } finally {
        btnAddWord.disabled = false;
        btnAddWord.textContent = "Thêm Từ";
      }
    });
  }

  // Gắn sự kiện Tìm kiếm Từ Vựng (Task 3.2)
  const btnSearchWord = document.getElementById('btn-search-word');
  if (btnSearchWord) {
    btnSearchWord.addEventListener('click', async () => {
      const qText = document.getElementById('search-word-input').value.trim().toLowerCase();
      if (!qText) return;
      
      const resultsDiv = document.getElementById('search-word-results');
      resultsDiv.innerHTML = '<p style="padding: 8px;">Đang tìm...</p>';
      
      try {
        const wordsRef = collection(firestoreDb, "words");
        const snap = await getDocs(wordsRef);
        let matches = [];
        snap.forEach(doc => {
          const data = doc.data();
          if ((data.english && data.english.toLowerCase().includes(qText)) || 
              (data.vietnamese && data.vietnamese.toLowerCase().includes(qText))) {
            matches.push({ id: doc.id, ...data });
          }
        });
        
        if (matches.length === 0) {
          resultsDiv.innerHTML = '<p style="padding: 8px; color: var(--color-text-light);">Không tìm thấy từ nào.</p>';
          return;
        }
        
        let html = '<table style="width:100%; border-collapse: collapse;">';
        matches.forEach(w => {
          html += `
            <tr style="border-bottom: 1px solid var(--color-border);" id="row-${w.id}">
              <td style="padding: 8px;"><strong>${w.english}</strong><br><span style="font-size:0.85rem; color: var(--color-text-light);">${w.vietnamese}</span></td>
              <td style="padding: 8px; text-align: right;">
                <button class="btn btn-outline" style="padding: 4px; font-size: 0.8rem;" onclick="window.appEditWord('${w.id}', '${w.english.replace(/'/g, "\\'")}', '${w.vietnamese.replace(/'/g, "\\'")}')">Sửa</button>
                <button class="btn btn-outline" style="padding: 4px; font-size: 0.8rem; color: var(--color-danger); border-color: var(--color-danger);" onclick="window.appDeleteWord('${w.id}')">Xóa</button>
              </td>
            </tr>
          `;
        });
        html += '</table>';
        resultsDiv.innerHTML = html;
      } catch (err) {
        resultsDiv.innerHTML = `<p style="padding: 8px; color: var(--color-danger);">Lỗi: ${err.message}</p>`;
      }
    });
  }

  // Global functions for Edit and Delete Words
  window.appEditWord = async function(id, en, vn) {
    const newEn = prompt("Sửa Tiếng Anh:", en);
    if (newEn === null) return;
    const newVn = prompt("Sửa Tiếng Việt:", vn);
    if (newVn === null) return;

    if (!newEn.trim() || !newVn.trim()) {
      window.showCustomAlert("Từ vựng không được để trống!", "error");
      return;
    }

    try {
      await updateDoc(doc(firestoreDb, "words", id), {
        english: newEn.trim(),
        vietnamese: newVn.trim()
      });
      // Tăng version để force client reload
      const versionRef = doc(firestoreDb, "app_config", "system");
      await setDoc(versionRef, { data_version: increment(1) }, { merge: true });
      
      window.showCustomAlert("Đã cập nhật từ vựng thành công!", "success");
      const btnSearch = document.getElementById('btn-search-word');
      if (btnSearch) btnSearch.click(); // reload search
    } catch (e) {
      window.showCustomAlert("Lỗi sửa từ: " + e.message, "error");
    }
  };

  window.appDeleteWord = async function(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa từ này không? Hành động không thể hoàn tác.")) return;
    try {
      await deleteDoc(doc(firestoreDb, "words", id));
      // Tăng version để force client reload
      const versionRef = doc(firestoreDb, "app_config", "system");
      await setDoc(versionRef, { data_version: increment(1) }, { merge: true });

      window.showCustomAlert("Đã xóa từ vựng!", "success");
      const btnSearch = document.getElementById('btn-search-word');
      if (btnSearch) btnSearch.click(); // reload search
    } catch (e) {
      window.showCustomAlert("Lỗi xóa từ: " + e.message, "error");
    }
  };

  // Gắn sự kiện cho Cấu hình hệ thống (Admin)
  const btnSaveConfig = document.getElementById('btn-save-config');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      const ratio = parseInt(document.getElementById('config-ratio').value, 10);
      btnSaveConfig.disabled = true;
      btnSaveConfig.textContent = "Đang lưu...";
      
      try {
        const configRef = doc(firestoreDb, "app_config", "system");
        await setDoc(configRef, { 
          reviewRatio: ratio,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const statusEl = document.getElementById('config-status');
        statusEl.textContent = "Lưu cấu hình thành công!";
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
      } catch (error) {
        window.showCustomAlert("Lỗi khi lưu cấu hình: " + error.message, 'error');
      } finally {
        btnSaveConfig.disabled = false;
        btnSaveConfig.textContent = "Lưu Cấu Hình";
      }
    });
  }

  // Gắn sự kiện Liên kết học sinh
  const btnLinkStudent = document.getElementById('btn-link-student');
  if (btnLinkStudent) {
    btnLinkStudent.addEventListener('click', async () => {
      const email = document.getElementById('link-student-email').value.trim();
      if (!email) {
        window.showCustomAlert("Vui lòng nhập Email học sinh!", 'error');
        return;
      }
      
      btnLinkStudent.disabled = true;
      btnLinkStudent.textContent = "Đang gửi...";
      
      try {
        // Tìm user theo email (chỉ tìm tài khoản child)
        const usersRef = collection(firestoreDb, "users");
        const q = query(usersRef, where("email", "==", email), where("role", "==", "child"));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          window.showCustomAlert("Không tìm thấy tài khoản Học sinh (Child) nào với Email này!", 'error');
        } else {
          const childDoc = snapshot.docs[0];
          const childData = childDoc.data();
          
          if (childData.manager_id) {
            window.showCustomAlert("Tài khoản này đã được quản lý bởi một người khác. Không thể gửi yêu cầu!", 'error');
            return;
          }
          
          // Kiểm tra xem đã có request nào pending chưa
          const reqQuery = query(collection(firestoreDb, "link_requests"), 
            where("targetId", "==", childDoc.id),
            where("requesterId", "==", user.uid),
            where("status", "==", "pending")
          );
          const reqSnap = await getDocs(reqQuery);
          
          if (!reqSnap.empty) {
            window.showCustomAlert("Bạn đã gửi yêu cầu liên kết cho tài khoản này rồi, đang chờ xác nhận!", 'warning');
          } else {
            // Tạo request liên kết
            await addDoc(collection(firestoreDb, "link_requests"), {
              requesterId: user.uid,
              requesterName: user.displayName || user.email,
              requesterRole: roleEl,
              targetEmail: email,
              targetId: childDoc.id,
              status: 'pending',
              createdAt: new Date().toISOString()
            });
            
            window.showCustomAlert("Đã gửi yêu cầu liên kết! Chờ học sinh đăng nhập để xác nhận.", 'success');
            document.getElementById('link-student-email').value = '';
          }
        }
      } catch (error) {
        window.showCustomAlert("Lỗi khi gửi yêu cầu: " + error.message, 'error');
      } finally {
        btnLinkStudent.disabled = false;
        btnLinkStudent.textContent = "Gửi Yêu Cầu";
      }
    });
  }

  // Load danh sách học sinh (Task 3.3 & 3.4)
  loadStudentsGrid();
}

async function loadStudentsGrid() {
  const gridContainer = document.getElementById('students-grid');
  const user = getCurrentUser();
  const roleElNode = document.querySelector('.user-role-class');
  const role = roleElNode ? roleElNode.textContent.toLowerCase() : 'child';

  try {
    const usersRef = collection(firestoreDb, "users");
    let q;

    if (role === 'admin') {
      // Admin xem tất cả học sinh
      q = query(usersRef, where("role", "==", "child"));
    } else if (role === 'parent' || role === 'teacher') {
      // Parent/Teacher có quyền ngang nhau, chỉ 1 manager duy nhất
      q = query(usersRef, where("manager_id", "==", user.uid));
    } else {
      throw new Error("Không đủ quyền truy cập bảng điều khiển");
    }

    const snapshot = await getDocs(q);
    const students = [];
    snapshot.forEach(doc => {
      students.push({ id: doc.id, ...doc.data() });
    });

    if (students.length === 0) {
      gridContainer.innerHTML = `<p class="text-muted">Chưa có học sinh nào trong danh sách quản lý của bạn.</p>`;
      return;
    }

    let html = `
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border);">
            <th style="padding: var(--spacing-sm);">Học Sinh</th>
            <th style="padding: var(--spacing-sm);">Chuỗi (Streak)</th>
            <th style="padding: var(--spacing-sm);">Tổng Điểm</th>
            <th style="padding: var(--spacing-sm);">Bài Tập</th>
            <th style="padding: var(--spacing-sm);">Trạng Thái</th>
            <th style="padding: var(--spacing-sm);">Hành Động</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let st of students) {
      const name = st.displayName || st.email || 'Vô Danh';
      const streak = getActiveStreak(st.last_study_date, st.streak);
      const points = st.total_points || 0;
      const status = streak > 0 ? 'ACTIVE' : 'WARNING';
      const statusBadge = status === 'ACTIVE' ? 'badge-success' : 'badge-warning';

      let pendingCount = 0;
      try {
        const taskQ = query(collection(firestoreDb, "tasks"), 
          where("studentId", "==", st.id),
          where("status", "==", "pending")
        );
        const taskSnap = await getDocs(taskQ);
        pendingCount = taskSnap.size;
      } catch (e) {
        console.warn("Lỗi đếm task:", e);
      }

      let pendingBadge = pendingCount > 0 
        ? `<span class="badge badge-warning" style="font-size: 0.85rem;">${pendingCount} bài chờ</span>`
        : `<span class="text-muted" style="font-size: 0.85rem;">Đã xong</span>`;

      html += `
        <tr style="border-bottom: 1px solid var(--color-border);">
          <td style="padding: var(--spacing-sm);" data-label="Học Sinh">${name}</td>
          <td style="padding: var(--spacing-sm);" data-label="Chuỗi">🔥 ${streak} ngày</td>
          <td style="padding: var(--spacing-sm);" data-label="Tổng Điểm">⭐ ${points} điểm</td>
          <td style="padding: var(--spacing-sm);" data-label="Bài Tập">${pendingBadge}</td>
          <td style="padding: var(--spacing-sm);" data-label="Trạng Thái">
            <span class="badge ${statusBadge}">${status}</span>
          </td>
          <td style="padding: var(--spacing-sm);" data-label="Hành Động">
            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.9rem;" onclick="window.appAssignTask('${st.id}', '${name}')">Giao Bài</button>
            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.9rem;" onclick="window.appViewReport('${st.id}', '${name}')">Báo Cáo</button>
            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.9rem; color: var(--color-danger); border-color: var(--color-danger);" onclick="window.appUnlinkStudent('${st.id}', '${name}')">Hủy Liên Kết</button>
          </td>
        </tr>
      `;
    }

    html += `</tbody></table>`;
    gridContainer.innerHTML = html;

  } catch (error) {
    gridContainer.innerHTML = `<p class="text-danger">Lỗi tải danh sách: ${error.message}</p>`;
  }
}

// Hàm giao bài (Global function để gọi từ HTML nội tuyến)
window.appAssignTask = function(studentId, studentName) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-alert-overlay'; 
  overlay.style.display = 'flex';
  
  overlay.innerHTML = `
    <div class="custom-alert-box" style="text-align: left;">
      <h3 style="margin-bottom: var(--spacing-sm);">Giao bài cho ${studentName}</h3>
      <p class="text-muted" style="margin-bottom: var(--spacing-md);">Chọn loại bài tập bạn muốn giao (có thể bấm nhiều lần để giao nhiều bài):</p>
      
      <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
        <button class="btn btn-primary btn-assign-type" data-type="new_words">Giao học thêm từ mới</button>
        <button class="btn btn-outline btn-assign-type" data-type="review_words">Giao ôn lại từ cũ</button>
      </div>
      
      <div style="text-align: right; margin-top: var(--spacing-md);">
        <button class="btn btn-outline btn-close-modal">Đóng</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.btn-close-modal').addEventListener('click', () => {
    overlay.remove();
  });

  const user = getCurrentUser();

  overlay.querySelectorAll('.btn-assign-type').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-type');
      const title = type === 'new_words' ? 'Học thêm từ mới' : 'Ôn tập từ vựng cũ';
      
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "Đang giao...";
      
      try {
        await addDoc(collection(firestoreDb, "tasks"), {
          studentId: studentId,
          assignedBy: user.uid,
          title: title,
          taskType: type, // 'new_words' hoặc 'review_words'
          status: 'pending', 
          createdAt: new Date().toISOString()
        });
        
        // Show success mini alert
        const successEl = document.createElement('div');
        successEl.style.cssText = "color: var(--color-success); font-size: 0.9rem; margin-top: 8px; text-align: center;";
        successEl.textContent = `Đã giao 1 bài "${title}"!`;
        btn.parentElement.appendChild(successEl);
        
        setTimeout(() => successEl.remove(), 2000);
      } catch (error) {
        alert(`Lỗi giao bài: ${error.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
};

// Hàm Xem Báo Cáo Học Sinh
window.appViewReport = async function(studentId, studentName) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-alert-overlay'; 
  overlay.style.display = 'flex';
  
  overlay.innerHTML = `
    <div class="custom-alert-box" style="text-align: left; min-width: 300px;">
      <h3 style="margin-bottom: var(--spacing-sm);">📊 Báo cáo: ${studentName}</h3>
      <p class="text-muted" style="margin-bottom: var(--spacing-md);" id="report-loading">Đang tải dữ liệu...</p>
      
      <div id="report-content" class="hidden" style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
        <div style="background: var(--color-background); padding: var(--spacing-sm); border-radius: var(--border-radius-sm);">
          <strong>⭐ Tổng điểm:</strong> <span id="report-points">...</span>
        </div>
        <div style="background: var(--color-background); padding: var(--spacing-sm); border-radius: var(--border-radius-sm);">
          <strong>🔥 Chuỗi (Streak):</strong> <span id="report-streak">...</span> ngày
        </div>
        <div style="background: var(--color-background); padding: var(--spacing-sm); border-radius: var(--border-radius-sm);">
          <strong>📚 Từ đã học:</strong> <span id="report-learned">...</span> từ
        </div>
        <div style="background: var(--color-background); padding: var(--spacing-sm); border-radius: var(--border-radius-sm);">
          <strong>⏰ Từ cần ôn tập:</strong> <span id="report-due" style="color: var(--color-danger); font-weight: bold;">...</span> từ
        </div>
      </div>
      
      <div style="text-align: right; margin-top: var(--spacing-md);">
        <button class="btn btn-primary btn-close-modal">Đóng</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.btn-close-modal').addEventListener('click', () => {
    overlay.remove();
  });

  try {
    // Import dynamically just in case, but we already have functions
    // Note: We need getUserProgress, getUserStats, getActiveStreak.
    // They are exported in db.js, we can import them.
    // Since this is a global function inside a module, we can just use the imported functions at the top of management.js
    const { getUserProgress, getUserStats, getActiveStreak } = await import('./db.js');
    const { isDueForReview } = await import('./srs.js');
    
    // Fetch user doc to get last_study_date and streak base
    const userDocSnap = await getDoc(doc(firestoreDb, "users", studentId));
    let baseStreak = 0;
    let lastStudyDate = null;
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      baseStreak = data.streak || 0;
      lastStudyDate = data.last_study_date || null;
    }

    const stats = await getUserStats(studentId);
    const streak = getActiveStreak(lastStudyDate, baseStreak);
    const progressMap = await getUserProgress(studentId);
    
    const totalLearned = Object.keys(progressMap).length;
    let dueCount = 0;
    Object.values(progressMap).forEach(prog => {
      if (isDueForReview(prog.nextReviewDate)) {
        dueCount++;
      }
    });

    // Cập nhật giao diện
    overlay.querySelector('#report-loading').classList.add('hidden');
    overlay.querySelector('#report-content').classList.remove('hidden');
    
    overlay.querySelector('#report-points').textContent = stats.totalPoints;
    overlay.querySelector('#report-streak').textContent = streak;
    overlay.querySelector('#report-learned').textContent = totalLearned;
    overlay.querySelector('#report-due').textContent = dueCount;
    
  } catch (error) {
    overlay.querySelector('#report-loading').textContent = "Lỗi khi tải báo cáo: " + error.message;
    overlay.querySelector('#report-loading').classList.remove('text-muted');
    overlay.querySelector('#report-loading').style.color = "var(--color-danger)";
  }
};

// Hàm Hủy Liên Kết Học Sinh
window.appUnlinkStudent = async function(studentId, studentName) {
  if (!confirm(`Bạn có chắc chắn muốn hủy liên kết với học sinh ${studentName}? Học sinh này sẽ trở thành tự do.`)) return;
  
  try {
    const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { db: firestoreDb } = await import('./firebase-config.js');
    await updateDoc(doc(firestoreDb, "users", studentId), {
      manager_id: null
    });
    window.showCustomAlert(`Đã hủy liên kết với ${studentName}`, "success");
    
    // Refresh lại grid bằng cách click lại vào menu quản lý học sinh
    document.getElementById('nav-management')?.click();
  } catch (error) {
    window.showCustomAlert("Lỗi khi hủy liên kết: " + error.message, "error");
  }
};
