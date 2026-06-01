import "./styles.css";
import {
  bigFiveScoring,
  experimentStartInstruction,
  postScaleOrder,
  questions,
  roles,
  scales,
  schedules,
  stageInstructions
} from "./data.js";

const storageKey = "ai-role-label-experiment-state";
const stateVersion = 4;
const app = document.querySelector("#app");

let state = loadState() || initialState();

function initialState() {
  return {
    version: stateVersion,
    participantId: "",
    participantInfo: {
      gender: "",
      age: "",
      education: "",
      major: "",
      phone: "",
      idCard: ""
    },
    scheduleId: schedules[0].id,
    startedAt: null,
    currentStep: 0,
    steps: [],
    taskRecords: {},
    scaleResponses: {},
    bigFiveScores: null,
    completed: false,
    saved: null,
    stepStartedAt: Date.now()
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved?.version === stateVersion ? saved : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function schedule() {
  return schedules.find((item) => item.id === state.scheduleId) || schedules[0];
}

function questionById(id) {
  return questions.find((question) => String(question.id) === String(id));
}

function normalizeAnswer(answer) {
  return String(answer || "")
    .toUpperCase()
    .replace(/[^A-D]/g, "")
    .split("")
    .filter((letter, index, array) => array.indexOf(letter) === index)
    .sort()
    .join("");
}

function aiAvatar(role) {
  if (role.id === "expert") return "专";
  if (role.id === "companion") return "伴";
  return "工";
}

function chatBoxMarkup(role, record) {
  return `
    <div class="chat-box">
      <div class="chat-log">
        ${(record.chatMessages || []).map((message) => `
          <div class="chat-message ${message.sender}">
            ${message.sender === "ai" ? `<span class="chat-avatar ${role.id}">${aiAvatar(role)}</span>` : `<span class="chat-avatar user">你</span>`}
            <div>
              <strong>${message.sender === "user" ? "你" : role.name}</strong>
              <p>${message.content}</p>
            </div>
          </div>
        `).join("") || `<p class="muted">你可以继续向${role.name}提问。</p>`}
      </div>
      <form id="chatForm" class="chat-form">
        <input class="text-input" name="chatInput" placeholder="输入你的问题" autocomplete="off">
        <button class="secondary" type="submit">发送</button>
      </form>
    </div>
  `;
}

function randomAccuracyPair() {
  return Math.random() < 0.5 ? ["correct", "incorrect"] : ["incorrect", "correct"];
}

function buildSteps(selectedSchedule) {
  const steps = [
    { type: "instruction", instructionId: "start", title: "实验开始前指导语" },
    { type: "scale", scaleId: "preTrust", title: "开始问卷" }
  ];
  const taskBlocks = [[1, 2, "E1"], [3, 4, "E2"], [5, 6, "E3"]];

  selectedSchedule.roleOrder.forEach((roleId, blockIndex) => {
    const accuracyPair = randomAccuracyPair();
    steps.push({
      type: "instruction",
      instructionId: "stage",
      roleId,
      title: `${roles[roleId].name}指导语`
    });
    taskBlocks[blockIndex].forEach((questionId, taskIndex) => {
      const question = questionById(questionId);
      const isChoice = question?.type !== "essay";
      steps.push({
        type: "task",
        taskType: isChoice ? "choice" : "essay",
        roleId,
        questionId,
        accuracy: isChoice ? accuracyPair[taskIndex] : "",
        blockIndex,
        taskIndex: blockIndex * 3 + taskIndex,
        roleTaskIndex: taskIndex + 1,
        title: `任务${blockIndex * 3 + taskIndex + 1} · ${roles[roleId].name}`
      });
    });
    steps.push({
      type: "postCombined",
      roleId,
      title: `${roles[roleId].name}问卷`
    });
  });
  steps.push({ type: "scale", scaleId: "bigFive", title: "结束问卷" });
  steps.push({ type: "complete", title: "完成" });
  return steps;
}

function currentStep() {
  return state.steps[state.currentStep];
}

function goNext() {
  state.currentStep += 1;
  state.stepStartedAt = Date.now();
  saveState();
  render();
}

function restart() {
  if (!confirm("确认清空当前浏览器中的实验进度？")) return;
  state = initialState();
  localStorage.removeItem(storageKey);
  render();
}

function optionControl(question, name, selected = "") {
  const selectedSet = new Set(normalizeAnswer(selected).split("").filter(Boolean));
  return Object.entries(question.options)
    .map(([key, label]) => {
      const type = question.multiple ? "checkbox" : "radio";
      const checked = selectedSet.has(key) ? "checked" : "";
      return `
        <label class="option-row">
          <input type="${type}" name="${name}" value="${key}" ${checked}>
          <span class="option-key">${key}</span>
          <span>${label}</span>
        </label>
      `;
    })
    .join("");
}

function getAnswerFromForm(form, name, multiple) {
  if (multiple) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value).sort().join("");
  }
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function stepKey(step) {
  if (step.type === "task") return `${step.taskType || "choice"}_${step.questionId}_${step.roleId}_${step.accuracy || "na"}`;
  if (step.type === "postCombined") return `post_${step.roleId}`;
  return step.scaleId;
}

function allScaleAnswered(scale, responses = {}) {
  return scale.items.every((_, index) => responses[index + 1] != null);
}

const indentedInstructionParagraphs = new Set([
  "首先，你需要填写一份基础信息问卷；",
  "随后进入标签学习阶段，熟悉三种不同类型 AI 的角色设定；",
  "依次与专家型 AI、陪伴型 AI、工具型 AI分别协作完成3个任务题；",
  "每完成一类 AI 的任务后，需填写一份主观评价问卷；",
  "全部任务结束后，完成一份大五人格量表；",
  "专家型 AI：定位为专业领域权威顾问，核心特点是高专业性、强权威性、理性严谨，擅长提供专业精准的诊断建议。",
  "陪伴型 AI：定位为友好协作伙伴，核心特点是亲和温暖、支持性强、注重情感回应，协作中更侧重鼓励与共情。",
  "工具型 AI：定位为中性自动化工具，核心特点是客观中立、简洁高效、无情感倾向，仅提供标准化的参考建议。"
]);

function currentParticipantInfo() {
  return {
    gender: state.participantInfo?.gender || "",
    age: state.participantInfo?.age || "",
    education: state.participantInfo?.education || "",
    major: state.participantInfo?.major || "",
    phone: state.participantInfo?.phone || "",
    idCard: state.participantInfo?.idCard || ""
  };
}

function validateParticipantInfo(participantId, info) {
  if (!participantId) return "请填写被试编号。";
  if (!info.gender || !info.age || !info.education || !info.major || !info.phone || !info.idCard) {
    return "请完整填写被试信息。";
  }
  const age = Number(info.age);
  if (!Number.isInteger(age) || age < 10 || age > 100) return "请填写有效年龄。";
  if (!/^1[3-9]\d{9}$/.test(info.phone)) return "请填写有效的11位手机号。";
  if (!/^\d{17}[\dXx]$/.test(info.idCard)) return "请填写有效的18位身份证号。";
  return "";
}

function renderShell(content) {
  const total = state.steps.length || 1;
  const progress = state.steps.length ? Math.round((state.currentStep / (total - 1)) * 100) : 0;
  const navItems = state.steps.length
    ? state.steps.map((step, index) => `
      <li class="${index === state.currentStep ? "active" : ""} ${index < state.currentStep ? "done" : ""}">
        <span>${index + 1}</span>${step.title}
      </li>
    `).join("")
    : "";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">AI</div>
          <div>
            <strong>人机协作实验</strong>
          </div>
        </div>
        <ol class="step-list">${navItems || "<li class='active'><span>1</span>开始</li>"}</ol>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div>
            <h1>人机协作平台</h1>
          </div>
          <div class="top-actions">
            <span class="pill">被试：${state.participantId || "未开始"}</span>
            <button class="ghost" id="restartBtn" type="button">重置</button>
          </div>
        </header>
        <div class="progress-track"><div style="width:${progress}%"></div></div>
        ${content}
      </main>
    </div>
  `;
  document.querySelector("#restartBtn")?.addEventListener("click", restart);
}

function renderStart() {
  const participantInfo = currentParticipantInfo();
  renderShell(`
    <section class="panel start-panel">
      <div class="section-label">Start</div>
      <h2>实验准备</h2>
      <p class="muted">请先填写被试编号与被试信息，并由主试选择AI标签顺序。</p>
      <form id="startForm" class="form-grid">
        <fieldset class="form-section">
          <legend>被试编号</legend>
          <label>
            被试编号
            <input class="text-input" name="participantId" value="${state.participantId}" placeholder="例如 P001" required>
          </label>
        </fieldset>
        <fieldset class="form-section participant-grid">
          <legend>被试信息</legend>
          <label>
            性别
            <select class="text-input" name="gender" required>
              <option value="">请选择</option>
              ${["男", "女", "其他"].map((value) => `<option value="${value}" ${value === participantInfo.gender ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </label>
          <label>
            年龄
            <input class="text-input" name="age" type="number" min="10" max="100" value="${participantInfo.age}" placeholder="例如 20" required>
          </label>
          <label>
            学历
            <input class="text-input" name="education" value="${participantInfo.education}" placeholder="例如 本科" required>
          </label>
          <label>
            专业
            <input class="text-input" name="major" value="${participantInfo.major}" placeholder="例如 心理学" required>
          </label>
          <label>
            手机号
            <input class="text-input" name="phone" inputmode="tel" value="${participantInfo.phone}" placeholder="11位手机号" required>
          </label>
          <label>
            身份证
            <input class="text-input" name="idCard" value="${participantInfo.idCard}" placeholder="18位身份证号" required>
          </label>
        </fieldset>
        <fieldset class="form-section">
          <legend>主试选择AI顺序</legend>
          <label>
            AI分配方案
            <select class="text-input" name="scheduleId">
              ${schedules.map((item) => `<option value="${item.id}" ${item.id === state.scheduleId ? "selected" : ""}>${item.label}</option>`).join("")}
            </select>
          </label>
        </fieldset>
        <button class="primary" type="submit">开始实验</button>
      </form>
      <div class="info-grid">
        <div><strong>流程</strong><span>问卷 -> 法律任务 -> 人力资源任务 -> 交互评价 -> 结束问卷</span></div>
        <div><strong>任务</strong><span>请根据材料作答，并参考AI提供的信息</span></div>
        <div><strong>保存</strong><span>完成后请联系主试保存本次数据</span></div>
      </div>
    </section>
  `);

  document.querySelector("#startForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const participantId = form.get("participantId").trim();
    const participantInfo = {
      gender: form.get("gender").trim(),
      age: form.get("age").trim(),
      education: form.get("education").trim(),
      major: form.get("major").trim(),
      phone: form.get("phone").trim(),
      idCard: form.get("idCard").trim().toUpperCase()
    };
    const validationError = validateParticipantInfo(participantId, participantInfo);
    if (validationError) {
      alert(validationError);
      return;
    }
    state.participantId = participantId;
    state.participantInfo = participantInfo;
    state.scheduleId = form.get("scheduleId");
    state.startedAt = new Date().toISOString();
    state.steps = buildSteps(schedule());
    state.currentStep = 0;
    state.stepStartedAt = Date.now();
    saveState();
    render();
  });
}

function renderInstruction(step) {
  const instruction = step.instructionId === "stage"
    ? stageInstructions[step.roleId]
    : experimentStartInstruction;

  renderShell(`
    <section class="panel instruction-panel">
      <div class="section-label">${step.instructionId === "stage" ? roles[step.roleId].name : "Instruction"}</div>
      <h2>${instruction.title}</h2>
      <div class="instruction-content">
        ${instruction.paragraphs.map((paragraph) => `<p class="${indentedInstructionParagraphs.has(paragraph) ? "indent" : ""}">${paragraph}</p>`).join("")}
      </div>
      <button class="primary" id="instructionNext" type="button">我已理解，继续</button>
    </section>
  `);

  document.querySelector("#instructionNext").addEventListener("click", goNext);
}

function likertMarkup(scale, itemNo, name, saved, ariaLabel) {
  return `
    <div class="likert" role="radiogroup" aria-label="${ariaLabel}">
      ${Array.from({ length: scale.max - scale.min + 1 }, (_, offset) => scale.min + offset).map((value) => `
        <label title="${value}">
          <input type="radio" name="${name}" value="${value}" ${Number(saved) === value ? "checked" : ""}>
          <span>${value}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function scaleRowMarkup(scale, item, itemNo, name, saved) {
  const left = Array.isArray(item) ? item[0] : item;
  const right = Array.isArray(item) ? item[1] : "";

  if (scale.semantic && right) {
    return `
      <div class="scale-row semantic-row">
        <div class="semantic-term semantic-left">
          <span>${itemNo}.</span>
          <strong>${left}</strong>
        </div>
        ${likertMarkup(scale, itemNo, name, saved, `${left} 到 ${right}`)}
        <strong class="semantic-term semantic-right">${right}</strong>
      </div>
    `;
  }

  return `
    <div class="scale-row">
      <div class="scale-item">
        <span>${itemNo}.</span>
        <strong>${left}</strong>
        ${right ? `<em>${right}</em>` : ""}
      </div>
      ${likertMarkup(scale, itemNo, name, saved, left)}
    </div>
  `;
}

function renderScale(step) {
  const scale = scales[step.scaleId];
  const key = stepKey(step);
  const responses = state.scaleResponses[key] || {};

  renderShell(`
    <section class="panel">
      <div class="section-label">问卷作答</div>
      <h2>请完成以下题项</h2>
      <p class="muted">${scale.instruction}</p>
      <form id="scaleForm" class="scale-form">
        ${scale.items.map((item, index) => {
          const itemNo = index + 1;
          return scaleRowMarkup(scale, item, itemNo, `item_${itemNo}`, responses[itemNo]);
        }).join("")}
        <div class="scale-anchors">
          <span>${scale.min} = ${scale.anchors[0]}</span>
          <span>${scale.max} = ${scale.anchors[1]}</span>
        </div>
        <button class="primary" type="submit">提交并继续</button>
      </form>
    </section>
  `);

  document.querySelector("#scaleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const nextResponses = {};
    scale.items.forEach((_, index) => {
      const itemNo = index + 1;
      const value = form.querySelector(`input[name="item_${itemNo}"]:checked`)?.value;
      if (value) nextResponses[itemNo] = Number(value);
    });
    if (!allScaleAnswered(scale, nextResponses)) {
      alert("请完成所有题项后继续。");
      return;
    }
    state.scaleResponses[key] = nextResponses;
    if (step.scaleId === "bigFive") {
      state.bigFiveScores = scoreBigFive(nextResponses);
    }
    saveState();
    goNext();
  });
}

function renderPostCombined(step) {
  const key = stepKey(step);
  const responses = state.scaleResponses[key] || {};
  const groups = postScaleOrder.map((scaleId, index) => ({ scaleId, index: index + 1, scale: scales[scaleId] }));

  renderShell(`
    <section class="panel">
      <div class="section-label">${roles[step.roleId].name} · 问卷作答</div>
      <h2>请根据刚才的交互体验作答</h2>
      <form id="postForm" class="scale-form">
        ${groups.map(({ scaleId, index, scale }) => `
          <section class="scale-group">
            <p class="muted">第${index}部分：${scale.instruction}</p>
            ${scale.items.map((item, itemIndex) => {
              const itemNo = itemIndex + 1;
              const saved = responses[scaleId]?.[itemNo];
              return scaleRowMarkup(scale, item, itemNo, `${scaleId}_${itemNo}`, saved);
            }).join("")}
            <div class="scale-anchors">
              <span>${scale.min} = ${scale.anchors[0]}</span>
              <span>${scale.max} = ${scale.anchors[1]}</span>
            </div>
          </section>
        `).join("")}
        <button class="primary" type="submit">提交并继续</button>
      </form>
    </section>
  `);

  document.querySelector("#postForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = {};
    for (const { scaleId, scale } of groups) {
      next[scaleId] = {};
      for (let index = 0; index < scale.items.length; index += 1) {
        const itemNo = index + 1;
        const value = form.querySelector(`input[name="${scaleId}_${itemNo}"]:checked`)?.value;
        if (!value) return alert("请完成所有题项后继续。");
        next[scaleId][itemNo] = Number(value);
      }
    }
    state.scaleResponses[key] = next;
    saveState();
    goNext();
  });
}

