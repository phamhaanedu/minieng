import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
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
