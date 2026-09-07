// Project snapshots only: selection, playhead and observer navigation are not edits.
export class ProjectHistory {
  constructor(project, limit = 100) {
    this.entries = [JSON.stringify(project)];
    this.index = 0;
    this.limit = limit;
    this.grouping = false;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  begin() { this.grouping = true; }
  commit(project) {
    if (this.grouping) return;
    const snapshot = JSON.stringify(project);
    if (snapshot === this.entries[this.index]) return;
    this.entries.splice(this.index + 1);
    this.entries.push(snapshot);
    if (this.entries.length > this.limit + 1) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  end(project) { this.grouping = false; this.commit(project); }
  undo() { return this.canUndo ? JSON.parse(this.entries[--this.index]) : null; }
  redo() { return this.canRedo ? JSON.parse(this.entries[++this.index]) : null; }
}
