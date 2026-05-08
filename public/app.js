const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const suggestionButtons = document.querySelectorAll(".suggestion-chip");
const chatWidget = document.querySelector("#chat-widget");
const chatLauncher = document.querySelector("#chat-launcher");
const chatCloseButton = document.querySelector("#chat-close");
const loadingIndicator = document.getElementById("loading-indicator");
const themeToggle = document.querySelector("#theme-toggle");
const chatToggle = document.querySelector("#chat-toggle");
const contactFormElement = document.getElementById("contact-form-element");
const contactSuccess = document.getElementById("contact-success");
const contactError = document.getElementById("contact-error");

function showContactStatus(type, message) {
  if (!contactSuccess || !contactError) return;
  if (type === 'success') {
    contactError.style.display = 'none';
    contactSuccess.textContent = message;
    contactSuccess.style.display = 'block';
  } else {
    contactSuccess.style.display = 'none';
    contactError.textContent = message;
    contactError.style.display = 'block';
  }
}

if (contactFormElement) {
  contactFormElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (contactSuccess) contactSuccess.style.display = 'none';
    if (contactError) contactError.style.display = 'none';

    if (!contactFormElement.checkValidity()) {
      contactFormElement.reportValidity();
      return;
    }

    const submitButton = contactFormElement.querySelector('.send-button');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    const formData = new FormData(contactFormElement);

    try {
      const response = await fetch(contactFormElement.action, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Submission failed. Please try again.');
      }

      showContactStatus('success', '✓ Message sent! I’ll get back to you soon.');
      contactFormElement.reset();
    } catch (error) {
      showContactStatus('error', error.message || 'Unable to send message. Please try again.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send Message';
      }
    }
  });
}

function updateBotIcon(theme) {
  const botIcon = document.querySelector('.bot-icon');
  if (!botIcon) {
    return;
  }

  const lightSrc = botIcon.dataset.light || 'logos/bot.svg';
  const darkSrc = botIcon.dataset.dark || 'logos/bot-dark.svg';
  botIcon.src = theme === 'light' ? lightSrc : darkSrc;
}

function updateChatLauncherIcon(theme) {
  const chatIcon = document.querySelector('.chat-launcher-icon');
  if (!chatIcon) {
    return;
  }

  const lightSrc = chatIcon.dataset.light || 'logos/chat-intelligence-svgrepo-com-white.svg';
  const darkSrc = chatIcon.dataset.dark || 'logos/chat-intelligence-svgrepo-com-dark.svg';
  chatIcon.src = theme === 'light' ? lightSrc : darkSrc;
}

function updateThemeToggle(theme) {
  if (!themeToggle) {
    return;
  }

  const themeLabel = theme === 'light' ? 'Light' : 'Dark';
  themeToggle.innerHTML = `
    <span class="theme-toggle-track" aria-hidden="true">
      <span class="theme-toggle-thumb"></span>
    </span>
    <span class="theme-label">${themeLabel}</span>
  `;
  themeToggle.dataset.theme = theme;
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  updateThemeToggle(theme);
  updateBotIcon(theme);
  updateChatLauncherIcon(theme);
}

function initTheme() {
  const storedTheme = localStorage.getItem("theme");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = storedTheme || (prefersLight ? "light" : "dark");
  applyTheme(theme);
}

themeToggle?.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  themeToggle?.classList.add("scrolling");
  applyTheme(nextTheme);
  window.setTimeout(() => {
    themeToggle?.classList.remove("scrolling");
  }, 300);
});

function setChatLauncherVisibility(isVisible) {
  if (!chatLauncher) {
    return;
  }

  chatLauncher.style.display = isVisible ? "inline-flex" : "none";
  if (chatToggle) {
    chatToggle.setAttribute("aria-pressed", String(!isVisible));
    chatToggle.setAttribute(
      "aria-label",
      isVisible ? "Toggle chatbot visibility" : "Chat disabled"
    );
    chatToggle.classList.toggle("crossed", !isVisible);
  }

  if (!isVisible) {
    setChatState(false);
  }
}

function setChatState(isOpen) {
  if (!chatWidget || !chatLauncher) {
    return;
  }

  chatWidget.dataset.chatState = isOpen ? "open" : "closed";
  chatWidget.classList.toggle("open", isOpen);
  chatWidget.classList.toggle("closed", !isOpen);
  chatLauncher.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    chatInput?.focus();
  } else {
    chatLauncher.focus();
  }
}

chatToggle?.addEventListener("click", () => {
  const hidden = chatLauncher?.style.display === "none";
  setChatLauncherVisibility(hidden);
});

chatLauncher?.addEventListener("click", (event) => {
  event.preventDefault();
  setChatState(true);
});

chatCloseButton?.addEventListener("click", (event) => {
  event.preventDefault();
  setChatState(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chatWidget?.dataset.chatState === "open") {
    setChatState(false);
  }
});

function appendMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.appendChild(paragraph);

  if (sources.length && role === "bot") {
    const sourceLabel = document.createElement("small");
    sourceLabel.className = "message-sources";
    sourceLabel.textContent = `Sources: ${sources.join(", ")}`;
    article.appendChild(sourceLabel);
  }

  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoading(show) {
  if (!loadingIndicator) {
    return;
  }
  loadingIndicator.style.display = show ? "block" : "none";
}

async function askChatbot(message) {
  if (chatWidget?.dataset.chatState !== "open") {
    setChatState(true);
  }

  appendMessage("user", message);
  chatInput.value = "";

  const submitButton = chatForm?.querySelector("button");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Thinking...";
  }

  setLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error("Chat request failed.");
    }

    const payload = await response.json();
    appendMessage("bot", payload.answer, payload.sources || []);
  } catch (error) {
    appendMessage(
      "bot",
      "The portfolio assistant is unavailable right now. Please try again in a moment."
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Send";
    }
    chatInput?.focus();
    setLoading(false);
  }
}

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput?.value.trim();

  if (!message) {
    return;
  }

  askChatbot(message);
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    askChatbot(button.dataset.question || button.textContent || "");
  });
});

const text = "Computer Science graduate passionate about advancing software quality through rigorous testing and intelligent automation. Proven ability to learn, adapt, and deliver optimal solutions through research and analytical thinking.";
const typingText = document.getElementById("typing-text");
let typingIndex = 0;

function typeWriter() {
  if (!typingText) {
    return;
  }

  if (typingIndex < text.length) {
    typingText.textContent += text.charAt(typingIndex);
    typingIndex += 1;
    setTimeout(typeWriter, 50);
  }
}

window.addEventListener("load", () => {
  typeWriter();
  initTheme();

  if (chatWidget) {
    setChatState(chatWidget.dataset.chatState === "open");
  }
});