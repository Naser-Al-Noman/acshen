const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const chatWidget = document.querySelector("#chat-widget");
const chatLauncher = document.querySelector("#chat-launcher");
const chatCloseButton = document.querySelector("#chat-close");
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
  const contactMessage = document.getElementById("message");
  const contactMessageError = document.getElementById("contact-message-error");

  function clearContactFieldError() {
    contactMessage?.classList.remove("is-invalid");
    if (contactMessageError) {
      contactMessageError.hidden = true;
    }
  }

  function showContactFieldError() {
    contactMessage?.classList.add("is-invalid");
    if (contactMessageError) {
      contactMessageError.hidden = false;
    }
    contactMessage?.focus();
  }

  contactMessage?.addEventListener("input", clearContactFieldError);

  document.addEventListener("pointerdown", (event) => {
    if (!contactMessage?.classList.contains("is-invalid")) {
      return;
    }

    const wrap = contactMessage.closest(".contact-field-wrap");
    if (wrap && !wrap.contains(event.target)) {
      clearContactFieldError();
    }
  });

  contactFormElement.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (contactSuccess) contactSuccess.style.display = "none";
    if (contactError) contactError.style.display = "none";

    const message = contactMessage?.value.trim() || "";
    if (!message) {
      showContactFieldError();
      return;
    }

    clearContactFieldError();

    const submitButton = contactFormElement.querySelector(".send-button");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    const formData = new FormData(contactFormElement);

    try {
      const response = await fetch(contactFormElement.action, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json"
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Submission failed. Please try again.");
      }

      showContactStatus("success", "✓ Message sent! I’ll get back to you soon.");
      contactFormElement.reset();
    } catch (error) {
      showContactStatus("error", error.message || "Unable to send message. Please try again.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Send Message";
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

  const lightSrc = chatIcon.dataset.light || 'logos/chat-intelligence-svgrepo-com-dark.svg';
  const darkSrc = chatIcon.dataset.dark || 'logos/chat-intelligence-svgrepo-com-white.svg';
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
  const theme = storedTheme || "dark";
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function renderMarkdown(text) {
  const lines = escapeHtml(String(text || "").trim()).split("\n");
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) {
      return;
    }
    blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const line of lines) {
    const listMatch = line.match(/^[\*\-]\s+(.+)$/);
    if (listMatch) {
      listItems.push(formatInlineMarkdown(listMatch[1]));
      continue;
    }

    flushList();

    if (!line.trim()) {
      continue;
    }

    blocks.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  flushList();
  return blocks.join("") || "<p></p>";
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  if (role === "bot") {
    article.innerHTML = renderMarkdown(text);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    article.appendChild(paragraph);
  }

  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return article;
}

function showTypingIndicator() {
  const article = document.createElement("article");
  article.className = "message message-bot message-typing";
  article.setAttribute("aria-label", "Assistant is typing");
  article.innerHTML =
    '<span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return article;
}

const chatHistory = [];

async function askChatbot(message) {
  if (chatWidget?.dataset.chatState !== "open") {
    setChatState(true);
  }

  const historyForRequest = chatHistory.slice(-8);
  appendMessage("user", message);
  chatInput.value = "";

  const submitButton = chatForm?.querySelector("button");
  if (submitButton) {
    submitButton.disabled = true;
  }

  const typingMessage = showTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message, history: historyForRequest })
    });

    if (!response.ok) {
      throw new Error("Chat request failed.");
    }

    const payload = await response.json();
    const answer = payload.answer || "";
    chatHistory.push({ role: "user", text: message });
    chatHistory.push({ role: "model", text: answer });
    if (chatHistory.length > 16) {
      chatHistory.splice(0, chatHistory.length - 16);
    }
    typingMessage.remove();
    appendMessage("bot", answer);
  } catch (error) {
    typingMessage.remove();
    appendMessage(
      "bot",
      "The assistant is unavailable right now. Please try again in a moment."
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Send";
    }
    chatInput?.focus();
  }
}

function clearChatFieldError() {
  const errorEl = document.getElementById("chat-input-error");
  chatInput?.classList.remove("is-invalid");
  if (errorEl) {
    errorEl.hidden = true;
  }
}

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput?.value.trim();
  const errorEl = document.getElementById("chat-input-error");

  if (!message) {
    chatInput?.classList.add("is-invalid");
    if (errorEl) {
      errorEl.hidden = false;
    }
    chatInput?.focus();
    return;
  }

  clearChatFieldError();
  askChatbot(message);
});

chatInput?.addEventListener("input", clearChatFieldError);

document.addEventListener("pointerdown", (event) => {
  if (!chatInput?.classList.contains("is-invalid")) {
    return;
  }

  const wrap = chatInput.closest(".chat-input-wrap");
  if (wrap && !wrap.contains(event.target)) {
    clearChatFieldError();
  }
});

const text = "Computer Science graduate with hands-on Software Quality Assurance experience testing CRM and EMR web applications. Skilled in manual testing, REST API validation, SQL-based database verification, regression testing, and Playwright test automation.";
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

const navToggle = document.querySelector("#nav-menu-toggle");
const navMenu = document.querySelector("#site-nav-menu");
const navLinks = navMenu ? Array.from(navMenu.querySelectorAll("a[href^='#']")) : [];
const sectionIds = navLinks
  .map((link) => link.getAttribute("href")?.slice(1))
  .filter(Boolean);
const navSections = sectionIds
  .map((id) => document.getElementById(id))
  .filter(Boolean);

function setNavOpen(isOpen) {
  if (!navToggle || !navMenu) return;
  navMenu.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

function setActiveNavLink(activeId) {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${activeId}`;
    link.classList.toggle("is-active", isActive);
  });
}

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    setNavOpen(!navMenu.classList.contains("is-open"));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
    }
  });
}

if (navSections.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visible[0]?.target?.id) {
        setActiveNavLink(visible[0].target.id);
      }
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0.1, 0.25, 0.5],
    }
  );

  navSections.forEach((section) => observer.observe(section));

  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY < 120) {
        navLinks.forEach((link) => link.classList.remove("is-active"));
      }
    },
    { passive: true }
  );
}