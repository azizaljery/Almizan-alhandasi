import { generateModel, generateAlternatives } from './planner.mjs';
import { decodeProject } from './project.mjs';
// Keep the bounded search off the UI thread, especially on mobile devices.
self.addEventListener('message', event => {
  try { self.postMessage(event.data.projectText !== undefined ? { project: decodeProject(event.data.projectText) } : event.data.alternatives ? generateAlternatives(event.data.plot, event.data.rooms, { includeClaude: true }) : { model: generateModel(event.data.plot, event.data.rooms) }); }
  catch (error) { self.postMessage({ error: error.message }); }
});