function taskTypeHint(question) {
  if (question.type === "essay") return "（简答）";
  return question.multiple ? "（多选）" : "（单选）";
}

function cleanStem(stem) {
  return String(stem || "")
    .replace(/（多选）/g, "")
    .replace(/\(多选\)/g, "")
    .replace(/（单选）/g, "")
    .replace(/\(单选\)/g, "")
    .replace(/（简答）/g, "")
    .replace(/\(简答\)/g, "");
}

function renderTask(step) {
  const question = questionById(step.questionId);
  const role = roles[step.roleId];
  const key = stepKey(step);
  const record = state.taskRecords[key] || {
    participantId: state.participantId,
    scheduleId: state.scheduleId,
    questionId: question.id,
    taskType: question.type || "choice",
    roleId: role.id,
    accuracy: step.accuracy || "",
    stage: question.type === "essay" ? "essay" : "initial",
    initialStartedAt: Date.now()
  };
  state.taskRecords[key] = record;
  saveState();

  if (question.type === "essay") {
    renderEssayTask(step, question, role, record, key);
    return;
  }

  const aiCard = record.aiSuggestion ? `
    <div class="ai-card ${role.id}">
      <div class="ai-warning">${role.warning}</div>
      <div class="ai-card-header">
        <span class="role-badge">${role.badge}</span>
        <strong>${role.name}</strong>
      </div>
      <p>${record.aiSuggestion.explanation}</p>
      <ul>${(record.aiSuggestion.optionAnalysis || []).map((line) => `<li>${line}</li>`).join("")}</ul>
      <div class="uncertainty">${record.aiSuggestion.uncertaintyNote || "AI建议仅供参考，请独立判断。"}</div>
    </div>
    ${chatBoxMarkup(role, record)}
  ` : "";

  renderShell(`
    <section class="task-layout">
      <article class="panel task-main">
        <div class="section-label">${role.name}</div>
        <p class="stem"><strong class="multi-hint">${taskTypeHint(question)}</strong>${cleanStem(question.stem)}</p>
        <div class="law-box">
          <strong>相关法条</strong>
          ${question.law.map((line) => `<p>${line}</p>`).join("")}
        </div>
        <form id="taskForm">
          <div class="options">${optionControl(question, record.stage === "initial" ? "initialAnswer" : "finalAnswer", record.stage === "initial" ? record.initialAnswer : record.finalAnswer)}</div>
          <button class="primary" type="submit">${record.stage === "initial" ? "提交初次作答并查看AI建议" : "提交最终答案"}</button>
        </form>
      </article>
      <aside class="panel task-side">
        <div class="role-profile">
          <span class="role-badge">${role.badge}</span>
          <h3>${role.name}</h3>
          <p>${role.intro}</p>
        </div>
        ${record.stage === "initial" ? `<div class="empty-ai">初次作答后，将显示该AI的真实生成建议。</div>` : aiCard}
      </aside>
    </section>
  `);

  document.querySelector("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (record.stage === "initial") {
      const answer = getAnswerFromForm(form, "initialAnswer", question.multiple);
      if (!answer) return alert("请选择初次答案。");
      record.initialAnswer = normalizeAnswer(answer);
      record.initialRtMs = Date.now() - (record.initialStartedAt || state.stepStartedAt);
      record.stage = "loadingAi";
      state.taskRecords[key] = record;
      saveState();
      await requestAiSuggestion(step, question, role, record, key);
      return;
    }

    const answer = getAnswerFromForm(form, "finalAnswer", question.multiple);
    if (!answer) return alert("请选择最终答案。");
    record.finalAnswer = normalizeAnswer(answer);
    record.finalRtMs = Date.now() - (record.finalStartedAt || Date.now());
    record.stage = "done";
    record.adoptedAi = normalizeAnswer(record.finalAnswer) === normalizeAnswer(record.aiSuggestion?.suggestedAnswer);
    record.finalCorrect = normalizeAnswer(record.finalAnswer) === normalizeAnswer(question.correctAnswer);
    record.overreliance = step.accuracy === "incorrect" && record.adoptedAi;
    record.appropriateRejection = step.accuracy === "incorrect" && !record.adoptedAi;
    state.taskRecords[key] = record;
    saveState();
    goNext();
  });

  document.querySelector("#chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.chatInput;
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    await sendChatMessage(step, question, role, record, key, content);
  });
}

