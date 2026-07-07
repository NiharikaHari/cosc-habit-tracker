const STORAGE_KEY = "habit-tracker-state";
const DEFAULT_STATE = { habits: [] };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE, habits: [] };
  } catch {
    return { ...DEFAULT_STATE, habits: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeHabitId() {
  return "h_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---------- Palette ----------

const PALETTE_KEYS = ["green", "blue", "amber", "rose", "purple", "teal", "indigo", "lime"];
const PALETTE_HUES = {
  green: 142,
  blue: 217,
  amber: 38,
  rose: 340,
  purple: 271,
  teal: 174,
  indigo: 231,
  lime: 84,
};
const SHADE_LIGHTNESS = [78, 64, 50, 38, 27];
const SHADE_SATURATION = 65;

function assignHabitColor(index) {
  return PALETTE_KEYS[index % PALETTE_KEYS.length];
}

function getShadeColors(colorKey) {
  const hue = PALETTE_HUES[colorKey] ?? PALETTE_HUES[PALETTE_KEYS[0]];
  return SHADE_LIGHTNESS.map((lightness) => `hsl(${hue} ${SHADE_SATURATION}% ${lightness}%)`);
}

function normalizeState(state) {
  state.habits.forEach((habit, i) => {
    if (!habit.color) {
      habit.color = assignHabitColor(i);
    }
  });
  return state;
}

// ---------- Date helpers (local calendar dates, never UTC) ----------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getTodayString() {
  return formatDate(new Date());
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateStr, delta) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

// ---------- Streak calculation ----------

function getStreakLengthEndingOn(completions, dateStr) {
  if (!completions[dateStr]) return 0;
  let streak = 0;
  let cursor = dateStr;
  while (completions[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function getCurrentStreak(completions, todayStr) {
  const todayLen = getStreakLengthEndingOn(completions, todayStr);
  if (todayLen > 0) return todayLen;
  return getStreakLengthEndingOn(completions, addDays(todayStr, -1));
}

function getBestStreak(completions) {
  const dates = Object.keys(completions).filter((d) => completions[d]).sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (addDays(dates[i - 1], 1) === dates[i]) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
  }
  return best;
}

function getShadeBucket(streakLength) {
  if (streakLength <= 0) return 0;
  return Math.min(streakLength, 5);
}

// ---------- Editable window ----------

function isDateEditable(dateStr, todayStr) {
  const windowStartStr = addDays(todayStr, -29);
  return dateStr >= windowStartStr && dateStr <= todayStr;
}

// ---------- Date window (shared across all habits) ----------

const WINDOW_SIZE = 14;
const WINDOW_STEP = 7;
let windowEnd = getTodayString();

function getVisibleDates() {
  const dates = [];
  for (let i = WINDOW_SIZE - 1; i >= 0; i--) {
    dates.push(addDays(windowEnd, -i));
  }
  return dates;
}

function shiftWindow(deltaDays) {
  const todayStr = getTodayString();
  let next = addDays(windowEnd, deltaDays);
  if (next > todayStr) next = todayStr;
  windowEnd = next;
  renderGrid();
}

// ---------- State ----------

let state = normalizeState(loadState());

// ---------- DOM refs ----------

const habitGridEl = document.getElementById("habitGrid");
const emptyHintEl = document.getElementById("emptyHint");
const totalCompletionsValueEl = document.getElementById("totalCompletionsValue");
const windowLabelEl = document.getElementById("windowLabel");
const prevWindowBtn = document.getElementById("prevWindowBtn");
const nextWindowBtn = document.getElementById("nextWindowBtn");
const dayCellTemplate = document.getElementById("dayCellTemplate");

// ---------- Mutations ----------

function addHabit(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  state.habits.push({
    id: makeHabitId(),
    name: trimmed,
    createdAt: getTodayString(),
    completions: {},
    color: assignHabitColor(state.habits.length),
  });
  saveState(state);
  renderGrid();
}

function deleteHabit(habitId) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const confirmed = confirm(`Delete "${habit.name}"? This cannot be undone.`);
  if (!confirmed) return;
  state.habits = state.habits.filter((h) => h.id !== habitId);
  saveState(state);
  renderGrid();
}

function toggleDay(habitId, dateStr) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const todayStr = getTodayString();
  if (!isDateEditable(dateStr, todayStr)) return;
  if (habit.completions[dateStr]) {
    delete habit.completions[dateStr];
  } else {
    habit.completions[dateStr] = true;
  }
  saveState(state);
  renderGrid();
}

// ---------- Rendering ----------

function renderHeaderStats() {
  const total = state.habits.reduce((sum, h) => sum + Object.keys(h.completions).length, 0);
  totalCompletionsValueEl.textContent = total;
}

function renderWindowLabel() {
  const dates = getVisibleDates();
  const start = parseDate(dates[0]);
  const end = parseDate(dates[dates.length - 1]);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  windowLabelEl.textContent = `${startLabel} - ${endLabel}`;
  nextWindowBtn.disabled = windowEnd === getTodayString();
}

function renderDateHeaderRow() {
  const todayStr = getTodayString();
  const nameHeader = document.createElement("div");
  habitGridEl.appendChild(nameHeader);

  getVisibleDates().forEach((dateStr) => {
    const cell = document.createElement("div");
    cell.className = "date-header";
    if (dateStr === todayStr) cell.classList.add("is-today");
    const d = parseDate(dateStr);
    cell.innerHTML = `${d.toLocaleDateString(undefined, { month: "short" })}<br>${d.getDate()}`;
    habitGridEl.appendChild(cell);
  });

  ["Current", "Best", "Total"].forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "stat-header";
    cell.textContent = label;
    habitGridEl.appendChild(cell);
  });
}

