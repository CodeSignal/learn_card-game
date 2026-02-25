let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function showNotification(message, type = 'info') {
  const parent = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);
  closeBtn.addEventListener('click', () => dismiss(toast));
  parent.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  const timer = setTimeout(() => dismiss(toast), 4000);
  toast._timer = timer;
}

function dismiss(toast) {
  clearTimeout(toast._timer);
  toast.classList.remove('show');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 400);
}