function renderEssayTask(step, question, role, record, key) {
  renderShell(`
    <section class="task-layout">
      <article class="panel task-main">
        <div class="section-label">${role.name}</div>
        <p class="stem"><strong class="multi-hint">${taskTypeHint(question)}</strong>${cleanStem(question.stem)}</p>
        <form id="essayForm">
          <label class="essay-label">
            最终作答
            <textarea class="text-input text-area" name="finalTextAnswer" placeholder="请在与AI讨论后，在这里填写你的最终答案。">${record.finalTextAnswer || ""}</textarea>
          </label>
          <button class="primary" type="submit">提交论述题答案</button>
        </form>
      </article>
      <aside class="panel task-side">
        <div class="role-profile">
          <span class="role-badge">${role.badge}</span>
          <h3>${role.name}</h3>
        </div>
        <div class="ai-card ${role.id}">
          <div class="ai-warning">${role.warning}</div>
          <div class="ai-card-header">
            <span class="role-badge">${role.badge}</span>
            <strong>${role.name}</strong>
          </div>
          <p>你可以先提出想讨论的问题，我会结合材料协助你整理思路。</p>
        </div>
        ${chatBoxMarkup(role, record)}
      </aside>
    </section>
  `);

  const essayForm = document.querySelector("#essayForm");
  essayForm.finalTextAnswer.addEventListener("input", (event) => {
    record.finalTextAnswer = event.currentTarget.value;
    state.taskRecords[key] = record;
    saveState();
  });

  essayForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const finalTextAnswer = event.currentTarget.finalTextAnswer.value.trim();
    if (!finalTextAnswer) return alert("请填写最终答案。");
    record.finalTextAnswer = finalTextAnswer;
    record.finalRtMs = Date.now() - (record.initialStartedAt || state.stepStartedAt);
    record.stage = "done";
    state.taskRecords[key] = record;
    saveState();
    goNext();
  });

  document.querySelector("#chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.chatInput;
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    await sendChatMessage(step, question, role, record, key, content);
  });
}