function renderHabitRow(habit) {
  const todayStr = getTodayString();
  const shades = getShadeColors(habit.color);

  const nameCell = document.createElement("div");
  nameCell.className = "col-name";
  nameCell.style.setProperty("--s4", shades[3]);
  const nameLabel = document.createElement("span");
  nameLabel.className = "habit-name-label";
  nameLabel.textContent = habit.name;
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn icon delete-habit";
  deleteBtn.title = "Delete habit";
  deleteBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
  deleteBtn.addEventListener("click", () => deleteHabit(habit.id));
  nameCell.appendChild(nameLabel);
  nameCell.appendChild(deleteBtn);
  habitGridEl.appendChild(nameCell);

  getVisibleDates().forEach((dateStr) => {
    const node = dayCellTemplate.content.cloneNode(true);
    const btn = node.querySelector(".day-cell");
    btn.style.setProperty("--s1", shades[0]);
    btn.style.setProperty("--s2", shades[1]);
    btn.style.setProperty("--s3", shades[2]);
    btn.style.setProperty("--s4", shades[3]);
    btn.style.setProperty("--s5", shades[4]);

    const bucket = getShadeBucket(getStreakLengthEndingOn(habit.completions, dateStr));
    if (bucket > 0) btn.classList.add(`shade-${bucket}`);

    const editable = isDateEditable(dateStr, todayStr);
    if (!editable) btn.disabled = true;
    btn.title = dateStr;
    btn.addEventListener("click", () => toggleDay(habit.id, dateStr));

    habitGridEl.appendChild(node);
  });

  const currentStreak = getCurrentStreak(habit.completions, todayStr);
  const bestStreak = getBestStreak(habit.completions);
  const totalCount = Object.keys(habit.completions).length;

  const currentCell = document.createElement("div");
  currentCell.className = "col-current";
  currentCell.style.setProperty("--s4", shades[3]);
  const currentBadge = document.createElement("span");
  currentBadge.className = "stat-circle" + (currentStreak > 0 ? " active" : "");
  currentBadge.textContent = currentStreak;
  currentCell.appendChild(currentBadge);
  habitGridEl.appendChild(currentCell);

  const bestCell = document.createElement("div");
  bestCell.className = "col-best";
  bestCell.style.setProperty("--s4", shades[3]);
  const bestBadge = document.createElement("span");
  bestBadge.className = "stat-circle" + (bestStreak > 0 ? " active" : "");
  bestBadge.textContent = bestStreak;
  bestCell.appendChild(bestBadge);
  habitGridEl.appendChild(bestCell);

  const totalCell = document.createElement("div");
  totalCell.className = "col-total";
  const totalSpan = document.createElement("span");
  totalSpan.className = "total-count";
  totalSpan.textContent = totalCount;
  totalCell.appendChild(totalSpan);
  habitGridEl.appendChild(totalCell);
}

function renderTotalsRow() {
  const nameCell = document.createElement("div");
  nameCell.className = "col-name totals-row";
  habitGridEl.appendChild(nameCell);

  getVisibleDates().forEach((dateStr) => {
    const cell = document.createElement("div");
    cell.className = "date-header totals-row";
    const sum = state.habits.reduce((acc, h) => acc + (h.completions[dateStr] ? 1 : 0), 0);
    cell.textContent = sum;
    habitGridEl.appendChild(cell);
  });

  for (let i = 0; i < 3; i++) {
    const cell = document.createElement("div");
    cell.className = "col-total totals-row";
    habitGridEl.appendChild(cell);
  }
}

function renderAddHabitRow() {
  const row = document.createElement("div");
  row.className = "add-habit-row";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "add-habit-trigger";
  trigger.textContent = "+ New Habit";

  const form = document.createElement("div");
  form.className = "add-habit-form hidden";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "e.g. Drink water";
  form.appendChild(input);

  trigger.addEventListener("click", () => {
    trigger.classList.add("hidden");
    form.classList.remove("hidden");
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addHabit(input.value);
    if (e.key === "Escape") renderGrid();
  });
  input.addEventListener("blur", () => {
    if (!input.value.trim()) renderGrid();
  });

  row.appendChild(trigger);
  row.appendChild(form);
  habitGridEl.appendChild(row);
}

function renderGrid() {
  emptyHintEl.classList.toggle("hidden", state.habits.length > 0);
  habitGridEl.innerHTML = "";
  renderHeaderStats();
  renderWindowLabel();
  renderDateHeaderRow();
  state.habits.forEach((habit) => renderHabitRow(habit));
  if (state.habits.length > 0) renderTotalsRow();
  renderAddHabitRow();
}

// ---------- Event wiring ----------

prevWindowBtn.addEventListener("click", () => shiftWindow(-WINDOW_STEP));
nextWindowBtn.addEventListener("click", () => shiftWindow(WINDOW_STEP));

renderGrid();
