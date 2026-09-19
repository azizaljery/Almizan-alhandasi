import { generateModel } from './planner.mjs';
// Keep the bounded search off the UI thread, especially on mobile devices.
self.addEventListener('message', event => {
  try { self.postMessage({ model: generateModel(event.data.plot, event.data.rooms) }); }
  catch (error) { self.postMessage({ error: error.message }); }
});
