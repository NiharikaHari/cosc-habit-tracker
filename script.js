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

function getCurrentStreak(completions, todayStr) {
  let cursor = todayStr;
  if (!completions[cursor]) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  while (completions[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
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

// ---------- Editable window ----------

function isDateEditable(dateStr, todayStr) {
  const windowStartStr = addDays(todayStr, -29);
  return dateStr >= windowStartStr && dateStr <= todayStr;
}

// ---------- Calendar grid math ----------

function getMonthGridDates(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ dateStr: null, isPad: true });
    } else {
      const dateStr = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`;
      cells.push({ dateStr, isPad: false, dayNum });
    }
  }
  return cells;
}

// ---------- State ----------

let state = loadState();
const calendarViewState = new Map(); // habitId -> { year, month }

// ---------- DOM refs ----------

const habitListEl = document.getElementById("habitList");
const emptyHintEl = document.getElementById("emptyHint");
const newHabitNameInput = document.getElementById("newHabitName");
const addHabitBtn = document.getElementById("addHabitBtn");
const habitCardTemplate = document.getElementById("habitCardTemplate");
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
  });
  saveState(state);
  newHabitNameInput.value = "";
  renderApp();
}

function deleteHabit(habitId) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const confirmed = confirm(`Delete "${habit.name}"? This cannot be undone.`);
  if (!confirmed) return;
  state.habits = state.habits.filter((h) => h.id !== habitId);
  calendarViewState.delete(habitId);
  saveState(state);
  renderApp();
}

function toggleDay(habitId, dateStr, cardEl) {
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
  renderStreaks(habit, cardEl);
  renderCalendarGrid(habit, cardEl);
}

// ---------- Rendering ----------

function renderStreaks(habit, cardEl) {
  const todayStr = getTodayString();
  cardEl.querySelector(".current-streak-value").textContent = getCurrentStreak(habit.completions, todayStr);
  cardEl.querySelector(".best-streak-value").textContent = getBestStreak(habit.completions);
}

function renderCalendarGrid(habit, cardEl) {
  const view = calendarViewState.get(habit.id);
  const { year, month } = view;

  const firstOfMonth = new Date(year, month, 1);
  cardEl.querySelector(".month-label").textContent = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const todayStr = getTodayString();
  const cells = getMonthGridDates(year, month);
  const gridEl = cardEl.querySelector(".day-grid");
  gridEl.innerHTML = "";

  cells.forEach((cell) => {
    if (cell.isPad) {
      const node = dayCellTemplate.content.cloneNode(true);
      const btn = node.querySelector(".day-cell");
      btn.classList.add("pad");
      btn.disabled = true;
      gridEl.appendChild(node);
      return;
    }

    const node = dayCellTemplate.content.cloneNode(true);
    const btn = node.querySelector(".day-cell");
    btn.querySelector(".day-num").textContent = cell.dayNum;

    const isToday = cell.dateStr === todayStr;
    const isCompleted = !!habit.completions[cell.dateStr];
    const editable = isDateEditable(cell.dateStr, todayStr);

    if (isToday) btn.classList.add("today");
    if (isCompleted) btn.classList.add("completed");
    if (!editable) btn.disabled = true;

    btn.addEventListener("click", () => toggleDay(habit.id, cell.dateStr, cardEl));

    gridEl.appendChild(node);
  });
}

function renderHabitCard(habit) {
  if (!calendarViewState.has(habit.id)) {
    const now = new Date();
    calendarViewState.set(habit.id, { year: now.getFullYear(), month: now.getMonth() });
  }

  const node = habitCardTemplate.content.cloneNode(true);
  const cardEl = node.querySelector(".habit-card");
  cardEl.querySelector(".habit-name").textContent = habit.name;
  cardEl.querySelector(".delete-habit").addEventListener("click", () => deleteHabit(habit.id));

  cardEl.querySelector(".prev-month").addEventListener("click", () => {
    const view = calendarViewState.get(habit.id);
    const d = new Date(view.year, view.month - 1, 1);
    calendarViewState.set(habit.id, { year: d.getFullYear(), month: d.getMonth() });
    renderCalendarGrid(habit, cardEl);
  });
  cardEl.querySelector(".next-month").addEventListener("click", () => {
    const view = calendarViewState.get(habit.id);
    const d = new Date(view.year, view.month + 1, 1);
    calendarViewState.set(habit.id, { year: d.getFullYear(), month: d.getMonth() });
    renderCalendarGrid(habit, cardEl);
  });

  renderStreaks(habit, cardEl);
  renderCalendarGrid(habit, cardEl);

  habitListEl.appendChild(node);
}

function renderApp() {
  emptyHintEl.classList.toggle("hidden", state.habits.length > 0);
  habitListEl.innerHTML = "";
  state.habits.forEach((habit) => renderHabitCard(habit));
}

// ---------- Event wiring ----------

addHabitBtn.addEventListener("click", () => addHabit(newHabitNameInput.value));
newHabitNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addHabit(newHabitNameInput.value);
});

renderApp();
