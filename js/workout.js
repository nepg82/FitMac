// workout.js
async function renderWorkout(content) {
  const sessions = await DB.getWorkoutSessions();
  const groups = groupByDate(sessions);

  content.innerHTML = `
    <button class="btn btn-primary btn-block" id="new-session-btn" style="margin-bottom:16px;">+ New Workout Session</button>
    <div id="workout-list"></div>
  `;

  const list = document.getElementById('workout-list');
  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state">No workouts logged yet.</div>`;
  } else {
    for (const [date, items] of groups) {
      list.appendChild(el(`<div class="date-heading">${formatDate(date)}</div>`));
      items.forEach(s => {
        const card = el(`
          <div class="card" style="cursor:pointer;" data-id="${s.id}">
            <div class="stat-row">
              <div class="list-item-title">${escapeHtml(s.name)}</div>
              <div class="list-item-meta">${s.exercises.length} exercise${s.exercises.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="list-item-sub" style="margin-top:6px;">${s.exercises.map(ex => escapeHtml(ex.exercise)).join(', ')}</div>
          </div>
        `);
        card.onclick = () => openSessionDetail(s);
        list.appendChild(card);
      });
    }
  }

  document.getElementById('new-session-btn').onclick = () => openSessionForm();
}

function openSessionDetail(session) {
  const bodyHtml = `
    <div class="stat-label mono" style="margin-bottom:12px;">${formatDate(session.date)}</div>
    ${session.exercises.map(ex => `
      <div class="exercise-log-item">
        <div class="ex-name">${escapeHtml(ex.exercise)}</div>
        <div class="ex-meta">${[
          ex.sets ? `${ex.sets} sets` : null,
          ex.reps ? `${ex.reps} reps` : null,
          ex.weight ? `${ex.weight} lbs` : null
        ].filter(Boolean).join(' · ') || 'No sets/reps/weight recorded'}</div>
        ${ex.notes ? `<div class="list-item-sub" style="margin-top:4px;">${escapeHtml(ex.notes)}</div>` : ''}
      </div>
    `).join('')}
    <div class="btn-row" style="margin-top:14px;margin-bottom:10px;">
      <button class="btn btn-primary btn-block" id="duplicate-session-btn">Duplicate to Today</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost btn-block" id="edit-session-btn">Edit</button>
      <button class="btn btn-danger btn-block" id="delete-session-btn">Delete</button>
    </div>
  `;
  openSheet(escapeHtml(session.name), bodyHtml, (body) => {
    body.querySelector('#duplicate-session-btn').onclick = async () => {
      await DB.saveWorkoutSession({
        name: session.name,
        date: DB.todayISO(),
        exercises: session.exercises.map(ex => ({ ...ex }))
      });
      closeSheet();
      showToast('Workout added to today');
      renderApp();
    };
    body.querySelector('#edit-session-btn').onclick = () => {
      closeSheet();
      openSessionForm(session);
    };
    body.querySelector('#delete-session-btn').onclick = async () => {
      if (!confirm(`Delete "${session.name}"? This can't be undone.`)) return;
      await DB.delete('workoutSessions', session.id);
      closeSheet();
      showToast('Session deleted');
      renderApp();
    };
  });
}

