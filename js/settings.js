import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getCurrentUser } from './auth.js';

let sfxEnabled = true;

export async function initSettings() {
  const toggleSfx = document.getElementById('toggle-sfx');
  const user = getCurrentUser();

  if (user) {
    // 1. Cố gắng đọc từ localStorage trước
    const localSfx = localStorage.getItem(`sfx_enabled_${user.uid}`);
    
    if (localSfx !== null) {
      sfxEnabled = localSfx === 'true';
    } else {
      // 2. Nếu localStorage trống, tải từ DB
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.settings && userData.settings.sfx_enabled !== undefined) {
            sfxEnabled = userData.settings.sfx_enabled;
          }
        }
        // Lưu lại vào localStorage sau khi lấy từ DB
        localStorage.setItem(`sfx_enabled_${user.uid}`, sfxEnabled);
      } catch (error) {
        console.error("Lỗi khi tải settings từ DB:", error);
      }
    }
  }

  // Cập nhật UI
  if (toggleSfx) {
    toggleSfx.checked = sfxEnabled;
  }
}

export function isSfxEnabled() {
  return sfxEnabled;
}

// Lắng nghe sự thay đổi của toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggleSfx = document.getElementById('toggle-sfx');
  const msgEl = document.getElementById('settings-status-msg');

  if (toggleSfx) {
    toggleSfx.addEventListener('change', async (e) => {
      sfxEnabled = e.target.checked;
      const user = getCurrentUser();
      
      if (user) {
        // Lưu local
        localStorage.setItem(`sfx_enabled_${user.uid}`, sfxEnabled);
        
        // Lưu DB
        try {
          msgEl.textContent = 'Đang lưu cấu hình...';
          msgEl.className = 'text-muted';
          
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            "settings.sfx_enabled": sfxEnabled
          });
          
          msgEl.textContent = 'Đã lưu cài đặt!';
          msgEl.className = 'text-muted';
          msgEl.style.color = 'var(--color-success)';
          
          setTimeout(() => {
            msgEl.textContent = '';
          }, 3000);
        } catch (error) {
          console.error("Lỗi khi lưu settings vào DB:", error);
          msgEl.textContent = 'Lưu thất bại. Vui lòng thử lại.';
          msgEl.style.color = 'var(--color-danger)';
        }
      }
    });
  }
});
