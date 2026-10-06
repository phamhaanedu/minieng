import { getCurrentUser } from './auth.js';
import { getUserProgress, getUserStats, getActiveStreak } from './db.js';
import { isDueForReview } from './srs.js';
import { db as firestoreDb } from './firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { renderManagement } from './management.js';

/**
 * Render Dashboard content based on user role and progress
 */
export async function renderDashboard() {
  const viewDashboard = document.getElementById('view-dashboard');
  const user = getCurrentUser();

  if (!user) {
    viewDashboard.innerHTML = `
      <div class="card text-center" style="max-width: 400px; margin: 0 auto; margin-top: var(--spacing-xl);">
        <h2 style="margin-bottom: var(--spacing-md);">Chào mừng bạn đến với EngLingo!</h2>
        <p class="text-muted" style="margin-bottom: var(--spacing-lg);">Vui lòng đăng nhập để lưu trữ tiến trình học tập của bạn.</p>
        <button id="btn-dashboard-to-login" class="btn btn-primary">Đăng Nhập Ngay</button>
      </div>
    `;

    document.getElementById('btn-dashboard-to-login').addEventListener('click', () => {
      // Tìm app.js navigateTo func bằng cách click giả lập vào một nav ẩn hoặc trigger event
      // Hoặc gọi click trực tiếp lên logo/link nếu cần, nhưng đơn giản nhất là click thủ công:
      document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
        section.classList.add('hidden');
      });
      const viewLogin = document.getElementById('view-login');
      if (viewLogin) {
        viewLogin.classList.remove('hidden');
        viewLogin.classList.add('active');
      }
    });
    return;
  }

  viewDashboard.innerHTML = `<div class="card text-center"><p>Đang tải dữ liệu tiến độ...</p></div>`;

  try {
    const progressMap = await getUserProgress(user.uid);
    const userStats = await getUserStats(user.uid);
    const progressKeys = Object.keys(progressMap);
    
    let totalLearned = progressKeys.length;
    let dueCount = 0;
    
    let activeStreak = 0;
    let totalPoints = 0;
    if (userStats) {
       activeStreak = getActiveStreak(userStats.last_study_date, userStats.streak);
       totalPoints = userStats.total_points || 0;
    }
    
    progressKeys.forEach(wordId => {
      const p = progressMap[wordId];
      if (isDueForReview(p.nextReviewDate)) {
        dueCount++;
      }
    });

    const masteryPercent = totalLearned > 0 ? Math.min(100, Math.round((totalLearned / 3000) * 100)) : 0;
    
    // Semantic Colors based on dueCount
    let dueBadgeColor = 'var(--color-success)'; // Xanh nếu ít bài tập
    if (dueCount > 20) dueBadgeColor = 'var(--color-warning)'; // Vàng nếu hơi nhiều
    if (dueCount > 50) dueBadgeColor = 'var(--color-danger)'; // Đỏ nếu nợ nhiều bài

    // Đọc role (Child hay Admin/Teacher/Parent)
    const roleBadge = document.querySelector('.user-role-class');
    const roleEl = roleBadge ? roleBadge.textContent.toLowerCase() : '';

    // Fetch Link Requests (nếu là Child)
    let pendingRequestsHtml = '';
    if (roleEl === 'child' || !roleEl) {
      try {
        const reqQuery = query(collection(firestoreDb, "link_requests"), 
            where("targetId", "==", user.uid),
            where("status", "==", "pending")
        );
        const reqSnap = await getDocs(reqQuery);
        
        reqSnap.forEach(requestDoc => {
          const req = requestDoc.data();
          const roleName = req.requesterRole === 'parent' ? 'Phụ huynh' : 'Giáo viên';
          pendingRequestsHtml += `
            <div class="card" style="margin-bottom: var(--spacing-lg); border-left: 4px solid var(--color-warning);">
              <h3 style="margin-bottom: var(--spacing-sm);">🔔 Yêu cầu liên kết tài khoản</h3>
              <p>Tài khoản <strong>${req.requesterName}</strong> muốn liên kết với bạn dưới vai trò <strong>${roleName}</strong>.</p>
              <div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm);">
                <button class="btn btn-primary btn-accept-link" data-id="${requestDoc.id}" data-role="${req.requesterRole}" data-reqid="${req.requesterId}">Đồng ý</button>
                <button class="btn btn-outline btn-reject-link" data-id="${requestDoc.id}">Từ chối</button>
              </div>
            </div>
          `;
        });
      } catch(e) {
        console.error("Lỗi lấy requests liên kết:", e);
      }

      // Fetch Assigned Tasks (Nhiệm vụ được giao)
      try {
        const taskQuery = query(collection(firestoreDb, "tasks"), 
            where("studentId", "==", user.uid),
            where("status", "==", "pending")
        );
        const taskSnap = await getDocs(taskQuery);
        
        window.appPendingTasks = []; // Clear old state
        taskSnap.forEach(taskDoc => {
          window.appPendingTasks.push({ id: taskDoc.id, ...taskDoc.data() });
        });
      } catch(e) {
        console.error("Lỗi lấy nhiệm vụ:", e);
      }
    }

    const pendingTasksCount = window.appPendingTasks ? window.appPendingTasks.length : 0;

    let html = pendingRequestsHtml + `
      <div class="card" style="margin-bottom: var(--spacing-lg); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-md);">
        <div>
          <h2 style="margin-bottom: var(--spacing-sm);">👋 Xin chào, ${user.displayName || user.email}!</h2>
          <p class="text-muted">Hôm nay bạn muốn học gì?</p>
        </div>
        <div style="display: flex; gap: var(--spacing-md); text-align: center;">
          <div style="background: var(--color-background); padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--border-radius-md); border: 1px solid var(--color-border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 1.5rem; margin-bottom: 4px;">🔥</div>
            <div style="font-weight: 700; color: var(--color-text-main);">${activeStreak}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-light); text-transform: uppercase; font-weight: 600;">Streak</div>
          </div>
          <div style="background: var(--color-background); padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--border-radius-md); border: 1px solid var(--color-border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 1.5rem; margin-bottom: 4px;">⭐</div>
            <div style="font-weight: 700; color: var(--color-warning);">${totalPoints}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-light); text-transform: uppercase; font-weight: 600;">Points</div>
          </div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
        <div class="card text-center">
          <h3 class="text-muted" style="font-size: 1rem; margin-bottom: var(--spacing-sm);">Tổng từ vựng đã học</h3>
          <h1 style="font-size: 2.5rem; color: var(--color-primary);">${totalLearned} <span style="font-size: 1rem; color: var(--color-text-light);">/ ~3000</span></h1>
          <div class="health-bar-container mt-sm" style="height: 6px;">
            <div class="health-bar-fill" style="width: ${masteryPercent}%; background: var(--color-primary);"></div>
          </div>
        </div>
        
        <div class="card text-center">
          <h3 class="text-muted" style="font-size: 1rem; margin-bottom: var(--spacing-sm);">Từ cần ôn tập ngay</h3>
          <h1 style="font-size: 2.5rem; color: ${dueBadgeColor};">${dueCount}</h1>
          <span class="badge" style="background: ${dueBadgeColor}; color: white; margin-top: var(--spacing-sm);">Đến hạn</span>
        </div>
        
        ${pendingTasksCount > 0 ? `
        <div class="card text-center" style="cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); border-color: var(--color-danger);" onclick="window.startTaskSession()">
          <h3 class="text-muted" style="font-size: 1rem; margin-bottom: var(--spacing-sm);">Nhiệm vụ được giao</h3>
          <h1 style="font-size: 2.5rem; color: var(--color-danger);">${pendingTasksCount}</h1>
          <span class="badge" style="background: var(--color-danger); color: white; margin-top: var(--spacing-sm); cursor: pointer;">Chưa làm!</span>
        </div>
        ` : ''}
      </div>

      <div class="text-center" style="margin-bottom: var(--spacing-xl);">
        <button id="btn-start-learning-dashboard" class="btn btn-primary btn-large" style="padding: 16px 32px; font-size: 1.25rem; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);">🚀 Bắt Đầu Bài Học Ngay</button>
      </div>
    `;

    if (roleEl === 'admin' || roleEl === 'teacher' || roleEl === 'parent') {
      html += `
        <div id="dashboard-management-container"></div>
      `;
    }

    viewDashboard.innerHTML = html;

    // Bắt sự kiện Start Learning
    const btnStart = document.getElementById('btn-start-learning-dashboard');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        const btnRealStart = document.querySelector('#view-learn .btn-primary');
        if (btnRealStart) {
          // Kích hoạt nút bên view-learn (đã được bind trong app.js gọi startLearningSession)
          // Và đồng thời ẩn dashboard, hiện view-learn
          document.querySelectorAll('.view-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
          });
          const viewLearn = document.getElementById('view-learn');
          viewLearn.classList.remove('hidden');
          viewLearn.classList.add('active');
          
          btnRealStart.click();
        }
      });
    }

    // Logic xử lý Đồng ý/Từ chối liên kết
    document.querySelectorAll('.btn-accept-link').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const reqId = e.target.getAttribute('data-id');
        const reqRole = e.target.getAttribute('data-role'); // parent or teacher
        const parentOrTeacherId = e.target.getAttribute('data-reqid');
        
        btn.disabled = true;
        try {
          // 1. Cập nhật Child user profile (Chỉ 1 manager duy nhất)
          const userRef = doc(firestoreDb, "users", user.uid);
          await updateDoc(userRef, {
            manager_id: parentOrTeacherId
          });
          
          // 2. Cập nhật Request status
          const reqRef = doc(firestoreDb, "link_requests", reqId);
          await updateDoc(reqRef, { status: 'accepted' });
          
          window.showCustomAlert("Liên kết tài khoản thành công!", "success");
          renderDashboard(); // Re-render to clear notification
        } catch(err) {
          window.showCustomAlert("Lỗi khi đồng ý: " + err.message, "error");
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.btn-reject-link').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const reqId = e.target.getAttribute('data-id');
        btn.disabled = true;
        try {
          const reqRef = doc(firestoreDb, "link_requests", reqId);
          await updateDoc(reqRef, { status: 'rejected' });
          window.showCustomAlert("Đã từ chối yêu cầu liên kết.", "success");
          renderDashboard();
        } catch(err) {
          window.showCustomAlert("Lỗi khi từ chối: " + err.message, "error");
          btn.disabled = false;
        }
      });
    });

    // Logic xử lý Đồng ý/Từ chối liên kết
    // (Phần Complete Task cũ bằng tay đã được gỡ bỏ vì chuyển qua tự động ở Backend db.js)
    
    window.startTaskSession = function() {
      if (!window.appPendingTasks || window.appPendingTasks.length === 0) return;
      
      // Sắp xếp các task theo thời gian tạo (cũ nhất lên trước)
      window.appPendingTasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Chọn task cũ nhất để thực thi
      window.activeTask = window.appPendingTasks[0];
      
      // Kích hoạt nút start
      const btnStart = document.getElementById('btn-start-learning-dashboard');
      if (btnStart) btnStart.click();
    };

    // Render Data Grid Quản lý
    if (roleEl === 'admin' || roleEl === 'teacher' || roleEl === 'parent') {
      renderManagement('dashboard-management-container');
    }

  } catch (error) {
    viewDashboard.innerHTML = `
      <div class="card text-center">
        <p class="text-danger">Lỗi khi tải dữ liệu: ${error.message}</p>
      </div>
    `;
  }
}