async function openSessionForm(existingSession) {
  const exerciseNames = await DB.getUniqueExerciseNames();
  const isEdit = !!existingSession;
  const sessionExercises = isEdit ? existingSession.exercises.map(ex => ({ ...ex })) : [];

  const bodyHtml = `
    <div class="field">
      <label>Workout Name</label>
      <input type="text" id="session-name" placeholder="e.g. Push Day" value="${isEdit ? escapeHtml(existingSession.name) : ''}" />
    </div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="session-date" value="${isEdit ? existingSession.date : DB.todayISO()}" />
    </div>

    <div class="card-title" style="margin-top:8px;">Add Exercise</div>
    <div class="autocomplete-wrap field">
      <input type="text" id="ex-name" placeholder="Exercise name" autocomplete="off" />
      <div class="autocomplete-list" id="ex-autocomplete" style="display:none;"></div>
    </div>
    <div class="item-row-grid" style="margin-bottom:10px;">
      <div>
        <div class="mini-label">Sets</div>
        <input type="number" inputmode="numeric" pattern="[0-9]*" id="ex-sets" placeholder="—" />
      </div>
      <div>
        <div class="mini-label">Reps</div>
        <input type="number" inputmode="numeric" pattern="[0-9]*" id="ex-reps" placeholder="—" />
      </div>
      <div>
        <div class="mini-label">Weight (lbs)</div>
        <input type="number" inputmode="numeric" pattern="[0-9]*" id="ex-weight" placeholder="—" />
      </div>
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea id="ex-notes" rows="2" placeholder="Optional"></textarea>
    </div>
    <button class="btn btn-ghost btn-block" id="add-ex-btn" style="margin-bottom:18px;">+ Add to Session</button>

    <div class="card-title">This Session</div>
    <div id="session-ex-list" class="card" style="min-height:20px;"></div>

    <button class="btn btn-primary btn-block" id="save-session-btn" style="margin-top:14px;">${isEdit ? 'Save Changes' : 'Save Session'}</button>
  `;

  openSheet(isEdit ? 'Edit Workout Session' : 'New Workout Session', bodyHtml, (body) => {
    const exNameInput = body.querySelector('#ex-name');
    const acList = body.querySelector('#ex-autocomplete');
    const sessionListEl = body.querySelector('#session-ex-list');

    exNameInput.addEventListener('input', () => {
      const q = exNameInput.value.trim().toLowerCase();
      const matches = q ? exerciseNames.filter(n => n.toLowerCase().includes(q)) : exerciseNames.slice(0, 6);
      if (matches.length === 0) { acList.style.display = 'none'; return; }
      acList.innerHTML = '';
      matches.slice(0, 6).forEach(n => {
        const item = el(`<div class="autocomplete-item"><span>${escapeHtml(n)}</span></div>`);
        item.onclick = () => { exNameInput.value = n; acList.style.display = 'none'; };
        acList.appendChild(item);
      });
      acList.style.display = 'block';
    });
    exNameInput.addEventListener('focus', () => { if (exerciseNames.length) exNameInput.dispatchEvent(new Event('input')); });
    exNameInput.addEventListener('blur', () => setTimeout(() => acList.style.display = 'none', 150));

    function renderSessionList() {
      if (sessionExercises.length === 0) {
        sessionListEl.innerHTML = `<div class="empty-state" style="padding:16px;">No exercises added yet</div>`;
        return;
      }
      sessionListEl.innerHTML = '';
      sessionExercises.forEach((ex, i) => {
        const row = el(`
          <div class="exercise-log-item" style="position:relative;">
            <button type="button" class="remove-btn" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-faint);font-size:18px;">&times;</button>
            <div class="ex-name">${escapeHtml(ex.exercise)}</div>
            <div class="ex-meta">${[
              ex.sets ? `${ex.sets} sets` : null,
              ex.reps ? `${ex.reps} reps` : null,
              ex.weight ? `${ex.weight} lbs` : null
            ].filter(Boolean).join(' · ') || 'No sets/reps/weight'}</div>
          </div>
        `);
        row.querySelector('.remove-btn').onclick = () => { sessionExercises.splice(i, 1); renderSessionList(); };
        sessionListEl.appendChild(row);
      });
    }
    renderSessionList();

    body.querySelector('#add-ex-btn').onclick = () => {
      const exercise = body.querySelector('#ex-name').value.trim();
      if (!exercise) { showToast('Exercise name is required'); return; }
      sessionExercises.push({
        exercise,
        sets: body.querySelector('#ex-sets').value || '',
        reps: body.querySelector('#ex-reps').value || '',
        weight: body.querySelector('#ex-weight').value || '',
        notes: body.querySelector('#ex-notes').value.trim()
      });
      body.querySelector('#ex-name').value = '';
      body.querySelector('#ex-sets').value = '';
      body.querySelector('#ex-reps').value = '';
      body.querySelector('#ex-weight').value = '';
      body.querySelector('#ex-notes').value = '';
      renderSessionList();
      if (!exerciseNames.includes(exercise)) exerciseNames.push(exercise);
    };

    body.querySelector('#save-session-btn').onclick = async () => {
      const name = body.querySelector('#session-name').value.trim();
      const date = body.querySelector('#session-date').value || DB.todayISO();
      if (!name) { showToast('Workout name is required'); return; }
      if (sessionExercises.length === 0) { showToast('Add at least one exercise'); return; }
      await DB.saveWorkoutSession({ id: isEdit ? existingSession.id : undefined, name, date, exercises: sessionExercises });
      closeSheet();
      showToast(isEdit ? 'Session updated' : 'Session saved');
      renderApp();
    };
  });
}