async function sendChatMessage(step, question, role, record, key, content) {
  const now = new Date().toISOString();
  record.chatMessages = record.chatMessages || [];
  record.chatMessages.push({ sender: "user", content, timestamp: now });
  const pendingId = `pending_${Date.now()}`;
  record.chatMessages.push({ sender: "ai", content: "正在回复，请稍候。", timestamp: now, pending: true, id: pendingId });
  state.taskRecords[key] = record;
  saveState();
  render();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        roleId: role.id,
        taskType: question.type || "choice",
        accuracy: step.accuracy || "",
        suggestedAnswer: record.aiSuggestion?.suggestedAnswer,
        history: record.chatMessages.filter((message) => !message.pending),
        message: content
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    replacePendingMessage(record, pendingId, {
      sender: "ai",
      content: payload.reply.content,
      timestamp: payload.reply.timestamp,
      model: payload.reply.model,
      validationStatus: payload.reply.validationStatus,
      fallback: payload.reply.fallback
    });
  } catch (error) {
    replacePendingMessage(record, pendingId, {
      sender: "ai",
      content: question.type === "essay"
        ? `${role.intro} 可以先从问题表现、原因分析和解决措施三个方面整理，再形成最终答案。`
        : `${role.intro} 我建议你继续围绕前面的答案与法条进行核实，再作最终判断。`,
      timestamp: new Date().toISOString(),
      validationStatus: error.message,
      fallback: true
    });
  }
  state.taskRecords[key] = record;
  saveState();
  render();
}

