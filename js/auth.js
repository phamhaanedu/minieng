import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { syncMasterData } from './db.js';
import { renderDashboard } from './dashboard.js';
import { initSettings } from './settings.js';

// DOM Elements
const userProfiles = document.querySelectorAll('.user-profile-class');
const userNameEls = document.querySelectorAll('.user-name-class');
const userRoleEls = document.querySelectorAll('.user-role-class');
const logoutBtns = document.querySelectorAll('.logout-btn-class');
const btnLoginGoogle = document.getElementById('btn-login-google');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');

// State
let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

// Initialize Auth Module
export function initAuth(navigateTo) {
  // Listen for Auth State Changes
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("User logged in:", user.uid);
      currentUser = user;
      
      // Load user role from Firestore
      const userRole = await ensureUserDocument(user);
      
      // Update UI
      userProfiles.forEach(el => el.classList.remove('hidden'));
      if (mobileMenuBtn) mobileMenuBtn.classList.remove('hidden');
      userNameEls.forEach(el => el.textContent = user.displayName || user.email);
      
      // Update Role Badge
      userRoleEls.forEach(el => {
        el.textContent = userRole.toUpperCase();
        el.className = 'user-role-class badge badge-success';
        el.style.display = 'inline-block';
      });
      
      // Handle Role-based UI visibility
      updateRoleUI(userRole);

      // Trigger master data sync
      // Do not await this, let it run in background so UI doesn't block
      syncMasterData();
      
      // Khởi tạo Settings (đọc từ LocalStorage hoặc Firebase)
      await initSettings();
      
      // Navigate to Dashboard if currently on Login view
      const activeView = document.querySelector('.view-section.active');
      if (activeView && activeView.id === 'view-login') {
        navigateTo('dashboard');
      } else if (activeView && activeView.id === 'view-dashboard') {
        renderDashboard();
      }

    } else {
      console.log("User logged out");
      currentUser = null;
      
      // Update UI
      userProfiles.forEach(el => el.classList.add('hidden'));
      if (mobileMenuBtn) mobileMenuBtn.classList.add('hidden');
      
      // Hide Role-based items
      updateRoleUI(null);
      
      // Force navigation to Login if on protected route
      navigateTo('login');
    }
  });

  // Login Click Handlers
  // (Removed top-nav login buttons, using central view-login instead)

  btnLoginGoogle.addEventListener('click', async () => {
    try {
      btnLoginGoogle.disabled = true;
      btnLoginGoogle.textContent = "Đang kết nối...";
      await signInWithPopup(auth, googleProvider);
      // State change is handled by onAuthStateChanged
    } catch (error) {
      console.error("Lỗi đăng nhập Google:", error);
      window.showCustomAlert("Đăng nhập thất bại: " + error.message, 'error');
    } finally {
      btnLoginGoogle.disabled = false;
      btnLoginGoogle.textContent = "Đăng nhập bằng Google";
    }
  });

  // Logout Click Handler
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        // Đóng mobile menu nếu có
        const mobileMenu = document.getElementById('mobile-fullscreen-menu');
        if (mobileMenu) {
          mobileMenu.style.opacity = '0';
          mobileMenu.style.pointerEvents = 'none';
          setTimeout(() => mobileMenu.classList.add('hidden'), 200);
        }
      } catch (error) {
        console.error("Lỗi đăng xuất:", error);
      }
    });
  });
}

// Ensure User Document exists in Firestore
async function ensureUserDocument(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    return docSnap.data().role || 'child';
  } else {
    // New user, create document with default role 'child'
    const defaultRole = 'child';
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: defaultRole,
      createdAt: new Date().toISOString(),
      streak: 0,
      total_points: 0
    });
    return defaultRole;
  }
}

// Toggle UI elements based on Role
function updateRoleUI(role) {
  const parentItems = document.querySelectorAll('.role-parent');
  const teacherItems = document.querySelectorAll('.role-teacher');
  const adminItems = document.querySelectorAll('.role-admin');
  
  // Hide all first
  parentItems.forEach(el => el.classList.add('hidden'));
  teacherItems.forEach(el => el.classList.add('hidden'));
  adminItems.forEach(el => el.classList.add('hidden'));
  
  if (!role) return;
  
  // Show based on role
  if (role === 'parent' || role === 'admin') {
    parentItems.forEach(el => el.classList.remove('hidden'));
  }
  if (role === 'teacher' || role === 'admin') {
    teacherItems.forEach(el => el.classList.remove('hidden'));
  }
  if (role === 'admin') {
    adminItems.forEach(el => el.classList.remove('hidden'));
  }
}

