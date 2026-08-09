const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const todayStr=()=>new Date().toISOString().slice(0,10);
const addDays=(dateStr,n)=>{const d=new Date(dateStr+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
const fmtDate=(d)=>new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const fmtDateTime=(ts)=>new Date(ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const uid=()=>Math.random().toString(36).slice(2,9);

const STORAGE_PREFIX='thelog_';

let DATA={
  habits:[],
  tasks:[],
  moods:{},
  finance:[],
  health:[],
  goals:[],
  journal:[],      // {id,date,ts,text} - append only
  tomorrow:[],      // {id,date,ts,text} - append only, date = date the plan is FOR
  challenges:[],    // {id,name,startDate,duration,rules:[],log:{date:{ruleIdx:bool}}}
  phone:{usualMinutes:120,logs:[]},
  reviews:[]        // {id,ts,text,model}
};

function loadAll(){
  const keys=['habits','tasks','moods','finance','health','goals','journal','tomorrow','challenges','phone','reviews'];
  for(const k of keys){
    try{
      const raw=localStorage.getItem(STORAGE_PREFIX+k);
      if(raw) DATA[k]=JSON.parse(raw);
    }catch(e){ /* keep default */ }
  }
}
function save(key){
  try{ localStorage.setItem(STORAGE_PREFIX+key,JSON.stringify(DATA[key])); }
  catch(e){ console.error('save failed',key,e); }
}

function initHeader(){
  $('#today-badge').textContent='LOG — '+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}

function setTab(name){
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  render(name);
}

function render(tab){
  const main=$('#main');
  const map={
    today:renderToday, habits:renderHabits, tasks:renderTasks, mood:renderMood,
    finance:renderFinance, health:renderHealth, goals:renderGoals,
    journal:renderJournal, tomorrow:renderTomorrow, challenges:renderChallenges,
    phone:renderPhone, activity:renderActivity, achievements:renderAchievements, review:renderReview
  };
  main.innerHTML=map[tab]();
  bindEvents(tab);
}

function escapeHtml(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function moodEmoji(s){return ['','😔','😕','😐','🙂','😄'][s]||'—';}

/* ================= TODAY ================= */
function renderToday(){
  const t=todayStr();
  const openTasks=DATA.tasks.filter(x=>!x.done).length;
  const habitsToday=DATA.habits.filter(h=>h.log.includes(t)).length;
  const totalHabits=DATA.habits.length;
  const moodToday=DATA.moods[t];
  const balance=DATA.finance.reduce((s,x)=>s+(x.type==='income'?x.amount:-x.amount),0);
  const activeGoals=DATA.goals.filter(g=>g.progress<100).length;
  const journalCount=DATA.journal.length;
  const activeChallenges=DATA.challenges.filter(c=>challengeStatus(c).status==='active').length;
  const unlocked=computeAchievements().filter(a=>a.unlocked).length;
  const phoneToday=phoneTodayTotal();
  const overUsual=phoneToday>DATA.phone.usualMinutes;

  return `
    ${overUsual?`<div class="banner warn"><span>📵</span><div>You've used your phone <strong>${phoneToday} min</strong> today — more than your usual ${DATA.phone.usualMinutes} min. Consider stepping away from ${topAppToday()} for the rest of the day.</div></div>`:''}
    <div class="section-title">Today at a glance</div>
    <div class="grid grid-3">
      <div class="card stat"><div class="num">${habitsToday}/${totalHabits}</div><div class="label">Habits done</div></div>
      <div class="card stat"><div class="num">${openTasks}</div><div class="label">Open tasks</div></div>
      <div class="card stat">${moodToday? '<div class="num">'+moodEmoji(moodToday.score)+'</div>':'<div class="num" style="color:var(--ink-faint)">—</div>'}<div class="label">Mood logged</div></div>
      <div class="card stat"><div class="num">${balance>=0?'':'-'}$${Math.abs(balance).toLocaleString(undefined,{maximumFractionDigits:0})}</div><div class="label">Balance</div></div>
      <div class="card stat"><div class="num">${activeGoals}</div><div class="label">Goals in progress</div></div>
      <div class="card stat"><div class="num">${journalCount}</div><div class="label">Journal entries</div></div>
      <div class="card stat"><div class="num">${activeChallenges}</div><div class="label">Active challenges</div></div>
      <div class="card stat"><div class="num">${unlocked}/${ACHIEVEMENTS.length}</div><div class="label">Achievements</div></div>
      <div class="card stat"><div class="num">${phoneToday}m</div><div class="label">Phone today</div></div>
    </div>
    <div class="section-title" style="margin-top:1.2rem;">Quick log</div>
    <div class="card">
      <div class="field"><label>Mood right now</label>
        <div class="mood-scale" id="quick-mood">
          ${[1,2,3,4,5].map(s=>`<div class="mood-opt ${moodToday&&moodToday.score===s?'selected':''}" data-score="${s}">${moodEmoji(s)}</div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ================= HABITS ================= */
function last7(){ const arr=[]; for(let i=6;i>=0;i--){arr.push(addDays(todayStr(),-i));} return arr; }
function calcStreak(log){
  let streak=0; let d=todayStr();
  while(log.includes(d)){streak++;d=addDays(d,-1);}
  return streak;
}
function renderHabits(){
  const days=last7();
  return `
    <div class="section-title">Habits <span class="tag" style="background:var(--habits-bg);color:var(--habits)">${DATA.habits.length} tracked</span></div>
    <div class="card"><div class="row">
      <div class="field"><label>New habit</label><input id="habit-name" placeholder="e.g. Read 20 minutes"></div>
      <button class="btn" id="add-habit">Add habit</button>
    </div></div>
    <div class="card">
      ${DATA.habits.length===0?'<div class="empty">No habits yet. Add one above to start your streak.</div>':
        DATA.habits.map(h=>`
        <div class="habit-row">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-days">
            ${days.map(d=>`<div class="day-box ${h.log.includes(d)?'checked':''}" data-habit="${h.id}" data-day="${d}">${new Date(d+'T00:00:00').getDate()}</div>`).join('')}
          </div>
          <div class="streak">${calcStreak(h.log)}d streak</div>
          <button class="icon-btn" data-del-habit="${h.id}">✕</button>
        </div>`).join('')}
    </div>
  `;
}

/* ================= TASKS ================= */
function renderTasks(){
  const open=DATA.tasks.filter(t=>!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const done=DATA.tasks.filter(t=>t.done);
  return `
    <div class="section-title">Tasks <span class="tag" style="background:var(--tasks-bg);color:var(--tasks)">${open.length} open</span></div>
    <div class="card"><div class="row">
      <div class="field"><label>Task</label><input id="task-name" placeholder="What needs doing?"></div>
      <div class="field" style="flex:0 0 140px;"><label>Due</label><input type="date" id="task-due"></div>
      <div class="field" style="flex:0 0 110px;"><label>Priority</label>
        <select id="task-priority"><option value="low">Low</option><option value="med" selected>Medium</option><option value="high">High</option></select>
      </div>
      <button class="btn" id="add-task">Add task</button>
    </div></div>
    <div class="card">
      ${open.length===0?'<div class="empty">Nothing open. Add a task above.</div>':
        open.map(t=>`
        <div class="list-item">
          <input type="checkbox" data-toggle-task="${t.id}">
          <div class="main">
            <div class="title">${escapeHtml(t.name)}</div>
            <div class="meta">${t.due?fmtDate(t.due):'No due date'} · <span class="chip" style="background:${priBg(t.priority)};color:${priColor(t.priority)}">${t.priority}</span></div>
          </div>
          <button class="icon-btn" data-del-task="${t.id}">✕</button>
        </div>`).join('')}
    </div>
    ${done.length? `<div class="section-title" style="font-size:1rem;margin-top:1rem;color:var(--ink-soft)">Completed (${done.length})</div>
    <div class="card">${done.map(t=>`
        <div class="list-item done">
          <input type="checkbox" checked data-toggle-task="${t.id}">
          <div class="main"><div class="title">${escapeHtml(t.name)}</div></div>
          <button class="icon-btn" data-del-task="${t.id}">✕</button>
        </div>`).join('')}</div>`:''}
  `;
}
function priBg(p){return p==='high'?'var(--health-bg)':p==='med'?'var(--tasks-bg)':'var(--paper-2)';}
function priColor(p){return p==='high'?'var(--health)':p==='med'?'var(--tasks)':'var(--ink-soft)';}

/* ================= MOOD ================= */
function renderMood(){
  const days=[]; for(let i=13;i>=0;i--){days.push(addDays(todayStr(),-i));}
  const t=todayStr(); const todayMood=DATA.moods[t];
  return `
    <div class="section-title">Mood</div>
    <div class="card">
      <label>How are you feeling today?</label>
      <div class="mood-scale" id="mood-scale">
        ${[1,2,3,4,5].map(s=>`<div class="mood-opt ${todayMood&&todayMood.score===s?'selected':''}" data-score="${s}">${moodEmoji(s)}</div>`).join('')}
      </div>
      <div class="field"><label>Note (optional)</label><input id="mood-note" placeholder="What's on your mind?" value="${todayMood?escapeHtml(todayMood.note||''):''}"></div>
      <button class="btn" id="save-mood">Save today's mood</button>
    </div>
    <div class="section-title" style="font-size:1rem;">Last 14 days</div>
    <div class="card"><div class="mood-track">
      ${days.map(d=>{const m=DATA.moods[d];const h=m?m.score*20:4;
        return `<div class="mood-bar" style="height:100%;"><div class="fill" style="height:${h}%"></div><div class="lbl">${new Date(d+'T00:00:00').getDate()}</div></div>`;
      }).join('')}
    </div></div>
  `;
}

/* ================= FINANCE ================= */
function renderFinance(){
  const balance=DATA.finance.reduce((s,x)=>s+(x.type==='income'?x.amount:-x.amount),0);
  const monthKey=new Date().toISOString().slice(0,7);
  const monthTx=DATA.finance.filter(x=>x.date.startsWith(monthKey));
  const monthIncome=monthTx.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const monthExpense=monthTx.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const recent=[...DATA.finance].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  return `
    <div class="section-title">Money</div>
    <div class="grid grid-3">
      <div class="card stat"><div class="balance ${balance<0?'neg':''}">$${balance.toLocaleString(undefined,{maximumFractionDigits:0})}</div><div class="label">Balance</div></div>
      <div class="card stat"><div class="num" style="color:var(--finance)">$${monthIncome.toLocaleString(undefined,{maximumFractionDigits:0})}</div><div class="label">In this month</div></div>
      <div class="card stat"><div class="num" style="color:var(--tasks)">$${monthExpense.toLocaleString(undefined,{maximumFractionDigits:0})}</div><div class="label">Out this month</div></div>
    </div>
    <div class="card"><div class="row">
      <div class="field" style="flex:0 0 130px;"><label>Type</label>
        <div class="toggle-group" id="tx-type">
          <div class="toggle-opt income selected" data-type="expense" id="opt-expense">Expense</div>
          <div class="toggle-opt income" data-type="income" id="opt-income">Income</div>
        </div>
      </div>
      <div class="field" style="flex:0 0 110px;"><label>Amount</label><input type="number" step="0.01" id="tx-amount" placeholder="0.00"></div>
      <div class="field"><label>Description</label><input id="tx-desc" placeholder="Groceries, paycheck…"></div>
      <div class="field" style="flex:0 0 130px;"><label>Category</label><input id="tx-cat" placeholder="Food, rent…"></div>
      <button class="btn" id="add-tx">Add</button>
    </div></div>
    <div class="card">
      ${recent.length===0?'<div class="empty">No transactions logged yet.</div>':
        recent.map(x=>`
        <div class="list-item">
          <div class="main">
            <div class="title">${escapeHtml(x.desc||x.category||'Untitled')}</div>
            <div class="meta">${fmtDate(x.date)} ${x.category?'· '+escapeHtml(x.category):''}</div>
          </div>
          <div style="font-family:'IBM Plex Mono',monospace;font-weight:500;color:${x.type==='income'?'var(--finance)':'var(--tasks)'}">${x.type==='income'?'+':'-'}$${x.amount.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
          <button class="icon-btn" data-del-tx="${x.id}">✕</button>
        </div>`).join('')}
    </div>
  `;
}

/* ================= HEALTH ================= */
function renderHealth(){
  const recent=[...DATA.health].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  return `
    <div class="section-title">Health</div>
    <div class="card"><div class="row">
      <div class="field" style="flex:0 0 140px;"><label>Type</label>
        <select id="health-type">
          <option value="weight">Weight</option><option value="exercise">Exercise (min)</option>
          <option value="water">Water (glasses)</option><option value="sleep">Sleep (hrs)</option>
        </select>
      </div>
      <div class="field" style="flex:0 0 100px;"><label>Value</label><input type="number" step="0.1" id="health-value" placeholder="0"></div>
      <div class="field"><label>Note</label><input id="health-note" placeholder="Optional note"></div>
      <button class="btn" id="add-health">Log</button>
    </div></div>
    <div class="card">
      ${recent.length===0?'<div class="empty">No health logs yet.</div>':
        recent.map(h=>`
        <div class="list-item">
          <div class="main">
            <div class="title">${healthLabel(h.type)}: ${h.value}${healthUnit(h.type)}</div>
            <div class="meta">${fmtDate(h.date)} ${h.note?'· '+escapeHtml(h.note):''}</div>
          </div>
          <button class="icon-btn" data-del-health="${h.id}">✕</button>
        </div>`).join('')}
    </div>
  `;
}
function healthLabel(t){return {weight:'Weight',exercise:'Exercise',water:'Water',sleep:'Sleep'}[t]||t;}
function healthUnit(t){return {weight:' lb',exercise:' min',water:' glasses',sleep:' hrs'}[t]||'';}

/* ================= GOALS ================= */
function renderGoals(){
  const active=DATA.goals.filter(g=>g.progress<100);
  const done=DATA.goals.filter(g=>g.progress>=100);
  return `
    <div class="section-title">Goals</div>
    <div class="card"><div class="row">
      <div class="field"><label>Goal</label><input id="goal-name" placeholder="e.g. Run a 10k"></div>
      <div class="field" style="flex:0 0 150px;"><label>Target date</label><input type="date" id="goal-date"></div>
      <button class="btn" id="add-goal">Add goal</button>
    </div></div>
    ${active.length===0?'<div class="card"><div class="empty">No active goals. Add one above.</div></div>':
      active.map(g=>`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div class="title" style="font-size:0.95rem;">${escapeHtml(g.name)}</div>
            <div class="meta" style="font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--ink-soft);margin-top:0.2rem;">${g.date?'Target: '+fmtDate(g.date):'No target date'}</div>
          </div>
          <button class="icon-btn" data-del-goal="${g.id}">✕</button>
        </div>
        <div class="goal-bar"><div class="goal-fill" style="width:${g.progress}%"></div></div>
        <div class="row" style="margin-top:0.6rem;align-items:center;">
          <input type="range" min="0" max="100" step="5" value="${g.progress}" data-goal-progress="${g.id}" style="flex:1;">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:0.8rem;width:40px;text-align:right;">${g.progress}%</span>
        </div>
      </div>`).join('')}
    ${done.length?`<div class="section-title" style="font-size:1rem;color:var(--ink-soft);">Completed</div>
    <div class="card">${done.map(g=>`
      <div class="list-item done"><div class="main"><div class="title">${escapeHtml(g.name)}</div></div>
      <button class="icon-btn" data-del-goal="${g.id}">✕</button></div>`).join('')}</div>`:''}
  `;
}

/* ================= JOURNAL (append-only, git-style history) ================= */
function renderJournal(){
  const sel=window._journalDate||todayStr();
  const versions=DATA.journal.filter(e=>e.date===sel).sort((a,b)=>b.ts-a.ts);
  return `
    <div class="section-title">Journal <span class="tag" style="background:var(--journal-bg);color:var(--journal)">${DATA.journal.length} entries total</span></div>
    <div class="card">
      <div class="row">
        <div class="field" style="flex:0 0 170px;"><label>Writing about</label><input type="date" id="journal-date" value="${sel}"></div>
      </div>
      <div class="field"><label>What happened today</label><textarea id="journal-text" placeholder="Write about your day…"></textarea></div>
      <button class="btn" id="save-journal">Save entry</button>
      <p class="note">Saving never overwrites — it adds a new version below. Nothing you've written is ever lost.</p>
    </div>
    <div class="section-title" style="font-size:1rem;">History for ${fmtDate(sel)}</div>
    <div class="card">
      ${versions.length===0?'<div class="empty">No entries for this date yet.</div>':
        versions.map((v,i)=>`
        <div class="version-item">
          <div class="vhead">
            <span class="vts">${fmtDateTime(v.ts)}</span>
            ${i===0?'<span class="version-badge" style="background:var(--journal-bg);color:var(--journal)">current</span>':'<span class="version-badge" style="background:var(--paper-2);color:var(--ink-faint)">previous version</span>'}
          </div>
          <div class="vtext">${escapeHtml(v.text)}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ================= TOMORROW (append-only) ================= */
function renderTomorrow(){
  const target=window._tomorrowDate||addDays(todayStr(),1);
  const versions=DATA.tomorrow.filter(e=>e.date===target).sort((a,b)=>b.ts-a.ts);
  const todaysPlan=DATA.tomorrow.filter(e=>e.date===todayStr()).sort((a,b)=>b.ts-a.ts)[0];
  return `
    <div class="section-title">Tomorrow</div>
    ${todaysPlan?`
    <div class="card">
      <label>What you told yourself last night to do today</label>
      <div class="vtext">${escapeHtml(todaysPlan.text)}</div>
      <p class="note">Set on ${fmtDateTime(todaysPlan.ts)}. This can't be edited — it's here to hold you to it.</p>
    </div>`:''}
    <div class="card">
      <div class="row">
        <div class="field" style="flex:0 0 170px;"><label>Plan for</label><input type="date" id="tomorrow-date" value="${target}"></div>
      </div>
      <div class="field"><label>Tasks for yourself before you sleep</label><textarea id="tomorrow-text" placeholder="What will you do tomorrow?"></textarea></div>
      <button class="btn" id="save-tomorrow">Lock it in</button>
      <p class="note">Once saved it's permanent — a new save adds another version, the old one always stays visible.</p>
    </div>
    <div class="section-title" style="font-size:1rem;">History for ${fmtDate(target)}</div>
    <div class="card">
      ${versions.length===0?'<div class="empty">No plan set for this date yet.</div>':
        versions.map((v,i)=>`
        <div class="version-item">
          <div class="vhead">
            <span class="vts">${fmtDateTime(v.ts)}</span>
            ${i===0?'<span class="version-badge" style="background:var(--tomorrow-bg);color:var(--tomorrow)">current</span>':'<span class="version-badge" style="background:var(--paper-2);color:var(--ink-faint)">previous version</span>'}
          </div>
          <div class="vtext">${escapeHtml(v.text)}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ================= CHALLENGES ================= */
function challengeStatus(c){
  const dayIndex=Math.floor((new Date(todayStr())-new Date(c.startDate))/86400000)+1;
  return {dayIndex, status: dayIndex>c.duration?'completed':(dayIndex<1?'upcoming':'active')};
}
function challengeDayComplete(c,dateStr){
  const log=c.log[dateStr];
  if(!log) return false;
  return c.rules.every((r,i)=>log[i]);
}
function renderChallenges(){
  return `
    <div class="section-title">Challenges</div>
    <div class="card">
      <div class="row">
        <div class="field"><label>Challenge name</label><input id="ch-name" placeholder="e.g. 75 Hard"></div>
        <div class="field" style="flex:0 0 110px;"><label>Days</label><input type="number" id="ch-days" placeholder="75" min="1"></div>
      </div>
      <div class="field"><label>Daily rules (one per line)</label><textarea id="ch-rules" placeholder="Workout twice a day&#10;Drink a gallon of water&#10;Read 10 pages&#10;Follow a diet, no cheat meals&#10;Take a progress photo"></textarea></div>
      <button class="btn" id="add-challenge">Start challenge</button>
    </div>
    ${DATA.challenges.length===0?'<div class="card"><div class="empty">No challenges yet. Start one above.</div></div>':
      DATA.challenges.map(c=>renderChallengeCard(c)).join('')}
  `;
}
function renderChallengeCard(c){
  const {dayIndex,status}=challengeStatus(c);
  const daysSoFar=Math.min(dayIndex,c.duration);
  let successDays=0,longest=0,cur=0;
  for(let i=1;i<=daysSoFar;i++){
    const ds=addDays(c.startDate,i-1);
    if(challengeDayComplete(c,ds)){successDays++;cur++;longest=Math.max(longest,cur);} else cur=0;
  }
  const pct=daysSoFar? Math.round(successDays/daysSoFar*100):0;
  const barDays=[]; for(let i=Math.max(1,daysSoFar-29);i<=daysSoFar;i++) barDays.push(i);
  const todayIdx=dayIndex;
  const todayLog=(c.log[todayStr()]||{});
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="title" style="font-size:1.05rem;font-family:'Fraunces',serif;">${escapeHtml(c.name)}</div>
          <div class="meta">Day ${Math.min(dayIndex,c.duration)} of ${c.duration} · ${status==='completed'?'Completed':status==='upcoming'?'Starts '+fmtDate(c.startDate):'In progress'}</div>
        </div>
        <button class="icon-btn" data-del-challenge="${c.id}">✕</button>
      </div>
      <div style="display:flex;gap:0.6rem;align-items:center;margin-top:0.6rem;">
        <span class="progress-pill">${pct}% success rate</span>
        <span class="progress-pill" style="background:var(--habits-bg);color:var(--habits)">${longest} day best streak</span>
      </div>
      ${status==='active'?`
      <div style="margin-top:0.9rem;">
        <label>Today's checklist</label>
        ${c.rules.map((r,i)=>`
          <div class="rule-check">
            <input type="checkbox" ${todayLog[i]?'checked':''} data-challenge="${c.id}" data-rule="${i}">
            <span>${escapeHtml(r)}</span>
          </div>`).join('')}
      </div>`:''}
      ${barDays.length? `<div class="bar-chart" style="margin-top:0.9rem;">
        ${barDays.map(i=>{
          const ds=addDays(c.startDate,i-1);
          const log=c.log[ds]||{};
          const done=c.rules.length?c.rules.filter((r,idx)=>log[idx]).length/c.rules.length*100:0;
          return `<div class="bar" style="height:${Math.max(done,3)}%" title="Day ${i}: ${Math.round(done)}%"></div>`;
        }).join('')}
      </div>`:''}
      ${status==='completed'?`<p class="note">Finished with ${successDays}/${c.duration} fully complete days.</p>`:''}
    </div>
  `;
}

/* ================= PHONE ================= */
function phoneTodayTotal(){
  return DATA.phone.logs.filter(l=>l.date===todayStr()).reduce((s,l)=>s+l.minutes,0);
}
function topAppToday(){
  const t=todayStr();
  const byApp={};
  DATA.phone.logs.filter(l=>l.date===t).forEach(l=>{byApp[l.app]=(byApp[l.app]||0)+l.minutes;});
  const sorted=Object.entries(byApp).sort((a,b)=>b[1]-a[1]);
  return sorted.length?sorted[0][0]:'social apps';
}
function renderPhone(){
  const today=phoneTodayTotal();
  const over=today>DATA.phone.usualMinutes;
  const recent=[...DATA.phone.logs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  return `
    <div class="section-title">Phone usage</div>
    <p class="note">A browser can't read your phone's real screen time — log it yourself (from your phone's own Screen Time / Digital Wellbeing report) and this will flag you when you're over your usual.</p>
    ${over?`<div class="banner warn"><span>📵</span><div>You're at <strong>${today} min</strong> today, over your usual ${DATA.phone.usualMinutes} min. Consider putting ${topAppToday()} down for the rest of the day.</div></div>`:''}
    <div class="card">
      <div class="row">
        <div class="field" style="flex:0 0 160px;"><label>Usual daily minutes</label><input type="number" id="phone-usual" value="${DATA.phone.usualMinutes}"></div>
        <button class="btn ghost" id="save-usual">Save</button>
      </div>
    </div>
    <div class="card">
      <div class="row">
        <div class="field"><label>App or service</label><input id="phone-app" placeholder="Instagram, YouTube…"></div>
        <div class="field" style="flex:0 0 110px;"><label>Minutes</label><input type="number" id="phone-minutes" placeholder="0"></div>
        <div class="field" style="flex:0 0 150px;"><label>Date</label><input type="date" id="phone-date" value="${todayStr()}"></div>
        <button class="btn" id="add-phone">Log</button>
      </div>
    </div>
    <div class="card stat" style="margin-bottom:0.9rem;"><div class="num">${today}m</div><div class="label">Logged today</div></div>
    <div class="card">
      ${recent.length===0?'<div class="empty">No usage logged yet.</div>':
        recent.map(l=>`
        <div class="list-item">
          <div class="main"><div class="title">${escapeHtml(l.app)} — ${l.minutes}m</div><div class="meta">${fmtDate(l.date)}</div></div>
          <button class="icon-btn" data-del-phone="${l.id}">✕</button>
        </div>`).join('')}
    </div>
  `;
}

/* ================= ACTIVITY HEATMAP ================= */
function aggregateActivity(){
  const map={};
  const bump=(d)=>{ if(!d) return; map[d]=(map[d]||0)+1; };
  DATA.habits.forEach(h=>h.log.forEach(bump));
  DATA.tasks.forEach(t=>{ if(t.done && t.completedAt) bump(t.completedAt); });
  Object.keys(DATA.moods).forEach(bump);
  DATA.finance.forEach(x=>bump(x.date));
  DATA.health.forEach(h=>bump(h.date));
  DATA.journal.forEach(j=>bump(j.date));
  DATA.tomorrow.forEach(j=>bump(j.date));
  DATA.phone.logs.forEach(l=>bump(l.date));
  DATA.challenges.forEach(c=>Object.keys(c.log||{}).forEach(bump));
  return map;
}
function renderActivity(){
  const map=aggregateActivity();
  const days=[]; for(let i=139;i>=0;i--){days.push(addDays(todayStr(),-i));}
  const activeDays=days.filter(d=>map[d]).length;
  const level=(n)=>!n?0:n<=1?1:n<=3?2:n<=5?3:4;
  return `
    <div class="section-title">Activity <span class="tag" style="background:var(--activity-bg);color:var(--activity)">${activeDays} active days / 140</span></div>
    <div class="card">
      <div class="heatmap-wrap"><div class="heatmap">
        ${days.map(d=>`<div class="heat-cell lvl-${level(map[d])}" title="${fmtDate(d)}: ${map[d]||0} logged"></div>`).join('')}
      </div></div>
      <div class="heat-legend">Less
        <span class="heat-cell lvl-0"></span><span class="heat-cell lvl-1"></span><span class="heat-cell lvl-2"></span><span class="heat-cell lvl-3"></span><span class="heat-cell lvl-4"></span>
      More</div>
    </div>
    <p class="note">Each square counts anything logged that day: habits, tasks finished, mood, money, health, journal, tomorrow's plan, phone logs, and challenge check-ins.</p>
  `;
}

/* ================= ACHIEVEMENTS ================= */
const ACHIEVEMENTS=[
  {id:'first-habit',icon:'🌱',name:'First habit',desc:'Create your first habit',check:d=>d.habits.length>0},
  {id:'streak-7',icon:'🔥',name:'7-day streak',desc:'Keep any habit going 7 days straight',check:d=>d.habits.some(h=>calcStreak(h.log)>=7)},
  {id:'streak-30',icon:'🏆',name:'30-day streak',desc:'Keep any habit going 30 days straight',check:d=>d.habits.some(h=>calcStreak(h.log)>=30)},
  {id:'task-50',icon:'✅',name:'Task master',desc:'Complete 50 tasks',check:d=>d.tasks.filter(t=>t.done).length>=50},
  {id:'journal-7',icon:'📓',name:'Journal keeper',desc:'Write 7 journal entries',check:d=>d.journal.length>=7},
  {id:'journal-30',icon:'📚',name:'Chronicler',desc:'Write 30 journal entries',check:d=>d.journal.length>=30},
  {id:'money-10',icon:'💰',name:'Money mindful',desc:'Log 10 transactions',check:d=>d.finance.length>=10},
  {id:'challenge-1',icon:'🥇',name:'Challenge finisher',desc:'Complete a full challenge',check:d=>d.challenges.some(c=>challengeStatus(c).status==='completed')},
  {id:'tomorrow-7',icon:'🌙',name:'Consistent planner',desc:'Set tomorrow\'s plan 7 times',check:d=>d.tomorrow.length>=7},
  {id:'mood-14',icon:'📈',name:'Mood tracker',desc:'Log your mood 14 days total',check:d=>Object.keys(d.moods).length>=14},
  {id:'goal-1',icon:'🎯',name:'Goal getter',desc:'Complete a goal',check:d=>d.goals.some(g=>g.progress>=100)},
];
function computeAchievements(){ return ACHIEVEMENTS.map(a=>({...a,unlocked:a.check(DATA)})); }
function renderAchievements(){
  const list=computeAchievements();
  const unlockedCount=list.filter(a=>a.unlocked).length;
  return `
    <div class="section-title">Achievements <span class="tag" style="background:var(--achievements-bg);color:var(--achievements)">${unlockedCount}/${list.length}</span></div>
    <div class="badge-grid">
      ${list.map(a=>`
        <div class="badge ${a.unlocked?'':'locked'}">
          <div class="icon">${a.icon}</div>
          <div class="name">${a.name}</div>
          <div class="desc">${a.desc}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ================= AI REVIEW ================= */
function buildReviewPrompt(){
  const t=todayStr();
  const habitLines=DATA.habits.map(h=>`- ${h.name}: ${calcStreak(h.log)} day streak, done ${h.log.length} times total`).join('\n')||'None tracked';
  const openTasks=DATA.tasks.filter(x=>!x.done).length, doneTasks=DATA.tasks.filter(x=>x.done).length;
  const last7Moods=Object.entries(DATA.moods).filter(([d])=>d>=addDays(t,-6)).map(([d,m])=>m.score);
  const avgMood=last7Moods.length? (last7Moods.reduce((a,b)=>a+b,0)/last7Moods.length).toFixed(1):'no data';
  const balance=DATA.finance.reduce((s,x)=>s+(x.type==='income'?x.amount:-x.amount),0);
  const activeCh=DATA.challenges.map(c=>{const s=challengeStatus(c);return `- ${c.name}: day ${Math.min(s.dayIndex,c.duration)}/${c.duration}, status ${s.status}`;}).join('\n')||'None';
  const journalRecent=DATA.journal.filter(j=>j.date>=addDays(t,-6)).length;
  return `You are a supportive but honest personal coach. Based on this person's last week of self-tracked data, tell them what they're doing well, what they're neglecting, and 2-3 concrete things to improve next week. Be specific and reference the numbers. Keep it under 250 words.

Habits:
${habitLines}

Tasks: ${doneTasks} completed, ${openTasks} still open
Average mood (last 7 days, scale 1-5): ${avgMood}
Money balance: $${balance.toFixed(2)}
Journal entries in the last 7 days: ${journalRecent}
Challenges:
${activeCh}`;
}
function renderReview(){
  const savedKey=localStorage.getItem(STORAGE_PREFIX+'apikey')||'';
  const history=[...DATA.reviews].sort((a,b)=>b.ts-a.ts);
  return `
    <div class="section-title">AI review</div>
    <p class="note">This calls the Anthropic API directly from your browser using your own API key. The key is stored only in this browser's local storage and is sent with each request — don't share this file once you've filled it in, and use a key you're comfortable having client-side.</p>
    <div class="card">
      <div class="row">
        <div class="field"><label>Anthropic API key</label><input type="password" id="api-key" placeholder="sk-ant-…" value="${escapeHtml(savedKey)}"></div>
        <div class="field" style="flex:0 0 180px;"><label>Model</label>
          <select id="api-model">
            <option value="claude-sonnet-5">Claude Sonnet 5</option>
            <option value="claude-opus-4-8">Claude Opus 4.8</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
          </select>
        </div>
      </div>
      <button class="btn" id="gen-review">Generate review</button>
      <div id="review-status" class="note"></div>
    </div>
    <div class="section-title" style="font-size:1rem;">Past reviews</div>
    <div class="card">
      ${history.length===0?'<div class="empty">No reviews generated yet.</div>':
        history.map(r=>`
        <div class="review-item">
          <span class="vts">${fmtDateTime(r.ts)} · ${escapeHtml(r.model)}</span>
          <div class="vtext">${escapeHtml(r.text)}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ================= EVENTS ================= */
function bindEvents(tab){
  if(tab==='today'){
    $$('#quick-mood .mood-opt').forEach(el=>el.addEventListener('click',()=>{
      DATA.moods[todayStr()]={score:Number(el.dataset.score),note:(DATA.moods[todayStr()]&&DATA.moods[todayStr()].note)||''};
      save('moods');render('today');
    }));
  }
  if(tab==='habits'){
    $('#add-habit').addEventListener('click',()=>{
      const name=$('#habit-name').value.trim(); if(!name)return;
      DATA.habits.push({id:uid(),name,log:[]}); save('habits');render('habits');
    });
    $$('.day-box').forEach(el=>el.addEventListener('click',()=>{
      const h=DATA.habits.find(x=>x.id===el.dataset.habit); const day=el.dataset.day;
      if(h.log.includes(day)) h.log=h.log.filter(d=>d!==day); else h.log.push(day);
      save('habits');render('habits');
    }));
    $$('[data-del-habit]').forEach(el=>el.addEventListener('click',()=>{
      DATA.habits=DATA.habits.filter(h=>h.id!==el.dataset.delHabit); save('habits');render('habits');
    }));
  }
  if(tab==='tasks'){
    $('#add-task').addEventListener('click',()=>{
      const name=$('#task-name').value.trim(); if(!name)return;
      DATA.tasks.push({id:uid(),name,due:$('#task-due').value,priority:$('#task-priority').value,done:false,completedAt:null});
      save('tasks');render('tasks');
    });
    $$('[data-toggle-task]').forEach(el=>el.addEventListener('change',()=>{
      const t=DATA.tasks.find(x=>x.id===el.dataset.toggleTask);
      t.done=!t.done; t.completedAt=t.done?todayStr():null;
      save('tasks');render('tasks');
    }));
    $$('[data-del-task]').forEach(el=>el.addEventListener('click',()=>{
      DATA.tasks=DATA.tasks.filter(t=>t.id!==el.dataset.delTask); save('tasks');render('tasks');
    }));
  }
  if(tab==='mood'){
    let picked=(DATA.moods[todayStr()]||{}).score;
    $$('#mood-scale .mood-opt').forEach(el=>el.addEventListener('click',()=>{
      picked=Number(el.dataset.score);
      $$('#mood-scale .mood-opt').forEach(o=>o.classList.remove('selected'));
      el.classList.add('selected');
    }));
    $('#save-mood').addEventListener('click',()=>{
      if(!picked){alert('Pick a mood first.');return;}
      DATA.moods[todayStr()]={score:picked,note:$('#mood-note').value.trim()};
      save('moods');render('mood');
    });
  }
  if(tab==='finance'){
    let type='expense';
    $('#opt-expense').addEventListener('click',()=>{type='expense';$('#opt-expense').classList.add('selected','expense');$('#opt-expense').classList.remove('income');$('#opt-income').classList.remove('selected','income');});
    $('#opt-income').addEventListener('click',()=>{type='income';$('#opt-income').classList.add('selected','income');$('#opt-expense').classList.remove('selected','expense');});
    $('#add-tx').addEventListener('click',()=>{
      const amount=parseFloat($('#tx-amount').value);
      if(!amount||amount<=0){alert('Enter an amount.');return;}
      DATA.finance.push({id:uid(),type,amount,desc:$('#tx-desc').value.trim(),category:$('#tx-cat').value.trim(),date:todayStr()});
      save('finance');render('finance');
    });
    $$('[data-del-tx]').forEach(el=>el.addEventListener('click',()=>{
      DATA.finance=DATA.finance.filter(x=>x.id!==el.dataset.delTx); save('finance');render('finance');
    }));
  }
  if(tab==='health'){
    $('#add-health').addEventListener('click',()=>{
      const value=parseFloat($('#health-value').value);
      if(!value&&value!==0){alert('Enter a value.');return;}
      DATA.health.push({id:uid(),type:$('#health-type').value,value,note:$('#health-note').value.trim(),date:todayStr()});
      save('health');render('health');
    });
    $$('[data-del-health]').forEach(el=>el.addEventListener('click',()=>{
      DATA.health=DATA.health.filter(x=>x.id!==el.dataset.delHealth); save('health');render('health');
    }));
  }
  if(tab==='goals'){
    $('#add-goal').addEventListener('click',()=>{
      const name=$('#goal-name').value.trim(); if(!name)return;
      DATA.goals.push({id:uid(),name,date:$('#goal-date').value,progress:0});
      save('goals');render('goals');
    });
    $$('[data-goal-progress]').forEach(el=>{
      el.addEventListener('input',()=>{
        el.nextElementSibling.textContent=el.value+'%';
        el.closest('.card').querySelector('.goal-fill').style.width=el.value+'%';
      });
      el.addEventListener('change',()=>{
        const g=DATA.goals.find(x=>x.id===el.dataset.goalProgress);
        g.progress=Number(el.value); save('goals');render('goals');
      });
    });
    $$('[data-del-goal]').forEach(el=>el.addEventListener('click',()=>{
      DATA.goals=DATA.goals.filter(g=>g.id!==el.dataset.delGoal); save('goals');render('goals');
    }));
  }
  if(tab==='journal'){
    $('#journal-date').addEventListener('change',()=>{ window._journalDate=$('#journal-date').value; render('journal'); });
    $('#save-journal').addEventListener('click',()=>{
      const text=$('#journal-text').value.trim(); if(!text)return;
      const date=$('#journal-date').value||todayStr();
      DATA.journal.push({id:uid(),date,ts:Date.now(),text});
      save('journal'); window._journalDate=date; render('journal');
    });
  }
  if(tab==='tomorrow'){
    $('#tomorrow-date').addEventListener('change',()=>{ window._tomorrowDate=$('#tomorrow-date').value; render('tomorrow'); });
    $('#save-tomorrow').addEventListener('click',()=>{
      const text=$('#tomorrow-text').value.trim(); if(!text)return;
      const date=$('#tomorrow-date').value||addDays(todayStr(),1);
      DATA.tomorrow.push({id:uid(),date,ts:Date.now(),text});
      save('tomorrow'); window._tomorrowDate=date; render('tomorrow');
    });
  }
  if(tab==='challenges'){
    $('#add-challenge').addEventListener('click',()=>{
      const name=$('#ch-name').value.trim();
      const days=parseInt($('#ch-days').value,10);
      const rules=$('#ch-rules').value.split('\n').map(s=>s.trim()).filter(Boolean);
      if(!name||!days||!rules.length){alert('Fill in a name, number of days, and at least one rule.');return;}
      DATA.challenges.push({id:uid(),name,startDate:todayStr(),duration:days,rules,log:{}});
      save('challenges');render('challenges');
    });
    $$('[data-del-challenge]').forEach(el=>el.addEventListener('click',()=>{
      DATA.challenges=DATA.challenges.filter(c=>c.id!==el.dataset.delChallenge); save('challenges');render('challenges');
    }));
    $$('[data-challenge][data-rule]').forEach(el=>el.addEventListener('change',()=>{
      const c=DATA.challenges.find(x=>x.id===el.dataset.challenge);
      const t=todayStr();
      if(!c.log[t]) c.log[t]={};
      c.log[t][el.dataset.rule]=el.checked;
      save('challenges');render('challenges');
    }));
  }
  if(tab==='phone'){
    $('#save-usual').addEventListener('click',()=>{
      DATA.phone.usualMinutes=parseInt($('#phone-usual').value,10)||120;
      save('phone');render('phone');
    });
    $('#add-phone').addEventListener('click',()=>{
      const app=$('#phone-app').value.trim();
      const minutes=parseInt($('#phone-minutes').value,10);
      if(!app||!minutes){alert('Enter an app and minutes.');return;}
      DATA.phone.logs.push({id:uid(),app,minutes,date:$('#phone-date').value||todayStr()});
      save('phone');render('phone');
    });
    $$('[data-del-phone]').forEach(el=>el.addEventListener('click',()=>{
      DATA.phone.logs=DATA.phone.logs.filter(l=>l.id!==el.dataset.delPhone); save('phone');render('phone');
    }));
  }
  if(tab==='review'){
    $('#gen-review').addEventListener('click',async()=>{
      const key=$('#api-key').value.trim();
      const model=$('#api-model').value;
      const statusEl=$('#review-status');
      if(!key){statusEl.textContent='Enter your Anthropic API key first.';return;}
      localStorage.setItem(STORAGE_PREFIX+'apikey',key);
      statusEl.textContent='Generating…';
      try{
        const res=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{
            'content-type':'application/json',
            'x-api-key':key,
            'anthropic-version':'2023-06-01',
            'anthropic-dangerous-direct-browser-access':'true'
          },
          body:JSON.stringify({model,max_tokens:500,messages:[{role:'user',content:buildReviewPrompt()}]})
        });
        const data=await res.json();
        if(!res.ok){ statusEl.textContent='Error: '+(data.error?data.error.message:res.status); return; }
        const text=(data.content||[]).map(c=>c.text||'').join('\n').trim();
        DATA.reviews.push({id:uid(),ts:Date.now(),text,model});
        save('reviews'); render('review');
      }catch(e){ statusEl.textContent='Request failed: '+e.message; }
    });
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  $('#tabs').addEventListener('click',e=>{ const t=e.target.closest('.tab'); if(t) setTab(t.dataset.tab); });
  initHeader();
  loadAll();
  render('today');

  // Register Service Worker for PWA App Installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('App Service Worker Registered Successfully'))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}
});
