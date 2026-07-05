(function(){
  "use strict";

  // ---------- Constants ----------
  var FOCUS_SECONDS = 25 * 60;
  var BREAK_SECONDS = 5 * 60;
  var RADIUS = 95;
  var CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  var STORAGE_TASKS = "workbench_tasks_v1";
  var STORAGE_TALLY = "workbench_tally_v1"; // { date: 'YYYY-MM-DD', count: n }

  // ---------- State ----------
  var mode = "focus";           // 'focus' | 'break'
  var secondsLeft = FOCUS_SECONDS;
  var totalForMode = FOCUS_SECONDS;
  var timerId = null;
  var isRunning = false;

  // ---------- Elements ----------
  var timeReadout = document.getElementById('timeReadout');
  var timeCaption = document.getElementById('timeCaption');
  var modeBadge = document.getElementById('modeBadge');
  var dialProgress = document.getElementById('dialProgress');
  var dialTicks = document.getElementById('dialTicks');
  var startPauseBtn = document.getElementById('startPauseBtn');
  var resetBtn = document.getElementById('resetBtn');
  var tallyMarks = document.getElementById('tallyMarks');
  var flashOverlay = document.getElementById('flashOverlay');

  var taskInput = document.getElementById('taskInput');
  var addTaskBtn = document.getElementById('addTaskBtn');
  var taskList = document.getElementById('taskList');
  var emptyState = document.getElementById('emptyState');
  var taskCountLabel = document.getElementById('taskCountLabel');
  var taskDoneLabel = document.getElementById('taskDoneLabel');

  var tabTimerBtn = document.getElementById('tabTimerBtn');
  var tabInfoBtn = document.getElementById('tabInfoBtn');
  var workspaceView = document.getElementById('workspaceView');
  var infoPanel = document.getElementById('infoPanel');

  dialProgress.setAttribute('stroke-dasharray', CIRCUMFERENCE.toFixed(1));

  // draw tick marks around the dial (every 30 degrees, 12 ticks)
  (function drawTicks(){
    var cx = 110, cy = 110, rOuter = 95, rInnerLong = 82, rInnerShort = 87;
    for (var i = 0; i < 12; i++){
      var angle = (i * 30) * Math.PI / 180;
      var isLong = i % 3 === 0;
      var rInner = isLong ? rInnerLong : rInnerShort;
      var x1 = cx + rOuter * Math.cos(angle);
      var y1 = cy + rOuter * Math.sin(angle);
      var x2 = cx + rInner * Math.cos(angle);
      var y2 = cy + rInner * Math.sin(angle);
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      dialTicks.appendChild(line);
    }
  })();

  // ---------- Audio chime (Web Audio API, no external file) ----------
  var audioCtx = null;
  function ensureAudioCtx(){
    if (!audioCtx){
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playChime(){
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    var notes = [880, 1108.73]; // A5, C#6 - simple bright two-note chime
    notes.forEach(function(freq, idx){
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var start = now + idx * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  function flashScreen(){
    flashOverlay.classList.remove('flashing');
    void flashOverlay.offsetWidth; // restart animation
    flashOverlay.classList.add('flashing');
  }

  // ---------- Formatting ----------
  function formatTime(totalSeconds){
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function updateDial(){
    var fraction = secondsLeft / totalForMode;
    var offset = CIRCUMFERENCE * (1 - fraction);
    dialProgress.setAttribute('stroke-dashoffset', offset.toFixed(1));
  }

  function render(){
    timeReadout.textContent = formatTime(secondsLeft);
    updateDial();
    if (mode === 'focus'){
      modeBadge.textContent = 'Focus session';
      modeBadge.classList.remove('break');
      dialProgress.classList.remove('break');
      timeCaption.textContent = isRunning ? 'minutes remaining' : (secondsLeft === totalForMode ? 'ready when you are' : 'paused');
    } else {
      modeBadge.textContent = 'Break';
      modeBadge.classList.add('break');
      dialProgress.classList.add('break');
      timeCaption.textContent = isRunning ? 'stretch, breathe, look away' : (secondsLeft === totalForMode ? 'break ready' : 'paused');
    }
    startPauseBtn.textContent = isRunning ? 'Pause' : (secondsLeft === totalForMode ? 'Start' : 'Resume');
  }

  // ---------- Tally (session counter) ----------
  function todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  }

  function loadTally(){
    try{
      var raw = localStorage.getItem(STORAGE_TALLY);
      if (!raw) return 0;
      var data = JSON.parse(raw);
      if (data.date !== todayKey()) return 0;
      return data.count || 0;
    } catch(e){ return 0; }
  }

  function saveTally(count){
    try{
      localStorage.setItem(STORAGE_TALLY, JSON.stringify({ date: todayKey(), count: count }));
    } catch(e){}
  }

  var sessionCount = loadTally();

  function renderTally(){
    tallyMarks.innerHTML = '';
    if (sessionCount === 0){
      var empty = document.createElement('span');
      empty.className = 'tally-empty';
      empty.textContent = 'No sessions completed yet today.';
      tallyMarks.appendChild(empty);
      return;
    }
    var fullGroups = Math.floor(sessionCount / 5);
    var remainder = sessionCount % 5;
    for (var g = 0; g < fullGroups; g++){
      tallyMarks.appendChild(makeTallyGroup(5));
    }
    if (remainder > 0){
      tallyMarks.appendChild(makeTallyGroup(remainder));
    }
    var label = document.createElement('span');
    label.className = 'tally-count-label';
    label.textContent = sessionCount + (sessionCount === 1 ? ' session' : ' sessions');
    tallyMarks.appendChild(label);
  }

  function makeTallyGroup(strokes){
    var group = document.createElement('div');
    group.className = 'tally-group';
    for (var i = 0; i < strokes; i++){
      var span = document.createElement('span');
      group.appendChild(span);
    }
    return group;
  }

  function incrementTally(){
    sessionCount += 1;
    saveTally(sessionCount);
    renderTally();
  }

  // ---------- Timer control ----------
  function tick(){
    secondsLeft -= 1;
    if (secondsLeft <= 0){
      handleModeComplete();
      return;
    }
    render();
  }

  function handleModeComplete(){
    stopInterval();
    isRunning = false;
    playChime();
    flashScreen();

    if (mode === 'focus'){
      incrementTally();
      mode = 'break';
      totalForMode = BREAK_SECONDS;
      secondsLeft = BREAK_SECONDS;
    } else {
      mode = 'focus';
      totalForMode = FOCUS_SECONDS;
      secondsLeft = FOCUS_SECONDS;
    }
    render();
    startInterval(); // auto-continue into the next phase
    isRunning = true;
    render();
  }

  function startInterval(){
    stopInterval();
    timerId = setInterval(tick, 1000);
  }

  function stopInterval(){
    if (timerId){
      clearInterval(timerId);
      timerId = null;
    }
  }

  function toggleStartPause(){
    ensureAudioCtx();
    if (isRunning){
      isRunning = false;
      stopInterval();
    } else {
      isRunning = true;
      startInterval();
    }
    render();
  }

  function resetTimer(){
    isRunning = false;
    stopInterval();
    totalForMode = (mode === 'focus') ? FOCUS_SECONDS : BREAK_SECONDS;
    secondsLeft = totalForMode;
    render();
  }

  startPauseBtn.addEventListener('click', toggleStartPause);
  resetBtn.addEventListener('click', resetTimer);

  // ---------- Task ledger ----------
  var tasks = []; // { id, text, done }

  function loadTasks(){
    try{
      var raw = localStorage.getItem(STORAGE_TASKS);
      tasks = raw ? JSON.parse(raw) : [];
    } catch(e){ tasks = []; }
  }

  function saveTasks(){
    try{
      localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
    } catch(e){}
  }

  function renderTasks(){
    taskList.innerHTML = '';
    if (tasks.length === 0){
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      tasks.forEach(function(task){
        var li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '');

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.done;
        checkbox.setAttribute('aria-label', 'Mark task complete');
        checkbox.addEventListener('change', function(){
          task.done = checkbox.checked;
          saveTasks();
          renderTasks();
        });

        var span = document.createElement('span');
        span.className = 'task-text';
        span.textContent = task.text;

        var delBtn = document.createElement('button');
        delBtn.className = 'task-del';
        delBtn.setAttribute('aria-label', 'Delete task');
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', function(){
          tasks = tasks.filter(function(t){ return t.id !== task.id; });
          saveTasks();
          renderTasks();
        });

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(delBtn);
        taskList.appendChild(li);
      });
    }

    var openCount = tasks.filter(function(t){ return !t.done; }).length;
    var doneCount = tasks.length - openCount;
    taskCountLabel.textContent = openCount + ' open';
    taskDoneLabel.textContent = doneCount + ' done';
  }

  function addTask(){
    var text = taskInput.value.trim();
    if (!text) return;
    tasks.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2,7), text: text, done: false });
    taskInput.value = '';
    saveTasks();
    renderTasks();
    taskInput.focus();
  }

  addTaskBtn.addEventListener('click', addTask);
  taskInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') addTask();
  });

  // ---------- Tabs ----------
  function showTimerTab(){
    workspaceView.classList.remove('hidden');
    infoPanel.classList.remove('active');
    tabTimerBtn.classList.add('active');
    tabInfoBtn.classList.remove('active');
  }
  function showInfoTab(){
    workspaceView.classList.add('hidden');
    infoPanel.classList.add('active');
    tabInfoBtn.classList.add('active');
    tabTimerBtn.classList.remove('active');
  }
  tabTimerBtn.addEventListener('click', showTimerTab);
  tabInfoBtn.addEventListener('click', showInfoTab);

  // ---------- Init ----------
  loadTasks();
  renderTasks();
  renderTally();
  render();
})();