function replacePendingMessage(record, pendingId, nextMessage) {
  const index = (record.chatMessages || []).findIndex((message) => message.id === pendingId);
  if (index >= 0) {
    record.chatMessages[index] = nextMessage;
  } else {
    record.chatMessages = record.chatMessages || [];
    record.chatMessages.push(nextMessage);
  }
}

async function requestAiSuggestion(step, question, role, record, key) {
  renderShell(`
    <section class="panel loading-panel">
      <div class="ai-warning">${role.warning}</div>
      <div class="loader"></div>
      <h2>${role.name}正在生成建议</h2>
      <p class="muted">请稍候，正在整理参考建议。</p>
    </section>
  `);

  try {
    const response = await fetch("/api/ai-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, roleId: role.id, accuracy: step.accuracy })
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    record.aiSuggestion = payload.suggestion;
  } catch (error) {
    record.aiSuggestion = {
      suggestedAnswer: step.accuracy === "correct" ? question.correctAnswer : question.wrongAnswer,
      explanation: `${role.intro} 我的建议是选择 ${step.accuracy === "correct" ? question.correctAnswer : question.wrongAnswer}。`,
      optionAnalysis: Object.entries(question.options).map(([key, value]) => `${key}. ${value}`),
      uncertaintyNote: "请结合题干和法条继续核实。",
      source: "client_fallback",
      validationStatus: error.message
    };
  }
  record.stage = "final";
  record.finalStartedAt = Date.now();
  state.taskRecords[key] = record;
  saveState();
  render();
}

function scoreBigFive(responses) {
  const max = scales.bigFive.max;
  const result = {};
  Object.entries(bigFiveScoring).forEach(([key, config]) => {
    const reverseSet = new Set(config.reverse);
    const score = config.items.reduce((sum, itemNo) => {
      const raw = Number(responses[itemNo]);
      return sum + (reverseSet.has(itemNo) ? max + 1 - raw : raw);
    }, 0);
    result[key] = { label: config.label, score };
  });
  return result;
}

async function saveSessionToServer() {
  const payload = {
    participantId: state.participantId,
    participantInfo: currentParticipantInfo(),
    scheduleId: state.scheduleId,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    taskRecords: state.taskRecords,
    scaleResponses: state.scaleResponses,
    bigFiveScores: state.bigFiveScores
  };
  const response = await fetch("/api/save-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  state.saved = await response.json();
  state.completed = true;
  saveState();
  render();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.participantId || "participant"}-session.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderComplete() {
  renderShell(`
    <section class="panel complete-panel">
      <div class="section-label">Complete</div>
      <h2>实验已完成</h2>
      <p class="muted">请联系主试保存本次数据。</p>
      <div class="button-row">
        <button class="primary" id="saveServer" type="button">${state.saved ? "已保存，可再次保存" : "保存数据"}</button>
      </div>
      ${state.saved ? `<p class="success">数据已保存。</p>` : ""}
    </section>
  `);

  document.querySelector("#saveServer").addEventListener("click", async () => {
    try {
      await saveSessionToServer();
    } catch (error) {
      alert(`保存失败：${error.message}`);
    }
  });
}

function render() {
  if (!state.steps.length) return renderStart();
  const step = currentStep();
  if (!step) return renderStart();
  if (step.type === "task") return renderTask(step);
  if (step.type === "instruction") return renderInstruction(step);
  if (step.type === "postCombined") return renderPostCombined(step);
  if (step.type === "scale") return renderScale(step);
  if (step.type === "complete") return renderComplete();
}

render();