// Logic cho Account Management Panel
const btnOpenAccountPanel = document.getElementById('btn-open-account-panel');
const accountPanel = document.getElementById('account-management-panel');
const btnCloseAccountPanel = document.getElementById('close-account-panel-btn');
const inputDisplayName = document.getElementById('account-display-name');
const btnUpdateName = document.getElementById('btn-update-name');

const accountLinkSection = document.getElementById('account-link-section');
const inputLinkEmail = document.getElementById('link-student-email');
const btnLinkStudent = document.getElementById('btn-link-student');

if (btnOpenAccountPanel && accountPanel) {
  btnOpenAccountPanel.addEventListener('click', () => {
    if (!currentUser) return;
    
    // Gán tên hiện tại vào input
    inputDisplayName.value = currentUser.displayName || currentUser.email;
    
    // Đọc role từ UI hoặc biến (ở đây lấy từ class trên màn hình)
    const roleBadge = document.querySelector('.user-role-class');
    const roleEl = roleBadge ? roleBadge.textContent.toLowerCase() : 'child';
    
    // Luôn hiển thị phần Liên kết cho tất cả mọi người
    accountLinkSection.style.display = 'block';

    accountPanel.classList.remove('hidden');
    accountPanel.style.opacity = '1';
    accountPanel.style.pointerEvents = 'auto';
  });

  btnCloseAccountPanel.addEventListener('click', () => {
    accountPanel.style.opacity = '0';
    accountPanel.style.pointerEvents = 'none';
    setTimeout(() => accountPanel.classList.add('hidden'), 200);
  });
}

if (btnUpdateName) {
  btnUpdateName.addEventListener('click', async () => {
    const newName = inputDisplayName.value.trim();
    if (!newName) {
      window.showCustomAlert("Tên hiển thị không được để trống!", "error");
      return;
    }

    btnUpdateName.disabled = true;
    btnUpdateName.textContent = "Đang lưu...";
    
    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, { displayName: newName });
      
      currentUser.displayName = newName; // update local
      
      // Update UI
      document.querySelectorAll('.user-name-class').forEach(el => {
        el.textContent = newName;
      });
      
      window.showCustomAlert("Cập nhật tên thành công!", "success");
    } catch (e) {
      window.showCustomAlert("Lỗi: " + e.message, "error");
    } finally {
      btnUpdateName.disabled = false;
      btnUpdateName.textContent = "Cập nhật";
    }
  });
}

if (btnLinkStudent) {
  btnLinkStudent.addEventListener('click', async () => {
    const email = inputLinkEmail.value.trim();
    if (!email) {
      window.showCustomAlert("Vui lòng nhập Email học sinh!", 'error');
      return;
    }
    
    btnLinkStudent.disabled = true;
    btnLinkStudent.textContent = "Đang gửi...";
    
    try {
      // Đọc role
      const roleBadge = document.querySelector('.user-role-class');
      const roleEl = roleBadge ? roleBadge.textContent.toLowerCase() : 'parent';

      // Tìm user theo email (chỉ tìm tài khoản child)
      const usersRef = collection(db, "users");
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
        const reqQuery = query(collection(db, "link_requests"), 
          where("targetId", "==", childDoc.id),
          where("requesterId", "==", currentUser.uid),
          where("status", "==", "pending")
        );
        const reqSnap = await getDocs(reqQuery);
        
        if (!reqSnap.empty) {
          window.showCustomAlert("Bạn đã gửi yêu cầu liên kết cho tài khoản này rồi, đang chờ xác nhận!", 'warning');
        } else {
          // Nếu requester đang là child, tự động nâng cấp thành parent
          let finalRole = roleEl;
          if (roleEl === 'child') {
            await updateDoc(doc(db, "users", currentUser.uid), { role: 'parent' });
            finalRole = 'parent';
            
            // Cập nhật lại giao diện Role cho requester
            document.querySelectorAll('.user-role-class').forEach(el => {
              el.textContent = 'PARENT';
              el.className = 'user-role-class badge badge-success';
            });
            updateRoleUI('parent');
          }

          // Tạo request liên kết
          await addDoc(collection(db, "link_requests"), {
            requesterId: currentUser.uid,
            requesterName: currentUser.displayName || currentUser.email,
            requesterRole: finalRole,
            targetEmail: email,
            targetId: childDoc.id,
            status: 'pending',
            createdAt: new Date().toISOString()
          });
          
          window.showCustomAlert("Đã gửi yêu cầu liên kết! Chờ học sinh đăng nhập để xác nhận.", 'success');
          inputLinkEmail.value = '';
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
