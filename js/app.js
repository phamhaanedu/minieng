import { initAuth, getCurrentUser } from './auth.js';
import { initLocalDB } from './db.js';
import { startLearningSession } from './game-engine.js';
import { renderDashboard } from './dashboard.js';
import { renderManagement } from './management.js';

// Global Custom Alert Function
window.showCustomAlert = function(message, type = 'success', onConfirm = null) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-alert-overlay anim-fade-in';
  
  const icon = type === 'success' ? '✅' : '⚠️';
  const color = type === 'success' ? 'var(--color-success)' : 'var(--color-danger)';
  const title = type === 'success' ? 'Thành công' : 'Thông báo';
  
  overlay.innerHTML = `
    <div class="card text-center anim-bounce" style="max-width: 350px; width: 90%; padding: var(--spacing-lg); z-index: 10000; position: relative;">
      <div style="font-size: 3rem; margin-bottom: var(--spacing-sm);">${icon}</div>
      <h3 style="color: ${color}; margin-bottom: var(--spacing-md); font-size: 1.5rem;">${title}</h3>
      <p style="color: var(--color-text-main); margin-bottom: var(--spacing-lg); font-size: 1.1rem; line-height: 1.5;">${message}</p>
      <button id="custom-alert-btn" class="btn btn-primary" style="width: 100%; font-size: 1.1rem; padding: 12px;">Đã hiểu</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const btn = overlay.querySelector('#custom-alert-btn');
  btn.focus();
  
  const closeAlert = () => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (onConfirm) onConfirm();
    }, 200);
  };
  
  btn.addEventListener('click', closeAlert);
  
  const keyHandler = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      closeAlert();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log("App initialized.");

  // Initialize Local Database
  try {
    await initLocalDB();
  } catch (error) {
    console.error("Lỗi khởi tạo Local DB:", error);
  }
  
  // Basic Routing Logic (Single-Pane Navigation)
  const navLinks = document.querySelectorAll('.mobile-menu-link');
  const viewSections = document.querySelectorAll('.view-section');
  
  // Mobile Menu Logic
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-fullscreen-menu');
  const closeMenuBtn = document.getElementById('close-menu-btn');

  function openMobileMenu() {
    mobileMenu.classList.remove('hidden');
    mobileMenu.style.opacity = '1';
    mobileMenu.style.pointerEvents = 'auto';
  }

  function closeMobileMenu() {
    mobileMenu.style.opacity = '0';
    mobileMenu.style.pointerEvents = 'none';
    setTimeout(() => {
      mobileMenu.classList.add('hidden');
    }, 200);
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
  if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeMobileMenu);

  function navigateTo(route) {
    // Hide all views
    viewSections.forEach(section => {
      section.classList.remove('active');
      section.classList.add('hidden');
    });

    // Remove active class from all nav links
    navLinks.forEach(link => link.classList.remove('active'));

    // Show selected view
    const targetView = document.getElementById(`view-${route}`);
    if (targetView) {
      targetView.classList.remove('hidden');
      targetView.classList.add('active');
    }

    // Highlight nav links (now only mobile-menu-link exists)
    const targetLinks = document.querySelectorAll(`.mobile-menu-link[data-route="${route}"]`);
    targetLinks.forEach(link => link.classList.add('active'));

    closeMobileMenu();

    // Trigger render logic based on route
    if (route === 'dashboard') {
      renderDashboard();
    } else if (route === 'management') {
      renderManagement();
    }
  }

  // Attach event listeners to navigation
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Ensure we get the a tag even if a child element is clicked
      const route = e.currentTarget.getAttribute('data-route');
      navigateTo(route);
    });
  });

  // Initialize Auth Module passing the router
  initAuth(navigateTo);

  // Attach event listener for Learn button
  const btnStartSession = document.querySelector('#view-learn .btn-primary');
  if (btnStartSession) {
    btnStartSession.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) {
        showCustomAlert("Vui lòng đăng nhập để bắt đầu học!", 'error');
        return;
      }
      startLearningSession(user.uid);
    });
  }

  // Initial render
  renderDashboard();
});
