export function getNotes(uid) {
  try {
    const data = localStorage.getItem(`notes_${uid}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function saveNotes(uid, notes) {
  localStorage.setItem(`notes_${uid}`, JSON.stringify(notes));
}

export function addNote(uid, note) {
  const notes = getNotes(uid);
  notes.push(note);
  saveNotes(uid, notes);
}

export function updateNote(uid, index, text) {
  const notes = getNotes(uid);
  if (notes[index]) {
    notes[index].text = text;
    saveNotes(uid, notes);
  }
}

export function removeNote(uid, index) {
  const notes = getNotes(uid);
  notes.splice(index, 1);
  saveNotes(uid, notes);
}
